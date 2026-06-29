const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Hospital = require('../models/hospital.model');
const jwt = require('jsonwebtoken');

const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');
const { loginLimiter, signupLimiter } = require('../middleware/rateLimiter');
const validatePassword = require('../utils/validatePassword');
const { verifyToken } = require('../middleware/auth.middleware');
const TokenBlacklist = require('../models/tokenBlacklist.model');
const auditLog = require('../middleware/audit.middleware');
const { v4: uuidv4 } = require('uuid');

/**
 * Helper: Build user response with full role data
 */
async function buildUserResponse(user) {
  let roleData = null;
  let roleName = null;

  const specialRoles = ['superadmin', 'centraladmin', 'hospitaladmin'];

  if (specialRoles.includes(user.role)) {
    roleName = user.role;
    const isCentral = user.role === 'centraladmin' || user.role === 'superadmin';
    roleData = {
      name: user.role,
      permissions: isCentral ? ['*'] : ['admin_manage_roles', 'admin_view_stats'],
      dashboardPath: isCentral ? '/supremeadmin' : '/hospitaladmin',
      navLinks: [],
      isSystemRole: true
    };
  } else if (user.role) {
    if (mongoose.Types.ObjectId.isValid(user.role)) {
      roleData = await Role.findById(user.role);
    }
    if (!roleData) {
      const roleMapping = {
        'lab': 'Lab Technician',
        'pharmacy': 'Pharmacist',
        'reception': 'Receptionist'
      };
      const targetRoleName = roleMapping[String(user.role).toLowerCase()] || user.role;
      const query = { name: { $regex: new RegExp(`^${targetRoleName}$`, 'i') } };
      if (user.hospitalId) query.hospitalId = user.hospitalId;
      roleData = await Role.findOne(query);
      if (!roleData && user.hospitalId) {
        roleData = await Role.findOne({ name: { $regex: new RegExp(`^${targetRoleName}$`, 'i') }, hospitalId: null });
      }
      if (roleData) {
        user.role = roleData._id;
        await user.save();
      }
    }
    roleName = roleData ? roleData.name : String(user.role);
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: roleName, // String name for display
    roleId: user.role, // ObjectId or special string
    patientId: user.patientId || null,
    hospitalId: user.hospitalId || null,
    permissions: roleData ? roleData.permissions : [],
    dashboardPath: roleData ? roleData.dashboardPath : '/',
    navLinks: roleData ? roleData.navLinks : [],
    isActive: user.isActive !== false
  };
}

// Signup Route
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ success: false, message: pwErr });

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Find the default "Patient" or "User" role from the DB
    let defaultRole = await Role.findOne({ name: { $in: ['Patient', 'patient', 'User', 'user'] } });
    if (!defaultRole) {
      // Fallback: create a minimal patient role if none exists
      defaultRole = await Role.create({
        name: 'Patient',
        description: 'Default patient role',
        permissions: ['patient_view'],
        dashboardPath: '/dashboard',
        navLinks: [
          { label: 'Services', path: '/services' },
          { label: 'Doctors', path: '/doctors' },
          { label: 'Appointment', path: '/appointment' },
          { label: 'Lab Reports', path: '/lab-reports' },
          { label: 'Dashboard', path: '/dashboard' }
        ],
        isSystemRole: false
      });
    }

    // Generate Persistent Patient ID (P-101, P-102...)
    let patientId = 'P-101';
    try {
      const lastUser = await User.findOne({
        patientId: { $exists: true, $ne: null }
      }).sort({ createdAt: -1 });

      if (lastUser && lastUser.patientId) {
        const parts = lastUser.patientId.split('-');
        if (parts.length === 2 && !isNaN(parts[1])) {
          const nextNum = parseInt(parts[1]) + 1;
          patientId = `P-${nextNum}`;
        }
      }
    } catch (pidError) {
      console.warn('Error generating patientId, using fallback', pidError);
    }

    // Create new user with dynamic role reference
    const user = new User({
      name,
      email,
      password,
      phone: phone || '',
      role: defaultRole._id, // ObjectId reference to Role
      patientId: patientId
    });

    await user.save();

    // Generate JWT token — include hospitalId for tenant DB routing
    let tenantKey = null;
    let subdomain = null;
    if (user.hospitalId) {
      const Hospital = require('../models/hospital.model');
      const hosp = await Hospital.findById(user.hospitalId).select('tenantKey slug');
      if (hosp) {
        tenantKey = hosp.tenantKey;
        subdomain = hosp.slug;
      }
    }

    const token = jwt.sign(
      {
        jti: uuidv4(),
        userId: user._id,
        email: user.email,
        roleId: String(defaultRole._id),
        hospitalId: user.hospitalId ? String(user.hospitalId) : null,
        tenantKey,
        subdomain,
        tv: user.tokenVersion ?? 0,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const userData = await buildUserResponse(user);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userData,
      token
    });
  } catch (error) {
    console.error('Signup error:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      if (error.keyPattern && error.keyPattern.email) {
        return res.status(400).json({ success: false, message: 'User with this email already exists' });
      }
      if (error.keyPattern && error.keyPattern.username) {
        await User.collection.dropIndex('username_1').catch(() => { });
        return res.status(500).json({ success: false, message: 'System update in progress. Please try again.' });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error creating user',
    });
  }
});

