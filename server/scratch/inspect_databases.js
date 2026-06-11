const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';

async function main() {
    try {
        console.log('Connecting to master MongoDB...');
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;

        // 1. Get hospitals list
        console.log('\n--- HOSPITALS IN MASTER DB ---');
        const hospitals = await db.collection('hospitals').find({}).toArray();
        hospitals.forEach(h => {
            console.log(`Hospital ID: ${h._id}, Name: ${h.name}, Slug: ${h.slug}, AdminUserId: ${h.adminUserId}`);
        });

        // 2. Count collections in Master DB
        console.log('\n--- MASTER DB COLLECTIONS AND COUNTS ---');
        const masterCols = await db.listCollections().toArray();
        for (const col of masterCols) {
            const count = await db.collection(col.name).countDocuments({});
            console.log(` - ${col.name}: ${count}`);
        }

        // 3. Inspect tenant databases
        const adminDb = mongoose.connection.client.db().admin();
        const dbsInfo = await adminDb.listDatabases();
        for (const d of dbsInfo.databases) {
            if (d.name.startsWith('hms_hospital_') || d.name.includes('hospital')) {
                console.log(`\n==================================================`);
                console.log(`TENANT DATABASE: ${d.name}`);
                console.log(`==================================================`);
                const tenantDb = mongoose.connection.client.db(d.name);
                const tenantCols = await tenantDb.listCollections().toArray();
                for (const col of tenantCols) {
                    const count = await tenantDb.collection(col.name).countDocuments({});
                    console.log(` - ${col.name}: ${count}`);
                }
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected.');
    }
}

main();
