const express = require('express');
const router = express.Router();
const { verifyAdminOrSuperAdmin, verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');

const getModels = (req) => {
    if (req.tenantDb) {
        const tenantModels = getTenantModels(req.tenantDb);
        return {
            QuestionLibrary: tenantModels.QuestionLibrary,
            Hospital: tenantModels.Hospital
        };
    }
    return {
        QuestionLibrary: require('../models/questionLibrary.model'),
        Hospital: require('../models/hospital.model')
    };
};

// Get the latest question library configuration
router.get('/', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { QuestionLibrary, Hospital } = getModels(req);
        const hospitalId = req.user.hospitalId || null;
        let library = null;
        let allowedDepartments = null; // null means all allowed (super/central admin)

        if (hospitalId) {
            library = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
            const hospital = await Hospital.findById(hospitalId);
            if (hospital && hospital.departments) {
                allowedDepartments = hospital.departments;
            } else {
                allowedDepartments = [];
            }
        }

        if (!library) {
            // Fallback to global template
            library = await QuestionLibrary.findOne({ hospitalId: null }).sort({ version: -1 });
        }

        // Dynamically build defaultDepts based on allowed departments
        let defaultDepts = {};
        if (allowedDepartments && allowedDepartments.length > 0) {
            allowedDepartments.forEach(dept => {
                defaultDepts[dept] = {};
            });
        } else {
            defaultDepts = { "General": {} }; // default fallback
        }

        let libraryDataObj = {};
        if (library && library.data) {
            libraryDataObj = library.data;
        }

        // Only keep allowed departments in the mergedData to prevent saving extra departments
        const mergedData = {};
        Object.keys(defaultDepts).forEach(dept => {
            mergedData[dept] = libraryDataObj[dept] || {};
        });

        let resultLibrary = null;
        if (library) {
            resultLibrary = library.toObject();
            resultLibrary.data = mergedData;
        } else {
            resultLibrary = { data: mergedData };
        }

        res.json({ success: true, data: resultLibrary, allowedDepartments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update or create question library
router.post('/', verifyAdminOrSuperAdmin, resolveTenant, async (req, res) => {
    try {
        const { QuestionLibrary, Hospital } = getModels(req);
        const { data } = req.body;
        const hospitalId = req.user.hospitalId || null;

        if (!data) return res.status(400).json({ success: false, message: 'Library data is required' });

        let allowedDepartments = [];
        if (hospitalId) {
            const hospital = await Hospital.findById(hospitalId);
            if (hospital && hospital.departments) {
                allowedDepartments = hospital.departments;
            }
        }

        // Dynamically build defaultDepts based on allowed departments
        let defaultDepts = {};
        if (allowedDepartments && allowedDepartments.length > 0) {
            allowedDepartments.forEach(dept => {
                defaultDepts[dept] = {};
            });
        } else {
            defaultDepts = { "General": {} }; // default fallback
        }

        // Only keep allowed departments in the mergedData to prevent saving extra departments
        const mergedData = {};
        Object.keys(defaultDepts).forEach(dept => {
            mergedData[dept] = data[dept] || {};
        });

        const latestLibrary = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
        let newVersion = 1;
        if (latestLibrary) {
            newVersion = latestLibrary.version + 1;
        }

        const library = new QuestionLibrary({ data: mergedData, version: newVersion, hospitalId });
        await library.save();

        res.status(201).json({ success: true, message: 'Question Library updated successfully', data: library });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
