const express = require('express');
const router = express.Router();
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const { verifyToken } = require('../middleware/auth.middleware');
const Role = require('../models/role.model');
const MasterPharmacyPurchaseRequest = require('../models/pharmacyPurchaseRequest.model');
const auditLog = require('../middleware/audit.middleware');

const getModels = (req) => {
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return {
            Inventory: m.Inventory,
            User: m.User,
            Role: m.Role,
            PharmacyPurchaseRequest: m.PharmacyPurchaseRequest
        };
    }
    return {
        Inventory: require('../models/inventory.model'),
        User: require('../models/user.model'),
        Role: require('../models/role.model'),
        PharmacyPurchaseRequest: MasterPharmacyPurchaseRequest
    };
};

// GET all inventory
router.get('/inventory', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { Inventory, User, Role } = getModels(req);
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

// GET all purchase requests
router.get('/purchase-requests', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { PharmacyPurchaseRequest } = getModels(req);
        const requests = await PharmacyPurchaseRequest.find({ hospitalId: req.user.hospitalId }).sort({ createdAt: -1 });
        res.json({ success: true, data: requests });
    } catch (error) {
        console.error("Fetch purchase requests error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// POST new medicine
router.post('/inventory', verifyToken, resolveTenant, auditLog('STOCK_LEVEL_CHANGED', (req, body) => ({
    model: 'Inventory',
    id: body.data?._id,
    label: `Stock Added: ${body.data?.name} (Qty: ${body.data?.quantity})`
}), { dataCategory: 'Administrative', severity: 'info' }), async (req, res) => {
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
router.put('/inventory/:id', verifyToken, resolveTenant, auditLog('STOCK_LEVEL_CHANGED', (req, body) => ({
    model: 'Inventory',
    id: req.params.id,
    label: `Stock Updated: ${body.data?.name} (Qty: ${body.data?.quantity})`,
    before: req.oldInventoryItem || null,
    after: body.data || null
}), { dataCategory: 'Administrative', severity: 'warning' }), async (req, res, next) => {
    try {
        const { Inventory } = getModels(req);
        const item = await Inventory.findById(req.params.id).lean();
        if (item) req.oldInventoryItem = item;
    } catch (_) {}
    next();
}, async (req, res) => {
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
router.delete('/inventory/:id', verifyToken, resolveTenant, auditLog('STOCK_LEVEL_CHANGED', (req) => ({
    model: 'Inventory',
    id: req.params.id,
    label: `Stock Deleted: ${req.oldInventoryItem?.name || ''}`
}), { dataCategory: 'Administrative', severity: 'critical' }), async (req, res, next) => {
    try {
        const { Inventory } = getModels(req);
        const item = await Inventory.findById(req.params.id).lean();
        if (item) req.oldInventoryItem = item;
    } catch (_) {}
    next();
}, async (req, res) => {
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

// POST raise purchase request
router.post('/purchase-request', verifyToken, resolveTenant, auditLog('STOCK_LEVEL_CHANGED', (req, body) => ({
    model: 'PharmacyPurchaseRequest',
    id: body.data?._id,
    label: `Purchase Requested: ${body.data?.item} (Qty: ${body.data?.qty})`
}), { dataCategory: 'Administrative', severity: 'info' }), async (req, res) => {
    try {
        const { PharmacyPurchaseRequest } = getModels(req);
        const { item, qty } = req.body;
        
        if (!item || !qty) {
            return res.status(400).json({ success: false, message: 'Item name and quantity are required' });
        }

        const newRequest = new PharmacyPurchaseRequest({
            hospitalId: req.user.hospitalId,
            item,
            qty: Number(qty),
            status: 'Approval Pending',
            requestedBy: 'Lead Pharmacist'
        });

        await newRequest.save();
        res.status(201).json({ success: true, data: newRequest });
    } catch (error) {
        console.error("Create purchase request error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;