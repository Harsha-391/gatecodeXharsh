/**
 * fix-admin-permissions.js
 * Removes patient_create, appointment_manage, appointment_view_all,
 * and visit_diagnose from the Admin role in the live database.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../src/models/role.model');

const REMOVE_PERMS = ['patient_create', 'appointment_manage', 'appointment_view_all', 'visit_diagnose'];

async function run() {
    const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URL;
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUrl);
    console.log('Connected!\n');

    // Find all Admin roles (across all hospitals)
    const adminRoles = await Role.find({ name: /^Admin$/i });
    console.log(`Found ${adminRoles.length} Admin role(s)\n`);

    for (const role of adminRoles) {
        const before = [...role.permissions];
        role.permissions = role.permissions.filter(p => !REMOVE_PERMS.includes(p));
        const removed = before.filter(p => REMOVE_PERMS.includes(p));

        if (removed.length > 0) {
            await role.save();
            console.log(`✅ Updated Admin role (hospitalId: ${role.hospitalId || 'none'})`);
            console.log(`   Removed: ${removed.join(', ')}`);
            console.log(`   Remaining: ${role.permissions.join(', ')}\n`);
        } else {
            console.log(`ℹ️  Admin role (hospitalId: ${role.hospitalId || 'none'}) — no changes needed\n`);
        }
    }

    // Also fix tenant databases
    const Hospital = require('../src/models/hospital.model');
    const hospitals = await Hospital.find({});
    const { getTenantConnection } = require('../src/db/tenantDb');
    const { getTenantModels } = require('../src/db/tenantModels');

    for (const hosp of hospitals) {
        try {
            const tenantConn = await getTenantConnection(hosp._id.toString());
            const { Role: TenantRole } = getTenantModels(tenantConn);
            const tenantAdmins = await TenantRole.find({ name: /^Admin$/i });
            for (const tr of tenantAdmins) {
                const before = [...tr.permissions];
                tr.permissions = tr.permissions.filter(p => !REMOVE_PERMS.includes(p));
                const removed = before.filter(p => REMOVE_PERMS.includes(p));
                if (removed.length > 0) {
                    await tr.save();
                    console.log(`✅ [Tenant: ${hosp.name}] Admin role updated — removed: ${removed.join(', ')}`);
                } else {
                    console.log(`ℹ️  [Tenant: ${hosp.name}] Admin role — no changes needed`);
                }
            }
        } catch (e) {
            console.warn(`⚠️  Could not update tenant DB for hospital ${hosp.name}: ${e.message}`);
        }
    }

    console.log('\n✅ Done!');
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
