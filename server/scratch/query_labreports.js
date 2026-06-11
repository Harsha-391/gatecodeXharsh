const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';

async function main() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;

        // Fetch all lab reports in master database (HSM)
        console.log('\n=== Lab Reports in Master Database ===');
        const labReportsCol = db.collection('labreports');
        const reports = await labReportsCol.find({}).sort({ createdAt: -1 }).limit(10).toArray();
        reports.forEach(r => {
            console.log(`ID: ${r._id}, userId: ${r.userId}, patientId: ${r.patientId}, testNames: ${JSON.stringify(r.testNames)}, amount: ${r.amount}, paymentStatus: ${r.paymentStatus}, status: ${r.status}`);
        });

        // Also look up lab tests in master database
        console.log('\n=== Lab Tests in Master Database ===');
        const labTestsCol = db.collection('labtests');
        const tests = await labTestsCol.find({}).toArray();
        tests.forEach(t => {
            console.log(`Name: ${t.name}, Code: ${t.code}, Price: ${t.price}`);
        });

        // Check tenant databases too
        const adminDb = mongoose.connection.client.db().admin();
        const dbsInfo = await adminDb.listDatabases();
        for (const d of dbsInfo.databases) {
            if (d.name.startsWith('hms_hospital_')) {
                console.log(`\n=== Tenant Database: ${d.name} Lab Reports ===`);
                const tenantConn = mongoose.connection.client.db(d.name);
                const tLabReports = await tenantConn.collection('labreports').find({}).sort({ createdAt: -1 }).limit(10).toArray();
                tLabReports.forEach(r => {
                    console.log(`ID: ${r._id}, userId: ${r.userId}, patientId: ${r.patientId}, testNames: ${JSON.stringify(r.testNames)}, amount: ${r.amount}, paymentStatus: ${r.paymentStatus}, status: ${r.status}`);
                });

                console.log(`\n=== Tenant Database: ${d.name} Lab Tests ===`);
                const tLabTests = await tenantConn.collection('labtests').find({}).toArray();
                tLabTests.forEach(t => {
                    console.log(`Name: ${t.name}, Code: ${t.code}, Price: ${t.price}`);
                });
            }
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
