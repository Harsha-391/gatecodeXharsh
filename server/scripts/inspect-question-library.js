// server/scripts/inspect-question-library.js
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/db/db');
const QuestionLibrary = require('../src/models/questionLibrary.model');
const Hospital = require('../src/models/hospital.model');
const Doctor = require('../src/models/doctor.model');

async function run() {
    try {
        await connectDB();
        console.log("Database connected successfully.");
        
        const libraries = await QuestionLibrary.find({});
        console.log(`Found ${libraries.length} libraries.`);
        for (const lib of libraries) {
            console.log("--- LIBRARY ---");
            console.log("ID:", lib._id);
            console.log("Hospital ID:", lib.hospitalId);
            console.log("Version:", lib.version);
            console.log("Data details:", JSON.stringify(lib.data, null, 2));
        }

        const hospitals = await Hospital.find({});
        console.log(`\nFound ${hospitals.length} hospitals.`);
        for (const h of hospitals) {
            console.log(`- Hospital: ${h.name} (${h._id}), Depts:`, h.departments);
        }

        const doctors = await Doctor.find({});
        console.log(`\nFound ${doctors.length} doctors.`);
        for (const d of doctors) {
            console.log(`- Doctor: ${d.name} (${d._id}), Specialty: ${d.specialty}, hospitalId: ${d.hospitalId}`);
        }
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

run();
