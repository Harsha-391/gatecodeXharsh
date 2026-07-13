const { getTenantModels } = require('../db/tenantModels');
const { executeTransition } = require('../utils/workflowEngine');

/**
 * Scan all active encounters for a specific hospital tenant and trigger SLA rules/escalations
 */
async function checkActiveEncounters(req, hospitalId) {
    if (!req.tenantDb) {
        throw new Error('Tenant DB connection is required for workflow scheduler checks.');
    }

    const { PatientEncounter, WorkflowConfig, PatientTimeline, AuditLog } = getTenantModels(req.tenantDb);

    // 1. Fetch or create workflow configurations
    let config = await WorkflowConfig.findOne({ hospitalId });
    if (!config) {
        config = new WorkflowConfig({ hospitalId });
        await config.save();
    }

    // 2. Fetch all active (non-archived, non-finalized) encounters
    const activeEncounters = await PatientEncounter.find({
        hospitalId,
        isArchived: false,
        currentStatus: { $nin: ['Discharged', 'Cancelled', 'No Show'] }
    });

    console.log(`[Workflow Scheduler] Running active checks. Active Encounters found: ${activeEncounters.length}`);

    const systemUserReq = {
        ...req,
        user: {
            id: req.user?.id || config._id, // use config ID if system-triggered
            name: req.user?.name || 'Workflow Scheduler',
            email: req.user?.email || 'system@hms.com',
            role: req.user?.role || 'admin',
            hospitalId
        }
    };

    for (const encounter of activeEncounters) {
        const currentStatus = encounter.currentStatus;
        const waitDurationMins = Math.round((Date.now() - new Date(encounter.waitingSince).getTime()) / 60000);
        
        // Fetch target SLA limit
        const slaLimit = config.slas.get(currentStatus) || 15;
        const overdueMins = waitDurationMins - slaLimit;

        // A. AUTOMATED ADMINISTRATIVE ACTIONS
        // 1. Appointment No-Show (Waiting room timeout > 120m)
        if (currentStatus === 'Waiting' && waitDurationMins >= 120) {
            console.log(`[Scheduler Action] Auto-closing encounter ${encounter.encounterNumber} due to No-Show.`);
            try {
                await executeTransition(
                    systemUserReq,
                    encounter._id,
                    'No Show',
                    'No-Show Auto-Closure',
                    'System auto-closure: Patient waiting time exceeded no-show limit (120 min) without consultation start.'
                );
            } catch (err) {
                console.error(`Auto-closure error for encounter ${encounter.encounterNumber}:`, err.message);
            }
            continue; // move to next encounter
        }

        // 2. Expired Lab Order (Lab Ordered > 24 hours)
        if (currentStatus === 'Lab Ordered' && waitDurationMins >= 1440) {
            console.log(`[Scheduler Action] Expiring lab order for encounter ${encounter.encounterNumber}.`);
            try {
                await executeTransition(
                    systemUserReq,
                    encounter._id,
                    'Cancelled',
                    'Lab Order Expired',
                    'System auto-closure: Lab sample collection time window expired (24 hours).'
                );
            } catch (err) {
                console.error(`Auto-expiration error for encounter ${encounter.encounterNumber}:`, err.message);
            }
            continue;
        }

        // 3. Payment Completed Auto-Discharge (Completed Payment > 15 minutes)
        if (currentStatus === 'Payment Completed' && waitDurationMins >= 15) {
            console.log(`[Scheduler Action] Auto-discharging encounter ${encounter.encounterNumber}.`);
            try {
                await executeTransition(
                    systemUserReq,
                    encounter._id,
                    'Discharged',
                    'System Auto-Discharge',
                    'System auto-discharge: Payment settled and patient cleared to leave.'
                );
            } catch (err) {
                console.error(`Auto-discharge error for encounter ${encounter.encounterNumber}:`, err.message);
            }
            continue;
        }

        // B. ESCALATION ACTIONS
        if (overdueMins > 0) {
            const l1 = config.escalationThresholds.get('1') || 10;
            const l2 = config.escalationThresholds.get('2') || 20;
            const l3 = config.escalationThresholds.get('3') || 30;

            let newEscLevel = 0;
            let escalationMsg = '';
            let targetRole = '';

            if (overdueMins >= l3) {
                newEscLevel = 3;
                escalationMsg = `L3 Critical Alert: Encounter ${encounter.encounterNumber} has been in '${currentStatus}' for ${waitDurationMins} minutes (SLA: ${slaLimit}m, Overdue: ${overdueMins}m).`;
                targetRole = 'admin';
            } else if (overdueMins >= l2) {
                newEscLevel = 2;
                escalationMsg = `L2 Warning Alert: Encounter ${encounter.encounterNumber} has been in '${currentStatus}' for ${waitDurationMins} minutes (SLA: ${slaLimit}m, Overdue: ${overdueMins}m).`;
                targetRole = 'doctor';
            } else if (overdueMins >= l1) {
                newEscLevel = 1;
                escalationMsg = `L1 Notification Alert: Encounter ${encounter.encounterNumber} has been in '${currentStatus}' for ${waitDurationMins} minutes (SLA: ${slaLimit}m, Overdue: ${overdueMins}m).`;
                targetRole = 'nursing';
            }

            // Trigger escalation update if it increases
            if (newEscLevel > encounter.escalationLevel) {
                encounter.escalationLevel = newEscLevel;
                await encounter.save();

                // Append alert details to immutable timeline
                const timelineEntry = new PatientTimeline({
                    hospitalId,
                    patientId: encounter.patientId,
                    encounterId: encounter._id,
                    eventType: 'SYSTEM_ALERT',
                    title: `SLA Escalation Level ${newEscLevel} Triggered`,
                    description: escalationMsg,
                    userId: systemUserReq.user.id,
                    userName: 'Workflow Scheduler',
                    department: 'system',
                    attachments: [],
                    transitionStart: encounter.waitingSince,
                    transitionEnd: new Date(),
                    durationMs: Date.now() - new Date(encounter.waitingSince).getTime(),
                    workflowVersion: '1.0.0',
                    transitionVersion: '1.0'
                });
                await timelineEntry.save();

                // AuditLog register
                await AuditLog.create({
                    clinicId: hospitalId,
                    userId: systemUserReq.user.id,
                    userName: 'Workflow Scheduler',
                    userEmail: 'system@hms.com',
                    role: 'system',
                    action: 'PATIENT_ACCESS',
                    severity: 'warning',
                    targetModel: 'PatientEncounter',
                    targetId: encounter._id,
                    targetLabel: `Escalation L${newEscLevel} logged for ${encounter.encounterNumber}`,
                    success: true
                });

                // Socket broadcast
                const io = req.app.get('socketio');
                if (io) {
                    io.to(`hospital_${hospitalId}`).emit('sla_escalation', {
                        encounterId: encounter._id,
                        encounterNumber: encounter.encounterNumber,
                        currentStatus,
                        escalationLevel: newEscLevel,
                        message: escalationMsg
                    });
                    if (targetRole) {
                        io.to(`hospital_${hospitalId}_${targetRole}`).emit('sla_escalation', {
                            encounterId: encounter._id,
                            encounterNumber: encounter.encounterNumber,
                            currentStatus,
                            escalationLevel: newEscLevel,
                            message: escalationMsg
                        });
                    }
                }
            }
        }
    }
}

module.exports = {
    checkActiveEncounters
};
