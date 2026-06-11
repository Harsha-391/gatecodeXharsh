/**
 * fix-doctor-role-permissions.js
 * Removes 'lab_view' and 'pharmacy_view' from all Doctor roles
 * in both Master DB and all hospital Tenant DBs.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Role     = require('../src/models/role.model');
const Hospital = require('../src/models/hospital.model');
const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels }     = require('../src/db/tenantModels');

const PERMS_TO_REMOVE = ['lab_view', 'pharmacy_view'];

async function cleanDoctorRole(RoleModel, label) {
    const doctorRoles = await RoleModel.find({ name: 'Doctor' });
    if (doctorRoles.length === 0) {
        console.log(`  [${label}] No Doctor role found — skipping.`);
        return;
    }
    for (const role of doctorRoles) {
        const before = role.permissions.join(', ');
        role.permissions = role.permissions.filter(p => !PERMS_TO_REMOVE.includes(p));
        const after = role.permissions.join(', ');
        await role.save();
        console.log(`  ✔  [${label}] Fixed Doctor role`);
        console.log(`       Before: ${before}`);
        console.log(`       After : ${after}`);
    }
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to Master DB\n');

    // Fix in Master DB
    await cleanDoctorRole(Role, 'Master DB');

    // Fix in every hospital's Tenant DB
    const hospitals = await Hospital.find({});
    for (const h of hospitals) {
        try {
            const tenantDb = await getTenantConnection(String(h._id));
            const { Role: TenantRole } = getTenantModels(tenantDb);
            await cleanDoctorRole(TenantRole, `Tenant: ${h.name}`);
        } catch (e) {
            console.warn(`  ⚠  Could not fix tenant DB for ${h.name}: ${e.message}`);
        }
    }

    console.log('\n✅ Done! Doctor role no longer has lab_view or pharmacy_view permissions.');
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });
