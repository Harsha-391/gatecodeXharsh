// server/scripts/fix-admin-role-permissions.js
require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../src/models/role.model');
const Hospital = require('../src/models/hospital.model');
const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels } = require('../src/db/tenantModels');

const permissionsToRemove = [
    'appointment_view_all',
    'appointment_manage',
    'lab_view',
    'lab_manage',
    'pharmacy_view',
    'pharmacy_manage'
];

async function run() {
    try {
        console.log('⏳ Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('✅ Connected to Master DB.');

        // 1. Fix Master DB Admin Roles
        const masterAdminRoles = await Role.find({ name: 'Admin' });
        console.log(`Found ${masterAdminRoles.length} Admin roles in Master DB.`);
        for (const role of masterAdminRoles) {
            const originalLength = role.permissions.length;
            role.permissions = role.permissions.filter(p => !permissionsToRemove.includes(p));
            if (role.permissions.length !== originalLength) {
                await role.save();
                console.log(`✅ Cleaned Admin role in Master DB (Hospital: ${role.hospitalId || 'Global'})`);
            } else {
                console.log(`ℹ️ Admin role in Master DB (Hospital: ${role.hospitalId || 'Global'}) already clean.`);
            }
        }

        // 2. Fix Tenant DB Admin Roles
        const hospitals = await Hospital.find({});
        console.log(`\nFound ${hospitals.length} hospitals. Processing Tenant DBs...`);

        for (const h of hospitals) {
            console.log(`Processing Tenant DB for hospital: "${h.name}" (${h._id})`);
            try {
                const tenantDb = await getTenantConnection(String(h._id));
                const M = getTenantModels(tenantDb);

                const tenantAdminRoles = await M.Role.find({ name: 'Admin' });
                console.log(`  Found ${tenantAdminRoles.length} Admin roles in Tenant DB.`);
                for (const role of tenantAdminRoles) {
                    const originalLength = role.permissions.length;
                    role.permissions = role.permissions.filter(p => !permissionsToRemove.includes(p));
                    if (role.permissions.length !== originalLength) {
                        await role.save();
                        console.log(`  ✅ Cleaned Admin role in Tenant DB.`);
                    } else {
                        console.log(`  ℹ️ Admin role in Tenant DB already clean.`);
                    }
                }
            } catch (err) {
                console.error(`  ❌ Failed to process tenant DB:`, err.message);
            }
        }

        console.log('\n🎉 Successfully updated all existing Admin role permissions!');
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
