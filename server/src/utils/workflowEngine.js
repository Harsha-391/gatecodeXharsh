const { getTenantModels } = require('../db/tenantModels');

const VALID_TRANSITIONS = {
    'Registered': ['Waiting', 'Cancelled'],
    'Waiting': ['Consultation', 'Cancelled', 'No Show'],
    'Consultation': ['Lab Ordered', 'Medicine Pending', 'Billing Pending', 'Cancelled', 'Admitted', 'Payment Completed'],
    'Lab Ordered': ['Sample Collected', 'Cancelled'],
    'Sample Collected': ['Testing'],
    'Testing': ['Report Ready'],
    'Report Ready': ['Medicine Pending', 'Billing Pending'],
    'Medicine Pending': ['Billing Pending'],
    'Billing Pending': ['Payment Completed'],
    'Payment Completed': ['Discharged', 'Follow-up Scheduled'],
    'Discharged': ['Follow-up Scheduled'],
    'Admitted': ['Billing Pending', 'Discharged', 'Cancelled'],
    'Cancelled': [],
    'No Show': []
};

// Department and Role assignments per status
const STATE_OWNERSHIP = {
    'Registered': { department: 'reception', role: 'receptionist', targetSLA: 15 },
    'Waiting': { department: 'nursing', role: 'nurse', targetSLA: 15 },
    'Consultation': { department: 'doctor', role: 'doctor', targetSLA: 20 },
    'Lab Ordered': { department: 'lab', role: 'lab technician', targetSLA: 15 },
    'Sample Collected': { department: 'lab', role: 'lab technician', targetSLA: 15 },
    'Testing': { department: 'lab', role: 'lab technician', targetSLA: 60 },
    'Report Ready': { department: 'doctor', role: 'doctor', targetSLA: 15 },
    'Medicine Pending': { department: 'pharmacy', role: 'pharmacist', targetSLA: 15 },
    'Billing Pending': { department: 'billing', role: 'cashier', targetSLA: 10 },
    'Payment Completed': { department: 'reception', role: 'receptionist', targetSLA: 10 },
    'Discharged': { department: 'reception', role: 'receptionist', targetSLA: 10 },
    'Admitted': { department: 'ward', role: 'nurse', targetSLA: 1440 },
    'Cancelled': { department: 'reception', role: 'receptionist', targetSLA: 0 },
    'No Show': { department: 'reception', role: 'receptionist', targetSLA: 0 },
    'Follow-up Scheduled': { department: 'reception', role: 'receptionist', targetSLA: 0 }
};

const generateEncounterNumber = () => {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randPart = Math.floor(1000 + Math.random() * 9000);
    return `ENC-${datePart}-${randPart}`;
};

/**
 * Validates transition from current status to target status
 */
function validateTransition(currentStatus, targetStatus) {
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
        throw new Error(`Invalid transition from status '${currentStatus}' to '${targetStatus}'.`);
    }
}

/**
 * Create a new PatientEncounter visit context
 */
async function createEncounter(req, patientId, encounterType = 'OPD') {
    if (!req.tenantDb) {
        throw new Error('Tenant DB connection is required to create encounters.');
    }
    const { PatientEncounter } = getTenantModels(req.tenantDb);
    const encounter = new PatientEncounter({
        hospitalId: req.user.hospitalId,
        patientId,
        encounterType,
        encounterNumber: generateEncounterNumber(),
        currentStatus: 'Registered'
    });
    await encounter.save();
    return encounter;
}

/**
 * Core Workflow Engine transition handler (Encounter-centric)
 */
