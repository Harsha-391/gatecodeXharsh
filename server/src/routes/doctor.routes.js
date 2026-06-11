const express = require('express');
const router = express.Router();
const multer = require('multer');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const MasterAppointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const MasterUser = require('../models/user.model'); // Need User model to update profile
const Lab = require('../models/lab.model');
const MasterLabReport = require('../models/labReport.model');
const MasterInventory = require('../models/inventory.model');
const MasterPharmacyOrder = require('../models/pharmacyOrder.model');
const Notification = require('../models/notification.model');
const { verifyToken } = require('../middleware/auth.middleware');
const validateFileType = require('../utils/validateFileType');
const imagekit = require('../utils/imagekit');
const ClinicPatient = require('../models/clinicPatient.model');

const getModels = (req) => {
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return {
            Appointment: m.Appointment,
            User: m.User,
            LabReport: m.LabReport,
            PharmacyOrder: m.PharmacyOrder,
            Inventory: m.Inventory
        };
    }
    return {
        Appointment: MasterAppointment,
        User: MasterUser,
        LabReport: MasterLabReport,
        PharmacyOrder: MasterPharmacyOrder,
        Inventory: MasterInventory
    };
};

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'application/pdf'];
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPEG, PNG and PDF allowed'), false);
    },
});

// --- HELPER ---
const getDoctorQuery = async (userId, hospitalId) => {
    try {
        const doctorProfile = await Doctor.findOne({ userId });
        const query = { $or: [{ doctorUserId: userId }] };
        if (doctorProfile) {
            query.$or.push({ doctorId: doctorProfile._id });
        }
        // HARD ISOLATION: always scope to hospital
        if (hospitalId) {
            query.hospitalId = hospitalId;
        }
        return query;
    } catch (error) {
        const q = { doctorUserId: userId };
        if (hospitalId) q.hospitalId = hospitalId;
        return q;
    }
};

// 1. GET Unique Patients
// (Moved below)

// 0. GET ALL DOCTORS (Public)
router.get('/', async (req, res) => {
    try {
        const { serviceId } = req.query;
        let query = {};

        // If serviceId filter is provided
        if (serviceId) {
            query.services = serviceId;
        }

        let hospitalIdFilter = req.query.hospitalId || null;

        // If no explicit query param, check if they sent a valid token (e.g. Receptionist fetching doctors)
        if (!hospitalIdFilter && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const { JWT_SECRET: _jwtSecret } = require('../config/jwt');
                const decoded = jwt.verify(token, _jwtSecret);
                if (decoded.hospitalId) {
                    hospitalIdFilter = decoded.hospitalId;
                }
            } catch (err) {
                // Ignore gracefully for public guests
            }
        }

        // Apply absolute hospital isolation filter if requested or inferred
        if (hospitalIdFilter) {
            // Need mongoose to cast toObjectId sometimes, but usually string match works if schema defines it as ObjectId
            query.hospitalId = hospitalIdFilter;
        }

        const doctors = await Doctor.find(query)
            .populate('userId', 'name email phone role')
            .select('name specialty services availability consultationFee image bio userId departments')
            .sort({ name: 1 })
            .lean();

        res.json({ success: true, doctors });
    } catch (error) {
        console.error('Get doctors error:', error);
        res.status(500).json({ success: false, message: 'Error fetching doctors' });
    }
});

