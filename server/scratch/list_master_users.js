require('dotenv').config();
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URL;

async function main() {
    try {
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;

        console.log('\n=== Staff Users in Master DB ===');
        const users = await db.collection('users').find({
            email: { $exists: true, $ne: null }
        }).toArray();

        users.forEach(u => {
            console.log(`Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, hospitalId: ${u.hospitalId}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
