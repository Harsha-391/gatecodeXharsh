// server/scripts/remove-gynecology-library.js
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/db/db');
const QuestionLibrary = require('../src/models/questionLibrary.model');

async function run() {
    try {
        await connectDB();
        console.log("Database connected successfully.");
        
        const libraries = await QuestionLibrary.find({ hospitalId: '6a268cd35b9fa6ff40126098' });
        console.log(`Found ${libraries.length} libraries for Admit Hospital.`);
        
        for (const lib of libraries) {
            console.log(`Updating Library ID: ${lib._id}, Version: ${lib.version}`);
            if (lib.data && lib.data.Gynecology) {
                delete lib.data.Gynecology;
                lib.markModified('data');
                await lib.save();
                console.log(`✅ Removed Gynecology from library version ${lib.version}`);
            } else {
                console.log(`ℹ️ No Gynecology key found in version ${lib.version}`);
            }
        }
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

run();
