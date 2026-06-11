const mongoose = require('mongoose');
const Doctor = require('./src/models/doctor.model');

async function checkDoctors() {
  try {
    await mongoose.connect('mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM');
    console.log('Connected to MongoDB');

    const doctors = await Doctor.find({});
    console.log(`Found ${doctors.length} doctors:`);
    doctors.forEach(doc => {
      console.log(`\n- Doctor ID: ${doc.doctorId}`);
      console.log(`  Created At: ${doc.createdAt}`);
      console.log(`  Name: ${doc.name}`);
      console.log(`  Email: ${doc.email}`);
      console.log(`  First: ${doc.firstName}, Mid: ${doc.middleName}, Last: ${doc.lastName}`);
      console.log(`  DOB: ${doc.dob}, Gender: ${doc.gender}, BG: ${doc.bloodGroup}`);
      console.log(`  Aadhaar: ${doc.nationalId}, License: ${doc.medicalLicense}`);
      console.log(`  Specialization: ${doc.specialization}`);
      console.log(`  Qualifications: ${JSON.stringify(doc.qualification)}`);
      console.log(`  Experience (Years): ${doc.experienceYears}`);
      console.log(`  Current Address: ${doc.currentAddress}`);
      console.log(`  Emergency Contact: ${JSON.stringify(doc.emergencyContact)}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error querying database:', error);
  }
}

checkDoctors();
