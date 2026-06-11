const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE_URL = 'http://localhost:3000/api';

async function runTest() {
    const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
    await mongoose.connect(MONGO_URI);
    
    const User = require('./src/models/user.model');
    const Hospital = require('./src/models/hospital.model');

    const user = await User.findOne({ email: 'reception@crm.com' });
    const hospital = await Hospital.findOne({ slug: 'admit' });
    const hospitalId = hospital._id.toString();

    console.log('--- Initial State ---');
    console.log('User email:', user.email);
    console.log('User hospitalId in DB:', user.hospitalId);
    console.log('Target hospitalId (Admit):', hospitalId);

    const originalHospitalId = user.hospitalId;

    // Let's set the user's hospitalId in DB to null first to trigger the mismatch self-healing block
    user.hospitalId = null;
    await user.save();
    console.log('Reset user hospitalId in DB to null.');

    await mongoose.disconnect();

    console.log('\n--- Request 1 (Hospital ID mismatch - triggers self-healing) ---');
    try {
        const res1 = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'reception@crm.com',
            password: '123',
            hospitalId: hospitalId
        });
        console.log('Response 1 Status:', res1.status);
        console.log('Response 1 Data:', JSON.stringify(res1.data));
    } catch (err) {
        console.error('Response 1 Error Status:', err.response?.status);
        console.error('Response 1 Error Data:', JSON.stringify(err.response?.data));
    }

    console.log('\n--- Request 2 (Subsequent request) ---');
    try {
        const res2 = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'reception@crm.com',
            password: '123',
            hospitalId: hospitalId
        });
        console.log('Response 2 Status:', res2.status);
        console.log('Response 2 Data:', JSON.stringify(res2.data));
    } catch (err) {
        console.error('Response 2 Error Status:', err.response?.status);
        console.error('Response 2 Error Data:', JSON.stringify(err.response?.data));
    }

    // Restore original hospitalId in DB
    console.log('\n--- Restoring Database State ---');
    try {
        await mongoose.connect(MONGO_URI);
        const restoredUser = await User.findOne({ email: 'reception@crm.com' });
        restoredUser.hospitalId = originalHospitalId;
        await restoredUser.save();
        console.log('Successfully restored user hospitalId to:', originalHospitalId);
    } catch (restoreErr) {
        console.error('Failed to restore user hospitalId:', restoreErr.message);
    } finally {
        await mongoose.disconnect();
    }
}

runTest().catch(console.error);
