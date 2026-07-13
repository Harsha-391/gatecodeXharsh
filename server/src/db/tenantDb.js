/**
 * tenantDb.js — Multi-Tenant Database Connection Manager
 *
 * Strategy: Database-per-tenant inside ONE Atlas cluster.
 *   - Master DB (MONGODB_URL): stores Hospitals, CentralAdmins, Roles (global)
 *   - Tenant DB (auto-named): stores all hospital-specific data
 *
 * Compass: Just connect to your cluster URI once. All tenant databases
 *          will automatically appear in the left sidebar as they are created.
 */

const mongoose = require('mongoose');

// In-memory cache: { hospitalDbName -> Mongoose Connection }
const connectionCache = new Map();

// In-memory cache: { hospitalId -> tenantKey }
const idToTenantKeyCache = new Map();

// In-memory cache: { hospitalId/tenantKey -> isClinic (boolean) }
const idToIsClinicCache = new Map();

/**
 * Extract the base cluster URI (strip the database name from the URL).
 * e.g. "mongodb+srv://user:pass@cluster0.xyz.mongodb.net/IVF_CRM_TEST?retryWrites=true"
 *   -> "mongodb+srv://user:pass@cluster0.xyz.mongodb.net"
 */
function getBaseClusterUri() {
    const fullUri = process.env.MONGODB_URL;
    if (!fullUri) throw new Error('MONGODB_URL is not defined in .env');

    // Remove the database name and query params, keep the cluster URI
    // Works for both mongodb+srv:// and mongodb:// formats
    const url = new URL(fullUri);
    // Return scheme + auth + host only (no path/database, no query)
    const base = `${url.protocol}//${url.username}:${url.password}@${url.host}`;
    return base;
}

/**
 * Sanitize a tenantKey string to be safe for use as a MongoDB database name.
 * Ensured to stay under MongoDB Atlas's 38-byte limit on M0/Flex tiers.
 */
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

/**
 * Get (or create and cache) a Mongoose connection for a specific hospital.
 *
 * @param {string} hospitalIdOrKey - The MongoDB ObjectId string or the tenantKey of the hospital
 * @returns {Promise<mongoose.Connection>}
 */
async function cleanupClinicCollections(connection, dbName) {
    try {
        const collections = await connection.db.listCollections().toArray();
        const colNames = collections.map(c => c.name);
        
        const forbiddenForClinic = [
            'admissions', 'transfers', 'labreports', 'labs', 'labtests',
            'testpackages', 'resources', 'facilities', 'facilitycharges',
            'insuranceclaims', 'reconciliations', 'payrollrecords',
            'doctorpayouts', 'discountrequests', 'collectiontransactions',
            'hospitalpatients', 'expenses', 'expensecategories', 'invoices', 'refunds',
            'auditlogs', 'hospitals', 'pharmacypurchaserequests', 'medicines', 'notifications',
            'questionlibraries', 'receptions', 'roles', 'services', 'useractivitylogs'
        ];

        const unconditionalDrops = [
            'auditlogs', 'hospitals', 'pharmacypurchaserequests', 'medicines', 'notifications',
            'questionlibraries', 'receptions', 'roles', 'services', 'useractivitylogs'
        ];

        let droppedCount = 0;
        for (const name of colNames) {
            if (forbiddenForClinic.includes(name)) {
                if (unconditionalDrops.includes(name)) {
                    await connection.db.dropCollection(name);
                    droppedCount++;
                } else {
                    const count = await connection.db.collection(name).countDocuments();
                    if (count === 0) {
                        await connection.db.dropCollection(name);
                        droppedCount++;
                    }
                }
            }
        }
        if (droppedCount > 0) {
            console.log(`🧹 Dropped ${droppedCount} empty forbidden hospital collections from clinic database: ${dbName}`);
        }
    } catch (err) {
        console.error(`[cleanupClinicCollections error for ${dbName}]`, err);
    }
}

async function cleanupEmptyHospitalCollections(connection, dbName) {
    try {
        const collections = await connection.db.listCollections().toArray();
        const colNames = collections.map(c => c.name);
        
        let droppedCount = 0;
        for (const name of colNames) {
            if (name.startsWith('system.')) continue;
            
            // Check if collection is empty
            const count = await connection.db.collection(name).countDocuments();
            if (count === 0) {
                await connection.db.dropCollection(name);
                droppedCount++;
            }
        }
        if (droppedCount > 0) {
            console.log(`🧹 Cleaned up ${droppedCount} unused empty collections from hospital database: ${dbName}`);
        }
    } catch (err) {
        console.error(`[cleanupEmptyHospitalCollections error for ${dbName}]`, err);
    }
}

