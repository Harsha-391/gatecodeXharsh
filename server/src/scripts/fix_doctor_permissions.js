/**
 * fix_doctor_permissions.js
 * 
 * One-time script: removes 'lab_view' and 'pharmacy_view' from every
 * role whose name is 'Doctor' (case-insensitive) across all hospitals.
 *
 * Run with:
 *   node src/scripts/fix_doctor_permissions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/role.model');

const REMOVE_PERMS = ['lab_view', 'pharmacy_view'];

const dbURI = process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_db';

mongoose.connect(dbURI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');

        // Find all roles named "doctor" (case-insensitive)
        const doctorRoles = await Role.find({ name: /^doctor$/i });

        if (doctorRoles.length === 0) {
            console.log('ℹ️  No Doctor roles found in the database.');
            process.exit(0);
        }

        console.log(`Found ${doctorRoles.length} Doctor role(s). Removing: ${REMOVE_PERMS.join(', ')} ...`);

        for (const role of doctorRoles) {
            const before = [...(role.permissions || [])];
            // Strip the unwanted permissions
            role.permissions = role.permissions.filter(p => !REMOVE_PERMS.includes(p));
            // Also strip nav links that were auto-generated for those permissions
            role.navLinks = (role.navLinks || []).filter(
                link => !['Lab Dashboard', 'Pharmacy'].includes(link.label)
            );
            await role.save();
            const removed = before.filter(p => REMOVE_PERMS.includes(p));
            console.log(
                `✅ Updated role "${role.name}" (hospital: ${role.hospitalId || 'global'}) — removed: [${removed.join(', ') || 'none already absent'}]`
            );
        }

        console.log('\n✅ Done. Doctor roles no longer have lab_view or pharmacy_view.');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Error:', err.message);
        process.exit(1);
    });
