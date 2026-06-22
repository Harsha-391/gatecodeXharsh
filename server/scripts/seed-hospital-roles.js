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
            'visit_diagnose', 'patient_view', 'clinical_history_view'
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
            'patient_view', 'patient_search',
            'finance_outstanding', 'finance_claims', 'finance_reception_collections', 'finance_expenses', 'finance_profit_loss',
            'finance_statements', 'finance_reconciliation', 'finance_transactions', 'finance_audit',
            'finance_payroll', 'finance_doctor_payouts', 'billing_reports', 'billing_analytics'
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
            'billing_reports', 'billing_analytics',
            'billing_insurance', 'billing_ipd_settlement', 'billing_receipt_reprint', 'billing_discounts'
        ],
        dashboardPath: '/billing/dashboard',
        navLinks: [
            { label: 'Dashboard', path: '/billing/dashboard' },
            { label: 'Patient Billing', path: '/billing/patient' },
            { label: 'Pending Payments', path: '/billing/pending' },
            { label: 'Invoices', path: '/billing/invoices' },
            { label: 'Payment History', path: '/billing/history' },
            { label: 'Refunds', path: '/billing/refunds' },
            { label: 'Revenue Reports', path: '/billing/reports' },
            { label: 'Billing Analytics', path: '/billing/analytics' },
            { label: 'Invoice Templates', path: '/billing/templates' },
            { label: 'Settings', path: '/billing/settings' }
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
            role.permissions = roleData.permissions;
            role.description = roleData.description;
            role.navLinks = roleData.navLinks;
            await role.save();
            console.log(`  [Master DB] Updated existing role: "${roleData.name}" permissions`);
        }
        // Sync to tenant DB
        await syncToTenant('Role', role, 'save', hospitalId);
    }
}

async function run() {
    try {
        const DB_URI = process.env.MONGODB_URL || process.env.MONGODB_URL;
        console.log('Connecting to Master MongoDB...');
        await mongoose.connect(DB_URI);
        console.log('Connected to Master DB successfully!');

        const hospitals = await Hospital.find({});
        console.log(`Found ${hospitals.length} hospitals. Starting roles sync...\n`);

        console.log('🌍 Synchronizing global system roles...');
        await seedDefaultRolesForHospital(null);
        console.log('✅ Global system roles updated successfully!\n');

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
