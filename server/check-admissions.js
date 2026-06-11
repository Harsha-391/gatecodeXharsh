const mongoose = require('mongoose');

async function run() {
    try {
        const mongoUrl = 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/';
        const conn = await mongoose.createConnection(mongoUrl + 'HSM').asPromise();
        console.log('Connected to master DB successfully');

        const appointmentSchema = new mongoose.Schema({}, { strict: false });
        const Appointment = conn.model('Appointment', appointmentSchema);

        const appointments = await Appointment.find({}).sort({ createdAt: -1 }).limit(10);
        console.log(`Found ${appointments.length} recent appointments in master DB:`);
        appointments.forEach(a => {
            console.log(`- ID: ${a._id}`);
            console.log(`  Patient ID: ${a.patientId}`);
            console.log(`  User ID (userId): ${a.userId}`);
            console.log(`  Doctor: ${a.doctorName}`);
            console.log(`  Status: ${a.status}`);
            console.log(`  recommendAdmission: ${a.recommendAdmission}`);
            console.log(`  Hospital ID: ${a.hospitalId}`);
            console.log('-----------------------------');
        });

        await conn.close();
    } catch (err) {
        console.error(err);
    }
}

run();
