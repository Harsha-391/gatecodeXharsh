/**
 * No-Show Auto-Expiry Job
 * ─────────────────────────────────────────────────────
 * Runs every day at 23:30 (11:30 PM).
 *
 * For every active hospital in the system:
 *   - Connects to that hospital's tenant MongoDB database
 *   - Finds all appointments with status 'pending' or 'confirmed'
 *     whose appointmentDate is BEFORE today (they are overdue)
 *   - Marks them all as 'no-show'
 *
 * This ensures no stale "pending" appointments stay in the queue.
 */

const mongoose = require('mongoose');
const Hospital = require('../models/hospital.model');
const appointmentSchema = require('../models/appointment.model').schema;

const MONGO_URI_BASE = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';

const runNoShowAutoExpiry = async () => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    console.log(`[NoShow Job] Running at ${now.toLocaleString('en-IN')} — marking overdue pending/confirmed appointments as no-show...`);

    try {
        // Fetch all hospitals that have a tenant DB configured
        const hospitals = await Hospital.find({ dbName: { $exists: true, $ne: null, $ne: '' } }).lean();

        if (!hospitals.length) {
            console.log('[NoShow Job] No tenant hospitals found. Skipping.');
            return;
        }

        let totalUpdated = 0;

        for (const hospital of hospitals) {
            const dbName = hospital.dbName;
            if (!dbName) continue;

            let conn;
            try {
                // Re-use existing Mongoose connection if already open, else open a new one
                const existingConn = mongoose.connections.find(c => c.name === dbName && c.readyState === 1);
                if (existingConn) {
                    conn = existingConn;
                } else {
                    const baseUri = MONGO_URI_BASE.replace(/\/[^/]*$/, ''); // strip existing DB name
                    conn = await mongoose.createConnection(`${baseUri}/${dbName}`, {
                        serverSelectionTimeoutMS: 5000
                    }).asPromise();
                }

                // Get or register Appointment model on this connection
                let AppointmentModel;
                try {
                    AppointmentModel = conn.model('Appointment');
                } catch {
                    AppointmentModel = conn.model('Appointment', appointmentSchema);
                }

                const result = await AppointmentModel.updateMany(
                    {
                        status: { $in: ['pending', 'confirmed'] },
                        appointmentDate: { $lt: todayMidnight }
                    },
                    { $set: { status: 'no-show' } }
                );

                if (result.modifiedCount > 0) {
                    console.log(`[NoShow Job] ${hospital.name || dbName}: ${result.modifiedCount} appointment(s) → no-show`);
                    totalUpdated += result.modifiedCount;
                }
            } catch (tenantErr) {
                console.error(`[NoShow Job] Error processing DB "${dbName}":`, tenantErr.message);
            }
        }

        console.log(`[NoShow Job] Complete. Total marked as no-show: ${totalUpdated}`);
    } catch (err) {
        console.error('[NoShow Job] Fatal error:', err.message);
    }
};

/**
 * Schedule the job to fire once every day at 23:30.
 * Called from server.js after startup.
 */
const scheduleNoShowJob = () => {
    const scheduleNextRun = () => {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        const msUntilNext = next - now;
        console.log(`[NoShow Job] Scheduled → ${next.toLocaleString('en-IN')} (in ${Math.round(msUntilNext / 60000)} min)`);
        setTimeout(async () => {
            await runNoShowAutoExpiry();
            scheduleNextRun();
        }, msUntilNext);
    };
    scheduleNextRun();
};

module.exports = { scheduleNoShowJob, runNoShowAutoExpiry };
