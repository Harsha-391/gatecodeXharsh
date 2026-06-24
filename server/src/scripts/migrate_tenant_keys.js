/**
 * migrate_tenant_keys.js — Backfill originalSubdomain and tenantKey for existing hospitals
 * Run: node src/scripts/migrate_tenant_keys.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('../models/hospital.model');

function slugify(name) {
    return name.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

async function run() {
    const mongoUrl = process.env.MONGODB_URL;
    if (!mongoUrl) {
        console.error('Error: MONGODB_URL environment variable is not defined.');
        process.exit(1);
    }
    
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to MongoDB\n');

    const hospitals = await Hospital.find({});
    console.log(`Processing ${hospitals.length} hospitals/clinics...\n`);

    let migratedCount = 0;
    for (const h of hospitals) {
        const updateFields = {};
        
        let originalSubdomain = h.originalSubdomain;
        if (!originalSubdomain) {
            originalSubdomain = h.slug || slugify(h.name);
            updateFields.originalSubdomain = originalSubdomain;
        }

        let tenantKey = h.tenantKey;
        if (!tenantKey) {
            tenantKey = `${originalSubdomain}-${h._id.toString()}`;
            updateFields.tenantKey = tenantKey;
        }

        if (Object.keys(updateFields).length > 0) {
            await Hospital.collection.updateOne({ _id: h._id }, { $set: updateFields });
            console.log(`✅ Migrated: "${h.name}"`);
            console.log(`   originalSubdomain: ${originalSubdomain}`);
            console.log(`   tenantKey: ${tenantKey}`);
            migratedCount++;
        } else {
            console.log(`✓ Already Migrated: "${h.name}" (tenantKey: ${h.tenantKey})`);
        }
    }

    console.log(`\n🎉 Done! Migrated ${migratedCount} records.`);
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(e => {
    console.error('Migration failed:', e);
    process.exit(1);
});
