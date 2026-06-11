const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/hms_hospital_6a268cd35b9fa6ff40126098';

async function main() {
    try {
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;

        console.log('\n=== Staff/Admin Users in Hospital DB ===');
        const users = await db.collection('users').find({
            role: { $in: ['billing', 'billing executive', 'reception', 'receptionist', 'admin', 'hospitaladmin', 'superadmin', 'centraladmin'] }
        }).toArray();

        users.forEach(u => {
            console.log(`Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, hospitalId: ${u.hospitalId}`);
        });

        if (users.length === 0) {
            console.log('No staff users found. Listing all users:');
            const all = await db.collection('users').find({}).limit(10).toArray();
            all.forEach(u => {
                console.log(`Name: ${u.name}, Email: ${u.email}, Role: ${u.role}`);
            });
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
