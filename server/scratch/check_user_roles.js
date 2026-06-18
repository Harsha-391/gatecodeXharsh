require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');

async function run() {
    const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';
    await mongoose.connect(DB_URI);
    
    console.log('--- USERS IN MASTER DB ---');
    const users = await User.find({});
    for (const u of users) {
        let roleName = 'N/A';
        if (mongoose.Types.ObjectId.isValid(u.role)) {
            const r = await Role.findById(u.role);
            roleName = r ? `${r.name} (Hospital: ${r.hospitalId})` : 'Role not found';
        } else {
            roleName = u.role;
        }
        console.log(`User: ${u.name}, Email: ${u.email}, Role field: ${u.role} (${roleName}), Perms:`, u.permissions);
    }
    await mongoose.disconnect();
}
run();
