require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
    const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI not set in environment.');
        process.exit(1);
    }
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const User = require('../src/models/user.model');
    const Role = require('../src/models/role.model');
    const Hospital = mongoose.model('Hospital', new mongoose.Schema({}, { strict: false }));

    const hospitals = await Hospital.find({}).lean();
    console.log(`\nFound ${hospitals.length} hospitals:`);
    for (const h of hospitals) {
        console.log(`- ID: "${h._id}", Name: "${h.name}", Slug: "${h.slug}"`);
    }

    const roles = await Role.find({}).lean();
    console.log(`\nFound ${roles.length} roles:`);
    for (const r of roles) {
        console.log(`- ID: "${r._id}", Name: "${r.name}", Dashboard: "${r.dashboardPath}", Hospital ID: "${r.hospitalId}"`);
    }

    const users = await User.find({}).lean();
    console.log(`\nFound ${users.length} users:`);
    for (const u of users) {
        console.log(`- Email: "${u.email}", Role: "${u.role}", Name: "${u.name}", Hospital ID: "${u.hospitalId}"`);
    }

    await mongoose.disconnect();
}

main().catch(console.error);
