const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Hospital = require('./src/models/hospital.model');
const Role = require('./src/models/role.model');

async function checkUsers() {
  try {
    await mongoose.connect('mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM');
    console.log('Connected to MongoDB');

    const hospitals = await Hospital.find({});
    console.log(`\nHospitals found: ${hospitals.length}`);
    hospitals.forEach(h => {
      console.log(`- ${h.name} (_id: ${h._id}, slug: ${h.slug}, customDomain: ${h.customDomain})`);
    });

    const roles = await Role.find({});
    console.log(`\nRoles found: ${roles.length}`);
    roles.forEach(r => {
      console.log(`- ${r.name} (_id: ${r._id})`);
    });

    const users = await User.find({});
    console.log(`\nTotal Users found: ${users.length}`);
    users.forEach(u => {
      console.log(`\n- Name: ${u.name}`);
      console.log(`  Email: ${u.email}`);
      console.log(`  Role: ${u.role}`);
      console.log(`  HospitalId: ${u.hospitalId}`);
      console.log(`  IsActive: ${u.isActive}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error querying database:', error);
  }
}

checkUsers();
