const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');

const { JWT_SECRET } = require('../src/config/jwt');

async function runRbacTest() {
    console.log('🛡️ STARTING ROLE-BASED ACCESS CONTROL (RBAC) AUDIT...');
    const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
    
    try {
        await mongoose.connect(mongoUrl);
        const Hospital = mongoose.model('Hospital', new mongoose.Schema({}, { strict: false }));
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));

        // Fetch a hospital
        const hospital = await Hospital.findOne({});
        if (!hospital) {
            console.error('❌ Error: Need at least 1 hospital in database.');
            process.exit(1);
        }

        // Define roles and standard permissions
        const rolesToTest = [
            { name: 'superadmin', isSystemRole: true, tokenRole: 'superadmin' },
            { name: 'hospitaladmin', isSystemRole: true, tokenRole: 'hospitaladmin' },
            { name: 'doctor', permissions: ['doctor_view', 'doctor_manage'] },
            { name: 'nurse', permissions: ['nurse_view', 'nurse_manage'] },
            { name: 'receptionist', permissions: ['reception_view', 'reception_manage'] },
            { name: 'lab technician', permissions: ['lab_view', 'lab_manage'] },
            { name: 'pharmacist', permissions: ['pharmacy_view', 'pharmacy_manage'] },
            { name: 'accountant', permissions: ['finance_view', 'finance_manage'] }
        ];

        const tokens = {};

        for (const roleDef of rolesToTest) {
            let dbRole = null;
            if (!roleDef.isSystemRole) {
                // Find or create role in database
                dbRole = await Role.findOne({ name: { $regex: new RegExp(`^${roleDef.name}$`, 'i') }, hospitalId: hospital._id });
                if (!dbRole) {
                    dbRole = new Role({
                        name: roleDef.name,
                        permissions: roleDef.permissions,
                        hospitalId: hospital._id,
                        isSystemRole: false
                    });
                    await dbRole.save();
                }
            }

            const roleVal = dbRole ? dbRole._id : roleDef.tokenRole;

            // Find or create user
            const email = `test.${roleDef.name.replace(' ', '_')}@rbac.com`;
            let user = await User.findOne({ email });
            if (!user) {
                user = new User({
                    name: `RBAC ${roleDef.name}`,
                    email,
                    role: roleVal,
                    hospitalId: hospital._id,
                    isActive: true
                });
                await user.save();
            } else {
                user.role = roleVal;
                await user.save();
            }

            // Generate Token
            const token = jwt.sign(
                { userId: user._id, email: user.email, role: roleDef.tokenRole || String(roleVal), roleId: String(roleVal), hospitalId: String(hospital._id) },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            tokens[roleDef.name] = token;
        }

        console.log('✅ Generated JWT tokens for all roles.');

        const report = {
            timestamp: new Date().toISOString(),
            complianceScore: 100,
            rbacViolations: 0,
            testCases: []
        };

        const testAccess = async (roleName, method, url, shouldAllow) => {
            const token = tokens[roleName];
            const res = await axios({
                method,
                url: `http://localhost:3000${url}`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                validateStatus: () => true
            });

            // 403 or 401 means blocked
            const blocked = res.status === 403 || res.status === 401;
            const allowed = !blocked;

            const passed = allowed === shouldAllow;

            report.testCases.push({
                role: roleName,
                endpoint: url,
                method,
                shouldAllow,
                allowed,
                passed
            });

            if (!passed) {
                console.error(`❌ RBAC Violation: Role [${roleName}] got ${allowed ? 'ACCESS' : 'BLOCKED'} on ${method} ${url} (Expected: ${shouldAllow ? 'ALLOW' : 'BLOCK'})`);
                report.rbacViolations++;
                report.complianceScore -= 10;
            } else {
                console.log(`✅ Passed: Role [${roleName}] ${allowed ? 'accessed' : 'was blocked from'} ${method} ${url}`);
            }
        };

        // 1. Receptionist tests
        await testAccess('receptionist', 'GET', '/api/administrator/profit-loss', false);
        await testAccess('receptionist', 'POST', '/api/administrator/expenses', false);
        await testAccess('receptionist', 'GET', '/api/reception/transactions', true);

        // 2. Doctor tests
        await testAccess('doctor', 'GET', '/api/administrator/profit-loss', false);
        await testAccess('doctor', 'POST', '/api/administrator/expenses', false);
        await testAccess('doctor', 'GET', '/api/doctor/appointments', true);

        // 3. Lab Tech tests
        await testAccess('lab technician', 'GET', '/api/administrator/profit-loss', false);
        await testAccess('lab technician', 'GET', '/api/lab/queue', true); // lab list / queue

        // 4. Accountant tests
        await testAccess('accountant', 'GET', '/api/administrator/profit-loss', false); // P&L restricted to administrator
        await testAccess('accountant', 'GET', '/api/finance/revenue-logs', true); // allowed if finance route is open

        // 5. Admin / Superadmin tests
        await testAccess('hospitaladmin', 'GET', '/api/administrator/profit-loss', true);
        await testAccess('superadmin', 'GET', '/api/administrator/profit-loss', true);

        // Write report
        fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
        const reportPath = path.join(__dirname, '../reports/rbac-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n======================================================`);
        console.log(`🛡️ ROLE-BASED ACCESS CONTROL AUDIT COMPLETE`);
        console.log(`Compliance Score: ${report.complianceScore}/100`);
        console.log(`Violations: ${report.rbacViolations}`);
        console.log(`Report Location: ${reportPath}`);
        console.log(`======================================================\n`);

        await mongoose.disconnect();
        process.exit(report.rbacViolations === 0 ? 0 : 1);
    } catch (e) {
        console.error('❌ RBAC test script error:', e);
        process.exit(1);
    }
}

runRbacTest();
