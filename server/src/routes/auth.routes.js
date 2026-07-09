const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Hospital = require('../models/hospital.model');
const jwt = require('jsonwebtoken');

const { JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_MS, MAX_SESSION_MS } = require('../config/jwt');
const { loginLimiter, signupLimiter } = require('../middleware/rateLimiter');
const validatePassword = require('../utils/validatePassword');
const { verifyToken } = require('../middleware/auth.middleware');
const TokenBlacklist = require('../models/tokenBlacklist.model');
const RefreshToken = require('../models/refreshToken.model');
const auditLog = require('../middleware/audit.middleware');
const { v4: uuidv4 } = require('uuid');
const { parseUserAgent } = require('../utils/userAgentParser');

// ── Helpers: set and clear cookies for both tokens ───────────────────────────
function setCookies(res, accessToken, rawRefreshToken) {
    // Detect cross-origin production deployments (frontend on Vercel, backend on Render)
    // sameSite:'none' + secure:true is required to send cookies cross-origin.
    // On localhost the Vite proxy makes it same-origin so lax/strict also work,
    // but 'none' is safe everywhere as long as the connection is HTTPS.
    const isProduction = process.env.NODE_ENV === 'production';

    // Access token cookie
    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: isProduction,          // Must be true when sameSite:'none'
        sameSite: isProduction ? 'none' : 'lax',  // 'none' enables cross-origin
        maxAge: 30 * 60 * 1000, // 30 minutes
        path: '/',
    });

    // Refresh token cookie — 'none' allows the cross-origin refresh endpoint
    // to receive it from Vercel → Render in production.
    res.cookie('refreshToken', rawRefreshToken, {
        httpOnly: true,
        secure: isProduction,          // Must be true when sameSite:'none'
        sameSite: isProduction ? 'none' : 'lax',  // was 'strict' — blocked cross-origin!
        maxAge: REFRESH_TOKEN_EXPIRES_MS,
        path: '/',                    // Use '/' so the cookie reaches the full backend URL
    });
}

function clearCookies(res) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie('accessToken', { httpOnly: true, path: '/', sameSite: isProduction ? 'none' : 'lax', secure: isProduction });
    res.clearCookie('refreshToken', { httpOnly: true, path: '/', sameSite: isProduction ? 'none' : 'lax', secure: isProduction });
}

/**
 * Helper: Build user response with full role data
 */
