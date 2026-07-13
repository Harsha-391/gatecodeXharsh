const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const MasterAdmission = require('../models/admission.model');
const { getTenantModels } = require('../db/tenantModels');
const auditLog = require('../middleware/audit.middleware');

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

// GET /api/admissions/beds-rooms — Get active Bed and Room resources for admission allocation
router.get('/beds-rooms', verifyAdmissionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context required' });
        }
        const { Resource } = getTenantModels(req.tenantDb);
        const resources = await Resource.find({
            hospitalId,
            isActive: true,
            type: { $in: ['Bed', 'Room'] }
        }).sort({ name: 1 });
        
        res.json({ success: true, resources });
    } catch (err) {
        console.error('[GET /beds-rooms] Error:', err.message);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// POST /api/admissions — Admit a patient (receptionist)
router.post('/', verifyAdmissionAccess, auditLog('ADMISSION_CREATED', (req, body) => ({
    model: 'Admission',
    id: body.admission?._id,
    label: `Patient Admitted: ${body.admission?.patientName || ''}`
}), { dataCategory: 'PHI', severity: 'info' }), async (req, res) => {
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
        let PatientModel;
        if (req.tenantDb) {
            PatientModel = getTenantModels(req.tenantDb).HospitalPatient;
        } else {
            PatientModel = require('../models/hospitalPatient.model');
        }

        const admissions = await Admission.find({
            hospitalId: req.hospitalId || req.user.hospitalId,
        })
            .sort({ admissionDate: -1 })
            .lean();

        // Populate patientId manually from HospitalPatient model
        const patientIds = admissions.map(a => a.patientId).filter(Boolean);
        const patients = await PatientModel.find({ _id: { $in: patientIds } })
            .select('name phone patientId mrn firstName lastName')
            .lean();

        const patientMap = {};
        patients.forEach(p => {
            patientMap[p._id.toString()] = p;
        });

        const populatedAdmissions = admissions.map(adm => {
            const pIdStr = adm.patientId ? adm.patientId.toString() : '';
            return {
                ...adm,
                patientId: patientMap[pIdStr] || null
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
router.put('/:id', verifyAdmissionAccess, auditLog((req) => (req.body.ward || req.body.bedNumber ? 'BED_CHANGED' : 'UPDATE'), (req, body) => ({
    model: 'Admission',
    id: req.params.id,
    label: `Admission updated: ${body.admission?.patientName || ''}`,
    before: req.oldAdmission || null,
    after: body.admission || null
}), { dataCategory: 'PHI', severity: 'warning' }), async (req, res, next) => {
    try {
        const Admission = getAdmission(req);
        const adm = await Admission.findById(req.params.id).lean();
        if (adm) req.oldAdmission = adm;
    } catch (_) {}
    next();
}, async (req, res) => {
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
router.put('/:id/discharge', verifyAdmissionAccess, auditLog('DISCHARGE_COMPLETED', (req, body) => ({
    model: 'Admission',
    id: req.params.id,
    label: `Patient Discharged: ${body.admission?.patientName || ''}`,
    before: req.oldAdmissionDischarge || null,
    after: body.admission || null
}), { dataCategory: 'PHI', severity: 'warning' }), async (req, res, next) => {
    try {
        const Admission = getAdmission(req);
        const adm = await Admission.findById(req.params.id).lean();
        if (adm) req.oldAdmissionDischarge = adm;
    } catch (_) {}
    next();
}, async (req, res) => {
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

        let PatientModel;
        if (req.tenantDb) {
            PatientModel = getTenantModels(req.tenantDb).HospitalPatient;
        } else {
            PatientModel = require('../models/hospitalPatient.model');
        }

        const patientObj = await PatientModel.findById(patientId).select('patientId mrn name phone');
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
            const patientObj = await PatientModel.findById(patientId).select('name');
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

        // Central Workflow Transition Integration (Patient Discharged)
        try {
            const { getTenantModels } = require('../db/tenantModels');
            const { PatientEncounter } = getTenantModels(req.tenantDb);
            let encounter = await PatientEncounter.findOne({ patientId, isArchived: false });
            if (!encounter) {
                const { createEncounter } = require('../utils/workflowEngine');
                encounter = await createEncounter(req, patientId, 'IPD');
            }
            encounter.activeAdmissionId = admission._id;
            await encounter.save();

            const { executeTransition } = require('../utils/workflowEngine');
            await executeTransition(
                req,
                encounter._id,
                'Discharged',
                'Discharged Completed',
                notes || 'Patient discharged from admission ward.'
            );
        } catch (workflowErr) {
            console.error('[workflowEngine admission discharge transition error]', workflowErr.message);
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
        const { amount, paymentMethod } = req.body;
        const Admission = getAdmission(req);
        
        const currentAdmission = await Admission.findById(req.params.id);
        if (!currentAdmission) return res.status(404).json({ success: false, message: 'Admission not found' });
        
        const finalAmount = Number(amount) || 0;
        const newAmountPaid = (currentAdmission.amountPaid || 0) + finalAmount;

        const getBackendAdmAmt = (a) => {
            if (!a) return 0;
            const end = a.dischargeDate ? new Date(a.dischargeDate) : new Date();
            const days = Math.max(1, Math.ceil(Math.abs(end.setHours(0,0,0,0) - new Date(a.admissionDate).setHours(0,0,0,0)) / (1000 * 60 * 60 * 24)) + 1);
            const bedAmt = (a.dailyWardCharge || 0) * days;
            const facilitiesAmt = Number(a.totalAmount || 0);
            return bedAmt + facilitiesAmt;
        };

        const totalCost = getBackendAdmAmt(currentAdmission);
        const paymentStatus = newAmountPaid >= totalCost ? 'Paid' : 'Pending';

        const admission = await Admission.findByIdAndUpdate(
            req.params.id,
            { 
                amountPaid: newAmountPaid,
                paymentStatus
            },
            { new: true }
        );

        // Record CollectionTransaction if paid amount > 0
        if (finalAmount > 0) {
            let PatientModel;
            if (req.tenantDb) {
                PatientModel = getTenantModels(req.tenantDb).HospitalPatient;
            } else {
                PatientModel = require('../models/hospitalPatient.model');
            }
            const patientUser = await PatientModel.findById(currentAdmission.patientId).select('name phone patientId mrn').lean();
            
            const transactionData = {
                hospitalId: currentAdmission.hospitalId,
                patientId: currentAdmission.patientId,
                patientName: patientUser?.name || currentAdmission.patientName || 'Unknown Patient',
                patientPhone: patientUser?.phone || currentAdmission.patientPhone || '',
                patientIdStr: patientUser?.patientId || patientUser?.mrn || 'WALK-IN',
                amount: finalAmount,
                paymentMethod: paymentMethod || 'Cash',
                collectedByUserId: req.user._id || req.user.userId,
                collectedByName: req.user.name || 'Staff',
                counterName: req.user.counterName && req.user.counterName !== 'Counter 1' ? req.user.counterName : (req.user.name || 'Counter 1'),
                collectionType: 'IPD Admission Advance',
                collectionTimestamp: new Date()
            };

            if (req.tenantDb) {
                const { getTenantModels } = require('../db/tenantModels');
                const TenantCollectionTransaction = getTenantModels(req.tenantDb).CollectionTransaction;
                const tenantTx = new TenantCollectionTransaction(transactionData);
                await tenantTx.save();
            } else {
                const MasterCollectionTransaction = require('../models/collectionTransaction.model');
                const masterTx = new MasterCollectionTransaction(transactionData);
                await masterTx.save();
            }
        }

        res.json({ success: true, message: 'Admission marked as paid', admission });
    } catch (err) {
        console.error('Admission payment error:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