// Login Route
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, hospitalId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Email and password must be valid strings' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user && user.lockUntil && user.lockUntil > Date.now()) {
      const remainingTime = Math.ceil((user.lockUntil.getTime() - Date.now()) / (60 * 1000));
      return res.status(423).json({
        success: false,
        message: `Too many failed login attempts. Your account is temporarily locked. Try again in ${remainingTime} minute(s).`
      });
    }

    if (!user) {
      try {
        const AuditLogModel = require('../models/auditLog.model');
        await AuditLogModel.create({
            clinicId: hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
            userName: normalizedEmail,
            action: 'FAILED_LOGIN',
            severity: 'warning',
            success: false,
            reason: 'User not found',
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });
      } catch (logErr) {}
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.isActive === false) {
      try {
        const AuditLogModel = require('../models/auditLog.model');
        await AuditLogModel.create({
            clinicId: user.hospitalId || hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
            userId: user._id,
            userName: user.name || normalizedEmail,
            action: 'FAILED_LOGIN',
            severity: 'warning',
            success: false,
            reason: 'Account is disabled',
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });
      } catch (logErr) {}
      return res.status(403).json({ success: false, message: 'Account is disabled. Contact administrator.' });
    }

    // Central admins must use their dedicated login pages — use generic message to avoid enumeration
    if (user.role === 'superadmin' || user.role === 'centraladmin') {
      try {
        const AuditLogModel = require('../models/auditLog.model');
        await AuditLogModel.create({
            clinicId: user.hospitalId || hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
            userId: user._id,
            userName: user.name || normalizedEmail,
            role: String(user.role),
            action: 'FAILED_LOGIN',
            severity: 'warning',
            success: false,
            reason: 'Bypassed Central Admin login portal',
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });
      } catch (logErr) {}
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }


    // Dynamic validation: user must have a valid role assigned
    if (!user.role && !user.patientId) {
      return res.status(403).json({ success: false, message: 'No role assigned. Contact admin.' });
    }

    // Verify the role exists in the DB (handle both ObjectId and legacy string)
    let roleData = null;
    if (user.role === 'hospitaladmin') {
      roleData = {
          name: 'hospitaladmin',
          permissions: ['admin_manage_roles', 'admin_view_stats'],
          dashboardPath: '/hospitaladmin',
          navLinks: [],
          isSystemRole: true
      };
    } else if (user.role) {
      if (mongoose.Types.ObjectId.isValid(user.role)) {
        roleData = await Role.findById(user.role);
      }
      // Fallback: legacy string like 'admin', 'doctor' — look up by name
      if (!roleData) {
        roleData = await Role.findOne({
          name: { $regex: new RegExp(`^${user.role}$`, 'i') }
        });
        // Auto-migrate to ObjectId
        if (roleData) {
          user.role = roleData._id;
          await user.save();
        }
      }
    }

    // If role is missing/invalid but it's a patient, self-heal by finding/creating the Patient role
    if (!roleData && user.patientId) {
      let defaultRole = await Role.findOne({ name: { $in: ['Patient', 'patient'] } });
      if (!defaultRole) {
        defaultRole = await Role.create({
          name: 'Patient',
          description: 'Default patient role',
          permissions: ['patient_view'],
          dashboardPath: '/dashboard',
          navLinks: [
            { label: 'Services', path: '/services' },
            { label: 'Doctors', path: '/doctors' },
            { label: 'Appointment', path: '/appointment' },
            { label: 'Lab Reports', path: '/lab-reports' },
            { label: 'Dashboard', path: '/dashboard' }
          ],
          isSystemRole: true
        });
      }
      user.role = defaultRole._id;
      await user.save();
      roleData = defaultRole;
    }

    if (!roleData) {
      return res.status(403).json({ success: false, message: 'Your assigned role no longer exists. Contact admin.' });
    }

    if (roleData.name && ['superadmin', 'centraladmin'].includes(roleData.name.toLowerCase())) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      let locked = false;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
        locked = true;
      }
      await user.save();

      try {
        const AuditLogModel = require('../models/auditLog.model');
        await AuditLogModel.create({
            clinicId: user.hospitalId || hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
            userId: user._id,
            userName: user.name,
            role: roleData?.name || '',
            action: 'FAILED_LOGIN',
            severity: 'warning',
            success: false,
            reason: locked ? 'Incorrect password (account locked)' : 'Incorrect password',
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });
      } catch (logErr) {}
      
      const errMsg = locked 
        ? 'Too many failed login attempts. Your account has been temporarily locked. Try again in 15 minutes.'
        : 'Invalid email or password';
      return res.status(401).json({ success: false, message: errMsg });
    }

    if (user.loginAttempts > 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();
    }

    // STRICT HOSPITAL ROW-LEVEL SECURITY CHECK
    const globalAdminRoles = ['superadmin', 'centraladmin'];
    const userRoleStr = roleData.name ? roleData.name.toLowerCase() : '';
    const isGlobalAdmin = globalAdminRoles.includes(userRoleStr);

    if (!isGlobalAdmin) {
        if (hospitalId) {
            // Staff/HospitalAdmin attempting to log in via a specific slug portal
            if (!user.hospitalId || String(user.hospitalId) !== String(hospitalId)) {
                if (process.env.NODE_ENV === 'production') {
                    return res.status(403).json({ success: false, message: 'Access denied: You are not authorized for this clinic. Check the URL.' });
                } else {
                    console.warn(`[DEV WARNING] Hospital ID mismatch: user.hospitalId=${user.hospitalId}, passed=${hospitalId}. Allowing login in development.`);
                    // Self-heal: align the user's hospitalId in the database if it differs or is missing
                    user.hospitalId = hospitalId;
                    await user.save();
                }
            }
        } else {
            // Admin-level users can always log in via /login (no subdomain required).
            // This covers: 'hospitaladmin' string, 'administrator' ObjectId role, 'admin' legacy string.
            const isAdminLevelRole = userRoleStr === 'hospitaladmin' ||
                userRoleStr.includes('administrator') ||
                userRoleStr === 'admin';

            if (user.hospitalId && !isAdminLevelRole) {
                if (process.env.NODE_ENV === 'production') {
                    return res.status(403).json({ success: false, message: 'Access denied: Please log in using your specific clinic portal URL.' });
                } else {
                    console.warn(`[DEV WARNING] Non-admin staff logging in without subdomain portal. Allowing in development.`);
                }
            }
        }
    } else {
        // Global Admins should not be logging in via a specific hospital portal URL (they don't have one)
        if (hospitalId) {
            return res.status(403).json({ success: false, message: 'Global Admins must use the Central Admin login, not a clinic portal.' });
        }
    }

    // If MFA is enabled, issue a short-lived pre-auth token instead of a full session token.
    // The client must POST this + a TOTP code to /api/mfa/complete-login to get a real token.
    const mfaUser = await require('../models/user.model').findById(user._id).select('mfaEnabled');
    if (mfaUser?.mfaEnabled) {
      const preAuthToken = jwt.sign(
        { mfa_pending: true, userId: String(user._id) },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ success: true, mfaRequired: true, preAuthToken });
    }

    let tenantKey = null;
    let subdomain = null;
    if (user.hospitalId) {
      const Hospital = require('../models/hospital.model');
      const hosp = await Hospital.findById(user.hospitalId).select('tenantKey slug');
      if (hosp) {
        tenantKey = hosp.tenantKey;
        subdomain = hosp.slug;
      }
    }

    const jti = uuidv4();
    const token = jwt.sign(
      {
        jti,
        userId: user._id,
        email: user.email,
        roleId: String(user.role),
        hospitalId: user.hospitalId ? String(user.hospitalId) : null,
        tenantKey,
        subdomain,
        tv: user.tokenVersion ?? 0,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Build user response with role data (roleData is already fetched above)
    let clinicType = null;
    if (user.hospitalId) {
      try {
        const hosp = await Hospital.findById(user.hospitalId).select('clinicType');
        clinicType = hosp?.clinicType || 'hospital';
      } catch (_) {}
    }

    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: roleData.name,
      roleId: String(user.role),
      patientId: user.patientId || null,
      hospitalId: user.hospitalId ? String(user.hospitalId) : null,
      clinicType,
      permissions: roleData.permissions || [],
      customPermissions: user.customPermissions || [],
      deniedPermissions: user.deniedPermissions || [],
      // effectivePermissions = (role permissions + custom permissions) - denied permissions (de-duped)
      effectivePermissions: Array.from(new Set([...(roleData.permissions || []), ...(user.customPermissions || [])].filter(p => !(user.deniedPermissions || []).includes(p)))),
      dashboardPath: roleData.dashboardPath || '/',
      navLinks: roleData.navLinks || [],
      avatar: user.avatar || null
    };

    // Log successful login
    try {
      const AuditLogModel = require('../models/auditLog.model');
      await AuditLogModel.create({
          clinicId: user.hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
          userId: user._id,
          userName: user.name,
          role: roleData.name,
          action: 'STAFF_LOGIN',
          success: true,
          sessionId: jti,
          ip: req.ip || '',
          userAgent: req.headers['user-agent'] || ''
      });
    } catch (logErr) {}

    res.json({
      success: true,
      message: 'Login successful',
      user: userData,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Error during login' });
  }
});