async function buildUserResponse(user) {
  let roleData = null;
  let roleName = null;

  const specialRoles = ['superadmin', 'centraladmin', 'hospitaladmin', 'clinicadmin'];

  if (specialRoles.includes(user.role)) {
    roleName = user.role;
    const isCentral = user.role === 'centraladmin' || user.role === 'superadmin';
    roleData = {
      name: user.role,
      permissions: isCentral ? ['*'] : (user.role === 'clinicadmin' ? [] : ['admin_manage_roles', 'admin_view_stats']),
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
      let hosp = await Hospital.findById(user.hospitalId).select('tenantKey slug');
      if (!hosp) {
        const Clinic = require('../models/clinic.model');
        hosp = await Clinic.findById(user.hospitalId).select('tenantKey slug');
      }
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
        roleId: String(defaultRole._id),
        hospitalId: user.hospitalId ? String(user.hospitalId) : null,
        tenantKey,
        subdomain,
        tv: user.tokenVersion ?? 0,
        sid: jti,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const rawRefreshToken = uuidv4();
    const sessionId = uuidv4();
    const uaSignup = req.headers['user-agent'] || '';
    const parsedSignup = parseUserAgent(uaSignup);
    await RefreshToken.createForUser({
      userId: user._id,
      hospitalId: user.hospitalId || null,
      rawToken: rawRefreshToken,
      sessionId,
      jti,
      ip: req.ip || '',
      browser: parsedSignup.browser,
      os: parsedSignup.os,
      device: parsedSignup.device,
      userAgent: uaSignup,
    });

    setCookies(res, token, rawRefreshToken);

    const userData = await buildUserResponse(user);
    userData.sessionStart = new Date().toISOString();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userData
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
        const ua = req.headers['user-agent'] || '';
        const parsed = parseUserAgent(ua);
        AuditLogModel.create({
          clinicId: hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
          userName: normalizedEmail,
          action: 'FAILED_LOGIN',
          severity: 'warning',
          success: false,
          reason: 'User not found',
          ip: req.ip || '',
          userAgent: ua,
          browser: parsed.browser,
          os: parsed.os,
          device: parsed.device
        }).catch(() => { });
      } catch (logErr) { }
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.isActive === false) {
      try {
        const AuditLogModel = require('../models/auditLog.model');
        const ua = req.headers['user-agent'] || '';
        const parsed = parseUserAgent(ua);
        AuditLogModel.create({
          clinicId: user.hospitalId || hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
          userId: user._id,
          userName: user.name || normalizedEmail,
          action: 'FAILED_LOGIN',
          severity: 'warning',
          success: false,
          reason: 'Account is disabled',
          ip: req.ip || '',
          userAgent: ua,
          browser: parsed.browser,
          os: parsed.os,
          device: parsed.device
        }).catch(() => { });
      } catch (logErr) { }
      return res.status(403).json({ success: false, message: 'Account is disabled. Contact administrator.' });
    }

    // Deactivated Hospital check / Load Hospital Info
    let hospitalInfo = null;
    if (user.hospitalId) {
      const Hospital = require('../models/hospital.model');
      const Clinic = require('../models/clinic.model');
      hospitalInfo = await Hospital.findById(user.hospitalId).select('isActive tenantKey slug clinicType').lean();
      if (!hospitalInfo) {
        hospitalInfo = await Clinic.findById(user.hospitalId).select('isActive tenantKey slug clinicType').lean();
      }
    }

    if (hospitalInfo && hospitalInfo.isActive === false && user.role !== 'superadmin' && user.role !== 'centraladmin') {
      return res.status(403).json({ success: false, message: 'Your hospital access has been deactivated. Please contact the system administrator.' });
    }


    // Central admins must use their dedicated login pages — use generic message to avoid enumeration
    if (user.role === 'superadmin' || user.role === 'centraladmin') {
      try {
        const AuditLogModel = require('../models/auditLog.model');
        const ua = req.headers['user-agent'] || '';
        const parsed = parseUserAgent(ua);
        AuditLogModel.create({
          clinicId: user.hospitalId || hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
          userId: user._id,
          userName: user.name || normalizedEmail,
          role: String(user.role),
          action: 'FAILED_LOGIN',
          severity: 'warning',
          success: false,
          reason: 'Bypassed Central Admin login portal',
          ip: req.ip || '',
          userAgent: ua,
          browser: parsed.browser,
          os: parsed.os,
          device: parsed.device
        }).catch(() => { });
      } catch (logErr) { }
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }


    // Dynamic validation: user must have a valid role assigned
    if (!user.role && !user.patientId) {
      return res.status(403).json({ success: false, message: 'No role assigned. Contact admin.' });
    }

    // Verify the role exists in the DB (handle both ObjectId and legacy string)
    let roleData = null;
    if (user.role === 'hospitaladmin' || user.role === 'clinicadmin') {
      roleData = {
        name: user.role,
        permissions: user.role === 'clinicadmin' ? [] : ['admin_manage_roles', 'admin_view_stats'],
        dashboardPath: user.role === 'clinicadmin' ? '/clinicadmin' : '/hospitaladmin',
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
        user.lockUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 mins lock
        locked = true;
      }
      await user.save();

      try {
        const AuditLogModel = require('../models/auditLog.model');
        const ua = req.headers['user-agent'] || '';
        const parsed = parseUserAgent(ua);
        AuditLogModel.create({
          clinicId: user.hospitalId || hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
          userId: user._id,
          userName: user.name,
          role: roleData?.name || '',
          action: 'FAILED_LOGIN',
          severity: 'warning',
          success: false,
          reason: locked ? 'Incorrect password (account locked)' : 'Incorrect password',
          ip: req.ip || '',
          userAgent: ua,
          browser: parsed.browser,
          os: parsed.os,
          device: parsed.device
        }).catch(() => { });
        if (locked) {
          AuditLogModel.create({
            clinicId: user.hospitalId || hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
            userId: user._id,
            userName: user.name,
            role: roleData?.name || '',
            action: 'ACCOUNT_LOCKED',
            severity: 'critical',
            success: true,
            reason: 'Account locked due to 5 consecutive failed login attempts',
            ip: req.ip || '',
            userAgent: ua,
            browser: parsed.browser,
            os: parsed.os,
            device: parsed.device
          }).catch(() => { });
        }
      } catch (logErr) { }

      const errMsg = locked
        ? 'Too many failed login attempts. Your account has been temporarily locked. Try again in 5 minutes.'
        : 'Invalid email or password';
      return res.status(401).json({ success: false, message: errMsg });
    }

    if (user.loginAttempts > 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();
    }

    // TENANT ISOLATION — enforced in production via subdomain.
    // A user may ONLY log in on the portal that belongs to their own organization.
    // In development (localhost), staff may log in directly without a subdomain.
    const globalAdminRoles = ['superadmin', 'centraladmin'];
    const userRoleStr = roleData.name ? roleData.name.toLowerCase() : '';
    const isGlobalAdmin = globalAdminRoles.includes(userRoleStr);

    // Detect if request is coming from localhost (dev environment)
    const origin = req.headers.origin || req.headers.referer || '';
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1') ||
      req.hostname === 'localhost' || req.hostname === '127.0.0.1';

    if (!isGlobalAdmin) {
      if (hospitalId) {
        // Subdomain portal login: the hospitalId embedded by the frontend MUST exactly
        // match the hospitalId stored on the user's account.
        if (!user.hospitalId || String(user.hospitalId) !== String(hospitalId)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: You are not authorized for this portal. Please use your organization\'s URL.'
          });
        }
      } else if (!isLocalhost) {
        // Generic /login (no subdomain) in PRODUCTION: only hospitaladmin / clinicadmin are allowed here.
        // All other staff must log in through their organization's subdomain URL.
        const isAdminLevelRole = userRoleStr === 'hospitaladmin' ||
          userRoleStr === 'clinicadmin' ||
          userRoleStr.includes('administrator') ||
          userRoleStr === 'admin';

        if (user.hospitalId && !isAdminLevelRole) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Please log in using your organization\'s specific portal URL.'
          });
        }
      }
      // else: localhost dev mode — allow staff to log in directly without subdomain
    } else {
      // Global Admins must use the Central Admin login — not any subdomain portal.
      if (hospitalId) {
        return res.status(403).json({ success: false, message: 'Global Admins must use the Central Admin login, not a clinic portal.' });
      }
    }

    // If MFA is enabled, issue a short-lived pre-auth token instead of a full session token.
    // The client must POST this + a TOTP code to /api/mfa/complete-login to get a real token.
    if (user.mfaEnabled) {
      const preAuthToken = jwt.sign(
        { mfa_pending: true, userId: String(user._id) },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ success: true, mfaRequired: true, preAuthToken });
    }

    let tenantKey = hospitalInfo?.tenantKey || null;
    let subdomain = hospitalInfo?.slug || null;

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
        sid: jti, // session identifier embedded in access token
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Issue refresh token (raw UUID → hashed in DB, sent as httpOnly cookie)
    const rawRefreshToken = uuidv4();
    const sessionId = uuidv4();
    const ua2 = req.headers['user-agent'] || '';
    const parsed2 = parseUserAgent(ua2);
    await RefreshToken.createForUser({
      userId: user._id,
      hospitalId: user.hospitalId || null,
      rawToken: rawRefreshToken,
      sessionId,
      jti,
      ip: req.ip || '',
      browser: parsed2.browser,
      os: parsed2.os,
      device: parsed2.device,
      userAgent: ua2,
    });
    setCookies(res, token, rawRefreshToken);

    // Build user response with role data (roleData is already fetched above)
    let clinicType = hospitalInfo?.clinicType || 'hospital';

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
      effectivePermissions: Array.from(new Set([...(roleData.permissions || []), ...(user.customPermissions || [])].filter(p => !(user.deniedPermissions || []).includes(p)))),
      dashboardPath: roleData.dashboardPath || '/',
      navLinks: roleData.navLinks || [],
      avatar: user.avatar || null,
      sessionStart: new Date().toISOString(), // For max-session countdown on client
    };

    // Log successful login
    try {
      const AuditLogModel = require('../models/auditLog.model');
      const ua = req.headers['user-agent'] || '';
      const parsed = parseUserAgent(ua);
      AuditLogModel.create({
        clinicId: user.hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
        userId: user._id,
        userName: user.name,
        role: roleData.name,
        action: user.patientId ? 'PATIENT_LOGIN' : 'STAFF_LOGIN',
        success: true,
        sessionId: jti,
        ip: req.ip || '',
        userAgent: ua,
        browser: parsed.browser,
        os: parsed.os,
        device: parsed.device
      }).catch(() => { });
    } catch (logErr) { }

    res.json({
      success: true,
      message: 'Login successful',
      user: userData
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
    let token = req.cookies?.accessToken;
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (token) {
      const decoded = require('jsonwebtoken').decode(token);
      if (decoded?.jti && decoded?.exp) {
        // Blacklist the access token JTI
        await TokenBlacklist.create({
          jti: decoded.jti,
          expireAt: new Date(decoded.exp * 1000),
        }).catch(() => {});

        // Revoke the refresh token for this session
        await RefreshToken.updateMany(
          { jti: decoded.jti, userId: req.user._id, isRevoked: false },
          { $set: { isRevoked: true, revokedAt: new Date(), revokedBy: 'user' } }
        ).catch(() => {});
      }
    }

    clearCookies(res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'An internal error occurred' });
  }
});

