// server/src/utils/secrets.js
/**
 * Secrets Manager Provider Abstraction
 * Supports loading credentials from:
 *   1. Environment Variables (Dotenv Fallback)
 *   2. AWS Secrets Manager (Mock/Stub integration hooks)
 *   3. HashiCorp Vault / Azure Key Vault (Stubs)
 */

const crypto = require('crypto');

// Cache resolved secrets
const secretsCache = new Map();

/**
 * Retrieve a secret value by its key.
 * Can be configured to load asynchronously from vaults in cloud environments.
 * @param {string} key - Secret parameter name (e.g. 'JWT_SECRET', 'MONGODB_URL')
 * @returns {string} Secret value
 */
function getSecret(key) {
    if (secretsCache.has(key)) {
        return secretsCache.get(key);
    }
    
    // Default fallback: load from environment
    const val = process.env[key];
    if (val) {
        secretsCache.set(key, val);
        return val;
    }
    
    // Abstract hook: If AWS Secrets Manager or Vault is enabled, fetch here:
    // if (process.env.USE_AWS_SECRETS) { ... }
    
    return null;
}

/**
 * Set or override a secret dynamically (key rotation support)
 * @param {string} key - Key name
 * @param {string} value - New secret value
 */
function setSecret(key, value) {
    secretsCache.set(key, value);
    // In production, sync with Vault/S3 here
    console.log(`🛡️  Secret '${key}' rotated/updated dynamically.`);
}

module.exports = { getSecret, setSecret };
