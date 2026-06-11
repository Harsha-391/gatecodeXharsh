/**
 * Reset and Seed MongoDB Database Completely
 * 
 * Run: node reset-database.js
 * 
 * This drops the entire active database and generates a massive, realistic,
 * relational dataset for Admit Hospital (mapped to admit.localhost).
 * It populates:
 *   - Services (Hospital clinical & consulting departments)
 *   - default system Roles (Admin, Doctor, Lab, Pharmacy, Reception, Patient)
 *   - Staff accounts (Admin, Receptionist, Lab Tech, Pharmacist)
 *   - 5 clinical Doctor users and their associated Doctor profiles
 *   - 15 realistic Patient accounts (with verified Aadhaar, patientIds, and ClinicPatient records)
 *   - 25+ relational Appointments spread across past, today, and future dates
 *   - 10+ Clinical Intake & Doctor Consult Visits (with BP, pulse, notes, prescriptions)
 *   - 15+ Lab Reports (walk-in and scheduled, pending and completed with mock file URLs)
 *   - 15+ Pharmacy stock inventory batches (with categorizations, costs, and alert statuses)
 *   - 10+ Pharmacy orders (matching completed patient consultations)
 *   - 15+ general Notifications
 */

require('dotenv').config();
const dns = require('dns');

// Configure standard DNS resolvers to prevent ECONNREFUSED issues with Node's c-ares on Windows
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    console.log('🌐 Configured custom DNS resolvers (8.8.8.8, 1.1.1.1) for SRV records.');
} catch (e) {
    console.warn('⚠️ Failed to configure DNS resolvers:', e.message);
}

const mongoose = require('mongoose');
const Role = require('./src/models/role.model');
const User = require('./src/models/user.model');
const Hospital = require('./src/models/hospital.model');
const Doctor = require('./src/models/doctor.model');
const ClinicPatient = require('./src/models/clinicPatient.model');
const Appointment = require('./src/models/appointment.model');
const ClinicalVisit = require('./src/models/clinicalVisit.model');
const LabReport = require('./src/models/labReport.model');
const Inventory = require('./src/models/inventory.model');
const PharmacyOrder = require('./src/models/pharmacyOrder.model');
const Service = require('./src/models/service.model');
const Notification = require('./src/models/notification.model');

const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';

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
        isSystemRole: true
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
        isSystemRole: true
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
        isSystemRole: true
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
        isSystemRole: true
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
        isSystemRole: true
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
        isSystemRole: true
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
        isSystemRole: true
    },
    {
        name: 'Accountant',
        description: 'Hospital Accountant managing detailed operations, finances, staff and resource controls',
        permissions: [
            'administrator_view', 'administrator_manage', 'staff_manage', 'department_manage',
            'patient_monitor', 'admission_manage', 'resource_manage', 'billing_view',
            'reports_view', 'analytics_view', 'operations_manage', 'finance_view'
        ],
        dashboardPath: '/administrator/dashboard',
        navLinks: [
            { label: 'Dashboard', path: '/administrator/dashboard' },
            { label: 'Operations Center', path: '/administrator/operations' },
            { label: 'Patient Flow', path: '/administrator/patient-flow' },
            { label: 'Staff Management', path: '/administrator/staff' },
            { label: 'Doctor Management', path: '/administrator/doctors' },
            { label: 'Departments', path: '/administrator/departments' },
            { label: 'Admissions', path: '/administrator/admissions' },
            { label: 'Bed Management', path: '/administrator/beds' },
            { label: 'Appointments', path: '/administrator/appointments' },
            { label: 'Billing Oversight', path: '/administrator/billing' },
            { label: 'Revenue Monitoring', path: '/administrator/revenue' },
            { label: 'Resource Management', path: '/administrator/resources' },
            { label: 'Inventory Monitoring', path: '/administrator/inventory' },
            { label: 'Reports', path: '/administrator/reports' },
            { label: 'Analytics', path: '/administrator/analytics' },
            { label: 'Audit Logs', path: '/administrator/audit-logs' },
            { label: 'Settings', path: '/administrator/settings' }
        ],
        isSystemRole: true
    }
];

const sampleServices = [
    { id: 'S-101', title: 'General Outpatient Care', description: 'Comprehensive clinical diagnosis, general health evaluation, and wellness check-ups.', icon: '🩺', color: '#14b8a6', price: 400, duration: '20 Mins', category: 'General Medicine', features: ['General Checkup', 'Vitals Assessment', 'Prescription Advice'], active: true },
    { id: 'S-102', title: 'Cardiac Evaluation', description: 'Advanced cardiology assessment including ECG readings, blood pressure diagnostics, and specialized therapies.', icon: '❤️', color: '#ef4444', price: 800, duration: '30 Mins', category: 'Cardiology', features: ['ECG Mapping', 'Cardiac Consulting', 'Hypertension Analysis'], active: true },
    { id: 'S-103', title: 'Gynecology & Fertility Consult', description: 'Specialized fertility consultation, maternal diagnostics, and reproductive health therapies.', icon: '🤰', color: '#ec4899', price: 600, duration: '25 Mins', category: 'Obstetrics & Gynecology', features: ['Fertility Assessment', 'Maternal Diagnostics', 'Ultrasound Review'], active: true },
    { id: 'S-104', title: 'Pediatric Care', description: 'Dedicated pediatric screening, child growth tracking, vaccination planning, and child specialist consults.', icon: '👶', color: '#3b82f6', price: 500, duration: '20 Mins', category: 'Pediatrics', features: ['Growth Milestone Mapping', 'Vaccination Audit', 'Nutrition Plan'], active: true },
    { id: 'S-105', title: 'Orthopedic & Joint Consultation', description: 'Bone and joint care consults, arthritis management, and motor function evaluations.', icon: '🦴', color: '#f59e0b', price: 600, duration: '20 Mins', category: 'Orthopedics', features: ['Bone Density Review', 'Joint Assessment', 'Physiotherapy Advice'], active: true },
    { id: 'S-106', title: 'Dermatological Treatment', description: 'Specialized skin, hair, and cosmetic evaluation, clinical dermatology treatments.', icon: '✨', color: '#8b5cf6', price: 550, duration: '15 Mins', category: 'Dermatology', features: ['Skin Screen', 'Allergy Mapping', 'Cosmetic Counseling'], active: true }
];

