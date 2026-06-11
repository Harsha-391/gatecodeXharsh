const express = require('express');
const router = express.Router();
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const { verifyToken } = require('../middleware/auth.middleware');
const Role = require('../models/role.model');

const getModels = (req) => {
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return {
            Inventory: m.Inventory,
            User: m.User
        };
    }
    return {
        Inventory: require('../models/inventory.model'),
        User: require('../models/user.model')
    };
};

// GET all inventory
router.get('/inventory', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { Inventory, User } = getModels(req);
        let pharmacyIds = [req.user.id];
        let query = { pharmacyId: req.user.id };

        if (req.user.hospitalId) {
            const pharmacyRoles = await Role.find({ name: { $regex: /pharmac/i } });
            if (pharmacyRoles.length > 0) {
                const pharmacists = await User.find({ hospitalId: req.user.hospitalId, role: { $in: pharmacyRoles.map(r => r._id) } });
                const ids = pharmacists.map(p => p._id);
                if (ids.length > 0) pharmacyIds = ids;
            }
            query = {
                $or: [
                    { pharmacyId: { $in: pharmacyIds } },
                    { hospitalId: req.user.hospitalId }
                ]
            };
        } else {
             query = { pharmacyId: req.user.id };
        }

        const items = await Inventory.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: items });
    } catch (error) {
        console.error("Fetch inventory error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// POST new medicine
router.post('/inventory', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { Inventory } = getModels(req);
        const newItem = new Inventory({
            ...req.body,
            pharmacyId: req.user.id,
            hospitalId: req.user.hospitalId
        });

        await newItem.save();
        res.status(201).json({ success: true, data: newItem });
    } catch (error) {
        console.error("Mongoose Save Error:", error.message);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// UPDATE inventory item
router.put('/inventory/:id', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { Inventory } = getModels(req);
        const updateQuery = { _id: req.params.id };
        if (req.user.hospitalId) {
            updateQuery.hospitalId = req.user.hospitalId;
        } else {
            updateQuery.pharmacyId = req.user.id;
        }

        const item = await Inventory.findOne(updateQuery);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found or unauthorized' });
        }

        // Apply updates
        Object.assign(item, req.body);
        await item.save();

        res.json({ success: true, data: item });
    } catch (error) {
        console.error("Update inventory error:", error);
        res.status(500).json({ success: false, message: 'An error occurred during update' });
    }
});

// DELETE medicine
router.delete('/inventory/:id', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { Inventory } = getModels(req);
        const deleteQuery = { _id: req.params.id };
        if (req.user.hospitalId) {
            deleteQuery.hospitalId = req.user.hospitalId;
        } else {
            deleteQuery.pharmacyId = req.user.id;
        }
        const deletedItem = await Inventory.findOneAndDelete(deleteQuery);

        if (!deletedItem) {
            return res.status(404).json({ success: false, message: "Item not found or unauthorized" });
        }

        res.json({ success: true, message: 'Item deleted successfully' });
    } catch (error) {
        console.error("Delete inventory item error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;