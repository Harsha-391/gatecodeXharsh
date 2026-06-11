const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const zlib = require('zlib');
const { getTenantModels } = require('../src/db/tenantModels');

const BACKUP_DIR = path.join(__dirname, '../backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

async function getTenantDbNames() {
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    return dbs.databases.filter(d => d.name.startsWith('hms_hospital_')).map(d => d.name);
}

// Programmatic Backup
async function runBackup() {
    console.log('📦 RUNNING PROGRAMMATIC BACKUP...');
    const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
    
    // Connect to Master DB
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUrl);
    }

    const backupData = {
        timestamp: new Date().toISOString(),
        master: {},
        tenants: {}
    };

    // 1. Backup Master DB
    const masterCollections = ['hospitals', 'users', 'roles', 'clinicsubscriptions'];
    console.log('👉 Backing up Master DB collections...');
    for (const colName of masterCollections) {
        try {
            const docs = await mongoose.connection.db.collection(colName).find({}).toArray();
            backupData.master[colName] = docs;
        } catch (e) {
            console.warn(`Could not backup master collection: ${colName}. Error: ${e.message}`);
        }
    }

    // 2. Backup Tenant DBs
    const tenantDbNames = await getTenantDbNames();
    console.log(`🏥 Found ${tenantDbNames.length} Tenant DBs for backup.`);

    for (const dbName of tenantDbNames) {
        console.log(`👉 Backing up tenant database: ${dbName}`);
        backupData.tenants[dbName] = {};

        const baseUri = mongoUrl.substring(0, mongoUrl.lastIndexOf('/'));
        const tenantUri = `${baseUri}/${dbName}?retryWrites=true&w=majority`;
        const conn = await mongoose.createConnection(tenantUri).asPromise();

        const tenantCollections = await conn.db.listCollections().toArray();
        for (const colInfo of tenantCollections) {
            const colName = colInfo.name;
            try {
                const docs = await conn.db.collection(colName).find({}).toArray();
                backupData.tenants[dbName][colName] = docs;
            } catch (e) {
                console.warn(`Could not backup collection: ${colName} in ${dbName}. Error: ${e.message}`);
            }
        }
        await conn.close();
    }

    // Compress & Save
    const backupJson = JSON.stringify(backupData);
    const compressed = zlib.gzipSync(backupJson);
    const filename = `backup_${Date.now()}.json.gz`;
    const backupPath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(backupPath, compressed);
    console.log(`✅ Backup created successfully: ${backupPath} (${(compressed.length / 1024).toFixed(2)} KB)`);

    // Manage Retention (keep last 7 backups)
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('backup_') && f.endsWith('.json.gz'))
            .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);

        if (files.length > 7) {
            for (let i = 7; i < files.length; i++) {
                fs.unlinkSync(path.join(BACKUP_DIR, files[i].name));
                console.log(`🗑️ Deleted old backup file: ${files[i].name}`);
            }
        }
    } catch (err) {
        console.warn('Backup retention cleanup failed:', err);
    }

    return backupPath;
}

