const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const { executeTransition } = require('../utils/workflowEngine');

// 1. GET DEPARTMENT QUEUE
router.get('/queue', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { PatientEncounter } = getTenantModels(req.tenantDb);
        const hospitalId = req.user.hospitalId;
        const { department, status } = req.query;

        const query = { hospitalId, isArchived: false };
        if (department) query.currentDepartment = department;
        if (status) query.currentStatus = status;

        const rawEncounters = await PatientEncounter.find(query)
            .populate('patientId', 'name phone email gender dob')
            .sort({ waitingSince: 1 });

        const mappedEncounters = rawEncounters.map((enc, idx) => {
            const waitingTime = Math.round((Date.now() - new Date(enc.waitingSince).getTime()) / 60000); // in minutes
            const slaRemaining = Math.max(0, (enc.targetSLA || 15) - waitingTime);

            let age = null;
            if (enc.patientId && enc.patientId.dob) {
                const birth = new Date(enc.patientId.dob);
                age = new Date().getFullYear() - birth.getFullYear();
            }

            return {
                ...enc.toObject(),
                waitingTime,
                slaRemaining,
                queuePosition: idx + 1,
                priority: enc.priority || 'medium',
                age,
                gender: enc.patientId ? enc.patientId.gender : 'Unknown'
            };
        });

        res.json({ success: true, count: mappedEncounters.length, data: mappedEncounters });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. GET PATIENT TIMELINE
router.get('/:patientId/timeline', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { PatientTimeline } = getTenantModels(req.tenantDb);
        const timeline = await PatientTimeline.find({ patientId: req.params.patientId })
            .sort({ createdAt: 1 });

        res.json({ success: true, count: timeline.length, data: timeline });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. MANUAL STATUS TRANSITION
router.post('/transition', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { patientId, targetStatus, eventTitle, description, attachments } = req.body;
        if (!patientId || !targetStatus || !eventTitle) {
            return res.status(400).json({ success: false, message: 'patientId, targetStatus, and eventTitle are required.' });
        }

        const encounter = await executeTransition(
            req,
            patientId,
            targetStatus,
            eventTitle,
            description,
            attachments
        );

        res.json({ success: true, message: 'Workflow transitioned successfully', data: encounter });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// 4. GET QUEUE HEALTH MONITOR STATS
router.get('/health-monitor', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { PatientEncounter, WorkflowConfig } = getTenantModels(req.tenantDb);
        const hospitalId = req.user.hospitalId;

        let config = await WorkflowConfig.findOne({ hospitalId });
        if (!config) {
            config = new WorkflowConfig({ hospitalId });
            await config.save();
        }

        const encounters = await PatientEncounter.find({ hospitalId, isArchived: false });

        // Calculate waiting timers and compliance metrics
        const totals = {};
        const counts = {};
        let longestWaitMs = 0;
        let backlog = 0;
        let complianceCount = 0;

        encounters.forEach(enc => {
            const waitTimeMs = Date.now() - new Date(enc.waitingSince).getTime();
            const waitMins = Math.round(waitTimeMs / 60000);
            const dept = enc.currentDepartment || 'reception';

            totals[dept] = (totals[dept] || 0) + waitMins;
            counts[dept] = (counts[dept] || 0) + 1;

            if (waitTimeMs > longestWaitMs) {
                longestWaitMs = waitTimeMs;
            }

            const slaLimit = config.slas.get(enc.currentStatus) || 15;
            if (waitMins > slaLimit) {
                backlog++;
            } else {
                complianceCount++;
            }
        });

        const avgWaitTimeByDept = {};
        Object.keys(counts).forEach(dept => {
            avgWaitTimeByDept[dept] = Math.round(totals[dept] / counts[dept]);
        });

        const complianceRate = encounters.length > 0 ? Math.round((complianceCount / encounters.length) * 100) : 100;

        res.json({
            success: true,
            data: {
                totalActiveEncounters: encounters.length,
                avgWaitTimeByDept,
                longestWaitMinutes: Math.round(longestWaitMs / 60000),
                queueBacklog: backlog,
                slaComplianceRate: complianceRate
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. GET SLA & ESCALATION CONFIG
router.get('/config', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { WorkflowConfig } = getTenantModels(req.tenantDb);
        const hospitalId = req.user.hospitalId;
        let config = await WorkflowConfig.findOne({ hospitalId });
        if (!config) {
            config = new WorkflowConfig({ hospitalId });
            await config.save();
        }
        res.json({ success: true, data: config });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 6. UPDATE SLA & ESCALATION CONFIG
router.put('/config', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { WorkflowConfig } = getTenantModels(req.tenantDb);
        const hospitalId = req.user.hospitalId;
        const { slas, escalationThresholds, reminderIntervalMinutes } = req.body;

        let config = await WorkflowConfig.findOne({ hospitalId });
        if (!config) {
            config = new WorkflowConfig({ hospitalId });
        }

        if (slas) config.slas = slas;
        if (escalationThresholds) config.escalationThresholds = escalationThresholds;
        if (reminderIntervalMinutes !== undefined) config.reminderIntervalMinutes = reminderIntervalMinutes;

        await config.save();
        res.json({ success: true, message: 'Workflow config updated successfully', data: config });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// 7. MANUAL SCHEDULER EXECUTION
router.post('/trigger-scheduler', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { checkActiveEncounters } = require('../jobs/workflowScheduler');
        const hospitalId = req.user.hospitalId;
        await checkActiveEncounters(req, hospitalId);
        res.json({ success: true, message: 'Workflow scheduler executed successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
