require('dotenv').config();
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URL;

async function main() {
    try {
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;

        const targetId = '6a27a79d23a1705c0e3fc849';
        console.log(`Checking appointment ID: ${targetId}`);

        // 1. Check in Master DB appointments
        const masterAppt = await db.collection('appointments').findOne({ _id: new mongoose.Types.ObjectId(targetId) });
        if (masterAppt) {
            console.log('Found in Master DB (HSM) appointments collection:');
            console.log(JSON.stringify(masterAppt, null, 2));
        } else {
            console.log('NOT found in Master DB (HSM) appointments collection.');
        }

        // 2. Check in Tenant DBs appointments
        const adminDb = mongoose.connection.client.db().admin();
        const dbsInfo = await adminDb.listDatabases();
        for (const d of dbsInfo.databases) {
            if (d.name.startsWith('hms_hospital_')) {
                const tenantConn = mongoose.connection.client.db(d.name);
                const tenantAppt = await tenantConn.collection('appointments').findOne({ _id: new mongoose.Types.ObjectId(targetId) });
                if (tenantAppt) {
                    console.log(`Found in Tenant DB (${d.name}) appointments collection:`);
                    console.log(JSON.stringify(tenantAppt, null, 2));
                }
            }
        }

        // 3. Find Doctor "Dr. Anita Desai"
        const docUser = await db.collection('users').findOne({ email: 'anita@crm.com' });
        if (docUser) {
            console.log('\nFound Doctor "Dr. Anita Desai" user:');
            console.log(` - ID: ${docUser._id}`);
            console.log(` - hospitalId: ${docUser.hospitalId}`);
            console.log(` - role: ${docUser.role}`);
        } else {
            console.log('\nDoctor "Dr. Anita Desai" NOT found in users collection.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
