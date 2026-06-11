const express = require('express');
const router = express.Router();
const QuestionLibrary = require('../models/questionLibrary.model');
const Hospital = require('../models/hospital.model');
const { verifyAdminOrSuperAdmin, verifyToken } = require('../middleware/auth.middleware');

// Get the latest question library configuration
router.get('/', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || null;
        let library = null;

        if (hospitalId) {
            library = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
        }

        if (!library) {
            // Fallback to global template
            library = await QuestionLibrary.findOne({ hospitalId: null }).sort({ version: -1 });
        }

        const defaultDepts = { "General": {}, "Orthopedics": {}, "ENT": {} };
        let libraryDataObj = {};
        if (library && library.data) {
            libraryDataObj = library.data;
        }
        const mergedData = { ...defaultDepts, ...libraryDataObj };

        let resultLibrary = null;
        if (library) {
            resultLibrary = library.toObject();
            resultLibrary.data = mergedData;
        } else {
            resultLibrary = { data: mergedData };
        }

        let allowedDepartments = null; // null means all allowed (super/central admin)
        if (hospitalId) {
            const hospital = await Hospital.findById(hospitalId);
            if (hospital && hospital.departments) {
                allowedDepartments = hospital.departments;
            } else {
                allowedDepartments = [];
            }
        }

        res.json({ success: true, data: resultLibrary, allowedDepartments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update or create question library
router.post('/', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { data } = req.body;
        const hospitalId = req.user.hospitalId || null;

        if (!data) return res.status(400).json({ success: false, message: 'Library data is required' });

        const defaultDepts = { "General": {}, "Orthopedics": {}, "ENT": {} };
        const mergedData = { ...defaultDepts, ...data };

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
