const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
/**
 * /api/clinic — Dedicated routes for simple clinics (clinicType = 'clinic')
 * Uses ClinicPatient model (separate from User/staff).
 * All data is scoped to req.user.hospitalId.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const validateFileType = require('../utils/validateFileType');
const Hospital = require('../models/clinic.model');
const Appointment = require('../models/appointment.model');
const Inventory = require('../models/inventory.model');
const PharmacyOrder = require('../models/pharmacyOrder.model');
const ClinicPatient = require('../models/clinicPatient.model');
const ClinicSubscription = require('../models/clinicSubscription.model');
const TreatmentPlan = require('../models/treatmentPlan.model');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');

const getModels = (req) => {
    const ClinicSubscription = require('../models/clinicSubscription.model');
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return {
            Hospital: require('../models/clinic.model'),
            Appointment: m.Appointment,
            Inventory: m.Inventory,
            PharmacyOrder: m.PharmacyOrder,
            ClinicPatient: m.ClinicPatient,
            ClinicSubscription: ClinicSubscription,
            TreatmentPlan: m.TreatmentPlan,
            Notification: m.Notification,
            User: m.User,
            Doctor: m.Doctor,
            Reception: m.Reception
        };
    }
    return {
        Hospital: require('../models/clinic.model'),
        Appointment: require('../models/appointment.model'),
        Inventory: require('../models/inventory.model'),
        PharmacyOrder: require('../models/pharmacyOrder.model'),
        ClinicPatient: require('../models/clinicPatient.model'),
        ClinicSubscription: ClinicSubscription,
        TreatmentPlan: require('../models/treatmentPlan.model'),
        Notification: require('../models/notification.model'),
        User: require('../models/user.model'),
        Doctor: require('../models/doctor.model'),
        Reception: require('../models/reception.model')
    };
};

// ─── Report upload configuration ─────────────────────────────────────────────
const reportsDir = path.join(__dirname, '../../uploads/patient-reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

const reportStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, reportsDir),
    filename:    (_req, file, cb) => {
        const safe = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'report-' + safe + path.extname(file.originalname));
    },
});
const uploadReport = multer({
    storage: reportStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (_req, file, cb) => {
        const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype);
        cb(ok ? null : new Error('Only PDF and images are allowed'), ok);
    },
});

// ─────────────────────────────────────────────
// Middleware: must be hospitaladmin of a clinic
// ─────────────────────────────────────────────
const verifyClinicAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            if (req.user.role !== 'hospitaladmin' && req.user.role !== 'clinicadmin') {
                return res.status(403).json({ success: false, message: 'Clinic admin access required' });
            }
            if (!req.user.hospitalId) {
                return res.status(403).json({ success: false, message: 'No clinic assigned to your account' });
            }
            await resolveTenant(req, res, () => {
                req.models = getModels(req);
                next();
            });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

const hid = (req) => new mongoose.Types.ObjectId(req.user.hospitalId.toString());

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const todayRange = () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end   = new Date(); end.setHours(23, 59, 59, 999);
    return { start, end };
};

// Get or ensure clinic code (fallback if not set)
const getClinicCode = async (req, hospitalId) => {
    const { Hospital } = req.models || getModels(req);
    const clinic = await Hospital.findById(hospitalId).select('clinicCode name');
    if (clinic.clinicCode) return clinic.clinicCode;
    const code = clinic.name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'CLN';
    await Hospital.findByIdAndUpdate(hospitalId, { clinicCode: code });
    return code;
};

// Upsert subscription record and increment new patient count
const trackNewPatient = async (req, clinicId) => {
    const { trackNewPatient: tracker } = require('../utils/subscriptionTracker');
    await tracker(req, clinicId);
};

// ─────────────────────────────────────────────
// STATS — GET /api/clinic/stats
// ─────────────────────────────────────────────
router.get('/stats', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const hospitalId = hid(req);
        const { start: today, end: todayEnd } = todayRange();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const [
            totalPatients,
            todayPatients,
            totalAppointments,
            todayAppointments,
            completedAppointments,
            pendingAppointments,
            revenueAgg,
            todayRevenueAgg,
            monthRevenueAgg,
            recentAppointments,
            lowStockItems,
            planRevenueAgg,
            planTodayRevenueAgg,
            planMonthRevenueAgg,
        ] = await Promise.all([
            ClinicPatient.countDocuments({ clinicId: hospitalId }),
            ClinicPatient.countDocuments({ clinicId: hospitalId, createdAt: { $gte: today } }),
            Appointment.countDocuments({ hospitalId }),
            Appointment.countDocuments({ hospitalId, appointmentDate: { $gte: today, $lte: todayEnd } }),
            Appointment.countDocuments({ hospitalId, status: 'completed' }),
            Appointment.countDocuments({ hospitalId, status: { $in: ['pending', 'confirmed'] } }),
            Appointment.aggregate([
                { $match: { hospitalId, paymentStatus: 'paid' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.aggregate([
                { $match: { hospitalId, paymentStatus: 'paid', appointmentDate: { $gte: today, $lte: todayEnd } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.aggregate([
                { $match: { hospitalId, paymentStatus: 'paid', createdAt: { $gte: firstOfMonth } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.find({ hospitalId })
                .populate('clinicPatientId', 'name phone patientUid')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            Inventory.find({ hospitalId, stock: { $lt: 10 } }).select('name stock unit').limit(5).lean(),
            // Treatment plan revenue — sum of all amountPaid across visits
            TreatmentPlan.aggregate([
                { $match: { hospitalId } },
                { $unwind: '$visits' },
                { $group: { _id: null, total: { $sum: '$visits.amountPaid' } } }
            ]),
            TreatmentPlan.aggregate([
                { $match: { hospitalId } },
                { $unwind: '$visits' },
                { $match: { 'visits.completedAt': { $gte: today, $lte: todayEnd } } },
                { $group: { _id: null, total: { $sum: '$visits.amountPaid' } } }
            ]),
            TreatmentPlan.aggregate([
                { $match: { hospitalId, createdAt: { $gte: firstOfMonth } } },
                { $unwind: '$visits' },
                { $group: { _id: null, total: { $sum: '$visits.amountPaid' } } }
            ]),
        ]);

        // Monthly revenue trend (last 6 months) — appointments + treatment plans combined
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const [apptTrend, planTrend] = await Promise.all([
            Appointment.aggregate([
                { $match: { hospitalId, paymentStatus: 'paid', createdAt: { $gte: sixMonthsAgo } } },
                { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
            TreatmentPlan.aggregate([
                { $match: { hospitalId, createdAt: { $gte: sixMonthsAgo } } },
                { $unwind: '$visits' },
                { $match: { 'visits.amountPaid': { $gt: 0 } } },
                { $group: { _id: { month: { $month: '$visits.completedAt' }, year: { $year: '$visits.completedAt' } }, revenue: { $sum: '$visits.amountPaid' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
        ]);
        // Merge the two trend arrays by month/year key
        const trendMap = {};
        for (const t of apptTrend) {
            const key = `${t._id.year}-${t._id.month}`;
            trendMap[key] = { ...t, revenue: t.revenue };
        }
        for (const t of planTrend) {
            if (!t._id.month) continue; // skip if completedAt was null
            const key = `${t._id.year}-${t._id.month}`;
            if (trendMap[key]) trendMap[key].revenue += t.revenue;
            else trendMap[key] = { _id: t._id, revenue: t.revenue, count: 0 };
        }
        const monthlyTrend = Object.values(trendMap).sort((a, b) =>
            a._id.year !== b._id.year ? a._id.year - b._id.year : a._id.month - b._id.month
        );

        const apptRevenue      = revenueAgg[0]?.total || 0;
        const apptTodayRevenue = todayRevenueAgg[0]?.total || 0;
        const apptMonthRevenue = monthRevenueAgg[0]?.total || 0;
        const planRevenue      = planRevenueAgg[0]?.total || 0;
        const planTodayRevenue = planTodayRevenueAgg[0]?.total || 0;
        const planMonthRevenue = planMonthRevenueAgg[0]?.total || 0;

        // Total pending balance across all active plans
        const pendingPlansAgg = await TreatmentPlan.aggregate([
            { $match: { hospitalId, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$pendingBalance' } } }
        ]);
        const treatmentPlanPending = pendingPlansAgg[0]?.total || 0;

        res.json({
            success: true,
            stats: {
                totalPatients,
                todayPatients,
                totalAppointments,
                todayAppointments,
                completedAppointments,
                pendingAppointments,
                totalRevenue:          apptRevenue + planRevenue,
                todayRevenue:          apptTodayRevenue + planTodayRevenue,
                monthRevenue:          apptMonthRevenue + planMonthRevenue,
                treatmentPlanRevenue:  planRevenue,
                treatmentPlanPending,
                recentAppointments,
                lowStockItems,
                monthlyTrend,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// LIST PATIENTS — GET /api/clinic/patients
// ─────────────────────────────────────────────
router.get('/patients', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { search } = req.query;
        const query = { clinicId: hid(req), isActive: true };

        if (search && search.trim().length >= 1) {
            const s = search.trim();
            query.$or = [
                { name:       { $regex: `^${s}`, $options: 'i' } },
                { phone:      { $regex: s, $options: 'i' } },
                { patientUid: { $regex: `^${s}`, $options: 'i' } },
            ];
        }

        const patients = await ClinicPatient.find(query)
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        res.json({ success: true, patients });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// REGISTER PATIENT — POST /api/clinic/patients
// ─────────────────────────────────────────────
router.post('/patients', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { name, phone, email, age, gender, address, bloodGroup, allergies, chronicConditions, relatives } = req.body;
        if (!name || !phone) return res.status(400).json({ success: false, message: 'Name and phone are required' });

        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length !== 10) return res.status(400).json({ success: false, message: 'Phone must be exactly 10 digits' });

        const clinicId = hid(req);

        // Duplicate check within this clinic
        const existing = await ClinicPatient.findOne({ clinicId, phone: cleanPhone });
        if (existing) {
            return res.status(200).json({ success: true, patient: existing, existing: true, message: `Patient already registered — ${existing.patientUid}` });
        }

        // Clinic-scoped patient UID: e.g. "RAM-001"
        const code  = await getClinicCode(req, clinicId);
        const count = await ClinicPatient.countDocuments({ clinicId });
        const patientUid = `${code}-${String(count + 1).padStart(3, '0')}`;

        const cleanRelatives = Array.isArray(relatives)
            ? relatives.filter(r => r.name?.trim() || r.phone?.trim()).map(r => ({
                name: (r.name || '').trim(),
                relation: (r.relation || '').trim(),
                phone: (r.phone || '').trim(),
            }))
            : [];

        const patient = await ClinicPatient.create({
            clinicId,
            patientUid,
            name: name.trim(),
            phone: cleanPhone,
            email: email || '',
            age: age ? Number(age) : null,
            gender: gender || 'Male',
            bloodGroup: bloodGroup || '',
            address: address || '',
            allergies: allergies || '',
            chronicConditions: chronicConditions || '',
            relatives: cleanRelatives,
        });

        // Track in subscription (non-blocking)
        trackNewPatient(req, clinicId);

        res.status(201).json({ success: true, patient, message: `Patient registered — ${patientUid}` });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'A patient with this phone already exists in this clinic' });
        }
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// PATIENT HISTORY — GET /api/clinic/patients/:id/history
// ─────────────────────────────────────────────
router.get('/patients/:id/history', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const patient = await ClinicPatient.findOne({ _id: req.params.id, clinicId: hid(req) }).lean();
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const appointments = await Appointment.find({ clinicPatientId: patient._id, hospitalId: hid(req) })
            .sort({ appointmentDate: -1 })
            .lean();

        res.json({ success: true, patient, appointments });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// UPDATE PATIENT — PUT /api/clinic/patients/:id
// ─────────────────────────────────────────────
router.put('/patients/:id', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { name, email, age, gender, address, bloodGroup, allergies, chronicConditions, medicalNotes, relatives } = req.body;
        const updateData = { name, email, age: age ? Number(age) : null, gender, address, bloodGroup, allergies, chronicConditions, medicalNotes };
        if (Array.isArray(relatives)) {
            updateData.relatives = relatives.filter(r => r.name?.trim() || r.phone?.trim()).map(r => ({
                name: (r.name || '').trim(),
                relation: (r.relation || '').trim(),
                phone: (r.phone || '').trim(),
            }));
        }
        const patient = await ClinicPatient.findOneAndUpdate(
            { _id: req.params.id, clinicId: hid(req) },
            updateData,
            { new: true, runValidators: true }
        );
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
        res.json({ success: true, patient });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// UPLOAD REPORT — POST /api/clinic/patients/:id/reports
// ─────────────────────────────────────────────
router.post('/patients/:id/reports', verifyClinicAdmin, uploadReport.single('report'), async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const typeErr = await validateFileType(req.file, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
        if (typeErr) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
            return res.status(400).json({ success: false, message: typeErr });
        }

        const patient = await ClinicPatient.findOne({ _id: req.params.id, clinicId: hid(req) });
        if (!patient) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }
        const reportName = req.body.name?.trim() || req.file.originalname;
        const entry = { name: reportName, filename: req.file.filename, mimetype: req.file.mimetype };
        patient.reports.push(entry);
        await patient.save();
        res.json({ success: true, report: patient.reports[patient.reports.length - 1], message: 'Report uploaded' });
    } catch (err) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        console.error('[upload-report]', err.message);
        res.status(500).json({ success: false, message: 'Failed to upload report. Please try again.' });
    }
});

// ─────────────────────────────────────────────
// DELETE REPORT — DELETE /api/clinic/patients/:id/reports/:reportId
// ─────────────────────────────────────────────
router.delete('/patients/:id/reports/:reportId', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const patient = await ClinicPatient.findOne({ _id: req.params.id, clinicId: hid(req) });
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
        const report = patient.reports.id(req.params.reportId);
        if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
        const filePath = path.join(reportsDir, report.filename);
        patient.reports.pull(req.params.reportId);
        await patient.save();
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true, message: 'Report deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// LIST APPOINTMENTS — GET /api/clinic/appointments
// ─────────────────────────────────────────────
router.get('/appointments', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { date, status } = req.query;
        const query = { hospitalId: hid(req) };

        if (date) {
            const d = new Date(date); d.setHours(0, 0, 0, 0);
            const e = new Date(date); e.setHours(23, 59, 59, 999);
            query.appointmentDate = { $gte: d, $lte: e };
        }
        if (status) query.status = status;

        // Determine sort order based on clinic's appointment mode
        const clinicForSort = await Hospital.findById(hid(req)).select('appointmentMode').lean();
        const sortOrder = (clinicForSort?.appointmentMode || 'token') === 'slot'
            ? { appointmentTime: 1, createdAt: -1 }
            : { tokenNumber: 1, createdAt: -1 };

        const appointments = await Appointment.find(query)
            .populate('clinicPatientId', 'name phone patientUid gender bloodGroup')
            .sort(sortOrder)
            .lean();

        res.json({ success: true, appointments });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// CLINIC CONFIG — GET /api/clinic/config
// Returns appointmentMode and basic clinic info
// ─────────────────────────────────────────────
router.get('/config', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const clinic = await Hospital.findById(hid(req)).select('appointmentMode name clinicCode defaultFee defaultServiceName appointmentFee').lean();
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });
        res.json({
            success: true,
            appointmentMode: clinic.appointmentMode || 'token',
            name: clinic.name,
            clinicCode: clinic.clinicCode,
            defaultFee: clinic.defaultFee || clinic.appointmentFee || 0,
            defaultServiceName: clinic.defaultServiceName || 'General Consultation',
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// CLINIC CONFIG — PUT /api/clinic/config
// Hospital admin sets default fee / service name
// ─────────────────────────────────────────────
router.put('/config', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { defaultFee, defaultServiceName, appointmentMode } = req.body;
        const update = {};

        if (defaultFee !== undefined) {
            const fee = Number(defaultFee);
            if (isNaN(fee) || fee < 0) return res.status(400).json({ success: false, message: 'defaultFee must be a non-negative number' });
            update.defaultFee = fee;
        }
        if (defaultServiceName !== undefined) {
            const svc = String(defaultServiceName).trim().slice(0, 100);
            if (!svc) return res.status(400).json({ success: false, message: 'defaultServiceName cannot be empty' });
            update.defaultServiceName = svc;
        }
        if (appointmentMode !== undefined) {
            if (!['slot', 'token'].includes(appointmentMode)) return res.status(400).json({ success: false, message: 'appointmentMode must be slot or token' });
            update.appointmentMode = appointmentMode;
        }

        if (Object.keys(update).length === 0) return res.status(400).json({ success: false, message: 'No valid fields to update' });

        const clinic = await Hospital.findByIdAndUpdate(hid(req), { $set: update }, { new: true })
            .select('appointmentMode name clinicCode defaultFee defaultServiceName').lean();
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });

        res.json({
            success: true,
            message: 'Clinic config updated',
            appointmentMode: clinic.appointmentMode || 'token',
            name: clinic.name,
            clinicCode: clinic.clinicCode,
            defaultFee: clinic.defaultFee ?? 0,
            defaultServiceName: clinic.defaultServiceName || 'General Consultation',
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// LIST DOCTORS — GET /api/clinic/doctors
// ─────────────────────────────────────────────
router.get('/doctors', verifyClinicAdmin, async (req, res) => {
    try {
        const { Doctor } = req.models;
        const doctors = await Doctor.find({ hospitalId: hid(req) }).select('name userId doctorId specialty').lean();
        res.json({ success: true, doctors });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// BOOK APPOINTMENT — POST /api/clinic/appointments
// Supports both token mode and time-slot mode
// ─────────────────────────────────────────────
router.post('/appointments', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User, Doctor } = req.models;
        const { patientId, amount, notes, serviceName, appointmentTime, paymentMethod, cardRef, upiScreenshotUrl, doctorId, doctorUserId } = req.body;
        // patientId here is ClinicPatient._id
        if (!patientId) return res.status(400).json({ success: false, message: 'patientId is required' });

        // Payment must be confirmed upfront — no pending payments in clinic module
        const fee = Number(amount) || 0;
        if (fee > 0 && !paymentMethod) {
            return res.status(400).json({ success: false, message: 'Payment method is required to collect the fee and assign a token' });
        }

        const clinicId = hid(req);
        const [patient, clinic] = await Promise.all([
            ClinicPatient.findOne({ _id: patientId, clinicId }),
            Hospital.findById(clinicId).select('appointmentMode defaultFee defaultServiceName').lean(),
        ]);
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        // Resolve the doctor present in this clinic
        let targetDoctor = null;
        if (doctorId) {
            targetDoctor = await Doctor.findOne({ _id: doctorId });
        } else if (doctorUserId) {
            targetDoctor = await Doctor.findOne({ userId: doctorUserId });
        } else {
            targetDoctor = await Doctor.findOne({ hospitalId: clinicId });
        }

        const isTokenMode = (clinic?.appointmentMode || 'token') === 'token';
        let tokenNumber = null;
        let finalTime = '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        if (isTokenMode) {
            // Token mode: assign next sequential token for today
            const count = await Appointment.countDocuments({
                hospitalId: clinicId,
                appointmentDate: { $gte: today, $lte: todayEnd },
                status: { $ne: 'cancelled' }
            });
            tokenNumber = count + 1;
            finalTime = new Date().toTimeString().slice(0, 5);
        } else {
            // Slot mode: appointmentTime is required, check for double-booking
            if (!appointmentTime) {
                return res.status(400).json({ success: false, message: 'Appointment time is required for time-slot booking' });
            }
            const conflict = await Appointment.findOne({
                hospitalId: clinicId,
                appointmentTime,
                appointmentDate: { $gte: today, $lte: todayEnd },
                status: { $ne: 'cancelled' },
            });
            if (conflict) {
                return res.status(409).json({ success: false, message: `Time slot ${appointmentTime} is already booked for today` });
            }
            finalTime = appointmentTime;
        }

        const appointment = new Appointment({
            clinicPatientId: patient._id,
            patientId:       patient.patientUid, // display ID
            patientName:     patient.name || '',
            patientPhone:    patient.phone || '',
            patientEmail:    patient.email || '',
            patientGender:   patient.gender || '',
            parentName:      patient.parentName || '',
            parentPhone:     patient.parentPhone || '',
            hospitalId:      clinicId,
            doctorId:        targetDoctor ? targetDoctor._id : null,
            doctorUserId:    targetDoctor ? targetDoctor.userId : req.user._id,
            doctorName:      targetDoctor ? targetDoctor.name : req.user.name,
            serviceName:     serviceName || 'General Consultation',
            appointmentDate: new Date(),
            appointmentTime: finalTime,
            tokenNumber,
            status:         'confirmed',
            paymentStatus:  'paid',   // payment is always collected upfront in clinic module
            paymentMethod:  paymentMethod || (fee === 0 ? 'Free' : 'Cash'),
            amount:         fee,
            notes:          notes || '',
            bookedBy:       req.user._id,
            cardRef:        cardRef ? String(cardRef).slice(0, 50) : '',
            upiScreenshotUrl: upiScreenshotUrl ? String(upiScreenshotUrl).slice(0, 500) : '',
        });

        await appointment.save();

        const message = isTokenMode
            ? `Token #${tokenNumber} assigned to ${patient.name}`
            : `Appointment at ${finalTime} booked for ${patient.name}`;

        res.status(201).json({ success: true, appointment, message, isTokenMode });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// COMPLETE APPOINTMENT — PUT /api/clinic/appointments/:id/complete
// ─────────────────────────────────────────────
router.put('/appointments/:id/complete', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { diagnosis, notes, medicines, labTests, paymentStatus, amount, vitals } = req.body;

        const appt = await Appointment.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });

        appt.status        = 'completed';
        appt.diagnosis     = diagnosis     || appt.diagnosis;
        appt.doctorNotes   = notes         || appt.doctorNotes;
        if (vitals && typeof vitals === 'object') appt.vitals = vitals;
        if (medicines && Array.isArray(medicines)) appt.pharmacy = medicines.map(m => ({
            medicineName: m.medicineName || m.name || '',
            saltName:     m.saltName || '',
            frequency:    m.frequency || m.dose || m.dosage || '',
            duration:     m.duration || m.days || '',
        }));
        if (labTests   && Array.isArray(labTests))   appt.labTests  = labTests;
        if (paymentStatus) appt.paymentStatus = paymentStatus;
        if (amount !== undefined) appt.amount = amount;

        await appt.save();

        // Create PharmacyOrder record dynamically based on prescribed medicines
        if (medicines && Array.isArray(medicines) && medicines.length > 0) {
            const medicineNames = medicines.map(m => (m.medicineName || m.name || '').trim());
            const invItems = await Inventory.find({
                hospitalId: hid(req),
                name: { $in: medicineNames.map(n => new RegExp(`^${n}$`, 'i')) }
            });
            const invMap = Object.fromEntries(invItems.map(item => [item.name.toLowerCase(), item]));

            let totalAmount = 0;
            const orderItems = medicines.map(m => {
                const name = (m.medicineName || m.name || '').trim();
                const matched = invMap[name.toLowerCase()];
                const unitPrice = matched ? (matched.sellingPrice || 0) : 0;

                // Calculate quantity based on frequency (e.g. 1-0-1 = 2 per day)
                let timesPerDay = 1;
                const freq = (m.frequency || m.dose || m.dosage || '').toLowerCase();
                if (freq.includes('-')) {
                    timesPerDay = freq.split('-').map(Number).reduce((sum, n) => sum + (n || 0), 0);
                } else if (freq.includes('tds') || freq.includes('t.d.s')) {
                    timesPerDay = 3;
                } else if (freq.includes('bd') || freq.includes('b.i.d') || freq.includes('bid')) {
                    timesPerDay = 2;
                } else if (freq.includes('od') || freq.includes('o.d') || freq.includes('od')) {
                    timesPerDay = 1;
                } else {
                    timesPerDay = Number(freq) || 1;
                }
                const durationDays = Number(m.duration || m.days) || 5;
                const quantity = timesPerDay * durationDays;
                const totalPrice = quantity * unitPrice;
                totalAmount += totalPrice;

                return {
                    medicineName: name,
                    frequency: m.frequency || m.dose || m.dosage || '',
                    duration: m.duration || m.days || '',
                    price: totalPrice,
                    unitPrice: unitPrice,
                    quantity: quantity,
                    totalPrice: totalPrice,
                    inventoryId: matched ? matched._id : null
                };
            });

            // Delete duplicate upcoming orders for this appointment
            await PharmacyOrder.deleteMany({ appointmentId: appt._id, orderStatus: { $ne: 'Completed' } });

            await PharmacyOrder.create({
                appointmentId: appt._id,
                patientId: appt.patientId || '',
                userId: appt.clinicPatientId,
                doctorId: appt.doctorUserId || req.user._id,
                hospitalId: hid(req),
                items: orderItems,
                paymentStatus: 'Pending',
                totalAmount: totalAmount,
                totalCost: 0,
                orderStatus: 'Upcoming'
            });
        }

        res.json({ success: true, appointment: appt, message: 'Appointment completed' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// PAY APPOINTMENT — PUT /api/clinic/appointments/:id/pay
// ─────────────────────────────────────────────
router.put('/appointments/:id/pay', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { paymentMethod } = req.body;
        const appt = await Appointment.findOneAndUpdate(
            { _id: req.params.id, hospitalId: hid(req) },
            { paymentStatus: 'paid', paymentMethod: paymentMethod || 'Cash' },
            { new: true }
        );
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        res.json({ success: true, appointment: appt });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// CANCEL APPOINTMENT — PUT /api/clinic/appointments/:id/cancel
// ─────────────────────────────────────────────
router.put('/appointments/:id/cancel', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const appt = await Appointment.findOneAndUpdate(
            { _id: req.params.id, hospitalId: hid(req) },
            { status: 'cancelled' },
            { new: true }
        );
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        res.json({ success: true, appointment: appt });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// INVENTORY — GET /api/clinic/inventory
// ─────────────────────────────────────────────
router.get('/inventory', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const inventory = await Inventory.find({ hospitalId: hid(req) }).sort({ name: 1 }).lean();
        res.json({ success: true, inventory });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// ADD INVENTORY — POST /api/clinic/inventory
// ─────────────────────────────────────────────
router.post('/inventory', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { name, category, unit, stock, buyingPrice, sellingPrice } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Medicine name required' });

        // Check for duplicate name in this clinic
        const existing = await Inventory.findOne({ hospitalId: hid(req), name: { $regex: `^${name.trim()}$`, $options: 'i' } });
        if (existing) return res.status(409).json({ success: false, message: `"${name}" already exists in medicine list` });

        const item = new Inventory({
            hospitalId:   hid(req),
            name:         name.trim(),
            category:     category || 'General',
            stock:        stock !== undefined ? Number(stock) : 0,
            unit:         unit     || 'Tablets',
            buyingPrice:  buyingPrice !== undefined ? Number(buyingPrice) : 0,
            sellingPrice: sellingPrice !== undefined ? Number(sellingPrice) : 0,
        });
        await item.save();
        res.status(201).json({ success: true, item });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// PUT /api/clinic/inventory/:id
router.put('/inventory/:id', verifyClinicAdmin, async (req, res) => {
    try {
        const { name, category, unit, stock, buyingPrice, sellingPrice } = req.body;
        const { Inventory } = req.models;
        
        const item = await Inventory.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!item) return res.status(404).json({ success: false, message: 'Medicine not found' });

        if (name) item.name = name.trim();
        if (category) item.category = category;
        if (unit) item.unit = unit;
        if (stock !== undefined) item.stock = Number(stock) || 0;
        if (buyingPrice !== undefined) item.buyingPrice = Number(buyingPrice) || 0;
        if (sellingPrice !== undefined) item.sellingPrice = Number(sellingPrice) || 0;

        await item.save();
        res.json({ success: true, item, message: 'Stock updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// PHARMACY ORDERS — GET /api/clinic/pharmacy-orders
// ─────────────────────────────────────────────
router.get('/pharmacy-orders', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const orders = await PharmacyOrder.find({ hospitalId: hid(req) })
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// DISPENSE PHARMACY ORDER — PUT /api/clinic/pharmacy-orders/:id/dispense
// ─────────────────────────────────────────────
router.put('/pharmacy-orders/:id/dispense', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { paymentStatus } = req.body;
        const order = await PharmacyOrder.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Deduct stock levels in Inventory
        for (const item of order.items) {
            if (item.inventoryId) {
                const inv = await Inventory.findOne({ _id: item.inventoryId, hospitalId: hid(req) });
                if (inv) {
                    inv.stock = Math.max(0, (inv.stock || 0) - (item.quantity || 0));
                    await inv.save();
                }
            } else if (item.medicineName) {
                const inv = await Inventory.findOne({ name: { $regex: `^${item.medicineName.trim()}$`, $options: 'i' }, hospitalId: hid(req) });
                if (inv) {
                    inv.stock = Math.max(0, (inv.stock || 0) - (item.quantity || 0));
                    await inv.save();
                }
            }
        }

        order.orderStatus = 'Completed';
        if (paymentStatus) {
            order.paymentStatus = paymentStatus;
        }
        await order.save();

        res.json({ success: true, order, message: 'Medicines dispensed and stock levels updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ══════════════════════════════════════════════════════════
// TREATMENT PLANS
// ══════════════════════════════════════════════════════════

// CREATE treatment plan
router.post('/treatment-plans', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { clinicPatientId, title, description, totalDurationDays, totalAmount, visits } = req.body;
        if (!clinicPatientId || !title || !visits || !visits.length) {
            return res.status(400).json({ success: false, message: 'Patient, title and at least one visit are required.' });
        }
        if (!totalAmount || Number(totalAmount) <= 0) {
            return res.status(400).json({ success: false, message: 'Total treatment amount is required.' });
        }

        const processedVisits = visits.map((v, i) => ({
            visitNumber: i + 1,
            scheduledDate: new Date(v.scheduledDate),
            scheduledTime: v.scheduledTime || '',
            procedure: v.procedure || '',
            amountPaid: 0,
            status: 'scheduled',
            alertSent: false,
        }));

        const amount = Number(totalAmount);
        const plan = await TreatmentPlan.create({
            hospitalId: hid(req),
            clinicPatientId,
            createdBy: req.user.id,
            title,
            description: description || '',
            totalDurationDays: Number(totalDurationDays) || 0,
            visits: processedVisits,
            totalAmount: amount,
            pendingBalance: amount,
            totalPaid: 0,
            status: 'active',
        });

        await plan.populate('clinicPatientId', 'name patientUid phone');
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// LIST all treatment plans for hospital
router.get('/treatment-plans', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const plans = await TreatmentPlan.find({ hospitalId: hid(req) })
            .populate('clinicPatientId', 'name patientUid phone gender')
            .sort({ createdAt: -1 });
        res.json({ success: true, plans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// TODAY'S DUE VISITS — also fires notifications (call this on dashboard load)
router.get('/treatment-plans/today-due', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { start, end } = todayRange();
        const plans = await TreatmentPlan.find({
            hospitalId: hid(req),
            status: 'active',
            'visits.scheduledDate': { $gte: start, $lte: end },
            'visits.status': 'scheduled',
        }).populate('clinicPatientId', 'name patientUid phone');

        // Fire notifications for un-alerted visits
        const io = req.app.get('io');
        for (const plan of plans) {
            for (const visit of plan.visits) {
                const vDate = new Date(visit.scheduledDate);
                const isToday = vDate >= start && vDate <= end;
                if (isToday && visit.status === 'scheduled' && !visit.alertSent) {
                    const patName = plan.clinicPatientId?.name || 'Patient';
                    const notif = await Notification.create({
                        senderId: req.user.id,
                        hospitalId: hid(req),
                        recipientRole: 'hospitaladmin',
                        message: `📅 ${patName} — Visit ${visit.visitNumber} of "${plan.title}" is due today${visit.scheduledTime ? ' at ' + visit.scheduledTime : ''}.`,
                        status: 'Unread',
                        referenceType: 'TreatmentPlan',
                        referenceId: plan._id,
                        patientId: (plan.clinicPatientId?.patientUid || plan.clinicPatientId?._id || 'N/A').toString(),
                    });
                    if (io) io.to('hospitaladmin').emit('new_notification', notif);
                    visit.alertSent = true;
                }
            }
            await plan.save();
        }

        res.json({ success: true, plans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// GET single plan
router.get('/treatment-plans/:id', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const plan = await TreatmentPlan.findOne({ _id: req.params.id, hospitalId: hid(req) })
            .populate('clinicPatientId', 'name patientUid phone gender age');
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// RECORD PAYMENT for a visit (optional, any amount)
router.put('/treatment-plans/:id/visits/:visitId/pay', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { amountPaid, paymentMethod, notes } = req.body;
        const plan = await TreatmentPlan.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

        const visit = plan.visits.id(req.params.visitId);
        if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });

        visit.amountPaid = Number(amountPaid) || 0;
        visit.paymentMethod = paymentMethod || 'Cash';
        if (notes) visit.notes = notes;

        // Recalculate plan totals — pendingBalance = totalAmount - sum of all payments
        plan.totalPaid = plan.visits.reduce((s, v) => s + (v.amountPaid || 0), 0);
        plan.pendingBalance = Math.max(0, plan.totalAmount - plan.totalPaid);

        await plan.save();
        await plan.populate('clinicPatientId', 'name patientUid phone gender');
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// COMPLETE a visit
router.put('/treatment-plans/:id/visits/:visitId/complete', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const { notes } = req.body;
        const plan = await TreatmentPlan.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

        const visit = plan.visits.id(req.params.visitId);
        if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });

        // Check if this is the last remaining scheduled visit
        const remainingScheduled = plan.visits.filter(v => v.status === 'scheduled' && v._id.toString() !== visit._id.toString());
        const isLastVisit = remainingScheduled.length === 0;

        // Block closing if last visit and balance still pending
        if (isLastVisit && plan.pendingBalance > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot close treatment — ₹${plan.pendingBalance.toLocaleString('en-IN')} is still pending. Collect full payment before closing the last visit.`
            });
        }

        visit.status = 'completed';
        visit.completedAt = new Date();
        if (notes) visit.notes = notes;

        // If all visits done, complete the plan
        const allDone = plan.visits.every(v => v.status === 'completed' || v.status === 'missed');
        if (allDone) plan.status = 'completed';

        await plan.save();
        await plan.populate('clinicPatientId', 'name patientUid phone gender');
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// MARK visit as missed
router.put('/treatment-plans/:id/visits/:visitId/miss', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const plan = await TreatmentPlan.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

        const visit = plan.visits.id(req.params.visitId);
        if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });

        visit.status = 'missed';
        // pendingBalance unchanged — it reflects totalAmount - totalPaid regardless of which visits were missed
        await plan.save();
        await plan.populate('clinicPatientId', 'name patientUid phone gender');
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// CANCEL plan
router.put('/treatment-plans/:id/cancel', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User } = req.models;
        const plan = await TreatmentPlan.findOneAndUpdate(
            { _id: req.params.id, hospitalId: hid(req) },
            { status: 'cancelled' },
            { new: true }
        ).populate('clinicPatientId', 'name patientUid phone');
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// GET /api/clinic/doctors
// Returns doctors registered in this clinic
router.get('/doctors', verifyClinicAdmin, async (req, res) => {
    try {
        const { Doctor } = req.models;
        const doctors = await Doctor.find({ hospitalId: hid(req) }).select('name userId doctorId specialty').lean();
        res.json({ success: true, doctors });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ─────────────────────────────────────────────
// CLINIC STAFF — GET /api/clinic/staff
router.get('/staff', verifyClinicAdmin, async (req, res) => {
    try {
        const { Hospital, Appointment, Inventory, PharmacyOrder, ClinicPatient, ClinicSubscription, TreatmentPlan, Notification, User, Doctor } = req.models;
        const STAFF_ROLES_LEGACY = ['doctor', 'receptionist'];
        const Role = require('../models/role.model');
        const roleIds = await Role.find({
            hospitalId: hid(req),
            name: { $in: STAFF_ROLES_LEGACY.map(r => new RegExp(`^${r}$`, 'i')) }
        }).select('_id name').lean();
        const roleIdSet = roleIds.map(r => r._id);

        const staff = await User.find({
            hospitalId: hid(req),
            $or: [
                { role: { $in: STAFF_ROLES_LEGACY } },
                { role: { $in: roleIdSet } },
            ],
        }).select('name email phone role createdAt gender designation').lean();

        const roleMap = Object.fromEntries(roleIds.map(r => [String(r._id), r.name]));
        const enriched = await Promise.all(staff.map(async (s) => {
            const roleName = roleMap[String(s.role)] || String(s.role);
            let details = {};
            if (roleName.toLowerCase() === 'doctor') {
                const doc = await Doctor.findOne({ userId: s._id }).select('specialty experience education consultationFee gender').lean();
                if (doc) {
                    details = {
                        specialty: doc.specialty,
                        experience: doc.experience,
                        education: doc.education,
                        consultationFee: doc.consultationFee,
                        gender: doc.gender || s.gender
                    };
                }
            }
            return {
                ...s,
                roleName,
                ...details
            };
        }));

        res.json({ success: true, staff: enriched });
    } catch (err) {
        console.error('[Get Staff Error]', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// POST /api/clinic/staff
router.post('/staff', verifyClinicAdmin, async (req, res) => {
    try {
        const { name, phone, role, specialty, experience, education, gender, designation } = req.body;
        if (!name || !role) return res.status(400).json({ success: false, message: 'Name and role are required' });
        
        const staffRole = role === 'receptionist' ? 'receptionist' : 'doctor';
        const clinicId = hid(req);

        const Clinic = require('../models/clinic.model');
        const clinic = await Clinic.findOne({ _id: clinicId });
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });

        // Tier limit check
        const maxForRole = staffRole === 'doctor'
            ? (clinic.tier?.maxDoctors       || 1)
            : (clinic.tier?.maxReceptionists || 1);

        const { User, Doctor, Reception } = req.models;
        const currentCount = await User.countDocuments({ hospitalId: clinicId, role: staffRole });
        if (currentCount >= maxForRole) {
            return res.status(400).json({
                success: false,
                message: `Tier limit reached: max ${maxForRole} ${staffRole}(s) for this clinic. Please contact sales to upgrade.`,
            });
        }

        // Generate dummy/placeholder email and password since clinic staff don't login
        const { nanoid } = require('nanoid');
        const dummyEmail = `staff_${nanoid(10)}@clinic.local`;
        const dummyPassword = `StaffPassword_${nanoid(10)}`;

        const staffMember = new User({
            name,
            email: dummyEmail,
            password: dummyPassword,
            phone: phone || '',
            role: staffRole,
            hospitalId: clinicId,
            gender: gender || 'Male',
            designation: staffRole === 'receptionist' ? (designation || 'Receptionist') : 'Doctor',
        });
        await staffMember.save();

        let savedFee = 0;
        if (staffRole === 'doctor') {
            let doctorId = nanoid(10);
            while (await Doctor.findOne({ doctorId })) doctorId = nanoid(10);
            const defaultAvailability = {
                monday: { available: true, startTime: '09:00', endTime: '17:00' },
                tuesday: { available: true, startTime: '09:00', endTime: '17:00' },
                wednesday: { available: true, startTime: '09:00', endTime: '17:00' },
                thursday: { available: true, startTime: '09:00', endTime: '17:00' },
                friday: { available: true, startTime: '09:00', endTime: '17:00' },
                saturday: { available: true, startTime: '09:00', endTime: '17:00' },
                sunday: { available: false, startTime: '09:00', endTime: '17:00' }
            };
            savedFee = clinic.appointmentFee || 0;
            await Doctor.create({
                doctorId,
                userId: staffMember._id,
                name: staffMember.name,
                email: staffMember.email,
                phone: staffMember.phone,
                hospitalId: clinicId,
                availability: defaultAvailability,
                specialty: specialty || 'General',
                experience: experience || '',
                education: education || '',
                consultationFee: savedFee,
                gender: gender || 'Male',
                departments: [],
                services: []
            });
        } else if (staffRole === 'receptionist') {
            await Reception.create({
                userId: staffMember._id,
                hospitalId: clinicId
            });
        }

        res.status(201).json({
            success: true,
            staff: { 
                _id: staffMember._id, 
                name, 
                phone, 
                role: staffRole,
                specialty: specialty || '',
                experience: experience || '',
                education: education || '',
                consultationFee: savedFee,
                gender: gender || 'Male',
                designation: designation || ''
            },
            message: `${staffRole === 'doctor' ? 'Doctor' : 'Receptionist'} created successfully`,
        });
    } catch (err) {
        console.error('[Add Staff Error]', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// DELETE /api/clinic/staff/:id
router.delete('/staff/:id', verifyClinicAdmin, async (req, res) => {
    try {
        const clinicId = hid(req);
        const { User, Doctor, Reception, Hospital } = req.models;
        const user = await User.findOneAndDelete({ _id: req.params.id, hospitalId: clinicId });
        if (!user) return res.status(404).json({ success: false, message: 'Staff member not found' });

        if (user.role === 'doctor') {
            await Doctor.findOneAndDelete({ userId: req.params.id });
        } else if (user.role === 'receptionist') {
            await Reception.findOneAndDelete({ userId: req.params.id });
        }

        // Unlink from clinic admin if needed
        await Hospital.updateOne({ _id: clinicId, adminUserId: req.params.id }, { $set: { adminUserId: null } });

        res.json({ success: true, message: 'Staff member removed' });
    } catch (err) {
        console.error('[Delete Staff Error]', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
