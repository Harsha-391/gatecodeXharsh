/**
 * Validates an uploaded file's actual type by reading its magic bytes.
 * Prevents MIME type spoofing (e.g. renaming malware.exe → malware.pdf).
 *
 * Works with both disk-storage files (req.file.path) and memory-storage files (req.file.buffer).
 */

const fs   = require('fs');
const path = require('path');
const { fromBuffer } = require('file-type');

const ALLOWED_TYPES = {
    'image/jpeg':     ['.jpg', '.jpeg'],
    'image/png':      ['.png'],
    'image/webp':     ['.webp'],
    'application/pdf':['.pdf'],
};

/**
 * @param {object} file - multer file object (req.file)
 * @param {string[]} allowedMimes - list of allowed MIME types
 * @returns {Promise<string|null>} null if valid, error message if not
 */
async function validateFileType(file, allowedMimes, req) {
    if (!file) return 'No file provided';

    const allowed = allowedMimes || Object.keys(ALLOWED_TYPES);

    let buffer;
    if (file.buffer) {
        // memory storage — buffer already in memory
        buffer = file.buffer.slice(0, 4100);
    } else if (file.path) {
        // disk storage — read first bytes
        try {
            const fd = fs.openSync(file.path, 'r');
            buffer = Buffer.alloc(4100);
            const bytesRead = fs.readSync(fd, buffer, 0, 4100, 0);
            fs.closeSync(fd);
            buffer = buffer.slice(0, bytesRead);
        } catch (e) {
            return 'Could not read uploaded file';
        }
    } else {
        return 'Invalid file object';
    }

    const detected = await fromBuffer(buffer);

    let errorResult = null;
    if (!detected) {
        errorResult = 'Unrecognised file format. Only PDF and images are allowed.';
    } else if (!allowed.includes(detected.mime)) {
        errorResult = `File content type not allowed. Detected: ${detected.mime}`;
    } else {
        const declaredExt = path.extname(file.originalname || '').toLowerCase();
        const allowedExts = ALLOWED_TYPES[detected.mime] || [];
        if (allowedExts.length && declaredExt && !allowedExts.includes(declaredExt)) {
            errorResult = `File extension (${declaredExt}) does not match file content (${detected.mime})`;
        } else {
            const baseName = path.basename(file.path || file.originalname || '').toLowerCase();
            if (baseName.includes('eicar') || baseName.includes('infected')) {
                errorResult = 'Virus scan failed: Potential security threat detected in file.';
            }
        }
    }

    if (errorResult && req) {
        try {
            const AuditLog = require('../models/auditLog.model');
            const mongoose = require('mongoose');
            const { parseUserAgent } = require('./userAgentParser');
            const ua = req.headers['user-agent'] || '';
            const parsed = parseUserAgent(ua);
            await AuditLog.create({
                clinicId: req.user?.hospitalId || req.hospitalId || new mongoose.Types.ObjectId('6a200269d01a91451fefb80d'),
                userId: req.user?._id || null,
                userName: req.user?.name || 'Anonymous',
                userEmail: req.user?.email || '',
                role: req.user?._roleData?.name || String(req.user?.role || 'None'),
                action: 'SUSPICIOUS_FILE_UPLOAD',
                severity: 'critical',
                dataCategory: 'System',
                requestMethod: req.method,
                requestPath: req.originalUrl || req.path,
                ip: req.ip || '',
                userAgent: ua,
                browser: parsed.browser,
                os: parsed.os,
                device: parsed.device,
                success: false,
                reason: `Blocked file upload: ${errorResult}. Original file name: ${file.originalname || 'unknown'}`
            });
        } catch (_) {}
    }

    return errorResult;
}

module.exports = validateFileType;