const sampleDoctors = [
    { 
        docId: 'DOC-101', 
        name: 'Dr. Rajesh Kumar', 
        email: 'rajesh@crm.com', 
        specialty: 'Cardiology', 
        experience: '15 Years', 
        education: 'MBBS, MD (Cardiology) - AIIMS', 
        phone: '9000100001', 
        consultationFee: 800, 
        image: '👨‍⚕️', 
        bio: 'Senior Cardiologist specializing in interventional cardiology and preventive cardiovascular therapies.',
        firstName: 'Rajesh',
        middleName: '',
        lastName: 'Kumar',
        dob: new Date('1975-08-15'),
        gender: 'Male',
        nationalId: '3344-5566-7788',
        medicalLicense: 'MC-12345',
        specialization: 'Cardiologist',
        qualification: ['MBBS', 'MD', 'DM'],
        experienceYears: 15,
        personalEmail: 'rajesh.kumar@personal.com',
        currentAddress: 'Flat 202, Block A, Shanti Kunj, Noida, UP - 201301',
        emergencyContact: { name: 'Kavita Kumar', relationship: 'Spouse', phone: '9876543210' },
        bloodGroup: 'A+',
        joiningDate: new Date('2018-04-10'),
        employmentType: 'Full-time',
        status: 'Active'
    },
    { 
        docId: 'DOC-102', 
        name: 'Dr. Sarah Jenkins', 
        email: 'sarah@crm.com', 
        specialty: 'Gynecology', 
        experience: '12 Years', 
        education: 'MBBS, DGO, Fellowship in Reproductive Medicine', 
        phone: '9000100002', 
        consultationFee: 600, 
        image: '👩‍⚕️', 
        bio: 'Specialist in reproductive endocrinology, IVF, and comprehensive high-risk maternal healthcare.',
        firstName: 'Sarah',
        middleName: 'Elizabeth',
        lastName: 'Jenkins',
        dob: new Date('1982-03-22'),
        gender: 'Female',
        nationalId: 'A12345678',
        medicalLicense: 'MC-54321',
        specialization: 'Gynecologist',
        qualification: ['MBBS', 'MD', 'DGO'],
        experienceYears: 12,
        personalEmail: 'sarah.j@personal.com',
        currentAddress: 'House 45, Sector 15, Faridabad, Haryana - 121007',
        emergencyContact: { name: 'Mark Jenkins', relationship: 'Spouse', phone: '9988776655' },
        bloodGroup: 'B+',
        joiningDate: new Date('2020-09-01'),
        employmentType: 'Full-time',
        status: 'Active'
    },
    { 
        docId: 'DOC-103', 
        name: 'Dr. Anita Desai', 
        email: 'anita@crm.com', 
        specialty: 'Pediatrics', 
        experience: '10 Years', 
        education: 'MBBS, MD (Pediatrics) - KGMU', 
        phone: '9000100003', 
        consultationFee: 500, 
        image: '👩‍⚕️', 
        bio: 'Compassionate pediatrician focusing on developmental milestones, clinical pediatric care, and early immunizations.',
        firstName: 'Anita',
        middleName: '',
        lastName: 'Desai',
        dob: new Date('1985-11-05'),
        gender: 'Female',
        nationalId: '9988-7766-5544',
        medicalLicense: 'MC-98765',
        specialization: 'Pediatrician',
        qualification: ['MBBS', 'MD'],
        experienceYears: 10,
        personalEmail: 'anita.desai@personal.com',
        currentAddress: 'Flat 604, Royal Palms, Ghaziabad, UP - 201014',
        emergencyContact: { name: 'Suresh Desai', relationship: 'Father', phone: '9123456780' },
        bloodGroup: 'O+',
        joiningDate: new Date('2021-06-15'),
        employmentType: 'Part-time',
        status: 'Active'
    },
    { 
        docId: 'DOC-104', 
        name: 'Dr. David Miller', 
        email: 'david@crm.com', 
        specialty: 'Orthopedics', 
        experience: '18 Years', 
        education: 'MBBS, MS (Orthopedics), M.Ch Ortho', 
        phone: '9000100004', 
        consultationFee: 600, 
        image: '👨‍⚕️', 
        bio: 'Renowned orthopedic surgeon specializing in joint replacement surgeries, trauma management, and sports medicine.',
        firstName: 'David',
        middleName: 'James',
        lastName: 'Miller',
        dob: new Date('1978-05-12'),
        gender: 'Male',
        nationalId: 'B87654321',
        medicalLicense: 'MC-45678',
        specialization: 'Orthopedics',
        qualification: ['MBBS', 'MS', 'FRCS'],
        experienceYears: 18,
        personalEmail: 'david.m@personal.com',
        currentAddress: 'Villa 12, Green Meadows Layout, Bangalore, Karnataka - 560037',
        emergencyContact: { name: 'Emily Miller', relationship: 'Spouse', phone: '9345678901' },
        bloodGroup: 'AB+',
        joiningDate: new Date('2015-02-28'),
        employmentType: 'Visiting Consultant',
        status: 'On leave'
    },
    { 
        docId: 'DOC-105', 
        name: 'Dr. Priya Sharma', 
        email: 'priya@crm.com', 
        specialty: 'Dermatology', 
        experience: '8 Years', 
        education: 'MBBS, DDVL (Dermatology)', 
        phone: '9000100005', 
        consultationFee: 550, 
        image: '👩‍⚕️', 
        bio: 'Consultant dermatologist focused on clinical dermatology, pediatric skin care, and aesthetic procedures.',
        firstName: 'Priya',
        middleName: '',
        lastName: 'Sharma',
        dob: new Date('1988-07-30'),
        gender: 'Female',
        nationalId: '7766-5544-3322',
        medicalLicense: 'MC-87654',
        specialization: 'Dermatologist',
        qualification: ['MBBS', 'MD'],
        experienceYears: 8,
        personalEmail: 'sharma.priya@personal.com',
        currentAddress: 'Apartment 101, Oakwood Residency, Sector 62, Noida, UP - 201309',
        emergencyContact: { name: 'Rohan Sharma', relationship: 'Brother', phone: '9456789012' },
        bloodGroup: 'A-',
        joiningDate: new Date('2022-01-10'),
        employmentType: 'Full-time',
        status: 'Active'
    }
];

