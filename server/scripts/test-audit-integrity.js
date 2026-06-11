const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');

const { JWT_SECRET } = require('../src/config/jwt');

async function runAuditIntegrityTest() {
    console.log('📝 STARTING AUDIT LOG INTEGRITY AUDIT...');
    const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
    
    try {
        await mongoose.connect(mongoUrl);
        const Hospital = mongoose.model('Hospital', new mongoose.Schema({}, { strict: false }));
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false }));

        // Fetch hospital and staff admin
        const hospital = await Hospital.findOne({});
        if (!hospital) {
            console.error('❌ Error: Need at least 1 hospital in database.');
            process.exit(1);
        }

        const adminUser = await User.findOne({ hospitalId: hospital._id, role: 'hospitaladmin' });
        if (!adminUser) {
            console.error('❌ Error: Need at least 1 hospital admin user.');
            process.exit(1);
        }

        // Fetch a patient ID from Hospital's tenant DB
        const { getTenantModels } = require('../src/db/tenantModels');
        const baseUri = mongoUrl.substring(0, mongoUrl.lastIndexOf('/'));
        const conn = await mongoose.createConnection(`${baseUri}/hms_hospital_${hospital._id}?retryWrites=true&w=majority`).asPromise();
        const tenantModels = getTenantModels(conn);
        
        let testPatient = await tenantModels.User.findOne({ role: 'patient' });
        if (!testPatient) {
            testPatient = new tenantModels.User({
                name: 'Audit Integrity Dummy Patient',
                email: 'audit.dummy@recovery.com',
                role: 'patient',
                hospitalId: hospital._id,
                isActive: true
            });
            await testPatient.save();
        }
        const patientId = testPatient._id;
        await conn.close();

        // 1. Generate JWT Token
        const token = jwt.sign(
            { userId: adminUser._id, email: adminUser.email, role: 'hospitaladmin', roleId: 'hospitaladmin', hospitalId: String(hospital._id) },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        const apiClient = axios.create({
            baseURL: 'http://localhost:3000',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            validateStatus: () => true
        });

        const report = {
            timestamp: new Date().toISOString(),
            integrityScore: 100,
            failures: 0,
            testCases: []
        };

        const verifyLogExists = async (action, checkFn) => {
            console.log(`⏱️ Waiting 1.5s for async logging pipeline to write [${action}]...`);
            await new Promise(r => setTimeout(r, 1500));
            
            const log = await AuditLog.findOne({ clinicId: hospital._id, action }).sort({ createdAt: -1 });
            const passed = !!log && checkFn(log);

            report.testCases.push({
                action,
                logFound: !!log,
                logDetails: log ? { userId: log.userId, userName: log.userName, clinicId: log.clinicId } : null,
                passed
            });

            if (passed) {
                console.log(`✅ Passed: Audit log successfully verified for action [${action}]`);
            } else {
                console.error(`❌ Failed: Audit log verification failed or missing for action [${action}]`);
                report.failures++;
                report.integrityScore -= 25;
            }
        };

        // Trigger 1: Login attempt
        console.log('👉 Triggering STAFF_LOGIN audit event...');
        // Directly test auth endpoint
        await axios.post('http://localhost:3000/api/auth/login', {
            email: adminUser.email,
            password: 'incorrect_password_for_logging' // Failed login
        }, { validateStatus: () => true });

        await verifyLogExists('STAFF_LOGIN', (log) => {
            return log.success === false && String(log.clinicId) === String(hospital._id);
        });

        // Trigger 2: Patient view full history
        console.log('👉 Triggering VIEW_PATIENT audit event...');
        await apiClient.get(`/api/patients/${patientId}/full-history`);

        await verifyLogExists('VIEW_PATIENT', (log) => {
            return String(log.targetId) === String(patientId) && String(log.userId) === String(adminUser._id);
        });

        // Trigger 3: Logout audit event
        console.log('👉 Triggering STAFF_LOGOUT audit event...');
        await apiClient.post('/api/auth/logout');

        await verifyLogExists('STAFF_LOGOUT', (log) => {
            return String(log.userId) === String(adminUser._id) && String(log.clinicId) === String(hospital._id);
        });

        // Save report
        fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
        const reportPath = path.join(__dirname, '../reports/audit-integrity-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n======================================================`);
        console.log(`📊 AUDIT LOG INTEGRITY AUDIT COMPLETE`);
        console.log(`Integrity Score: ${report.integrityScore}/100`);
        console.log(`Failures Detected: ${report.failures}`);
        console.log(`Report Location: ${reportPath}`);
        console.log(`======================================================\n`);

        await mongoose.disconnect();
        process.exit(report.failures === 0 ? 0 : 1);
    } catch (e) {
        console.error('❌ Audit Integrity test script error:', e);
        process.exit(1);
    }
}

runAuditIntegrityTest();
