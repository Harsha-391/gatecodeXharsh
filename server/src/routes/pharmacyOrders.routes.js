// server/src/routes/pharmacyOrders.routes.js
const express = require('express');
const router = express.Router();
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const { verifyToken } = require('../middleware/auth.middleware');
const Doctor = require('../models/doctor.model');

const getModels = (req) => {
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return {
            PharmacyOrder: m.PharmacyOrder,
            Inventory: m.Inventory,
            User: m.User
        };
    }
    return {
        PharmacyOrder: require('../models/pharmacyOrder.model'),
        Inventory: require('../models/inventory.model'),
        User: require('../models/user.model')
    };
};

const populateInventoryPrices = async (orders, req) => {
    try {
        const { Inventory } = getModels(req);
        const targetHospitalId = req.user.hospitalId;
        let allInventory = [];
        if (targetHospitalId) {
            allInventory = await Inventory.find({ hospitalId: targetHospitalId }).lean();
        }
        if (!allInventory || allInventory.length === 0) {
            allInventory = await Inventory.find().lean();
        }

        const getPillsPerDay = (frequency) => {
            if (!frequency) return 1;
            const freqStr = frequency.trim().toLowerCase();
            if (/^\d(-\d)+$/.test(freqStr)) {
                const parts = freqStr.split('-').map(Number);
                const sum = parts.reduce((a, b) => a + b, 0);
                if (sum > 0) return sum;
            }
            if (freqStr.includes('once') || freqStr.includes('daily') || freqStr.includes('od') || freqStr.includes('1 time')) return 1;
            if (freqStr.includes('twice') || freqStr.includes('bd') || freqStr.includes('bid') || freqStr.includes('2 times')) return 2;
            if (freqStr.includes('thrice') || freqStr.includes('tds') || freqStr.includes('tid') || freqStr.includes('3 times')) return 3;
            if (freqStr.includes('qd') || freqStr.includes('qds') || freqStr.includes('4 times')) return 4;
            return 1;
        };

        const getDurationDays = (duration) => {
            if (!duration) return 1;
            const durStr = duration.trim().toLowerCase();
            const num = parseInt(durStr.match(/\d+/)?.[0] || '1', 10);
            if (durStr.includes('week')) return num * 7;
            if (durStr.includes('month')) return num * 30;
            if (durStr.includes('day')) return num;
            return num;
        };

        for (let order of orders) {
            let orderTotal = 0;
            let modified = false;

            for (let item of order.items) {
                // Parse or assign quantity if missing/0
                if (!item.quantity || item.quantity === 0) {
                    item.quantity = getPillsPerDay(item.frequency) * getDurationDays(item.duration);
                    modified = true;
                }

                // If unitPrice is 0 or undefined, look up in inventory
                if (!item.unitPrice || item.unitPrice === 0) {
                    const pNameLower = item.medicineName.trim().toLowerCase();
                    let invItem = allInventory.find(inv => inv.name.trim().toLowerCase() === pNameLower);
                    if (!invItem) {
                        invItem = allInventory.find(inv => {
                            const itemLower = inv.name.trim().toLowerCase();
                            return itemLower.includes(pNameLower) || pNameLower.includes(itemLower);
                        });
                    }

                    if (invItem) {
                        item.unitPrice = invItem.sellingPrice || 0;
                        item.inventoryId = invItem._id;
                        modified = true;
                    } else if (item.price && item.price > 0) {
                        // Fallback: price divided by quantity
                        item.unitPrice = Math.round(item.price / (item.quantity || 1));
                        modified = true;
                    }
                }

                // Ensure totalPrice and price are aligned
                if (!item.totalPrice || item.totalPrice === 0) {
                    item.totalPrice = item.unitPrice * (item.quantity || 1);
                    item.price = item.totalPrice;
                    modified = true;
                }

                orderTotal += item.totalPrice || item.price || 0;
            }

            if (order.totalAmount === 0 && orderTotal > 0) {
                order.totalAmount = orderTotal;
                modified = true;
            }

            if (modified) {
                try {
                    order.markModified('items');
                    await order.save();
                } catch (saveErr) {
                    console.error("[PharmacyOrder Auto-Save Error]", saveErr.message);
                }
            }
        }
    } catch (err) {
        console.error("[PharmacyOrder populateInventoryPrices Error]", err.message);
    }
};

// GET all orders for the pharmacy dashboard (Admin/Pharmacy role)
router.get('/', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { PharmacyOrder, User } = getModels(req);
        let query = {};
        // HARD ISOLATION: Use hospitalId directly on the order document
        if (req.user.hospitalId) {
            query.hospitalId = req.user.hospitalId;
        }

        const orders = await PharmacyOrder.find(query)
            .populate('userId', 'name phone email')
            .populate({ path: 'doctorId', model: User, select: 'name' })
            .sort({ createdAt: -1 });
        
        await populateInventoryPrices(orders, req);
        
        res.json({ success: true, orders });
    } catch (error) {
        console.error("Fetch orders error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// GET orders for the currently logged-in patient (User role)
router.get('/my-orders', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { PharmacyOrder, User } = getModels(req);
        const orders = await PharmacyOrder.find({ userId: req.user.userId })
            .populate({ path: 'doctorId', model: User, select: 'name' })
            .sort({ createdAt: -1 });
        
        await populateInventoryPrices(orders, req);
        
        res.json({ success: true, orders });
    } catch (error) {
        console.error("Fetch patient orders error:", error);
        res.status(500).json({ success: false, message: 'Error fetching your orders' });
    }
});

