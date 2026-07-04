const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');

// Middleware to check if user has access to finance data
const verifyFinanceAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const role = typeof req.user.role === 'string' ? req.user.role.toLowerCase() : (req.user._roleData?.name || '').toLowerCase();
            const perms = req.user._roleData?.permissions || [];
            
            const isReceptionRoute = req.path.startsWith('/reception-collections');
            const isReceptionTxsRoute = req.path === '/reception-collections/transactions';
            
            let hasAccess = false;
            
            if (isReceptionRoute) {
                if (isReceptionTxsRoute) {
                    // Everyone involved in billing/front-desk/reception can view transaction logs
                    hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin', 'admin', 'billing', 'cashier', 'receptionist', 'reception'].includes(role) || perms.includes('finance_reception_collections');
                } else {
                    // Summary and reconciliation access (receptionists excluded)
                    hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin', 'admin', 'billing', 'cashier'].includes(role) || perms.includes('finance_reception_collections');
                }
            } else {
                // General finance endpoints
                hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || 
                            perms.includes('finance_view') || 
                            perms.includes('*');
            }
            
            if (hasAccess) {
                await resolveTenant(req, res, next);
            } else {
                return res.status(403).json({ success: false, message: 'Finance access required' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

const getModels = (tenantDb) => {
    if (tenantDb) {
        return {
            ...getTenantModels(tenantDb),
            User: require('../models/user.model')
        };
    }
    return {
        Doctor: require('../models/doctor.model'),
        Appointment: require('../models/appointment.model'),
        LabReport: require('../models/labReport.model'),
        PharmacyOrder: require('../models/pharmacyOrder.model'),
        Inventory: require('../models/inventory.model'),
        Invoice: require('../models/invoice.model'),
        Expense: require('../models/expense.model'),
        ExpenseCategory: require('../models/expenseCategory.model'),
        Refund: require('../models/refund.model'),
        InsuranceClaim: require('../models/insuranceClaim.model'),
        Reconciliation: require('../models/reconciliation.model'),
        BillingActivityLog: require('../models/billingActivityLog.model'),
        Admission: require('../models/admission.model'),
        User: require('../models/user.model'),
        DeletedRecord: require('../models/deletedRecord.model'),
        UserActivityLog: require('../models/userActivityLog.model'),
        PayrollRecord: require('../models/payrollRecord.model'),
        DoctorPayout: require('../models/doctorPayout.model'),
        CollectionTransaction: require('../models/collectionTransaction.model')
    };
};

// ─────────────────────────────────────────────────────────
// 1. GET Dashboard Stats (Original fallback kept intact)
// ─────────────────────────────────────────────────────────
router.get('/dashboard', verifyFinanceAccess, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const hospitalId = req.user.hospitalId;

        const { Appointment, LabReport, PharmacyOrder, Inventory } = getModels(req.tenantDb);

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

        let hospitalFilter = hospitalId ? { hospitalId } : {};

        // Consultations Revenue
        const consultations = await Appointment.find({
            paymentStatus: { $in: ['paid', 'Paid', 'PAID'] },
            ...appointmentDateFilter,
            ...hospitalFilter
        });
        const totalConsultationRevenue = consultations.reduce((acc, curr) => acc + (curr.amount || 0), 0);

        // Lab Tests Revenue
        const labReports = await LabReport.find({
            paymentStatus: { $in: ['PAID', 'paid', 'Paid'] },
            ...dateFilter,
            ...hospitalFilter
        });
        const totalLabRevenue = labReports.reduce((acc, curr) => acc + (curr.amount || 0), 0);

        // Pharmacy Revenue & Cost
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
                    if (hospitalId) invItemQuery.hospitalId = hospitalId;
                    const invItem = await Inventory.findOne(invItemQuery);
                    if (invItem) {
                        totalMedicineRevenue += (invItem.sellingPrice || 0);
                        totalMedicineCost += (invItem.buyingPrice || 0);
                    }
                }
            }
        }

        const totalMedicineProfit = totalMedicineRevenue - totalMedicineCost;
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

// ─────────────────────────────────────────────────────────
// 2. GET /api/finance/kpis
// ─────────────────────────────────────────────────────────
router.get('/kpis', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { Invoice, Expense, Refund, InsuranceClaim, Reconciliation, CollectionTransaction } = getModels(req.tenantDb);

        const today = new Date();
        const startOfToday = new Date(today.setHours(0, 0, 0, 0));
        const endOfToday = new Date(today.setHours(23, 59, 59, 999));

        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

        // Fetch all invoices to compute outstanding metrics
        const invoices = await Invoice.find({ ...hFilter, paymentStatus: { $ne: 'Cancelled' } }).lean();
        const transactions = await CollectionTransaction.find(hFilter).lean();

        let todayRevenue = 0;
        let monthlyRevenue = 0;
        let outstandingPayments = 0;
        let todayCollection = 0;
        let totalCollection = 0;

        invoices.forEach(inv => {
            outstandingPayments += (inv.outstandingAmount || 0);
        });

        transactions.forEach(t => {
            const payDate = new Date(t.collectionTimestamp || t.createdAt);
            if (payDate >= startOfToday && payDate <= endOfToday) {
                todayRevenue += t.amount || 0;
                todayCollection += t.amount || 0;
            }
            if (payDate >= startOfMonth && payDate <= endOfMonth) {
                monthlyRevenue += t.amount || 0;
            }
            totalCollection += t.amount || 0;
        });

        // Pending Insurance Claims
        const pendingClaims = await InsuranceClaim.find({
            ...hFilter,
            status: { $in: ['Submitted', 'Pending'] }
        }).lean();
        const pendingInsuranceAmt = pendingClaims.reduce((s, c) => s + (c.claimAmount || 0), 0);

        // Expenses this month
        const expenses = await Expense.find({
            ...hFilter,
            date: { $gte: startOfMonth, $lte: endOfMonth }
        }).lean();
        const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

        // Net Profit = Monthly Revenue - Monthly Expenses
        const netProfit = monthlyRevenue - totalExpenses;

        // Pending Refunds
        const pendingRefundsCount = await Refund.countDocuments({
            ...hFilter,
            status: 'Refund Pending'
        });

        // Reconciliation status for today
        const reconToday = await Reconciliation.findOne({
            ...hFilter,
            date: { $gte: startOfToday, $lte: endOfToday }
        }).lean();
        const reconciliationStatus = reconToday ? (reconToday.status || 'Balanced') : 'Pending';

        res.json({
            success: true,
            kpis: {
                todayRevenue,
                monthlyRevenue,
                outstandingPayments,
                pendingInsuranceClaims: pendingInsuranceAmt,
                totalExpenses,
                netProfit,
                pendingRefundApprovals: pendingRefundsCount,
                reconciliationStatus,
                todayCollection,
                totalCollection
            }
        });
    } catch (err) {
        console.error('KPIs fetch error:', err);
        res.status(500).json({ success: false, message: 'Server error loading finance KPIs' });
    }
});

// ─────────────────────────────────────────────────────────
// 3. GET /api/finance/revenue-analytics
// ─────────────────────────────────────────────────────────
router.get('/revenue-analytics', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { Invoice, CollectionTransaction, Appointment } = getModels(req.tenantDb);

        const transactions = await CollectionTransaction.find(hFilter).lean();
        const appointments = await Appointment.find({ paymentStatus: { $in: ['paid', 'Paid', 'PAID'] }, ...hFilter }).lean();

        // 1. Monthly trend (last 6 calendar months)
        const monthlyTrend = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyTrend[key] = { label: d.toLocaleString('default', { month: 'short' }), amount: 0 };
        }

        // 2. Daily trend (last 30 days)
        const dailyTrend = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            dailyTrend[key] = { label: d.getDate() + ' ' + d.toLocaleString('default', { month: 'short' }), amount: 0 };
        }

        // 3. Segmentations
        const departmentRevenue = { Consultation: 0, Laboratory: 0, Pharmacy: 0, Admission: 0, Insurance: 0, Service: 0, Other: 0 };
        const doctorRevenue = {};

        // Aggregate department revenue & timelines from CollectionTransaction
        transactions.forEach(t => {
            let dept = 'Other';
            if (t.collectionType === 'Insurance Settle' || t.paymentMethod === 'Insurance') {
                dept = 'Insurance';
            } else if (t.collectionType === 'OPD Registration' || t.collectionType === 'Follow-up Consultation') {
                dept = 'Consultation';
            } else if (t.collectionType === 'Lab Payment') {
                dept = 'Laboratory';
            } else if (t.collectionType === 'Pharmacy Payment') {
                dept = 'Pharmacy';
            } else if (t.collectionType === 'IPD Admission Advance') {
                dept = 'Admission';
            }

            const amt = t.amount || 0;
            if (departmentRevenue[dept] !== undefined) {
                departmentRevenue[dept] += amt;
            } else {
                departmentRevenue.Other += amt;
            }

            // Timelines
            const pDate = new Date(t.collectionTimestamp || t.createdAt);
            const mKey = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
            const dKey = pDate.toISOString().split('T')[0];

            if (monthlyTrend[mKey]) monthlyTrend[mKey].amount += amt;
            if (dailyTrend[dKey]) dailyTrend[dKey].amount += amt;
        });

        // Doctor Revenue from paid appointments
        appointments.forEach(appt => {
            const docName = appt.doctorName || 'General OPD';
            doctorRevenue[docName] = (doctorRevenue[docName] || 0) + (appt.amount || 0);
        });

        res.json({
            success: true,
            monthlyTrend: Object.values(monthlyTrend),
            dailyTrend: Object.values(dailyTrend),
            departmentRevenue,
            doctorRevenue: Object.entries(doctorRevenue).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error loading analytics' });
    }
});

