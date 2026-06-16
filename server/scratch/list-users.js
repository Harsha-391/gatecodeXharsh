require('dotenv').config({ path: 'c:/Users/omris/OneDrive/Desktop/hms-neew/gatecodeXharsh/server/.env' });
const mongoose = require('mongoose');
const User = require('c:/Users/omris/OneDrive/Desktop/hms-neew/gatecodeXharsh/server/src/models/user.model');

async function run() {
    try {
        console.log("Connecting to database...");
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("Connected successfully!");

        const users = await User.find({});
        console.log(`\nFound ${users.length} users:`);
        users.forEach(u => {
            console.log(`- Name: "${u.name}", Email: "${u.email}", Role: "${JSON.stringify(u.role)}", HospitalId: "${u.hospitalId}"`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err);
    }
}

run();
