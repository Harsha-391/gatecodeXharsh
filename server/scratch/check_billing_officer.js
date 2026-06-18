require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');

async function run() {
    const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';
    await mongoose.connect(DB_URI);

    const user = await User.findOne({ email: 'billing@crm.com' });
    if (!user) {
        console.log('User billing@crm.com not found');
    } else {
        console.log('User:', {
            name: user.name,
            email: user.email,
            role: user.role,
            hospitalId: user.hospitalId,
            customPermissions: user.customPermissions,
            deniedPermissions: user.deniedPermissions
        });

        const role = await Role.findById(user.role);
        if (role) {
            console.log('Role found by ID:', {
                _id: role._id,
                name: role.name,
                hospitalId: role.hospitalId,
                permissions: role.permissions
            });
        } else {
            console.log('Role not found by ID:', user.role);
        }
    }
    await mongoose.disconnect();
}
run();
