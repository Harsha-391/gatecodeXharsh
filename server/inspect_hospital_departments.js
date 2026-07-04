require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('./src/models/hospital.model');

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    const hospital = await Hospital.findById('6a3bc2edd348ffdf77b819a3');
    console.log('Hospital Admit departments:', hospital.departments);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

check();