// ─────────────────────────────────────────────────────────
// 4. GET /api/finance/outstanding-payments
// ─────────────────────────────────────────────────────────
router.get('/outstanding-payments', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { Invoice } = getModels(req.tenantDb);

        const invoices = await Invoice.find({
            ...hFilter,
            outstandingAmount: { $gt: 0 },
            paymentStatus: { $in: ['Pending', 'Partially Paid'] }
        }).sort({ createdAt: -1 }).lean();

        const pendingOPD = [];
        const pendingIPD = [];
        const overdueAccounts = [];
        const creditPatientsMap = {};

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        invoices.forEach(inv => {
            const hasOPD = (inv.items || []).some(i => ['Consultation', 'Laboratory', 'Pharmacy'].includes(i.itemType));
            const hasIPD = (inv.items || []).some(i => ['Admission', 'Facility'].includes(i.itemType));

            if (hasOPD) pendingOPD.push(inv);
            if (hasIPD) pendingIPD.push(inv);

            if (new Date(inv.createdAt) < thirtyDaysAgo) {
                overdueAccounts.push(inv);
            }

            // Aggregate credit patient lists
            const pid = String(inv.patientId);
            if (!creditPatientsMap[pid]) {
                creditPatientsMap[pid] = {
                    patientName: inv.patientName,
                    outstandingAmount: 0,
                    invoicesCount: 0
                };
            }
            creditPatientsMap[pid].outstandingAmount += inv.outstandingAmount;
            creditPatientsMap[pid].invoicesCount += 1;
        });

        res.json({
            success: true,
            pendingOPD: pendingOPD.slice(0, 50),
            pendingIPD: pendingIPD.slice(0, 50),
            overdueAccounts: overdueAccounts.slice(0, 50),
            creditPatients: Object.values(creditPatientsMap).sort((a, b) => b.outstandingAmount - a.outstandingAmount).slice(0, 30)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error fetching outstanding payments' });
    }
});

