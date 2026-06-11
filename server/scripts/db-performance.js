const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const { getTenantModels } = require('../src/db/tenantModels');

async function runAudit() {
    console.log('🔍 STARTING DATABASE PERFORMANCE AUDIT WITH AUTO-INDEX SEEDING...');
    const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
    
    try {
        await mongoose.connect(mongoUrl);
        console.log('✅ Connected to MongoDB Master Database');

        const report = {
            timestamp: new Date().toISOString(),
            databasesAudited: [],
            indexStatus: {},
            queryAudits: [],
            overallScore: 100
        };

        // Ensure master models indexes exist
        const User = require('../src/models/user.model');
        const Appointment = require('../src/models/appointment.model');
        const Invoice = require('../src/models/invoice.model');
        const Admission = require('../src/models/admission.model');
        const Inventory = require('../src/models/inventory.model');

        await Promise.all([
            User.ensureIndexes(),
            Appointment.ensureIndexes(),
            Invoice.ensureIndexes(),
            Admission.ensureIndexes(),
            Inventory.ensureIndexes()
        ]);
        console.log('✅ Master Database Indexes Verified');

        // Discover Tenant Databases
        const admin = mongoose.connection.db.admin();
        const dbs = await admin.listDatabases();
        const tenantDbs = dbs.databases.filter(d => d.name.startsWith('hms_hospital_'));
        
        console.log(`🏥 Found ${tenantDbs.length} Active Tenant Database(s)`);

        for (const tenantInfo of tenantDbs) {
            const dbName = tenantInfo.name;
            console.log(`👉 Auditing & Building Indexes for Tenant DB: ${dbName}`);
            report.databasesAudited.push(dbName);

            // Establish connection and build models
            const baseUri = mongoUrl.substring(0, mongoUrl.lastIndexOf('/'));
            const tenantUri = `${baseUri}/${dbName}?retryWrites=true&w=majority`;
            const conn = await mongoose.createConnection(tenantUri).asPromise();

            // Force Mongoose to compile schemas and ensure indexes
            const tenantModels = getTenantModels(conn);
            await Promise.all(Object.values(tenantModels).map(model => model.ensureIndexes()));
            console.log(`✅ Tenant DB [${dbName}] Indexes Built Successfully`);

            report.indexStatus[dbName] = {};

            // Run explain audits using Mongoose models
            const modelAuditMapping = {
                User: { model: tenantModels.User, query: { hospitalId: new mongoose.Types.ObjectId() } },
                Appointment: { model: tenantModels.Appointment, query: { hospitalId: new mongoose.Types.ObjectId(), doctorId: new mongoose.Types.ObjectId() } },
                LabReport: { model: tenantModels.LabReport, query: { hospitalId: new mongoose.Types.ObjectId() } },
                Invoice: { model: tenantModels.Invoice, query: { hospitalId: new mongoose.Types.ObjectId(), patientId: new mongoose.Types.ObjectId() } },
                Admission: { model: tenantModels.Admission, query: { hospitalId: new mongoose.Types.ObjectId() } },
                Inventory: { model: tenantModels.Inventory, query: { hospitalId: new mongoose.Types.ObjectId() } },
                Expense: { model: tenantModels.Expense, query: { hospitalId: new mongoose.Types.ObjectId() } }
            };

            for (const [modelName, config] of Object.entries(modelAuditMapping)) {
                try {
                    const colName = config.model.collection.name;
                    const indexes = await conn.db.collection(colName).indexes();
                    report.indexStatus[dbName][colName] = indexes.map(idx => Object.keys(idx.key).join('_'));

                    // Run the explain query using Mongoose's own query builder
                    const explain = await config.model.find(config.query).explain('executionStats');
                    const winningPlan = explain.queryPlanner?.winningPlan || {};
                    const planStr = JSON.stringify(winningPlan);
                    const hasCollScan = planStr.includes('COLLSCAN');

                    report.queryAudits.push({
                        database: dbName,
                        collection: colName,
                        query: config.query,
                        stage: winningPlan.stage || 'UNKNOWN',
                        hasCollScan,
                        executionTimeMillis: explain.executionStats?.executionTimeMillis ?? 0
                    });

                    if (hasCollScan) {
                        console.warn(`⚠️ Warning: COLLSCAN detected on ${dbName}.${colName}`);
                        report.overallScore -= 5;
                    } else {
                        console.log(`⚡ Index scan (IXSCAN) verified on ${dbName}.${colName}`);
                    }
                } catch (colErr) {
                    report.indexStatus[dbName][modelName] = `Error: ${colErr.message}`;
                }
            }

            await conn.close();
        }

        // Save report to disk
        fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
        const reportPath = path.join(__dirname, '../reports/db-performance-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n======================================================`);
        console.log(`📊 DATABASE PERFORMANCE AUDIT REPORT SAVED`);
        console.log(`Overall Performance Score: ${report.overallScore}/100`);
        console.log(`Report Location: ${reportPath}`);
        console.log(`======================================================\n`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Audit failed:', error);
        process.exit(1);
    }
}

runAudit();
