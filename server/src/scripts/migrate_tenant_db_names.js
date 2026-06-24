/**
 * migrate_tenant_db_names.js
 *
 * One-time script: Clones and renames all multi-tenant databases from the old
 * schema (hms_hospital_[hospitalId]) to the new schema (hms_hospital_[tenantKey]).
 *
 * Run:
 *   node src/scripts/migrate_tenant_db_names.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('../models/hospital.model');

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL is not defined in environment variables.');
    process.exit(1);
}

function getBaseClusterUri() {
    const url = new URL(MONGODB_URL);
    return `${url.protocol}//${url.username}:${url.password}@${url.host}`;
}

function sanitizeDbName(tenantKey) {
    let dbName = tenantKey;
    if (tenantKey.includes('-')) {
        const parts = tenantKey.split('-');
        const id = parts[parts.length - 1]; // last part is the 24-character hospitalId
        const subdomain = parts.slice(0, -1).join('-');
        const slicedSubdomain = subdomain.slice(0, 11);
        dbName = `${slicedSubdomain}-${id}`;
    }
    return `h_${String(dbName).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

async function cloneDatabase(baseUri, oldDbName, newDbName) {
    const oldUri = `${baseUri}/${oldDbName}?retryWrites=true&w=majority`;
    const newUri = `${baseUri}/${newDbName}?retryWrites=true&w=majority`;

    const oldConn = mongoose.createConnection(oldUri);
    await oldConn.asPromise();

    const newConn = mongoose.createConnection(newUri);
    await newConn.asPromise();

    const collections = await oldConn.db.listCollections().toArray();
    console.log(`   └─ Found ${collections.length} collections to copy...`);

    for (const colInfo of collections) {
        const colName = colInfo.name;
        if (colName.startsWith('system.')) continue;

        console.log(`      👉 Copying collection: ${colName}`);
        const sourceCol = oldConn.db.collection(colName);
        const targetCol = newConn.db.collection(colName);

        // Copy documents
        const docs = await sourceCol.find({}).toArray();
        if (docs.length > 0) {
            await targetCol.insertMany(docs);
        }

        // Copy indexes
        const indexes = await sourceCol.indexes();
        for (const idx of indexes) {
            if (idx.name === '_id_') continue;
            const options = { name: idx.name };
            if (idx.unique) options.unique = true;
            if (idx.sparse) options.sparse = true;
            if (idx.background) options.background = true;
            try {
                await targetCol.createIndex(idx.key, options);
            } catch (e) {
                console.warn(`         ⚠️ Could not create index ${idx.name}:`, e.message);
            }
        }

        // Validate count
        const sourceCount = await sourceCol.countDocuments({});
        const targetCount = await targetCol.countDocuments({});
        if (sourceCount !== targetCount) {
            throw new Error(`Collection count mismatch for ${colName}! Source = ${sourceCount}, Target = ${targetCount}`);
        }
    }

    await oldConn.close();
    await newConn.close();
}

async function dropDatabase(baseUri, dbName) {
    const uri = `${baseUri}/${dbName}?retryWrites=true&w=majority`;
    const conn = mongoose.createConnection(uri);
    await conn.asPromise();
    await conn.db.dropDatabase();
    await conn.close();
}

async function main() {
    console.log('\n🚀 Starting database renaming migration (ID -> tenantKey)...\n');

    await mongoose.connect(MONGODB_URL);
    console.log('✅ Connected to Master DB');

    const admin = mongoose.connection.db.admin();
    const dbsList = await admin.listDatabases();
    const existingDbs = dbsList.databases.map(d => d.name);
    console.log(`ℹ️  Found ${existingDbs.length} total databases in cluster.\n`);

    const hospitals = await Hospital.find({});
    console.log(`Processing ${hospitals.length} hospital records...`);

    const baseUri = getBaseClusterUri();
    let migratedCount = 0;
    let skippedCount = 0;

    for (const h of hospitals) {
        const hospitalId = String(h._id);
        const tenantKey = h.tenantKey || `${h.originalSubdomain || h.slug}-${hospitalId}`;
        
        const oldDbName = `hms_hospital_${hospitalId}`;
        const newDbName = sanitizeDbName(tenantKey);

        console.log(`\nHospital: "${h.name}"`);
        console.log(` - Expected old database: ${oldDbName}`);
        console.log(` - Target new database:   ${newDbName}`);

        if (oldDbName === newDbName) {
            console.log(` ℹ️  Old name and new name are identical. Skipping.`);
            skippedCount++;
            continue;
        }

        const oldExists = existingDbs.includes(oldDbName);
        const newExists = existingDbs.includes(newDbName);

        if (!oldExists) {
            if (newExists) {
                console.log(` ✓ New database ${newDbName} already exists, old database is gone. Already migrated!`);
                skippedCount++;
            } else {
                console.log(` ℹ️  Old database ${oldDbName} does not exist (not provisioned yet). Skipping.`);
                skippedCount++;
            }
            continue;
        }

        if (newExists) {
            console.log(` ⚠️  Warning: Target database ${newDbName} already exists! Skipping to prevent overwrite.`);
            skippedCount++;
            continue;
        }

        console.log(` ➡️  Cloning ${oldDbName} to ${newDbName}...`);
        try {
            await cloneDatabase(baseUri, oldDbName, newDbName);
            console.log(` ✅ Clone completed and validated.`);
            
            console.log(` 🗑️  Dropping old database ${oldDbName}...`);
            await dropDatabase(baseUri, oldDbName);
            console.log(` ✅ Old database dropped.`);
            
            migratedCount++;
        } catch (err) {
            console.error(` ❌ Migration failed for ${h.name}:`, err.message);
            console.log(' ℹ️  Attempting recovery: dropping incomplete target database...');
            try {
                await dropDatabase(baseUri, newDbName);
            } catch (recoveryErr) {
                console.error('   Failed recovery cleanup:', recoveryErr.message);
            }
        }
    }

    console.log('\n──────────────────────────────────────────────────');
    console.log(`🎉 Migration Completed!`);
    console.log(`  - Migrated (Renamed): ${migratedCount}`);
    console.log(`  - Skipped:             ${skippedCount}`);
    console.log('──────────────────────────────────────────────────\n');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error during migration:', err);
    process.exit(1);
});