// ─────────────────────────────────────────────────────────
// 5. Insurance Claims Endpoints
// ─────────────────────────────────────────────────────────
router.get('/insurance-claims', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { InsuranceClaim } = getModels(req.tenantDb);

        const claims = await InsuranceClaim.find(hFilter).sort({ createdAt: -1 }).lean();

        // Calculate claims stats
        let claimsSubmitted = 0;
        let claimsPending = 0;
        let claimsApproved = 0;
        let claimsRejected = 0;
        let totalClaimAmountPending = 0;

        claims.forEach(c => {
            if (c.status === 'Submitted') claimsSubmitted++;
            else if (c.status === 'Pending') claimsPending++;
            else if (c.status === 'Approved') claimsApproved++;
            else if (c.status === 'Rejected') claimsRejected++;

            if (c.status === 'Submitted' || c.status === 'Pending') {
                totalClaimAmountPending += c.claimAmount;
            }
        });

        res.json({
            success: true,
            stats: { claimsSubmitted, claimsPending, claimsApproved, claimsRejected, totalClaimAmountPending },
            claims
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/insurance-claims', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { patientId, patientName, policyNumber, insuranceProvider, claimNumber, invoiceNumber, claimAmount, treatmentDescription } = req.body;

        if (!patientId || !patientName || !policyNumber || !insuranceProvider || !claimNumber || !invoiceNumber || !claimAmount) {
            return res.status(400).json({ success: false, message: 'Missing required insurance details' });
        }

        const { InsuranceClaim } = getModels(req.tenantDb);

        const claim = new InsuranceClaim({
            hospitalId,
            patientId,
            patientName,
            policyNumber,
            insuranceProvider,
            claimNumber,
            invoiceNumber,
            claimAmount: Number(claimAmount),
            treatmentDescription,
            status: 'Submitted'
        });

        await claim.save();
        res.status(201).json({ success: true, claim });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/insurance-claims/:id', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { status, approvedAmount, rejectionReason } = req.body;
        const { InsuranceClaim } = getModels(req.tenantDb);

        const claim = await InsuranceClaim.findOne({ _id: req.params.id, hospitalId });
        if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });

        if (status) claim.status = status;
        if (approvedAmount !== undefined) claim.approvedAmount = Number(approvedAmount);
        if (rejectionReason !== undefined) claim.rejectionReason = rejectionReason;
        claim.actionDate = new Date();

        await claim.save();
        res.json({ success: true, claim });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────
// 6. Expenses Endpoints (Redirect to Accountant Controller)
// ─────────────────────────────────────────────────────────
router.get('/expenses', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { datePreset, customStartDate, customEndDate } = req.query;
        const { Expense } = getModels(req.tenantDb);

        let dateFilter = {};
        if (datePreset && datePreset !== 'all') {
            const now = new Date();
            const startD = new Date(now);
            const endD = new Date(now);

            if (datePreset === 'today') {
                startD.setHours(0, 0, 0, 0);
                endD.setHours(23, 59, 59, 999);
            } else if (datePreset === 'week') {
                startD.setDate(startD.getDate() - 7);
            } else if (datePreset === 'month') {
                startD.setDate(1);
                startD.setHours(0,0,0,0);
            } else if (datePreset === 'custom') {
                if (customStartDate) startD.setTime(new Date(customStartDate).getTime());
                if (customEndDate) endD.setTime(new Date(customEndDate).getTime());
            }

            dateFilter.date = { $gte: startD, $lte: endD };
        }

        const expenses = await Expense.find({ ...hFilter, ...dateFilter }).sort({ date: -1 }).lean();
        res.json({ success: true, expenses });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/expenses', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { category, amount, date, description, paymentMethod, paymentStatus, recipientName } = req.body;

        if (!category || !amount) {
            return res.status(400).json({ success: false, message: 'Category and amount are required' });
        }

        const { Expense } = getModels(req.tenantDb);

        const expense = new Expense({
            hospitalId,
            category,
            amount: Number(amount),
            date: date ? new Date(date) : new Date(),
            description,
            paymentMethod: paymentMethod || 'Cash',
            paymentStatus: paymentStatus || 'Paid',
            addedBy: req.user._id,
            addedByName: req.user.name || 'Accountant',
            recipientName: recipientName || ''
        });

        await expense.save();
        res.status(201).json({ success: true, expense });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/expenses/:id', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { Expense, DeletedRecord } = getModels(req.tenantDb);

        const exp = await Expense.findOne({ _id: req.params.id, hospitalId });
        if (!exp) return res.status(404).json({ success: false, message: 'Expense not found' });

        // Archive to DeletedRecord
        const archived = new DeletedRecord({
            hospitalId,
            originalId: exp._id.toString(),
            recordType: 'Expense',
            deletedBy: req.user._id,
            deletedByName: req.user.name || 'Accountant',
            reason: req.query.reason || 'User requested deletion',
            originalData: exp.toObject ? exp.toObject() : exp
        });
        await archived.save();

        await Expense.deleteOne({ _id: exp._id });

        res.json({ success: true, message: 'Expense deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────
// 7. GET /api/finance/profit-loss
// ─────────────────────────────────────────────────────────
router.get('/profit-loss', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { timeframe } = req.query; // 'weekly', 'monthly', 'half-year', 'yearly'
        const activeTimeframe = timeframe || 'half-year';

        const { CollectionTransaction, Expense } = getModels(req.tenantDb);

        // Calculate startDate based on timeframe
        const now = new Date();
        let startD = new Date(now);
        if (activeTimeframe === 'weekly') {
            startD.setDate(startD.getDate() - 7);
        } else if (activeTimeframe === 'monthly') {
            startD.setDate(startD.getDate() - 30);
        } else if (activeTimeframe === 'half-year') {
            startD.setDate(startD.getDate() - 180);
        } else if (activeTimeframe === 'yearly') {
            startD.setDate(startD.getDate() - 365);
        }
        startD.setHours(0, 0, 0, 0);

        // Fetch all collection transactions and expenses scoped to this hospital
        const transactions = await CollectionTransaction.find(hFilter).lean();
        const expenses = await Expense.find(hFilter).lean();

        // Calculate Totals within the range
        let totalRevenue = 0;
        transactions.forEach(t => {
            const pDate = new Date(t.collectionTimestamp || t.createdAt);
            if (pDate >= startD && pDate <= now) {
                totalRevenue += (t.amount || 0);
            }
        });

        let totalExpenses = 0;
        expenses.forEach(exp => {
            const eDate = new Date(exp.date);
            if (eDate >= startD && eDate <= now) {
                totalExpenses += (exp.amount || 0);
            }
        });

        const netProfit = totalRevenue - totalExpenses;

        // Group departmental profitability within the range
        const departmentProfitability = {
            Consultation: { revenue: 0, expenses: 0, profit: 0 },
            Laboratory: { revenue: 0, expenses: 0, profit: 0 },
            Pharmacy: { revenue: 0, expenses: 0, profit: 0 },
            Admission: { revenue: 0, expenses: 0, profit: 0 }
        };

        transactions.forEach(t => {
            const pDate = new Date(t.collectionTimestamp || t.createdAt);
            if (pDate >= startD && pDate <= now) {
                let type = null;
                if (t.collectionType === 'OPD Registration' || t.collectionType === 'Follow-up Consultation') {
                    type = 'Consultation';
                } else if (t.collectionType === 'Lab Payment') {
                    type = 'Laboratory';
                } else if (t.collectionType === 'Pharmacy Payment') {
                    type = 'Pharmacy';
                } else if (t.collectionType === 'IPD Admission Advance' || t.collectionType === 'Insurance Co-Pay') {
                    type = 'Admission';
                }

                if (type && departmentProfitability[type]) {
                    departmentProfitability[type].revenue += (t.amount || 0);
                }
            }
        });

        expenses.forEach(exp => {
            const eDate = new Date(exp.date);
            if (eDate >= startD && eDate <= now) {
                const cat = exp.category.toLowerCase();
                if (cat.includes('medicine') || cat.includes('pharmacy')) {
                    departmentProfitability.Pharmacy.expenses += exp.amount;
                } else if (cat.includes('lab') || cat.includes('reagent')) {
                    departmentProfitability.Laboratory.expenses += exp.amount;
                } else if (cat.includes('doctor') || cat.includes('consult')) {
                    departmentProfitability.Consultation.expenses += exp.amount;
                } else if (cat.includes('ward') || cat.includes('rent') || cat.includes('bed')) {
                    departmentProfitability.Admission.expenses += exp.amount;
                }
            }
        });

        Object.keys(departmentProfitability).forEach(k => {
            departmentProfitability[k].profit = departmentProfitability[k].revenue - departmentProfitability[k].expenses;
        });

        // Construct dynamic trends based on timeframe selection
        let monthlyTrend = [];
        if (activeTimeframe === 'weekly') {
            // Last 7 days daily trend
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = d.toISOString().split('T')[0];
                const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                monthlyTrend.push({ key, label, revenue: 0, expenses: 0, profit: 0 });
            }

            transactions.forEach(t => {
                const pDate = new Date(t.collectionTimestamp || t.createdAt);
                const k = pDate.toISOString().split('T')[0];
                const match = monthlyTrend.find(x => x.key === k);
                if (match) match.revenue += (t.amount || 0);
            });

            expenses.forEach(exp => {
                const eDate = new Date(exp.date);
                const k = eDate.toISOString().split('T')[0];
                const match = monthlyTrend.find(x => x.key === k);
                if (match) match.expenses += exp.amount;
            });
        } else if (activeTimeframe === 'monthly') {
            // Last 4 weeks weekly trend
            for (let i = 3; i >= 0; i--) {
                const startW = new Date();
                startW.setDate(startW.getDate() - (i * 7) - 6);
                startW.setHours(0, 0, 0, 0);
                const endW = new Date();
                endW.setDate(endW.getDate() - (i * 7));
                endW.setHours(23, 59, 59, 999);
                const label = `${startW.getDate()} ${startW.toLocaleString('default', { month: 'short' })} - ${endW.getDate()} ${endW.toLocaleString('default', { month: 'short' })}`;
                monthlyTrend.push({ start: startW, end: endW, label, revenue: 0, expenses: 0, profit: 0 });
            }

            transactions.forEach(t => {
                const pDate = new Date(t.collectionTimestamp || t.createdAt);
                const match = monthlyTrend.find(x => pDate >= x.start && pDate <= x.end);
                if (match) match.revenue += (t.amount || 0);
            });

            expenses.forEach(exp => {
                const eDate = new Date(exp.date);
                const match = monthlyTrend.find(x => eDate >= x.start && eDate <= x.end);
                if (match) match.expenses += exp.amount;
            });
        } else if (activeTimeframe === 'half-year') {
            // Last 6 months monthly trend
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = d.toLocaleString('default', { month: 'short' });
                monthlyTrend.push({ key, label, revenue: 0, expenses: 0, profit: 0 });
            }

            transactions.forEach(t => {
                const pDate = new Date(t.collectionTimestamp || t.createdAt);
                const k = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
                const match = monthlyTrend.find(x => x.key === k);
                if (match) match.revenue += (t.amount || 0);
            });

            expenses.forEach(exp => {
                const eDate = new Date(exp.date);
                const k = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}`;
                const match = monthlyTrend.find(x => x.key === k);
                if (match) match.expenses += exp.amount;
            });
        } else if (activeTimeframe === 'yearly') {
            // Last 12 months monthly trend
            for (let i = 11; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = d.toLocaleString('default', { month: 'short' });
                monthlyTrend.push({ key, label, revenue: 0, expenses: 0, profit: 0 });
            }

            transactions.forEach(t => {
                const pDate = new Date(t.collectionTimestamp || t.createdAt);
                const k = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
                const match = monthlyTrend.find(x => x.key === k);
                if (match) match.revenue += (t.amount || 0);
            });

            expenses.forEach(exp => {
                const eDate = new Date(exp.date);
                const k = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}`;
                const match = monthlyTrend.find(x => x.key === k);
                if (match) match.expenses += exp.amount;
            });
        }

        monthlyTrend.forEach(t => {
            t.profit = t.revenue - t.expenses;
        });

        res.json({
            success: true,
            totalRevenue,
            totalExpenses,
            netProfit,
            monthlyTrend,
            departmentProfitability
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error loading Profit & Loss details' });
    }
});

// ─────────────────────────────────────────────────────────
// 8. Reconciliation Endpoints
// ─────────────────────────────────────────────────────────
router.get('/reconciliation', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { targetDate } = req.query;
        const target = targetDate ? new Date(targetDate) : new Date();

        const startOfTarget = new Date(target.setHours(0, 0, 0, 0));
        const endOfTarget = new Date(target.setHours(23, 59, 59, 999));

        const hFilter = hospitalId ? { hospitalId } : {};
        const { Invoice, Reconciliation } = getModels(req.tenantDb);

        // Fetch reconciliation log if any
        const record = await Reconciliation.findOne({
            ...hFilter,
            date: { $gte: startOfTarget, $lte: endOfTarget }
        }).lean();

        // Calculate expected from Invoices
        const invoices = await Invoice.find({
            ...hFilter,
            paymentStatus: { $ne: 'Cancelled' }
        }).lean();

        let cashExpected = 0;
        let upiExpected = 0;
        let cardExpected = 0;
        let bankExpected = 0;

        invoices.forEach(inv => {
            (inv.payments || []).forEach(p => {
                const pDate = new Date(p.date);
                if (pDate >= startOfTarget && pDate <= endOfTarget) {
                    if (p.method === 'Cash') cashExpected += p.amount;
                    else if (p.method === 'UPI') upiExpected += p.amount;
                    else if (p.method === 'Card') cardExpected += p.amount;
                    else if (p.method === 'Bank Transfer') bankExpected += p.amount;
                }
            });
        });

        res.json({
            success: true,
            date: startOfTarget,
            expected: {
                cash: cashExpected,
                upi: upiExpected,
                card: cardExpected,
                bank: bankExpected,
                total: cashExpected + upiExpected + cardExpected + bankExpected
            },
            record
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/reconciliation', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { date, cashActual, upiActual, cardActual, bankActual, notes } = req.body;

        if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

        const target = new Date(date);
        const startOfTarget = new Date(target.setHours(0, 0, 0, 0));
        const endOfTarget = new Date(target.setHours(23, 59, 59, 999));

        const hFilter = hospitalId ? { hospitalId } : {};
        const { Invoice, Reconciliation } = getModels(req.tenantDb);

        // Calculate expected
        const invoices = await Invoice.find({ ...hFilter, paymentStatus: { $ne: 'Cancelled' } }).lean();
        let cashExpected = 0;
        let upiExpected = 0;
        let cardExpected = 0;
        let bankExpected = 0;

        invoices.forEach(inv => {
            (inv.payments || []).forEach(p => {
                const pDate = new Date(p.date);
                if (pDate >= startOfTarget && pDate <= endOfTarget) {
                    if (p.method === 'Cash') cashExpected += p.amount;
                    else if (p.method === 'UPI') upiExpected += p.amount;
                    else if (p.method === 'Card') cardExpected += p.amount;
                    else if (p.method === 'Bank Transfer') bankExpected += p.amount;
                }
            });
        });

        const cA = Number(cashActual || 0);
        const uA = Number(upiActual || 0);
        const cD = Number(cardActual || 0);
        const bA = Number(bankActual || 0);

        const status = (cashExpected === cA && upiExpected === uA && cardExpected === cD && bankExpected === bA)
            ? 'Balanced' : 'Discrepancy';

        const record = await Reconciliation.findOneAndUpdate(
            { hospitalId, date: startOfTarget },
            {
                $set: {
                    cashExpected, cashActual: cA,
                    upiExpected, upiActual: uA,
                    cardExpected, cardActual: cD,
                    bankExpected, bankActual: bA,
                    status,
                    notes,
                    reconciledBy: req.user._id,
                    reconciledByName: req.user.name || 'Accountant'
                }
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, record });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────
// 9. GET /api/finance/audit-summary
// ─────────────────────────────────────────────────────────
router.get('/audit-summary', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { Invoice, Refund, BillingActivityLog } = getModels(req.tenantDb);

        // Fetch invoices with high outstanding / large payments
        const largeTransactions = [];
        const invoices = await Invoice.find(hFilter).lean();

        invoices.forEach(inv => {
            (inv.payments || []).forEach(p => {
                if (p.amount >= 10000) {
                    largeTransactions.push({
                        invoiceNumber: inv.invoiceNumber,
                        patientName: inv.patientName,
                        amount: p.amount,
                        date: p.date,
                        method: p.method,
                        receiptNumber: p.receiptNumber,
                        collectedByName: p.collectedByName
                    });
                }
            });
        });

        // Deleted / Cancelled invoices tracking
        const deletedInvoices = await Invoice.find({ ...hFilter, paymentStatus: 'Cancelled' }).sort({ updatedAt: -1 }).limit(30).lean();

        // Refund Audit Logs
        const refundLogs = await Refund.find(hFilter).sort({ updatedAt: -1 }).limit(30).lean();

        // Adjustment History
        const adjustments = await BillingActivityLog.find({
            ...hFilter,
            action: { $in: ['Invoice Generated', 'Payment Collected', 'Refund Issued', 'Invoice Cancelled'] }
        }).sort({ createdAt: -1 }).limit(50).lean();

        res.json({
            success: true,
            largeTransactions: largeTransactions.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30),
            deletedInvoices,
            refundLogs,
            adjustments
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error loading audit summaries' });
    }
});

// ─────────────────────────────────────────────────────────
// Expense Categories Endpoints
// ─────────────────────────────────────────────────────────
router.get('/expense-categories', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { ExpenseCategory } = getModels(req.tenantDb);

        const categories = await ExpenseCategory.find(hFilter).sort({ name: 1 }).lean();
        
        // If there are no custom categories, seed some defaults so the dropdown is not empty initially
        if (categories.length === 0) {
            const defaults = [
                { name: 'Operational Expenses', description: 'Day-to-day operations' },
                { name: 'Vendor Payments', description: 'Payments to suppliers/vendors' },
                { name: 'Utility Expenses', description: 'Power, water, internet utilities' },
                { name: 'Equipment Purchases', description: 'Medical and office equipment' },
                { name: 'Pharmacy Procurement Expenses', description: 'Procuring medicines/pharmaceuticals' }
            ];
            
            const seeded = [];
            for (const d of defaults) {
                const cat = new ExpenseCategory({
                    hospitalId,
                    name: d.name,
                    description: d.description
                });
                await cat.save();
                seeded.push(cat);
            }
            return res.json({ success: true, categories: seeded });
        }

        res.json({ success: true, categories });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/expense-categories', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        const { ExpenseCategory } = getModels(req.tenantDb);

        // Check if duplicate
        const existing = await ExpenseCategory.findOne({ hospitalId, name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Expense category already exists' });
        }

        const category = new ExpenseCategory({
            hospitalId,
            name: name.trim(),
            description: description || ''
        });

        await category.save();
        res.status(201).json({ success: true, category });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────
// Financial Audit & Compliance Center Endpoints
// ─────────────────────────────────────────────────────────
router.get('/audit-logs', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const {
            section,
            startDate,
            endDate,
            userId,
            amountMin,
            amountMax,
            search,
            status,
            invoiceNumber,
            patientName
        } = req.query;

        const {
            Invoice,
            Expense,
            Refund,
            InsuranceClaim,
            Reconciliation,
            BillingActivityLog,
            DeletedRecord,
            UserActivityLog
        } = getModels(req.tenantDb);

        // Build base date filter helper
        const buildDateFilter = (field = 'createdAt') => {
            const filter = {};
            if (startDate) filter[field] = { ...filter[field], $gte: new Date(startDate) };
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter[field] = { ...filter[field], $lte: end };
            }
            return Object.keys(filter).length > 0 ? filter : {};
        };

        // Build amount filter helper
        const buildAmountFilter = (field = 'amount') => {
            const filter = {};
            if (amountMin) filter[field] = { ...filter[field], $gte: Number(amountMin) };
            if (amountMax) filter[field] = { ...filter[field], $lte: Number(amountMax) };
            return Object.keys(filter).length > 0 ? filter : {};
        };

        // Date boundaries today for KPIs
        const today = new Date();
        const startOfToday = new Date(today.setHours(0, 0, 0, 0));
        const endOfToday = new Date(today.setHours(23, 59, 59, 999));

        if (!section || section === 'overview') {
            const totalActivityLogs = await BillingActivityLog.countDocuments(hFilter);
            const totalUserActivities = await UserActivityLog.countDocuments(hFilter);
            const totalDeletedRecords = await DeletedRecord.countDocuments(hFilter);
            const totalClaims = await InsuranceClaim.countDocuments(hFilter);
            const totalReconciliation = await Reconciliation.countDocuments(hFilter);
            const totalExpenses = await Expense.countDocuments(hFilter);

            const totalAuditEvents = totalActivityLogs + totalUserActivities + totalDeletedRecords + totalClaims + totalReconciliation + totalExpenses;

            const refundAuditsToday = await Refund.countDocuments({
                ...hFilter,
                createdAt: { $gte: startOfToday, $lte: endOfToday }
            });

            const failedReconciliations = await Reconciliation.countDocuments({
                ...hFilter,
                status: 'Discrepancy'
            });

            const deletedRecordsCount = totalDeletedRecords;

            const insuranceClaimChanges = await InsuranceClaim.countDocuments({
                ...hFilter,
                updatedAt: { $gte: startOfToday, $lte: endOfToday }
            });

            // High Risk Transactions count
            const highRiskRefunds = await Refund.countDocuments({
                ...hFilter,
                amount: { $gt: 10000 }
            });
            const highRiskInvoices = await Invoice.countDocuments({
                ...hFilter,
                totalAmount: { $gt: 50000 },
                paymentStatus: { $ne: 'Cancelled' }
            });
            const highRiskExpenses = await Expense.countDocuments({
                ...hFilter,
                amount: { $gt: 25000 }
            });
            const highRiskInvoicesDiscount = await Invoice.countDocuments({
                ...hFilter,
                discountAmount: { $gt: 5000 },
                paymentStatus: { $ne: 'Cancelled' }
            });

            const highRiskCount = highRiskRefunds + highRiskInvoices + highRiskExpenses + highRiskInvoicesDiscount;

            const recentLogs = await BillingActivityLog.find(hFilter).sort({ createdAt: -1 }).limit(10).lean();

            return res.json({
                success: true,
                kpis: {
                    totalAuditEvents,
                    refundAuditsToday,
                    highRiskTransactions: highRiskCount,
                    deletedRecords: deletedRecordsCount,
                    failedReconciliations,
                    insuranceClaimChanges
                },
                recentLogs
            });
        }

        // Section: Invoices
        if (section === 'invoices') {
            const dateFilter = buildDateFilter('createdAt');
            const amtFilter = buildAmountFilter('totalAmount');
            const query = { ...hFilter, ...dateFilter, ...amtFilter };

            if (status) query.paymentStatus = status;
            if (invoiceNumber) query.invoiceNumber = { $regex: invoiceNumber, $options: 'i' };
            if (patientName) query.patientName = { $regex: patientName, $options: 'i' };
            if (userId) query.addedBy = userId;

            if (search) {
                query.$or = [
                    { invoiceNumber: { $regex: search, $options: 'i' } },
                    { patientName: { $regex: search, $options: 'i' } }
                ];
            }

            const items = await Invoice.find(query).sort({ createdAt: -1 }).lean();
            const logs = items.map(inv => ({
                invoiceNumber: inv.invoiceNumber,
                patientName: inv.patientName,
                amount: inv.totalAmount,
                user: inv.addedByName || 'System',
                timestamp: inv.createdAt,
                action: inv.paymentStatus === 'Cancelled' ? 'Invoice Cancelled' : (inv.createdAt.getTime() === inv.updatedAt.getTime() ? 'Invoice Created' : 'Invoice Updated')
            }));

            return res.json({ success: true, logs });
        }

        // Section: Payments
        if (section === 'payments') {
            const dateFilter = buildDateFilter('createdAt');
            const query = { ...hFilter, ...dateFilter };

            if (invoiceNumber) query.invoiceNumber = { $regex: invoiceNumber, $options: 'i' };
            if (patientName) query.patientName = { $regex: patientName, $options: 'i' };
            if (search) {
                query.$or = [
                    { invoiceNumber: { $regex: search, $options: 'i' } },
                    { patientName: { $regex: search, $options: 'i' } }
                ];
            }

            const invoicesWithPayments = await Invoice.find(query).sort({ updatedAt: -1 }).lean();
            const logs = [];

            invoicesWithPayments.forEach(inv => {
                (inv.payments || []).forEach(p => {
                    const pDate = new Date(p.date);
                    let dateOk = true;
                    if (startDate && pDate < new Date(startDate)) dateOk = false;
                    if (endDate) {
                        const end = new Date(endDate);
                        end.setHours(23, 59, 59, 999);
                        if (pDate > end) dateOk = false;
                    }
                    let amtOk = true;
                    if (amountMin && p.amount < Number(amountMin)) amtOk = false;
                    if (amountMax && p.amount > Number(amountMax)) amtOk = false;

                    if (dateOk && amtOk) {
                        logs.push({
                            patientName: inv.patientName,
                            invoiceNumber: inv.invoiceNumber,
                            amount: p.amount,
                            paymentMethod: p.method,
                            user: p.collectedByName || 'Receptionist',
                            timestamp: p.date
                        });
                    }
                });
            });

            return res.json({ success: true, logs: logs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)) });
        }

        // Section: Refunds
        if (section === 'refunds') {
            const dateFilter = buildDateFilter('createdAt');
            const amtFilter = buildAmountFilter('amount');
            const query = { ...hFilter, ...dateFilter, ...amtFilter };

            if (status) query.status = status;
            if (invoiceNumber) query.invoiceNumber = { $regex: invoiceNumber, $options: 'i' };
            if (patientName) query.patientName = { $regex: patientName, $options: 'i' };
            if (search) {
                query.$or = [
                    { invoiceNumber: { $regex: search, $options: 'i' } },
                    { patientName: { $regex: search, $options: 'i' } }
                ];
            }

            const items = await Refund.find(query).sort({ createdAt: -1 }).lean();
            const logs = items.map(ref => ({
                refundId: ref._id,
                invoiceNumber: ref.invoiceNumber,
                patientName: ref.patientName,
                amount: ref.amount,
                reason: ref.reason,
                requestedBy: ref.requestedByName || 'Staff',
                approvedBy: ref.approvedByName || 'N/A',
                status: ref.status,
                timestamp: ref.createdAt
            }));

            return res.json({ success: true, logs });
        }

        // Section: Expenses
        if (section === 'expenses') {
            const dateFilter = buildDateFilter('date');
            const amtFilter = buildAmountFilter('amount');
            const query = { ...hFilter, ...dateFilter, ...amtFilter };

            if (search) {
                query.$or = [
                    { category: { $regex: search, $options: 'i' } },
                    { recipientName: { $regex: search, $options: 'i' } }
                ];
            }

            const items = await Expense.find(query).sort({ date: -1 }).lean();
            const logs = items.map(exp => ({
                category: exp.category,
                amount: exp.amount,
                user: exp.addedByName || 'Accountant',
                notes: exp.description || '',
                timestamp: exp.date
            }));

            return res.json({ success: true, logs });
        }

        // Section: Insurance
        if (section === 'insurance') {
            const dateFilter = buildDateFilter('createdAt');
            const amtFilter = buildAmountFilter('claimAmount');
            const query = { ...hFilter, ...dateFilter, ...amtFilter };

            if (status) query.status = status;
            if (search) {
                query.$or = [
                    { claimNumber: { $regex: search, $options: 'i' } },
                    { patientName: { $regex: search, $options: 'i' } }
                ];
            }

            const items = await InsuranceClaim.find(query).sort({ createdAt: -1 }).lean();
            const logs = items.map(claim => ({
                claimNumber: claim.claimNumber,
                amount: claim.claimAmount,
                status: claim.status,
                user: claim.patientName || 'N/A',
                timestamp: claim.createdAt
            }));

            return res.json({ success: true, logs });
        }

        // Section: Reconciliation
        if (section === 'reconciliation') {
            const dateFilter = buildDateFilter('date');
            const query = { ...hFilter, ...dateFilter };

            if (status) query.status = status;

            const items = await Reconciliation.find(query).sort({ date: -1 }).lean();
            const logs = items.map(rec => {
                const expected = (rec.cashExpected || 0) + (rec.upiExpected || 0) + (rec.cardExpected || 0) + (rec.bankExpected || 0);
                const actual = (rec.cashActual || 0) + (rec.upiActual || 0) + (rec.cardActual || 0) + (rec.bankActual || 0);
                return {
                    date: rec.date,
                    expectedAmount: expected,
                    actualAmount: actual,
                    difference: expected - actual,
                    status: rec.status,
                    verifiedBy: rec.reconciledByName || 'Accountant'
                };
            });

            return res.json({ success: true, logs });
        }

        // Section: Deleted Records
        if (section === 'deleted') {
            const dateFilter = buildDateFilter('deletedAt');
            const query = { ...hFilter, ...dateFilter };

            if (search) {
                query.$or = [
                    { recordType: { $regex: search, $options: 'i' } },
                    { deletedByName: { $regex: search, $options: 'i' } }
                ];
            }

            const items = await DeletedRecord.find(query).sort({ deletedAt: -1 }).lean();
            const logs = items.map(del => ({
                originalId: del.originalId,
                recordType: del.recordType,
                deletedBy: del.deletedByName,
                deletedAt: del.deletedAt,
                reason: del.reason,
                amount: del.originalData?.amount || del.originalData?.totalAmount || del.originalData?.amount || 0
            }));

            return res.json({ success: true, logs });
        }

        // Section: High Risk Transactions
        if (section === 'high-risk') {
            const logs = [];

            const refunds = await Refund.find({ ...hFilter, amount: { $gt: 10000 } }).lean();
            refunds.forEach(ref => {
                logs.push({
                    alertType: 'Refund > ₹10,000',
                    amount: ref.amount,
                    user: ref.approvedByName || ref.requestedByName || 'Staff',
                    date: ref.createdAt
                });
            });

            const invoices = await Invoice.find({ ...hFilter, totalAmount: { $gt: 50000 }, paymentStatus: { $ne: 'Cancelled' } }).lean();
            invoices.forEach(inv => {
                logs.push({
                    alertType: 'Invoice > ₹50,000',
                    amount: inv.totalAmount,
                    user: inv.addedByName || 'System',
                    date: inv.createdAt
                });
            });

            const expenses = await Expense.find({ ...hFilter, amount: { $gt: 25000 } }).lean();
            expenses.forEach(exp => {
                logs.push({
                    alertType: 'Expense > ₹25,000',
                    amount: exp.amount,
                    user: exp.addedByName || 'Accountant',
                    date: exp.date
                });
            });

            const discountedInvoices = await Invoice.find({ ...hFilter, discountAmount: { $gt: 5000 }, paymentStatus: { $ne: 'Cancelled' } }).lean();
            discountedInvoices.forEach(inv => {
                logs.push({
                    alertType: 'Discount > ₹5,000',
                    amount: inv.discountAmount,
                    user: inv.addedByName || 'System',
                    date: inv.createdAt
                });
            });

            let filteredLogs = logs;
            if (startDate) {
                filteredLogs = filteredLogs.filter(l => new Date(l.date) >= new Date(startDate));
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filteredLogs = filteredLogs.filter(l => new Date(l.date) <= end);
            }
            if (amountMin) {
                filteredLogs = filteredLogs.filter(l => l.amount >= Number(amountMin));
            }
            if (amountMax) {
                filteredLogs = filteredLogs.filter(l => l.amount <= Number(amountMax));
            }

            return res.json({ success: true, logs: filteredLogs.sort((a,b) => new Date(b.date) - new Date(a.date)) });
        }

        // Section: User Activity
        if (section === 'user-activity') {
            const dateFilter = buildDateFilter('createdAt');
            const query = { ...hFilter, ...dateFilter };

            if (search) {
                query.$or = [
                    { userName: { $regex: search, $options: 'i' } },
                    { activity: { $regex: search, $options: 'i' } }
                ];
            }

            const items = await UserActivityLog.find(query).sort({ createdAt: -1 }).lean();
            const logs = items.map(act => ({
                user: act.userName,
                activity: act.activity,
                timestamp: act.createdAt,
                ipAddress: act.ipAddress || '127.0.0.1'
            }));

            return res.json({ success: true, logs });
        }

        res.status(400).json({ success: false, message: 'Invalid audit logs section' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Helper to log finance activity
const logFinanceActivity = async (req, action, amount, details) => {
    try {
        const { UserActivityLog } = getModels(req.tenantDb);
        const log = new UserActivityLog({
            hospitalId: req.user.hospitalId,
            userId: req.user._id,
            userName: req.user.name || 'Accountant',
            userEmail: req.user.email,
            activity: action,
            details: `Amount: ₹${amount || 0}. Details: ${details || ''}`,
            ipAddress: req.ip || req.headers['x-forwarded-for'] || ''
        });
        await log.save();
    } catch (err) {
        console.error('Failed to log finance activity:', err);
    }
};

// ─────────────────────────────────────────────────────────
// Payroll & Doctor Payouts Management API endpoints
// ─────────────────────────────────────────────────────────

// GET list of employees and compensation configs
// Helper: resolve role names to their ObjectIds in the Role collection
// Role field in User is Mixed — can be a plain string ('centraladmin', 'hospitaladmin', 'superadmin')
// OR an ObjectId reference to the Role collection for all other roles (doctor, nurse, patient, etc.)
async function getExcludedRoleIds(roleNamesToExclude) {
    const Role = require('../models/role.model');
    // Always exclude plain-string roles
    const stringExclusions = ['centraladmin', 'superadmin', 'hospitaladmin'];
    // Look up ObjectId-based roles (patient, doctor, etc.)
    const objectIdRoles = await Role.find({
        name: { $in: roleNamesToExclude.map(n => new RegExp(`^${n}$`, 'i')) }
    }).select('_id').lean();
    return {
        stringExclusions,
        objectIdExclusions: objectIdRoles.map(r => r._id)
    };
}

router.get('/payroll/staff', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { User } = getModels(req.tenantDb);
        const Role = require('../models/role.model');

        // Resolve ObjectIds for roles that must be excluded from payroll
        const { stringExclusions, objectIdExclusions } = await getExcludedRoleIds(['patient', 'doctor']);
        const allExclusions = [...stringExclusions, ...objectIdExclusions];

        const staff = await User.find({
            hospitalId,
            role: { $nin: allExclusions }
        }).sort({ name: 1 }).lean();

        // Resolve remaining ObjectId roles to their human-readable name
        const roleIds = staff
            .map(s => s.role)
            .filter(r => r && /^[a-f\d]{24}$/i.test(r.toString()));

        let roleMap = {};
        if (roleIds.length > 0) {
            const roles = await Role.find({ _id: { $in: roleIds } }).select('_id name').lean();
            roles.forEach(r => { roleMap[r._id.toString()] = r.name; });
        }

        const resolved = staff.map(s => ({
            ...s,
            roleName: roleMap[s.role?.toString()]
                || (typeof s.role === 'string' && !/^[a-f\d]{24}$/i.test(s.role) ? s.role : null)
                || s.designation
                || 'Staff'
        }));

        res.json({ success: true, staff: resolved });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// PUT update employee compensation settings
router.put('/payroll/staff/:id', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { User } = getModels(req.tenantDb);
        const { basicSalary, allowances, deductions, designation } = req.body;
        
        const employee = await User.findOneAndUpdate(
            { _id: req.params.id, hospitalId },
            { 
                basicSalary: Number(basicSalary || 0), 
                allowances: Number(allowances || 0), 
                deductions: Number(deductions || 0), 
                designation: designation || '' 
            },
            { new: true }
        );
        
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }
        
        await logFinanceActivity(
            req, 
            'Salary Modified', 
            basicSalary, 
            `Updated salary template for employee ${employee.name} (Designation: ${employee.designation || employee.role}, Basic: ₹${basicSalary}, Allowances: ₹${allowances}, Deductions: ₹${deductions})`
        );

        res.json({ success: true, employee });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET staff payroll records
router.get('/payroll/records', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { month, status } = req.query;
        const { PayrollRecord } = getModels(req.tenantDb);
        const Role = require('../models/role.model');

        const query = { hospitalId };
        if (month) query.month = month;
        if (status) query.status = status;

        const records = await PayrollRecord.find(query)
            .populate({ path: 'employeeId', model: require('../models/user.model'), select: 'name email role phone basicSalary allowances deductions designation' })
            .sort({ createdAt: -1 })
            .lean();

        // Resolve ObjectId roles in each populated employeeId to their name string
        const roleIds = records
            .map(r => r.employeeId?.role)
            .filter(r => r && /^[a-f\d]{24}$/i.test(r.toString()));

        let roleMap = {};
        if (roleIds.length > 0) {
            const roles = await Role.find({ _id: { $in: roleIds } }).select('_id name').lean();
            roles.forEach(r => { roleMap[r._id.toString()] = r.name; });
        }

        const resolved = records.map(rec => {
            if (!rec.employeeId) return rec;
            const rawRole = rec.employeeId.role;
            const roleStr = rawRole?.toString() || '';
            const roleName = roleMap[roleStr]
                || (typeof rawRole === 'string' && !/^[a-f\d]{24}$/i.test(rawRole) ? rawRole : null)
                || rec.employeeId.designation
                || 'Staff';
            return {
                ...rec,
                employeeId: { ...rec.employeeId, roleName }
            };
        });

        res.json({ success: true, records: resolved });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// POST generate draft payroll records for a month
router.post('/payroll/records/generate', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { month } = req.body; // format 'YYYY-MM'
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ success: false, message: 'Invalid month. Format must be YYYY-MM' });
        }
        
        const { User, PayrollRecord } = getModels(req.tenantDb);
        
        // Fetch eligible staff
        // IMPORTANT: role is Mixed (ObjectId ref OR plain string). Must exclude by both forms.
        const { stringExclusions, objectIdExclusions } = await getExcludedRoleIds(['patient', 'doctor']);
        const allExclusions = [...stringExclusions, ...objectIdExclusions];

        const staff = await User.find({
            hospitalId,
            role: { $nin: allExclusions }
        }).lean();
        
        // Fetch existing records for this month to prevent overwriting
        const existingRecords = await PayrollRecord.find({ hospitalId, month }).lean();
        const existingEmployeeIds = new Set(existingRecords.map(r => r.employeeId.toString()));
        
        const toGenerate = staff.filter(s => !existingEmployeeIds.has(s._id.toString()));
        if (toGenerate.length === 0) {
            return res.json({ success: true, message: 'Payroll already generated for all staff for this month', count: 0 });
        }
        
        const records = toGenerate.map(s => ({
            hospitalId,
            employeeId: s._id,
            month,
            basicSalary: s.basicSalary || 0,
            allowances: s.allowances || 0,
            deductions: s.deductions || 0,
            netSalary: (s.basicSalary || 0) + (s.allowances || 0) - (s.deductions || 0),
            status: 'Draft'
        }));
        
        const created = await PayrollRecord.insertMany(records);
        
        const totalGeneratedAmount = created.reduce((sum, r) => sum + r.netSalary, 0);
        await logFinanceActivity(
            req, 
            'Salary Generated', 
            totalGeneratedAmount, 
            `Generated draft payroll for month ${month} for ${created.length} employees`
        );
        
        res.json({ success: true, message: `Successfully generated payroll draft for ${created.length} employees`, count: created.length });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST process salary payment
router.post('/payroll/records/pay/:id', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { paymentMethod, transactionReference, notes } = req.body;
        const { PayrollRecord, Expense } = getModels(req.tenantDb);
        
        const record = await PayrollRecord.findOne({ _id: req.params.id, hospitalId }).populate({ path: 'employeeId', model: require('../models/user.model') });
        if (!record) {
            return res.status(404).json({ success: false, message: 'Payroll record not found' });
        }
        
        if (record.status === 'Paid') {
            return res.status(400).json({ success: false, message: 'Payroll record is already paid' });
        }
        
        record.status = 'Paid';
        record.paymentDate = new Date();
        record.paymentMethod = paymentMethod || 'Bank Transfer';
        record.transactionReference = transactionReference || '';
        record.paidBy = req.user._id;
        record.notes = notes || '';
        await record.save();
        
        // Post Expense
        const expense = new Expense({
            hospitalId,
            category: 'Staff Salary',
            amount: record.netSalary,
            date: new Date(),
            description: `Salary for month ${record.month} paid to employee ${record.employeeId?.name || 'Staff'}`,
            paymentMethod: paymentMethod || 'Bank Transfer',
            paymentStatus: 'Paid',
            addedBy: req.user._id,
            addedByName: req.user.name || 'Accountant',
            recipientId: record.employeeId?._id || null,
            recipientName: record.employeeId?.name || 'Staff'
        });
        await expense.save();
        
        await logFinanceActivity(
            req, 
            'Salary Paid', 
            record.netSalary, 
            `Processed salary payment for employee ${record.employeeId?.name} for month ${record.month} (Method: ${paymentMethod})`
        );
        
        res.json({ success: true, record });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST reverse salary payment back to draft
router.post('/payroll/records/reverse/:id', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { PayrollRecord, Expense } = getModels(req.tenantDb);
        
        const record = await PayrollRecord.findOne({ _id: req.params.id, hospitalId }).populate({ path: 'employeeId', model: require('../models/user.model') });
        if (!record) {
            return res.status(404).json({ success: false, message: 'Payroll record not found' });
        }
        
        if (record.status !== 'Paid') {
            return res.status(400).json({ success: false, message: 'Payroll record is not paid yet' });
        }
        
        const originalNetSalary = record.netSalary;
        
        record.status = 'Draft';
        record.paymentDate = null;
        record.paymentMethod = '';
        record.transactionReference = '';
        record.paidBy = null;
        record.notes = 'Reversed back to draft';
        await record.save();
        
        // Remove the posted Expense to prevent double charging
        await Expense.deleteOne({
            hospitalId,
            category: 'Staff Salary',
            recipientId: record.employeeId?._id,
            amount: originalNetSalary
        });
        
        await logFinanceActivity(
            req, 
            'Salary Reversed', 
            originalNetSalary, 
            `Reversed salary payment back to draft for employee ${record.employeeId?.name} for month ${record.month}`
        );
        
        res.json({ success: true, record });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET doctors list for configuration
router.get('/doctor-payouts/doctors', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { Doctor } = getModels(req.tenantDb);
        
        const doctors = await Doctor.find({ hospitalId }).sort({ name: 1 }).lean();
        res.json({ success: true, doctors });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT update doctor payout configuration
router.put('/doctor-payouts/doctors/:id', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { Doctor } = getModels(req.tenantDb);
        const { payoutModel, commissionPercent, fixedSalary } = req.body;
        
        const doctor = await Doctor.findOneAndUpdate(
            { _id: req.params.id, hospitalId },
            { 
                payoutModel: payoutModel || 'Fixed', 
                commissionPercent: Number(commissionPercent || 0), 
                fixedSalary: Number(fixedSalary || 0) 
            },
            { new: true }
        );
        
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }
        
        res.json({ success: true, doctor });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET doctor payout records
router.get('/doctor-payouts/records', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { month } = req.query;
        const { Doctor, DoctorPayout } = getModels(req.tenantDb);
        
        const query = { hospitalId };
        if (month) query.month = month;
        
        const records = await DoctorPayout.find(query)
            .populate({ path: 'doctorId', model: Doctor, select: 'name email specialty phone payoutModel commissionPercent fixedSalary' })
            .sort({ createdAt: -1 })
            .lean();
            
        res.json({ success: true, records });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST calculate doctor payouts for a month
router.post('/doctor-payouts/records/calculate', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { month } = req.body; // format 'YYYY-MM'
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ success: false, message: 'Invalid month. Format must be YYYY-MM' });
        }
        
        const { Doctor, Appointment, DoctorPayout } = getModels(req.tenantDb);
        
        // Define month date boundaries
        const [year, m] = month.split('-').map(Number);
        const startDate = new Date(year, m - 1, 1, 0, 0, 0, 0);
        const endDate = new Date(year, m, 0, 23, 59, 59, 999);
        
        // Fetch all doctors
        const doctors = await Doctor.find({ hospitalId }).lean();
        
        let calculatedCount = 0;
        let totalCalculatedAmount = 0;
        
        for (const doc of doctors) {
            // Check if record exists for this month and is already Paid
            const existingPayout = await DoctorPayout.findOne({ hospitalId, doctorId: doc._id, month });
            if (existingPayout && existingPayout.status === 'Paid') {
                continue; // Skip paid records to protect transaction history
            }
            
            // Query completed appointments with status 'completed' and paid consultation fees
            const appointments = await Appointment.find({
                hospitalId,
                doctorId: doc._id,
                paymentStatus: { $in: ['paid', 'Paid', 'PAID'] },
                appointmentDate: { $gte: startDate, $lte: endDate }
            }).lean();
            
            const uniquePatients = new Set();
            appointments.forEach(appt => {
                let idStr = '';
                if (appt.userId) {
                    idStr = String(appt.userId);
                } else if (appt.clinicPatientId) {
                    idStr = String(appt.clinicPatientId);
                } else if (appt.patientId && appt.patientId.trim()) {
                    idStr = appt.patientId.trim();
                } else if (appt.patientPhone && appt.patientPhone.trim()) {
                    idStr = appt.patientPhone.trim();
                } else {
                    idStr = (appt.patientName || '').trim();
                }
                if (idStr) {
                    uniquePatients.add(idStr);
                }
            });
            const patientsSeen = uniquePatients.size;
            const revenueGenerated = appointments.reduce((sum, appt) => sum + (appt.amount || 0), 0);
            
            const model = doc.payoutModel || 'Fixed';
            const commPercent = doc.commissionPercent || 0;
            const fixed = doc.fixedSalary || 0;
            
            let commissionAmount = 0;
            let fixedSalary = 0;
            let totalPayable = 0;
            
            if (model === 'Fixed') {
                fixedSalary = fixed;
                totalPayable = fixed;
            } else if (model === 'Commission') {
                commissionAmount = Math.round(revenueGenerated * (commPercent / 100));
                totalPayable = commissionAmount;
            } else if (model === 'Hybrid') {
                fixedSalary = fixed;
                commissionAmount = Math.round(revenueGenerated * (commPercent / 100));
                totalPayable = fixed + commissionAmount;
            }
            
            totalCalculatedAmount += totalPayable;
            
            if (existingPayout) {
                // Update existing Draft / Approved record
                existingPayout.patientsSeen = patientsSeen;
                existingPayout.revenueGenerated = revenueGenerated;
                existingPayout.commissionPercent = commPercent;
                existingPayout.commissionAmount = commissionAmount;
                existingPayout.fixedSalary = fixedSalary;
                existingPayout.totalPayable = totalPayable;
                await existingPayout.save();
            } else {
                // Create new draft payout record
                const newPayout = new DoctorPayout({
                    hospitalId,
                    doctorId: doc._id,
                    month,
                    patientsSeen,
                    revenueGenerated,
                    commissionPercent: commPercent,
                    commissionAmount,
                    fixedSalary,
                    totalPayable,
                    status: 'Draft'
                });
                await newPayout.save();
            }
            calculatedCount++;
        }
        
        await logFinanceActivity(
            req, 
            'Doctor Payout Calculated', 
            totalCalculatedAmount, 
            `Calculated doctor payouts for month ${month} for ${calculatedCount} doctors`
        );
        
        res.json({ success: true, message: `Successfully processed payouts calculation for ${calculatedCount} doctors`, count: calculatedCount });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST approve doctor payout record
router.post('/doctor-payouts/records/approve/:id', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { Doctor, DoctorPayout } = getModels(req.tenantDb);
        
        const payout = await DoctorPayout.findOne({ _id: req.params.id, hospitalId }).populate({ path: 'doctorId', model: Doctor });
        if (!payout) {
            return res.status(404).json({ success: false, message: 'Payout record not found' });
        }
        
        if (payout.status !== 'Draft') {
            return res.status(400).json({ success: false, message: 'Payout record status must be Draft to approve' });
        }
        
        payout.status = 'Approved';
        await payout.save();
        
        await logFinanceActivity(
            req, 
            'Doctor Payout Approved', 
            payout.totalPayable, 
            `Approved payout draft for doctor ${payout.doctorId?.name} for month ${payout.month}`
        );
        
        res.json({ success: true, payout });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST pay doctor payout record
router.post('/doctor-payouts/records/pay/:id', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { paymentMethod, transactionReference, notes } = req.body;
        const { Doctor, DoctorPayout, Expense } = getModels(req.tenantDb);
        
        const payout = await DoctorPayout.findOne({ _id: req.params.id, hospitalId }).populate({ path: 'doctorId', model: Doctor });
        if (!payout) {
            return res.status(404).json({ success: false, message: 'Payout record not found' });
        }
        
        if (payout.status === 'Paid') {
            return res.status(400).json({ success: false, message: 'Payout record is already paid' });
        }
        
        payout.status = 'Paid';
        payout.paymentDate = new Date();
        payout.paymentMethod = paymentMethod || 'Bank Transfer';
        payout.transactionReference = transactionReference || '';
        payout.paidBy = req.user._id;
        payout.notes = notes || '';
        await payout.save();
        
        // Post Expense to "Medical Staff Expense (Doctor Payout)"
        // This category contains "doctor" (in parenthesized text), which P&L maps to Consultation.expenses
        const expense = new Expense({
            hospitalId,
            category: 'Medical Staff Expense (Doctor Payout)',
            amount: payout.totalPayable,
            date: new Date(),
            description: `Doctor Payout for month ${payout.month} paid to doctor ${payout.doctorId?.name || 'Doctor'}`,
            paymentMethod: paymentMethod || 'Bank Transfer',
            paymentStatus: 'Paid',
            addedBy: req.user._id,
            addedByName: req.user.name || 'Accountant',
            recipientId: payout.doctorId?.userId || null, // Point to User reference if available
            recipientName: payout.doctorId?.name || 'Doctor'
        });
        await expense.save();
        
        await logFinanceActivity(
            req, 
            'Doctor Payout Paid', 
            payout.totalPayable, 
            `Processed payout payment to doctor ${payout.doctorId?.name} for month ${payout.month} (Method: ${paymentMethod}, Total: ₹${payout.totalPayable})`
        );
        
        res.json({ success: true, payout });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/audit-logs/activity', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { activity, details } = req.body;

        if (!activity) {
            return res.status(400).json({ success: false, message: 'Activity name is required' });
        }

        const { UserActivityLog } = getModels(req.tenantDb);

        const log = new UserActivityLog({
            hospitalId,
            userId: req.user._id,
            userName: req.user.name || 'Accountant',
            userEmail: req.user.email,
            activity,
            details: details || '',
            ipAddress: req.ip || req.headers['x-forwarded-for'] || ''
        });

        await log.save();
        res.status(201).json({ success: true, log });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────
// RECEPTION COLLECTIONS ENDPOINTS
// ─────────────────────────────────────────────────────────

// 1. Get Reception Collections Summary (KPIs & Counter-Wise Totals)
router.get('/reception-collections', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { startDate, endDate } = req.query;

        let start = new Date();
        start.setHours(0, 0, 0, 0);
        let end = new Date();
        end.setHours(23, 59, 59, 999);

        if (startDate) {
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
        }
        if (endDate) {
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        }

        const { CollectionTransaction } = getModels(req.tenantDb);

        // Security check: Receptionist can only view their own transactions
        const role = typeof req.user.role === 'string' ? req.user.role.toLowerCase() : (req.user._roleData?.name || '').toLowerCase();
        let userFilter = {};
        if (['reception', 'receptionist'].includes(role)) {
            userFilter = { collectedByUserId: req.user._id };
        }

        const txs = await CollectionTransaction.find({
            ...hFilter,
            ...userFilter,
            collectionTimestamp: { $gte: start, $lte: end }
        }).lean();

        // Get all receptionists registered in this hospital to populate the filter dropdown and map names dynamically
        const Role = require('../models/role.model');
        const { User } = getModels(req.tenantDb);
        const receptionRoles = await Role.find({
            name: { $in: [/^receptionist$/i, /^reception$/i, /^frontdesk$/i] }
        }).select('_id').lean();
        const receptionRoleIds = receptionRoles.map(r => r._id);
        
        const allReceptionists = await User.find({
            ...hFilter,
            $or: [
                { role: { $in: receptionRoleIds } },
                { role: { $in: ['receptionist', 'reception', 'frontdesk'] } }
            ]
        }).select('_id name counterName').sort({ name: 1 }).lean();

        const receptionistMap = {};
        allReceptionists.forEach(r => {
            receptionistMap[String(r._id)] = {
                name: r.name,
                counterName: r.counterName
            };
        });

        // 1. Calculate KPIs
        let totalCollection = 0;
        let cashCollection = 0;
        let upiCollection = 0;
        let cardCollection = 0;
        let bankCollection = 0;
        const activeCountersSet = new Set();

        txs.forEach(t => {
            totalCollection += t.amount || 0;
            if (t.paymentMethod === 'Cash') cashCollection += t.amount || 0;
            else if (t.paymentMethod === 'UPI') upiCollection += t.amount || 0;
            else if (t.paymentMethod === 'Card') cardCollection += t.amount || 0;
            else if (t.paymentMethod === 'Bank Transfer') bankCollection += t.amount || 0;

            const currentProfile = receptionistMap[String(t.collectedByUserId)];
            const cName = currentProfile ? (currentProfile.counterName || currentProfile.name) : t.counterName;
            if (cName) activeCountersSet.add(cName);
        });

        // 2. Group by Receptionist and Counter
        const groups = {};
        txs.forEach(t => {
            const currentProfile = receptionistMap[String(t.collectedByUserId)] || {
                name: t.collectedByName,
                counterName: t.counterName
            };
            const rName = currentProfile.name;
            const cName = currentProfile.counterName || rName || 'Counter 1';

            const key = `${t.collectedByUserId}_${cName}`;
            if (!groups[key]) {
                groups[key] = {
                    receptionistId: t.collectedByUserId,
                    receptionistName: rName,
                    counterName: cName,
                    transactionsCount: 0,
                    cash: 0,
                    upi: 0,
                    card: 0,
                    bankTransfer: 0,
                    total: 0
                };
            }

            const g = groups[key];
            g.transactionsCount += 1;
            g.total += t.amount || 0;
            if (t.paymentMethod === 'Cash') g.cash += t.amount || 0;
            else if (t.paymentMethod === 'UPI') g.upi += t.amount || 0;
            else if (t.paymentMethod === 'Card') g.card += t.amount || 0;
            else if (t.paymentMethod === 'Bank Transfer') g.bankTransfer += t.amount || 0;
        });

        res.json({
            success: true,
            kpis: {
                totalCollection,
                cashCollection,
                upiCollection,
                cardCollection,
                bankCollection,
                activeCounters: activeCountersSet.size
            },
            counterWiseSummary: Object.values(groups),
            receptionists: allReceptionists
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. Drill Down Transaction List
router.get('/reception-collections/transactions', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { startDate, endDate, receptionistId, paymentMethod } = req.query;

        let start = new Date();
        start.setHours(0, 0, 0, 0);
        let end = new Date();
        end.setHours(23, 59, 59, 999);

        if (startDate) {
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
        }
        if (endDate) {
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        }

        const { CollectionTransaction } = getModels(req.tenantDb);

        // Security check
        const role = typeof req.user.role === 'string' ? req.user.role.toLowerCase() : (req.user._roleData?.name || '').toLowerCase();
        let userFilter = {};
        if (['reception', 'receptionist'].includes(role)) {
            userFilter = { collectedByUserId: req.user._id };
        } else if (receptionistId) {
            userFilter = { collectedByUserId: receptionistId };
        }

        const query = {
            ...hFilter,
            ...userFilter,
            collectionTimestamp: { $gte: start, $lte: end }
        };

        if (paymentMethod) {
            query.paymentMethod = paymentMethod;
        }

        const transactions = await CollectionTransaction.find(query).sort({ collectionTimestamp: -1 }).lean();

        // Dynamically resolve receptionist names and counter names from User collection
        const Role = require('../models/role.model');
        const { User } = getModels(req.tenantDb);
        const receptionRoles = await Role.find({
            name: { $in: [/^receptionist$/i, /^reception$/i, /^frontdesk$/i] }
        }).select('_id').lean();
        const receptionRoleIds = receptionRoles.map(r => r._id);
        
        const allReceptionists = await User.find({
            ...hFilter,
            $or: [
                { role: { $in: receptionRoleIds } },
                { role: { $in: ['receptionist', 'reception', 'frontdesk'] } }
            ]
        }).select('_id name counterName').lean();

        const receptionistMap = {};
        allReceptionists.forEach(r => {
            receptionistMap[String(r._id)] = {
                name: r.name,
                counterName: r.counterName
            };
        });

        const mappedTransactions = transactions.map(t => {
            const currentProfile = receptionistMap[String(t.collectedByUserId)];
            if (currentProfile) {
                return {
                    ...t,
                    collectedByName: currentProfile.name,
                    counterName: currentProfile.counterName || currentProfile.name || 'Counter 1'
                };
            }
            return t;
        });

        res.json({ success: true, transactions: mappedTransactions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. Get Reconciliation record
router.get('/reception-collections/reconciliation', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hFilter = hospitalId ? { hospitalId } : {};
        const { targetDate } = req.query;
        const target = targetDate ? new Date(targetDate) : new Date();

        const startOfTarget = new Date(target.setHours(0, 0, 0, 0));
        const endOfTarget = new Date(target.setHours(23, 59, 59, 999));

        const { CollectionTransaction, Reconciliation } = getModels(req.tenantDb);

        const record = await Reconciliation.findOne({
            ...hFilter,
            date: { $gte: startOfTarget, $lte: endOfTarget }
        }).lean();

        // Calculate expected from CollectionTransactions
        const txs = await CollectionTransaction.find({
            ...hFilter,
            collectionTimestamp: { $gte: startOfTarget, $lte: endOfTarget }
        }).lean();

        let cashExpected = 0;
        let upiExpected = 0;
        let cardExpected = 0;
        let bankExpected = 0;

        txs.forEach(t => {
            if (t.paymentMethod === 'Cash') cashExpected += t.amount || 0;
            else if (t.paymentMethod === 'UPI') upiExpected += t.amount || 0;
            else if (t.paymentMethod === 'Card') cardExpected += t.amount || 0;
            else if (t.paymentMethod === 'Bank Transfer') bankExpected += t.amount || 0;
        });

        res.json({
            success: true,
            date: startOfTarget,
            expected: {
                cash: cashExpected,
                upi: upiExpected,
                card: cardExpected,
                bank: bankExpected,
                total: cashExpected + upiExpected + cardExpected + bankExpected
            },
            record
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. Save/Submit Reconciliation
router.post('/reception-collections/reconcile', verifyFinanceAccess, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { date, cashActual, upiActual, cardActual, bankActual, notes } = req.body;

        if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

        const target = new Date(date);
        const startOfTarget = new Date(target.setHours(0, 0, 0, 0));
        const endOfTarget = new Date(target.setHours(23, 59, 59, 999));

        const hFilter = hospitalId ? { hospitalId } : {};
        const { CollectionTransaction, Reconciliation } = getModels(req.tenantDb);

        // Expected from CollectionTransactions
        const txs = await CollectionTransaction.find({
            ...hFilter,
            collectionTimestamp: { $gte: startOfTarget, $lte: endOfTarget }
        }).lean();

        let cashExpected = 0;
        let upiExpected = 0;
        let cardExpected = 0;
        let bankExpected = 0;

        txs.forEach(t => {
            if (t.paymentMethod === 'Cash') cashExpected += t.amount || 0;
            else if (t.paymentMethod === 'UPI') upiExpected += t.amount || 0;
            else if (t.paymentMethod === 'Card') cardExpected += t.amount || 0;
            else if (t.paymentMethod === 'Bank Transfer') bankExpected += t.amount || 0;
        });

        const cA = Number(cashActual || 0);
        const uA = Number(upiActual || 0);
        const cD = Number(cardActual || 0);
        const bA = Number(bankActual || 0);

        const status = (cashExpected === cA && upiExpected === uA && cardExpected === cD && bankExpected === bA)
            ? 'Balanced' : 'Discrepancy';

        const record = await Reconciliation.findOneAndUpdate(
            { hospitalId, date: startOfTarget },
            {
                $set: {
                    cashExpected, cashActual: cA,
                    upiExpected, upiActual: uA,
                    cardExpected, cardActual: cD,
                    bankExpected, bankActual: bA,
                    status,
                    notes: notes || '',
                    reconciledBy: req.user._id,
                    reconciledByName: req.user.name || 'Accountant'
                }
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, record });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