const processOrderItemsPricing = async (order, purchasedIndices, itemQuantities, req, Inventory, deductStock) => {
    const purchasedSet = new Set(
        purchasedIndices && Array.isArray(purchasedIndices)
            ? purchasedIndices
            : order.items.map((_, i) => i) // default: all
    );

    let totalAmount = 0;
    for (let idx = 0; idx < order.items.length; idx++) {
        const item = order.items[idx];
        const wasPurchased = purchasedSet.has(idx);
        item.purchased = wasPurchased;

        if (itemQuantities && itemQuantities[idx] !== undefined) {
            item.quantity = Number(itemQuantities[idx]);
        }

        if (wasPurchased) {
            let rawName = item.medicineName.trim();
            let actualName = rawName.includes(' - ')
                ? rawName.substring(0, rawName.lastIndexOf(' - ')).trim()
                : rawName;
            actualName = actualName.toLowerCase().trim();

            const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const invQuery = { name: { $regex: new RegExp(`^${escapedName}$`, 'i') } };
            if (req.user.hospitalId) invQuery.hospitalId = req.user.hospitalId;
            let invItem = await Inventory.findOne(invQuery);

            if (!invItem && req.user.hospitalId) {
                invItem = await Inventory.findOne({ name: { $regex: new RegExp(`^${escapedName}$`, 'i') } });
            }

            if (!invItem) {
                const fallbackQuery = { name: { $regex: escapedName, $options: 'i' } };
                if (req.user.hospitalId) fallbackQuery.hospitalId = req.user.hospitalId;
                invItem = await Inventory.findOne(fallbackQuery);
            }

            if (!invItem) {
                invItem = await Inventory.findOne({ name: { $regex: escapedName, $options: 'i' } });
            }

            if (invItem) {
                item.unitPrice = invItem.sellingPrice || 0;
                const qty = item.quantity || 1;
                const computedTotalPrice = item.unitPrice * qty;
                item.totalPrice = computedTotalPrice;
                item.price = computedTotalPrice;
                totalAmount += computedTotalPrice;

                if (deductStock) {
                    const qtyToDeduct = item.quantity || 1;
                    invItem.stock = Math.max(0, invItem.stock - qtyToDeduct);
                    await invItem.save();
                }
            } else {
                if (item.unitPrice) {
                    item.totalPrice = item.unitPrice * (item.quantity || 1);
                    item.price = item.totalPrice;
                }
                totalAmount += item.totalPrice || item.price || 0;
            }
        }
    }
    
    order.markModified('items');
    order.totalAmount = totalAmount;
    return totalAmount;
};

// Complete order and payment
router.patch('/:id/complete', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { PharmacyOrder, Inventory } = getModels(req);
        const { purchasedIndices, itemQuantities } = req.body;
        // HARD ISOLATION: Only allow completing orders from your hospital
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;
        const order = await PharmacyOrder.findOne(findQuery);
        if (!order) return res.status(404).json({ success: false, message: "Order not found or unauthorized" });

        const totalAmount = await processOrderItemsPricing(order, purchasedIndices, itemQuantities, req, Inventory, true);

        // Only mark Paid if at least one item was dispensed; otherwise keep Pending
        order.paymentStatus = totalAmount > 0 ? 'Paid' : 'Pending';
        order.orderStatus = 'Completed';
        await order.save();

        const io = req.app.get('io');
        const Notification = require('../models/notification.model');

        const notificationItem = new Notification({
            senderId: req.user.id,
            recipientRole: 'doctor', // Or specific user Id: order.doctorId
            recipientId: order.doctorId,
            message: 'Prescription dispensed to patient.',
            referenceType: 'PharmacyOrder',
            referenceId: order._id,
            patientId: order.patientId.toString()
        });
        await notificationItem.save();

        if (io) {
            io.to(order.doctorId.toString()).emit('new_notification', notificationItem);
        }

        res.json({ success: true, message: 'Order completed successfully', order });
    } catch (error) {
        console.error("Complete order error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Cancel order
router.patch('/:id/cancel', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { PharmacyOrder } = getModels(req);
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;
        const order = await PharmacyOrder.findOne(findQuery);
        if (!order) return res.status(404).json({ success: false, message: "Order not found or unauthorized" });

        order.orderStatus = 'Cancelled';
        order.status = 'cancelled';
        if (order.paymentStatus === 'Paid') order.paymentStatus = 'Refunded';
        await order.save();

        res.json({ success: true, message: 'Order cancelled successfully', order });
    } catch (error) {
        console.error("Cancel order error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Mark order as paid (without completing/dispensing)
router.patch('/:id/mark-paid', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { PharmacyOrder, Inventory } = getModels(req);
        const { purchasedIndices, itemQuantities } = req.body;
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;
        const order = await PharmacyOrder.findOne(findQuery);
        if (!order) return res.status(404).json({ success: false, message: "Order not found or unauthorized" });

        await processOrderItemsPricing(order, purchasedIndices, itemQuantities, req, Inventory, false);

        order.paymentStatus = 'Paid';
        await order.save();

        res.json({ success: true, message: 'Payment marked as paid', order });
    } catch (error) {
        console.error("Mark paid error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;