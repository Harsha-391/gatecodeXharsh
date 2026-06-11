/**
 * Migration Script: Lab Report Status Correction
 * 
 * Run:
 *   node migrate-lab-reports.js
 * 
 * What it does:
 *   Ensures that every LabReport has the correct 'status' value set based on
 *   its 'reportStatus', 'testStatus', and 'sampleCollected' values.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const LabReport = require('./src/models/labReport.model');

const DB_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crm';

async function migrate() {
    try {
        await mongoose.connect(DB_URI);
        console.log('✅ Connected to MongoDB');

        const reports = await LabReport.find({});
        console.log(`Found ${reports.length} lab report records.`);

        let updatedCount = 0;
        for (const report of reports) {
            let targetStatus = report.status;
            
            // Re-evaluate status based on legacy fields
            if (!report.status || report.status === 'Pending') {
                if (report.reportStatus === 'CANCELLED') {
                    targetStatus = 'Cancelled';
                } else if (report.reportStatus === 'UPLOADED') {
                    targetStatus = 'Report Ready';
                } else if (report.testStatus === 'IN_PROGRESS') {
                    targetStatus = 'In Testing';
                } else if (report.sampleCollected) {
                    targetStatus = 'Sample Collected';
                } else {
                    targetStatus = 'Pending';
                }
            }

            // If we detected a change, update it
            if (report.status !== targetStatus) {
                report.status = targetStatus;
                
                // Initialize statusHistory if empty
                if (!report.statusHistory || report.statusHistory.length === 0) {
                    report.statusHistory = [{
                        status: targetStatus,
                        updatedAt: report.updatedAt || new Date(),
                        notes: `Status set to ${targetStatus} during data migration.`
                    }];
                }
                
                await report.save();
                updatedCount++;
            }
        }

        console.log(`✅ Migration complete. Updated ${updatedCount} reports.`);
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        process.exit(1);
    }
}

migrate();