// POST /api/auth/refresh — silently refresh the access token using the httpOnly cookie
router.post('/refresh', async (req, res) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken;
    if (!rawRefreshToken) {
      return res.status(401).json({ success: false, message: 'No refresh token', code: 'NO_REFRESH_TOKEN' });
    }

    // Find a matching non-revoked, non-expired record
    const stored = await RefreshToken.find({
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    }).lean();

    let matchedRecord = null;
    for (const record of stored) {
      const ok = await RefreshToken.verifyToken(rawRefreshToken, record.tokenHash);
      if (ok) { matchedRecord = record; break; }
    }

    if (!matchedRecord) {
      clearCookies(res);
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token', code: 'INVALID_REFRESH' });
    }

    // Check max session limit (8 hours from sessionStart)
    const sessionAge = Date.now() - new Date(matchedRecord.sessionStart).getTime();
    if (sessionAge > MAX_SESSION_MS) {
      await RefreshToken.updateOne(
        { _id: matchedRecord._id },
        { $set: { isRevoked: true, revokedAt: new Date(), revokedBy: 'max_session' } }
      );
      clearCookies(res);
      return res.status(401).json({ success: false, message: 'Maximum session duration reached. Please log in again.', code: 'MAX_SESSION' });
    }

    const user = await User.findById(matchedRecord.userId);
    if (!user || user.isActive === false) {
      clearCookies(res);
      return res.status(401).json({ success: false, message: 'User not found or disabled', code: 'USER_DISABLED' });
    }

    // Issue new access token + rotate refresh token
    const newJti = uuidv4();
    const newRawRefresh = uuidv4();

    const Hospital2 = require('../models/hospital.model');
    const hospitalInfo2 = user.hospitalId ? await Hospital2.findById(user.hospitalId).select('tenantKey slug').lean() : null;

    const newAccessToken = jwt.sign({
      jti: newJti,
      userId: user._id,
      email: user.email,
      roleId: String(user.role),
      hospitalId: user.hospitalId ? String(user.hospitalId) : null,
      tenantKey: hospitalInfo2?.tenantKey || null,
      subdomain: hospitalInfo2?.slug || null,
      tv: user.tokenVersion ?? 0,
      sid: matchedRecord.sessionId,
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Revoke old refresh token and create new one (token rotation)
    await RefreshToken.updateOne(
      { _id: matchedRecord._id },
      { $set: { isRevoked: true, revokedAt: new Date(), revokedBy: 'rotated' } }
    );

    const ua3 = req.headers['user-agent'] || '';
    const parsed3 = parseUserAgent(ua3);
    await RefreshToken.createForUser({
      userId: user._id,
      hospitalId: user.hospitalId || null,
      rawToken: newRawRefresh,
      sessionId: matchedRecord.sessionId, // same session
      jti: newJti,
      ip: req.ip || '',
      browser: parsed3.browser,
      os: parsed3.os,
      device: parsed3.device,
      userAgent: ua3,
    });

    // Update lastUsedAt on old record (soft update before rotation)
    await RefreshToken.updateMany(
      { sessionId: matchedRecord.sessionId, isRevoked: false },
      { $set: { lastUsedAt: new Date() } }
    ).catch(() => {});

    setCookies(res, newAccessToken, newRawRefresh);

    // Audit log: TOKEN_REFRESH
    try {
      const AuditLog2 = require('../models/auditLog.model');
      AuditLog2.create({
        clinicId: user.hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
        userId: user._id,
        userName: user.name,
        action: 'TOKEN_REFRESH',
        sessionId: matchedRecord.sessionId,
        ip: req.ip || '',
        browser: parsed3.browser,
        os: parsed3.os,
        device: parsed3.device,
        success: true,
      }).catch(() => {});
    } catch (_) {}

    res.json({
      success: true,
      sessionStart: matchedRecord.sessionStart,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ success: false, message: 'An internal error occurred' });
  }
});