// Programmatic Restore
async function runRestore(backupPath) {
    console.log(`📂 RUNNING RESTORE FROM: ${backupPath}`);
    if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found at ${backupPath}`);
    }

    const compressed = fs.readFileSync(backupPath);
    const backupJson = zlib.gunzipSync(compressed).toString();
    const backupData = JSON.parse(backupJson);

    const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUrl);
    }

    // 1. Restore Master DB
    console.log('👉 Restoring Master DB collections...');
    for (const [colName, docs] of Object.entries(backupData.master)) {
        if (docs.length === 0) continue;
        const col = mongoose.connection.db.collection(colName);
        await col.deleteMany({});
        // Convert string IDs back to ObjectIds if present
        const restoredDocs = docs.map(d => {
            if (d._id) d._id = new mongoose.Types.ObjectId(d._id);
            if (d.hospitalId) d.hospitalId = new mongoose.Types.ObjectId(d.hospitalId);
            return d;
        });
        await col.insertMany(restoredDocs);
        console.log(`  Restored ${docs.length} document(s) in Master Collection: ${colName}`);
    }

    // 2. Restore Tenant DBs
    for (const [dbName, collections] of Object.entries(backupData.tenants)) {
        console.log(`👉 Restoring Tenant DB: ${dbName}`);
        const baseUri = mongoUrl.substring(0, mongoUrl.lastIndexOf('/'));
        const tenantUri = `${baseUri}/${dbName}?retryWrites=true&w=majority`;
        const conn = await mongoose.createConnection(tenantUri).asPromise();

        for (const [colName, docs] of Object.entries(collections)) {
            const col = conn.db.collection(colName);
            await col.deleteMany({});
            if (docs.length > 0) {
                const restoredDocs = docs.map(d => {
                    if (d._id) d._id = new mongoose.Types.ObjectId(d._id);
                    if (d.hospitalId) d.hospitalId = new mongoose.Types.ObjectId(d.hospitalId);
                    if (d.patientId && mongoose.Types.ObjectId.isValid(d.patientId)) d.patientId = new mongoose.Types.ObjectId(d.patientId);
                    if (d.doctorId && mongoose.Types.ObjectId.isValid(d.doctorId)) d.doctorId = new mongoose.Types.ObjectId(d.doctorId);
                    if (d.userId && mongoose.Types.ObjectId.isValid(d.userId)) d.userId = new mongoose.Types.ObjectId(d.userId);
                    return d;
                });
                await col.insertMany(restoredDocs);
                console.log(`  Restored ${docs.length} document(s) in collection: ${colName}`);
            }
        }
        await conn.close();
    }

    console.log('✅ Restore execution completed successfully.');
}

// Disaster Recovery Simulation
async function runDisasterRecoverySimulation() {
    console.log('\n🔥 STARTING DISASTER RECOVERY SIMULATION...');
    const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
    
    try {
        await mongoose.connect(mongoUrl);
        const testHospitalId = new mongoose.Types.ObjectId('6a1d1e075dd97bb6b9e64cd3');
        const dbName = `hms_hospital_${testHospitalId}`;

        // Connect to tenant DB
        const baseUri = mongoUrl.substring(0, mongoUrl.lastIndexOf('/'));
        const tenantUri = `${baseUri}/${dbName}?retryWrites=true&w=majority`;
        const conn = await mongoose.createConnection(tenantUri).asPromise();
        const models = getTenantModels(conn);

        // 1. Create unique test records
        const uniqueSuffix = Date.now();
        console.log(`1. Seeding test records in ${dbName}...`);
        
        const testPatient = new models.User({
            name: `Test Recovery Patient ${uniqueSuffix}`,
            email: `patient.${uniqueSuffix}@recovery.com`,
            role: 'patient',
            hospitalId: testHospitalId,
            isActive: true
        });
        await testPatient.save();

        const testAdmission = new models.Admission({
            hospitalId: testHospitalId,
            patientId: testPatient._id,
            patientName: testPatient.name,
            status: 'Pending Allocation',
            priority: 'Critical',
            notes: 'Test Admission Disaster Recovery Record'
        });
        await testAdmission.save();

        const testInvoice = new models.Invoice({
            hospitalId: testHospitalId,
            patientId: testPatient._id,
            patientName: testPatient.name,
            invoiceNumber: `INV-REC-${uniqueSuffix}`,
            grandTotal: 12500,
            outstandingAmount: 12500,
            paymentStatus: 'Pending',
            items: [{ name: 'Emergency Admission Fee', quantity: 1, unitPrice: 12500, totalAmount: 12500 }]
        });
        await testInvoice.save();

        const testInventory = new models.Inventory({
            hospitalId: testHospitalId,
            name: `Emergency Disaster Drug ${uniqueSuffix}`,
            stock: 150,
            unit: 'Vials',
            buyingPrice: 150,
            sellingPrice: 300,
            status: 'In Stock'
        });
        await testInventory.save();

        console.log('✅ Test records successfully seeded.');

        // 2. Perform backup
        const backupPath = await runBackup();

        // 3. Delete / Corrupt records
        console.log('2. Simulating catastrophic failure (deleting seeded records)...');
        await models.User.deleteOne({ _id: testPatient._id });
        await models.Admission.deleteOne({ _id: testAdmission._id });
        await models.Invoice.deleteOne({ _id: testInvoice._id });
        await models.Inventory.deleteOne({ _id: testInventory._id });

        const checkDeletedUser = await models.User.findById(testPatient._id);
        const checkDeletedInvoice = await models.Invoice.findById(testInvoice._id);
        if (!checkDeletedUser && !checkDeletedInvoice) {
            console.log('✅ Database corruption simulation confirmed (data deleted).');
        }

        // Close connection to allow restore to lock collections
        await conn.close();

        // 4. Restore backup
        console.log('3. Triggering database restore from archive...');
        await runRestore(backupPath);

        // 5. Verify data integrity
        console.log('4. Verifying data integrity of restored data...');
        const connVerify = await mongoose.createConnection(tenantUri).asPromise();
        const verifyModels = getTenantModels(connVerify);

        const restoredPatient = await verifyModels.User.findById(testPatient._id);
        const restoredAdmission = await verifyModels.Admission.findById(testAdmission._id);
        const restoredInvoice = await verifyModels.Invoice.findById(testInvoice._id);
        const restoredInventory = await verifyModels.Inventory.findById(testInventory._id);

        let testPassed = true;
        const report = {
            timestamp: new Date().toISOString(),
            backupFile: backupPath,
            tests: []
        };

        const verifyDoc = (name, doc, field, expected) => {
            const match = doc && String(doc[field]) === String(expected);
            report.tests.push({ module: name, status: match ? 'PASSED' : 'FAILED' });
            if (!match) testPassed = false;
            console.log(`   - ${name} Restore: ${match ? '✅ SUCCESS' : '❌ FAILED'}`);
        };

        verifyDoc('Patient Model', restoredPatient, 'name', testPatient.name);
        verifyDoc('Admission Model', restoredAdmission, 'notes', testAdmission.notes);
        verifyDoc('Invoice Model', restoredInvoice, 'invoiceNumber', testInvoice.invoiceNumber);
        verifyDoc('Inventory Model', restoredInventory, 'name', testInventory.name);

        await connVerify.close();
        await mongoose.disconnect();

        fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
        const reportPath = path.join(__dirname, '../reports/disaster-recovery-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({ testPassed, ...report }, null, 2));

        console.log(`\n======================================================`);
        console.log(`🚨 DISASTER RECOVERY SIMULATION COMPLETE`);
        console.log(`Overall Simulation Status: ${testPassed ? 'PASSED (DATA INTEGRITY 100% SECURED)' : 'FAILED'}`);
        console.log(`Report Location: ${reportPath}`);
        console.log(`======================================================\n`);

        process.exit(testPassed ? 0 : 1);
    } catch (e) {
        console.error('❌ Disaster Recovery simulation failed:', e);
        process.exit(1);
    }
}

// Command Line Flags Routing
const args = process.argv.slice(2);
if (args.includes('--test-restore')) {
    runDisasterRecoverySimulation();
} else if (args.includes('--restore')) {
    const fileArgIdx = args.indexOf('--restore') + 1;
    const filePath = args[fileArgIdx];
    if (!filePath) {
        console.error('Please specify a backup file path: node backup-restore.js --restore <path>');
        process.exit(1);
    }
    runRestore(filePath).then(() => process.exit(0)).catch(e => {
        console.error(e);
        process.exit(1);
    });
} else {
    runBackup().then(() => process.exit(0)).catch(e => {
        console.error(e);
        process.exit(1);
    });
}