const samplePatients = [
    { pId: 'P-101', name: 'Amit Singh', email: 'amit.singh@gmail.com', phone: '9876543210', gender: 'Male', dob: '1985-05-15', bloodGroup: 'O+', address: '12-B, Nehru Place', city: 'Delhi', aadhaar: '223344556677' },
    { pId: 'P-102', name: 'Priya Verma', email: 'priya.verma@yahoo.com', phone: '9876543211', gender: 'Female', dob: '1990-11-23', bloodGroup: 'A+', address: 'Flat 402, Elite Apartments', city: 'Noida', aadhaar: '334455667788' },
    { pId: 'P-103', name: 'Rahul Roy', email: 'rahul.roy@gmail.com', phone: '9876543212', gender: 'Male', dob: '1978-02-09', bloodGroup: 'B+', address: 'Sector 15, Block C', city: 'Gurugram', aadhaar: '445566778899' },
    { pId: 'P-104', name: 'Sneha Gupta', email: 'sneha.g@outlook.com', phone: '9876543213', gender: 'Female', dob: '1995-08-30', bloodGroup: 'AB+', address: 'Pocket-C, Shalimar Bagh', city: 'Delhi', aadhaar: '556677889900' },
    { pId: 'P-105', name: 'Vikram Malhotra', email: 'vikram.m@gmail.com', phone: '9876543214', gender: 'Male', dob: '1982-12-14', bloodGroup: 'O-', address: '45, Golf Links', city: 'Delhi', aadhaar: '667788990011' },
    { pId: 'P-106', name: 'Kiran Patel', email: 'kiran.patel@gmail.com', phone: '9876543215', gender: 'Female', dob: '1967-07-04', bloodGroup: 'B-', address: 'Shyamal Cross Roads', city: 'Ahmedabad', aadhaar: '778899001122' },
    { pId: 'P-107', name: 'Arjun Reddy', email: 'arjun.reddy@gmail.com', phone: '9876543216', gender: 'Male', dob: '1992-04-21', bloodGroup: 'A-', address: 'Jubilee Hills, Lane 4', city: 'Hyderabad', aadhaar: '889900112233' },
    { pId: 'P-108', name: 'Deepa Nair', email: 'deepa.nair@hotmail.com', phone: '9876543217', gender: 'Female', dob: '1988-10-18', bloodGroup: 'AB-', address: 'Kaloor Extension', city: 'Kochi', aadhaar: '990011223344' },
    { pId: 'P-109', name: 'Manish Sharma', email: 'manish.s@gmail.com', phone: '9876543218', gender: 'Male', dob: '1975-01-05', bloodGroup: 'O+', address: 'Adarsh Nagar', city: 'Jaipur', aadhaar: '112233445566' },
    { pId: 'P-110', name: 'Rohan Joshi', email: 'rohan.joshi@gmail.com', phone: '9876543219', gender: 'Male', dob: '1998-09-12', bloodGroup: 'A+', address: 'Kothrud, Lane 2', city: 'Pune', aadhaar: '223344556688' },
    { pId: 'P-111', name: 'Anjali Sen', email: 'anjali.sen@gmail.com', phone: '9876543220', gender: 'Female', dob: '1993-03-27', bloodGroup: 'B+', address: 'Salt Lake, Sector V', city: 'Kolkata', aadhaar: '334455667799' },
    { pId: 'P-112', name: 'Abhishek Mishra', email: 'abhishek.m@gmail.com', phone: '9876543221', gender: 'Male', dob: '1987-06-19', bloodGroup: 'O+', address: 'Hazratganj', city: 'Lucknow', aadhaar: '445566778900' },
    { pId: 'P-113', name: 'Divya Iyer', email: 'divya.iyer@gmail.com', phone: '9876543222', gender: 'Female', dob: '1991-05-02', bloodGroup: 'A+', address: 'Indiranagar, 100ft Rd', city: 'Bengaluru', aadhaar: '556677889011' },
    { pId: 'P-114', name: 'Sanjay Dutt', email: 'sanjay.d@gmail.com', phone: '9876543223', gender: 'Male', dob: '1970-10-15', bloodGroup: 'B+', address: 'Bandra West, Pali Hill', city: 'Mumbai', aadhaar: '667788990122' },
    { pId: 'P-115', name: 'Meera Krishnan', email: 'meera.k@gmail.com', phone: '9876543224', gender: 'Female', dob: '1984-12-08', bloodGroup: 'O+', address: 'Mylapore', city: 'Chennai', aadhaar: '778899001233' }
];