async function getTenantConnection(hospitalIdOrKey) {
    let tenantKey = hospitalIdOrKey;
    let isClinic = false;

    const cacheKey = String(hospitalIdOrKey);
    const cachedTenantKey = idToTenantKeyCache.get(cacheKey);
    const cachedIsClinic = idToIsClinicCache.get(cacheKey);

    if (cachedTenantKey !== undefined) {
        tenantKey = cachedTenantKey;
        isClinic = cachedIsClinic === true;
    } else {
        // Resolve tenantKey and check clinicType
        try {
            const Hospital = require('../models/hospital.model');
            let query = {};
            if (/^[0-9a-fA-F]{24}$/.test(hospitalIdOrKey)) {
                query._id = hospitalIdOrKey;
            } else {
                const parts = hospitalIdOrKey.split('-');
                const potentialId = parts[parts.length - 1];
                if (/^[0-9a-fA-F]{24}$/.test(potentialId)) {
                    query._id = potentialId;
                } else {
                    query.tenantKey = hospitalIdOrKey;
                }
            }
            
            let hospital = await Hospital.findOne(query).select('tenantKey originalSubdomain slug clinicType').lean();
            if (!hospital) {
                const Clinic = require('../models/clinic.model');
                hospital = await Clinic.findOne(query).select('tenantKey originalSubdomain slug clinicType').lean();
            }
            if (hospital) {
                tenantKey = hospital.tenantKey || `${hospital.originalSubdomain || hospital.slug}-${hospital._id.toString()}`;
                isClinic = hospital.clinicType === 'clinic';
                
                // Cache the values immediately
                idToTenantKeyCache.set(cacheKey, tenantKey);
                idToIsClinicCache.set(cacheKey, isClinic);
                // Also cache by the resolved tenantKey itself
                idToTenantKeyCache.set(tenantKey, tenantKey);
                idToIsClinicCache.set(tenantKey, isClinic);
            }
        } catch (err) {
            console.error('[getTenantConnection clinic resolve error]', err);
        }
    }

    const dbName = sanitizeDbName(tenantKey);

    // If there is a cached connection promise, check if it's resolved and still open/active
    if (connectionCache.has(dbName)) {
        const cachedPromise = connectionCache.get(dbName);
        try {
            const connection = await cachedPromise;
            if (connection.readyState === 1 /* connected */) {
                return connection;
            }
        } catch (err) {
            // Promise failed or connection is dead/closing. Delete it from cache.
        }
        connectionCache.delete(dbName);
    }

    const baseUri = getBaseClusterUri();
    const tenantUri = `${baseUri}/${dbName}?retryWrites=true&w=majority`;

    console.log(`🏥 Opening tenant DB connection: ${dbName}${isClinic ? ' [type: clinic]' : ' [type: hospital]'}`);

    const connectionPromise = (async () => {
        const connection = mongoose.createConnection(tenantUri, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
            maxPoolSize: 5,
            autoIndex: false, // Prevents Mongoose from auto-creating empty collections on startup
        });

        connection.isClinic = isClinic;

        await new Promise((resolve, reject) => {
            const onOpen = () => {
                connection.removeListener('error', onError);
                resolve();
            };
            const onError = (err) => {
                connection.removeListener('open', onOpen);
                reject(err);
            };
            connection.once('open', onOpen);
            connection.once('error', onError);
        });

        console.log(`✅ Tenant DB connected: ${dbName}`);
        connectionPromise.value = connection;

        // Clean up empty forbidden hospital collections inside clinic databases in background
        if (isClinic) {
            setImmediate(() => {
                cleanupClinicCollections(connection, dbName).catch(console.error);
            });
        } else {
            setImmediate(() => {
                cleanupEmptyHospitalCollections(connection, dbName).catch(console.error);
            });
        }

        return connection;
    })();

    // Store the promise in the cache immediately so concurrent requests share it
    connectionCache.set(dbName, connectionPromise);

    // If the connection setup fails, we want to remove the failed promise from the cache
    // so subsequent attempts can try again.
    connectionPromise.catch(() => {
        if (connectionCache.get(dbName) === connectionPromise) {
            connectionCache.delete(dbName);
        }
    });

    return connectionPromise;
}

/**
 * Get the MASTER database connection (the default mongoose connection).
 * This stores: Hospitals, CentralAdmins, global Roles.
 */
function getMasterConnection() {
    return mongoose.connection;
}

/**
 * Get the friendly database name for a hospitalId or tenantKey (for logging/display).
 */
function getTenantDbName(hospitalId, tenantKey) {
    if (tenantKey) {
        return sanitizeDbName(tenantKey);
    }
    if (idToTenantKeyCache.has(hospitalId)) {
        return sanitizeDbName(idToTenantKeyCache.get(hospitalId));
    }
    return sanitizeDbName(hospitalId);
}

/**
 * Close and remove a tenant connection from cache.
 * Used when deleting a hospital to clean up resources.
 */
async function removeTenantConnection(hospitalId) {
    let tenantKey = hospitalId;
    if (/^[0-9a-fA-F]{24}$/.test(hospitalId)) {
        if (idToTenantKeyCache.has(hospitalId)) {
            tenantKey = idToTenantKeyCache.get(hospitalId);
        } else {
            const Hospital = require('../models/hospital.model');
            const hospital = await Hospital.findById(hospitalId).lean();
            if (hospital) {
                tenantKey = hospital.tenantKey || `${hospital.originalSubdomain || hospital.slug}-${hospital._id.toString()}`;
                idToTenantKeyCache.set(hospitalId, tenantKey);
            }
        }
    }
    const dbName = sanitizeDbName(tenantKey);
    if (connectionCache.has(dbName)) {
        const promise = connectionCache.get(dbName);
        try {
            const conn = await promise;
            await conn.close();
        } catch (e) { /* ignore */ }
        connectionCache.delete(dbName);
        console.log(`🗑️  Removed tenant connection from cache: ${dbName}`);
    }
}

/**
 * List all currently cached (open) tenant connections.
 * Useful for the Supreme Admin's monitoring dashboard.
 */
function getActiveConnections() {
    const active = [];
    for (const [dbName, promise] of connectionCache.entries()) {
        const conn = promise.value;
        if (conn) {
            active.push({
                dbName,
                readyState: conn.readyState, // 1 = connected
                host: conn.host,
            });
        } else {
            active.push({
                dbName,
                readyState: 2, // 2 = connecting
                host: null,
            });
        }
    }
    return active;
}

module.exports = {
    getTenantConnection,
    getMasterConnection,
    getTenantDbName,
    getActiveConnections,
    removeTenantConnection,
};
