const express = require('express');
const router = express.Router();
const { verifyAdminOrSuperAdmin, verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const MasterMedicine = require('../models/medicine.model');

const getModels = (req) => {
    if (req.tenantDb) {
        return {
            Medicine: getTenantModels(req.tenantDb).Medicine
        };
    }
    return {
        Medicine: MasterMedicine
    };
};

// Get all medicines
router.get('/', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { Medicine } = getModels(req);
        
        const cache = require('../utils/cache');
        const isTenant = !!req.tenantDb;
        const tenantKey = isTenant ? (req.user.hospitalId || 'tenant') : 'master';
        const cacheKey = `medicines_${tenantKey}`;

        let medicines = cache.get(cacheKey);
        if (!medicines) {
            medicines = await Medicine.find({}).sort({ name: 1 });
            cache.set(cacheKey, medicines, 300);
        }

        res.json({ success: true, data: medicines });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Add a new medicine
router.post('/', verifyAdminOrSuperAdmin, resolveTenant, async (req, res) => {
    try {
        const { name, genericName, category, description } = req.body;
        const { Medicine } = getModels(req);

        const existing = await Medicine.findOne({ name });
        if (existing) return res.status(400).json({ success: false, message: 'Medicine already exists' });

        const medicine = new Medicine({ name, genericName, category, description });
        await medicine.save();

        const cache = require('../utils/cache');
        cache.clear();

        res.status(201).json({ success: true, message: 'Medicine added successfully', data: medicine });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update a medicine
router.put('/:id', verifyAdminOrSuperAdmin, resolveTenant, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, genericName, category, description } = req.body;
        const { Medicine } = getModels(req);
        const medicine = await Medicine.findByIdAndUpdate(id, { name, genericName, category, description }, { new: true });

        if (!medicine) return res.status(404).json({ success: false, message: 'Medicine not found' });

        const cache = require('../utils/cache');
        cache.clear();

        res.json({ success: true, message: 'Medicine updated successfully', data: medicine });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Delete a medicine
router.delete('/:id', verifyAdminOrSuperAdmin, resolveTenant, async (req, res) => {
    try {
        const { id } = req.params;
        const { Medicine } = getModels(req);
        const medicine = await Medicine.findByIdAndDelete(id);

        if (!medicine) return res.status(404).json({ success: false, message: 'Medicine not found' });

        const cache = require('../utils/cache');
        cache.clear();

        res.json({ success: true, message: 'Medicine deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
