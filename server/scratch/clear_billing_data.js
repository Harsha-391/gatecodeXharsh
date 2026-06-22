const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    try {
        const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URL;
        console.log('Connecting to', mongoUrl);
        await mongoose.connect(mongoUrl);
        console.log('Connected to Master DB.');

        const collectionsToClear = [
            'invoices',
            'refunds',
            'admissions',
            'facilitycharges',
            'appointments',
            'labreports',
            'pharmacyorders',
            'clinicalvisits',
            'clinicpatients',
            'billingactivitylogs'
        ];

        console.log('🧹 Clearing transactional seed data from Master DB...');
        for (const colName of collectionsToClear) {
            const result = await mongoose.connection.db.collection(colName).deleteMany({});
            console.log(`   - Master DB [${colName}]: Deleted ${result.deletedCount} records.`);
        }

        // Find the Admit Hospital ID
        const hospital = await mongoose.connection.db.collection('hospitals').findOne({ slug: 'admit' });
        if (hospital) {
            const hospitalId = hospital._id;
            const tenantDbName = `hms_hospital_${hospitalId.toString()}`;
            console.log(`🏥 Hospital Resolved: Admit Hospital (ID: ${hospitalId})`);
            console.log(`🧹 Clearing transactional seed data from tenant DB: ${tenantDbName}...`);

            const baseUrl = mongoUrl.substring(0, mongoUrl.lastIndexOf('/'));
            const tenantConn = mongoose.createConnection(`${baseUrl}/${tenantDbName}`);
            await new Promise((resolve) => tenantConn.once('open', resolve));

            for (const colName of collectionsToClear) {
                try {
                    const result = await tenantConn.db.collection(colName).deleteMany({});
                    console.log(`   - Tenant DB [${colName}]: Deleted ${result.deletedCount} records.`);
                } catch (err) {
                    console.log(`   - Tenant DB [${colName}]: Skipped/Not found.`);
                }
            }

            await tenantConn.close();
            console.log('✅ Tenant DB cleared successfully.');
        } else {
            console.log('⚠️ Admit Hospital not found in Master DB. Skipped tenant cleanup.');
        }

        await mongoose.disconnect();
        console.log('🎉 Seed database cleanup completed successfully. Staff accounts, hospitals, and roles remain intact!');
    } catch (err) {
        console.error('Error during cleanup:', err);
    }
}

run();
