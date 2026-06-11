const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

async function run() {
    try {
        const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
        await mongoose.connect(mongoUrl);
        console.log('Connected to Master DB successfully');

        const { getTenantConnection } = require('./src/db/tenantDb');
        const { getTenantModels } = require('./src/db/tenantModels');

        const tenantDb = await getTenantConnection('6a1d1e075dd97bb6b9e64cd3');
        const Admission = getTenantModels(tenantDb).Admission;
        const User = require('./src/models/user.model'); // Master DB User model

        const admissions = await Admission.find({
            hospitalId: '6a1d1e075dd97bb6b9e64cd3',
        })
            .sort({ admissionDate: -1 })
            .lean();

        console.log(`Found ${admissions.length} admissions.`);
        if (admissions.length > 0) {
            console.log('First admission patientId:', admissions[0].patientId, typeof admissions[0].patientId);
        }

        const patientIds = admissions.map(a => a.patientId).filter(Boolean);
        console.log('patientIds list:', patientIds);

        const users = await User.find({ _id: { $in: patientIds } })
            .select('name phone patientId mrn firstName lastName')
            .lean();
        console.log(`Found ${users.length} users in Master DB.`);
        console.log('Users:', users);

        const userMap = {};
        users.forEach(u => {
            userMap[u._id.toString()] = u;
        });
        console.log('userMap keys:', Object.keys(userMap));

        await mongoose.disconnect();
        await tenantDb.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
