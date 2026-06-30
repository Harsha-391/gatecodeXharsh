const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const auditLog = require('../middleware/audit.middleware');
const { getTenantModels } = require('../db/tenantModels');
const MasterHospitalPatient = require('../models/hospitalPatient.model');
const MasterDoctor = require('../models/doctor.model');
const { patientRegistrationLimiter } = require('../middleware/rateLimiter');

const getModels = (req) => {
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return {
            HospitalPatient: m.HospitalPatient,
            Doctor: m.Doctor
        };
    }
    return {
        HospitalPatient: MasterHospitalPatient,
        Doctor: MasterDoctor
    };
};

// SEARCH API: Identifies patient by Phone or Name — scoped to hospital tenant
router.get('/search', verifyToken, resolveTenant, auditLog('PATIENT_ACCESS', (req) => ({ model: 'HospitalPatient', label: `Patient Search Term: ${req.query.term || ''}` }), { dataCategory: 'PII' }), async (req, res) => {
    try {
        const { term } = req.query;
        if (!term || typeof term !== 'string' || term.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Search term must be at least 2 characters' });
        }

        // Escape special regex characters to prevent regex injection
        const safeTerm = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};

        const { HospitalPatient } = getModels(req);
        const patients = await HospitalPatient.find({
            ...hFilter,
            $or: [
                { phone: safeTerm },
                { patientId: safeTerm },
                { mrn: safeTerm },
                { name: { $regex: safeTerm, $options: 'i' } }
            ]
        }).select('name phone patientId mrn dob gender city').limit(50);

        res.json({ success: true, data: patients });
    } catch (error) {
        console.error('[patient-search]', error.message);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// FULL HISTORY API: Chronological Timeline — scoped to hospital tenant
router.get('/:id/full-history', verifyToken, resolveTenant, auditLog('VIEW_PATIENT', (req, body) => ({
    model: 'User',
    id: body.user?._id || req.params.id,
    label: body.user ? `${body.user.name} (${body.user.patientId || ''})` : 'Patient record',
}), { dataCategory: 'PHI' }), async (req, res) => {
    try {
        const userId = req.params.id;
        const roleData = req.user._roleData;

        const allowedRoles = ['doctor', 'nurse', 'superadmin', 'admin', 'reception', 'receptionist', 'lab', 'pharmacy', 'centraladmin', 'hospitaladmin'];
        const userRole = typeof req.user.role === 'string' ? req.user.role.toLowerCase() : '';
        const dynRole = (roleData?.name || '').toLowerCase();
        
        // Ensure that explicit permissions are checked instead of just strictly hardcoded names
        const hasPermission = (req.user.permissions || []).includes('patient_view') || 
                              (req.user.permissions || []).includes('visit_diagnose') ||
                              (req.user._roleData?.permissions || []).includes('patient_view') ||
                              (req.user._roleData?.permissions || []).includes('visit_diagnose');

        const hasAccess = allowedRoles.includes(userRole) || allowedRoles.includes(dynRole) || hasPermission;

        if (!hasAccess && userRole !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Unauthorized access to patient history' });
        }

        const isRestrictedRole = ['pharmacy', 'lab'].includes((roleData?.name || '').toLowerCase());

        const getHistoryModels = (r) => {
            if (r.tenantDb) {
                const m = getTenantModels(r.tenantDb);
                return {
                    ClinicalVisit: m.ClinicalVisit,
                    LabReport: m.LabReport,
                    PharmacyOrder: m.PharmacyOrder,
                    Appointment: m.Appointment
                };
            }
            return {
                ClinicalVisit: require('../models/clinicalVisit.model'),
                LabReport: require('../models/labReport.model'),
                PharmacyOrder: require('../models/pharmacyOrder.model'),
                Appointment: require('../models/appointment.model')
            };
        };

        const { ClinicalVisit, LabReport, PharmacyOrder, Appointment } = getHistoryModels(req);
        const { HospitalPatient } = getModels(req);

        const mongoose = require('mongoose');
        const isObjectId = mongoose.Types.ObjectId.isValid(userId) && userId.length === 24;

        // Reject obviously invalid IDs early — prevents arbitrary string lookups
        if (!isObjectId && (!/^[A-Za-z0-9_-]{3,30}$/.test(userId))) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier' });
        }

        const userQuery = isObjectId ? { _id: new mongoose.Types.ObjectId(userId) } : { patientId: userId };
        if (req.user.hospitalId) userQuery.hospitalId = req.user.hospitalId;
        const user = await HospitalPatient.findOne(userQuery).lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        const realUserId = user._id;
        const patientIdStr = user.patientId || userId;

        // HARD ISOLATION: Scope all data to the staff's hospital
        const hid = req.user.hospitalId;
        const hFilter = hid ? { hospitalId: hid } : {};

        const [visits, labs, pharmacies, appointments] = await Promise.all([
            ClinicalVisit.find({ patientId: realUserId, ...hFilter }).lean(),
            LabReport.find({ userId: realUserId, ...hFilter }).lean(),
            PharmacyOrder.find({ userId: realUserId, ...hFilter }).lean(),
            Appointment.find({ $or: [{ userId: realUserId }, { patientId: patientIdStr }], ...hFilter }).lean()
        ]);

        let timeline = [];

        visits.forEach(v => {
            let summary = {
                primaryComplaint: v.intake?.chiefComplaint || 'No complaint recorded',
                doctorSeen: v.doctorConsultation?.doctorId || 'Pending',
                outcome: v.doctorConsultation?.diagnosis?.join(', ') || 'Processing'
            };
            let item = { type: 'clinicalVisit', date: v.visitDate || v.createdAt, data: v, summary };
            if (isRestrictedRole && item.data.doctorConsultation) {
                delete item.data.doctorConsultation.clinicalNotes;
            }
            timeline.push(item);
        });

        labs.forEach(l => timeline.push({ type: 'labReport', date: l.createdAt, data: l }));
        pharmacies.forEach(p => timeline.push({ type: 'pharmacyOrder', date: p.createdAt, data: p }));
        appointments.forEach(a => timeline.push({ type: 'appointment', date: a.appointmentDate, data: a }));

        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ success: true, user, timeline });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// CREATE PATIENT API: Registrations — scoped to hospital tenant
router.post('/', verifyToken, resolveTenant, patientRegistrationLimiter, auditLog('CREATE_PATIENT', (req, body) => ({
    model: 'HospitalPatient',
    id: body.user?._id || null,
    label: body.user ? `${body.user.name} (${body.user.patientId || ''})` : 'Patient record created',
    after: body.user || null
}), { dataCategory: 'PII', severity: 'warning' }), async (req, res) => {
    try {
        const { name, email, phone, gender, dob, address, city, parentName, parentPhone, doctorId } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ success: false, message: 'Name and phone are required' });
        }
        const hospitalId = req.user.hospitalId || req.hospitalId;
        const patientId = 'MRN-' + Date.now() + Math.floor(Math.random() * 1000);
        
        const { HospitalPatient, Doctor } = getModels(req);

        let doctorName = '';
        if (doctorId) {
            const doc = await Doctor.findById(doctorId).select('name');
            if (doc) doctorName = doc.name;
        }

        const userData = {
            name,
            phone,
            email,
            gender,
            dob,
            address,
            city,
            role: 'patient',
            patientId,
            hospitalId,
            parentName: parentName || '',
            parentPhone: parentPhone || '',
            doctorId: doctorId || null,
            doctorName: doctorName
        };

        const user = new HospitalPatient(userData);
        await user.save();

        // Track in subscription (non-blocking)
        if (hospitalId) {
            const { trackNewPatient } = require('../utils/subscriptionTracker');
            trackNewPatient(req, hospitalId).catch(() => {});
        }

        res.status(201).json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// UPDATE PATIENT API: Modify demographics — scoped to hospital tenant
router.put('/:id', verifyToken, resolveTenant, auditLog('UPDATE_PATIENT', (req, body) => ({
    model: 'HospitalPatient',
    id: req.params.id,
    label: body.user ? `${body.user.name} (${body.user.patientId || ''})` : 'Patient record updated',
    before: req.oldUser || null,
    after: body.user || null
}), { dataCategory: 'PII', severity: 'warning' }), async (req, res, next) => {
    try {
        const { HospitalPatient } = getModels(req);
        const user = await HospitalPatient.findById(req.params.id).lean();
        if (user) req.oldUser = user;
    } catch (_) {}
    next();
}, async (req, res) => {
    try {
        const { name, email, phone, gender, dob, address, city, parentName, parentPhone, doctorId } = req.body;
        const hospitalId = req.user.hospitalId || req.hospitalId;

        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (phone) updateData.phone = phone;
        if (gender) updateData.gender = gender;
        if (dob) updateData.dob = dob;
        if (address) updateData.address = address;
        if (city) updateData.city = city;
        if (parentName !== undefined) updateData.parentName = parentName;
        if (parentPhone !== undefined) updateData.parentPhone = parentPhone;
        if (doctorId !== undefined) updateData.doctorId = doctorId || null;

        const { HospitalPatient } = getModels(req);
        const user = await HospitalPatient.findOneAndUpdate(
            { _id: req.params.id, hospitalId },
            { $set: updateData },
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, message: 'Patient not found' });

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE PATIENT API: Deletion — scoped to hospital tenant
router.delete('/:id', verifyToken, resolveTenant, auditLog('DELETE_PATIENT', (req, body) => ({
    model: 'HospitalPatient',
    id: req.params.id,
    label: 'Patient record deleted',
    before: req.oldUser || null
}), { dataCategory: 'PII', severity: 'critical' }), async (req, res, next) => {
    try {
        const { HospitalPatient } = getModels(req);
        const user = await HospitalPatient.findById(req.params.id).lean();
        if (user) req.oldUser = user;
    } catch (_) {}
    next();
}, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || req.hospitalId;
        const { HospitalPatient } = getModels(req);
        const user = await HospitalPatient.findOneAndDelete({ _id: req.params.id, hospitalId });
        if (!user) return res.status(404).json({ success: false, message: 'Patient not found' });

        res.json({ success: true, message: 'Patient deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;