// 1. GET Unique Patients
router.get('/patients', verifyToken, resolveTenant, async (req, res) => {
    try {
        const doctorUserId = req.user.id || req.user.userId;
        const query = await getDoctorQuery(doctorUserId, req.user.hospitalId);

        const { Appointment } = getModels(req);
        const appointments = await Appointment.find(query)
            .populate('userId', 'name email phone patientId fertilityProfile')
            .sort({ appointmentDate: -1 })
            .lean();

        const uniquePatients = {};
        appointments.forEach(app => {
            if (app.userId && app.userId._id) {
                const pid = app.userId._id.toString();
                if (!uniquePatients[pid]) {
                    uniquePatients[pid] = {
                        _id: pid,
                        patientId: app.userId.patientId,
                        name: app.userId.name,
                        phone: app.userId.phone,
                        lastVisit: app.appointmentDate,
                        profile: app.userId.fertilityProfile
                    };
                }
            }
        });
        res.json({ success: true, patients: Object.values(uniquePatients) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching patients' });
    }
});

// 1b. GET Full Patient Profile (comprehensive data)
router.get('/patients/:patientId/full-profile', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { patientId } = req.params;
        const hid = req.user.hospitalId;

        const { User, Appointment, LabReport, PharmacyOrder } = getModels(req);

        // Get patient info — allow finding globally since patient is already authenticated/linked via appointments
        const patient = await User.findById(patientId).lean();
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        // Scope all sub-queries to hospital (allowing fallback to global/unassigned reports)
        const apptQ = { userId: patientId };
        const labQ = { userId: patientId };
        const rxQ = { $or: [{ userId: patientId }, { patientId: patientId }] };
        if (hid) {
            apptQ.hospitalId = hid;
            labQ.$or = [{ hospitalId: hid }, { hospitalId: null }, { hospitalId: { $exists: false } }];
            rxQ.hospitalId = hid;
        }

        const [appointments, labReports, pharmacyOrders] = await Promise.all([
            Appointment.find(apptQ).populate({ path: 'doctorId', model: Doctor, select: 'name specialty' }).sort({ appointmentDate: -1 }).lean(),
            LabReport.find(labQ).populate('labId', 'name').sort({ createdAt: -1 }).lean(),
            PharmacyOrder.find(rxQ).sort({ createdAt: -1 }).lean()
        ]);

        res.json({
            success: true,
            patient: {
                _id: patient._id,
                name: patient.name,
                email: patient.email,
                phone: patient.phone,
                patientId: patient.patientId,
                dob: patient.dob,
                gender: patient.gender,
                bloodGroup: patient.bloodGroup,
                address: patient.address,
                city: patient.city,
                avatar: patient.avatar,
                aadhaarNumber: patient.aadhaarNumber,
                isAadhaarVerified: patient.isAadhaarVerified,
                fertilityProfile: patient.fertilityProfile || {},
                pastReports: patient.pastReports || [],
                createdAt: patient.createdAt
            },
            appointments,
            labReports,
            pharmacyOrders
        });
    } catch (error) {
        console.error('Full profile error:', error);
        res.status(500).json({ success: false, message: 'Error fetching patient profile' });
    }
});

// 2. NEW: Update Patient Profile (Intake Data) by Doctor
router.put('/patients/:patientId/profile', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { patientId } = req.params;
        const updates = req.body;
        const hospitalId = req.user.hospitalId;

        // Verify patient belongs to same hospital
        const findQuery = { _id: patientId };
        if (hospitalId) findQuery.hospitalId = hospitalId;

        const { User } = getModels(req);
        const user = await User.findOne(findQuery);
        if (!user) return res.status(404).json({ message: 'Patient not found' });

        // Merge existing profile with updates
        user.fertilityProfile = { ...user.fertilityProfile, ...updates };
        await user.save();

        // If req.tenantDb is present, this updated the tenant user. We also update the master user!
        if (req.tenantDb) {
            const masterUser = await MasterUser.findById(patientId);
            if (masterUser) {
                masterUser.fertilityProfile = { ...masterUser.fertilityProfile, ...updates };
                await masterUser.save();
            }
        }

        res.json({ success: true, message: 'Patient history updated successfully', profile: user.fertilityProfile });
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
});

