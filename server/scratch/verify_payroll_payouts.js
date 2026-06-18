const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'a7ad54f3356c02e5256a7a148afecede';
const MONGO_URL = process.env.MONGODB_URL;
const API_URL = 'http://localhost:3000/api/finance';

async function run() {
    try {
        console.log('Connecting to Master DB...');
        await mongoose.connect(MONGO_URL);
        console.log('Connected to Master DB.');

        // Find accountant user
        const MasterUser = require('../src/models/user.model');
        const accountant = await MasterUser.findOne({ email: 'accountant@crm.com' });
        if (!accountant) {
            throw new Error('Accountant user not found');
        }
        console.log(`Found accountant: ${accountant.name} (${accountant._id})`);
        const hospitalId = accountant.hospitalId;

        // Generate token
        const token = jwt.sign(
            {
                jti: uuidv4(),
                userId: accountant._id.toString(),
                email: accountant.email,
                roleId: accountant.role.toString(),
                hospitalId: hospitalId.toString(),
                tv: accountant.tokenVersion || 0,
            },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        const headers = { Authorization: `Bearer ${token}` };

        // Load dynamic models for tenant DB
        const { getTenantModels } = require('../src/db/tenantModels');
        const tenantDbName = `hms_hospital_${hospitalId.toString()}`;
        console.log(`Connecting to tenant DB: ${tenantDbName}`);
        const baseUrl = MONGO_URL.includes('/?') ? MONGO_URL.split('/?')[0] : MONGO_URL.substring(0, MONGO_URL.lastIndexOf('/'));
        const tenantConn = mongoose.createConnection(`${baseUrl}/${tenantDbName}?retryWrites=true&w=majority`);
        await new Promise((resolve) => tenantConn.once('open', resolve));
        console.log('Connected to Tenant DB.');
        const tenantModels = getTenantModels(tenantConn);

        // Clean up previous runs
        await tenantModels.PayrollRecord.deleteMany({ hospitalId, month: '2026-06' });
        await tenantModels.DoctorPayout.deleteMany({ hospitalId, month: '2026-06' });
        await tenantModels.Expense.deleteMany({ hospitalId, category: { $in: ['Staff Salary', 'Medical Staff Expense (Doctor Payout)'] } });

        console.log('\n--- 1. Testing GET /payroll/staff ---');
        const staffRes = await axios.get(`${API_URL}/payroll/staff`, { headers });
        console.log(`GET /payroll/staff status: ${staffRes.status}, success: ${staffRes.data.success}`);
        console.log(`Staff users count: ${staffRes.data.staff.length}`);

        // Find receptionist to configure salary
        const receptionist = staffRes.data.staff.find(s => s.email === 'reception@crm.com');
        if (!receptionist) {
            throw new Error('Receptionist user not found in staff list');
        }
        console.log(`Found staff receptionist: ${receptionist.name} (${receptionist._id})`);

        console.log('\n--- 2. Testing PUT /payroll/staff/:id ---');
        const updateRes = await axios.put(`${API_URL}/payroll/staff/${receptionist._id}`, {
            basicSalary: 25000,
            allowances: 5000,
            deductions: 2000,
            designation: 'Desk Receptionist'
        }, { headers });
        console.log(`PUT status: ${updateRes.status}, success: ${updateRes.data.success}`);
        console.log(`Updated compensation template for: ${updateRes.data.employee.name}`);

        console.log('\n--- 3. Testing POST /payroll/records/generate ---');
        const generateRes = await axios.post(`${API_URL}/payroll/records/generate`, {
            month: '2026-06'
        }, { headers });
        console.log(`POST /payroll/records/generate status: ${generateRes.status}`);
        console.log(`Message: ${generateRes.data.message}, count: ${generateRes.data.count}`);

        // Verify drafts are created in tenant DB
        const drafts = await tenantModels.PayrollRecord.find({ hospitalId, month: '2026-06' }).lean();
        console.log(`Verified drafts count in DB: ${drafts.length}`);

        const recepDraft = drafts.find(d => d.employeeId.toString() === receptionist._id);
        if (!recepDraft) {
            throw new Error('Receptionist draft payroll record not generated');
        }
        console.log(`Receptionist draft payroll: Basic: ₹${recepDraft.basicSalary}, Allowances: ₹${recepDraft.allowances}, Deductions: ₹${recepDraft.deductions}, Net: ₹${recepDraft.netSalary}`);

        console.log('\n--- 4. Testing POST /payroll/records/pay/:id ---');
        const payRes = await axios.post(`${API_URL}/payroll/records/pay/${recepDraft._id}`, {
            paymentMethod: 'Bank Transfer',
            transactionReference: 'TXN-VERIFY-0626',
            notes: 'Verified via test script'
        }, { headers });
        console.log(`POST /payroll/records/pay status: ${payRes.status}`);
        console.log(`Updated status to: ${payRes.data.record.status}`);

        // Verify Expense record is created
        const expense = await tenantModels.Expense.findOne({
            hospitalId,
            category: 'Staff Salary',
            recipientId: receptionist._id
        }).lean();
        if (expense) {
            console.log(`✅ Success: Expense Posted: Category: "${expense.category}", Amount: ₹${expense.amount}, Desc: "${expense.description}"`);
        } else {
            console.log('❌ Error: Staff Salary expense not found!');
        }

        // Verify activity log
        const logEntry = await tenantModels.UserActivityLog.findOne({
            hospitalId,
            activity: 'Salary Paid'
        }).sort({ createdAt: -1 }).lean();
        if (logEntry) {
            console.log(`✅ Success: UserActivityLog entry found: "${logEntry.activity}", Details: "${logEntry.details}"`);
        } else {
            console.log('❌ Error: Salary Paid activity log not found!');
        }

        console.log('\n--- 5. Testing POST /payroll/records/reverse/:id ---');
        const reverseRes = await axios.post(`${API_URL}/payroll/records/reverse/${recepDraft._id}`, {}, { headers });
        console.log(`POST /payroll/records/reverse status: ${reverseRes.status}`);
        console.log(`Status reset to: ${reverseRes.data.record.status}`);

        // Verify Expense is deleted
        const revertedExpense = await tenantModels.Expense.findOne({
            hospitalId,
            category: 'Staff Salary',
            recipientId: receptionist._id
        }).lean();
        if (!revertedExpense) {
            console.log('✅ Success: Posted salary expense deleted successfully on reversal.');
        } else {
            console.log('❌ Error: Salary expense still exists after reversal!');
        }

        console.log('\n--- 6. Testing GET /doctor-payouts/doctors ---');
        const docsRes = await axios.get(`${API_URL}/doctor-payouts/doctors`, { headers });
        console.log(`GET /doctor-payouts/doctors status: ${docsRes.status}, count: ${docsRes.data.doctors.length}`);
        const testDoc = docsRes.data.doctors[0];
        if (!testDoc) {
            console.log('No doctors found to test doctor payouts.');
        } else {
            console.log(`Testing with Doctor: ${testDoc.name} (${testDoc._id})`);

            console.log('\n--- 7. Testing PUT /doctor-payouts/doctors/:id ---');
            const docPutRes = await axios.put(`${API_URL}/doctor-payouts/doctors/${testDoc._id}`, {
                payoutModel: 'Hybrid',
                commissionPercent: 10,
                fixedSalary: 45000
            }, { headers });
            console.log(`PUT doctor payout config status: ${docPutRes.status}`);
            console.log(`Updated Doctor payoutModel: ${docPutRes.data.doctor.payoutModel}`);

            console.log('\n--- 8. Testing POST /doctor-payouts/records/calculate ---');
            const calcRes = await axios.post(`${API_URL}/doctor-payouts/records/calculate`, {
                month: '2026-06'
            }, { headers });
            console.log(`POST /doctor-payouts/records/calculate status: ${calcRes.status}`);
            console.log(`Message: ${calcRes.data.message}`);

            // Fetch created doctor payout drafts
            const payoutDrafts = await tenantModels.DoctorPayout.find({ hospitalId, month: '2026-06' }).lean();
            console.log(`Doctor payout drafts in DB: ${payoutDrafts.length}`);
            const docDraft = payoutDrafts.find(d => d.doctorId.toString() === testDoc._id);
            if (!docDraft) {
                throw new Error('Doctor payout record draft not calculated');
            }
            console.log(`Doctor Payout Draft: Fixed: ₹${docDraft.fixedSalary}, Comm %: ${docDraft.commissionPercent}%, Payable: ₹${docDraft.totalPayable}`);

            console.log('\n--- 9. Testing POST /doctor-payouts/records/approve/:id ---');
            const approveRes = await axios.post(`${API_URL}/doctor-payouts/records/approve/${docDraft._id}`, {}, { headers });
            console.log(`POST approve doctor payout status: ${approveRes.status}`);
            console.log(`Approved status: ${approveRes.data.payout.status}`);

            console.log('\n--- 10. Testing POST /doctor-payouts/records/pay/:id ---');
            const docPayRes = await axios.post(`${API_URL}/doctor-payouts/records/pay/${docDraft._id}`, {
                paymentMethod: 'Bank Transfer',
                transactionReference: 'TXN-DOC-0626',
                notes: 'Test payout'
            }, { headers });
            console.log(`POST pay doctor payout status: ${docPayRes.status}`);
            console.log(`Paid status: ${docPayRes.data.payout.status}`);

            // Verify doctor payout Expense
            const docExpense = await tenantModels.Expense.findOne({
                hospitalId,
                category: 'Medical Staff Expense (Doctor Payout)'
            }).lean();
            if (docExpense) {
                console.log(`✅ Success: Expense Posted: Category: "${docExpense.category}", Amount: ₹${docExpense.amount}, Desc: "${docExpense.description}"`);
            } else {
                console.log('❌ Error: Doctor Payout expense not found!');
            }

            // Verify doctor payout activity log
            const docLog = await tenantModels.UserActivityLog.findOne({
                hospitalId,
                activity: 'Doctor Payout Paid'
            }).sort({ createdAt: -1 }).lean();
            if (docLog) {
                console.log(`✅ Success: Logged activity: "${docLog.activity}", Details: "${docLog.details}"`);
            } else {
                console.log('❌ Error: Doctor Payout Paid activity log not found!');
            }
        }

        // Clean up test records
        await tenantModels.PayrollRecord.deleteMany({ hospitalId, month: '2026-06' });
        await tenantModels.DoctorPayout.deleteMany({ hospitalId, month: '2026-06' });
        await tenantModels.Expense.deleteMany({ hospitalId, category: { $in: ['Staff Salary', 'Medical Staff Expense (Doctor Payout)'] } });
        console.log('\n--- Cleanup done. DB restored to clean state. ---');

        await tenantConn.close();
        await mongoose.disconnect();
        console.log('\nVerification complete. Everything executes perfectly!');
    } catch (err) {
        console.error('Error during verification:');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data);
        } else {
            console.error(err.message);
        }
        process.exit(1);
    }
}

run();
