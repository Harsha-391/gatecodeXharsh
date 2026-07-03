const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const imagekit = require('../utils/imagekit');
const MasterDocumentTemplate = require('../models/documentTemplate.model');
const MasterAuditLog = require('../models/auditLog.model');

// Helper to resolve correct tenant models
const getModels = (req) => {
    if (req.tenantDb) {
        const models = getTenantModels(req.tenantDb);
        return {
            DocumentTemplate: models.DocumentTemplate,
            AuditLog: models.AuditLog
        };
    }
    return {
        DocumentTemplate: MasterDocumentTemplate,
        AuditLog: MasterAuditLog
    };
};

// Check if user has permission to upload/manage templates (Hospital Admin, Super Admin, Central Admin, Admin)
const verifyAdminRole = (req, res, next) => {
    const roleName = String(req.user?._roleData?.name || req.user?.role || '').toLowerCase();
    const userPermissions = req.user._roleData?.permissions || req.user.permissions || [];
    
    const hasAccess = 
        ['centraladmin', 'superadmin'].includes(roleName) ||
        userPermissions.includes('document_templates_manage') ||
        userPermissions.includes('*') ||
        // Default access for clinic manager/hospitaladmin unless denied
        ( (roleName === 'hospitaladmin' || roleName === 'admin') && !(req.user.deniedPermissions || []).includes('document_templates_manage') );

    if (hasAccess) {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'Forbidden: Document templates management privilege required' });
    }
};

// Configure Multer for template file validation
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PNG, JPEG, and PDF files are allowed!'), false);
        }
    }
});

// Helper for writing audit logs
const writeAuditLog = async (req, action, severity, reason) => {
    try {
        const { AuditLog } = getModels(req);
        const { parseUserAgent } = require('../utils/userAgentParser');
        const ua = req.headers['user-agent'] || '';
        const parsed = parseUserAgent(ua);
        
        await AuditLog.create({
            clinicId: req.hospitalId || req.user.hospitalId,
            userId: req.user.userId,
            userName: req.user.name || 'System',
            userEmail: req.user.email || '',
            role: String(req.user.role),
            sessionId: req.user.jti || '',
            requestMethod: req.method,
            requestPath: req.originalUrl,
            action,
            severity,
            reason,
            ip: req.ip || '',
            userAgent: ua,
            browser: parsed.browser,
            os: parsed.os,
            device: parsed.device
        });
    } catch (err) {
        console.error('[DocumentTemplate AuditLog Error]', err);
    }
};

// 1. GET /api/document-templates — Retrieve all templates for current tenant
router.get('/', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { DocumentTemplate } = getModels(req);
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const templates = await DocumentTemplate.find({ hospitalId }).lean();
        res.json({ success: true, templates });
    } catch (err) {
        console.error('[DocumentTemplate GET All]', err);
        res.status(500).json({ success: false, message: 'Error retrieving templates' });
    }
});

// 2. GET /api/document-templates/active/:type — Retrieve active template for a type
router.get('/active/:type', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { DocumentTemplate } = getModels(req);
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const template = await DocumentTemplate.findOne({ 
            hospitalId, 
            templateType: req.params.type,
            isActive: true 
        }).lean();
        
        let bgBase64 = null;
        if (template && template.url && !template.url.endsWith('.pdf')) {
            try {
                const axios = require('axios');
                const response = await axios.get(template.url, { responseType: 'arraybuffer' });
                const mimeType = response.headers['content-type'] || 'image/png';
                const base64Data = Buffer.from(response.data, 'binary').toString('base64');
                bgBase64 = `data:${mimeType};base64,${base64Data}`;
            } catch (fetchErr) {
                console.error('[Active Template bgBase64 fetch error]', fetchErr.message);
            }
        }
        
        res.json({ 
            success: true, 
            template: template ? { ...template, bgBase64 } : null 
        });
    } catch (err) {
        console.error('[DocumentTemplate GET Active]', err);
        res.status(500).json({ success: false, message: 'Error retrieving active template' });
    }
});