// 3. START SESSION
router.post('/session/start', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { patientId } = req.body;
        const doctorUserId = req.user.id || req.user.userId;
        const doctor = await Doctor.findOne({ userId: doctorUserId });

        if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

        const { Appointment } = getModels(req);
        const newSession = new Appointment({
            userId: patientId,
            hospitalId: req.user.hospitalId || doctor.hospitalId,
            doctorId: doctor._id,
            doctorUserId: doctorUserId,
            doctorName: doctor.name,
            serviceName: 'Counseling / Follow-up',
            appointmentDate: new Date(),
            appointmentTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            status: 'confirmed',
            amount: doctor.consultationFee,
            paymentStatus: 'pending'
        });

        await newSession.save();
        res.json({ success: true, appointment: newSession });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 4. GET Appointment Details
router.get('/appointments/:id', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { Appointment, User } = getModels(req);
        const apptQuery = { _id: req.params.id };
        if (req.user.hospitalId) apptQuery.hospitalId = req.user.hospitalId;
        const appointment = await Appointment.findOne(apptQuery)
            .populate('userId')
            .populate('labId', 'name')
            .lean();

        if (!appointment) return res.status(404).json({ success: false, message: 'Not found or unauthorized' });

        // Retrieve active admission status if recommendAdmission is true
        let admissionStatus = null;
        if (appointment.recommendAdmission) {
            const hospitalId = req.user.hospitalId || appointment.hospitalId;
            const { getTenantConnection } = require('../db/tenantDb');
            const { getTenantModels } = require('../db/tenantModels');
            const MasterAdmission = require('../models/admission.model');
            let AdmissionModel = MasterAdmission;
            if (hospitalId) {
                try {
                    const tenantDb = await getTenantConnection(String(hospitalId));
                    if (tenantDb) {
                        AdmissionModel = getTenantModels(tenantDb).Admission;
                    }
                } catch (e) {
                    console.error('[GET appointment] Tenant DB connection failed:', e);
                }
            }
            const activeAdmission = await AdmissionModel.findOne({
                appointmentId: appointment._id,
                status: { $ne: 'Discharged' }
            }).lean();
            if (activeAdmission) {
                admissionStatus = activeAdmission.status;
                appointment.admissionWard = activeAdmission.ward || '';
                appointment.admissionBed = activeAdmission.bedNumber || '';
            }
        }
        appointment.admissionStatus = admissionStatus;
        
        // Fetch doctor's specific departments, fallback to hospital departments
        const doctorUser = await User.findById(req.user.id || req.user.userId).populate('hospitalId');
        let departments = [];
        if (doctorUser && doctorUser.departments && doctorUser.departments.length > 0) {
            departments = doctorUser.departments;
        } else if (doctorUser && doctorUser.hospitalId && doctorUser.hospitalId.departments) {
            departments = doctorUser.hospitalId.departments;
        }

        res.json({ success: true, appointment, departments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching details' });
    }
});

// 5. GET Appointments List (for this doctor)
router.get('/appointments', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { Appointment } = getModels(req);
        const doctorUserId = req.user.id || req.user.userId;
        const query = await getDoctorQuery(doctorUserId, req.user.hospitalId);

        if (req.query.all !== 'true') {
            const baseDateStr = req.query.date || new Date().toISOString().split('T')[0];
            const clientToday = new Date(baseDateStr);
            clientToday.setUTCHours(0, 0, 0, 0);

            if (req.query.tomorrow === 'true') {
                const tomorrowStart = new Date(clientToday);
                tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
                tomorrowStart.setUTCHours(0, 0, 0, 0);

                const dayAfterTomorrowStart = new Date(clientToday);
                dayAfterTomorrowStart.setUTCDate(dayAfterTomorrowStart.getUTCDate() + 2);
                dayAfterTomorrowStart.setUTCHours(0, 0, 0, 0);

                query.appointmentDate = { $gte: tomorrowStart, $lt: dayAfterTomorrowStart };
            } else if (req.query.future === 'true') {
                const dayAfterTomorrowStart = new Date(clientToday);
                dayAfterTomorrowStart.setUTCDate(dayAfterTomorrowStart.getUTCDate() + 2);
                dayAfterTomorrowStart.setUTCHours(0, 0, 0, 0);

                query.appointmentDate = { $gte: dayAfterTomorrowStart };
            } else if (req.query.date) {
                const start = new Date(req.query.date);
                start.setUTCHours(0, 0, 0, 0);
                const end = new Date(req.query.date);
                end.setUTCHours(23, 59, 59, 999);
                query.appointmentDate = { $gte: start, $lte: end };
            }
        }

        const appointments = await Appointment.find(query)
            .populate('userId', 'name email phone patientId fertilityProfile')
            .sort({ appointmentDate: 1, appointmentTime: 1 })
            .lean();
        res.json({ success: true, appointments });
    } catch (error) {
        console.error('Doctor appointments fetch error:', error);
        res.status(500).json({ success: false, message: 'Error fetching appointments' });
    }
});

