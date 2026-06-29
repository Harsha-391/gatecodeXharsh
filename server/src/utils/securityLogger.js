// server/src/utils/securityLogger.js
const fs = require('fs');
const path = require('path');

const logDirectory = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
}

const auditLogFile = path.join(logDirectory, 'security_audit.log');

/**
 * Safely log a security event to a secure audit log file
 * @param {string} action - The security event category (e.g. FAILED_LOGIN, PROTOTYPE_POLLUTION, CROSS_TENANT_ATTEMPT, RATE_LIMIT_VIOLATION)
 * @param {object} metadata - Details about the incident
 * @param {object} req - Optional Express request object to capture context
 */
function logSecurityEvent(action, metadata = {}, req = null) {
    try {
        const timestamp = new Date().toISOString();
        
        // Strip sensitive keys from metadata to prevent leaking secrets/passwords/PII
        const sanitizedMetadata = { ...metadata };
        const sensitiveKeys = ['password', 'token', 'otp', 'secret', 'mfaSecret', 'currentPassword', 'newPassword', 'aadhaarNumber'];
        
        const sanitizeObject = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            for (const key in obj) {
                if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object') {
                    sanitizeObject(obj[key]);
                }
            }
        };
        sanitizeObject(sanitizedMetadata);

        const logEntry = {
            timestamp,
            action,
            metadata: sanitizedMetadata,
            ip: req?.ip || req?.headers['x-forwarded-for'] || 'unknown',
            userAgent: req?.headers['user-agent'] || 'unknown',
            path: req?.originalUrl || req?.path || 'unknown',
            method: req?.method || 'unknown'
        };

        const formattedLog = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(auditLogFile, formattedLog, 'utf8');
        
        // Also print to internal server console in dev mode
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`🛡️  [SECURITY AUDIT - ${action}]`, JSON.stringify(sanitizedMetadata));
        }
    } catch (err) {
        console.error('Failed to write to security audit log:', err.message);
    }
}

module.exports = { logSecurityEvent };
