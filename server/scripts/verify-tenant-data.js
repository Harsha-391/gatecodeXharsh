/**
 * verify-tenant-data.js
 * Quick check: verifies all collections in each tenant DB
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Hospital = require('../src/models/hospital.model');
const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels } = require('../src/db/tenantModels');

async function main() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to Master DB\n');

    const hospitals = await Hospital.find({});

    for (const h of hospitals) {
        const tenantDb = await getTenantConnection(String(h._id));
        const M = getTenantModels(tenantDb);

        const counts = {
            roles:       await M.Role.countDocuments(),
            users:       await M.User.countDocuments(),
            doctors:     await M.Doctor.countDocuments(),
            labs:        await M.Lab.countDocuments(),
            pharmacies:  await M.Pharmacy.countDocuments(),
            receptions:  await M.Reception.countDocuments(),
            appointments: await M.Appointment.countDocuments(),
            admissions:  await M.Admission.countDocuments(),
            clinicalvisits: await M.ClinicalVisit.countDocuments(),
        };

        console.log(`\n🏥 ${h.name} (${h._id})`);
        for (const [k, v] of Object.entries(counts)) {
            console.log(`   ${k.padEnd(20)} ${v}`);
        }

        // Show doctor names
        if (counts.doctors > 0) {
            const docs = await M.Doctor.find({}, 'name specialty email').lean();
            console.log(`\n   Doctor list:`);
            docs.forEach(d => console.log(`     - ${d.name}  (${d.specialty})  ${d.email}`));
        }

        // Show user names (staff only)
        const users = await M.User.find({}, 'name role email').limit(10).lean();
        console.log(`\n   User list (first 10):`);
        users.forEach(u => console.log(`     - ${u.name}  role:${u.role}  ${u.email}`));
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