// 3. POST /api/document-templates/upload — Create or update a template with version history
router.post('/upload', verifyToken, resolveTenant, verifyAdminRole, upload.single('template'), async (req, res) => {
    try {
        const { DocumentTemplate } = getModels(req);
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { templateType, headerHeight, footerHeight, leftMargin, rightMargin } = req.body;

        if (!templateType) {
            return res.status(400).json({ success: false, message: 'Template type is required' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // Upload file to ImageKit
        const uploadResult = await imagekit.upload({
            file: req.file.buffer,
            fileName: `temp_${templateType}_${Date.now()}_${req.file.originalname}`,
            folder: `/hospital_templates/${hospitalId}`,
            tags: ['document_template', templateType, req.file.mimetype]
        });

        // Find existing template
        let template = await DocumentTemplate.findOne({ hospitalId, templateType });

        if (template) {
            // Check in current active file as history
            template.history.push({
                version: template.version,
                url: template.url,
                fileId: template.fileId,
                fileName: template.fileName,
                updatedAt: new Date(),
                updatedBy: req.user.userId
            });

            // Update details
            template.version += 1;
            template.url = uploadResult.url;
            template.fileId = uploadResult.fileId;
            template.fileName = req.file.originalname;
            template.updatedBy = req.user.userId;
            template.isActive = true;

            // Optional settings updates
            if (headerHeight !== undefined) template.headerHeight = Number(headerHeight);
            if (footerHeight !== undefined) template.footerHeight = Number(footerHeight);
            if (leftMargin !== undefined) template.leftMargin = Number(leftMargin);
            if (rightMargin !== undefined) template.rightMargin = Number(rightMargin);

            await template.save();
            await writeAuditLog(req, 'CONFIG_CHANGE', 'info', `Updated template ${templateType} to version ${template.version}`);
        } else {
            // Create new template
            template = new DocumentTemplate({
                hospitalId,
                templateType,
                fileName: req.file.originalname,
                url: uploadResult.url,
                fileId: uploadResult.fileId,
                isActive: true,
                headerHeight: headerHeight !== undefined ? Number(headerHeight) : 50,
                footerHeight: footerHeight !== undefined ? Number(footerHeight) : 30,
                leftMargin: leftMargin !== undefined ? Number(leftMargin) : 15,
                rightMargin: rightMargin !== undefined ? Number(rightMargin) : 15,
                createdBy: req.user.userId,
                updatedBy: req.user.userId,
                version: 1,
                history: []
            });

            await template.save();
            await writeAuditLog(req, 'CONFIG_CHANGE', 'info', `Uploaded initial template for ${templateType}`);
        }

        res.status(201).json({ success: true, message: 'Template uploaded successfully', template });
    } catch (err) {
        console.error('[DocumentTemplate Upload]', err);
        res.status(500).json({ success: false, message: err.message || 'Error uploading template' });
    }
});

// 4. PUT /api/document-templates/:id — Update dynamic margins and status
router.put('/:id', verifyToken, resolveTenant, verifyAdminRole, async (req, res) => {
    try {
        const { DocumentTemplate } = getModels(req);
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { headerHeight, footerHeight, leftMargin, rightMargin, isActive } = req.body;

        const template = await DocumentTemplate.findOne({ _id: req.params.id, hospitalId });
        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        if (headerHeight !== undefined) template.headerHeight = Number(headerHeight);
        if (footerHeight !== undefined) template.footerHeight = Number(footerHeight);
        if (leftMargin !== undefined) template.leftMargin = Number(leftMargin);
        if (rightMargin !== undefined) template.rightMargin = Number(rightMargin);
        if (isActive !== undefined) template.isActive = Boolean(isActive);
        template.updatedBy = req.user.userId;

        await template.save();
        await writeAuditLog(req, 'SETTINGS_UPDATE', 'info', `Updated layout settings of ${template.templateType}`);

        res.json({ success: true, message: 'Template settings updated successfully', template });
    } catch (err) {
        console.error('[DocumentTemplate PUT]', err);
        res.status(500).json({ success: false, message: 'Error updating template settings' });
    }
});

// 5. DELETE /api/document-templates/:id — Delete template and clear from ImageKit
router.delete('/:id', verifyToken, resolveTenant, verifyAdminRole, async (req, res) => {
    try {
        const { DocumentTemplate } = getModels(req);
        const hospitalId = req.hospitalId || req.user.hospitalId;

        const template = await DocumentTemplate.findOne({ _id: req.params.id, hospitalId });
        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        // Optional: Remove active file from ImageKit
        try {
            await imagekit.deleteFile(template.fileId);
        } catch (ikErr) {
            console.warn('[ImageKit File Delete Warning]', ikErr.message);
        }

        // Delete from DB
        await DocumentTemplate.deleteOne({ _id: template._id });
        await writeAuditLog(req, 'DELETE', 'warning', `Deleted template ${template.templateType}`);

        res.json({ success: true, message: 'Template deleted successfully' });
    } catch (err) {
        console.error('[DocumentTemplate DELETE]', err);
        res.status(500).json({ success: false, message: 'Error deleting template' });
    }
});

// 6. POST /api/document-templates/:id/rollback — Rollback to a previous version in history
router.post('/:id/rollback', verifyToken, resolveTenant, verifyAdminRole, async (req, res) => {
    try {
        const { DocumentTemplate } = getModels(req);
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { version } = req.body;

        if (!version) {
            return res.status(400).json({ success: false, message: 'Target version is required for rollback' });
        }

        const template = await DocumentTemplate.findOne({ _id: req.params.id, hospitalId });
        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        const historyIndex = template.history.findIndex(h => h.version === Number(version));
        if (historyIndex === -1) {
            return res.status(400).json({ success: false, message: 'Target version not found in history' });
        }

        const historyEntry = template.history[historyIndex];

        // Backup current active state to history
        const currentActive = {
            version: template.version,
            url: template.url,
            fileId: template.fileId,
            fileName: template.fileName,
            updatedAt: new Date(),
            updatedBy: req.user.userId
        };

        // Swap
        template.version += 1;
        template.url = historyEntry.url;
        template.fileId = historyEntry.fileId;
        template.fileName = historyEntry.fileName;
        template.updatedBy = req.user.userId;
        template.isActive = true;

        // Remove the rolled-back entry from history, and push the old active state
        template.history.splice(historyIndex, 1);
        template.history.push(currentActive);

        await template.save();
        await writeAuditLog(req, 'CONFIG_CHANGE', 'info', `Rolled back template ${template.templateType} to version ${version}`);

        res.json({ success: true, message: `Rolled back to version ${version} successfully`, template });
    } catch (err) {
        console.error('[DocumentTemplate Rollback]', err);
        res.status(500).json({ success: false, message: 'Error rolling back template' });
    }
});

// 7. GET /api/document-templates/logs — Fetch audit logs related to document templates
router.get('/logs', verifyToken, resolveTenant, verifyAdminRole, async (req, res) => {
    try {
        const { AuditLog } = getModels(req);
        const hospitalId = req.hospitalId || req.user.hospitalId;

        const logs = await AuditLog.find({
            clinicId: hospitalId,
            action: { $in: ['CONFIG_CHANGE', 'SETTINGS_UPDATE', 'DELETE', 'PRESCRIPTION_GENERATED', 'INVOICE_CREATED'] }
        })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

        res.json({ success: true, logs });
    } catch (err) {
        console.error('[DocumentTemplate Logs]', err);
        res.status(500).json({ success: false, message: 'Error retrieving template logs' });
    }
});

module.exports = router;
