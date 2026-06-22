require('dotenv').config();
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URL;

async function main() {
    try {
        console.log('Connecting to master MongoDB...');
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;

        // 1. Get all roles that look like reception
        const roles = await db.collection('roles').find({ name: { $regex: /reception/i } }).toArray();
        console.log('--- RECEPTION ROLES ---');
        roles.forEach(r => {
            console.log(`Role ID: ${r._id}, Name: ${r.name}, HospitalId: ${r.hospitalId}`);
        });

        const roleIds = roles.map(r => r._id);

        // 2. Get all users with reception role
        console.log('\n--- RECEPTION USERS IN MASTER DB ---');
        const users = await db.collection('users').find({ 
            $or: [
                { role: { $in: roleIds } },
                { role: 'receptionist' },
                { role: 'reception' }
            ]
        }).toArray();

        users.forEach(u => {
            console.log(`User ID: ${u._id}, Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, HospitalId: ${u.hospitalId}`);
        });

        // 3. Get all receptions
        console.log('\n--- RECEPTIONS TABLE IN MASTER DB ---');
        const receptions = await db.collection('receptions').find({}).toArray();
        receptions.forEach(r => {
            console.log(`Reception ID: ${r._id}, UserId: ${r.userId}, HospitalId: ${r.hospitalId}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected.');
    }
}

main();
