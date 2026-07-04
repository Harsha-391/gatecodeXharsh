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
            Hospital: require('../models/hospital.model'),
            Department: require('../models/department.model')
        };
    }
    return {
        QuestionLibrary: require('../models/questionLibrary.model'),
        Hospital: require('../models/hospital.model'),
        Department: require('../models/department.model')
    };
};

// Get the latest question library configuration
router.get('/', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { QuestionLibrary, Hospital, Department } = getModels(req);
        const hospitalId = req.user.hospitalId || null;
        let library = null;
        let allowedDepartments = null; // null means all allowed (super/central admin)

        if (hospitalId) {
            library = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
            let hospital = await Hospital.findById(hospitalId);
            if (!hospital) {
                const Clinic = require('../models/clinic.model');
                hospital = await Clinic.findById(hospitalId);
            }
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

        let libraryDataObj = {};
        if (library && library.data) {
            libraryDataObj = library.data;
        }

        let mergedData;
        if (allowedDepartments === null) {
            // Super/Central admin: Retrieve all active departments in database to populate
            const activeDepartments = await Department.find({ isActive: true });
            const activeDeptNames = activeDepartments.map(d => d.name);

            // Start with what is stored in the library data
            mergedData = { ...libraryDataObj };

            // Ensure all active departments exist as keys in mergedData
            activeDeptNames.forEach(dept => {
                if (!mergedData[dept]) {
                    mergedData[dept] = {};
                }
            });
        } else {
            // Dynamically build defaultDepts based on allowed departments
            let defaultDepts = {};
            if (allowedDepartments.length > 0) {
                allowedDepartments.forEach(dept => {
                    defaultDepts[dept] = {};
                });
            } else {
                defaultDepts = { "General": {} }; // default fallback
            }

            // Only keep allowed departments in the mergedData to prevent saving extra departments
            mergedData = {};
            Object.keys(defaultDepts).forEach(dept => {
                mergedData[dept] = libraryDataObj[dept] || {};
            });
        }

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
        const roleName = String(req.user?.role || '').toLowerCase();
        const perms = req.user._roleData?.permissions || req.user.permissions || [];
        const hasAccess = 
            ['centraladmin', 'superadmin'].includes(roleName) ||
            perms.includes('question_library_manage') ||
            perms.includes('*') ||
            ( (roleName === 'hospitaladmin' || roleName === 'admin') && !(req.user.deniedPermissions || []).includes('question_library_manage') );

        if (!hasAccess) {
            return res.status(403).json({ success: false, message: 'Forbidden: Question library management privilege required' });
        }

        const { QuestionLibrary, Hospital, Department } = getModels(req);
        const { data } = req.body;
        const hospitalId = req.user.hospitalId || null;

        if (!data) return res.status(400).json({ success: false, message: 'Library data is required' });

        let allowedDepartments = null; // null means all allowed (super/central admin)
        if (hospitalId) {
            let hospital = await Hospital.findById(hospitalId);
            if (!hospital) {
                const Clinic = require('../models/clinic.model');
                hospital = await Clinic.findById(hospitalId);
            }
            if (hospital && hospital.departments) {
                allowedDepartments = hospital.departments;
            } else {
                allowedDepartments = [];
            }
        }

        let mergedData;
        if (allowedDepartments === null) {
            // Super/Central admin: Save all department data without filtering
            mergedData = data;

            // Sync the Department database collection with the new department list in mergedData keys
            const newDeptNames = Object.keys(mergedData);
            
            // Delete any department in the database that is NOT in the new list
            await Department.deleteMany({ name: { $nin: newDeptNames } });

            // Create/Insert any department in the new list that is not already in the database
            const existingDepts = await Department.find({});
            const existingNames = existingDepts.map(d => d.name);
            const deptsToAdd = newDeptNames.filter(name => !existingNames.includes(name));
            
            for (const name of deptsToAdd) {
                await Department.create({
                    name,
                    description: `${name} department`,
                    isActive: true
                });
            }
        } else {
            // Dynamically build defaultDepts based on allowed departments
            let defaultDepts = {};
            if (allowedDepartments.length > 0) {
                allowedDepartments.forEach(dept => {
                    defaultDepts[dept] = {};
                });
            } else {
                defaultDepts = { "General": {} }; // default fallback
            }

            // Only keep allowed departments in the mergedData to prevent saving extra departments
            mergedData = {};
            Object.keys(defaultDepts).forEach(dept => {
                mergedData[dept] = data[dept] || {};
            });
        }

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