// 5b. GET ALL Appointments (for nurse/staff - all doctors)
// DEPARTMENT ISOLATION: If the requesting user has departments assigned,
// only show appointments where the doctor belongs to one of those departments.
router.get('/all-appointments', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { Appointment, User } = getModels(req);
        let query = {};
        if (req.user.hospitalId) {
            query.hospitalId = req.user.hospitalId;
        }

        // Check if the requesting user has department restrictions
        const requestingUser = await User.findById(req.user.id || req.user.userId).lean();
        const userDepts = requestingUser?.departments || [];

        let departmentDoctorIds = null;
        if (userDepts.length > 0) {
            // Find all doctors in those departments within this hospital
            const deptFilter = { departments: { $in: userDepts } };
            if (req.user.hospitalId) deptFilter.hospitalId = req.user.hospitalId;
            const deptDoctors = await Doctor.find(deptFilter).select('_id userId').lean();
            departmentDoctorIds = {
                docIds: deptDoctors.map(d => d._id),
                userIds: deptDoctors.filter(d => d.userId).map(d => d.userId)
            };
            // Scope appointments to only those doctors
            query.$or = [
                { doctorId: { $in: departmentDoctorIds.docIds } },
                { doctorUserId: { $in: departmentDoctorIds.userIds } }
            ];
        }

        const appointments = await Appointment.find(query)
            .populate('userId', 'name email phone patientId fertilityProfile')
            .populate({ path: 'doctorId', model: Doctor, select: 'name specialty departments' })
            .populate('doctorUserId', 'name')
            .sort({ appointmentDate: -1, appointmentTime: 1 })
            .lean();

        // Attach doctor name from whichever field is available
        const enriched = appointments.map(a => ({
            ...a,
            doctorName: a.doctorId?.name || a.doctorUserId?.name || a.doctorName || 'Not Assigned'
        }));

        res.json({ success: true, appointments: enriched });
    } catch (error) {
        console.error('All appointments error:', error);
        res.status(500).json({ success: false, message: 'Error fetching all appointments' });
    }
});
// 6. UPDATE Session (Notes)
router.patch('/appointments/:id/prescription', verifyToken, resolveTenant, upload.single('prescriptionFile'), async (req, res) => {
    try {
        const { Appointment, User, LabReport, PharmacyOrder, Inventory } = getModels(req);
        let uploadedFileEntry = null;
        if (req.file) {
            const typeErr = await validateFileType(req.file, ['image/jpeg', 'image/png', 'application/pdf']);
            if (typeErr) return res.status(400).json({ success: false, message: typeErr });
            try {
                const result = await imagekit.upload({
                    file: req.file.buffer,
                    fileName: `prescription_${req.params.id}_${Date.now()}`,
                    folder: '/crm/prescriptions',
                });
                uploadedFileEntry = {
                    url: result.url,
                    fileId: result.fileId,
                    name: req.file.originalname,
                    mimetype: req.file.mimetype,
                    uploadedAt: new Date(),
                };
            } catch (uploadErr) {
                console.error('[doctor] prescription file upload failed', uploadErr.message);
                return res.status(500).json({ success: false, message: 'File upload failed. Save prescription without file or try again.' });
            }
        }
        const { status, diagnosis, labTests, dietPlan, pharmacy, notes, labId, requestReportFollowUp } = req.body;
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;
        const appointment = await Appointment.findOne(findQuery);
        if (!appointment) return res.status(404).json({ message: 'Not found' });

        if (requestReportFollowUp !== undefined) {
            appointment.requestReportFollowUp = String(requestReportFollowUp) === 'true' || requestReportFollowUp === true;
        }

        // Persist uploaded file URL to both legacy field and prescriptions array
        if (uploadedFileEntry) {
            appointment.prescription = uploadedFileEntry.url;
            if (!appointment.prescriptions) appointment.prescriptions = [];
            appointment.prescriptions.push({ type: 'prescription', ...uploadedFileEntry });
        }

        if (labId) appointment.labId = labId;
        if (status) appointment.status = status;
        if (status === 'completed') {
            appointment.completedAt = new Date();
            appointment.completedBy = req.user.id;
        }
        if (diagnosis) appointment.diagnosis = diagnosis;
        if (notes) appointment.doctorNotes = notes;

        if (labTests) {
            if (typeof labTests === 'string') {
                try {
                    appointment.labTests = JSON.parse(labTests);
                } catch (e) {
                    appointment.labTests = labTests.split(/,(?![^(]*\))/).map(t => t.trim()).filter(Boolean);
                }
            } else {
                appointment.labTests = labTests;
            }
        }

        if (dietPlan) appointment.dietPlan = typeof dietPlan === 'string' ? JSON.parse(dietPlan) : dietPlan;

        if (pharmacy) {
            const p = typeof pharmacy === 'string' ? JSON.parse(pharmacy) : pharmacy;
            if (Array.isArray(p)) {
                appointment.pharmacy = p.map(item => ({
                    medicineName: item.medicineName || item.name,
                    saltName: item.saltName || '',
                    frequency: item.frequency || '',
                    duration: item.duration || ''
                }));

                // Auto-create missing medicines in master DB and tenant DB
                const targetHospitalId = req.user.hospitalId || appointment.hospitalId;
                if (targetHospitalId) {
                    const Medicine = require('../models/medicine.model');
                    for (const item of appointment.pharmacy) {
                        const medName = item.medicineName;
                        if (!medName) continue;
                        
                        // 1. Check if it exists in the hospital's tenant Inventory
                        let invItem = await Inventory.findOne({
                            hospitalId: targetHospitalId,
                            name: { $regex: new RegExp('^' + medName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
                        });
                        
                        if (!invItem) {
                            // 2. Check/add to the global Medicine catalog
                            let globalMed = await Medicine.findOne({
                                name: { $regex: new RegExp('^' + medName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
                            });
                            if (!globalMed) {
                                try {
                                    globalMed = await Medicine.create({
                                        name: medName.trim(),
                                        genericName: item.saltName ? item.saltName.trim() : '',
                                        category: 'General',
                                        description: 'Auto-added from doctor prescription'
                                    });
                                    console.log(`[Prescription] Added "${medName}" to global Medicine catalog.`);
                                } catch (err) {
                                    console.error('[Prescription] Error saving to global Medicine catalog:', err);
                                }
                            }
                            
                            // 3. Add to the hospital's tenant Inventory collection
                            try {
                                invItem = await Inventory.create({
                                    hospitalId: targetHospitalId,
                                    name: medName.trim(),
                                    salt: item.saltName ? item.saltName.trim() : '',
                                    category: 'General',
                                    stock: 100,
                                    unit: 'Tablets',
                                    buyingPrice: 0,
                                    sellingPrice: 10,
                                    vendor: 'Auto-Added',
                                    batchNumber: 'AUTO',
                                    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                                    purchaseDate: new Date(),
                                    status: 'In Stock'
                                });
                                console.log(`[Prescription] Auto-added medicine "${medName}" to inventory of hospital ${targetHospitalId}`);
                            } catch (err) {
                                console.error('[Prescription] Error auto-adding to inventory:', err);
                            }
                        }
                    }
                }
            }
        }

        await appointment.save();

        if (req.tenantDb) {
            try {
                const updateData = {
                    requestReportFollowUp: appointment.requestReportFollowUp,
                    followUpScheduled: appointment.followUpScheduled,
                    status: appointment.status,
                    diagnosis: appointment.diagnosis,
                    doctorNotes: appointment.doctorNotes,
                    labTests: appointment.labTests,
                    dietPlan: appointment.dietPlan,
                    pharmacy: appointment.pharmacy,
                    prescription: appointment.prescription,
                    prescriptions: appointment.prescriptions,
                    completedAt: appointment.completedAt,
                    completedBy: appointment.completedBy
                };
                await MasterAppointment.findByIdAndUpdate(appointment._id, { $set: updateData });
            } catch (syncErr) {
                console.error('[doctor] Master DB appointment sync failed:', syncErr.message);
            }
        }

        // Retrieve patient details reliably
        let pId = appointment.patientId;
        let pName = 'Patient';
        if (appointment.userId) {
            const pUser = await User.findById(appointment.userId);
            if (pUser) {
                pId = pUser.patientId || pId;
                pName = pUser.name || pName;
            }
        }
        if (appointment.labTests && appointment.labTests.length > 0) {
            const existingReport = await LabReport.findOne({ appointmentId: appointment._id });
            let reportId;
            
            // Dynamically calculate total amount for these lab tests
            const LabTest = require('../models/labTest.model');
            const allTests = await LabTest.find();
            let totalAmount = 0;
            const hidStr = (req.user.hospitalId || appointment.hospitalId || '').toString();
            (appointment.labTests || []).forEach(testName => {
                const testObj = allTests.find(t => t.name.trim().toLowerCase() === testName.trim().toLowerCase());
                if (testObj) {
                    if (hidStr && testObj.hospitalPrices && testObj.hospitalPrices.has && testObj.hospitalPrices.has(hidStr)) {
                        totalAmount += testObj.hospitalPrices.get(hidStr) || 0;
                    } else if (hidStr && testObj.hospitalPrices && typeof testObj.hospitalPrices === 'object' && testObj.hospitalPrices[hidStr]) {
                        totalAmount += testObj.hospitalPrices[hidStr];
                    } else {
                        totalAmount += testObj.price || 0;
                    }
                }
            });

            if (!existingReport) {
                const newReport = await LabReport.create({
                    appointmentId: appointment._id,
                    patientId: pId || 'N/A',
                    userId: appointment.userId,
                    doctorId: req.user.id,
                    hospitalId: req.user.hospitalId || appointment.hospitalId,
                    labId: labId || null,
                    testNames: appointment.labTests,
                    testStatus: 'PENDING',
                    reportStatus: 'PENDING',
                    paymentStatus: 'PENDING',
                    amount: totalAmount
                });
                reportId = newReport._id;
            } else {
                existingReport.testNames = appointment.labTests;
                existingReport.labId = labId || existingReport.labId;
                existingReport.amount = totalAmount; // Update price in case tests were added/removed
                await existingReport.save();
                reportId = existingReport._id;
            }

            // --- Dispatch Lab Notification ---
            await Notification.create({
                senderId: req.user.id,
                recipientRole: 'lab',
                message: `New lab tests prescribed for ${pName} (${pId || 'N/A'})`,
                referenceType: 'LabReport',
                referenceId: reportId,
                patientId: pId || 'N/A'
            });

            const io = req.app.get('io');
            if (io) {
                io.to('lab').emit('newNotification', { message: `New lab tests prescribed for ${pName}` });
            }

        } else {
            // Remove pending reports if no tests prescribed anymore
            await LabReport.deleteOne({ appointmentId: appointment._id, testStatus: 'PENDING' });
        }

        // --- NEW: Create Pharmacy Order ---
        if (appointment.pharmacy && appointment.pharmacy.length > 0) {
            const existingOrder = await PharmacyOrder.findOne({ appointmentId: appointment._id });
            
            // Look up inventory prices
            const targetHospitalId = req.user.hospitalId || appointment.hospitalId;
            let allInventory = [];
            if (targetHospitalId) {
                allInventory = await Inventory.find({ hospitalId: targetHospitalId }).lean();
            }
            if (!allInventory || allInventory.length === 0) {
                allInventory = await Inventory.find().lean();
            }
            const itemsWithPrices = appointment.pharmacy.map(p => {
                const pNameLower = p.medicineName.trim().toLowerCase();
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

                const quantity = getPillsPerDay(p.frequency) * getDurationDays(p.duration);
                const totalPrice = unitPrice * quantity;

                return {
                    medicineName: p.medicineName,
                    frequency: p.frequency,
                    duration: p.duration,
                    unitPrice,
                    quantity,
                    totalPrice,
                    price: totalPrice, // legacy compatibility
                    inventoryId: invItem ? invItem._id : null
                };
            });
            const totalAmount = itemsWithPrices.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

            let orderId;
            if (!existingOrder) {
                const newOrder = await PharmacyOrder.create({
                    appointmentId: appointment._id,
                    patientId: pId || 'N/A',
                    userId: appointment.userId,
                    doctorId: req.user.id,
                    hospitalId: targetHospitalId,
                    items: itemsWithPrices,
                    totalAmount,
                    orderStatus: 'Upcoming',
                    paymentStatus: 'Pending'
                });
                orderId = newOrder._id;
            } else {
                existingOrder.items = itemsWithPrices;
                existingOrder.totalAmount = totalAmount;
                existingOrder.patientId = pId || existingOrder.patientId;
                await existingOrder.save();
                orderId = existingOrder._id;
            }

            // --- Dispatch Pharmacy Notification ---
            await Notification.create({
                senderId: req.user.id,
                recipientRole: 'pharmacy',
                message: `New pharmacy order prescribed for ${pName} (${pId || 'N/A'})`,
                referenceType: 'PharmacyOrder',
                referenceId: orderId,
                patientId: pId || 'N/A'
            });

            const io = req.app.get('io');
            if (io) {
                io.to('pharmacy').emit('newNotification', { message: `New pharmacy order prescribed for ${pName}` });
                io.to('pharmacist').emit('newNotification', { message: `New pharmacy order prescribed for ${pName}` });
            }
        }

        const io = req.app.get('io');
        if (io) {
            const payload = {
                referenceType: 'ClinicalVisit',
                message: `Consultation completed/updated for patient ${pName}`,
                referenceId: appointment._id
            };
            io.to('receptionist').emit('new_notification', payload);
            io.to('reception').emit('new_notification', payload);

            const hId = req.user.hospitalId || appointment.hospitalId;
            if (hId) {
                const hospRoom = `hospital_${hId}`;
                io.to(`${hospRoom}_receptionist`).to(`${hospRoom}_reception`).emit('new_notification', payload);
            }
        }

        res.json({ success: true, message: 'Saved', appointment });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Update failed' });
    }
});

// 7. GET Patient History
router.get('/patients/:patientId/history', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { Appointment } = getModels(req);
        const histQuery = { userId: req.params.patientId };
        if (req.user.hospitalId) histQuery.hospitalId = req.user.hospitalId;
        const history = await Appointment.find(histQuery).sort({ appointmentDate: -1 });
        res.json({ success: true, history });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Utils
router.get('/labs-list', verifyToken, async (req, res) => {
    const labQuery = {};
    if (req.user.hospitalId) labQuery.hospitalId = req.user.hospitalId;
    const labs = await Lab.find(labQuery).select('name _id');
    res.json({ success: true, labs });
});
router.get('/medicines-list', verifyToken, resolveTenant, async (req, res) => {
    const { Inventory } = getModels(req);
    const medQuery = { stock: { $gt: 0 } };
    if (req.user.hospitalId) medQuery.hospitalId = req.user.hospitalId;
    const medicines = await Inventory.find(medQuery).select('name category stock');
    res.json({ success: true, medicines });
});
router.get('/:doctorId/booked-slots', async (req, res) => {
    const query = {
        $or: [{ doctorId: req.params.doctorId }, { doctorUserId: req.params.doctorId }],
        appointmentDate: new Date(req.query.date),
        status: { $ne: 'cancelled' }
    };
    // Hospital isolation: only show slots for this hospital's doctor
    let AppointmentModel = MasterAppointment;
    if (req.query.hospitalId) {
        query.hospitalId = req.query.hospitalId;
        try {
            const { getTenantConnection } = require('../db/tenantDb');
            const tenantDb = await getTenantConnection(String(req.query.hospitalId));
            if (tenantDb) {
                AppointmentModel = getTenantModels(tenantDb).Appointment;
            }
        } catch (err) {
            console.error('[booked-slots] Tenant DB connection failed:', err);
        }
    }
    const appointments = await AppointmentModel.find(query);
    res.json({ success: true, bookedSlots: appointments.map(app => app.appointmentTime) });
});

// ─── Clinic Patient Reports — GET /api/doctor/clinic-patients/:clinicPatientId/reports
// Allows doctors to view uploaded reports for a clinic patient
router.get('/clinic-patients/:clinicPatientId/reports', verifyToken, async (req, res) => {
    try {
        const patient = await ClinicPatient.findOne({
            _id: req.params.clinicPatientId,
            clinicId: req.user.hospitalId,
        }).select('name patientUid reports').lean();
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
        res.json({ success: true, reports: patient.reports || [], patientName: patient.name, patientUid: patient.patientUid });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// POST /appointments/:id/recommend-admission
router.post('/appointments/:id/recommend-admission', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { notes, priority, requestedDepartment } = req.body;
        const appointmentId = req.params.id;
        const { Appointment, User } = getModels(req);

        const findQuery = { _id: appointmentId };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;

        const appointment = await Appointment.findOne(findQuery);
        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        const resolvedDept = requestedDepartment || appointment.department || '';
        const resolvedPriority = priority || 'Normal';

        appointment.recommendAdmission = true;
        appointment.recommendAdmissionNotes = notes || '';
        appointment.recommendAdmissionPriority = resolvedPriority;
        appointment.recommendAdmissionDept = resolvedDept;
        appointment.status = 'Admitted';
        await appointment.save();

        // Auto-create Admission record / Retrieve tenant connection
        const hospitalId = req.user.hospitalId || appointment.hospitalId;
        const { getTenantConnection } = require('../db/tenantDb');
        const { getTenantModels } = require('../db/tenantModels');
        const MasterAdmission = require('../models/admission.model');

        let AdmissionModel = MasterAdmission;
        let TenantUserModel = null;
        if (hospitalId) {
            try {
                const tenantDb = await getTenantConnection(String(hospitalId));
                if (tenantDb) {
                    AdmissionModel = getTenantModels(tenantDb).Admission;
                    TenantUserModel = getTenantModels(tenantDb).User;
                }
            } catch (err) {
                console.error('[recommend-admission] Tenant DB connection failed:', err);
            }
        }

        // Retrieve patient details reliably using master User model (where patients are registered)
        let pId = appointment.patientId || 'N/A';
        let pName = 'Patient';
        let pPhone = '';
        if (appointment.userId) {
            const pUser = await User.findById(appointment.userId);
            if (pUser) {
                pId = pUser.patientId || pId;
                pName = pUser.name || pName;
                pPhone = pUser.phone || '';
            }
        }

        // Prevent duplicate admissions for same appointment
        let existingAdmission = await AdmissionModel.findOne({
            appointmentId: appointment._id,
            status: { $ne: 'Discharged' }
        });

        if (!existingAdmission) {
            existingAdmission = new AdmissionModel({
                hospitalId,
                patientId: appointment.userId,
                patientName: pName,
                patientPhone: pPhone,
                appointmentId: appointment._id,
                admittedBy: req.user.id || req.user.userId,
                admissionDate: new Date(),
                status: 'Pending Allocation',
                ward: '',
                bedNumber: '',
                requestedDepartment: resolvedDept,
                priority: resolvedPriority,
                totalAmount: 0,
                paymentStatus: 'Pending',
                notes: notes || ''
            });
            await existingAdmission.save();
        } else {
            // Update existing admission with latest details (including patient info in case it was missing)
            existingAdmission.notes = notes || existingAdmission.notes;
            existingAdmission.priority = resolvedPriority;
            existingAdmission.requestedDepartment = resolvedDept;
            existingAdmission.patientName = pName;
            existingAdmission.patientPhone = pPhone;
            existingAdmission.status = 'Pending Allocation'; // Re-open if it was somehow Discharged-then-re-requested
            await existingAdmission.save();
        }

        // Build a fully-populated admission object for real-time socket broadcast
        // so the receptionist's dashboard can display the card immediately without re-fetching
        const populatedAdmission = {
            ...existingAdmission.toObject(),
            patientId: {
                _id: appointment.userId,
                name: pName,
                phone: pPhone,
                patientId: pId
            }
        };

        const doctorName = appointment.doctorName || 'Doctor';

        // Create notification for receptionist
        const Notification = require('../models/notification.model');
        const notif = await Notification.create({
            senderId: req.user.id,
            hospitalId: req.user.hospitalId || appointment.hospitalId,
            recipientRole: 'receptionist',
            message: `Dr. ${doctorName} has recommended Patient ${pName} (${pId}) for admission. Notes: ${notes || 'None'}`,
            referenceType: 'ClinicalVisit',
            referenceId: appointment._id,
            patientId: pId,
            status: 'Unread'
        });

        // Emit socket notifications with populated admission data
        const io = req.app.get('io');
        if (io) {
            io.to('receptionist').emit('admission_created', populatedAdmission);
            io.to('reception').emit('admission_created', populatedAdmission);
            io.to('receptionist').emit('new_notification', notif);
            io.to('reception').emit('new_notification', notif);

            const hId = req.user.hospitalId || appointment.hospitalId;
            if (hId) {
                const hospRoom = `hospital_${hId}`;
                io.to(`${hospRoom}_receptionist`).to(`${hospRoom}_reception`).emit('admission_created', populatedAdmission);
                io.to(`${hospRoom}_receptionist`).to(`${hospRoom}_reception`).emit('new_notification', notif);
            }
        }

        res.json({ success: true, message: 'Admission recommended successfully', appointment, admission: existingAdmission });
    } catch (err) {
        console.error('[recommend-admission] Error:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// DELETE /appointments/:id/recommend-admission
router.delete('/appointments/:id/recommend-admission', verifyToken, resolveTenant, async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const { Appointment, User } = getModels(req);

        const findQuery = { _id: appointmentId };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;

        const appointment = await Appointment.findOne(findQuery);
        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        // Get Admission record to check if it's already allocated/admitted
        const hospitalId = req.user.hospitalId || appointment.hospitalId;
        const { getTenantConnection } = require('../db/tenantDb');
        const { getTenantModels } = require('../db/tenantModels');
        const MasterAdmission = require('../models/admission.model');

        let AdmissionModel = MasterAdmission;
        if (hospitalId) {
            try {
                const tenantDb = await getTenantConnection(String(hospitalId));
                if (tenantDb) {
                    AdmissionModel = getTenantModels(tenantDb).Admission;
                }
            } catch (err) {
                console.error('[cancel-recommend-admission] Tenant DB connection failed:', err);
            }
        }

        const activeAdmission = await AdmissionModel.findOne({
            appointmentId: appointment._id,
            status: { $ne: 'Discharged' }
        });

        if (activeAdmission && activeAdmission.status !== 'Pending Allocation') {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel admission request. Patient has already been allocated ward ${activeAdmission.ward} and bed ${activeAdmission.bedNumber}.`
            });
        }

        appointment.recommendAdmission = false;
        appointment.recommendAdmissionNotes = '';
        appointment.recommendAdmissionPriority = 'Normal';
        appointment.recommendAdmissionDept = '';
        if (appointment.status === 'Admitted') {
            appointment.status = 'completed';
        }
        await appointment.save();

        if (activeAdmission) {
            await AdmissionModel.deleteOne({ _id: activeAdmission._id });
        }

        const doctorName = appointment.doctorName || 'Doctor';
        let pId = appointment.patientId || 'N/A';
        let pName = 'Patient';
        if (appointment.userId) {
            const pUser = await User.findById(appointment.userId);
            if (pUser) {
                pId = pUser.patientId || pId;
                pName = pUser.name || pName;
            }
        }

        const Notification = require('../models/notification.model');
        const notif = await Notification.create({
            senderId: req.user.id,
            hospitalId: req.user.hospitalId || appointment.hospitalId,
            recipientRole: 'receptionist',
            message: `Dr. ${doctorName} has cancelled the admission request for Patient ${pName} (${pId}).`,
            referenceType: 'ClinicalVisit',
            referenceId: appointment._id,
            patientId: pId,
            status: 'Unread'
        });

        const io = req.app.get('io');
        if (io) {
            io.to('receptionist').emit('admission_discharged', { appointmentId: appointment._id });
            io.to('reception').emit('admission_discharged', { appointmentId: appointment._id });
            io.to('receptionist').emit('new_notification', notif);
            io.to('reception').emit('new_notification', notif);

            const hId = req.user.hospitalId || appointment.hospitalId;
            if (hId) {
                const hospRoom = `hospital_${hId}`;
                io.to(`${hospRoom}_receptionist`).to(`${hospRoom}_reception`).emit('admission_discharged', { appointmentId: appointment._id });
                io.to(`${hospRoom}_receptionist`).to(`${hospRoom}_reception`).emit('new_notification', notif);
            }
        }

        res.json({ success: true, message: 'Admission recommendation cancelled successfully', appointment });
    } catch (err) {
        console.error('[cancel-recommend-admission] Error:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;