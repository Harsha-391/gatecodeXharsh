require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URL;
  console.log('Connecting to database...');
  await mongoose.connect(mongoUrl);
  console.log('Connected to Master DB.');

  // 1. Fetch Patients from Master DB (users collection)
  const masterPatients = await mongoose.connection.db
    .collection('users')
    .find({ role: { $in: ['patient', 'Patient'] } })
    .toArray();

  console.log(`\n================ MASTER DB PATIENT ACCOUNTS (${masterPatients.length}) ================`);
  masterPatients.forEach(p => {
    console.log(`- Patient Name:   ${p.name}`);
    console.log(`  Patient ID/MRN: ${p.patientId || 'N/A'}`);
    console.log(`  Phone:          ${p.phone || 'N/A'}`);
    console.log(`  Email:          ${p.email || 'N/A'}`);
    console.log(`  Blood Group:    ${p.bloodGroup || 'N/A'}`);
    console.log(`  Aadhaar No:     ${p.aadhaarNumber || 'N/A'}`);
    console.log(`  Registered At:  ${p.createdAt || 'N/A'}`);
    console.log('--------------------------------------------------');
  });

  // 2. Fetch Patients from Master DB (clinicpatients collection)
  const clinicPatients = await mongoose.connection.db
    .collection('clinicpatients')
    .find({})
    .toArray();

  console.log(`\n================ CLINIC PATIENTS RECORDS (${clinicPatients.length}) ================`);
  clinicPatients.forEach(p => {
    console.log(`- Patient Name:   ${p.name}`);
    console.log(`  Patient UID:    ${p.patientUid || 'N/A'}`);
    console.log(`  Phone:          ${p.phone || 'N/A'}`);
    console.log(`  Address:        ${p.address || 'N/A'}`);
    console.log(`  Allergies:      ${p.allergies || 'None'}`);
    console.log(`  Chronic Cond:   ${p.chronicConditions || 'None'}`);
    console.log(`  Medical Notes:  ${p.medicalNotes || 'None'}`);
    console.log('--------------------------------------------------');
  });

  // 3. Fetch Patients from Tenant DB (users collection)
  const hospital = await mongoose.connection.db.collection('hospitals').findOne({});
  if (hospital) {
    const tenantDbName = `hms_hospital_${hospital._id.toString()}`;
    console.log(`\nConnecting to Tenant DB: ${tenantDbName}...`);
    const tenantConn = mongoose.createConnection(`${mongoUrl.substring(0, mongoUrl.lastIndexOf('/'))}/${tenantDbName}`);
    await new Promise(r => tenantConn.once('open', r));

    const tenantPatients = await tenantConn.db
      .collection('users')
      .find({ role: { $in: ['patient', 'Patient'] } })
      .toArray();

    console.log(`\n================ TENANT DB PATIENT ACCOUNTS (${tenantPatients.length}) ================`);
    tenantPatients.forEach(p => {
      console.log(`- Patient Name:   ${p.name}`);
      console.log(`  Patient ID/MRN: ${p.patientId || 'N/A'}`);
      console.log(`  Phone:          ${p.phone || 'N/A'}`);
      console.log(`  Email:          ${p.email || 'N/A'}`);
      console.log(`  Sync Status:    Synced in Tenant`);
      console.log('--------------------------------------------------');
    });

    await tenantConn.close();
  }

  await mongoose.disconnect();
  console.log('\nFinished dumping patient data.');
}

main().catch(console.error);