// POST /api/auth/log-session-event — client reports idle logout, max session, etc.
router.post('/log-session-event', verifyToken, async (req, res) => {
  try {
    const { action, reason } = req.body;
    const allowedActions = ['SESSION_EXTENDED', 'SESSION_WARNING', 'AUTO_LOGOUT_IDLE', 'FORCED_LOGOUT', 'SESSION_TERMINATED_BY_ADMIN'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
    const AuditLog3 = require('../models/auditLog.model');
    const ua = req.headers['user-agent'] || '';
    const parsed = parseUserAgent(ua);
    await AuditLog3.create({
      clinicId: req.user.hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
      userId: req.user._id,
      userName: req.user.name,
      role: req.user._roleData?.name || String(req.user.role || ''),
      action,
      reason: reason || '',
      ip: req.ip || '',
      userAgent: ua,
      browser: parsed.browser,
      os: parsed.os,
      device: parsed.device,
      success: true,
    }).catch(() => {});
    res.json({ success: true });
  } catch (_) {
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
    const specialRoles = ['superadmin', 'centraladmin', 'hospitaladmin', 'clinicadmin'];

    if (specialRoles.includes(user.role)) {
      const isCentral = user.role === 'centraladmin' || user.role === 'superadmin';
      roleData = {
        name: user.role,
        permissions: isCentral ? ['*'] : (user.role === 'clinicadmin' ? [] : ['admin_manage_roles', 'admin_view_stats']),
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
        let hosp = await Hospital.findById(user.hospitalId).select('clinicType tenantKey slug');
        if (!hosp) {
          const Clinic = require('../models/clinic.model');
          hosp = await Clinic.findById(user.hospitalId).select('clinicType tenantKey slug');
        }
        clinicType = hosp?.clinicType || 'hospital';
        tenantKey = hosp?.tenantKey || null;
        subdomain = hosp?.slug || null;
      } catch (_) { }
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
    if (name !== undefined) updateFields.name = name.trim();
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
router.put('/change-password', verifyToken, auditLog('PASSWORD_CHANGED', null, { severity: 'warning', dataCategory: 'Administrative' }), async (req, res) => {
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
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    const { syncToTenant } = require('../utils/tenantSync');
    await syncToTenant('User', user, 'save', user.hospitalId);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Error changing password: ' + error.message });
  }
});

module.exports = router;