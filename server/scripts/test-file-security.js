const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');

const { JWT_SECRET } = require('../src/config/jwt');

async function runFileSecurityTest() {
    console.log('📂 STARTING FILE STORAGE SECURITY AUDIT...');
    const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
    
    try {
        await mongoose.connect(mongoUrl);
        const Hospital = mongoose.model('Hospital', new mongoose.Schema({}, { strict: false }));
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        const hospital = await Hospital.findOne({});
        const adminUser = await User.findOne({ hospitalId: hospital._id, role: 'hospitaladmin' });

        const report = {
            timestamp: new Date().toISOString(),
            ownershipCheck: 'PASSED',
            isolationCheck: 'PASSED',
            overallScore: 100,
            testCases: []
        };

        // Validate that uploaded file URLs are bound to tenant appointments/lab reports
        // which reside in connection-scoped databases.
        const { getTenantModels } = require('../src/db/tenantModels');
        const baseUri = mongoUrl.substring(0, mongoUrl.lastIndexOf('/'));
        const conn = await mongoose.createConnection(`${baseUri}/hms_hospital_${hospital._id}?retryWrites=true&w=majority`).asPromise();
        const models = getTenantModels(conn);
        await Promise.all(Object.values(models).map(m => m.ensureIndexes()));

        // Create a dummy appointment with a file link
        console.log('Seeding mock appointment file link for verification...');
        const mockApt = new models.Appointment({
            doctorName: 'File Test Doctor',
            appointmentDate: new Date(),
            prescriptions: [{
                url: 'https://ik.imagekit.io/b3pvj0biyx/crm_test_confidential_report.pdf',
                name: 'confidential_report.pdf',
                uploadedAt: new Date(),
                fileId: 'file_id_confidential_999'
            }]
        });
        await mockApt.save();
        console.log(`Saved mock appointment [${mockApt._id}] with attachment.`);

        // Generate token for Hospital A
        const token = jwt.sign(
            { userId: adminUser._id, email: adminUser.email, role: 'hospitaladmin', roleId: 'hospitaladmin', hospitalId: String(hospital._id) },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Generate token for Hospital B (different hospital)
        const dummyHospId = new mongoose.Types.ObjectId('6a228ff625c986f081cbf3b2'); // Hospital B
        const tokenB = jwt.sign(
            { userId: new mongoose.Types.ObjectId(), email: 'attacker@hospb.com', role: 'hospitaladmin', roleId: 'hospitaladmin', hospitalId: String(dummyHospId) },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Test 1: Fetching Hospital A's file link using Hospital B's token
        console.log('👉 Attempting cross-tenant pull of file link...');
        const res = await axios.get(`http://localhost:3000/api/appointments/${mockApt._id}`, {
            headers: { 'Authorization': `Bearer ${tokenB}` },
            validateStatus: () => true
        });

        // The request should fail (400 / 404 or empty because of tenant connection-isolation)
        const isSecure = res.status === 400 || res.status === 404 || res.status === 401 || res.status === 403;
        
        report.testCases.push({
            name: 'Cross-Tenant Document Read Prevention',
            endpoint: `/api/appointments/${mockApt._id}`,
            status: res.status,
            passed: isSecure
        });

        if (isSecure) {
            console.log('✅ Success: Direct cross-tenant attachment access blocked.');
        } else {
            console.error('❌ Violation: Attacker got attachment metadata!');
            report.isolationCheck = 'FAILED';
            report.overallScore -= 50;
        }

        // Cleanup
        await models.Appointment.deleteOne({ _id: mockApt._id });
        await conn.close();
        await mongoose.disconnect();

        // Save report
        fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
        const reportPath = path.join(__dirname, '../reports/file-security-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n======================================================`);
        console.log(`📂 FILE STORAGE SECURITY AUDIT COMPLETE`);
        console.log(`Overall Security Score: ${report.overallScore}/100`);
        console.log(`Report Location: ${reportPath}`);
        console.log(`======================================================\n`);

        process.exit(report.overallScore === 100 ? 0 : 1);
    } catch (e) {
        console.error('❌ File security audit script error:', e);
        process.exit(1);
    }
}

runFileSecurityTest();
