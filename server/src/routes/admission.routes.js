const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const MasterAdmission = require('../models/admission.model');
const { getTenantModels } = require('../db/tenantModels');

// Admission access: reception, accountant, admin
const verifyAdmissionAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase();
            const perms = req.user._roleData?.permissions || [];
            const allowed = ['reception', 'receptionist', 'accountant', 'cashier', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin'];

            if (allowed.includes(roleName) ||
                perms.includes('billing_manage') ||
                perms.includes('admission_manage') ||
                perms.includes('appointment_manage') ||
                perms.includes('*')) {
                await resolveTenant(req, res, next);
            } else {
                return res.status(403).json({ success: false, message: 'Admission access required' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

const getAdmission = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb).Admission;
    return MasterAdmission;
};

// POST /api/admissions — Admit a patient (receptionist)
router.post('/', verifyAdmissionAccess, async (req, res) => {
    try {
        const { patientId, appointmentId, ward, bedNumber, selectedFacilities = [], admissionDate, notes, patientName, patientPhone, requestedDepartment, priority } = req.body;
        if (!patientId) return res.status(400).json({ success: false, message: 'patientId is required' });

        const hospitalId = req.hospitalId || req.user.hospitalId;

        const Admission = getAdmission(req);

        // Bed occupancy check
        if (ward && bedNumber) {
            const occupied = await Admission.findOne({
                hospitalId,
                status: 'Admitted',
                ward: { $regex: new RegExp('^' + ward.trim() + '$', 'i') },
                bedNumber: { $regex: new RegExp('^' + bedNumber.trim() + '$', 'i') }
            });
            if (occupied) {
                return res.status(400).json({
                    success: false,
                    message: `Bed ${bedNumber} in ${ward} is already occupied by ${occupied.patientName || 'another patient'}.`
                });
            }
        }

        const totalAmount = selectedFacilities.reduce((sum, f) => sum + (Number(f.pricePerDay) * Number(f.days)), 0);

        // If patientName not provided, try to fetch it from the DB
        let resolvedName = patientName || '';
        let resolvedPhone = patientPhone || '';
        if (!resolvedName) {
            try {
                const { User } = require('../db/tenantModels').getTenantModels(req.tenantDb);
                const user = await User.findById(patientId).select('name phone').lean();
                if (user) { resolvedName = user.name || ''; resolvedPhone = user.phone || ''; }
            } catch (e) { /* fallback: name stays empty */ }
        }

        const admission = new Admission({
            hospitalId,
            patientId,
            patientName: resolvedName,
            patientPhone: resolvedPhone,
            appointmentId: appointmentId || undefined,
            admittedBy: req.user._id || req.user.userId,
            admissionDate: admissionDate ? new Date(admissionDate) : new Date(),
            ward,
            bedNumber,
            requestedDepartment: requestedDepartment || '',
            priority: priority || 'Normal',
            selectedFacilities: selectedFacilities.map(f => ({
                facilityName: f.facilityName,
                pricePerDay: Number(f.pricePerDay),
                days: Number(f.days),
                totalAmount: Number(f.pricePerDay) * Number(f.days),
            })),
            totalAmount,
            dailyWardCharge: Number(req.body.dailyWardCharge) || 0,
            status: (ward && bedNumber) ? 'Admitted' : 'Pending Allocation',
            notes,
        });

        await admission.save();

        const io = req.app.get('io');
        if (io) {
            io.to('receptionist').emit('admission_created', admission);
            io.to('reception').emit('admission_created', admission);
        }

        res.status(201).json({ success: true, message: 'Patient admitted successfully', admission });
    } catch (err) {
        console.error('[POST /admissions] Error:', err.message);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// GET /api/admissions/active — All currently admitted patients
router.get('/active', verifyAdmissionAccess, async (req, res) => {
    try {
        const Admission = getAdmission(req);
        const User = require('../models/user.model'); // Master DB User model

        const admissions = await Admission.find({
            hospitalId: req.hospitalId || req.user.hospitalId,
        })
            .sort({ admissionDate: -1 })
            .lean();

        // Populate patientId manually from Master DB User model
        const patientIds = admissions.map(a => a.patientId).filter(Boolean);
        const users = await User.find({ _id: { $in: patientIds } })
            .select('name phone patientId mrn firstName lastName')
            .lean();

        const userMap = {};
        users.forEach(u => {
            userMap[u._id.toString()] = u;
        });

        const populatedAdmissions = admissions.map(adm => {
            const pIdStr = adm.patientId ? adm.patientId.toString() : '';
            return {
                ...adm,
                patientId: userMap[pIdStr] || null
            };
        });

        res.json({ success: true, admissions: populatedAdmissions });
    } catch (err) {
        console.error('[GET /active] Error:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// GET /api/admissions/patient/:patientId — Admission history for a patient
router.get('/patient/:patientId', verifyAdmissionAccess, async (req, res) => {
    try {
        const Admission = getAdmission(req);
        const admissions = await Admission.find({
            patientId: req.params.patientId,
            hospitalId: req.hospitalId || req.user.hospitalId,
        }).sort({ admissionDate: -1 }).lean();

        res.json({ success: true, admissions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// PUT /api/admissions/:id — Update ward, bed, notes, admissionDate
router.put('/:id', verifyAdmissionAccess, async (req, res) => {
    try {
        const { ward, bedNumber, notes, admissionDate } = req.body;
        const Admission = getAdmission(req);

        // Find the current admission first
        const currentAdmission = await Admission.findById(req.params.id);
        if (!currentAdmission) return res.status(404).json({ success: false, message: 'Admission not found' });

        const updateFields = {};
        if (notes !== undefined) updateFields.notes = notes;
        if (admissionDate) {
            const parsedDate = new Date(admissionDate);
            if (!isNaN(parsedDate.getTime())) updateFields.admissionDate = parsedDate;
        }

        const targetWard = ward !== undefined ? ward : currentAdmission.ward;
        const targetBed = bedNumber !== undefined ? bedNumber : currentAdmission.bedNumber;

        if (req.body.dailyWardCharge !== undefined) updateFields.dailyWardCharge = Number(req.body.dailyWardCharge) || 0;
        if (ward !== undefined) updateFields.ward = ward;
        if (bedNumber !== undefined) updateFields.bedNumber = bedNumber;

        // Validation for duplicate bed allocation
        if (targetWard && targetBed) {
            const occupied = await Admission.findOne({
                hospitalId: currentAdmission.hospitalId,
                status: 'Admitted',
                ward: { $regex: new RegExp('^' + targetWard.trim() + '$', 'i') },
                bedNumber: { $regex: new RegExp('^' + targetBed.trim() + '$', 'i') },
                _id: { $ne: currentAdmission._id }
            });
            if (occupied) {
                return res.status(400).json({
                    success: false,
                    message: `Bed ${targetBed} in ${targetWard} is already occupied by ${occupied.patientName || 'another patient'}.`
                });
            }

            // Transition from Pending Allocation to Admitted
            if (currentAdmission.status === 'Pending Allocation') {
                updateFields.status = 'Admitted';
            }
        } else {
            // If cleared/missing, status goes back to Pending Allocation (if not discharged)
            if (currentAdmission.status !== 'Discharged') {
                updateFields.status = 'Pending Allocation';
            }
        }

        const admission = await Admission.findByIdAndUpdate(
            req.params.id,
            { $set: updateFields },
            { new: true, runValidators: false }
        ).lean();

        const io = req.app.get('io');
        if (io) {
            io.to('receptionist').emit('admission_updated', admission);
            io.to('reception').emit('admission_updated', admission);
        }

        res.json({ success: true, message: 'Admission updated', admission });
    } catch (err) {
        console.error('[PUT /admissions/:id] Error:', err.message, err.stack);
        res.status(500).json({ success: false, message: err.message || 'Failed to update admission' });
    }
});

// PUT /api/admissions/:id/discharge — Discharge a patient
router.put('/:id/discharge', verifyAdmissionAccess, async (req, res) => {
    try {
        const { dischargeDate, notes, overrideDues } = req.body;
        const Admission = getAdmission(req);
        
        const admissionCheck = await Admission.findById(req.params.id);
        if (!admissionCheck) return res.status(404).json({ success: false, message: 'Admission not found' });

        const patientId = admissionCheck.patientId;
        const hospitalId = admissionCheck.hospitalId;

        // Verify outstanding dues
        const { getTenantModels } = require('../db/tenantModels');
        const models = req.tenantDb ? getTenantModels(req.tenantDb) : {
            Appointment: require('../models/appointment.model'),
            LabReport: require('../models/labReport.model'),
            PharmacyOrder: require('../models/pharmacyOrder.model'),
            FacilityCharge: require('../models/facilityCharge.model'),
            Invoice: require('../models/invoice.model'),
            BillingActivityLog: require('../models/billingActivityLog.model'),
            User: require('../models/user.model')
        };

        const patientObj = await models.User.findById(patientId).select('patientId mrn name phone');
        const patientIdStr = patientObj ? (patientObj.patientId || patientObj.mrn) : '';

        const [appointments, labReports, pharmacyOrders, facilityCharges, invoices] = await Promise.all([
            models.Appointment.find({
                $or: [
                    { userId: patientId },
                    ...(patientIdStr ? [{ patientId: patientIdStr }] : [])
                ],
                paymentStatus: 'Pending',
                hospitalId
            }).lean(),
            models.LabReport.find({
                $or: [
                    { userId: patientId },
                    ...(patientIdStr ? [{ patientId: patientIdStr }] : [])
                ],
                status: { $in: ['Sample Collected', 'In Testing', 'Report Ready', 'Completed'] },
                paymentStatus: { $in: ['PENDING', 'Pending'] },
                hospitalId
            }).lean(),
            models.PharmacyOrder.find({
                $or: [
                    { userId: patientId },
                    ...(patientIdStr ? [{ patientId: patientIdStr }] : [])
                ],
                orderStatus: 'Completed',
                paymentStatus: { $in: ['Pending', 'Unpaid'] },
                hospitalId
            }).lean(),
            models.FacilityCharge.find({ patientId, paymentStatus: { $in: ['Pending', 'Unpaid'] }, hospitalId }).lean(),
            models.Invoice.find({ patientId, paymentStatus: { $in: ['Pending', 'Partially Paid'] }, hospitalId }).lean()
        ]);

        let hasDues = false;
        let duesBreakdown = [];

        if (appointments.length > 0) {
            hasDues = true;
            duesBreakdown.push(`${appointments.length} Pending Consultation(s)`);
        }
        if (labReports.length > 0) {
            hasDues = true;
            duesBreakdown.push(`${labReports.length} Pending Lab Report(s)`);
        }
        if (pharmacyOrders.length > 0) {
            hasDues = true;
            duesBreakdown.push(`${pharmacyOrders.length} Pending Pharmacy Order(s)`);
        }
        if (facilityCharges.length > 0) {
            hasDues = true;
            duesBreakdown.push(`${facilityCharges.length} Pending Facility Charge(s)`);
        }
        if (invoices.length > 0) {
            hasDues = true;
            duesBreakdown.push(`${invoices.length} Unpaid Invoice(s)`);
        }

        if (hasDues && !overrideDues) {
            return res.status(400).json({
                success: false,
                hasDues: true,
                message: `Patient has pending hospital dues: ${duesBreakdown.join(', ')}.`,
                duesBreakdown
            });
        }

        if (hasDues && overrideDues) {
            const patientObj = await models.User.findById(patientId).select('name');
            const patientName = patientObj ? patientObj.name : 'Unknown';
            await new models.BillingActivityLog({
                hospitalId,
                performedBy: req.user._id,
                performedByName: req.user.name || 'Staff',
                action: 'Override Approved',
                patientId,
                patientName,
                details: `Authorized discharge override with pending dues: ${duesBreakdown.join(', ')}`
            }).save();
        }

        const admission = await Admission.findByIdAndUpdate(
            req.params.id,
            {
                status: 'Discharged',
                dischargeDate: dischargeDate ? new Date(dischargeDate) : new Date(),
                ...(notes && { notes }),
            },
            { new: true }
        ).lean();

        const io = req.app.get('io');
        if (io) {
            io.to('receptionist').emit('admission_discharged', admission);
            io.to('reception').emit('admission_discharged', admission);
        }

        res.json({ success: true, message: 'Patient discharged successfully', admission });
    } catch (err) {
        console.error('Discharge error:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// PUT /api/admissions/:id/pay — Mark admission as paid
router.put('/:id/pay', verifyAdmissionAccess, async (req, res) => {
    try {
        const Admission = getAdmission(req);
        const admission = await Admission.findByIdAndUpdate(
            req.params.id,
            { paymentStatus: 'Paid' },
            { new: true }
        );
        if (!admission) return res.status(404).json({ success: false, message: 'Admission not found' });
        res.json({ success: true, message: 'Admission marked as paid', admission });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
