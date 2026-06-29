const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Inventory = require('../models/inventory.model');
const LabTest = require('../models/labTest.model');
const Doctor = require('../models/doctor.model');
const Lab = require('../models/lab.model');
const Pharmacy = require('../models/pharmacy.model');
const Reception = require('../models/reception.model');
const Appointment = require('../models/appointment.model');
const FacilityCharge = require('../models/facilityCharge.model');
const Facility = require('../models/facility.model');
const QuestionLibrary = require('../models/questionLibrary.model');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth.middleware');
const { getTenantConnection, getTenantDbName, getActiveConnections, removeTenantConnection } = require('../db/tenantDb');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');

const { JWT_SECRET } = require('../config/jwt');
const auditLog = require('../middleware/audit.middleware');
const validatePassword = require('../utils/validatePassword');
const { hospitalCreationLimiter } = require('../middleware/rateLimiter');

const getModels = (req) => {
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return { 
            LabTest: m.LabTest,
            Facility: m.Facility
        };
    }
    return { 
        LabTest: require('../models/labTest.model'),
        Facility: require('../models/facility.model')
    };
};

/**
 * Central Admin middleware — only 'centraladmin' (or legacy 'superadmin') can access
 */
const verifyCentralAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            const role = req.user.role;
            if (role === 'centraladmin' || role === 'superadmin') {
                return next();
            }
            return res.status(403).json({ success: false, message: 'Central Admin access required' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

/**
 * Hospital Admin middleware — 'hospitaladmin' or 'centraladmin'/'superadmin'
 */
const verifyHospitalAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            // user.role may be a plain string OR an ObjectId (after role resolution saves the _id).
            // Always check against the resolved _roleData.name for reliability.
            const rawRole = String(req.user.role || '').toLowerCase();
            const resolvedRole = ((req.user._roleData && req.user._roleData.name) || '').toLowerCase();
            const allowedRoles = ['centraladmin', 'superadmin', 'hospitaladmin', 'admin'];

            if (allowedRoles.includes(rawRole) || allowedRoles.includes(resolvedRole)) {
                return next();
            }
            return res.status(403).json({ success: false, message: 'Hospital Admin access required' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

// ==========================================
// HOSPITAL CRUD (Central Admin only)
// ==========================================

// Get all hospitals
router.get('/', verifyCentralAdmin, async (req, res) => {
    try {
        const hospitals = await Hospital.find({}).populate('adminUserId', 'name email');
        res.json({ success: true, hospitals });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// PUBLIC: Resolve hospital by slug (for login page — no auth needed)
// GET /api/hospitals/resolve/:slug
// Returns hospital name, logo, id for the login branding
// ==========================================
router.get('/resolve/:slug', async (req, res) => {
    try {
        const identifier = req.params.slug;
        const mongoose = require('mongoose');
        const conditions = [];
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            conditions.push({ _id: identifier });
        }
        conditions.push({ tenantKey: identifier });
        conditions.push({ slug: identifier.toLowerCase() });

        const hospital = await Hospital.findOne(
            { $or: conditions, isActive: true },
            'name slug city logo departments departmentFees appointmentFee appointmentMode facilities isActive tenantKey originalSubdomain _id'
        );
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found. Check the URL and try again.' });
        }
        res.json({ success: true, hospital });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

const defaultRoles = [
    {
        name: 'Admin',
        description: 'Hospital superadmin with full management access',
        permissions: [
            'admin_manage_roles', 'admin_view_stats',
            'patient_search', 'patient_view', 'patient_edit',
            'visit_intake', 'clinical_history_view'
        ],
        dashboardPath: '/admin',
        navLinks: [
            { label: 'Dashboard', path: '/admin' },
            { label: 'Users', path: '/admin/users' },
            { label: 'Doctors', path: '/admin/doctors' },
            { label: 'Labs', path: '/admin/labs' },
            { label: 'Pharmacy', path: '/admin/pharmacy' },
            { label: 'Reception', path: '/admin/reception' },
            { label: 'Services', path: '/admin/services' },
            { label: 'Roles', path: '/admin/roles' }
        ],
        isSystemRole: false
    },
    {
        name: 'Doctor',
        description: 'Medical doctor with clinical access',
        permissions: [
            'visit_diagnose', 'patient_view', 'clinical_history_view'
        ],
        dashboardPath: '/doctor/patients',
        navLinks: [
            { label: 'Patients', path: '/doctor/patients' }
        ],
        isSystemRole: false
    },
    {
        name: 'Lab Technician',
        description: 'Laboratory staff managing tests and reports',
        permissions: [
            'lab_view', 'lab_manage', 'patient_view'
        ],
        dashboardPath: '/lab/dashboard',
        navLinks: [
            { label: 'Dashboard', path: '/lab/dashboard' }
        ],
        isSystemRole: false
    },
    {
        name: 'Pharmacist',
        description: 'Pharmacy staff managing inventory and orders',
        permissions: [
            'pharmacy_view', 'pharmacy_manage', 'patient_view'
        ],
        dashboardPath: '/pharmacy/inventory',
        navLinks: [
            { label: 'Inventory', path: '/pharmacy/inventory' },
            { label: 'Orders', path: '/pharmacy/orders' }
        ],
        isSystemRole: false
    },
    {
        name: 'Receptionist',
        description: 'Front desk staff managing appointments and patient registration',
        permissions: [
            'appointment_manage', 'appointment_view_all',
            'patient_search', 'patient_create', 'patient_view',
            'visit_intake'
        ],
        dashboardPath: '/reception/dashboard',
        navLinks: [
            { label: 'Dashboard', path: '/reception/dashboard' }
        ],
        isSystemRole: false
    },
    {
        name: 'Patient',
        description: 'Default role for patients/users',
        permissions: [
            'patient_view'
        ],
        dashboardPath: '/dashboard',
        navLinks: [
            { label: 'Services', path: '/services' },
            { label: 'Doctors', path: '/doctors' },
            { label: 'Appointment', path: '/appointment' },
            { label: 'Lab Reports', path: '/lab-reports' },
            { label: 'Dashboard', path: '/dashboard' }
        ],
        isSystemRole: false
    },
    {
        name: 'Accountant',
        description: 'Finance and accounting staff',
        permissions: [
            'finance_view', 'billing_view', 'billing_manage',
            'patient_view', 'patient_search',
            'finance_outstanding', 'finance_claims', 'finance_reception_collections', 'finance_expenses', 'finance_profit_loss',
            'finance_statements', 'finance_reconciliation', 'finance_transactions', 'finance_audit',
            'finance_payroll', 'finance_doctor_payouts', 'billing_reports', 'billing_analytics'
        ],
        dashboardPath: '/accountant/dashboard',
        navLinks: [
            { label: 'Finance Dashboard', path: '/accountant/dashboard' },
            { label: 'Patient Billing', path: '/cashier/billing' }
        ],
        isSystemRole: false
    },
    {
        name: 'Billing',
        description: 'Dedicated patient billing and financial operations staff',
        permissions: [
            'billing_view', 'billing_manage', 'billing_collect_payment',
            'billing_generate_invoice', 'billing_print_invoice', 'billing_refund',
            'billing_reports', 'billing_analytics',
            'billing_insurance', 'billing_ipd_settlement', 'billing_receipt_reprint', 'billing_discounts'
        ],
        dashboardPath: '/billing/dashboard',
        navLinks: [
            { label: 'Dashboard', path: '/billing/dashboard' },
            { label: 'Patient Billing', path: '/billing/patient' },
            { label: 'Pending Payments', path: '/billing/pending' },
            { label: 'Invoices', path: '/billing/invoices' },
            { label: 'Payment History', path: '/billing/history' },
            { label: 'Refunds', path: '/billing/refunds' },
            { label: 'Revenue Reports', path: '/billing/reports' },
            { label: 'Billing Analytics', path: '/billing/analytics' },
            { label: 'Invoice Templates', path: '/billing/templates' },
            { label: 'Settings', path: '/billing/settings' }
        ],
        isSystemRole: false
    }
];

async function seedDefaultRolesForHospital(hospitalId) {
    const { syncToTenant } = require('../utils/tenantSync');
    for (const roleData of defaultRoles) {
        let role = await Role.findOne({ name: roleData.name, hospitalId });
        if (!role) {
            role = await Role.create({
                ...roleData,
                hospitalId,
                isSystemRole: false
            });
        }
        await syncToTenant('Role', role, 'save', hospitalId);
    }
}

// Create a new hospital
router.post('/', hospitalCreationLimiter, verifyCentralAdmin, auditLog('HOSPITAL_UPDATE', null, { severity: 'warning', dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { name, address, city, state, phone, email, website, logo, departments, appointmentFee, slug: customSlug } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Hospital name is required' });

        const RESERVED_SLUGS = ['api', 'admin', 'login', 'logout', 'signup', 'register', 'uploads',
            'static', 'health', 'public', 'www', 'mail', 'ftp', 'app', 'dashboard', 'root', 'support'];

        // Validate & process subdomain/slug
        const targetSlug = (customSlug || name || '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');

        if (!/^[a-z0-9-]+$/.test(targetSlug)) {
            return res.status(400).json({ success: false, message: 'Subdomain must contain lowercase letters, numbers, and hyphens only.' });
        }
        if (targetSlug.length < 3 || targetSlug.length > 60) {
            return res.status(400).json({ success: false, message: 'Subdomain must be between 3 and 60 characters long.' });
        }
        if (RESERVED_SLUGS.includes(targetSlug)) {
            return res.status(400).json({ success: false, message: `Slug "${targetSlug}" is reserved. Use a different subdomain.` });
        }
        const duplicate = await Hospital.findOne({ slug: { $regex: new RegExp(`^${targetSlug}$`, 'i') } });
        if (duplicate) {
            return res.status(400).json({ success: false, message: 'Subdomain already exists. Please choose another subdomain.' });
        }

        const slug = targetSlug;

        const hospital = new Hospital({ name, slug, address, city, state, phone, email, website, logo, departments: departments || [], appointmentFee: appointmentFee || 500 });
        await hospital.save();

        // 🏥 Seed default roles for this hospital scope in the Master DB
        await seedDefaultRolesForHospital(hospital._id);

        // 🏥 Auto-provision the hospital's isolated tenant database.
        // MongoDB only physically creates a database when a document is written to it.
        // We write a 'hospital_meta' seed document to force the DB to appear in Compass.
        try {
            const tenantConn = await getTenantConnection(String(hospital._id));
            const dbName = getTenantDbName(String(hospital._id));

            // Write a seed document — this is what forces MongoDB to create the database
            await tenantConn.db.collection('hospital_meta').insertOne({
                hospitalId: hospital._id,
                hospitalName: hospital.name,
                city: hospital.city || '',
                state: hospital.state || '',
                departments: hospital.departments || [],
                createdAt: new Date(),
                _type: 'tenant_init',
            });

            console.log(`✅ Tenant DB created and initialized with metadata: ${dbName}`);
        } catch (dbErr) {
            // Non-fatal: hospital is created, DB will be provisioned on first login
            console.warn(`⚠️  Could not pre-provision tenant DB for ${hospital.name}:`, dbErr.message);
        }

        res.status(201).json({
            success: true,
            message: 'Hospital created successfully',
            hospital,
            tenantDb: getTenantDbName(String(hospital._id))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// SUPREME ADMIN: Tenant DB Monitoring
// ==========================================

/**
 * GET /api/hospitals/tenant-status
 * Returns all active tenant database connections for the Supreme Admin dashboard.
 */
router.get('/tenant-status', verifyCentralAdmin, async (req, res) => {
    try {
        const { getActiveConnections, getTenantDbName } = require('../db/tenantDb');
        const hospitals = await Hospital.find({}, 'name city isActive tenantKey').lean();

        const activeConns = getActiveConnections();

        const report = hospitals.map(h => {
            const dbName = getTenantDbName(String(h._id), h.tenantKey);
            const connInfo = activeConns.find(c => c.dbName === dbName);
            return {
                hospitalId: h._id,
                hospitalName: h.name,
                city: h.city,
                isActive: h.isActive,
                tenantDb: dbName,
                connectionStatus: connInfo ? 'connected' : 'not-loaded',
                readyState: connInfo?.readyState ?? null,
            };
        });

        res.json({
            success: true,
            totalHospitals: hospitals.length,
            activeConnections: activeConns.length,
            report,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update a hospital
router.put('/:id', verifyCentralAdmin, auditLog('HOSPITAL_UPDATE', (req) => ({ model: 'Hospital', id: req.params.id, label: 'Hospital record updated' }), { dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const { name, address, city, state, phone, email, website, logo, isActive, departments, appointmentFee, slug, appointmentMode, customDomain } = req.body;
        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        if (name !== undefined) hospital.name = name;
        if (slug !== undefined) {
            const targetSlug = slug.toLowerCase().trim().replace(/\s+/g, '-').replace(/-+/g, '-');
            if (!/^[a-z0-9-]+$/.test(targetSlug)) {
                return res.status(400).json({ success: false, message: 'Subdomain must contain lowercase letters, numbers, and hyphens only.' });
            }
            if (targetSlug.length < 3 || targetSlug.length > 60) {
                return res.status(400).json({ success: false, message: 'Subdomain must be between 3 and 60 characters long.' });
            }
            const RESERVED_SLUGS = ['api', 'admin', 'login', 'logout', 'signup', 'register', 'uploads',
                'static', 'health', 'public', 'www', 'mail', 'ftp', 'app', 'dashboard', 'root', 'support'];
            if (RESERVED_SLUGS.includes(targetSlug)) {
                return res.status(400).json({ success: false, message: `Slug "${targetSlug}" is reserved. Use a different subdomain.` });
            }
            const duplicate = await Hospital.findOne({ slug: { $regex: new RegExp(`^${targetSlug}$`, 'i') }, _id: { $ne: req.params.id } });
            if (duplicate) {
                return res.status(400).json({ success: false, message: 'Subdomain already exists. Please choose another subdomain.' });
            }
            hospital.slug = targetSlug;
        }
        if (customDomain !== undefined) {
            // strip protocol, trailing slash, and leading www.
            let clean = customDomain ? customDomain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase() : null;
            if (clean && clean.startsWith('www.')) {
                clean = clean.slice(4);
            }
            hospital.customDomain = clean;
        }
        if (address !== undefined) hospital.address = address;
        if (city !== undefined) hospital.city = city;
        if (state !== undefined) hospital.state = state;
        if (phone !== undefined) hospital.phone = phone;
        if (email !== undefined) hospital.email = email;
        if (website !== undefined) hospital.website = website;
        if (logo !== undefined) hospital.logo = logo;
        if (isActive !== undefined) hospital.isActive = isActive;
        if (departments !== undefined) hospital.departments = departments;
        if (appointmentFee !== undefined) hospital.appointmentFee = appointmentFee;
        if (appointmentMode !== undefined && ['slot', 'token'].includes(appointmentMode)) hospital.appointmentMode = appointmentMode;

        await hospital.save();
        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('Hospital', hospital, 'save', hospital._id);
        res.json({ success: true, message: 'Hospital updated successfully', hospital });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// APPOINTMENT MODE — Supreme Admin sets per hospital
// GET /api/hospitals/:id/next-token?doctorId=X&date=YYYY-MM-DD
// Returns the next available token number for a doctor on a given date
// ==========================================
router.get('/:id/next-token', verifyToken, async (req, res) => {
    try {
        const { doctorId, date } = req.query;
        if (!doctorId || !date) {
            return res.status(400).json({ success: false, message: 'doctorId and date are required' });
        }

        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
        if (hospital.appointmentMode !== 'token') {
            return res.json({ success: true, mode: 'slot', nextToken: null });
        }

        // Count non-cancelled appointments for this doctor on this date
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const count = await Appointment.countDocuments({
            doctorId,
            hospitalId: req.params.id,
            appointmentDate: { $gte: startOfDay, $lte: endOfDay },
            status: { $ne: 'cancelled' }
        });

        res.json({ success: true, mode: 'token', nextToken: count + 1 });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Delete a hospital and ALL related data (cascade delete)
router.delete('/:id', verifyCentralAdmin, auditLog('HOSPITAL_UPDATE', (req) => ({ model: 'Hospital', id: req.params.id, label: 'Hospital deleted' }), { severity: 'critical', dataCategory: 'Administrative' }), async (req, res) => {
    try {
        const hospitalId = req.params.id;
        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        const deletionLog = {};

        // 1. Delete all related data from master DB (all collections with hospitalId)
        const masterDeletions = await Promise.all([
            Appointment.deleteMany({ hospitalId }).then(r => deletionLog.appointments = r.deletedCount),
            Doctor.deleteMany({ hospitalId }).then(r => deletionLog.doctors = r.deletedCount),
            Lab.deleteMany({ hospitalId }).then(r => deletionLog.labs = r.deletedCount),
            Pharmacy.deleteMany({ hospitalId }).then(r => deletionLog.pharmacies = r.deletedCount),
            Reception.deleteMany({ hospitalId }).then(r => deletionLog.receptions = r.deletedCount),
            Inventory.deleteMany({ hospitalId }).then(r => deletionLog.inventory = r.deletedCount),
            Role.deleteMany({ hospitalId }).then(r => deletionLog.roles = r.deletedCount),
            FacilityCharge.deleteMany({ hospitalId }).then(r => deletionLog.facilityCharges = r.deletedCount),
            QuestionLibrary.deleteMany({ hospitalId }).then(r => deletionLog.questionLibraries = r.deletedCount),
            User.deleteMany({ hospitalId }).then(r => deletionLog.users = r.deletedCount),
        ]);

        // 2. Drop the tenant database entirely and clean up connection cache
        try {
            const tenantConn = await getTenantConnection(String(hospitalId));
            await tenantConn.db.dropDatabase();
            console.log(`🗑️  Dropped tenant DB for hospital: ${hospital.name}`);
            await removeTenantConnection(String(hospitalId));
            deletionLog.tenantDbDropped = true;
        } catch (dbErr) {
            console.warn(`⚠️  Could not drop tenant DB for ${hospital.name}:`, dbErr.message);
            deletionLog.tenantDbDropped = false;
        }

        // 3. Delete the hospital record itself
        await Hospital.findByIdAndDelete(hospitalId);

        console.log(`🏥 Hospital "${hospital.name}" fully deleted. Summary:`, deletionLog);

        res.json({
            success: true,
            message: `Hospital "${hospital.name}" and all related data deleted successfully.`,
            deletionLog
        });
    } catch (err) {
        console.error('Delete hospital error:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Delete a hospital admin and clear its reference in the hospital record
router.delete('/:id/admin', verifyCentralAdmin, async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        if (hospital.adminUserId) {
            // Delete the hospital admin user account
            await User.findByIdAndDelete(hospital.adminUserId);
            hospital.adminUserId = null;
            await hospital.save();
        }

        res.json({ success: true, message: 'Hospital admin deleted successfully' });
    } catch (err) {
        console.error('Delete hospital admin error:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// HOSPITAL ADMIN AUTH
// ==========================================

// Hospital Admin Signup (creates a hospitaladmin account) — Central Admin only
router.post('/admin/signup', verifyCentralAdmin, async (req, res) => {
    try {
        const { name, email, password, phone, hospitalId } = req.body;

        if (!name || !email || !password || !hospitalId) {
            return res.status(400).json({ success: false, message: 'Name, email, password, and hospitalId are required' });
        }
        const pwErrH = validatePassword(password);
        if (pwErrH) return res.status(400).json({ success: false, message: pwErrH });

        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });

        // Seed all default roles for this hospital to ensure they are present
        await seedDefaultRolesForHospital(hospitalId);

        // Find the seeded Admin Role for this hospital
        let adminRole = await Role.findOne({
            hospitalId,
            name: { $regex: /^Admin$/i }
        });

        if (!adminRole) {
            // Fallback (should never happen since seedDefaultRolesForHospital seeds it)
            adminRole = new Role({
                name: `Admin`,
                description: `Hospital admin with full management access`,
                permissions: [
                    'admin_manage_roles', 'admin_view_stats',
                    'patient_search', 'patient_view', 'patient_edit',
                    'lab_view', 'lab_manage',
                    'pharmacy_view', 'pharmacy_manage',
                    'visit_intake', 'clinical_history_view'
                ],
                dashboardPath: '/admin',
                navLinks: [
                    { label: 'Dashboard', path: '/admin' },
                    { label: 'Users', path: '/admin/users' },
                    { label: 'Doctors', path: '/admin/doctors' },
                    { label: 'Labs', path: '/admin/labs' },
                    { label: 'Pharmacy', path: '/admin/pharmacy' },
                    { label: 'Reception', path: '/admin/reception' },
                    { label: 'Services', path: '/admin/services' },
                    { label: 'Roles', path: '/admin/roles' }
                ],
                hospitalId,
                isSystemRole: false
            });
            await adminRole.save();
        }

        const admin = new User({
            name, email, password, phone: phone || '',
            role: adminRole._id,
            hospitalId
        });

        await admin.save();

        // Sync hospital admin user to tenant DB
        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('User', admin, 'save', hospitalId);

        // Link hospital admin to hospital record
        hospital.adminUserId = admin._id;
        await hospital.save();

        res.status(201).json({
            success: true,
            message: 'Hospital Admin created successfully',
            user: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: adminRole.name,
                hospitalId,
                hospitalName: hospital.name
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Hospital Admin Login — dedicated endpoint
router.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

        const normalizedEmail = String(email || '').toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        // Helper: write AuditLog to the tenant DB of the given hospitalId (or master DB if not resolvable)
        const writeAuditLog = async (hospitalId, payload) => {
            try {
                let AuditLogModel = require('../models/auditLog.model');
                if (hospitalId) {
                    try {
                        const tenantDb = await getTenantConnection(String(hospitalId));
                        if (tenantDb) {
                            AuditLogModel = getTenantModels(tenantDb).AuditLog;
                        }
                    } catch (_) {}
                }
                await AuditLogModel.create(payload);
            } catch (_) {}
        };

        if (!user) {
            await writeAuditLog(null, {
                clinicId: new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
                userName: normalizedEmail,
                action: 'FAILED_LOGIN',
                severity: 'warning',
                success: false,
                reason: 'User not found',
                ip: req.ip || '',
                userAgent: req.headers['user-agent'] || ''
            });
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Only allow hospitaladmin role or a proper Administrator Role document
        let roleData = null;
        let roleName = null;
        if (user.role === 'hospitaladmin') {
            roleName = 'hospitaladmin';
            roleData = {
                name: 'hospitaladmin',
                permissions: ['admin_manage_roles', 'admin_view_stats'],
                dashboardPath: '/hospitaladmin',
                navLinks: []
            };
        } else if (mongoose.Types.ObjectId.isValid(user.role)) {
            roleData = await Role.findById(user.role);
            if (roleData) {
                roleName = roleData.name;
            }
        } else if (user.role) {
            // Fallback lookup by string
            roleData = await Role.findOne({ name: { $regex: new RegExp(`^${user.role}$`, 'i') } });
            if (roleData) {
                roleName = roleData.name;
            }
        }

        const isAllowed = roleName === 'hospitaladmin' || (roleName && ['administrator', 'admin'].includes(roleName.toLowerCase()));
        if (!isAllowed) {
            await writeAuditLog(user.hospitalId, {
                clinicId: user.hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
                userId: user._id,
                userName: user.name || normalizedEmail,
                role: roleName || '',
                action: 'FAILED_LOGIN',
                severity: 'warning',
                success: false,
                reason: 'This login is for Hospital Admins only.',
                ip: req.ip || '',
                userAgent: req.headers['user-agent'] || ''
            });
            return res.status(403).json({ success: false, message: 'This login is for Hospital Admins only.' });
        }

        if (!user.hospitalId) {
            await writeAuditLog(null, {
                clinicId: new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
                userId: user._id,
                userName: user.name || normalizedEmail,
                role: roleName,
                action: 'FAILED_LOGIN',
                severity: 'warning',
                success: false,
                reason: 'Account not linked to any hospital.',
                ip: req.ip || '',
                userAgent: req.headers['user-agent'] || ''
            });
            return res.status(403).json({ success: false, message: 'This account is not linked to any hospital. Contact your Central Admin.' });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            await writeAuditLog(user.hospitalId, {
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
            });
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const hospital = await Hospital.findById(user.hospitalId);
        if (!hospital) {
            await writeAuditLog(user.hospitalId, {
                clinicId: user.hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
                userId: user._id,
                userName: user.name || normalizedEmail,
                role: roleName,
                action: 'FAILED_LOGIN',
                severity: 'warning',
                success: false,
                reason: 'Linked hospital not found',
                ip: req.ip || '',
                userAgent: req.headers['user-agent'] || ''
            });
            return res.status(403).json({ success: false, message: 'Linked hospital not found. Contact your Central Admin.' });
        }

        if (!hospital.isActive) {
            await writeAuditLog(user.hospitalId, {
                clinicId: user.hospitalId,
                userId: user._id,
                userName: user.name || normalizedEmail,
                role: roleName,
                action: 'FAILED_LOGIN',
                severity: 'warning',
                success: false,
                reason: 'Hospital account is inactive',
                ip: req.ip || '',
                userAgent: req.headers['user-agent'] || ''
            });
            return res.status(403).json({ success: false, message: 'Hospital account is inactive. Contact your Central Admin.' });
        }

        const hosp = await Hospital.findById(user.hospitalId).select('tenantKey slug');
        const tenantKey = hosp?.tenantKey || null;
        const subdomain = hosp?.slug || null;

        const { v4: uuidv4 } = require('uuid');
        const jti = uuidv4();
        // Embed hospitalId in the JWT so all downstream middleware can scope data
        const token = jwt.sign(
            {
                jti,
                userId: user._id,
                email: user.email,
                roleId: String(user.role),
                hospitalId: String(user.hospitalId),   // ← scoped in token
                tenantKey,
                subdomain
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Audit successful hospital admin login — write to tenant DB
        await writeAuditLog(user.hospitalId, {
            clinicId: user.hospitalId,
            userId: user._id,
            userName: user.name || normalizedEmail,
            role: roleName,
            action: 'STAFF_LOGIN',
            success: true,
            sessionId: jti,
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: roleName,
                permissions: roleData.permissions || [],
                dashboardPath: roleData.dashboardPath || '/hospitaladmin',
                navLinks: roleData.navLinks || [],
                hospitalId: user.hospitalId,
                hospitalName: hospital.name
            },
            token
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Get my hospital info (for hospital admins)
router.get('/my-hospital', verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        if (req.user.role === 'centraladmin' || req.user.role === 'superadmin') {
            return res.json({ success: true, hospital: null, message: 'Central admin manages all hospitals' });
        }

        const hospital = req.user.hospitalId
            ? await Hospital.findById(req.user.hospitalId)
            : null;

        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        // Fetch facilities from the new Facility collection in Tenant DB
        const { Facility } = getModels(req);
        const facilities = await Facility.find({ hospitalId: hospital._id }).lean();

        // Convert hospital to a plain object and attach facilities
        const hospitalObj = hospital.toObject();
        hospitalObj.facilities = facilities;

        res.json({ success: true, hospital: hospitalObj });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update facilities (Hospital admin specific feature)
router.put('/my-hospital/facilities', verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        if (req.user.role === 'centraladmin' || req.user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: 'Only hospital admins manage their facilities this way' });
        }
        
        const { facilities } = req.body;
        if (!facilities) return res.status(400).json({ success: false, message: 'Facilities data required' });

        const hospital = await Hospital.findById(req.user.hospitalId);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        // Update the new Facility collection in Tenant DB
        const { Facility } = getModels(req);

        // 1. Delete all existing facilities for this hospital
        await Facility.deleteMany({ hospitalId: hospital._id });

        // 2. Insert new facilities
        const newFacilities = facilities.map(f => ({
            hospitalId: hospital._id,
            name: f.name,
            pricePerDay: Number(f.pricePerDay),
            bedCount: Number(f.bedCount || 0)
        }));

        let insertedFacilities = [];
        if (newFacilities.length > 0) {
            insertedFacilities = await Facility.insertMany(newFacilities);
        }

        // 3. For backward compatibility, update the embedded facilities in the hospital doc too
        hospital.facilities = facilities;
        await hospital.save();

        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('Hospital', hospital, 'save', hospital._id);

        // Return the updated hospital object with the facilities from the collection (which includes _ids)
        const hospitalObj = hospital.toObject();
        hospitalObj.facilities = insertedFacilities;

        res.json({ success: true, message: 'Facilities updated successfully', hospital: hospitalObj });
    } catch (err) {
        console.error('Update facilities error:', err);
        res.status(500).json({ success: false, message: err.message || 'An internal error occurred' });
    }
});

// Update department fees (Hospital admin specific feature)
router.put('/my-hospital/department-fees', verifyHospitalAdmin, async (req, res) => {
    try {
        if (req.user.role === 'centraladmin' || req.user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: 'Only hospital admins manage their department fees this way' });
        }
        
        const { departmentFees } = req.body;
        if (!departmentFees || typeof departmentFees !== 'object') {
            return res.status(400).json({ success: false, message: 'Department fees data required' });
        }

        const hospital = await Hospital.findById(req.user.hospitalId);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        hospital.departmentFees = departmentFees;
        await hospital.save();

        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('Hospital', hospital, 'save', hospital._id);

        res.json({ success: true, message: 'Department fees updated successfully', hospital });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// HOSPITAL INVENTORY MANAGEMENT
// Hospital admins manage their own medicine inventory
// ==========================================

// Helper: resolve tenant Inventory model for the current hospital admin
const getInventoryModel = async (hospitalId) => {
    if (!hospitalId) return Inventory;
    try {
        const tenantDb = await getTenantConnection(String(hospitalId));
        if (tenantDb) return getTenantModels(tenantDb).Inventory;
    } catch (_) {}
    return Inventory;
};

// GET hospital inventory
router.get('/my-hospital/inventory', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital linked to this account' });

        const InventoryModel = await getInventoryModel(hospitalId);
        const items = await InventoryModel.find({ hospitalId }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, data: items });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ADD inventory item
router.post('/my-hospital/inventory', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital linked to this account' });

        const InventoryModel = await getInventoryModel(hospitalId);
        const item = new InventoryModel({ ...req.body, hospitalId });
        await item.save();
        res.status(201).json({ success: true, data: item });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// UPDATE inventory item
router.put('/my-hospital/inventory/:id', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const InventoryModel = await getInventoryModel(hospitalId);
        const item = await InventoryModel.findOne({ _id: req.params.id, hospitalId });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        const allowed = ['name', 'salt', 'category', 'stock', 'unit', 'buyingPrice', 'sellingPrice', 'vendor', 'batchNumber', 'expiryDate'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) item[field] = req.body[field];
        });

        await item.save(); // triggers status hook
        res.json({ success: true, data: item });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// DELETE inventory item
router.delete('/my-hospital/inventory/:id', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const InventoryModel = await getInventoryModel(hospitalId);
        const deleted = await InventoryModel.findOneAndDelete({ _id: req.params.id, hospitalId });
        if (!deleted) return res.status(404).json({ success: false, message: 'Item not found' });
        res.json({ success: true, message: 'Item deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// HOSPITAL LAB TEST PRICING
// Hospital admins set their own lab test prices
// ==========================================

// GET lab tests with hospital prices (global + hospital-specific)
router.get('/my-hospital/lab-tests', verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        const { LabTest } = getModels(req);
        const isTenant = !!req.tenantDb;
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital linked' });

        const hid = hospitalId.toString();
        let query = { isActive: true };
        if (!isTenant) {
            query.$or = [{ hospitalId: null }, { hospitalId: hospitalId }];
        }

        const tests = await LabTest.find(query).sort({ name: 1 }).lean();

        tests.forEach(t => {
            if (isTenant) {
                t.hospitalPrice = t.price;
                t.effectivePrice = t.price;
                t.isOwnTest = true;
            } else {
                const hp = t.hospitalPrices && t.hospitalPrices[hid];
                t.hospitalPrice = hp !== undefined ? hp : null;
                t.effectivePrice = hp !== undefined ? hp : t.price;
                t.isOwnTest = t.hospitalId ? t.hospitalId.toString() === hid : false;
            }
        });
        res.json({ success: true, data: tests });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// SET hospital-specific lab test price
router.put('/my-hospital/lab-tests/:testId/price', verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        const { LabTest } = getModels(req);
        const isTenant = !!req.tenantDb;
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital linked' });

        const { price } = req.body;
        const test = await LabTest.findById(req.params.testId);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        if (isTenant) {
            test.price = Number(price);
            test.hospitalPrices = test.hospitalPrices || new Map();
            test.hospitalPrices.set(hospitalId.toString(), Number(price));
        } else {
            if (price === null || price === undefined || price === '') {
                test.hospitalPrices.delete(hospitalId.toString());
            } else {
                test.hospitalPrices.set(hospitalId.toString(), Number(price));
            }
        }
        await test.save();
        res.json({ success: true, message: 'Price updated', data: test });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// HOSPITAL STATS (Central & Hospital Admins)
// Full hospital analytics dashboard
// ==========================================
router.get('/:id/stats', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.params.id;
        const { startDate, endDate } = req.query;

        if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
            return res.status(400).json({ success: false, message: 'Invalid hospital ID' });
        }

        // Security check for hospital admins
        if (req.user.role === 'hospitaladmin' && String(req.user.hospitalId) !== hospitalId) {
            return res.status(403).json({ success: false, message: 'Unauthorized to view stats for this hospital' });
        }

        const hospital = await Hospital.findById(hospitalId).populate('adminUserId', 'name email');
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        // Resolve models from tenant DB to enforce multi-tenant isolation
        let Appointment, Doctor, Lab, Pharmacy, LabReport, PharmacyOrder, RoleModel;
        try {
            const tenantDb = await getTenantConnection(String(hospitalId));
            if (tenantDb) {
                const tm = getTenantModels(tenantDb);
                Appointment = tm.Appointment;
                Doctor = tm.Doctor;
                Lab = tm.Lab;
                Pharmacy = tm.Pharmacy;
                LabReport = tm.LabReport;
                PharmacyOrder = tm.PharmacyOrder;
                RoleModel = tm.Role;
            }
        } catch (_) {}
        // Fallback to master models (should not occur in cloud mode)
        if (!Appointment) Appointment = require('../models/appointment.model');
        if (!Doctor)      Doctor      = require('../models/doctor.model');
        if (!Lab)         Lab         = require('../models/lab.model');
        if (!Pharmacy)    Pharmacy    = require('../models/pharmacy.model');
        if (!LabReport)   LabReport   = require('../models/labReport.model');
        if (!PharmacyOrder) PharmacyOrder = require('../models/pharmacyOrder.model');
        if (!RoleModel)   RoleModel   = require('../models/role.model');
        const Role = RoleModel;

        // Date filter construction
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.appointmentDate = {};
            if (startDate) dateFilter.appointmentDate.$gte = new Date(startDate);
            if (endDate) dateFilter.appointmentDate.$lte = new Date(endDate);
        }

        let createdDateFilter = {};
        if (startDate || endDate) {
            createdDateFilter.createdAt = {};
            if (startDate) createdDateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) createdDateFilter.createdAt.$lte = new Date(endDate);
        }

        // 1. Staff counts (all non-patient users linked to this hospital)
        const patientRole = await Role.findOne({ name: { $regex: /^patient$/i } });
        const patientRoleId = patientRole ? patientRole._id : null;

        const totalStaff = await User.countDocuments({
            hospitalId,
            role: { $nin: ['centraladmin', 'superadmin', 'hospitaladmin', patientRoleId].filter(Boolean) },
            patientId: { $exists: false }
        });

        // Staff by role
        const staffByRole = await User.aggregate([
            {
                $match: {
                    hospitalId: new mongoose.Types.ObjectId(hospitalId),
                    role: { $nin: ['centraladmin', 'superadmin', 'hospitaladmin'] },
                    patientId: { $exists: false }
                }
            },
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        // Resolve role names for staff breakdown
        const resolvedBreakdown = await Promise.all(staffByRole.map(async (item) => {
            let name = String(item._id);
            if (mongoose.Types.ObjectId.isValid(item._id)) {
                const r = await Role.findById(item._id);
                if (r) name = r.name;
            }
            return { role: name, count: item.count };
        }));

        // Filter out unresolved roles (raw 24-character ObjectIDs)
        const staffBreakdown = resolvedBreakdown.filter(
            (item) => !/^[0-9a-fA-F]{24}$/.test(item.role)
        );

        // 2. Doctor count
        const doctorCount = await Doctor.countDocuments({ hospitalId });

        // 3. Lab count
        const labCount = await Lab.countDocuments({ hospitalId });

        // 4. Pharmacy count
        const pharmacyCount = await Pharmacy.countDocuments({ hospitalId });

        // 5. Patients - unique patients seen by doctors in this hospital (filtered by date if applicable)
        const doctorIds = await Doctor.find({ hospitalId }).select('_id doctorId userId');
        const doctorObjectIds = doctorIds.map(d => d._id); // Doctor model _ids (used in Appointment.doctorId)
        const doctorUserIds = doctorIds.map(d => d.userId).filter(Boolean); // User model _ids (used in LabReport.doctorId, PharmacyOrder.doctorId)

        const uniquePatientIds = await Appointment.distinct('userId', {
            doctorId: { $in: doctorObjectIds },
            ...dateFilter
        });
        const totalPatients = uniquePatientIds.length;

        // 6. Appointments stats (query by hospitalId OR doctors linked to the hospital)
        const appointmentMatch = {
            $or: [
                { hospitalId: new mongoose.Types.ObjectId(hospitalId) },
                { doctorId: { $in: doctorObjectIds } }
            ]
        };

        const totalAppointments = await Appointment.countDocuments({
            ...appointmentMatch,
            ...dateFilter
        });

        const completedAppointments = await Appointment.countDocuments({
            ...appointmentMatch,
            status: 'completed',
            ...dateFilter
        });

        const pendingAppointments = await Appointment.countDocuments({
            ...appointmentMatch,
            status: { $in: ['pending', 'confirmed'] },
            ...dateFilter
        });

        // 7. Revenue — from all cash collections (Appointments, Pharmacy, Labs)
        let CollectionTransaction = null;
        try {
            if (tenantDb) {
                CollectionTransaction = getTenantModels(tenantDb).CollectionTransaction;
            }
        } catch (_) {}
        if (!CollectionTransaction) CollectionTransaction = require('../models/collectionTransaction.model');

        const txMatch = {
            hospitalId: new mongoose.Types.ObjectId(hospitalId)
        };
        if (startDate || endDate) {
            txMatch.collectionTimestamp = {};
            if (startDate) txMatch.collectionTimestamp.$gte = new Date(startDate);
            if (endDate) txMatch.collectionTimestamp.$lte = new Date(endDate);
        }

        const revenueData = await CollectionTransaction.aggregate([
            { $match: txMatch },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$amount' }
                }
            }
        ]);
        const totalRevenue = revenueData[0]?.totalRevenue || 0;

        // Monthly revenue (always last 6 months regardless of date filter, to keep chart consistent)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyRevenue = await CollectionTransaction.aggregate([
            {
                $match: {
                    hospitalId: new mongoose.Types.ObjectId(hospitalId),
                    collectionTimestamp: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$collectionTimestamp' },
                        month: { $month: '$collectionTimestamp' }
                    },
                    revenue: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // 8. Lab reports (doctorId on LabReport is User._id, not Doctor._id)
        const labReportCount = await LabReport.countDocuments({
            doctorId: { $in: doctorUserIds },
            ...createdDateFilter
        });
        const pendingLabReports = await LabReport.countDocuments({
            doctorId: { $in: doctorUserIds },
            reportStatus: 'PENDING',
            ...createdDateFilter
        });

        // 9. Pharmacy orders (doctorId on PharmacyOrder is User._id, not Doctor._id)
        const pharmacyOrderCount = await PharmacyOrder.countDocuments({
            doctorId: { $in: doctorUserIds },
            ...createdDateFilter
        });

        // 10. Recent appointments (last 10 within filter)
        const recentAppointments = await Appointment.find({
            doctorId: { $in: doctorObjectIds },
            ...dateFilter
        })
            .populate('userId', 'name patientId phone')
            .populate('doctorId', 'name specialty')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // 11. All staff list (excluding patients)
        const staffList = await User.find({
            hospitalId,
            role: { $nin: ['centraladmin', 'superadmin', 'hospitaladmin'] },
            patientId: { $exists: false }
        }, { password: 0 })
            .sort({ createdAt: -1 })
            .lean();

        // Resolve role names for staff list
        const staffWithRoles = await Promise.all(staffList.map(async (u) => {
            let roleName = String(u.role);
            if (mongoose.Types.ObjectId.isValid(u.role)) {
                const r = await Role.findById(u.role);
                if (r) roleName = r.name;
            }
            return { ...u, roleName };
        }));

        // Filter out patients and unresolved role IDs from staff list
        const actualStaff = staffWithRoles.filter(u =>
            !['patient'].includes(u.roleName?.toLowerCase()) &&
            !/^[0-9a-fA-F]{24}$/.test(u.roleName) &&
            !u.patientId
        );

        res.json({
            success: true,
            hospital: {
                ...hospital.toObject(),
                adminName: hospital.adminUserId?.name || null,
                adminEmail: hospital.adminUserId?.email || null
            },
            stats: {
                // Staff
                totalStaff,
                doctorCount,
                labCount,
                pharmacyCount,
                staffBreakdown,
                // Patients
                totalPatients,
                // Appointments
                totalAppointments,
                completedAppointments,
                pendingAppointments,
                // Revenue
                totalRevenue,
                monthlyRevenue,
                // Lab & Pharmacy
                labReportCount,
                pendingLabReports,
                pharmacyOrderCount
            },
            recentAppointments,
            staffList: actualStaff
        });
    } catch (err) {
        console.error('Hospital stats error:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});


// ==========================================
// WHITE-LABEL BRANDING (Central Admin)
// ==========================================

/**
 * GET /api/hospitals/:id/branding — PUBLIC (no auth)
 * Returns the branding config for a hospital (for theming login pages)
 */
router.get('/:id/branding', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id, 'name branding logo slug city').lean();
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
        res.json({ success: true, branding: hospital.branding || {}, hospitalName: hospital.name, logo: hospital.logo });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

/**
 * PUT /api/hospitals/:id/branding — Central Admin only
 * Save / update the white-label branding config for a hospital
 */
router.put('/:id/branding', verifyCentralAdmin, async (req, res) => {
    try {
        const {
            appName, tagline, logoUrl, faviconUrl,
            primaryColor, secondaryColor, accentColor, successColor,
            backgroundColor, textColor,
            supportEmail, supportPhone, address,
            websiteUrl, instagramUrl, facebookUrl, twitterUrl,
            footerText
        } = req.body;

        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        // Merge branding fields (only update what is provided)
        const branding = hospital.branding || {};
        if (appName    !== undefined) branding.appName    = appName;
        if (tagline    !== undefined) branding.tagline    = tagline;
        if (logoUrl    !== undefined) branding.logoUrl    = logoUrl;
        if (faviconUrl !== undefined) branding.faviconUrl = faviconUrl;
        if (primaryColor    !== undefined) branding.primaryColor    = primaryColor;
        if (secondaryColor  !== undefined) branding.secondaryColor  = secondaryColor;
        if (accentColor     !== undefined) branding.accentColor     = accentColor;
        if (successColor    !== undefined) branding.successColor    = successColor;
        if (backgroundColor !== undefined) branding.backgroundColor = backgroundColor;
        if (textColor       !== undefined) branding.textColor       = textColor;
        if (supportEmail !== undefined) branding.supportEmail = supportEmail;
        if (supportPhone !== undefined) branding.supportPhone = supportPhone;
        if (address      !== undefined) branding.address      = address;
        if (websiteUrl   !== undefined) branding.websiteUrl   = websiteUrl;
        if (instagramUrl !== undefined) branding.instagramUrl = instagramUrl;
        if (facebookUrl  !== undefined) branding.facebookUrl  = facebookUrl;
        if (twitterUrl   !== undefined) branding.twitterUrl   = twitterUrl;
        if (footerText   !== undefined) branding.footerText   = footerText;

        hospital.branding = branding;
        hospital.markModified('branding');
        await hospital.save();
        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('Hospital', hospital, 'save', hospital._id);

        // Emit socket event for real-time UI updates
        const io = req.app.get('io');
        if (io) {
            io.emit('branding_update', { hospitalId: hospital._id, branding: hospital.branding });
        }

        res.json({ success: true, message: 'Branding updated successfully', branding: hospital.branding });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
module.exports.verifyCentralAdmin = verifyCentralAdmin;
module.exports.verifyHospitalAdmin = verifyHospitalAdmin;

