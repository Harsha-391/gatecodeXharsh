require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
    const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const User = require('./src/models/user.model');
    const users = await User.find({});
    
    console.log('Total users:', users.length);
    for (const u of users) {
        console.log(`Email: ${u.email}, PatientId: ${u.patientId}, Aadhaar: ${u.aadhaarNumber}, ID: ${u._id}`);
    }

    await mongoose.disconnect();
}

main().catch(console.error);
