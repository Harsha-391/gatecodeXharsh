require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('./server/src/models/hospital.model');
const Clinic = require('./server/src/models/clinic.model');

async function inspect() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    const hospitals = await Hospital.find({});
    console.log(`\nHOSPITALS IN DB (${hospitals.length}):`);
    hospitals.forEach(h => {
      console.log(`- ID: ${h._id}, Name: "${h.name}", Slug: "${h.slug}", ClinicType: "${h.clinicType}", TenantKey: "${h.tenantKey}"`);
    });

    const clinics = await Clinic.find({});
    console.log(`\nCLINICS IN DB (${clinics.length}):`);
    clinics.forEach(c => {
      console.log(`- ID: ${c._id}, Name: "${c.name}", Slug: "${c.slug}", ClinicType: "${c.clinicType}", TenantKey: "${c.tenantKey}"`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

inspect();
