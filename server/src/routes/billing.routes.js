const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const auditLog = require('../middleware/audit.middleware');

// Master models (fallbacks for single-tenant mode)
const MasterUser = require('../models/user.model');
const MasterAppointment = require('../models/appointment.model');
const MasterLabReport = require('../models/labReport.model');
const MasterPharmacyOrder = require('../models/pharmacyOrder.model');
const MasterFacilityCharge = require('../models/facilityCharge.model');
const MasterAdmission = require('../models/admission.model');
const MasterInvoice = require('../models/invoice.model');
const MasterRefund = require('../models/refund.model');
const MasterBillingActivityLog = require('../models/billingActivityLog.model');
const MasterLabTest = require('../models/labTest.model');

// Billing Access Middleware
const verifyBillingAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const roleIdStr = String(req.user.role || '').toLowerCase();
            const roleData = req.user._roleData;
            const roleName = (roleData?.name || '').toLowerCase();
            const perms = roleData?.permissions || [];

            const isBillingRole = ['billing', 'billing executive', 'billing manager', 'senior billing officer', 'cashier', 'accountant', 'reception', 'receptionist', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(roleIdStr) ||
                ['billing', 'billing executive', 'billing manager', 'senior billing officer', 'cashier', 'accountant', 'reception', 'receptionist', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(roleName);

            if (isBillingRole || perms.includes('billing_view') || perms.includes('billing_manage') || perms.includes('appointment_manage') || perms.includes('*')) {
                await resolveTenant(req, res, next);
            } else {
                return res.status(403).json({ success: false, message: 'Billing access required' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

// Model scoping helper
const getModels = (req) => {
    if (req.tenantDb) {
        const tenantModels = getTenantModels(req.tenantDb);
        return {
            ...tenantModels,
            LabTest: MasterLabTest, // Always use master LabTest schema
        };
    }
    return {
        User: MasterUser,
        Appointment: MasterAppointment,
        LabReport: MasterLabReport,
        PharmacyOrder: MasterPharmacyOrder,
        FacilityCharge: MasterFacilityCharge,
        Admission: MasterAdmission,
        Invoice: MasterInvoice,
        Refund: MasterRefund,
        BillingActivityLog: MasterBillingActivityLog,
        LabTest: MasterLabTest,
    };
};

// 1. Unified Patient Lookup & Consolidation
router.get('/patient/:identifier', verifyBillingAccess, async (req, res) => {
    try {
        const { identifier } = req.params;
        const { User, Appointment, LabReport, PharmacyOrder, FacilityCharge, Admission, Invoice, LabTest } = getModels(req);

        const hospitalFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};
        let patient = null;
        const lookup = identifier.trim();

        // 1. Invoice Lookup
        if (lookup.toUpperCase().startsWith('INV-')) {
            const inv = await Invoice.findOne({ invoiceNumber: lookup, ...hospitalFilter });
            if (inv) {
                patient = await User.findById(inv.patientId);
            }
        }

        // 2. Fuzzy/Identity Lookup
        if (!patient) {
            // Try exact MRN, patientId, or phone first
            patient = await User.findOne({
                ...hospitalFilter,
                $or: [
                    { mrn: lookup },
                    { patientId: lookup },
                    { phone: lookup }
                ]
            });
        }

        // 3. Name search — prefer actual patients (those with a patientId set) over staff
        if (!patient) {
            const nameRegex = { $regex: new RegExp(lookup, 'i') };
            // First try to find a user with patientId (registered patient)
            patient = await User.findOne({
                ...hospitalFilter,
                patientId: { $ne: null, $exists: true },
                name: nameRegex
            });
            // Fallback: any user with matching name
            if (!patient) {
                patient = await User.findOne({ ...hospitalFilter, name: nameRegex });
            }
        }

        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const pendingStatuses = ['pending', 'Pending', 'PENDING', 'Unpaid'];
        const hFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};

        // Fetch billing items
        const [appointments, labReports, pharmacyOrders, facilityCharges, admissions, invoices] = await Promise.all([
            // OPD appointments (pre-paid during registration will be paymentStatus: 'Paid')
            Appointment.find({
                $or: [
                    { userId: patient._id },
                    { patientId: patient.patientId },
                    { patientId: patient.mrn }
                ].filter(Boolean),
                ...hFilter
            }).sort({ appointmentDate: -1 }).lean(),
            // Lab Reports (only if status is Sample Collected or verified, i.e., not raw 'Pending')
            LabReport.find({
                $or: [
                    { userId: patient._id },
                    { patientId: patient.patientId },
                    { patientId: patient.mrn }
                ].filter(Boolean),
                status: { $in: ['Sample Collected', 'In Testing', 'Report Ready', 'Completed'] },
                paymentStatus: { $in: ['PENDING', 'Pending'] },
                ...hFilter
            }).sort({ createdAt: -1 }).lean(),
            // Pharmacy orders (only if orderStatus is Completed, i.e., medicines are dispensed)
            PharmacyOrder.find({
                $or: [
                    { userId: patient._id },
                    { patientId: patient.patientId },
                    { patientId: patient.mrn }
                ].filter(Boolean),
                orderStatus: 'Completed',
                paymentStatus: { $in: ['Pending', 'Unpaid'] },
                ...hFilter
            }).sort({ createdAt: -1 }).lean(),
            // Facility charges
            FacilityCharge.find({
                patientId: patient._id,
                paymentStatus: { $in: ['Pending', 'Unpaid'] },
                ...hFilter
            }).sort({ createdAt: -1 }).lean(),
            // Admissions
            Admission.find({
                patientId: patient._id,
                ...hFilter
            }).sort({ admissionDate: -1 }).lean(),
            // Past invoices
            Invoice.find({
                patientId: patient._id,
                ...hFilter
            }).sort({ createdAt: -1 }).lean()
        ]);

        // Heal and calculate pricing for lab reports dynamically
        const allLabTests = await LabTest.find({}).lean();
        const hospitalIdStr = req.user.hospitalId ? req.user.hospitalId.toString() : null;

        // Map test name to its price for fast lookup
        const testPriceMap = {};
        allLabTests.forEach(t => {
            const nameKey = t.name.trim().toLowerCase();
            let effectivePrice = t.price;
            if (hospitalIdStr && t.hospitalPrices) {
                const hPrice = t.hospitalPrices[hospitalIdStr] || t.hospitalPrices.get?.(hospitalIdStr);
                if (hPrice !== undefined && hPrice !== null) {
                    effectivePrice = hPrice;
                }
            }
            testPriceMap[nameKey] = effectivePrice;
        });

        // Helper to merge test names
        const mergeTestNames = (names) => {
            if (!Array.isArray(names)) return [];
            const merged = [];
            let temp = '';
            let openCount = 0;

            for (const name of names) {
                if (!name) continue;
                const trimmed = name.trim();
                const openParen = (trimmed.match(/\(/g) || []).length;
                const closeParen = (trimmed.match(/\)/g) || []).length;

                if (temp) {
                    temp += ', ' + trimmed;
                } else {
                    temp = trimmed;
                }

                openCount += openParen - closeParen;

                if (openCount <= 0) {
                    merged.push(temp);
                    temp = '';
                    openCount = 0;
                }
            }
            if (temp) {
                merged.push(temp);
            }
            return merged;
        };

        // Heal lab reports in place
        for (let l of labReports) {
            const originalTestNames = [...l.testNames];
            const mergedNames = mergeTestNames(l.testNames);
            
            // Calculate dynamic price
            let calculatedAmount = 0;
            mergedNames.forEach(tName => {
                const trimmedName = tName.trim().toLowerCase();
                if (testPriceMap[trimmedName] !== undefined) {
                    calculatedAmount += testPriceMap[trimmedName];
                } else {
                    // Fuzzy matching fallback
                    const matchedTest = allLabTests.find(t => {
                        const dbName = t.name.trim().toLowerCase();
                        return dbName.includes(trimmedName) || trimmedName.includes(dbName);
                    });
                    if (matchedTest) {
                        let price = matchedTest.price;
                        if (hospitalIdStr && matchedTest.hospitalPrices) {
                            const hPrice = matchedTest.hospitalPrices[hospitalIdStr] || matchedTest.hospitalPrices.get?.(hospitalIdStr);
                            if (hPrice !== undefined && hPrice !== null) {
                                price = hPrice;
                            }
                        }
                        calculatedAmount += price;
                    }
                }
            });

            const needsHeal = (JSON.stringify(originalTestNames) !== JSON.stringify(mergedNames)) || (!l.amount || l.amount === 0);

            // Dynamically assign for response
            l.testNames = mergedNames;
            if (!l.amount || l.amount === 0) {
                l.amount = calculatedAmount;
            }

            if (needsHeal) {
                try {
                    // Update database copy so it's clean for good
                    await LabReport.updateOne(
                        { _id: l._id },
                        { $set: { testNames: mergedNames, amount: l.amount } }
                    );
                } catch (dbErr) {
                    console.error(`Failed to persist healed lab report ${l._id}:`, dbErr.message);
                }
            }
        }

        res.json({
            success: true,
            patient: {
                _id: patient._id,
                name: patient.name,
                mrn: patient.mrn || patient.patientId,
                patientId: patient.patientId,
                phone: patient.phone,
                gender: patient.gender,
                dob: patient.dob,
                bloodGroup: patient.bloodGroup,
                address: patient.address,
                city: patient.city
            },
            billing: { appointments, labReports, pharmacyOrders, facilityCharges, admissions, invoices }
        });
    } catch (error) {
        console.error('Unified lookup error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 2. Generate Consolidated Invoice
router.post('/invoice', verifyBillingAccess, async (req, res) => {
    try {
        const { patientId, items } = req.body;
        if (!patientId || !items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Patient ID and billing items are required.' });
        }

        const { User, Invoice, BillingActivityLog } = getModels(req);
        const patient = await User.findById(patientId);
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found.' });

        const hospitalId = req.user.hospitalId;
        const count = await Invoice.countDocuments({ hospitalId });
        const year = new Date().getFullYear();
        const invoiceNumber = `INV-${year}-${String(count + 1).padStart(6, '0')}`;

        let grandTotal = 0;
        let amountPaid = 0;

        const invoiceItems = items.map(item => {
            const total = Number(item.quantity || 1) * Number(item.unitPrice);
            grandTotal += total;
            
            // If Consultation was pre-paid, mark as Paid and add to initial offset
            let paymentStatus = 'Pending';
            if (item.itemType === 'Consultation' && item.prePaid) {
                paymentStatus = 'Paid';
                amountPaid += total;
            }

            return {
                itemType: item.itemType,
                itemId: item.itemId ? new mongoose.Types.ObjectId(item.itemId) : null,
                name: item.name,
                quantity: Number(item.quantity || 1),
                unitPrice: Number(item.unitPrice),
                totalAmount: total,
                paymentStatus
            };
        });

        const outstandingAmount = grandTotal - amountPaid;
        const paymentStatus = outstandingAmount === 0 ? 'Paid' : (amountPaid > 0 ? 'Partially Paid' : 'Pending');

        const invoice = new Invoice({
            hospitalId,
            patientId,
            patientName: patient.name,
            invoiceNumber,
            items: invoiceItems,
            grandTotal,
            amountPaid,
            outstandingAmount,
            paymentStatus,
            generatedBy: req.user._id,
            generatedByName: req.user.name || 'Staff'
        });

        await invoice.save();

        // Write Activity Log
        await new BillingActivityLog({
            hospitalId,
            performedBy: req.user._id,
            performedByName: req.user.name || 'Staff',
            action: 'Invoice Generated',
            patientId,
            patientName: patient.name,
            details: `Consolidated Invoice ${invoiceNumber} generated for ${invoiceItems.length} items. Total: ₹${grandTotal}`
        }).save();

        // Emit Socket Event
        const io = req.app.get('io');
        if (io) {
            io.emit('invoice_generated', { invoiceId: invoice._id, patientId, invoiceNumber, hospitalId });
        }

        res.status(201).json({ success: true, invoice });
    } catch (error) {
        console.error('Invoice generation error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 3. Process Payments (Collect payment on an Invoice)
router.post('/invoice/:id/payment', verifyBillingAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, method, reference } = req.body;

        if (!amount || amount <= 0 || !method) {
            return res.status(400).json({ success: false, message: 'Payment amount and payment method are required.' });
        }

        const { Invoice, BillingActivityLog, Appointment, LabReport, PharmacyOrder, FacilityCharge, Admission } = getModels(req);
        const invoice = await Invoice.findById(id);
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found.' });

        if (invoice.paymentStatus === 'Paid') {
            return res.status(400).json({ success: false, message: 'Invoice is already fully paid.' });
        }

        const payVal = Number(amount);
        if (payVal > invoice.outstandingAmount) {
            return res.status(400).json({ success: false, message: `Payment amount exceeds outstanding dues (₹${invoice.outstandingAmount}).` });
        }

        const year = new Date().getFullYear();
        const timestamp = Date.now();
        const receiptNumber = `REC-${year}-${String(timestamp).slice(-6)}`;

        const newPayment = {
            receiptNumber,
            amount: payVal,
            date: new Date(),
            method,
            reference: reference || '',
            collectedBy: req.user._id,
            collectedByName: req.user.name || 'Staff'
        };

        invoice.payments.push(newPayment);
        invoice.amountPaid += payVal;
        invoice.outstandingAmount -= payVal;

        if (invoice.outstandingAmount === 0) {
            invoice.paymentStatus = 'Paid';
        } else {
            invoice.paymentStatus = 'Partially Paid';
        }

        // Settle underlying items proportionally
        let runningAmount = payVal;
        for (const item of invoice.items) {
            if (item.paymentStatus === 'Pending' && runningAmount > 0) {
                const itemOustanding = item.totalAmount; 
                if (runningAmount >= itemOustanding) {
                    item.paymentStatus = 'Paid';
                    runningAmount -= itemOustanding;

                    // Sync database status of the actual item
                    if (item.itemId) {
                        try {
                            if (item.itemType === 'Consultation') {
                                await Appointment.findByIdAndUpdate(item.itemId, { paymentStatus: 'Paid' });
                            } else if (item.itemType === 'Laboratory') {
                                await LabReport.findByIdAndUpdate(item.itemId, { paymentStatus: 'PAID', paymentMode: method.toUpperCase() });
                            } else if (item.itemType === 'Pharmacy') {
                                await PharmacyOrder.findByIdAndUpdate(item.itemId, { paymentStatus: 'Paid' });
                            } else if (item.itemType === 'Facility') {
                                await FacilityCharge.findByIdAndUpdate(item.itemId, { paymentStatus: 'Paid' });
                            } else if (item.itemType === 'Admission') {
                                await Admission.findByIdAndUpdate(item.itemId, { paymentStatus: 'Paid' });
                            }
                        } catch (err) {
                            console.error(`Error syncing item ${item.itemId} payment status:`, err);
                        }
                    }
                }
            }
        }

        await invoice.save();

        // Write Activity Log
        await new BillingActivityLog({
            hospitalId: invoice.hospitalId,
            performedBy: req.user._id,
            performedByName: req.user.name || 'Staff',
            action: 'Payment Collected',
            patientId: invoice.patientId,
            patientName: invoice.patientName,
            details: `Collected payment of ₹${payVal} on invoice ${invoice.invoiceNumber} via ${method}. Receipt: ${receiptNumber}`
        }).save();

        // Emit Socket Event
        const io = req.app.get('io');
        if (io) {
            io.emit('payment_received', { invoiceId: invoice._id, receiptNumber, amount: payVal, patientId: invoice.patientId, hospitalId: invoice.hospitalId });
            if (invoice.paymentStatus === 'Paid') {
                io.emit('invoice_paid', { invoiceId: invoice._id, patientId: invoice.patientId, hospitalId: invoice.hospitalId });
            }
        }

        res.json({ success: true, invoice, receipt: newPayment });
    } catch (error) {
        console.error('Payment collection error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 4. Cancel Invoice
router.put('/invoice/:id/cancel', verifyBillingAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { Invoice, BillingActivityLog } = getModels(req);
        const invoice = await Invoice.findById(id);
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found.' });

        if (invoice.payments.length > 0) {
            return res.status(400).json({ success: false, message: 'Cannot cancel an invoice with payments collected. Issue a refund instead.' });
        }

        invoice.paymentStatus = 'Cancelled';
        await invoice.save();

        await new BillingActivityLog({
            hospitalId: invoice.hospitalId,
            performedBy: req.user._id,
            performedByName: req.user.name || 'Staff',
            action: 'Invoice Cancelled',
            patientId: invoice.patientId,
            patientName: invoice.patientName,
            details: `Cancelled invoice ${invoice.invoiceNumber}`
        }).save();

        res.json({ success: true, message: 'Invoice cancelled successfully', invoice });
    } catch (error) {
        console.error('Cancel invoice error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 5. Get List of Invoices
router.get('/invoices', verifyBillingAccess, async (req, res) => {
    try {
        const { Invoice } = getModels(req);
        const hFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};
        const invoices = await Invoice.find(hFilter).sort({ createdAt: -1 }).lean();
        res.json({ success: true, invoices });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 6. Get Refund Requests
router.get('/refunds', verifyBillingAccess, async (req, res) => {
    try {
        const { Refund } = getModels(req);
        const hFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};
        const refunds = await Refund.find(hFilter).sort({ createdAt: -1 }).lean();
        res.json({ success: true, refunds });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 7. Request Refund
router.post('/refunds', verifyBillingAccess, async (req, res) => {
    try {
        const { patientId, patientName, refundType, itemId, amount, reason, invoiceNumber } = req.body;
        if (!patientId || !patientName || !refundType || !amount || !reason) {
            return res.status(400).json({ success: false, message: 'Missing required refund request fields.' });
        }

        const { Refund, BillingActivityLog } = getModels(req);
        const hospitalId = req.user.hospitalId;

        const refund = new Refund({
            hospitalId,
            patientId,
            patientName,
            invoiceNumber: invoiceNumber || '',
            refundType,
            itemId: itemId || null,
            amount: Number(amount),
            reason,
            status: 'Refund Pending',
            requestedBy: req.user._id,
            requestedByName: req.user.name || 'Staff',
            history: [{
                status: 'Refund Pending',
                performedBy: req.user._id,
                performedByName: req.user.name || 'Staff',
                notes: 'Refund request created'
            }]
        });

        await refund.save();

        // Also save a copy to the Master DB (HSM) refunds collection for global database verification
        try {
            const masterRefund = new MasterRefund({
                _id: refund._id, // Match the ID
                hospitalId,
                patientId,
                patientName,
                invoiceNumber: invoiceNumber || '',
                refundType,
                itemId: itemId || null,
                amount: Number(amount),
                reason,
                status: 'Refund Pending',
                requestedBy: req.user._id,
                requestedByName: req.user.name || 'Staff',
                history: [{
                    status: 'Refund Pending',
                    performedBy: req.user._id,
                    performedByName: req.user.name || 'Staff',
                    notes: 'Refund request created'
                }]
            });
            await masterRefund.save();
        } catch (masterErr) {
            console.error('Failed to save refund copy to master DB:', masterErr.message);
        }

        await new BillingActivityLog({
            hospitalId,
            performedBy: req.user._id,
            performedByName: req.user.name || 'Staff',
            action: 'Refund Issued',
            patientId,
            patientName,
            details: `Requested refund of ₹${amount} for ${refundType}. Reason: ${reason}`
        }).save();

        res.status(201).json({ success: true, refund });
    } catch (error) {
        console.error('Request refund error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 8. Approve/Process Refund
router.put('/refunds/:id/approve', verifyBillingAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const userRole = String(req.user.role || '').toLowerCase();
        const roleData = req.user._roleData;
        const roleName = String(roleData?.name || '').toLowerCase();

        if (
            ['reception', 'receptionist'].includes(userRole) ||
            ['reception', 'receptionist'].includes(roleName)
        ) {
            return res.status(403).json({ success: false, message: 'Forbidden: Receptionists are not allowed to approve refunds.' });
        }

        const { Refund, BillingActivityLog } = getModels(req);
        const refund = await Refund.findById(id);
        if (!refund) return res.status(404).json({ success: false, message: 'Refund request not found.' });

        refund.status = 'Refunded';
        refund.approvedBy = req.user._id;
        refund.approvedByName = req.user.name || 'Staff';
        refund.actionDate = new Date();
        refund.history.push({
            status: 'Refunded',
            performedBy: req.user._id,
            performedByName: req.user.name || 'Staff',
            notes: notes || 'Refund request approved and processed.'
        });

        await refund.save();

        // Also update the copy in the Master DB (HSM)
        try {
            const masterRefund = await MasterRefund.findById(id);
            if (masterRefund) {
                masterRefund.status = 'Refunded';
                masterRefund.approvedBy = req.user._id;
                masterRefund.approvedByName = req.user.name || 'Staff';
                masterRefund.actionDate = refund.actionDate;
                masterRefund.history.push({
                    status: 'Refunded',
                    performedBy: req.user._id,
                    performedByName: req.user.name || 'Staff',
                    notes: notes || 'Refund request approved and processed.'
                });
                await masterRefund.save();
            }
        } catch (masterErr) {
            console.error('Failed to update refund copy in master DB:', masterErr.message);
        }

        await new BillingActivityLog({
            hospitalId: refund.hospitalId,
            performedBy: req.user._id,
            performedByName: req.user.name || 'Staff',
            action: 'Refund Issued',
            patientId: refund.patientId,
            patientName: refund.patientName,
            details: `Refund approved and processed of ₹${refund.amount} for ${refund.refundType}. Notes: ${notes || ''}`
        }).save();

        const io = req.app.get('io');
        if (io) {
            io.emit('refund_processed', { refundId: refund._id, patientId: refund.patientId, amount: refund.amount, hospitalId: refund.hospitalId });
        }

        res.json({ success: true, refund });
    } catch (error) {
        console.error('Approve refund error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 9. Get Audit Logs
router.get('/activity-logs', verifyBillingAccess, async (req, res) => {
    try {
        const { BillingActivityLog } = getModels(req);
        const hFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};
        const logs = await BillingActivityLog.find(hFilter).sort({ createdAt: -1 }).limit(100).lean();
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 10. Direct / Pay endpoint (Backward Compatibility)
router.put('/pay', verifyBillingAccess, auditLog('CONFIRM_PAYMENT'), async (req, res) => {
    try {
        const {
            appointmentIds = [],
            labReportIds = [],
            pharmacyOrderIds = [],
            facilityChargeIds = [],
            admissionIds = [],
            paymentMode = 'Cash'
        } = req.body;

        const { Appointment, LabReport, PharmacyOrder, FacilityCharge, Admission } = getModels(req);

        await Promise.all([
            appointmentIds.length > 0 && Appointment.updateMany(
                { _id: { $in: appointmentIds } }, { $set: { paymentStatus: 'Paid', paymentMode } }),
            labReportIds.length > 0 && LabReport.updateMany(
                { _id: { $in: labReportIds } }, { $set: { paymentStatus: 'PAID', paymentMode: paymentMode.toUpperCase() } }),
            pharmacyOrderIds.length > 0 && PharmacyOrder.updateMany(
                { _id: { $in: pharmacyOrderIds } }, { $set: { paymentStatus: 'Paid' } }),
            facilityChargeIds.length > 0 && FacilityCharge.updateMany(
                { _id: { $in: facilityChargeIds } }, { $set: { paymentStatus: 'Paid' } }),
            admissionIds.length > 0 && Admission.updateMany(
                { _id: { $in: admissionIds } }, { $set: { paymentStatus: 'Paid' } }),
        ].filter(Boolean));

        const io = req.app.get('io');
        if (io) {
            io.emit('payment_received', { amount: 0, hospitalId: req.user.hospitalId });
        }

        res.json({ success: true, message: 'Billing settled successfully' });
    } catch (error) {
        console.error('Legacy pay endpoint error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 11. Add Facility Charge (Backward Compatibility)
router.post('/facility-charge', verifyBillingAccess, async (req, res) => {
    try {
        const { patientId, facilityName, pricePerDay, days } = req.body;
        if (!patientId || !facilityName || !pricePerDay || !days) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const { FacilityCharge } = getModels(req);
        const charge = new FacilityCharge({
            hospitalId: req.user.hospitalId,
            patientId,
            facilityName,
            pricePerDay: Number(pricePerDay),
            daysUsed: Number(days),
            totalAmount: Number(pricePerDay) * Number(days),
            addedBy: req.user._id
        });

        await charge.save();
        res.status(201).json({ success: true, message: 'Facility charge added', charge });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 12. Revenue Analytics & Reports
router.get('/analytics', verifyBillingAccess, async (req, res) => {
    try {
        const { Invoice } = getModels(req);
        const hFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};

        const invoices = await Invoice.find({ ...hFilter, paymentStatus: { $ne: 'Cancelled' } }).lean();

        let todayRevenue = 0;
        let monthlyRevenue = 0;
        let pendingPayments = 0;
        let outstandingDues = 0;
        let totalPaidInvoices = 0;
        let totalPartialPayments = 0;

        let labRevenue = 0;
        let pharmacyRevenue = 0;
        let admissionRevenue = 0;

        let cashCollections = 0;
        let upiCollections = 0;
        let cardCollections = 0;
        let bankCollections = 0;

        const todayStr = new Date().toDateString();
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        invoices.forEach(inv => {
            outstandingDues += inv.outstandingAmount;
            if (inv.paymentStatus === 'Paid') {
                totalPaidInvoices++;
            } else if (inv.paymentStatus === 'Partially Paid') {
                totalPartialPayments++;
            } else if (inv.paymentStatus === 'Pending') {
                pendingPayments += inv.outstandingAmount;
            }

            // Sift through invoice items for source revenue
            inv.items.forEach(item => {
                const isPaid = item.paymentStatus === 'Paid' || inv.paymentStatus === 'Paid' || inv.paymentStatus === 'Partially Paid';
                if (isPaid) {
                    if (item.itemType === 'Laboratory') labRevenue += item.totalAmount;
                    else if (item.itemType === 'Pharmacy') pharmacyRevenue += item.totalAmount;
                    else if (item.itemType === 'Admission') admissionRevenue += item.totalAmount;
                }
            });

            // payments breakdown
            inv.payments.forEach(p => {
                const payDate = new Date(p.date);
                if (payDate.toDateString() === todayStr) {
                    todayRevenue += p.amount;
                }
                if (payDate.getMonth() === currentMonth && payDate.getFullYear() === currentYear) {
                    monthlyRevenue += p.amount;
                }

                if (p.method === 'Cash') cashCollections += p.amount;
                else if (p.method === 'UPI') upiCollections += p.amount;
                else if (p.method === 'Card') cardCollections += p.amount;
                else if (p.method === 'Bank Transfer') bankCollections += p.amount;
            });
        });

        res.json({
            success: true,
            analytics: {
                todayRevenue,
                monthlyRevenue,
                pendingPayments,
                outstandingDues,
                paidInvoices: totalPaidInvoices,
                partialPayments: totalPartialPayments,
                labRevenue,
                pharmacyRevenue,
                admissionRevenue,
                totalCollections: cashCollections + upiCollections + cardCollections + bankCollections,
                cashCollections,
                upiCollections,
                cardCollections,
                bankCollections
            }
        });
    } catch (error) {
        console.error('Analytics fetch error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
