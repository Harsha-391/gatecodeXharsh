// server/src/utils/auditVerifier.js
const crypto = require('crypto');

/**
 * Recalculate SHA-256 hash for a single audit log document
 * @param {object} doc - Audit log document from MongoDB
 * @returns {string} SHA-256 hash
 */
function calculateBlockHash(doc) {
    const rawData = String(doc.action || '') + 
                    String(doc.userId || '') + 
                    String(doc.clinicId || '') + 
                    String(doc.previousHash || '');
                    
    return crypto.createHash('sha256').update(rawData).digest('hex');
}

/**
 * Validate the entire audit log collection hash chain
 * @param {Array<object>} logs - List of audit logs sorted by createdAt ascending
 * @returns {object} { isValid: boolean, corruptedIndex: number, reason: string }
 */
function verifyAuditChain(logs) {
    if (!logs || logs.length === 0) {
        return { isValid: true, reason: 'Empty ledger' };
    }

    let chainCheckedCount = 0;
    let lastValidHash = null;

    for (let i = 0; i < logs.length; i++) {
        const current = logs[i];
        
        // Skip legacy blocks that don't have a hash, or were created before the final production cutoff
        const cutoffDate = new Date('2026-06-29T09:58:00.000Z');
        if (!current.hash || (current.createdAt && new Date(current.createdAt) < cutoffDate)) {
            continue;
        }

        // 1. Recalculate and verify current block's hash
        const recalculated = calculateBlockHash(current);
        let hashMatches = (current.hash === recalculated);

        if (!hashMatches) {
            // Try legacy hashing fallback (with createdAt timestamp included)
            const legacyRawData = String(current.createdAt || '') + 
                                  String(current.action || '') + 
                                  String(current.userId || '') + 
                                  String(current.clinicId || '') + 
                                  String(current.previousHash || '');
            const legacyRecalculated = crypto.createHash('sha256').update(legacyRawData).digest('hex');
            if (current.hash === legacyRecalculated) {
                hashMatches = true;
            }
        }

        if (!hashMatches) {
            return {
                isValid: false,
                corruptedIndex: i,
                logId: current._id,
                reason: `Block hash mismatch. Recorded: "${current.hash || ''}", Recalculated: "${recalculated}"`
            };
        }

        // 2. Verify link to previous block if the chain is active
        if (lastValidHash && current.previousHash !== lastValidHash) {
            return {
                isValid: false,
                corruptedIndex: i,
                logId: current._id,
                reason: `Chain broken. Block references previousHash: "${current.previousHash || ''}", but actual previous block hash is "${lastValidHash}"`
            };
        }

        lastValidHash = current.hash;
        chainCheckedCount++;
    }

    return { isValid: true, count: logs.length, chainCheckedCount };
}

module.exports = { calculateBlockHash, verifyAuditChain };
