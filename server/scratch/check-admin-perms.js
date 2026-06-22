require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../src/models/role.model');

async function run() {
    const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URL;
    await mongoose.connect(mongoUrl);

    const adminRoles = await Role.find({ name: /^Admin$/i });
    for (const r of adminRoles) {
        console.log(`Admin role (hospitalId: ${r.hospitalId || 'none'}):`);
        console.log(`  permissions: ${r.permissions.join(', ')}\n`);
    }
    await mongoose.disconnect();
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
