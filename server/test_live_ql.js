require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('./src/models/hospital.model');
const Clinic = require('./src/models/clinic.model');
const QuestionLibrary = require('./src/models/questionLibrary.model');

async function testQL() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    const hospitalId = '6a3bc2edd348ffdf77b819a3'; // Admit

    const hospital = await Hospital.findById(hospitalId);
    console.log('Hospital departments:', hospital.departments);

    const library = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
    console.log('Latest library found version:', library ? library.version : 'none');
    if (library) {
      console.log('Library data keys (departments):', Object.keys(library.data || {}));
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

testQL();
