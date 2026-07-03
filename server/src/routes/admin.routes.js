const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Hospital = require('../models/hospital.model');
const jwt = require('jsonwebtoken');
const { verifyAdmin, verifyAdminOrSuperAdmin, verifyToken, verifySuperAdmin } = require('../middleware/auth.middleware');
const { nanoid } = require('nanoid');
const auditLog = require('../middleware/audit.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');

// Entity models
const Doctor = require('../models/doctor.model');
const Lab = require('../models/lab.model');
const Pharmacy = require('../models/pharmacy.model');
const Reception = require('../models/reception.model');

const { JWT_SECRET } = require('../config/jwt');
const validatePassword = require('../utils/validatePassword');

// ==========================================
// HELPERS
// ==========================================

/**
 * Build user response with full role data
 */
async function buildUserResponse(user, preloadedRoles = null) {
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
        if (preloadedRoles) {
            const roleIdStr = String(user.role);
            roleData = preloadedRoles.find(r => String(r._id) === roleIdStr || r.name.toLowerCase() === roleIdStr.toLowerCase());
        }

        if (!roleData && mongoose.Types.ObjectId.isValid(user.role)) {
            roleData = await Role.findById(user.role);
        }
        if (!roleData) {
            // Legacy string fallback - find role by name scoped to the user's hospital
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
        phone: user.phone,
        role: roleName,
        roleId: user.role,
        patientId: user.patientId || null,
        hospitalId: user.hospitalId || null,
        permissions: roleData ? roleData.permissions : [],
        customPermissions: user.customPermissions || [],
        deniedPermissions: user.deniedPermissions || [],
        // effectivePermissions = (role permissions + custom permissions) - denied permissions (de-duped)
        effectivePermissions: roleData
            ? Array.from(new Set([...(roleData.permissions || []), ...(user.customPermissions || [])].filter(p => !(user.deniedPermissions || []).includes(p))))
            : Array.from(new Set((user.customPermissions || []).filter(p => !(user.deniedPermissions || []).includes(p)))),
        dashboardPath: roleData ? roleData.dashboardPath : '/',
        navLinks: roleData ? roleData.navLinks : [],
        avatar: user.avatar || null,
        departments: user.departments || [],
        isActive: user.isActive !== false
    };
}

/**
 * Get hospitalId filter for a request.
 * - centraladmin/superadmin: no filter (sees all) unless ?hospitalId= query param
 * - hospitaladmin: always scoped to their hospitalId
 * - others: scoped to their hospitalId
 */
function getHospitalFilter(req) {
    const role = req.user.role;
    const isCentral = role === 'centraladmin' || role === 'superadmin';

    if (isCentral) {
        // Central admin can optionally filter by ?hospitalId=xxx
        const qHospitalId = req.query.hospitalId;
        return qHospitalId ? { hospitalId: qHospitalId } : {};
    }

    // Hospital admin or staff — always scoped
    const hid = req.user.hospitalId;
    return hid ? { hospitalId: hid } : { hospitalId: null };
}

// ==========================================
// 1. ROLE MANAGEMENT — HOSPITAL-SCOPED
// ==========================================

