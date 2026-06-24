/**
 * multi_hospital_validation.js — Multi-hospital tenantKey validation
 * Run: node src/scripts/multi_hospital_validation.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Hospital = require('../models/hospital.model');
const { JWT_SECRET } = require('../config/jwt');

async function run() {
    console.log('====================================================');
    console.log('STARTING MULTI-HOSPITAL VALIDATION TEST');
    console.log('====================================================\n');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to MongoDB\n');

    const testHospitals = [
        { name: 'Apollo Jaipur Test', slug: 'apollo-jaipur' },
        { name: 'City Hospital Test', slug: 'city-hospital' },
        { name: 'Metro Clinic Test', slug: 'metro-clinic' }
    ];

    const savedHospitals = [];

    // 1. Create 3 temporary hospitals
    console.log('PHASE 1: Creating 3 Test Hospitals...');
    for (const hData of testHospitals) {
        // Enforce duplicate check before saving
        const duplicate = await Hospital.findOne({ slug: hData.slug });
        if (duplicate) {
            console.log(`⚠️ Warning: Slug "${hData.slug}" already exists. Cleaning it first.`);
            await Hospital.deleteOne({ slug: hData.slug });
        }

        const h = new Hospital({
            name: hData.name,
            slug: hData.slug,
            isActive: true
        });

        await h.save();
        console.log(`✅ Created: "${h.name}"`);
        console.log(`   _id:               ${h._id}`);
        console.log(`   originalSubdomain: ${h.originalSubdomain}`);
        console.log(`   tenantKey:         ${h.tenantKey}\n`);
        savedHospitals.push(h);
    }

    // 2. Verify tenantKey uniqueness and format
    console.log('PHASE 2: Verifying tenantKey Uniqueness & Format...');
    const tenantKeys = savedHospitals.map(h => h.tenantKey);
    const uniqueKeys = new Set(tenantKeys);

    console.log(`Total Keys Generated: ${tenantKeys.length}`);
    console.log(`Unique Keys:          ${uniqueKeys.size}`);

    if (uniqueKeys.size === tenantKeys.length) {
        console.log('✅ PASS: All tenantKeys are unique!');
    } else {
        throw new Error('❌ FAIL: Duplicate tenantKeys detected!');
    }

    for (const h of savedHospitals) {
        const expectedKey = `${h.originalSubdomain}-${h._id.toString()}`;
        if (h.tenantKey === expectedKey) {
            console.log(`✓ Format Valid: ${h.tenantKey}`);
        } else {
            throw new Error(`❌ FAIL: Invalid format for ${h.name}. Expected "${expectedKey}", got "${h.tenantKey}"`);
        }
    }
    console.log('');

    // 3. Verify resolution routing for all 3 hospitals
    console.log('PHASE 3: Verifying Resolution Routing (All 3 Lookup Formats)...');
    for (const h of savedHospitals) {
        console.log(`Testing resolution for hospital: "${h.name}"`);
        
        // Lookup by ID
        const byId = await Hospital.findById(h._id);
        if (!byId || String(byId._id) !== String(h._id)) throw new Error(`Id lookup failed for ${h.name}`);
        
        // Lookup by Subdomain (slug)
        const bySubdomain = await Hospital.findOne({ slug: h.slug });
        if (!bySubdomain || String(bySubdomain._id) !== String(h._id)) throw new Error(`Subdomain lookup failed for ${h.name}`);

        // Lookup by tenantKey
        const byKey = await Hospital.findOne({ tenantKey: h.tenantKey });
        if (!byKey || String(byKey._id) !== String(h._id)) throw new Error(`tenantKey lookup failed for ${h.name}`);

        console.log(`   ✓ ID resolution -> PASS`);
        console.log(`   ✓ Subdomain resolution -> PASS`);
        console.log(`   ✓ tenantKey resolution -> PASS`);
    }
    console.log('');

    // 4. Verify login token generation
    console.log('PHASE 4: Verifying JWT Token Generation...');
    for (const h of savedHospitals) {
        const fakeUserId = new mongoose.Types.ObjectId();
        const token = jwt.sign(
            {
                jti: 'validation-token-' + h.slug,
                userId: fakeUserId,
                email: `testadmin@${h.slug}.com`,
                roleId: 'hospitaladmin',
                hospitalId: String(h._id),
                tenantKey: h.tenantKey,
                subdomain: h.slug
            },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        const decoded = jwt.verify(token, JWT_SECRET);
        console.log(`JWT Payload for "${h.name}":`);
        console.log(`  subdomain: "${decoded.subdomain}"`);
        console.log(`  tenantKey: "${decoded.tenantKey}"`);
        console.log(`  hospitalId: "${decoded.hospitalId}"`);

        if (decoded.subdomain === h.slug && decoded.tenantKey === h.tenantKey && decoded.hospitalId === String(h._id)) {
            console.log(`   ✓ Token signature valid -> PASS\n`);
        } else {
            throw new Error(`Token payload mismatch for ${h.name}`);
        }
    }

    // 5. Cleanup
    console.log('PHASE 5: Cleaning up test hospitals...');
    for (const h of savedHospitals) {
        await Hospital.deleteOne({ _id: h._id });
        console.log(`🗑️ Deleted: "${h.name}"`);
    }

    console.log('\n🎉 ALL MULTI-HOSPITAL VALIDATION CHECKS PASSED SUCCESSFULLY!');
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(e => {
    console.error('\n❌ Validation checks failed:', e.message);
    mongoose.disconnect();
    process.exit(1);
});
