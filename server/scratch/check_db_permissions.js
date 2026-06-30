require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../src/models/role.model');
const Hospital = require('../src/models/hospital.model');
const { getTenantConnection } = require('../src/db/tenantDb');

async function run() {
    const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';
    await mongoose.connect(DB_URI);
    
    console.log('--- MASTER DB ROLES ---');
    const masterRoles = await Role.find({});
    for (const r of masterRoles) {
        console.log(`Role: ${r.name}, Hospital: ${r.hospitalId}, Perms:`, r.permissions);
    }
    const hospitals = await Hospital.find({});
    for (const hosp of hospitals) {
        console.log(`\n--- TENANT DB ROLES FOR ${hosp.name} ---`);
        try {
            const tenantConn = await getTenantConnection(String(hosp._id));
            const TenantRole = tenantConn.model('Role', require('../src/models/role.model').schema);
            const tenantRoles = await TenantRole.find({});
            for (const r of tenantRoles) {
                console.log(`Role: ${r.name}, Perms:`, r.permissions);
            }
        } catch (e) {
            console.error(e.message);
        }
    }
    await mongoose.disconnect();
}
run();