const sampleMedicines = [
    { name: 'Paracetamol 650mg', salt: 'Paracetamol', category: 'Analgesics', stock: 650, unit: 'Tablets', buyingPrice: 10, sellingPrice: 15, vendor: 'Cipla Ltd', batch: 'PR-650-09' },
    { name: 'Amoxicillin 500mg', salt: 'Amoxicillin Trihydrate', category: 'Antibiotics', stock: 400, unit: 'Capsules', buyingPrice: 24, sellingPrice: 38, vendor: 'Abbott Labs', batch: 'AM-500-11' },
    { name: 'Ibuprofen 400mg', salt: 'Ibuprofen', category: 'Analgesics', stock: 120, unit: 'Tablets', buyingPrice: 8, sellingPrice: 12, vendor: 'Sun Pharma', batch: 'IB-400-02' },
    { name: 'Metformin 500mg', salt: 'Metformin Hydrochloride', category: 'Antidiabetics', stock: 720, unit: 'Tablets', buyingPrice: 12, sellingPrice: 20, vendor: 'Lupin Pharma', batch: 'MT-500-05' },
    { name: 'Atorvastatin 10mg', salt: 'Atorvastatin Calcium', category: 'Cardiac', stock: 48, unit: 'Tablets', buyingPrice: 30, sellingPrice: 45, vendor: 'Alkem Labs', batch: 'AT-010-06' }, // Low Stock (< 50)
    { name: 'Omeprazole 20mg', salt: 'Omeprazole Magnesium', category: 'Gastric', stock: 350, unit: 'Capsules', buyingPrice: 15, sellingPrice: 25, vendor: 'Torrent Pharma', batch: 'OM-020-03' },
    { name: 'Cetirizine 10mg', salt: 'Cetirizine Dihydrochloride', category: 'Antiallergics', stock: 0, unit: 'Tablets', buyingPrice: 5, sellingPrice: 8, vendor: 'Dr. Reddys', batch: 'CT-010-08' }, // Out of Stock (0)
    { name: 'Amlodipine 5mg', salt: 'Amlodipine Besylate', category: 'Cardiac', stock: 380, unit: 'Tablets', buyingPrice: 14, sellingPrice: 22, vendor: 'Glenmark', batch: 'AM-005-12' },
    { name: 'Azithromycin 500mg', salt: 'Azithromycin', category: 'Antibiotics', stock: 180, unit: 'Tablets', buyingPrice: 50, sellingPrice: 75, vendor: 'Pfizer India', batch: 'AZ-500-10' },
    { name: 'Pantoprazole 40mg', salt: 'Pantoprazole Sodium', category: 'Gastric', stock: 420, unit: 'Tablets', buyingPrice: 18, sellingPrice: 28, vendor: 'Zydus Cadila', batch: 'PT-040-07' },
    { name: 'Montelukast 10mg', salt: 'Montelukast Sodium', category: 'Antiallergics', stock: 24, unit: 'Tablets', buyingPrice: 22, sellingPrice: 35, vendor: 'Cipla Ltd', batch: 'MT-010-01' }, // Low Stock (< 50)
    { name: 'Losartan 50mg', salt: 'Losartan Potassium', category: 'Cardiac', stock: 290, unit: 'Tablets', buyingPrice: 25, sellingPrice: 40, vendor: 'Sun Pharma', batch: 'LS-050-04' },
    { name: 'Glimepiride 2mg', salt: 'Glimepiride', category: 'Antidiabetics', stock: 190, unit: 'Tablets', buyingPrice: 16, sellingPrice: 28, vendor: 'Lupin Pharma', batch: 'GM-002-15' },
    { name: 'Clopidogrel 75mg', salt: 'Clopidogrel Bisulfate', category: 'Cardiac', stock: 0, unit: 'Tablets', buyingPrice: 35, sellingPrice: 55, vendor: 'Sanofi India', batch: 'CP-075-09' }, // Out of Stock (0)
    { name: 'Amoxicillin + Clavulanate', salt: 'Amoxicillin 500mg + Clavulanic Acid 125mg', category: 'Antibiotics', stock: 210, unit: 'Tablets', buyingPrice: 70, sellingPrice: 110, vendor: 'GSK India', batch: 'AC-625-14' }
];

