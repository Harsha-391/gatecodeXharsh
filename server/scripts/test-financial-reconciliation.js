const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');

const { JWT_SECRET } = require('../src/config/jwt');

async function runFinancialReconciliation() {
    console.log('💰 STARTING FINANCIAL RECONCILIATION AUDIT...');
    const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
    
    try {
        await mongoose.connect(mongoUrl);
        const Hospital = mongoose.model('Hospital', new mongoose.Schema({}, { strict: false }));
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        const hospital = await Hospital.findOne({});
        const adminUser = await User.findOne({ hospitalId: hospital._id, role: 'hospitaladmin' });

        const { getTenantModels } = require('../src/db/tenantModels');
        const baseUri = mongoUrl.substring(0, mongoUrl.lastIndexOf('/'));
        const conn = await mongoose.createConnection(`${baseUri}/hms_hospital_${hospital._id}?retryWrites=true&w=majority`).asPromise();
        const models = getTenantModels(conn);
        await Promise.all(Object.values(models).map(m => m.ensureIndexes()));

        // Clean existing invoices & expenses
        await models.Invoice.deleteMany({ hospitalId: hospital._id });
        await models.Expense.deleteMany({ hospitalId: hospital._id });
        await models.Refund.deleteMany({ hospitalId: hospital._id });

        // Find or create patient
        let patient = await models.User.findOne({ role: 'patient' });
        if (!patient) {
            patient = new models.User({
                name: 'Financial Audit Patient',
                email: 'fin.patient@reconcile.com',
                role: 'patient',
                hospitalId: hospital._id
            });
            await patient.save();
        }

        console.log('Seeding financial records for validation...');
        const now = new Date();

        // Seed Revenue
        const opdInvoice = new models.Invoice({
            hospitalId: hospital._id,
            patientId: patient._id,
            patientName: patient.name,
            invoiceNumber: 'INV-FIN-OPD',
            grandTotal: 1500,
            amountPaid: 1500,
            outstandingAmount: 0,
            paymentStatus: 'Paid',
            invoiceDate: now,
            items: [{ itemType: 'Consultation', name: 'General OPD Consultation', quantity: 1, unitPrice: 1500, totalAmount: 1500, paymentStatus: 'Paid' }]
        });
        await opdInvoice.save();

        const ipdInvoice = new models.Invoice({
            hospitalId: hospital._id,
            patientId: patient._id,
            patientName: patient.name,
            invoiceNumber: 'INV-FIN-IPD',
            grandTotal: 10000,
            amountPaid: 4000,
            outstandingAmount: 6000,
            paymentStatus: 'Partially Paid',
            invoiceDate: now,
            items: [{ itemType: 'Admission', name: 'General Ward Stay', quantity: 4, unitPrice: 2500, totalAmount: 10000, paymentStatus: 'Pending' }]
        });
        await ipdInvoice.save();

        const labInvoice = new models.Invoice({
            hospitalId: hospital._id,
            patientId: patient._id,
            patientName: patient.name,
            invoiceNumber: 'INV-FIN-LAB',
            grandTotal: 2500,
            amountPaid: 2500,
            outstandingAmount: 0,
            paymentStatus: 'Paid',
            invoiceDate: now,
            items: [{ itemType: 'Laboratory', name: 'Thyroid Panel', quantity: 1, unitPrice: 2500, totalAmount: 2500, paymentStatus: 'Paid' }]
        });
        await labInvoice.save();

        // Cancelled Invoice (Should be ignored by calculations)
        const cancelledInvoice = new models.Invoice({
            hospitalId: hospital._id,
            patientId: patient._id,
            patientName: patient.name,
            invoiceNumber: 'INV-FIN-CANCEL',
            grandTotal: 3500,
            amountPaid: 0,
            outstandingAmount: 3500,
            paymentStatus: 'Cancelled',
            invoiceDate: now,
            items: [{ itemType: 'Service', name: 'Cancelled Procedure', quantity: 1, unitPrice: 3500, totalAmount: 3500, paymentStatus: 'Pending' }]
        });
        await cancelledInvoice.save();

        // Seed Expenses
        const expensesToSeed = [
            { category: 'Canteen - Tea', amount: 450, desc: 'Pantry tea expenses' },
            { category: 'Electricity Utility Bill', amount: 3500, desc: 'Monthly electricity bill' },
            { category: 'Housekeeping / Cleaning', amount: 1500, desc: 'Janitorial cleaning fees' },
            { category: 'Surgical Masks & Gloves', amount: 750, desc: 'Supplies' }
        ];

        for (const exp of expensesToSeed) {
            await new models.Expense({
                hospitalId: hospital._id,
                category: exp.category,
                amount: exp.amount,
                date: now,
                description: exp.desc,
                paymentMethod: 'Cash',
                paymentStatus: 'Paid'
            }).save();
        }

        console.log('✅ Seeding completed.');
        await conn.close();

        // Invoke P&L Aggregator Endpoint
        const token = jwt.sign(
            { userId: adminUser._id, email: adminUser.email, role: 'hospitaladmin', roleId: 'hospitaladmin', hospitalId: String(hospital._id) },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        console.log('👉 Retrieving Profit & Loss statement from API...');
        const res = await axios.get('http://localhost:3000/api/administrator/profit-loss', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.data.success) {
            throw new Error(`API failed: ${res.data.message}`);
        }

        const plData = res.data.data;
        const monthly = plData.monthly;

        const report = {
            timestamp: new Date().toISOString(),
            expectedRevenue: 1500 + 4000 + 2500, // 8000
            expectedExpenses: 450 + 3500 + 1500 + 750, // 6200
            expectedNetProfit: 1800,
            actual: monthly.summary,
            reconciliationPassed: false
        };

        // Validate Gross Revenue & Expenses
        const revMatch = Math.abs(monthly.summary.totalRevenue - report.expectedRevenue) < 1;
        const expMatch = Math.abs(monthly.summary.totalExpenses - report.expectedExpenses) < 1;
        const profitMatch = Math.abs(monthly.summary.netProfit - report.expectedNetProfit) < 1;

        console.log('\n📊 Ledger Financial Verification:');
        console.log(`  - Expected Gross Revenue: ₹${report.expectedRevenue} | Actual: ₹${monthly.summary.totalRevenue} (${revMatch ? '✅ MATCH' : '❌ MISMATCH'})`);
        console.log(`  - Expected Expenses:      ₹${report.expectedExpenses} | Actual: ₹${monthly.summary.totalExpenses} (${expMatch ? '✅ MATCH' : '❌ MISMATCH'})`);
        console.log(`  - Expected Net Profit:    ₹${report.expectedNetProfit} | Actual: ₹${monthly.summary.netProfit} (${profitMatch ? '✅ MATCH' : '❌ MISMATCH'})`);

        if (revMatch && expMatch && profitMatch) {
            report.reconciliationPassed = true;
            console.log('\n✅ FINANCIAL RECONCILIATION SUCCESSFUL: All calculations are 100% accurate!');
        } else {
            console.error('\n❌ FINANCIAL RECONCILIATION FAILED: Ledger mismatch detected!');
        }

        // Save report
        fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
        const reportPath = path.join(__dirname, '../reports/financial-reconciliation-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n======================================================`);
        console.log(`📊 FINANCIAL RECONCILIATION AUDIT COMPLETED`);
        console.log(`Verification Status: ${report.reconciliationPassed ? 'PASSED' : 'FAILED'}`);
        console.log(`Report Location: ${reportPath}`);
        console.log(`======================================================\n`);

        await mongoose.disconnect();
        process.exit(report.reconciliationPassed ? 0 : 1);
    } catch (e) {
        console.error('❌ Financial audit script error:', e);
        process.exit(1);
    }
}

runFinancialReconciliation();