async function executeTransition(req, encounterId, targetStatus, eventTitle, description = '', attachments = []) {
    if (!req.tenantDb) {
        throw new Error('Tenant DB connection is required to process workflow transitions.');
    }

    const { PatientEncounter, PatientTimeline, Invoice, LabReport, PharmacyOrder, Appointment, AuditLog } = getTenantModels(req.tenantDb);
    const hospitalId = req.user.hospitalId;

    // 1. Locate encounter
    const encounter = await PatientEncounter.findById(encounterId);
    if (!encounter) {
        throw new Error('Encounter context not found.');
    }

    const currentStatus = encounter.currentStatus;
    const patientId = encounter.patientId;

    // 2. Idempotency Check: if state matches, return immediately
    if (currentStatus === targetStatus) {
        return encounter;
    }

    // 3. Validate transition sequence
    validateTransition(currentStatus, targetStatus);

    // 4. Clinical checks and restrictions
    if (targetStatus === 'Discharged') {
        // Cannot discharge patient with outstanding payments
        const pendingInvoice = await Invoice.findOne({ patientId, paymentStatus: { $in: ['Pending', 'Partially Paid'] } });
        if (pendingInvoice) {
            throw new Error('Cannot discharge patient with outstanding billing balances.');
        }
    }

    if (targetStatus === 'Testing' || targetStatus === 'Report Ready') {
        // Cannot process report before sample collection
        const labReport = await LabReport.findOne({ userId: patientId });
        if (labReport && !labReport.sampleCollected && labReport.testStatus === 'PENDING') {
            throw new Error('Cannot progress testing or reports before sample collection is logged.');
        }
    }

    if (targetStatus === 'Cancelled' && currentStatus === 'Consultation') {
        const appt = await Appointment.findOne({ userId: patientId, status: 'completed' });
        if (appt) {
            throw new Error('Cannot cancel a completed consultation.');
        }
    }

    // Billing Pending gate rules
    if (targetStatus === 'Billing Pending') {
        // Check outstanding lab reports
        const pendingLabs = await LabReport.find({
            userId: patientId,
            testStatus: { $in: ['PENDING', 'IN_PROGRESS'] }
        });
        if (pendingLabs.length > 0) {
            throw new Error('Cannot transition to Billing Pending: outstanding lab test results are not complete.');
        }

        // Check outstanding pharmacy orders
        const pendingPharmacy = await PharmacyOrder.find({
            userId: patientId,
            orderStatus: { $in: ['Upcoming', 'Pending'] }
        });
        if (pendingPharmacy.length > 0) {
            throw new Error('Cannot transition to Billing Pending: outstanding pharmacy orders are not completed.');
        }
    }

    // 5. Calculate transition metrics
    const transitionStart = encounter.waitingSince || encounter.createdAt || new Date();
    const transitionEnd = new Date();
    const durationMs = transitionEnd.getTime() - transitionStart.getTime();

    // 6. Update workflow ownership and status
    encounter.currentStatus = targetStatus;
    const ownership = STATE_OWNERSHIP[targetStatus] || { department: 'reception', role: 'receptionist', targetSLA: 15 };
    encounter.currentDepartment = ownership.department;
    encounter.assignedRole = ownership.role;
    encounter.targetSLA = ownership.targetSLA;
    encounter.waitingSince = transitionEnd;
    encounter.escalationLevel = 0;

    await encounter.save();

    // 7. Append Timeline entry (Immutable logger with transition duration metrics)
    const timelineEntry = new PatientTimeline({
        hospitalId,
        patientId,
        encounterId: encounter._id,
        eventType: targetStatus.toUpperCase(),
        title: eventTitle,
        description,
        userId: req.user.id,
        userName: req.user.name || 'Clinical Staff',
        department: ownership.department,
        attachments,
        transitionStart,
        transitionEnd,
        durationMs,
        workflowVersion: '1.0.0',
        transitionVersion: '1.0'
    });
    await timelineEntry.save();

    // 8. Log transaction to AuditLog
    await AuditLog.create({
        clinicId: hospitalId,
        userId: req.user.id,
        userName: req.user.name || 'System',
        userEmail: req.user.email || '',
        role: req.user.role || '',
        action: 'PATIENT_ACCESS',
        severity: 'info',
        targetModel: 'PatientEncounter',
        targetId: encounter._id,
        targetLabel: `Status transition: ${currentStatus} -> ${targetStatus}`,
        success: true
    });

    // 9. Trigger socket notification
    const io = req.app.get('socketio');
    if (io) {
        const payload = {
            encounterId: encounter._id,
            patientId,
            encounterNumber: encounter.encounterNumber,
            currentStatus: targetStatus,
            department: ownership.department
        };
        // Emit to hospital room
        io.to(`hospital_${hospitalId}`).emit('workflow_update', payload);
        // Emit to department specific room
        io.to(`hospital_${hospitalId}_${ownership.department}`).emit('workflow_update', payload);
    }

    return encounter;
}

module.exports = {
    validateTransition,
    createEncounter,
    executeTransition,
    VALID_TRANSITIONS
};