async function resetAndSeed() {
    try {
        console.log('⏳ Connecting to MongoDB...');
        await mongoose.connect(DB_URI);
        console.log('✅ Connected to MongoDB.');

        // 1. Drop the entire database to wipe all existing data and collections
        console.log('🗑️ Dropping the entire database for a fresh start...');
        await mongoose.connection.db.dropDatabase();
        console.log('✅ Database dropped.');

        // 2. Seed system roles
        console.log('🌱 Seeding fresh system roles...');
        const roleMapping = {};
        for (const roleData of defaultRoles) {
            const created = await Role.create({ ...roleData, hospitalId: null });
            roleMapping[roleData.name] = created._id;
            console.log(`+ Created role: ${roleData.name}`);
        }

        // 3. Create a default hospital (Admit Hospital) for local multi-tenant testing
        console.log('🏥 Seeding default Admit Hospital mapped to admit.localhost...');
        const hospital = new Hospital({
            name: 'Admit Hospital',
            slug: 'admit',
            customDomain: 'admit.localhost',
            isActive: true,
            clinicType: 'hospital',
            appointmentMode: 'slot',
            branding: {
                appName: 'Admit Hospital HMS',
                tagline: 'Delivering Premium Healthcare Services',
                primaryColor: '#14b8a6',
                secondaryColor: '#0a2647',
                accentColor: '#6366f1',
                logoUrl: 'https://www.medicalhms.in/logo/medical365fav.jpg',
                faviconUrl: 'https://www.medicalhms.in/logo/medical365fav.jpg'
            }
        });
        await hospital.save();
        console.log('✅ Default Hospital created: Admit Hospital (admit.localhost)');

        // 4. Seed Services/Departments
        console.log('📦 Seeding medical services & clinical departments...');
        for (const s of sampleServices) {
            await Service.create(s);
        }
        console.log('✅ Seeding services completed.');

        // 5. Create fresh platform managers and staff users
        console.log('👤 Creating fresh platform staff accounts...');
        const adminUser = new User({
            name: 'System Admin',
            email: 'admin@admin.com',
            password: 'admin',
            role: 'superadmin',
            phone: '9999999999',
            services: ['Manage Users', 'System Settings', 'Role Configuration']
        });
        await adminUser.save();
        console.log('✅ Super Admin created: admin@admin.com / admin');

        const receptionUser = new User({
            name: 'Reception Desk Manager',
            email: 'reception@crm.com',
            password: '123',
            role: roleMapping['Receptionist'],
            hospitalId: hospital._id,
            phone: '8888888888',
            services: ['Patient Intake', 'Appointment Booking', 'Shift Handover']
        });
        await receptionUser.save();
        console.log('✅ Receptionist created: reception@crm.com / 123');

        const labTechUser = new User({
            name: 'Laboratory Technician',
            email: 'lab@crm.com',
            password: '123',
            role: roleMapping['Lab Technician'],
            hospitalId: hospital._id,
            phone: '7777777777',
            services: ['Diagnostics', 'Blood Reports', 'Microbiology']
        });
        await labTechUser.save();
        console.log('✅ Lab Tech created: lab@crm.com / 123');

        const pharmacistUser = new User({
            name: 'Lead Pharmacist',
            email: 'pharmacy@crm.com',
            password: '123',
            role: roleMapping['Pharmacist'],
            hospitalId: hospital._id,
            phone: '6666666666',
            services: ['Inventory Audits', 'Prescription Dispensing']
        });
        await pharmacistUser.save();
        console.log('✅ Pharmacist created: pharmacy@crm.com / 123');

        const billingUser = new User({
            name: 'Billing Desk Officer',
            email: 'billing@crm.com',
            password: 'Billing@123',
            role: roleMapping['Billing'],
            hospitalId: hospital._id,
            phone: '5555555555',
            services: ['Central Patient Billing', 'Payment Processing', 'Refund Approvals'],
            isActive: true
        });
        await billingUser.save();
        console.log('✅ Billing User created: billing@crm.com / Billing@123');

        const accountantUser = new User({
            name: 'Finance Accountant',
            email: 'accountant@crm.com',
            password: 'Accountant@123',
            role: roleMapping['Accountant'],
            hospitalId: hospital._id,
            phone: '4444444444',
            services: ['Financial Audits', 'Revenue Operations', 'General Ledger'],
            isActive: true
        });
        await accountantUser.save();
        console.log('✅ Accountant User created: accountant@crm.com / Accountant@123');

        const administratorUser = new User({
            name: 'Hospital Administrator',
            email: 'administrator@crm.com',
            password: '12344321a',
            role: roleMapping['Accountant'],
            hospitalId: hospital._id,
            phone: '3333333333',
            services: ['Operations Management', 'Resource Control', 'Billing Oversight'],
            isActive: true
        });
        await administratorUser.save();
        console.log('✅ Administrator User created: administrator@crm.com / 12344321a');

        // Seed admitadmin@crm.com as Hospital Admin
        const hospitalAdminUser = new User({
            name: 'admin',
            email: 'admitadmin@crm.com',
            password: '12344321a',
            role: roleMapping['Admin'],
            hospitalId: hospital._id,
            phone: '2345654323',
            services: ['Hospital Administration', 'Unit Setup'],
            isActive: true
        });
        await hospitalAdminUser.save();
        console.log('✅ Hospital Admin User created: admitadmin@crm.com / 12344321a');

        // Link hospital admin
        hospital.adminUserId = hospitalAdminUser._id;
        await hospital.save();
        console.log('🔗 Linked Admit Hospital with Admin User.');

        // 6. Seed clinical Doctors & Doctor Profiles
        console.log('🩺 Seeding Doctors and clinical credentials...');
        const doctorUserIds = [];
        const doctorProfileIds = [];
        for (const doc of sampleDoctors) {
            // Create user account
            const userAcc = new User({
                name: doc.name,
                email: doc.email,
                password: '123',
                role: roleMapping['Doctor'],
                hospitalId: hospital._id,
                phone: doc.phone,
                services: [doc.specialty, 'Clinical Consultations']
            });
            await userAcc.save();
            doctorUserIds.push(userAcc._id);

            // Create Doctor profile
            const profile = new Doctor({
                doctorId: doc.docId,
                userId: userAcc._id,
                hospitalId: hospital._id,
                name: doc.name,
                email: doc.email,
                phone: doc.phone,
                specialty: doc.specialization || doc.specialty || '',
                experience: `${doc.experienceYears} Years`,
                education: doc.qualification ? doc.qualification.join(', ') : '',
                bio: doc.bio,
                consultationFee: doc.consultationFee,
                image: doc.image,
                patientsCount: '250+',
                successRate: '98%',
                services: ['Outpatient consulting', 'Follow-up consultations', 'Diagnostics analysis'],
                departments: [doc.specialization || doc.specialty],
                availability: {
                    monday: { available: true, startTime: '09:00', endTime: '17:00' },
                    tuesday: { available: true, startTime: '09:00', endTime: '17:00' },
                    wednesday: { available: true, startTime: '09:00', endTime: '17:00' },
                    thursday: { available: true, startTime: '09:00', endTime: '17:00' },
                    friday: { available: true, startTime: '09:00', endTime: '17:00' },
                    saturday: { available: false, startTime: '10:00', endTime: '13:00' },
                    sunday: { available: false, startTime: '00:00', endTime: '00:00' }
                },
                
                // New Fields
                firstName: doc.firstName,
                middleName: doc.middleName,
                lastName: doc.lastName,
                dob: doc.dob,
                gender: doc.gender,
                nationalId: doc.nationalId,
                medicalLicense: doc.medicalLicense,
                specialization: doc.specialization || doc.specialty || '',
                qualification: doc.qualification,
                experienceYears: doc.experienceYears,
                personalEmail: doc.personalEmail,
                currentAddress: doc.currentAddress,
                emergencyContact: doc.emergencyContact,
                bloodGroup: doc.bloodGroup,
                joiningDate: doc.joiningDate,
                employmentType: doc.employmentType,
                status: doc.status
            });
            await profile.save();
            doctorProfileIds.push(profile);
            console.log(`+ Seeding doctor: ${doc.name} (Specialty: ${doc.specialty})`);
        }

        // 7. Seed Patients (Users & ClinicPatient)
        console.log('👥 Seeding Patients (Users and ClinicPatients)...');
        const patientUserIds = [];
        const clinicPatientIds = [];
        for (const p of samplePatients) {
            // Create user account
            const patientUser = new User({
                name: p.name,
                email: p.email,
                password: '123',
                role: roleMapping['Patient'],
                hospitalId: hospital._id,
                phone: p.phone,
                patientId: p.pId,
                dob: p.dob,
                gender: p.gender,
                bloodGroup: p.bloodGroup,
                address: p.address,
                city: p.city,
                aadhaarNumber: p.aadhaar,
                isAadhaarVerified: true
            });
            await patientUser.save();
            patientUserIds.push(patientUser);

            // Create ClinicPatient representation (important for simple clinic panel integrations)
            const clinicPatient = new ClinicPatient({
                clinicId: hospital._id,
                patientUid: p.pId,
                name: p.name,
                phone: p.phone,
                email: p.email,
                gender: p.gender === 'Male' || p.gender === 'Female' || p.gender === 'Other' ? p.gender : 'Male',
                dob: new Date(p.dob),
                bloodGroup: p.bloodGroup,
                address: p.address,
                isActive: true
            });
            await clinicPatient.save();
            clinicPatientIds.push(clinicPatient);
        }
        console.log(`✅ Seeded ${patientUserIds.length} Patient accounts.`);

        // 8. Seed Pharmacy Medicines (Inventory)
        console.log('💊 Seeding pharmacy medicine batches...');
        const inventoryIds = [];
        for (const m of sampleMedicines) {
            const batch = new Inventory({
                hospitalId: hospital._id,
                name: m.name,
                salt: m.salt,
                category: m.category,
                stock: m.stock,
                unit: m.unit,
                buyingPrice: m.buyingPrice,
                sellingPrice: m.sellingPrice,
                vendor: m.vendor,
                batchNumber: m.batch,
                expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // 1 year expiry
                purchaseDate: new Date()
            });
            await batch.save();
            inventoryIds.push(batch);
        }
        console.log(`✅ Seeded ${inventoryIds.length} Pharmacy Inventory items.`);

        // 9. Seed Appointments & Relational Clinical Visits
        console.log('🗓️ Seeding Appointments and associated Consultation Visits...');
        const appointmentCount = 28;
        const now = new Date();
        const statuses = ['completed', 'confirmed', 'pending', 'cancelled'];
        
        // Let's create specific dates: some past, some today, some future
        const appointmentsData = [];
        const completedAppointments = [];

        for (let i = 0; i < appointmentCount; i++) {
            const patient = patientUserIds[i % patientUserIds.length];
            const clinicPatient = clinicPatientIds[i % clinicPatientIds.length];
            const doctorProfile = doctorProfileIds[i % doctorProfileIds.length];
            const doctorUserAcc = doctorUserIds[i % doctorUserIds.length];
            const service = sampleServices[i % sampleServices.length];
            
            let status = 'confirmed';
            let appDate = new Date();
            let paymentStatus = 'paid';

            if (i < 8) {
                // Past Completed Appointments
                status = 'completed';
                appDate.setDate(now.getDate() - (i + 1));
                paymentStatus = 'paid';
            } else if (i < 16) {
                // Today's Appointments (Confirmed and Pending)
                status = i % 2 === 0 ? 'confirmed' : 'pending';
                appDate.setDate(now.getDate());
                paymentStatus = i % 2 === 0 ? 'paid' : 'pending';
            } else if (i < 24) {
                // Future Appointments
                status = 'confirmed';
                appDate.setDate(now.getDate() + (i - 15));
                paymentStatus = 'pending';
            } else {
                // Cancelled
                status = 'cancelled';
                appDate.setDate(now.getDate() - (i - 20));
                paymentStatus = 'pending';
            }

            const app = new Appointment({
                userId: patient._id,
                patientId: patient.patientId,
                hospitalId: hospital._id,
                doctorId: doctorProfile._id,
                clinicPatientId: clinicPatient._id,
                doctorUserId: doctorUserAcc,
                doctorName: doctorProfile.name,
                serviceId: service.id,
                serviceName: service.title,
                appointmentDate: appDate,
                appointmentTime: `10:${30 + (i * 5) % 30} AM`,
                status: status,
                paymentStatus: paymentStatus,
                paymentMethod: i % 3 === 0 ? 'UPI' : i % 3 === 1 ? 'Card' : 'Cash',
                amount: doctorProfile.consultationFee + service.price,
                notes: 'Patient requested scheduled physical assessment and follow-up reviews.',
                doctorNotes: status === 'completed' ? 'Diagnostics indicate typical health stats. Advice is recorded in prescription list.' : '',
                symptoms: i % 2 === 0 ? 'Migraines, high pulse, low sleep.' : 'Fatigue, standard routine screening.',
                diagnosis: status === 'completed' ? 'Essential Hypertension, minor strain' : '',
                labTests: status === 'completed' && i % 2 === 0 ? ['CBC', 'Lipid Profile'] : []
            });

            await app.save();
            appointmentsData.push(app);

            if (status === 'completed') {
                completedAppointments.push(app);
            }
        }
        console.log(`✅ Seeded ${appointmentsData.length} relational appointments.`);

        // 10. Seed Clinical Visits (Nurse intake & Doctor consult timelines for completed appointments)
        console.log('🩺 Seeding Clinical intake records and Consultation summaries...');
        for (const app of completedAppointments) {
            const visit = new ClinicalVisit({
                patientId: app.userId,
                appointmentId: app._id,
                hospitalId: hospital._id,
                visitDate: app.appointmentDate,
                visitType: 'primary',
                intake: {
                    filledBy: receptionUser._id,
                    timestamp: new Date(app.appointmentDate.getTime() - 1000 * 60 * 20), // 20 mins before consult
                    vitals: {
                        bp: '120/80 mmHg',
                        pulse: '76 bpm',
                        temp: '98.6 °F',
                        weight: '72 kg',
                        bmi: '23.5'
                    },
                    intervalHistory: 'Patient states standard clinical health across the past month, minor allergies observed last week.',
                    chiefComplaint: app.symptoms,
                    completed: true
                },
                doctorConsultation: {
                    doctorId: app.doctorUserId,
                    timestamp: app.appointmentDate,
                    clinicalNotes: 'Diagnosed patient, suggested standard lifestyle adjustments and basic sodium constraints. Formulating pharmacy orders.',
                    diagnosis: ['Essential Hypertension (I10)', 'Muscle Fatigue'],
                    procedureAdvice: 'Refrain from heavy caffeine intake, monitor daily pulse levels.',
                    prescription: [
                        { medicine: 'Amlodipine 5mg', dosage: '1-0-0', duration: '14 Days', instruction: 'Once daily after breakfast' },
                        { medicine: 'Paracetamol 650mg', dosage: '1-0-1', duration: '5 Days', instruction: 'Twice daily post meals if pain persists' }
                    ],
                    labTests: app.labTests
                },
                status: 'completed'
            });

            await visit.save();
            
            // Also seed a relational Pharmacy Order!
            const pharmacyOrder = new PharmacyOrder({
                appointmentId: app._id,
                patientId: app.patientId,
                userId: app.userId,
                doctorId: app.doctorUserId,
                hospitalId: hospital._id,
                items: [
                    { medicineName: 'Amlodipine 5mg', frequency: '1-0-0', duration: '14 Days', price: 22, purchased: true },
                    { medicineName: 'Paracetamol 650mg', frequency: '1-0-1', duration: '5 Days', price: 15, purchased: true }
                ],
                paymentStatus: 'Paid',
                totalAmount: 37,
                totalCost: 24,
                orderStatus: 'Completed'
            });
            await pharmacyOrder.save();
        }
        console.log(`✅ Seeded ${completedAppointments.length} Clinical Intakes, Consultations, and Pharmacy Orders.`);

        // 11. Seed Lab Reports (walk-in and assigned)
        console.log('🔬 Seeding relational Laboratory Diagnostic Reports...');
        const labTestsList = ['CBC', 'Lipid Profile', 'Thyroid Screen', 'Blood Sugar Test', 'Renal Function Test'];
        for (let i = 0; i < 15; i++) {
            const patient = patientUserIds[i % patientUserIds.length];
            const doctorUserAcc = doctorUserIds[i % doctorUserIds.length];
            const isCompleted = i < 10;

            const report = new LabReport({
                patientId: patient.patientId,
                userId: patient._id,
                doctorId: doctorUserAcc,
                hospitalId: hospital._id,
                testNames: [labTestsList[i % labTestsList.length], labTestsList[(i + 1) % labTestsList.length]],
                testStatus: isCompleted ? 'DONE' : 'PENDING',
                reportStatus: isCompleted ? 'UPLOADED' : 'PENDING',
                paymentStatus: i % 2 === 0 ? 'PAID' : 'PENDING',
                paymentMode: i % 2 === 0 ? 'UPI' : 'NONE',
                amount: 450 + (i * 50),
                notes: isCompleted ? 'All laboratory tests run. Blood glucose shows slightly higher boundaries, all other values normal.' : 'Awaiting clinical sample collection.',
                reportFile: isCompleted ? {
                    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                    fileId: `mock-file-${i}`,
                    name: `report_${patient.patientId}_analysis.pdf`,
                    uploadedAt: new Date()
                } : null
            });
            await report.save();
        }
        console.log('✅ Seeding Laboratory Diagnostic Reports completed.');

        // 12. Seed Notifications
        console.log('🔔 Seeding general account Alert Alerts & Notifications...');
        const completedVisits = await ClinicalVisit.find({ hospitalId: hospital._id });
        for (let i = 0; i < completedVisits.length; i++) {
            const visit = completedVisits[i];
            const appointment = appointmentsData.find(a => a._id.toString() === visit.appointmentId.toString());
            
            // Notification from Reception to Doctor
            await Notification.create({
                senderId: receptionUser._id,
                hospitalId: hospital._id,
                recipientRole: 'doctor',
                recipientId: appointment ? appointment.doctorUserId : null,
                message: `Patient ${appointment ? appointment.patientId : 'Walk-in'} checked in, vitals recorded by triage. Ready for consultation.`,
                status: i % 2 === 0 ? 'Read' : 'Unread',
                referenceType: 'ClinicalVisit',
                referenceId: visit._id,
                patientId: appointment ? appointment.patientId : 'WALK-IN'
            });

            // Notification from Doctor to Lab
            if (appointment && appointment.labTests && appointment.labTests.length > 0) {
                const labReport = await LabReport.findOne({ userId: appointment.userId });
                if (labReport) {
                    await Notification.create({
                        senderId: appointment.doctorUserId,
                        hospitalId: hospital._id,
                        recipientRole: 'lab',
                        message: `New lab diagnostics test requested: ${appointment.labTests.join(', ')}. Please perform sample analysis.`,
                        status: 'Read',
                        referenceType: 'LabReport',
                        referenceId: labReport._id,
                        patientId: appointment.patientId
                    });
                }
            }
        }
        console.log('✅ Seeding Alert logs completed.');

        console.log('\n🎉 DATABASE FULLY SEEDED WITH PRODUCTION-QUALITY DEMO DATA!');
        console.log('===========================================================');
        console.log('Demo Staff Logins (Password: "123" for staff unless specified):');
        console.log('  - Super Admin:   admin@admin.com / admin');
        console.log('  - Hosp Admin:    admitadmin@crm.com / 12344321a');
        console.log('  - Accountant:    accountant@crm.com / Accountant@123 (or administrator@crm.com / 12344321a)');
        console.log('  - Receptionist:  reception@crm.com');
        console.log('  - Lab Tech:      lab@crm.com');
        console.log('  - Pharmacist:    pharmacy@crm.com');
        console.log('  - Doctors:       rajesh@crm.com, sarah@crm.com, anita@crm.com,');
        console.log('                   david@crm.com, priya@crm.com');
        console.log('===========================================================');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during database reset:', error);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        process.exit(1);
    }
}

resetAndSeed();
