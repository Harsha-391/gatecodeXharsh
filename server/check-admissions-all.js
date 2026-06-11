require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('./src/models/hospital.model');
const { getTenantConnection } = require('./src/db/tenantDb');
const { getTenantModels } = require('./src/db/tenantModels');

async function run() {
    try {
        const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';
        await mongoose.connect(DB_URI);
        console.log('Connected to Master DB');

        const hospitals = await Hospital.find({});
        console.log(`Found ${hospitals.length} hospitals:`);

        for (const hospital of hospitals) {
            console.log(`\nHospital: ${hospital.name} (ID: ${hospital._id})`);
            const tenantDb = await getTenantConnection(String(hospital._id));
            if (!tenantDb) {
                console.log('Could not establish connection to tenant DB');
                continue;
            }

            const { Admission } = getTenantModels(tenantDb);
            const admissions = await Admission.find({}).lean();
            console.log(`Found ${admissions.length} admissions:`);
            admissions.forEach(adm => {
                console.log(`- ID: ${adm._id}`);
                console.log(`  Patient Name: ${adm.patientName}`);
                console.log(`  Phone: ${adm.patientPhone}`);
                console.log(`  Ward/Bed: ${adm.ward || 'N/A'} / ${adm.bedNumber || 'N/A'}`);
                console.log(`  Status: ${adm.status}`);
                console.log(`  Payment Status: ${adm.paymentStatus}`);
                console.log(`  Priority: ${adm.priority}`);
                console.log(`  Created At: ${adm.createdAt}`);
            });
        }

        await mongoose.disconnect();
        console.log('\nDisconnected.');
    } catch (err) {
        console.error(err);
    }
}

run();
