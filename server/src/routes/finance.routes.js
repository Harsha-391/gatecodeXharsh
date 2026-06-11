const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const { getTenantConnection } = require('../db/tenantDb');
const { getTenantModels } = require('../db/tenantModels');

// Middleware to check if user has access to finance data
const verifyFinanceAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            const role = typeof req.user.role === 'string' ? req.user.role.toLowerCase() : (req.user._roleData?.name || '').toLowerCase();
            const perms = req.user._roleData?.permissions || [];
            if (['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || perms.includes('finance_view') || perms.includes('*')) {
                return next();
            }
            return res.status(403).json({ success: false, message: 'Finance access required' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

// GET Financial Dashboard Analytics
router.get('/dashboard', verifyFinanceAccess, async (req, res) => {
    try {
        const { startDate, endDate, hospitalId } = req.query;

        // Determine target hospital ID
        let targetHospitalId = hospitalId;
        const role = typeof req.user.role === 'string' ? req.user.role.toLowerCase() : (req.user._roleData?.name || '').toLowerCase();

        // If user is not superadmin/centraladmin, scope strictly to their hospital
        if (role !== 'superadmin' && role !== 'centraladmin') {
            if (req.user.hospitalId) {
                targetHospitalId = req.user.hospitalId.toString();
            } else {
                // If they are not an admin and have NO hospitalId, they should see ZERO data
                return res.json({
                    success: true,
                    data: {
                        totalRevenue: 0, totalProfit: 0,
                        consultations: { count: 0, revenue: 0 },
                        labTests: { count: 0, revenue: 0 },
                        medicines: { count: 0, revenue: 0, cost: 0, profit: 0 }
                    }
                });
            }
        }

        // Connect to tenant DB if targetHospitalId is provided
        let tenantConnection = null;
        if (targetHospitalId) {
            try {
                tenantConnection = await getTenantConnection(String(targetHospitalId));
            } catch (err) {
                console.error('[Finance] Tenant database connection failed:', err.message);
            }
        }

        // Get appropriate models (tenant-bound or master fallback)
        const getModels = (dbConn) => {
            if (dbConn) {
                const m = getTenantModels(dbConn);
                return {
                    Appointment: m.Appointment,
                    LabReport: m.LabReport,
                    PharmacyOrder: m.PharmacyOrder,
                    Inventory: m.Inventory
                };
            }
            return {
                Appointment: require('../models/appointment.model'),
                LabReport: require('../models/labReport.model'),
                PharmacyOrder: require('../models/pharmacyOrder.model'),
                Inventory: require('../models/inventory.model')
            };
        };

        const { Appointment, LabReport, PharmacyOrder, Inventory } = getModels(tenantConnection);

        // Date filters
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        let appointmentDateFilter = {};
        if (startDate || endDate) {
            appointmentDateFilter.appointmentDate = {};
            if (startDate) appointmentDateFilter.appointmentDate.$gte = new Date(startDate);
            if (endDate) appointmentDateFilter.appointmentDate.$lte = new Date(endDate);
        }

        // Filter by hospital ID (if using master database, or as redundancy)
        let hospitalFilter = {};
        if (targetHospitalId) {
            hospitalFilter = { hospitalId: targetHospitalId };
        }

        // 1. Consultations Revenue
        const consultations = await Appointment.find({
            paymentStatus: { $in: ['paid', 'Paid', 'PAID'] },
            ...appointmentDateFilter,
            ...hospitalFilter
        });
        const totalConsultationRevenue = consultations.reduce((acc, curr) => acc + (curr.amount || 0), 0);

        // 2. Lab Tests Revenue
        const labReports = await LabReport.find({
            paymentStatus: { $in: ['PAID', 'paid', 'Paid'] },
            ...dateFilter,
            ...hospitalFilter
        });
        const totalLabRevenue = labReports.reduce((acc, curr) => acc + (curr.amount || 0), 0);

        // 3. Medicines Revenue & Cost
        const pharmacyOrders = await PharmacyOrder.find({
            paymentStatus: { $in: ['Paid', 'paid', 'PAID'] },
            ...dateFilter,
            ...hospitalFilter
        });

        let totalMedicineRevenue = 0;
        let totalMedicineCost = 0;

        for (const order of pharmacyOrders) {
            if (order.totalAmount > 0 || order.totalCost > 0) {
                totalMedicineRevenue += order.totalAmount || 0;
                totalMedicineCost += order.totalCost || 0;
            } else {
                for (const item of order.items) {
                    const invItemQuery = { name: new RegExp('^' + item.medicineName + '$', 'i') };
                    if (targetHospitalId) invItemQuery.hospitalId = targetHospitalId;
                    const invItem = await Inventory.findOne(invItemQuery);
                    if (invItem) {
                        const qty = 1;
                        totalMedicineRevenue += (invItem.sellingPrice || 0) * qty;
                        totalMedicineCost += (invItem.buyingPrice || 0) * qty;
                    }
                }
            }
        }

        const totalMedicineProfit = totalMedicineRevenue - totalMedicineCost;

        // 4. Overall Totals
        const totalRevenue = totalConsultationRevenue + totalLabRevenue + totalMedicineRevenue;
        const totalProfit = totalConsultationRevenue + totalLabRevenue + totalMedicineProfit;

        res.json({
            success: true,
            data: {
                totalRevenue,
                totalProfit,
                consultations: {
                    count: consultations.length,
                    revenue: totalConsultationRevenue
                },
                labTests: {
                    count: labReports.length,
                    revenue: totalLabRevenue
                },
                medicines: {
                    count: pharmacyOrders.length,
                    revenue: totalMedicineRevenue,
                    cost: totalMedicineCost,
                    profit: totalMedicineProfit
                }
            }
        });

    } catch (error) {
        console.error('Finance Analytics Error:', error);
        res.status(500).json({ success: false, message: 'Server Error fetching finance data' });
    }
});

module.exports = router;
