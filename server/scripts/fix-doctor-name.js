/**
 * fix-doctor-name.js
 * Finds all doctors with malformed names (extra spaces) and fixes them
 * by rebuilding the name from firstName + middleName + lastName fields.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Doctor = require('../src/models/doctor.model');
const Hospital = require('../src/models/hospital.model');
const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels } = require('../src/db/tenantModels');

function buildCleanName(doc) {
    // Prefer firstName+lastName combination if they exist
    const parts = [doc.firstName, doc.middleName, doc.lastName]
        .map(p => (p || '').trim())
        .filter(Boolean);
    
    if (parts.length > 0) {
        return parts.join(' ');
    }
    
    // Fall back to cleaning the existing name (collapse multiple spaces)
    return (doc.name || '').replace(/\s+/g, ' ').trim();
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to Master DB\n');

    // Find all doctors with double spaces in name OR whose name doesn't match firstName+lastName
    const allDoctors = await Doctor.find({}).lean();
    
    console.log(`Found ${allDoctors.length} doctors in Master DB\n`);
    
    let fixedCount = 0;
    
    for (const doc of allDoctors) {
        const cleanName = buildCleanName(doc);
        const currentName = (doc.name || '').trim();
        
        // Check if name has issues: double spaces, or differs from firstName+lastName
        const hasDoubleSpace = /\s{2,}/.test(doc.name || '');
        const namesDiffer = cleanName && cleanName !== currentName;
        
        console.log(`Doctor: "${doc.name}"  |  firstName: "${doc.firstName}"  middleName: "${doc.middleName}"  lastName: "${doc.lastName}"`);
        console.log(`  → Clean name: "${cleanName}"  |  Fix needed: ${hasDoubleSpace || namesDiffer}`);
        
        if (hasDoubleSpace || namesDiffer) {
            // Fix in Master DB
            await Doctor.findByIdAndUpdate(doc._id, { name: cleanName }, { runValidators: false });
            console.log(`  ✔  FIXED in Master DB: "${doc.name}" → "${cleanName}"`);
            fixedCount++;
            
            // Fix in all hospital tenant DBs
            if (doc.hospitalId) {
                try {
                    const tenantDb = await getTenantConnection(String(doc.hospitalId));
                    const { Doctor: TenantDoctor } = getTenantModels(tenantDb);
                    await TenantDoctor.findByIdAndUpdate(doc._id, { name: cleanName }, { runValidators: false });
                    console.log(`  ✔  FIXED in tenant DB (hospital ${doc.hospitalId})`);
                } catch (e) {
                    console.warn(`  ⚠  Could not fix in tenant DB: ${e.message}`);
                }
            }
        }
        console.log();
    }
    
    if (fixedCount === 0) {
        console.log('\n✅ No name issues found. All doctor names look correct!');
    } else {
        console.log(`\n✅ Fixed ${fixedCount} doctor name(s) in both Master and Tenant DBs.`);
    }
    
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });
