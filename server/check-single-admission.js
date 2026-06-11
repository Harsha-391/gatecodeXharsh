require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    try {
        const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';
        await mongoose.connect(DB_URI);
        console.log('Connected to Master DB');

        const { getTenantConnection } = require('./src/db/tenantDb');
        const tenantDb = await getTenantConnection('6a1d1e075dd97bb6b9e64cd3');

        // Fetch raw document using native driver
        const admissionDoc = await tenantDb.collection('admissions').findOne({
            _id: new mongoose.Types.ObjectId('6a1eb5e05199b571e028bb1b')
        });

        console.log('Raw Admission Document:', admissionDoc);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

run();
