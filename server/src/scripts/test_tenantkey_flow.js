/**
 * test_tenantkey_flow.js — Integration test for TenantKey Architecture
 * Run: node src/scripts/test_tenantkey_flow.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('../models/hospital.model');

async function testResolution() {
    console.log('🧪 Testing Tenant Resolution (Phase 6)...');
    
    const targetId = '6a200269d01a91451fefb80d';
    const targetKey = `admit-${targetId}`;
    const targetSlug = 'admit';

    // 1. Resolve by HospitalId
    const resId = await Hospital.findById(targetId);
    if (!resId) throw new Error('Resolution by HospitalId failed');
    console.log(`   ✓ Resolved by HospitalId: "${resId.name}"`);
    console.log('   Document from DB:', JSON.stringify(resId.toObject(), null, 2));
    console.log('   Schema Paths:', Object.keys(Hospital.schema.paths));
    const rawDoc = await Hospital.collection.findOne({ _id: resId._id });
    console.log('   Raw MongoDB Doc:', JSON.stringify(rawDoc, null, 2));

    // 2. Resolve by TenantKey
    const resKey = await Hospital.findOne({ tenantKey: targetKey });
    if (!resKey || String(resKey._id) !== targetId) throw new Error('Resolution by TenantKey failed');
    console.log(`   ✓ Resolved by TenantKey: "${resKey.name}"`);

    // 3. Resolve by Slug
    const resSlug = await Hospital.findOne({ slug: targetSlug });
    if (!resSlug || String(resSlug._id) !== targetId) throw new Error('Resolution by Slug failed');
    console.log(`   ✓ Resolved by Slug: "${resSlug.name}"`);
}

async function testValidationAndGeneration() {
    console.log('\n🧪 Testing Validation and Automatic Generation (Phase 3 & 4)...');

    // 1. Try to create duplicate slug "Admit" (case-insensitive check)
    try {
        const testDup = new Hospital({
            name: 'Duplicate Hospital',
            slug: 'Admit'
        });
        
        // Simulating the duplicate check done in routes:
        const targetSlug = testDup.slug.toLowerCase().trim();
        const duplicate = await Hospital.findOne({ slug: { $regex: new RegExp(`^${targetSlug}$`, 'i') } });
        if (duplicate) {
            console.log('   ✓ Duplicate check correctly flagged duplicate "Admit"');
        } else {
            throw new Error('Duplicate check failed to flag duplicate subdomain');
        }
    } catch (e) {
        console.error('Duplicate check error:', e.message);
        throw e;
    }

    // 2. Create a new test hospital and verify originalSubdomain and tenantKey generation
    const testSlug = `apollo-${Date.now()}`;
    const newHospital = new Hospital({
        name: 'Apollo Jaipur',
        slug: testSlug,
        isActive: true
    });

    await newHospital.save();
    console.log(`   ✓ New hospital saved successfully with slug: ${testSlug}`);

    // Verify fields populated on creation
    const saved = await Hospital.findById(newHospital._id);
    console.log(`   originalSubdomain: "${saved.originalSubdomain}"`);
    console.log(`   tenantKey: "${saved.tenantKey}"`);

    if (saved.originalSubdomain !== testSlug) {
        throw new Error(`Expected originalSubdomain to be "${testSlug}", got "${saved.originalSubdomain}"`);
    }

    const expectedTenantKey = `${testSlug}-${saved._id.toString()}`;
    if (saved.tenantKey !== expectedTenantKey) {
        throw new Error(`Expected tenantKey to be "${expectedTenantKey}", got "${saved.tenantKey}"`);
    }
    console.log('   ✓ originalSubdomain and tenantKey correctly generated and saved');

    // 3. Verify immutability of originalSubdomain and tenantKey
    saved.slug = 'apollo-jaipur-renamed';
    await saved.save();

    const updated = await Hospital.findById(newHospital._id);
    console.log(`   ✓ Slug updated to: "${updated.slug}"`);
    console.log(`   originalSubdomain after slug update: "${updated.originalSubdomain}"`);
    console.log(`   tenantKey after slug update: "${updated.tenantKey}"`);

    if (updated.originalSubdomain !== testSlug) {
        throw new Error(`originalSubdomain changed on update! (Expected: "${testSlug}")`);
    }
    if (updated.tenantKey !== expectedTenantKey) {
        throw new Error(`tenantKey changed on update! (Expected: "${expectedTenantKey}")`);
    }
    console.log('   ✓ originalSubdomain and tenantKey remained immutable after slug update');

    // Clean up
    await Hospital.deleteOne({ _id: newHospital._id });
    console.log('   ✓ Cleanup completed');
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to MongoDB\n');

    await testResolution();
    await testValidationAndGeneration();

    console.log('\n🎉 All TenantKey architecture checks passed successfully!');
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(e => {
    console.error('\n❌ Verification checks failed:', e);
    mongoose.disconnect();
    process.exit(1);
});
