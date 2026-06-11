/**
 * Standalone Idempotent Seeder / Migration Script
 * 
 * Run: node seed-doctor-personal-info.js
 * 
 * This updates all existing doctor profiles in the database with rich, realistic
 * personal information details (firstName, lastName, DOB, Medical License, bloodGroup,
 * Emergency Contact, address, employmentType, etc.) for testing/demo purposes.
 * It is fully idempotent and safe to run multiple times.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Doctor = require('./src/models/doctor.model');
const User = require('./src/models/user.model');

const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';

const mockDoctorsData = {
    'dr. rajesh kumar': {
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
    'dr. sarah jenkins': {
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
    'dr. anita desai': {
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
    'dr. david miller': {
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
    'dr. priya sharma': {
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
};

async function seedDoctorPersonalInfo() {
    try {
        console.log('⏳ Connecting to MongoDB...');
        await mongoose.connect(DB_URI);
        console.log('✅ Connected to MongoDB.');

        const doctors = await Doctor.find({});
        console.log(`🩺 Found ${doctors.length} Doctor profiles in the database.`);

        let updatedCount = 0;
        for (const doctor of doctors) {
            const cleanDocName = doctor.name.trim().toLowerCase().replace(/^dr\.?\s+/, '');
            
            // Search in mockDoctorsData by stripping "dr." from keys too!
            let mockData = null;
            for (const key of Object.keys(mockDoctorsData)) {
                const cleanKey = key.replace(/^dr\.?\s+/, '');
                if (cleanDocName === cleanKey || cleanDocName.includes(cleanKey) || cleanKey.includes(cleanDocName)) {
                    mockData = mockDoctorsData[key];
                    console.log(`🎯 Matched database doctor "${doctor.name}" with mock data key "${key}".`);
                    break;
                }
            }

            // If it's a custom doctor not in our pre-seeded mapping, generate beautiful default data
            if (!mockData) {
                console.log(`ℹ️ Custom doctor found: "${doctor.name}". Generating realistic details...`);
                const nameParts = doctor.name.split(' ');
                let fName = nameParts[0] || 'Doctor';
                let mName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';
                let lName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'MD';

                // Ensure we strip "Dr." prefix for firstName
                if (fName.toLowerCase() === 'dr.' || fName.toLowerCase() === 'dr') {
                    fName = nameParts[1] || 'Doctor';
                    mName = nameParts.length > 3 ? nameParts.slice(2, -1).join(' ') : '';
                    lName = nameParts.length > 2 ? nameParts[nameParts.length - 1] : 'MD';
                }

                const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
                const employmentTypes = ['Full-time', 'Part-time', 'Visiting Consultant'];
                const statuses = ['Active', 'Inactive', 'On leave'];
                
                // Dynamically guess gender
                const isFemale = /anita|priya|sarah|female|she|her/i.test(doctor.name);
                const gender = isFemale ? 'Female' : 'Male';
                const relationship = isFemale ? 'Husband' : 'Spouse';

                // Random 10-digit emergency phone
                const randEmergencyPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
                // Random Aadhaar
                const randAadhaar = Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(1000 + Math.random() * 9000);

                mockData = {
                    firstName: fName,
                    middleName: mName,
                    lastName: lName,
                    dob: new Date('1980-01-01'),
                    gender: gender,
                    nationalId: randAadhaar,
                    medicalLicense: 'MC-' + Math.floor(10000 + Math.random() * 90000),
                    specialization: doctor.specialty || 'General Physician',
                    qualification: doctor.education ? doctor.education.split(',').map(e => e.trim()).filter(Boolean) : ['MBBS', 'MD'],
                    experienceYears: parseInt(doctor.experience, 10) || 5,
                    personalEmail: `${fName.toLowerCase()}.${lName.toLowerCase()}@personal-hms.com`,
                    currentAddress: `Flat ${Math.floor(100 + Math.random() * 900)}, Block ${String.fromCharCode(65 + Math.floor(Math.random() * 6))}, AIIMS Road, New Delhi - 110029`,
                    emergencyContact: { name: `Emergency Contact for Dr. ${lName}`, relationship: relationship, phone: randEmergencyPhone },
                    bloodGroup: bloodGroups[Math.floor(Math.random() * bloodGroups.length)],
                    joiningDate: new Date('2022-06-01'),
                    employmentType: employmentTypes[Math.floor(Math.random() * employmentTypes.length)],
                    status: statuses[Math.floor(Math.random() * statuses.length)]
                };
            }

            // Apply updates
            doctor.firstName = mockData.firstName;
            doctor.middleName = mockData.middleName;
            doctor.lastName = mockData.lastName;
            doctor.dob = mockData.dob;
            doctor.gender = mockData.gender;
            doctor.nationalId = mockData.nationalId;
            doctor.medicalLicense = mockData.medicalLicense;
            doctor.specialization = mockData.specialization;
            doctor.qualification = mockData.qualification;
            doctor.experienceYears = mockData.experienceYears;
            doctor.personalEmail = mockData.personalEmail;
            doctor.currentAddress = mockData.currentAddress;
            doctor.emergencyContact = mockData.emergencyContact;
            doctor.bloodGroup = mockData.bloodGroup;
            doctor.joiningDate = mockData.joiningDate;
            doctor.employmentType = mockData.employmentType;
            doctor.status = mockData.status;

            // Also keep standard fields synced to ensure clean backwards compatibility
            doctor.name = [mockData.firstName, mockData.middleName, mockData.lastName].filter(Boolean).join(' ');
            doctor.specialty = mockData.specialization;
            doctor.experience = `${mockData.experienceYears} Years`;
            doctor.education = mockData.qualification.join(', ');

            await doctor.save();

            // Sync User account name if exists
            if (doctor.userId) {
                const user = await User.findById(doctor.userId);
                if (user) {
                    user.name = doctor.name;
                    await user.save();
                }
            }

            console.log(`✅ Updated: ${doctor.name} (${doctor.specialty})`);
            updatedCount++;
        }

        console.log(`\n🎉 SUCCESS! Fully updated ${updatedCount} Doctor profiles with personal info dummy data.`);
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding doctor personal details:', error);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        process.exit(1);
    }
}

seedDoctorPersonalInfo();
