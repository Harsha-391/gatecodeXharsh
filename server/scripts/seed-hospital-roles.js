/**
				 * seed-hospital-roles.js — Database migration script
				 *
				 * Seeds and synchronizes the 9 default roles (Admin, Doctor, Lab Technician, Pharmacist,
				 * Receptionist, Patient, Accountant, Billing, Administrator) for all hospitals in the system.
				 */

require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('../src/models/hospital.model');
const Role = require('../src/models/role.model');
const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels } = require('../src/db/tenantModels');
const { syncToTenant } = require('../src/utils/tenantSync');

const defaultRoles = [
    {
        name: 'Admin',
        description: 'Hospital superadmin with full management access',
        permissions: [
            'admin_manage_roles', 'admin_view_stats',
            'patient_search', 'patient_view', 'patient_edit',
            'visit_intake', 'clinical_history_view'
        ],
        dashboardPath: '/admin',
        navLinks: [
            { label: 'Dashboard', path: '/admin' },
            { label: 'Users', path: '/admin/users' },
            { label: 'Doctors', path: '/admin/doctors' },
            { label: 'Labs', path: '/admin/labs' },
            { label: 'Pharmacy', path: '/admin/pharmacy' },
            { label: 'Reception', path: '/admin/reception' },
            { label: 'Services', path: '/admin/services' },
            { label: 'Roles', path: '/admin/roles' }
        ],
        isSystemRole: false
    },
    {
        name: 'Doctor',
        description: 'Medical doctor with clinical access',
        permissions: [
            'visit_diagnose', 'patient_view', 'clinical_history_view',
            'lab_view', 'pharmacy_view'
        ],
        dashboardPath: '/doctor/patients',
        navLinks: [
            { label: 'Patients', path: '/doctor/patients' }
        ],
        isSystemRole: false
    },
    {
        name: 'Lab Technician',
        description: 'Laboratory staff managing tests and reports',
        permissions: [
            'lab_view', 'lab_manage', 'patient_view'
        ],
        dashboardPath: '/lab/dashboard',
        navLinks: [
            { label: 'Dashboard', path: '/lab/dashboard' }
        ],
        isSystemRole: false
    },
    {
        name: 'Pharmacist',
        description: 'Pharmacy staff managing inventory and orders',
        permissions: [
            'pharmacy_view', 'pharmacy_manage', 'patient_view'
        ],
        dashboardPath: '/pharmacy/inventory',
        navLinks: [
            { label: 'Inventory', path: '/pharmacy/inventory' },
            { label: 'Orders', path: '/pharmacy/orders' }
        ],
        isSystemRole: false
    },
    {
        name: 'Receptionist',
        description: 'Front desk staff managing appointments and patient registration',
        permissions: [
            'appointment_manage', 'appointment_view_all',
            'patient_search', 'patient_create', 'patient_view',
            'visit_intake'
        ],
        dashboardPath: '/reception/dashboard',
        navLinks: [
            { label: 'Dashboard', path: '/reception/dashboard' }
        ],
        isSystemRole: false
    },
    {
        name: 'Patient',
        description: 'Default role for patients/users',
        permissions: [
            'patient_view'
        ],
        dashboardPath: '/dashboard',
        navLinks: [
            { label: 'Services', path: '/services' },
            { label: 'Doctors', path: '/doctors' },
            { label: 'Appointment', path: '/appointment' },
            { label: 'Lab Reports', path: '/lab-reports' },
            { label: 'Dashboard', path: '/dashboard' }
        ],
        isSystemRole: false
    },
    {
        name: 'Accountant',
        description: 'Finance and accounting staff',
        permissions: [
            'finance_view', 'billing_view', 'billing_manage',
            'patient_view', 'patient_search'
        ],
        dashboardPath: '/accountant/dashboard',
        navLinks: [
            { label: 'Finance Dashboard', path: '/accountant/dashboard' },
            { label: 'Patient Billing', path: '/cashier/billing' }
        ],
        isSystemRole: false
    },
    {
        name: 'Billing',
        description: 'Dedicated patient billing and financial operations staff',
        permissions: [
            'billing_view', 'billing_manage', 'billing_collect_payment',
            'billing_generate_invoice', 'billing_print_invoice', 'billing_refund',
            'billing_reports', 'billing_analytics'
        ],
        dashboardPath: '/billing/dashboard',
        navLinks: [
            { label: 'Dashboard', path: '/billing/dashboard' },
            { label: 'Patient Billing', path: '/billing/patient' },
            { label: 'Pending Payments', path: '/billing/pending' },
            { label: 'Invoices', path: '/billing/invoices' },
            { label: 'Payment Collection', path: '/billing/collect' },
            { label: 'Payment History', path: '/billing/history' },
            { label: 'Refunds', path: '/billing/refunds' },
            { label: 'Revenue Reports', path: '/billing/reports' },
            { label: 'Billing Analytics', path: '/billing/analytics' },
            { label: 'Invoice Templates', path: '/billing/templates' },
            { label: 'Settings', path: '/billing/settings' }
        ],
        isSystemRole: false
    },
    {
        name: 'Administrator',
        description: 'Hospital administrator managing operations, staff, resources and billing oversight',
        permissions: [
            'administrator_view', 'administrator_manage', 'staff_manage', 'department_manage',
            'patient_monitor', 'admission_manage', 'resource_manage', 'billing_view',
            'reports_view', 'analytics_view', 'operations_manage', 'inventory_view'
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
        isSystemRole: false
    }
];

async function seedDefaultRolesForHospital(hospitalId) {
    for (const roleData of defaultRoles) {
        let role = await Role.findOne({ name: roleData.name, hospitalId });
        if (!role) {
            role = await Role.create({
                ...roleData,
                hospitalId,
                isSystemRole: false
            });
            console.log(`  [Master DB] Created default role: "${roleData.name}"`);
        } else {
            console.log(`  [Master DB] Role "${roleData.name}" already exists`);
        }
        // Sync to tenant DB
        await syncToTenant('Role', role, 'save', hospitalId);
    }
}

async function run() {
    try {
        const DB_URI = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
        console.log('Connecting to Master MongoDB...');
        await mongoose.connect(DB_URI);
        console.log('Connected to Master DB successfully!');

        const hospitals = await Hospital.find({});
        console.log(`Found ${hospitals.length} hospitals. Starting roles sync...\n`);

        for (const hosp of hospitals) {
            console.log(`🏥 Processing hospital: "${hosp.name}" (ID: ${hosp._id})`);
            await seedDefaultRolesForHospital(hosp._id);
            console.log(`✅ Roles seeded and synced successfully for hospital: "${hosp.name}"\n`);
        }

        console.log('🎉 Seeding and synchronization migration complete!');
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed with error:', err);
        process.exit(1);
    }
}

run();
