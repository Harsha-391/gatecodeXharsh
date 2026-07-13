const express = require('express');
const router = express.Router();
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const MasterLabTest = require('../models/labTest.model');
const { verifyToken, verifyAdminOrSuperAdmin } = require('../middleware/auth.middleware');

const getModels = (req) => {
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return { LabTest: m.LabTest };
    }
    return { LabTest: MasterLabTest };
};

// 1. GET ALL LAB TESTS (Accessible to any authenticated staff: Admin, Doctor, Lab Tech, etc.)
router.get('/', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { LabTest } = getModels(req);
        const isTenant = !!req.tenantDb;
        
        const roleStr = req.user._roleData?.name?.toLowerCase() || req.user.role?.toString()?.toLowerCase();
        const isAdmin = ['superadmin', 'admin', 'centraladmin', 'hospitaladmin'].includes(roleStr);
        const hospitalId = req.query.hospitalId || (req.user.hospitalId ? req.user.hospitalId.toString() : null);

        // Build query
        let query = {};
        if (!isTenant) {
            // Master DB fallback: always include global tests; also include hospital-specific tests if hospitalId is known
            if (hospitalId) {
                query = { $or: [{ hospitalId: null }, { hospitalId: hospitalId }] };
            } else {
                query = { hospitalId: null };
            }
        }

        // Non-admins only see active tests
        if (!isAdmin) query.isActive = { $ne: false };

        const cache = require('../utils/cache');
        const cacheKey = `labTests_${isTenant}_${hospitalId || 'global'}_${isAdmin}`;
        let labTests = cache.get(cacheKey);
        if (!labTests) {
            labTests = await LabTest.find(query).sort({ name: 1 }).lean();
            cache.set(cacheKey, labTests, 300);
        }

        // Resolve hospital-specific prices
        labTests.forEach(test => {
            if (isTenant) {
                test.effectivePrice = test.price;
            } else {
                if (hospitalId) {
                    const hid = hospitalId.toString();
                    const hospitalPrice = test.hospitalPrices && test.hospitalPrices[hid];
                    test.effectivePrice = hospitalPrice !== undefined ? hospitalPrice : test.price;
                } else {
                    test.effectivePrice = test.price;
                }
            }
        });

        res.json({ success: true, count: labTests.length, data: labTests });
    } catch (error) {
        console.error('Fetch Lab Tests Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 2. CREATE A NEW LAB TEST
router.post('/', verifyAdminOrSuperAdmin, resolveTenant, async (req, res) => {
    try {
        const { LabTest } = getModels(req);
        const isTenant = !!req.tenantDb;
        const { name, code, description, price, category, isActive } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Test name is required' });
        }

        // Hospital admins create hospital-specific tests; central/super admins create global tests
        const isCentral = req.user.role === 'superadmin' || req.user.role === 'centraladmin';
        const hospitalId = isCentral ? null : (req.user.hospitalId || null);

        // Check uniqueness
        const query = isTenant ? { name } : { name, hospitalId };
        const testExists = await LabTest.findOne(query);
        if (testExists) {
            return res.status(400).json({ success: false, message: 'Lab test with this name already exists' });
        }

        const newTest = await LabTest.create({
            name, code, description, price, category, isActive, hospitalId
        });

        const cache = require('../utils/cache');
        cache.clear();

        res.status(201).json({ success: true, message: 'Lab test created', data: newTest });
    } catch (error) {
        console.error('Create Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error creating lab test' });
    }
});

// 3. UPDATE A LAB TEST
router.put('/:id', verifyAdminOrSuperAdmin, resolveTenant, async (req, res) => {
    try {
        const { LabTest } = getModels(req);
        const isTenant = !!req.tenantDb;
        const { name, code, description, price, category, isActive, hospitalPrices } = req.body;

        const test = await LabTest.findById(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        if (!isTenant) {
            // Hospital admin can only edit their own hospital's tests on master DB
            const isCentral = req.user.role === 'superadmin' || req.user.role === 'centraladmin';
            if (!isCentral) {
                const testHid = test.hospitalId ? test.hospitalId.toString() : null;
                const userHid = req.user.hospitalId ? req.user.hospitalId.toString() : null;
                if (testHid !== null && testHid !== userHid) {
                    return res.status(403).json({ success: false, message: 'You can only edit tests created by your hospital' });
                }
            }
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (code !== undefined) updateData.code = code;
        if (description !== undefined) updateData.description = description;
        if (price !== undefined) updateData.price = price;
        if (category !== undefined) updateData.category = category;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (hospitalPrices !== undefined) updateData.hospitalPrices = hospitalPrices;

        const updatedTest = await LabTest.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        const cache = require('../utils/cache');
        cache.clear();

        res.json({ success: true, message: 'Lab test updated', data: updatedTest });
    } catch (error) {
        console.error('Update Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error updating lab test' });
    }
});

// 5. SET HOSPITAL-SPECIFIC PRICE FOR A LAB TEST
router.put('/:id/hospital-price', verifyAdminOrSuperAdmin, resolveTenant, async (req, res) => {
    try {
        const { LabTest } = getModels(req);
        const isTenant = !!req.tenantDb;
        const { hospitalId, price } = req.body;

        const test = await LabTest.findById(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        if (isTenant) {
            // In tenant DB, updating hospital-specific price updates the main price
            test.price = Number(price);
            if (hospitalId) {
                test.hospitalPrices = test.hospitalPrices || new Map();
                test.hospitalPrices.set(hospitalId, Number(price));
            }
        } else {
            if (!hospitalId) return res.status(400).json({ success: false, message: 'hospitalId is required' });
            if (price === null || price === undefined || price === '') {
                // Remove hospital-specific price (fall back to default)
                test.hospitalPrices.delete(hospitalId);
            } else {
                test.hospitalPrices.set(hospitalId, Number(price));
            }
        }
        await test.save();

        const cache = require('../utils/cache');
        cache.clear();

        res.json({ success: true, message: 'Hospital price updated', data: test });
    } catch (error) {
        console.error('Set Hospital Price Error:', error);
        res.status(500).json({ success: false, message: 'Error setting hospital price' });
    }
});

// 4. DELETE A LAB TEST
router.delete('/:id', verifyAdminOrSuperAdmin, resolveTenant, async (req, res) => {
    try {
        const { LabTest } = getModels(req);
        const isTenant = !!req.tenantDb;
        const test = await LabTest.findById(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        if (!isTenant) {
            // Hospital admin can only delete their own hospital's tests on master DB
            const isCentral = req.user.role === 'superadmin' || req.user.role === 'centraladmin';
            if (!isCentral) {
                const testHid = test.hospitalId ? test.hospitalId.toString() : null;
                const userHid = req.user.hospitalId ? req.user.hospitalId.toString() : null;
                if (testHid !== null && testHid !== userHid) {
                    return res.status(403).json({ success: false, message: 'You can only delete tests created by your hospital' });
                }
            }
        }

        await test.deleteOne();
        
        const cache = require('../utils/cache');
        cache.clear();

        res.json({ success: true, message: 'Lab test deleted successfully' });
    } catch (error) {
        console.error('Delete Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error deleting lab test' });
    }
});

module.exports = router;

