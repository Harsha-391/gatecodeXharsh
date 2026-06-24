const express = require('express');
const router = express.Router();
const multer = require('multer');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const Lab = require('../models/lab.model');
const Doctor = require('../models/doctor.model');
const { verifyToken } = require('../middleware/auth.middleware');
const imagekit = require('../utils/imagekit');
const validateFileType = require('../utils/validateFileType');
const auditLog = require('../middleware/audit.middleware');

const getModels = (req) => {
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return {
            LabReport: m.LabReport,
            Appointment: m.Appointment,
            User: m.User,
            HospitalPatient: m.HospitalPatient,
            LabTest: m.LabTest,
            Lab: m.Lab,
            Doctor: m.Doctor,
            Notification: m.Notification
        };
    }
    return {
        LabReport: require('../models/labReport.model'),
        Appointment: require('../models/appointment.model'),
        User: require('../models/user.model'),
        HospitalPatient: require('../models/hospitalPatient.model'),
        LabTest: require('../models/labTest.model'),
        Lab: require('../models/lab.model'),
        Doctor: require('../models/doctor.model'),
        Notification: require('../models/notification.model')
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

// MIDDLEWARE: Verify User is a Lab
const verifyLab = async (req, res, next) => {
    const roleName = req.user._roleData ? req.user._roleData.name.toLowerCase() : String(req.user.role).toLowerCase();
    const permissions = req.user._roleData?.permissions || [];

    if (!roleName.includes('lab') && 
        !roleName.includes('admin') && 
        !roleName.includes('accountant') &&
        !permissions.includes('accountant_view') &&
        !permissions.includes('accountant_manage') &&
        !permissions.includes('lab_view') &&
        !permissions.includes('lab_manage') &&
        !permissions.includes('*')) {
        return res.status(403).json({ message: 'Access denied. Lab personnel only.' });
    }
    next();
};

const verifyLabOrReportsView = async (req, res, next) => {
    const roleName = req.user._roleData ? req.user._roleData.name.toLowerCase() : String(req.user.role).toLowerCase();
    const permissions = req.user._roleData?.permissions || [];

    if (!roleName.includes('lab') && 
        !roleName.includes('admin') && 
        !roleName.includes('accountant') &&
        !permissions.includes('accountant_view') &&
        !permissions.includes('accountant_manage') &&
        !permissions.includes('lab_view') &&
        !permissions.includes('lab_manage') &&
        !permissions.includes('lab_reports_view') &&
        !permissions.includes('*')) {
        return res.status(403).json({ message: 'Access denied. Lab personnel only.' });
    }
    next();
};

// 1. GET LAB DASHBOARD STATS
router.get('/stats', verifyToken, resolveTenant, verifyLab, async (req, res) => {
    try {
        const { LabReport, Lab } = getModels(req);
        const hid = req.user.hospitalId;
        const hospitalFilter = hid ? { hospitalId: hid } : {};

        const labProfile = await Lab.findOne({
            $or: [{ email: req.user.email }, { userId: req.user.id }]
        });

        let labFilter = { ...hospitalFilter };
        if (labProfile) {
            labFilter = { ...hospitalFilter, $or: [{ labId: labProfile._id }, { labId: null }, { labId: { $exists: false } }] };
        } else {
            labFilter = { ...hospitalFilter, $or: [{ labId: null }, { labId: { $exists: false } }] };
        }

        // Count statuses with fallbacks for legacy data
        const pending = await LabReport.countDocuments({
            ...labFilter,
            $or: [{ status: 'Pending' }, { status: { $exists: false }, reportStatus: 'PENDING' }]
        });
        
        const collected = await LabReport.countDocuments({
            ...labFilter,
            status: 'Sample Collected'
        });

        const inTesting = await LabReport.countDocuments({
            ...labFilter,
            $or: [{ status: 'In Testing' }, { status: { $exists: false }, testStatus: 'IN_PROGRESS' }]
        });

        const reportReady = await LabReport.countDocuments({
            ...labFilter,
            $or: [{ status: 'Report Ready' }, { status: { $exists: false }, reportStatus: 'UPLOADED' }]
        });

        const completed = await LabReport.countDocuments({
            ...labFilter,
            status: 'Completed'
        });

        const cancelled = await LabReport.countDocuments({
            ...labFilter,
            $or: [{ status: 'Cancelled' }, { status: { $exists: false }, reportStatus: 'CANCELLED' }]
        });

        // Total orders is the sum of active/completed categories (excluding cancelled)
        const total = pending + collected + inTesting + reportReady + completed;

        // Dynamically calculate revenue by fetching individual test prices
        const completedReports = await LabReport.find({
            ...labFilter,
            $or: [{ status: { $in: ['Report Ready', 'Completed'] } }, { status: { $exists: false }, reportStatus: 'UPLOADED' }]
        });
        
        const { LabTest } = getModels(req);
        const isTenant = !!req.tenantDb;
        const allTests = await LabTest.find();
        
        let revenue = 0;
        completedReports.forEach(report => {
            if (report.amount && report.amount > 0) {
                revenue += report.amount; // Use pre-calculated amount if available
            } else {
                (report.testNames || []).forEach(testName => {
                    const testObj = allTests.find(t => t.name.trim().toLowerCase() === testName.trim().toLowerCase());
                    if (testObj) {
                        if (isTenant) {
                            revenue += testObj.price || 0;
                        } else {
                            const hospitalStrId = hid ? hid.toString() : null;
                            if (hospitalStrId && testObj.hospitalPrices && testObj.hospitalPrices.has && testObj.hospitalPrices.has(hospitalStrId)) {
                                revenue += testObj.hospitalPrices.get(hospitalStrId) || 0;
                            } else if (hospitalStrId && testObj.hospitalPrices && typeof testObj.hospitalPrices === 'object' && testObj.hospitalPrices[hospitalStrId]) {
                                revenue += testObj.hospitalPrices[hospitalStrId];
                            } else {
                                revenue += testObj.price || 0;
                            }
                        }
                    } else {
                        revenue += 500; // Fallback if test no longer exists
                    }
                });
            }
        });

        res.json({
            success: true,
            stats: {
                pending, // backward compatibility
                completed, // backward compatibility
                inProgress: inTesting, // backward compatibility
                total,
                revenue,
                labName: labProfile?.name || 'Lab',
                // New stats keys
                totalOrders: total + cancelled,
                pendingSamples: pending,
                collectedSamples: collected,
                inTesting,
                reportsReady: reportReady
            }
        });
    } catch (error) {
        console.error("[lab] stats error", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 1b. GET MY ASSIGNED REPORTS
router.get('/my-reports', verifyToken, resolveTenant, verifyLabOrReportsView, async (req, res) => {
    try {
        const { LabReport, Lab, Doctor } = getModels(req);
        const hid = req.user.hospitalId;
        const hospitalFilter = hid ? { hospitalId: hid } : {};

        const labProfile = await Lab.findOne({
            $or: [{ email: req.user.email }, { userId: req.user.id }]
        });

        let query = { ...hospitalFilter };
        if (labProfile) {
            query.$or = [{ labId: labProfile._id }, { labId: null }, { labId: { $exists: false } }];
        } else {
            query.$or = [{ labId: null }, { labId: { $exists: false } }];
        }

        const reports = await LabReport.find(query)
            .populate('userId', 'name email phone patientId')
            .populate({ path: 'doctorId', model: Doctor, select: 'name' })
            .sort({ createdAt: -1 });

        res.json({ success: true, reports });
    } catch (error) {
        console.error("[lab] fetch my-reports error", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 2. GET ASSIGNED REQUESTS (Pending or All)
router.get('/requests', verifyToken, resolveTenant, verifyLabOrReportsView, async (req, res) => {
    try {
        const { LabReport, User, HospitalPatient, Lab, Doctor } = getModels(req);
        const { status, search } = req.query;
        const hid = req.user.hospitalId;
        const hospitalFilter = hid ? { hospitalId: hid } : {};

        const labProfile = await Lab.findOne({
            $or: [{ email: req.user.email }, { userId: req.user.id }]
        });

        let query = { ...hospitalFilter };
        if (labProfile) {
            query.$or = [{ labId: labProfile._id }, { labId: null }, { labId: { $exists: false } }];
        } else {
            query.$or = [{ labId: null }, { labId: { $exists: false } }];
        }

        // Map status query parameter with legacy fallbacks
        if (status && status !== 'all') {
            const statusUpper = status.toUpperCase();
            if (statusUpper === 'PENDING') {
                query.$or = [{ status: 'Pending' }, { status: { $exists: false }, reportStatus: 'PENDING' }];
            } else if (statusUpper === 'SAMPLE COLLECTED' || statusUpper === 'SAMPLE_COLLECTED') {
                query.status = 'Sample Collected';
            } else if (statusUpper === 'IN TESTING' || statusUpper === 'IN_PROGRESS') {
                query.$or = [{ status: 'In Testing' }, { status: { $exists: false }, testStatus: 'IN_PROGRESS' }];
            } else if (statusUpper === 'REPORT READY' || statusUpper === 'REPORT_READY') {
                query.$or = [{ status: 'Report Ready' }, { status: { $exists: false }, reportStatus: 'UPLOADED' }];
            } else if (statusUpper === 'COMPLETED') {
                query.status = 'Completed';
            } else if (statusUpper === 'CANCELLED') {
                query.status = 'Cancelled';
            }
        }

        // Add search query criteria
        if (search && search.trim()) {
            const mongoose = require('mongoose');
            const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Find patient users matching name or patientId
            const userQuery = {
                $or: [
                    { name: { $regex: safeSearch, $options: 'i' } },
                    { patientId: { $regex: safeSearch, $options: 'i' } }
                ]
            };
            if (hid) userQuery.hospitalId = hid;
            const users = await HospitalPatient.find(userQuery).select('_id');
            const userIds = users.map(u => u._id);

            const searchConditions = [
                { userId: { $in: userIds } },
                { patientId: { $regex: safeSearch, $options: 'i' } }
            ];

            if (mongoose.Types.ObjectId.isValid(search.trim())) {
                searchConditions.push({ _id: search.trim() });
            }

            query.$and = query.$and || [];
            query.$and.push({ $or: searchConditions });
        }

        const requests = await LabReport.find(query)
            .populate('userId', 'name email phone patientId')
            .populate({ path: 'doctorId', model: Doctor, select: 'name' })
            .sort({ createdAt: -1 });

        // Map legacy report status values dynamically for backward compatibility
        const enrichedRequests = requests.map(req => {
            const rObj = req.toObject();
            if (!rObj.status || rObj.status === 'Pending') {
                if (rObj.reportStatus === 'CANCELLED') {
                    rObj.status = 'Cancelled';
                } else if (rObj.reportStatus === 'UPLOADED') {
                    rObj.status = 'Report Ready';
                } else if (rObj.testStatus === 'IN_PROGRESS') {
                    rObj.status = 'In Testing';
                } else if (rObj.sampleCollected) {
                    rObj.status = 'Sample Collected';
                } else {
                    rObj.status = 'Pending';
                }
            }
            return rObj;
        });

        res.json({ success: true, requests: enrichedRequests });
    } catch (error) {
        console.error("[lab] fetch requests error", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 3. UPLOAD TEST REPORT
router.post('/upload-report/:reportId', verifyToken, resolveTenant, verifyLab, upload.single('reportFile'), auditLog('UPDATE_PRESCRIPTION', (req) => ({ model: 'LabReport', id: req.params.reportId, label: 'Lab report uploaded' }), { dataCategory: 'PHI' }), async (req, res) => {
    try {
        const { LabReport, Appointment, Notification } = getModels(req);
        const { reportId } = req.params;
        const { notes } = req.body;

        if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

        const typeErr = await validateFileType(req.file, ALLOWED_MIMES);
        if (typeErr) return res.status(400).json({ success: false, message: typeErr });

        // RLS: scope by hospitalId so lab staff can only upload to their hospital's reports
        const reportFilter = { _id: reportId };
        if (req.user.hospitalId) reportFilter.hospitalId = req.user.hospitalId;
        const report = await LabReport.findOne(reportFilter);
        if (!report) return res.status(404).json({ message: 'Report request not found or access denied.' });

        // Upload to ImageKit
        const fileResult = await imagekit.upload({
            file: req.file.buffer,
            fileName: `lab_report_${report.patientId}_${Date.now()}`,
            folder: '/crm/lab_reports'
        });

        // Update Lab Report Status
        report.reportFile = {
            url: fileResult.url,
            fileId: fileResult.fileId,
            name: req.file.originalname,
            uploadedAt: new Date()
        };
        report.testStatus = 'DONE';
        report.reportStatus = 'UPLOADED';
        report.notes = notes || report.notes;
        
        // Update new status fields
        report.status = 'Report Ready';
        report.lastUpdatedBy = req.user.id;
        report.statusHistory.push({
            status: 'Report Ready',
            updatedAt: new Date(),
            updatedBy: req.user.id,
            updatedByName: req.user.name,
            notes: notes || 'Lab report uploaded successfully.'
        });

        await report.save();

        // OPTIONAL: Update Appointment to reflect report availability
        // This puts the file into the Doctor's view as well
        if (report.appointmentId) {
            const appointment = await Appointment.findById(report.appointmentId);
            if (appointment) {
                if (!appointment.prescriptions) appointment.prescriptions = [];
                appointment.prescriptions.push({
                    type: 'lab_report',
                    name: `Lab Report: ${report.testNames.join(', ')}`,
                    url: fileResult.url,
                    fileId: fileResult.fileId,
                    uploadedAt: new Date()
                });
                await appointment.save();
            }
        }

        const io = req.app.get('io');

        const notificationItem = new Notification({
            senderId: req.user.id,
            recipientRole: 'doctor',
            recipientId: report.doctorId,
            message: 'Lab results ready.',
            referenceType: 'LabReport',
            referenceId: report._id,
            patientId: report.patientId.toString()
        });
        await notificationItem.save();

        if (io) {
            io.to(report.doctorId.toString()).emit('new_notification', notificationItem);
            io.emit('sample_status_updated', {
                reportId: report._id,
                status: 'Report Ready'
            });
        }

        res.json({ success: true, message: 'Report uploaded successfully', report });

    } catch (error) {
        console.error("[lab] upload error", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 4. CREATE A NEW LAB TEST MANUALLY (Walk-in/Manual report creation)
router.post('/create', verifyToken, resolveTenant, verifyLab, upload.single('reportFile'), auditLog('CREATE_PRESCRIPTION', null, { dataCategory: 'PHI' }), async (req, res) => {
    try {
        const { LabReport, HospitalPatient, Notification } = getModels(req);
        const { patientId, testNames, amount, notes, paymentStatus, paymentMode, doctorId } = req.body;

        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required.' });
        }
        if (!testNames) {
            return res.status(400).json({ success: false, message: 'Test names are required.' });
        }

        const searchTerm = patientId.trim();
        const patientUser = await HospitalPatient.findOne({
            $or: [
                { patientId: searchTerm.toUpperCase() },
                { name: { $regex: new RegExp('^' + searchTerm + '$', 'i') } }
            ]
        });
        if (!patientUser) {
            return res.status(404).json({ success: false, message: `Patient with name or ID "${patientId}" not found.` });
        }

        const finalPatientId = patientUser.patientId || searchTerm.toUpperCase();

        let parsedTestNames = [];
        try {
            parsedTestNames = typeof testNames === 'string' ? JSON.parse(testNames) : testNames;
        } catch (_) {
            parsedTestNames = [testNames];
        }
        if (!Array.isArray(parsedTestNames)) {
            parsedTestNames = [parsedTestNames];
        }

        let fileResult = null;
        if (req.file) {
            const typeErr = await validateFileType(req.file, ALLOWED_MIMES);
            if (typeErr) return res.status(400).json({ success: false, message: typeErr });

            // Upload to ImageKit
            fileResult = await imagekit.upload({
                file: req.file.buffer,
                fileName: `lab_report_${finalPatientId}_${Date.now()}`,
                folder: '/crm/lab_reports'
            });
        }

        const report = new LabReport({
            patientId: finalPatientId,
            userId: patientUser._id,
            doctorId: doctorId || req.user.id, // Reference creator or assigned doctor
            hospitalId: req.user.hospitalId || null,
            testNames: parsedTestNames,
            testStatus: fileResult ? 'DONE' : 'PENDING',
            reportStatus: fileResult ? 'UPLOADED' : 'PENDING',
            paymentStatus: paymentStatus || 'PENDING',
            paymentMode: paymentMode || 'NONE',
            amount: Number(amount) || 0,
            notes: notes || '',
            status: fileResult ? 'Report Ready' : 'Pending',
            lastUpdatedBy: req.user.id,
            statusHistory: [{
                status: fileResult ? 'Report Ready' : 'Pending',
                updatedAt: new Date(),
                updatedBy: req.user.id,
                updatedByName: req.user.name,
                notes: notes || (fileResult ? 'Lab report registered with uploaded file.' : 'Lab report request registered.')
            }],
            reportFile: fileResult ? {
                url: fileResult.url,
                fileId: fileResult.fileId,
                name: req.file.originalname,
                uploadedAt: new Date()
            } : undefined
        });

        await report.save();

        // If report is already uploaded and doctor is assigned, notify that doctor
        if (fileResult && doctorId) {
            try {
                const io = req.app.get('io');

                const notificationItem = new Notification({
                    senderId: req.user.id,
                    recipientRole: 'doctor',
                    recipientId: doctorId,
                    message: 'New lab results uploaded.',
                    referenceType: 'LabReport',
                    referenceId: report._id,
                    patientId: finalPatientId
                });
                await notificationItem.save();

                if (io) {
                    io.to(doctorId.toString()).emit('new_notification', notificationItem);
                    io.emit('sample_status_updated', {
                        reportId: report._id,
                        status: 'Report Ready'
                    });
                }
            } catch (err) {
                console.error("Non-blocking manual report notification error:", err);
            }
        }

        res.status(201).json({
            success: true,
            message: 'Lab test report created successfully.',
            report
        });
    } catch (error) {
        console.error("Create manual lab report error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Cancel a pending lab test report
router.patch('/:id/cancel', verifyToken, resolveTenant, verifyLab, auditLog('UPDATE_PRESCRIPTION', (req) => ({ model: 'LabReport', id: req.params.id, label: 'Lab report cancelled' })), async (req, res) => {
    try {
        const { LabReport } = getModels(req);
        const report = await LabReport.findById(req.params.id);
        if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

        if (report.reportStatus !== 'PENDING' && report.status !== 'Pending') {
            return res.status(400).json({ success: false, message: 'Only pending reports can be cancelled' });
        }

        report.reportStatus = 'CANCELLED';
        report.status = 'Cancelled';
        report.lastUpdatedBy = req.user.id;
        
        report.statusHistory.push({
            status: 'Cancelled',
            updatedAt: new Date(),
            updatedBy: req.user.id,
            updatedByName: req.user.name,
            notes: 'Test request cancelled.'
        });

        await report.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('sample_status_updated', {
                reportId: report._id,
                status: 'Cancelled'
            });
        }

        res.json({ success: true, message: 'Test cancelled successfully', report });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 5. COLLECT SAMPLE FOR LAB ORDER
router.post('/:id/collect-sample', verifyToken, resolveTenant, verifyLab, auditLog('UPDATE_PRESCRIPTION', (req) => ({ model: 'LabReport', id: req.params.id, label: 'Sample collected' }), { dataCategory: 'PHI' }), async (req, res) => {
    try {
        const { LabReport } = getModels(req);
        const { id } = req.params;
        const { sampleType, collectionNotes, collectionTime } = req.body;

        if (!sampleType) {
            return res.status(400).json({ success: false, message: 'Sample type is required.' });
        }

        const report = await LabReport.findById(id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Lab report not found.' });
        }

        // Verify hospital access
        if (req.user.hospitalId && String(report.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Access denied: Mismatched hospital context.' });
        }

        report.sampleCollected = true;
        report.sampleCollectedAt = collectionTime ? new Date(collectionTime) : new Date();
        report.sampleCollectedBy = req.user.id;
        report.sampleType = sampleType;
        report.collectionNotes = collectionNotes || '';
        report.status = 'Sample Collected';
        report.lastUpdatedBy = req.user.id;

        // Push to statusHistory
        report.statusHistory.push({
            status: 'Sample Collected',
            updatedAt: new Date(),
            updatedBy: req.user.id,
            updatedByName: req.user.name,
            notes: collectionNotes || 'Sample collected successfully.'
        });

        await report.save();

        // Emit real-time events
        const io = req.app.get('io');
        if (io) {
            io.emit('sample_collected', {
                reportId: report._id,
                patientId: report.patientId,
                status: 'Sample Collected'
            });
            io.emit('sample_status_updated', {
                reportId: report._id,
                status: 'Sample Collected'
            });
        }

        res.json({ success: true, message: 'Sample collected successfully', report });
    } catch (error) {
        console.error("Collect sample error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 6. UPDATE LIFECYCLE STATUS FOR LAB ORDER (e.g. In Testing, Completed)
router.patch('/:id/status', verifyToken, resolveTenant, verifyLab, auditLog('UPDATE_PRESCRIPTION', (req) => ({ model: 'LabReport', id: req.params.id, label: `Lab status update` })), async (req, res) => {
    try {
        const { LabReport } = getModels(req);
        const { id } = req.params;
        const { status, notes } = req.body;

        const validStatuses = ['Pending', 'Sample Collected', 'In Testing', 'Report Ready', 'Completed', 'Cancelled'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status value.' });
        }

        const report = await LabReport.findById(id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Lab report not found.' });
        }

        // Verify hospital access
        if (req.user.hospitalId && String(report.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Access denied: Mismatched hospital context.' });
        }

        // Map backwards compatibility fields
        if (status === 'Sample Collected') {
            report.testStatus = 'PENDING';
        } else if (status === 'In Testing') {
            report.testStatus = 'IN_PROGRESS';
        } else if (status === 'Report Ready') {
            report.testStatus = 'DONE';
            report.reportStatus = 'UPLOADED';
        } else if (status === 'Completed') {
            report.testStatus = 'DONE';
            report.reportStatus = 'UPLOADED';
        } else if (status === 'Cancelled') {
            report.reportStatus = 'CANCELLED';
        }

        report.status = status;
        report.lastUpdatedBy = req.user.id;

        report.statusHistory.push({
            status,
            updatedAt: new Date(),
            updatedBy: req.user.id,
            updatedByName: req.user.name,
            notes: notes || `Status updated to ${status}.`
        });

        await report.save();

        // Emit real-time events
        const io = req.app.get('io');
        if (io) {
            io.emit('sample_status_updated', {
                reportId: report._id,
                status
            });
        }

        res.json({ success: true, message: `Status updated to ${status} successfully`, report });
    } catch (error) {
        console.error("Update status error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;