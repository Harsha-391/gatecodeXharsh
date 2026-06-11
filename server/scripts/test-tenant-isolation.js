const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');

const { JWT_SECRET } = require('../src/config/jwt');

async function runPenetrationTest() {
    console.log('🛡️ STARTING MULTI-TENANT PENETRATION TEST...');
    const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
    
    try {
        await mongoose.connect(mongoUrl);
        const Hospital = mongoose.model('Hospital', new mongoose.Schema({}, { strict: false }));
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        // 1. Retrieve or create two dummy hospitals & staff users
        let hospitals = await Hospital.find({});
        if (hospitals.length < 1) {
            console.error('❌ Error: Need at least 1 hospital in database.');
            process.exit(1);
        }

        let hospA = hospitals[0];
        let hospB;

        if (hospitals.length < 2) {
            console.log('🌱 Only 1 hospital found. Seeding Hospital B for penetration testing...');
            hospB = new Hospital({
                name: 'Hospital B Penetration Target',
                slug: 'hospital-b-pen-target',
                isActive: true,
                clinicType: 'hospital'
            });
            await hospB.save();
        } else {
            hospB = hospitals[1];
        }

        console.log(`Hospital A: ${hospA._id} (${hospA.name || 'HospA'})`);
        console.log(`Hospital B: ${hospB._id} (${hospB.name || 'HospB'})`);

        // Find or create hospital admin users
        let userA = await User.findOne({ hospitalId: hospA._id, role: 'hospitaladmin' });
        if (!userA) {
            userA = new User({
                name: 'Penetration Tester A',
                email: 'tester.a@hospa.com',
                role: 'hospitaladmin',
                hospitalId: hospA._id,
                isActive: true
            });
            await userA.save();
        }

        let userB = await User.findOne({ hospitalId: hospB._id, role: 'hospitaladmin' });
        if (!userB) {
            userB = new User({
                name: 'Penetration Tester B',
                email: 'tester.b@hospb.com',
                role: 'hospitaladmin',
                hospitalId: hospB._id,
                isActive: true
            });
            await userB.save();
        }

        // 2. Generate token payloads
        const tokenA = jwt.sign(
            { userId: userA._id, email: userA.email, role: 'hospitaladmin', roleId: 'hospitaladmin', hospitalId: String(hospA._id) },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        const tokenB = jwt.sign(
            { userId: userB._id, email: userB.email, role: 'hospitaladmin', roleId: 'hospitaladmin', hospitalId: String(hospB._id) },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Fetch one record from Hospital B's database to attempt accessing using Token A
        const { getTenantModels } = require('../src/db/tenantModels');
        
        const baseUri = mongoUrl.substring(0, mongoUrl.lastIndexOf('/'));
        const connB = await mongoose.createConnection(`${baseUri}/hms_hospital_${hospB._id}?retryWrites=true&w=majority`).asPromise();
        const modelsB = getTenantModels(connB);
        await Promise.all(Object.values(modelsB).map(m => m.ensureIndexes()));
        
        // Let's seed records in Hospital B so we have actual IDs to swap/attack!
        let bPatient = await modelsB.User.findOne({ role: 'patient' });
        if (!bPatient) {
            bPatient = new modelsB.User({
                name: 'Hospital B Secret Patient',
                email: 'secret.patient@hospb.com',
                role: 'patient',
                hospitalId: hospB._id,
                isActive: true
            });
            await bPatient.save();
        }

        let bInvoice = await modelsB.Invoice.findOne({});
        if (!bInvoice) {
            bInvoice = new modelsB.Invoice({
                hospitalId: hospB._id,
                patientId: bPatient._id,
                patientName: bPatient.name,
                invoiceNumber: 'INV-SECRET-B-999',
                grandTotal: 50000,
                outstandingAmount: 50000,
                paymentStatus: 'Pending',
                items: [{ name: 'Super Secret Lab Panel', quantity: 1, unitPrice: 50000, totalAmount: 50000 }]
            });
            await bInvoice.save();
        }

        let bLabReport = await modelsB.LabReport.findOne({});
        if (!bLabReport) {
            bLabReport = new modelsB.LabReport({
                hospitalId: hospB._id,
                patientId: 'PT-SECRET-B',
                userId: bPatient._id,
                testNames: ['HIV Screen', 'Toxicology Scan'],
                testStatus: 'DONE',
                reportStatus: 'PENDING',
                amount: 1500
            });
            await bLabReport.save();
        }
        
        const bPatientId = bPatient._id;
        const bInvoiceId = bInvoice._id;
        const bLabReportId = bLabReport._id;

        await connB.close();

        console.log('Fetched target records from Hospital B for vulnerability testing:');
        console.log(`  - Hosp B Patient ID: ${bPatientId}`);
        console.log(`  - Hosp B Invoice ID: ${bInvoiceId}`);
        console.log(`  - Hosp B Lab Report ID: ${bLabReportId}`);

        const apiClient = axios.create({
            baseURL: 'http://localhost:3000',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenA}`
            },
            validateStatus: () => true
        });

        const report = {
            timestamp: new Date().toISOString(),
            testedEndpoints: [],
            leaksDetected: 0,
            overallScore: 100
        };

        const testEndpoint = async (name, method, url, data = null) => {
            const res = await apiClient({ method, url, data });
            const bodyStr = JSON.stringify(res.data);
            
            // Check if any hospital B IDs are leaked in response body
            const leaked = bodyStr.includes(String(hospB._id)) || 
                           bodyStr.includes(String(bPatientId)) ||
                           bodyStr.includes(String(bInvoiceId)) ||
                           bodyStr.includes(String(bLabReportId)) ||
                           bodyStr.includes('INV-SECRET-B-999') ||
                           bodyStr.includes('Toxicology Scan');
            
            const isBlockedOrEmpty = res.status === 401 || res.status === 403 || res.status === 404 || 
                                     (res.status === 200 && (!res.data.success || !res.data.data || res.data.data.length === 0 || res.data.patients?.length === 0 || res.data.appointments?.length === 0));

            const testResult = {
                endpoint: url,
                method,
                status: res.status,
                leaked,
                result: (!leaked && isBlockedOrEmpty) ? 'PASSED (ISOLATED)' : 'FAILED (DATA LEAK)'
            };

            if (leaked) {
                console.error(`❌ VULNERABILITY DETECTED on ${method} ${url}: Leaked Hospital B data!`);
                report.leaksDetected++;
                report.overallScore -= 20;
            } else {
                console.log(`✅ Success: ${method} ${url} returned isolated/empty/error response. Status: ${res.status}`);
            }

            report.testedEndpoints.push(testResult);
        };

        // Attack 1: Direct patient listing
        await testEndpoint('Patient Listing Access', 'GET', '/api/patients');

        // Attack 2: Direct query param pollution (Hospital A token tries to inject Hospital B ID in query)
        await testEndpoint('Hospital ID Query Parameter Injection', 'GET', `/api/patients?hospitalId=${hospB._id}`);
        await testEndpoint('Invoice Query Parameter Injection', 'GET', `/api/billing?hospitalId=${hospB._id}`);

        // Attack 3: Swap patient ObjectId in request
        await testEndpoint('Direct Object Reference - Patient Swapping', 'GET', `/api/patients/${bPatientId}`);

        // Attack 4: Swap invoice ObjectId in billing routes
        await testEndpoint('Direct Object Reference - Invoice Swapping', 'GET', `/api/billing/invoices/${bInvoiceId}`);

        // Attack 5: Swap lab report ID
        await testEndpoint('Direct Object Reference - Lab Report Swapping', 'GET', `/api/lab/reports/${bLabReportId}`);

        // Attack 6: Get admin audit logs parameter swap
        await testEndpoint('Direct Parameter Swap - Audit Logs', 'GET', `/api/administrator/audit-logs?clinicId=${hospB._id}`);

        // Write report
        fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
        const reportPath = path.join(__dirname, '../reports/tenant-isolation-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n======================================================`);
        console.log(`🚨 MULTI-TENANT PENETRATION TESTING SCORECARD`);
        console.log(`Overall Isolation Score: ${report.overallScore}/100`);
        console.log(`Leaks Detected: ${report.leaksDetected}`);
        console.log(`Report Location: ${reportPath}`);
        console.log(`======================================================\n`);

        await mongoose.disconnect();
        process.exit(report.leaksDetected === 0 ? 0 : 1);
    } catch (e) {
        console.error('❌ Penetration test script error:', e);
        process.exit(1);
    }
}

runPenetrationTest();
