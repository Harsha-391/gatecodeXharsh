/**
 * Fix Script: Convert admin@admit.com from 'hospitaladmin' string role
 * to a proper Administrator Role document with full permissions.
 *
 * Run: node server/scripts/fix-admin-role.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set in environment. Check your .env file.');
    process.exit(1);
}

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('../src/models/user.model');
    const Role = require('../src/models/role.model');
    const Hospital = require('../src/models/hospital.model');

    const targetEmail = 'administrator@crm.com';

    // Find or create the user
    let user = await User.findOne({ email: targetEmail });
    if (!user) {
        console.log(`User ${targetEmail} not found. Creating a new one...`);
        // Find hospital
        let hospital = await Hospital.findOne({ slug: 'admit' });
        if (!hospital) {
            hospital = await Hospital.findOne({});
        }
        if (!hospital) {
            console.error('❌ No hospital found in the database. Please seed or create a hospital first.');
            process.exit(1);
        }
        console.log(`Linking user to Hospital: ${hospital.name} (ID: ${hospital._id}, Slug: ${hospital.slug})`);

        user = new User({
            name: 'Hospital Administrator',
            email: targetEmail,
            password: '12344321a',
            hospitalId: hospital._id,
            role: 'hospitaladmin',
            isActive: true
        });
        await user.save();
        console.log(`✅ Created user ${targetEmail} successfully.`);
    } else {
        console.log(`Found existing user: ${user.name} (${user.email}), current role: ${user.role}, hospitalId: ${user.hospitalId}`);
        // Reset password to 12344321a as requested
        user.password = '12344321a';
        // Ensure hospitalId is correct
        let hospital = await Hospital.findOne({ slug: 'admit' });
        if (hospital) {
            user.hospitalId = hospital._id;
        }
        await user.save();
        console.log(`✅ Reset password and updated user ${targetEmail}.`);
    }

    if (!user.hospitalId) {
        console.error('❌ This user has no hospitalId linked. Cannot create a hospital-scoped Administrator role.');
        process.exit(1);
    }

    // Check if an Administrator role already exists for this hospital
    let adminRole = await Role.findOne({
        hospitalId: user.hospitalId,
        name: { $regex: /^Administrator/i }
    });

    if (!adminRole) {
        console.log('Creating new Administrator Role for this hospital...');
        adminRole = new Role({
            name: `Administrator`,
            description: `Hospital Administrator role for ${targetEmail}`,
            permissions: [
                'administrator_view', 'administrator_manage', 'staff_manage', 'department_manage',
                'patient_monitor', 'admission_manage', 'resource_manage', 'billing_view',
                'reports_view', 'analytics_view', 'operations_manage',
                'admin_manage_roles', 'admin_view_stats',
                'lab_view', 'lab_manage', 'pharmacy_view', 'pharmacy_manage',
                'finance_view', 'billing_manage', 'patient_view', 'patient_create', 'patient_search'
            ],
            dashboardPath: '/administrator/dashboard',
            navLinks: [
                { label: 'Dashboard', path: '/administrator/dashboard' },
                { label: 'Patient Flow', path: '/administrator/patient-flow' },
                { label: 'Admissions', path: '/administrator/admissions' },
                { label: 'Bed Management', path: '/administrator/beds' },
                { label: 'Appointments', path: '/administrator/appointments' },
                { label: 'Hospital Operations Center', path: '/administrator/operations' },
                { label: 'Staff Management', path: '/administrator/staff' },
                { label: 'Doctor Management', path: '/administrator/doctors' },
                { label: 'Departments', path: '/administrator/departments' },
                { label: 'Roles & Permissions', path: '/administrator/roles' },
                { label: 'Laboratory Management', path: '/administrator/lab' },
                { label: 'Pharmacy Management', path: '/administrator/pharmacy' },
                { label: 'Billing Oversight', path: '/administrator/billing' },
                { label: 'Revenue Monitoring', path: '/administrator/revenue' },
                { label: 'Inventory Monitoring', path: '/administrator/inventory' },
                { label: 'Resource Management', path: '/administrator/resources' },
                { label: 'Reports', path: '/administrator/reports' },
                { label: 'Analytics', path: '/administrator/analytics' },
                { label: 'Audit Logs', path: '/administrator/audit-logs' },
                { label: 'Notifications', path: '/administrator/notifications' },
                { label: 'Settings', path: '/administrator/settings' },
                { label: 'Profile Settings', path: '/administrator/profile-settings' }
            ],
            hospitalId: user.hospitalId,
            isSystemRole: false
        });
        await adminRole.save();
        console.log(`✅ Created Administrator Role: ${adminRole._id}`);
    } else {
        console.log(`Found existing Administrator Role: ${adminRole._id} (${adminRole.name})`);
    }

    // Update user role to the new ObjectId Role
    user.role = adminRole._id;
    await user.save();

    console.log(`✅ Updated ${targetEmail}: role is now ObjectId → ${adminRole._id} (${adminRole.name})`);
    console.log(`   Dashboard path: ${adminRole.dashboardPath}`);
    console.log(`   Permissions: ${adminRole.permissions.join(', ')}`);
    console.log(`\n🎉 Done! ${targetEmail} can now log in at /login with password 12344321a`);
    console.log(`   They will be redirected to: /administrator/dashboard`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Fix script failed:', err);
    process.exit(1);
});