// Get All Roles (scoped to hospital)
router.get('/roles', verifyToken, async (req, res) => {
    try {
        const role = req.user.role;
        const isCentral = role === 'centraladmin' || role === 'superadmin';

        let query = {};
        if (!isCentral) {
            // Hospital admin: see roles for their hospital + global roles (hospitalId=null)
            const hid = req.user.hospitalId;
            query = { $or: [{ hospitalId: hid }, { hospitalId: null }] };
        }
        // Central admin: see everything

        // Sort: hospital-scoped (non-null ObjectId) first, global templates (null) last
        const roles = await Role.find(query).sort({ hospitalId: -1, name: 1 });

        // Filter duplicates by name (case-insensitive)
        const uniqueRoles = [];
        const seenNames = new Set();

        for (const r of roles) {
            const normalizedName = r.name.trim().toLowerCase();
            // Exclude "Patient" and "Administrator" from the displayed list
            if (normalizedName === 'patient' || normalizedName === 'administrator') {
                continue;
            }
            if (!seenNames.has(normalizedName)) {
                seenNames.add(normalizedName);
                uniqueRoles.push(r);
            }
        }

        const rolesWithCounts = await Promise.all(uniqueRoles.map(async (r) => {
            const count = await User.countDocuments({ role: r._id });
            return { ...r.toObject(), userCount: count };
        }));

        res.json({ success: true, data: rolesWithCounts });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Create a New Role (scoped to hospital)
router.post('/roles', verifyAdminOrSuperAdmin, auditLog('ROLE_CREATED', null, { severity: 'warning', dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { name, permissions, description, dashboardPath, navLinks } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Role name is required' });

        const role = req.user.role;
        const isCentral = role === 'centraladmin' || role === 'superadmin';

        // hospitalId for this role
        const roleHospitalId = isCentral
            ? (req.body.hospitalId || null)
            : (req.user.hospitalId || null);

        // Check uniqueness within the hospital scope
        const existingRole = await Role.findOne({ name, hospitalId: roleHospitalId });
        if (existingRole) {
            return res.status(400).json({ success: false, message: 'Role with this name already exists for this hospital' });
        }

        const newRole = new Role({
            name, permissions, description, dashboardPath, navLinks,
            hospitalId: roleHospitalId
        });
        await newRole.save();

        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('Role', newRole, 'save', roleHospitalId);

        res.json({ success: true, message: 'Role created successfully', data: newRole });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update an Existing Role
router.put('/roles/:roleId', verifyAdminOrSuperAdmin, auditLog('ROLE_UPDATED', (req) => ({ model: 'Role', id: req.params.roleId, label: 'Role updated' }), { severity: 'warning', dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { roleId } = req.params;
        const { name, permissions, description, dashboardPath, navLinks } = req.body;

        const roleDoc = await Role.findById(roleId);
        if (!roleDoc) return res.status(404).json({ success: false, message: 'Role not found' });

        // Hospital admin can only edit their own hospital's roles
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(roleDoc.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot edit roles from another hospital' });
        }

        if (roleDoc.isSystemRole && name && name !== roleDoc.name) {
            return res.status(403).json({ success: false, message: 'Cannot rename system roles' });
        }

        if (name) roleDoc.name = name;
        if (permissions) roleDoc.permissions = permissions;
        if (description !== undefined) roleDoc.description = description;
        if (dashboardPath !== undefined) roleDoc.dashboardPath = dashboardPath;
        if (navLinks !== undefined) roleDoc.navLinks = navLinks;

        await roleDoc.save();

        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('Role', roleDoc, 'save', roleDoc.hospitalId);

        res.json({ success: true, message: 'Role updated successfully', data: roleDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Delete a Role
router.delete('/roles/:roleId', verifyAdminOrSuperAdmin, auditLog('ROLE_DELETED', (req) => ({ model: 'Role', id: req.params.roleId, label: 'Role deleted' }), { severity: 'critical', dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { roleId } = req.params;
        const roleDoc = await Role.findById(roleId);
        if (!roleDoc) return res.status(404).json({ success: false, message: 'Role not found' });

        if (roleDoc.isSystemRole) {
            return res.status(403).json({ success: false, message: 'Cannot delete system roles' });
        }

        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(roleDoc.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot delete roles from another hospital' });
        }

        const userCount = await User.countDocuments({ role: roleId });
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete role. ${userCount} user(s) still assigned to it.`
            });
        }

        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('Role', roleDoc, 'delete', roleDoc.hospitalId);

        await Role.findByIdAndDelete(roleId);
        res.json({ success: true, message: 'Role deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// 2. ADMIN AUTH ROUTES
// ==========================================

// Central Admin Signup — creates centraladmin account
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
        }
        const pwErr1 = validatePassword(password);
        if (pwErr1) return res.status(400).json({ success: false, message: pwErr1 });

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered.' });
        }

        const admin = new User({
            name, email, password, phone: phone || '', role: 'centraladmin', hospitalId: null
        });

        await admin.save();

        const token = jwt.sign(
            { userId: admin._id, email: admin.email, role: 'centraladmin', tenantKey: null, subdomain: null },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'Central Admin account created successfully',
            user: {
                id: admin._id, name: admin.name, email: admin.email,
                role: 'centraladmin', permissions: ['*'],
                dashboardPath: '/supremeadmin', navLinks: []
            },
            token
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating admin' });
    }
});

// Central Admin Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

        const normalizedEmail = String(email || '').toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            try {
                const AuditLogModel = require('../models/auditLog.model');
                AuditLogModel.create({
                    clinicId: new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
                    userName: normalizedEmail,
                    action: 'FAILED_LOGIN',
                    severity: 'warning',
                    success: false,
                    reason: 'User not found',
                    ip: req.ip || '',
                    userAgent: req.headers['user-agent'] || ''
                }).catch(() => {});
            } catch (_) {}
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        let roleName = user.role;
        let userRoleObj = null;

        if (mongoose.Types.ObjectId.isValid(user.role)) {
            userRoleObj = await Role.findById(user.role);
            if (userRoleObj) roleName = userRoleObj.name.toLowerCase();
        } else if (typeof user.role === 'string') {
            roleName = user.role.toLowerCase();
        }

        if (roleName !== 'superadmin' && roleName !== 'centraladmin' && roleName !== 'admin') {
            try {
                const AuditLogModel = require('../models/auditLog.model');
                AuditLogModel.create({
                    clinicId: user.hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
                    userId: user._id,
                    userName: user.name || normalizedEmail,
                    role: roleName,
                    action: 'FAILED_LOGIN',
                    severity: 'warning',
                    success: false,
                    reason: 'Access denied. Central Admin only.',
                    ip: req.ip || '',
                    userAgent: req.headers['user-agent'] || ''
                }).catch(() => {});
            } catch (_) {}
            return res.status(403).json({ success: false, message: 'Access denied. Central Admin only.' });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            try {
                const AuditLogModel = require('../models/auditLog.model');
                AuditLogModel.create({
                    clinicId: user.hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
                    userId: user._id,
                    userName: user.name || normalizedEmail,
                    role: roleName,
                    action: 'FAILED_LOGIN',
                    severity: 'warning',
                    success: false,
                    reason: 'Incorrect password',
                    ip: req.ip || '',
                    userAgent: req.headers['user-agent'] || ''
                }).catch(() => {});
            } catch (_) {}
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const { v4: uuidv4 } = require('uuid');
        const jti = uuidv4();
        const token = jwt.sign(
            { jti, userId: user._id, email: user.email, roleId: String(user.role), tenantKey: null, subdomain: null },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Audit successful central admin login
        try {
            const AuditLogModel = require('../models/auditLog.model');
            AuditLogModel.create({
                clinicId: user.hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
                userId: user._id,
                userName: user.name || normalizedEmail,
                role: roleName,
                action: 'STAFF_LOGIN',
                success: true,
                sessionId: jti,
                ip: req.ip || '',
                userAgent: req.headers['user-agent'] || ''
            }).catch(() => {});
        } catch (_) {}

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id, name: user.name, email: user.email,
                role: roleName, permissions: ['*'],
                dashboardPath: '/supremeadmin', navLinks: []
            },
            token
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error during login' });
    }
});

// ==========================================
// 3. USER MANAGEMENT — HOSPITAL-SCOPED
// ==========================================

// Get all users — scoped by hospital, excluding patients and admin roles
router.get('/users', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        const filter = getHospitalFilter(req);

        // Exclude system admin roles from the staff list
        const systemRoles = ['centraladmin', 'superadmin', 'hospitaladmin'];

        // Also find the Patient role ObjectId to exclude it
        const patientRole = await Role.findOne({ name: { $regex: /^patient$/i } });
        const patientRoleId = patientRole ? patientRole._id : null;

        let query = {};
        if (isCentral) {
            query = {
                ...filter, // Optionally filter by ?hospitalId= if provided
                role: { $nin: ['centraladmin', 'superadmin'] },
                patientId: { $exists: false }
            };
        } else {
            // Hospital admin gets non-admin staff scoped to their hospital
            const excludeUserIds = [];
            if (req.user.hospitalId) {
                const hospital = await Hospital.findById(req.user.hospitalId);
                if (hospital && hospital.adminUserId) {
                    excludeUserIds.push(hospital.adminUserId);
                }
            }

            query = {
                ...filter,
                _id: { $nin: excludeUserIds },
                role: { $nin: systemRoles },
                patientId: { $exists: false }
            };
        }

        const users = await User.find(query, { password: 0 }).sort({ createdAt: -1 });

        // Fetch all roles to optimize database lookups and prevent N+1 queries
        let roleQuery = {};
        if (req.user.hospitalId) {
            roleQuery = { $or: [{ hospitalId: req.user.hospitalId }, { hospitalId: null }] };
        }
        const preloadedRoles = await Role.find(roleQuery);

        // Build full response and filter out patients
        const usersWithRoles = await Promise.all(users.map(async (u) => {
            return await buildUserResponse(u, preloadedRoles);
        }));

        // Filter patients out of staff list
        const staffOnly = usersWithRoles.filter(u =>
            !u.patientId && !['patient'].includes((u.role || '').toLowerCase())
        );

        res.json({ success: true, users: staffOnly });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

// Create User (by admin) — hospitalId is REQUIRED for all staff
router.post('/users', verifyAdminOrSuperAdmin, auditLog('USER_CREATE', null, { severity: 'warning', dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { name, email, password, phone, roleId, services, avatar, departments } = req.body;

        if (!name || !email || !password || !roleId) {
            return res.status(400).json({ success: false, message: 'Name, email, password, and roleId are required' });
        }
        const pwErr2 = validatePassword(password);
        if (pwErr2) return res.status(400).json({ success: false, message: pwErr2 });

        let roleDoc = null;
        let roleName = '';
        if (roleId === 'hospitaladmin') {
            roleName = 'hospitaladmin';
        } else {
            if (mongoose.Types.ObjectId.isValid(roleId)) {
                roleDoc = await Role.findById(roleId);
            }
            if (!roleDoc) {
                // If it's a string like 'hospitaladmin', 'doctor' etc., try to find it
                const roleMapping = {
                    'lab': 'Lab Technician',
                    'pharmacy': 'Pharmacist',
                    'reception': 'Receptionist'
                };
                const targetRoleName = roleMapping[String(roleId).toLowerCase()] || roleId;
                const query = { name: { $regex: new RegExp(`^${targetRoleName}$`, 'i') } };
                if (req.body.hospitalId) query.hospitalId = req.body.hospitalId;
                else if (req.user.hospitalId) query.hospitalId = req.user.hospitalId;

                roleDoc = await Role.findOne(query);
                if (!roleDoc && query.hospitalId) {
                    roleDoc = await Role.findOne({ name: { $regex: new RegExp(`^${targetRoleName}$`, 'i') }, hospitalId: null });
                }
            }

            if (!roleDoc) {
                // Check if roleId is a system role string (like doctor, receptionist etc.)
                const systemRoleStrings = ['doctor', 'receptionist', 'pharmacist', 'lab technician', 'reception', 'lab', 'pharmacy', 'nurse'];
                if (systemRoleStrings.includes(String(roleId).toLowerCase())) {
                    roleName = String(roleId).toLowerCase();
                } else {
                    return res.status(400).json({ success: false, message: 'Invalid role. Role not found.' });
                }
            } else {
                roleName = roleDoc.name.toLowerCase();
            }
        }

        // Patients don't need hospital assignment
        const isPatientRole = roleName === 'patient';

        // Determine hospitalId
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        let assignedHospitalId = null;

        if (!isCentral) {
            // Hospital admin: always use their hospital
            assignedHospitalId = req.user.hospitalId;
        } else {
            // Central admin: hospitalId must be in body for staff (not patients)
            assignedHospitalId = req.body.hospitalId || (roleDoc ? roleDoc.hospitalId : null) || null;
        }

        if (!isPatientRole && !assignedHospitalId) {
            return res.status(400).json({
                success: false,
                message: 'Staff must be linked to a hospital. Please provide hospitalId.'
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: 'User already exists' });

        const user = new User({
            name,
            email: email.toLowerCase(),
            password,
            phone: phone || '',
            role: roleDoc ? roleDoc._id : roleId,
            hospitalId: assignedHospitalId,
            services: roleName === 'doctor' ? services : [],
            departments: departments || [],
            avatar: avatar || null,
            counterName: ['reception', 'receptionist'].includes(roleName) ? name : 'Counter 1'
        });

        await user.save();

        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('User', user, 'save', assignedHospitalId);
        if (roleDoc) {
            await syncToTenant('Role', roleDoc, 'save', assignedHospitalId);
        }

        // Link hospital admin to hospital record if roleId is 'hospitaladmin'
        if (roleId === 'hospitaladmin' && assignedHospitalId) {
            const hospital = await Hospital.findById(assignedHospitalId);
            if (hospital) {
                hospital.adminUserId = user._id;
                await hospital.save();
                await syncToTenant('Hospital', hospital, 'save', assignedHospitalId);
            }
        }

        // Auto-create linked entity profiles with hospitalId
        try {
            const { getTenantConnection } = require('../db/tenantDb');
            const { getTenantModels } = require('../db/tenantModels');
            const tenantDb = await getTenantConnection(String(assignedHospitalId));
            const tenantModels = getTenantModels(tenantDb);

            if (roleName === 'doctor') {
                const TenantDoctor = tenantModels.Doctor;
                let doctorId = nanoid(10);
                while (await TenantDoctor.findOne({ doctorId })) doctorId = nanoid(10);
                const defaultAvailability = {
                    monday: { available: true, startTime: '09:00', endTime: '17:00' },
                    tuesday: { available: true, startTime: '09:00', endTime: '17:00' },
                    wednesday: { available: true, startTime: '09:00', endTime: '17:00' },
                    thursday: { available: true, startTime: '09:00', endTime: '17:00' },
                    friday: { available: true, startTime: '09:00', endTime: '17:00' },
                    saturday: { available: true, startTime: '09:00', endTime: '17:00' },
                    sunday: { available: false, startTime: '09:00', endTime: '17:00' }
                };
                await TenantDoctor.create({
                    doctorId, userId: user._id, name: user.name,
                    email: user.email, phone: user.phone,
                    hospitalId: assignedHospitalId,
                    services: user.services, availability: defaultAvailability,
                    departments: user.departments,
                    specialty: 'General', consultationFee: 0
                });
            } else if (roleName === 'lab' || roleName === 'lab technician') {
                const TenantLab = tenantModels.Lab;
                await TenantLab.create({
                    name: user.name, email: user.email, phone: user.phone,
                    userId: user._id, hospitalId: assignedHospitalId
                });
            } else if (roleName === 'pharmacy' || roleName === 'pharmacist') {
                const TenantPharmacy = tenantModels.Pharmacy;
                await TenantPharmacy.create({
                    name: user.name, email: user.email, phone: user.phone,
                    userId: user._id, hospitalId: assignedHospitalId
                });
            } else if (roleName === 'reception' || roleName === 'receptionist') {
                const TenantReception = tenantModels.Reception;
                await TenantReception.create({ userId: user._id, hospitalId: assignedHospitalId });
            }
        } catch (profileError) {
            console.error('Error creating linked profile:', profileError);
        }

        const userData = await buildUserResponse(user);
        res.status(201).json({
            success: true,
            message: `${roleName} account created successfully`,
            user: userData
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, message: 'Error creating user' });
    }
});

// Update user details
router.put('/users/:userId', verifyAdminOrSuperAdmin, auditLog('USER_UPDATE', (req) => ({ model: 'User', id: req.params.userId, label: 'Staff record updated' }), { dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, email, phone, roleId, avatar, specialty, departments } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Hospital admin can ONLY update users in their hospital
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(user.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot edit users from another hospital' });
        }

        if (['centraladmin', 'superadmin'].includes(user.role) && !isCentral) {
            return res.status(403).json({ success: false, message: 'Cannot modify Central Admin accounts' });
        }

        if (userId === String(req.user._id) && roleId && roleId !== String(user.role)) {
            return res.status(403).json({ success: false, message: 'Cannot change your own role' });
        }

        if (name) user.name = name;
        if (email) user.email = email;
        if (phone) user.phone = phone;
        if (avatar !== undefined) user.avatar = avatar;
        if (departments !== undefined) user.departments = departments;

        let roleChanged = false;
        let newRoleName = null;

        if (roleId && String(roleId) !== String(user.role)) {
            if (roleId === 'hospitaladmin') {
                user.role = 'hospitaladmin';
                newRoleName = 'hospitaladmin';
                roleChanged = true;
            } else {
                let roleDoc = null;
                if (mongoose.Types.ObjectId.isValid(roleId)) {
                    roleDoc = await Role.findById(roleId);
                }
                if (!roleDoc) {
                    const roleMapping = {
                        'lab': 'Lab Technician',
                        'pharmacy': 'Pharmacist',
                        'reception': 'Receptionist'
                    };
                    const targetRoleName = roleMapping[String(roleId).toLowerCase()] || roleId;
                    // Try finding by name scoped to hospital
                    const query = { name: { $regex: new RegExp(`^${targetRoleName}$`, 'i') } };
                    if (user.hospitalId) query.hospitalId = user.hospitalId;
                    roleDoc = await Role.findOne(query);
                    if (!roleDoc && user.hospitalId) {
                        roleDoc = await Role.findOne({ name: { $regex: new RegExp(`^${targetRoleName}$`, 'i') }, hospitalId: null });
                    }
                }
                if (!roleDoc) {
                    // Fallback to checking system role strings
                    const systemRoleStrings = ['doctor', 'receptionist', 'pharmacist', 'lab technician', 'reception', 'lab', 'pharmacy', 'nurse'];
                    if (systemRoleStrings.includes(String(roleId).toLowerCase())) {
                        newRoleName = String(roleId).toLowerCase();
                        user.role = roleId;
                    } else {
                        return res.status(400).json({ success: false, message: 'Invalid role' });
                    }
                } else {
                    newRoleName = roleDoc.name.toLowerCase();
                    user.role = roleDoc._id; // update to ObjectId if found
                }
                roleChanged = true;
            }
        } else if (user.role && !['centraladmin', 'superadmin', 'hospitaladmin'].includes(user.role)) {
            let roleDoc = null;
            if (mongoose.Types.ObjectId.isValid(user.role)) {
                roleDoc = await Role.findById(user.role);
            }
            if (!roleDoc) {
                // Try finding by name scoped to hospital
                const query = { name: { $regex: new RegExp(`^${user.role}$`, 'i') } };
                if (user.hospitalId) query.hospitalId = user.hospitalId;
                roleDoc = await Role.findOne(query);
            }
            newRoleName = roleDoc ? roleDoc.name.toLowerCase() : String(user.role).toLowerCase();
        } else if (user.role === 'hospitaladmin') {
            newRoleName = 'hospitaladmin';
        }

        if (['reception', 'receptionist'].includes(String(newRoleName || '').toLowerCase())) {
            user.counterName = user.name;
        }

        await user.save();

        // Sync hospital admin link if role is hospitaladmin
        if (user.role === 'hospitaladmin' && user.hospitalId) {
            const hospital = await Hospital.findById(user.hospitalId);
            if (hospital && String(hospital.adminUserId) !== String(user._id)) {
                hospital.adminUserId = user._id;
                await hospital.save();
                const { syncToTenant } = require('../utils/tenantSync');
                await syncToTenant('Hospital', hospital, 'save', user.hospitalId);
            }
        }

        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('User', user, 'save', user.hospitalId);

        // Update linked entity profiles
        try {
            const hospitalId = user.hospitalId;
            const { getTenantConnection } = require('../db/tenantDb');
            const { getTenantModels } = require('../db/tenantModels');
            const tenantDb = await getTenantConnection(String(hospitalId));
            const tenantModels = getTenantModels(tenantDb);

            if (newRoleName === 'doctor') {
                const TenantDoctor = tenantModels.Doctor;
                let doctorProfile = await TenantDoctor.findOne({ userId: user._id });
                if (!doctorProfile && roleChanged) {
                    let doctorId = nanoid(10);
                    while (await TenantDoctor.findOne({ doctorId })) doctorId = nanoid(10);
                    doctorProfile = new TenantDoctor({
                        doctorId, userId: user._id, hospitalId,
                        availability: {
                            monday: { available: true, startTime: '09:00', endTime: '17:00' },
                            tuesday: { available: true, startTime: '09:00', endTime: '17:00' },
                            wednesday: { available: true, startTime: '09:00', endTime: '17:00' },
                            thursday: { available: true, startTime: '09:00', endTime: '17:00' },
                            friday: { available: true, startTime: '09:00', endTime: '17:00' },
                            saturday: { available: true, startTime: '09:00', endTime: '17:00' },
                            sunday: { available: false, startTime: '09:00', endTime: '17:00' }
                        }
                    });
                }
                if (doctorProfile) {
                    if (name) doctorProfile.name = name;
                    if (email) doctorProfile.email = email;
                    if (phone) doctorProfile.phone = phone;
                    if (specialty) doctorProfile.specialty = specialty;
                    if (departments !== undefined) doctorProfile.departments = departments;
                    doctorProfile.hospitalId = hospitalId;
                    await doctorProfile.save();
                }
            }
            if (['lab', 'lab technician'].includes(newRoleName)) {
                const TenantLab = tenantModels.Lab;
                await TenantLab.findOneAndUpdate({ userId: user._id }, { name, email, phone, hospitalId }, { upsert: true, new: true });
            }
            if (['pharmacy', 'pharmacist'].includes(newRoleName)) {
                const TenantPharmacy = tenantModels.Pharmacy;
                await TenantPharmacy.findOneAndUpdate({ userId: user._id }, { name, email, phone, hospitalId }, { upsert: true, new: true });
            }
            if (['reception', 'receptionist'].includes(newRoleName)) {
                const TenantReception = tenantModels.Reception;
                let rec = await TenantReception.findOne({ userId: user._id });
                if (!rec && roleChanged) rec = await TenantReception.create({ userId: user._id, hospitalId });
            }
        } catch (profileError) {
            console.error('Error updating linked profile:', profileError);
        }

        const updatedUser = await buildUserResponse(user);
        res.json({ success: true, message: 'User updated successfully', user: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating user' });
    }
});

// Delete user
router.delete('/users/:userId', verifyAdminOrSuperAdmin, auditLog('USER_DELETE', (req) => ({ model: 'User', id: req.params.userId, label: 'Staff account deleted' }), { severity: 'critical', dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { userId } = req.params;

        if (userId === String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Cannot delete own account' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';

        // Hospital admin can only delete users in their hospital
        if (!isCentral && String(user.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot delete users from another hospital' });
        }

        if (['centraladmin', 'superadmin'].includes(user.role) && !isCentral) {
            return res.status(403).json({ success: false, message: 'Cannot delete Central Admin accounts' });
        }

        // Cascade delete entity profiles
        let roleName = null;
        if (user.role && !['centraladmin', 'superadmin', 'hospitaladmin'].includes(user.role)) {
            if (mongoose.Types.ObjectId.isValid(user.role)) {
                const roleDoc = await Role.findById(user.role);
                roleName = roleDoc ? roleDoc.name.toLowerCase() : null;
            } else {
                roleName = String(user.role).toLowerCase();
            }
        }

        const { getTenantConnection } = require('../db/tenantDb');
        const { getTenantModels } = require('../db/tenantModels');
        const tenantDb = await getTenantConnection(String(user.hospitalId));
        const tenantModels = getTenantModels(tenantDb);

        if (roleName === 'doctor') {
            await tenantModels.Doctor.findOneAndDelete({ userId: user._id });
        }
        if (roleName === 'lab' || roleName === 'lab technician') {
            await tenantModels.Lab.findOneAndDelete({ userId: user._id });
        }
        if (roleName === 'pharmacy' || roleName === 'pharmacist') {
            await tenantModels.Pharmacy.findOneAndDelete({ userId: user._id });
        }
        if (roleName === 'reception' || roleName === 'receptionist') {
            await tenantModels.Reception.findOneAndDelete({ userId: user._id });
        }

        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('User', user, 'delete', user.hospitalId);
        await User.findByIdAndDelete(userId);
        res.json({ success: true, message: 'User and associated profile deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting user' });
    }
});

// Toggle User Active Status (by admin)
router.put('/users/:userId/status', verifyAdminOrSuperAdmin, auditLog('USER_UPDATE', (req) => ({ model: 'User', id: req.params.userId, label: 'Staff account status toggled' }), { severity: 'warning', dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(user.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot edit users from another hospital' });
        }

        user.isActive = isActive;
        await user.save();

        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('User', user, 'save', user.hospitalId);

        res.json({ success: true, message: `User account is now ${isActive ? 'Active' : 'Disabled'}` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error toggling user status' });
    }
});

// Reset User Password (by admin)
router.put('/users/:userId/reset-password', verifyAdminOrSuperAdmin, auditLog('PASSWORD_RESET', (req) => ({ model: 'User', id: req.params.userId, label: 'Password reset by admin' }), { severity: 'critical', dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { userId } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ success: false, message: 'New password is required' });
        }

        const pwErr = validatePassword(password);
        if (pwErr) return res.status(400).json({ success: false, message: pwErr });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(user.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot edit users from another hospital' });
        }

        user.password = password;
        await user.save();

        res.json({ success: true, message: 'User password reset successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error resetting user password' });
    }
});

// ==========================================
// CUSTOM PER-USER PERMISSIONS ENDPOINT
// ==========================================

// All known permission keys that can be assigned
const KNOWN_PERMISSIONS = [
    'patient_create', 'patient_search', 'patient_view', 'patient_edit',
    'visit_intake', 'visit_diagnose', 'clinical_history_view',
    'appointment_manage', 'appointment_view_all',
    'lab_view', 'lab_manage', 'lab_reports_view',
    'pharmacy_view', 'pharmacy_manage',
    'finance_view', 'billing_view', 'billing_manage',
    'admin_manage_roles', 'admin_view_stats',
    'accountant_view', 'accountant_manage',
    'staff_manage', 'department_manage', 'patient_monitor',
    'question_library_manage', 'document_templates_manage',
    'admission_manage', 'resource_manage', 'reports_view',
    'analytics_view', 'operations_manage', 'inventory_view',
    'billing_insurance', 'billing_ipd_settlement', 'billing_receipt_reprint', 'billing_discounts',
    'billing_collect_payment', 'billing_generate_invoice', 'billing_print_invoice', 'billing_refund', 'billing_reports', 'billing_analytics',
    'billing_patient', 'billing_pending', 'billing_invoices', 'billing_templates', 'billing_settings',
    'finance_outstanding', 'finance_claims', 'finance_reception_collections', 'finance_expenses', 'finance_profit_loss',
    'finance_statements', 'finance_reconciliation', 'finance_transactions', 'finance_audit',
    'finance_payroll', 'finance_doctor_payouts'
];

/**
 * PUT /api/admin/users/:userId/permissions
 * Assign custom (per-user) permissions on top of their role.
 * Only Super Admin / Central Admin can call this.
 * Permissions remain scoped to the user's hospital.
 */
router.put('/users/:userId/permissions', verifyToken, verifyAdminOrSuperAdmin, auditLog('PERMISSION_GRANTED', (req) => ({ model: 'User', id: req.params.userId, label: 'Custom permissions updated' }), { severity: 'critical', dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { userId } = req.params;
        const { customPermissions, deniedPermissions } = req.body;

        if (!Array.isArray(customPermissions)) {
            return res.status(400).json({ success: false, message: 'customPermissions must be an array of permission strings' });
        }
        if (deniedPermissions && !Array.isArray(deniedPermissions)) {
            return res.status(400).json({ success: false, message: 'deniedPermissions must be an array of permission strings' });
        }

        // Validate each permission key
        const invalidCustom = customPermissions.filter(p => !KNOWN_PERMISSIONS.includes(p));
        if (invalidCustom.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Unknown custom permission key(s): ${invalidCustom.join(', ')}. Use the defined permission list.`
            });
        }

        if (deniedPermissions) {
            const invalidDenied = deniedPermissions.filter(p => !KNOWN_PERMISSIONS.includes(p));
            if (invalidDenied.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Unknown denied permission key(s): ${invalidDenied.join(', ')}. Use the defined permission list.`
                });
            }
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Scoping / Tenant isolation checks
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(user.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot modify permissions for users from another hospital' });
        }

        // Prevent granting custom permissions to system-level admin accounts
        if (['centraladmin', 'superadmin'].includes(user.role)) {
            return res.status(403).json({ success: false, message: 'Cannot assign custom permissions to Central Admin accounts' });
        }

        user.customPermissions = customPermissions;
        user.deniedPermissions = deniedPermissions || [];
        await user.save();

        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('User', user, 'save', user.hospitalId);

        const updatedUser = await buildUserResponse(user);
        res.json({
            success: true,
            message: `Permissions updated for ${user.name}`,
            user: updatedUser
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating user permissions: ' + error.message });
    }
});

// GET /api/admin/dashboard-stats
router.get('/dashboard-stats', verifyToken, verifyAdminOrSuperAdmin, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context required' });
        }

        // 1. Count users (excluding system admins and patients)
        const systemRoles = ['centraladmin', 'superadmin', 'hospitaladmin'];
        const totalUsers = await User.countDocuments({
            hospitalId,
            role: { $nin: systemRoles },
            patientId: { $exists: false }
        });

        // 2. Count roles (scoped to hospital or global templates, excluding Patient and Administrator)
        const roles = await Role.find({
            $or: [{ hospitalId }, { hospitalId: null }]
        }).select('name hospitalId').lean();

        const seenNames = new Set();
        let totalRoles = 0;

        // Sort: hospital-scoped (non-null) first, global templates (null) last
        roles.sort((a, b) => {
            const aVal = a.hospitalId ? 1 : 0;
            const bVal = b.hospitalId ? 1 : 0;
            return bVal - aVal;
        });

        for (const r of roles) {
            const normalizedName = r.name.trim().toLowerCase();
            if (normalizedName === 'patient' || normalizedName === 'administrator') {
                continue;
            }
            if (!seenNames.has(normalizedName)) {
                seenNames.add(normalizedName);
                totalRoles++;
            }
        }

        // Dynamic models for tenant DB scoping
        let DoctorModel = Doctor;
        let PatientModel = require('../models/hospitalPatient.model');
        let AppointmentModel = require('../models/appointment.model');

        if (req.tenantDb) {
            const { getTenantModels } = require('../db/tenantModels');
            const tenantModels = getTenantModels(req.tenantDb);
            DoctorModel = tenantModels.Doctor;
            PatientModel = tenantModels.HospitalPatient;
            AppointmentModel = tenantModels.Appointment;
        }

        // 3. Count doctors
        const totalDoctors = await DoctorModel.countDocuments({ hospitalId });

        // 4. Count patients
        const totalPatients = await PatientModel.countDocuments({ hospitalId });

        // 5. Today's Appointments
        const todayStr = new Date().toDateString();
        const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
        const tomorrowStart = new Date(todayStart); tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

        const todayApts = await AppointmentModel.find({
            hospitalId,
            appointmentDate: { $gte: todayStart, $lt: tomorrowStart }
        }).select('amount status paymentStatus').lean();

        const todayAppointments = todayApts.length;
        const pendingPayments = todayApts.filter(a => (a.paymentStatus || '').toLowerCase() !== 'paid').length;

        // 6. Today's Revenue — from CollectionTransaction (same source as billing/accountant dashboard)
        let CollectionTransactionModel = require('../models/collectionTransaction.model');
        if (req.tenantDb) {
            const { getTenantModels } = require('../db/tenantModels');
            CollectionTransactionModel = getTenantModels(req.tenantDb).CollectionTransaction;
        }
        const allTransactions = await CollectionTransactionModel.find({ hospitalId }).lean();
        let todayRevenue = 0;
        allTransactions.forEach(t => {
            const payDate = new Date(t.collectionTimestamp);
            if (payDate.toDateString() === todayStr) todayRevenue += t.amount || 0;
        });

        res.json({
            success: true,
            stats: {
                totalUsers,
                totalRoles,
                totalDoctors,
                totalPatients,
                todayAppointments,
                pendingPayments,
                todayRevenue
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching dashboard stats' });
    }
});

module.exports = router;