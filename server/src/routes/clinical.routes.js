const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');

const getModels = (req) => {
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return {
            ClinicalVisit: m.ClinicalVisit,
            LabReport: m.LabReport,
            PharmacyOrder: m.PharmacyOrder,
            Inventory: m.Inventory,
            Appointment: m.Appointment
        };
    }
    return {
        ClinicalVisit: require('../models/clinicalVisit.model'),
        LabReport: require('../models/labReport.model'),
        PharmacyOrder: require('../models/pharmacyOrder.model'),
        Inventory: require('../models/inventory.model'),
        Appointment: require('../models/appointment.model')
    };
};

// 1. NURSE: Create Visit & Add Vitals
router.post('/intake', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { patientId, vitals, intervalHistory, chiefComplaint } = req.body;
        const { ClinicalVisit } = getModels(req);

        const visit = new ClinicalVisit({
            patientId,
            hospitalId: req.user.hospitalId,   // RLS: scope to hospital
            intake: {
                filledBy: req.user.id,
                timestamp: new Date(),
                vitals,
                intervalHistory,
                chiefComplaint,
                completed: true
            },
            status: 'ready_for_doctor'
        });

        await visit.save();
        res.json({ success: true, data: visit });
    } catch (error) {
        console.error('Intake Error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 2. DOCTOR: Get Patient History
router.get('/history/:patientId', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { ClinicalVisit } = getModels(req);
        // RLS: scope by hospitalId so cross-hospital data never leaks
        const filter = { patientId: req.params.patientId };
        if (req.user.hospitalId) filter.hospitalId = req.user.hospitalId;

        const history = await ClinicalVisit.find(filter)
            .sort({ visitDate: -1 })
            .populate('intake.filledBy', 'name')
            .populate('doctorConsultation.doctorId', 'name');

        res.json({ success: true, history });   // key: history (was: data)
    } catch (error) {
        console.error('History Fetch Error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 3. DOCTOR: Finalize Diagnosis
router.post('/diagnose/:visitId', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { diagnosis, prescription, labTests, notes } = req.body;
        const { ClinicalVisit, LabReport, PharmacyOrder, Inventory, Appointment } = getModels(req);

        // RLS: validate the visit belongs to this hospital before updating
        const visitFilter = { _id: req.params.visitId };
        if (req.user.hospitalId) visitFilter.hospitalId = req.user.hospitalId;

        const visit = await ClinicalVisit.findOneAndUpdate(
            visitFilter,
            {
                doctorConsultation: {
                    doctorId: req.user.id,
                    timestamp: new Date(),
                    diagnosis,
                    prescription,
                    labTests,
                    procedureAdvice: notes,
                    clinicalNotes: notes
                },
                status: 'completed'
            },
            { new: true }
        );

        if (!visit) return res.status(404).json({ message: 'Visit not found or access denied' });

        // Update corresponding Appointment to completed with metadata (Task 5 requirement)
        if (visit.appointmentId) {
            await Appointment.findByIdAndUpdate(visit.appointmentId, {
                status: 'completed',
                completedAt: new Date(),
                completedBy: req.user.id
            });
        }

        const io = req.app.get('io');
        const Notification = require('../models/notification.model');

        // A. CREATE PHARMACY ORDER — wrapped so it never blocks consultation completion
        if (prescription && prescription.length > 0) {
            try {
                // Look up inventory prices
                const targetHospitalId = req.user.hospitalId;
                let allInventory = [];
                if (targetHospitalId) {
                    allInventory = await Inventory.find({ hospitalId: targetHospitalId }).lean();
                }
                if (!allInventory || allInventory.length === 0) {
                    allInventory = await Inventory.find().lean();
                }
                const itemsWithPrices = prescription.map(p => {
                    const pNameLower = p.medicine.trim().toLowerCase();
                    let invItem = allInventory.find(item => item.name.trim().toLowerCase() === pNameLower);
                    if (!invItem) {
                        invItem = allInventory.find(item => {
                            const itemLower = item.name.trim().toLowerCase();
                            return itemLower.includes(pNameLower) || pNameLower.includes(itemLower);
                        });
                    }
                    const unitPrice = invItem ? (invItem.sellingPrice || 0) : 0;

                    // Parse quantity dynamically based on dosage frequency and duration
                    const getPillsPerDay = (frequency) => {
                        if (!frequency) return 1;
                        const freqStr = frequency.trim().toLowerCase();
                        if (/^\d(-\d)+$/.test(freqStr)) {
                            const parts = freqStr.split('-').map(Number);
                            const sum = parts.reduce((a, b) => a + b, 0);
                            if (sum > 0) return sum;
                        }
                        if (freqStr.includes('once') || freqStr.includes('daily') || freqStr.includes('od') || freqStr.includes('1 time')) return 1;
                        if (freqStr.includes('twice') || freqStr.includes('bd') || freqStr.includes('bid') || freqStr.includes('2 times')) return 2;
                        if (freqStr.includes('thrice') || freqStr.includes('tds') || freqStr.includes('tid') || freqStr.includes('3 times')) return 3;
                        if (freqStr.includes('qd') || freqStr.includes('qds') || freqStr.includes('4 times')) return 4;
                        return 1;
                    };

                    const getDurationDays = (duration) => {
                        if (!duration) return 1;
                        const durStr = duration.trim().toLowerCase();
                        const num = parseInt(durStr.match(/\d+/)?.[0] || '1', 10);
                        if (durStr.includes('week')) return num * 7;
                        if (durStr.includes('month')) return num * 30;
                        if (durStr.includes('day')) return num;
                        return num;
                    };

                    const quantity = getPillsPerDay(p.dosage) * getDurationDays(p.duration);
                    const totalPrice = unitPrice * quantity;

                    return {
                        medicineName: p.medicine,
                        frequency: p.dosage,
                        duration: p.duration,
                        unitPrice,
                        quantity,
                        totalPrice,
                        price: totalPrice, // legacy compatibility
                        inventoryId: invItem ? invItem._id : null
                    };
                });
                const totalAmount = itemsWithPrices.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

                const pharmacyOrder = new PharmacyOrder({
                    appointmentId: visit.appointmentId || visit._id,
                    patientId: visit.patientId.toString(),
                    userId: visit.patientId,
                    doctorId: req.user.id,
                    hospitalId: targetHospitalId,    // RLS: set hospitalId
                    items: itemsWithPrices,
                    totalAmount,
                    orderStatus: 'Upcoming',
                    paymentStatus: 'Pending'
                });
                await pharmacyOrder.save();

                const notif = new Notification({
                    senderId: req.user.id,
                    recipientRole: 'pharmacy',
                    hospitalId: req.user.hospitalId,
                    message: 'New prescription received for dispensing.',
                    referenceType: 'PharmacyOrder',
                    referenceId: pharmacyOrder._id,
                    patientId: visit.patientId.toString()
                });
                await notif.save();
                if (io) io.to('pharmacy').emit('new_notification', notif);
            } catch (pharmacyErr) {
                console.error('Pharmacy order creation failed (non-blocking):', pharmacyErr.message);
            }
        }

        // B. CREATE LAB REQUEST — wrapped so it never blocks consultation completion
        if (labTests && labTests.length > 0) {
            try {
                const labReport = new LabReport({
                    appointmentId: visit.appointmentId || visit._id,
                    patientId: visit.patientId.toString(),
                    userId: visit.patientId,
                    doctorId: req.user.id,
                    hospitalId: req.user.hospitalId,    // RLS: set hospitalId
                    testNames: labTests,
                    testStatus: 'PENDING',
                    reportStatus: 'PENDING',
                    paymentStatus: 'PENDING'
                });
                await labReport.save();

                const notif = new Notification({
                    senderId: req.user.id,
                    recipientRole: 'lab',
                    hospitalId: req.user.hospitalId,
                    message: 'New lab test requested.',
                    referenceType: 'LabReport',
                    referenceId: labReport._id,
                    patientId: visit.patientId.toString()
                });
                await notif.save();
                if (io) io.to('lab').emit('new_notification', notif);
            } catch (labErr) {
                console.error('Lab report creation failed (non-blocking):', labErr.message);
            }
        }

        res.json({ success: true, data: visit });
    } catch (error) {
        console.error('Diagnosis Error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