// POST /api/auth/revoke-all-sessions — bump tokenVersion to invalidate every outstanding token for this user
router.post('/revoke-all-sessions', verifyToken, async (req, res) => {
    try {
        await require('../models/user.model').findByIdAndUpdate(
            req.user._id,
            { $inc: { tokenVersion: 1 } }
        );
        res.json({ success: true, message: 'All sessions revoked. Please log in again on all devices.' });
    } catch {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// POST /api/auth/logout — blacklist the current token so it can never be reused
router.post('/logout', verifyToken, auditLog('STAFF_LOGOUT', null, { severity: 'info', dataCategory: 'System' }), async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader.split(' ')[1];
        const decoded = require('jsonwebtoken').decode(token);

        if (decoded?.jti && decoded?.exp) {
            await TokenBlacklist.create({
                jti: decoded.jti,
                expireAt: new Date(decoded.exp * 1000),
            });
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// GET /api/auth/me — get current staff/admin profile and updated permissions
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    // Fetch full role data for this user
    let roleData = null;
    const specialRoles = ['superadmin', 'centraladmin', 'hospitaladmin'];
    
    if (specialRoles.includes(user.role)) {
      const isCentral = user.role === 'centraladmin' || user.role === 'superadmin';
      roleData = {
        name: user.role,
        permissions: isCentral ? ['*'] : ['admin_manage_roles', 'admin_view_stats'],
        dashboardPath: isCentral ? '/supremeadmin' : '/hospitaladmin',
        navLinks: [],
        isSystemRole: true
      };
    } else if (user.role) {
      if (mongoose.Types.ObjectId.isValid(user.role)) {
        roleData = await Role.findById(user.role);
      }
    }
    
    let clinicType = null;
    let tenantKey = null;
    let subdomain = null;
    if (user.hospitalId) {
      try {
        const hosp = await Hospital.findById(user.hospitalId).select('clinicType tenantKey slug');
        clinicType = hosp?.clinicType || 'hospital';
        tenantKey = hosp?.tenantKey || null;
        subdomain = hosp?.slug || null;
      } catch (_) {}
    }
    
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: roleData ? roleData.name : user.role,
      roleId: String(user.role),
      patientId: user.patientId || null,
      hospitalId: user.hospitalId ? String(user.hospitalId) : null,
      tenantKey,
      subdomain,
      clinicType,
      permissions: roleData ? roleData.permissions : [],
      customPermissions: user.customPermissions || [],
      deniedPermissions: user.deniedPermissions || [],
      // effectivePermissions = (role permissions + custom permissions) - denied permissions (de-duped)
      effectivePermissions: Array.from(new Set([...(roleData?.permissions || []), ...(user.customPermissions || [])].filter(p => !(user.deniedPermissions || []).includes(p)))),
      dashboardPath: roleData ? roleData.dashboardPath : '/',
      navLinks: roleData ? roleData.navLinks : [],
      avatar: user.avatar || null
    };
    
    res.json({
      success: true,
      user: userData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching profile: ' + error.message });
  }
});

// PUT /api/auth/profile — update the currently-logged-in user's profile in the DB
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, email, phone, avatar } = req.body;
    const updateFields = {};
    if (name  !== undefined) updateFields.name  = name.trim();
    if (email !== undefined) updateFields.email = email.trim().toLowerCase();
    if (phone !== undefined) updateFields.phone = phone.trim();
    if (avatar !== undefined) updateFields.avatar = avatar;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Return the minimal updated profile so the client can merge it into Redux / localStorage
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        avatar: user.avatar || '',
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: 'Error updating profile: ' + error.message });
  }
});

// PUT /api/auth/change-password — change password for the currently-logged-in user
router.put('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both currentPassword and newPassword are required' });
    }
    const pwErr = validatePassword(newPassword);
    if (pwErr) {
      return res.status(400).json({ success: false, message: pwErr });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const bcrypt = require('bcryptjs');
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Error changing password: ' + error.message });
  }
});

module.exports = router;