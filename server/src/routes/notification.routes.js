const express = require('express');
const router = express.Router();
const Notification = require('../models/notification.model');
const { verifyToken } = require('../middleware/auth.middleware');

// GET all notifications for a user/role
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const role = typeof req.user.role === 'string'
            ? req.user.role.toLowerCase()
            : req.user._roleData?.name?.toLowerCase();

        let roles = [role];
        if (role === 'lab technician' || role === 'lab') {
            roles = ['lab', 'lab technician'];
        } else if (role === 'pharmacist' || role === 'pharmacy') {
            roles = ['pharmacy', 'pharmacist'];
        } else if (role === 'receptionist' || role === 'reception') {
            roles = ['reception', 'receptionist'];
        }

        // Find notifications where user is explicitly recipient, OR their role is recipient
        const query = {
            $or: [
                { recipientId: userId },
                { recipientRole: { $in: roles } }
            ]
        };
        if (req.user.hospitalId) {
            query.hospitalId = req.user.hospitalId;
        }

        const notifications = await Notification.find(query)
            .populate('senderId', 'name')
            .sort({ createdAt: -1 })
            .limit(50); // Limit to recent

        res.json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Marking single notification as read
router.patch('/:id/read', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const notification = await Notification.findByIdAndUpdate(
            id,
            { status: 'Read' },
            { new: true }
        );
        res.json({ success: true, data: notification });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Mark all as read
router.patch('/read-all', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const role = typeof req.user.role === 'string'
            ? req.user.role.toLowerCase()
            : req.user._roleData?.name?.toLowerCase();

        let roles = [role];
        if (role === 'lab technician' || role === 'lab') {
            roles = ['lab', 'lab technician'];
        } else if (role === 'pharmacist' || role === 'pharmacy') {
            roles = ['pharmacy', 'pharmacist'];
        } else if (role === 'receptionist' || role === 'reception') {
            roles = ['reception', 'receptionist'];
        }

        const query = {
            $or: [
                { recipientId: userId },
                { recipientRole: { $in: roles } }
            ],
            status: 'Unread'
        };
        if (req.user.hospitalId) {
            query.hospitalId = req.user.hospitalId;
        }

        await Notification.updateMany(query, { status: 'Read' });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
