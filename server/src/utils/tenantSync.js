const { getTenantConnection } = require('../db/tenantDb');
const { getTenantModels } = require('../db/tenantModels');

/**
 * Utility to sync documents from the Master DB to the Tenant DB.
 * Allows keeping a master registry for authentication/global lookups,
 * while isolating operational/profile data in hospital-specific tenant databases.
 */
async function syncToTenant(entityType, doc, action, hospitalId) {
    if (!hospitalId) return;
    try {
        const tenantDb = await getTenantConnection(String(hospitalId));
        if (!tenantDb) return;
        const tenantModels = getTenantModels(tenantDb);
        const TenantModel = tenantModels[entityType];
        if (!TenantModel) {
            console.warn(`[Tenant Sync] Model for ${entityType} not found in tenantModels`);
            return;
        }

        if (action === 'delete') {
            await TenantModel.findByIdAndDelete(doc._id);
            console.log(`[Tenant Sync] Deleted ${entityType} ID: ${doc._id} in tenant DB`);
        } else if (action === 'save') {
            const data = doc.toObject ? doc.toObject() : doc;
            await TenantModel.findByIdAndUpdate(doc._id, data, { upsert: true, new: true, runValidators: false });
            console.log(`[Tenant Sync] Synced ${entityType} ID: ${doc._id} in tenant DB`);
        }
    } catch (err) {
        console.error(`[Tenant Sync Error] Failed to sync ${entityType} (${action}) for hospital ${hospitalId}:`, err.message);
    }
}

module.exports = { syncToTenant };
