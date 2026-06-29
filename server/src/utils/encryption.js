// server/src/utils/encryption.js
const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// Derive a 32-byte encryption key from the JWT_SECRET
function getEncryptionKey() {
    const secret = process.env.JWT_SECRET || 'default_super_secure_go_live_encryption_secret_key';
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext string using AES-256-CBC
 * @param {string} text - Plaintext string to encrypt
 * @returns {string} iv:encryptedText
 */
function encrypt(text) {
    if (!text || typeof text !== 'string') return text;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    } catch (err) {
        console.error('[Encryption] Failed to encrypt field:', err.message);
        return text;
    }
}

/**
 * Decrypt an encrypted string (iv:encryptedText) using AES-256-CBC
 * @param {string} encryptedText - Encrypted string in the format iv:ciphertext
 * @returns {string} Plaintext decrypted string
 */
function decrypt(encryptedText) {
    if (!encryptedText || typeof encryptedText !== 'string' || !encryptedText.includes(':')) {
        return encryptedText;
    }
    try {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        
        const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        // Return original text as fallback (useful for existing plaintext records in db)
        return encryptedText;
    }
}

module.exports = { encrypt, decrypt };
