require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('./src/models/hospital.model');

const MONGO_URI = process.env.MONGODB_URL;
if (!MONGO_URI) {
    console.error('❌ MONGODB_URL is not defined in environment variables.');
    process.exit(1);
}

async function main() {
    try {
        console.log('Connecting to master MongoDB...');
        await mongoose.connect(MONGO_URI);

        const hospital = await Hospital.findOne({});
        if (!hospital) {
            console.error('No hospital found!');
            return;
        }

        console.log(`Hospital: ${hospital.name} (ID: ${hospital._id})`);
        
        // Let's add a test facility and attempt to save
        const newFacilities = [...(hospital.facilities || []), { name: `Test ${Date.now()}`, pricePerDay: 500 }];
        hospital.facilities = newFacilities;
        
        console.log('Saving hospital with new facilities...');
        await hospital.save();
        console.log('Hospital saved successfully with new facilities!');
        
    } catch (err) {
        console.error('Update failed with error:');
        console.error(err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

main();
