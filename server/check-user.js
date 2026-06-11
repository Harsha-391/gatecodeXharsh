const mongoose = require('mongoose');

async function run() {
    try {
        const mongoUrl = 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
        await mongoose.connect(mongoUrl);
        console.log('Connected to Master DB successfully');

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        const user = await User.findById('6a1d567f592d0fcc3180c5d4').lean();
        console.log('User found in Master DB:', user);

        const Appointment = mongoose.model('Appointment', new mongoose.Schema({}, { strict: false }));
        const apt = await Appointment.findById('6a1d5680592d0fcc3180c5f1').lean();
        console.log('Appointment found in Master DB:', apt);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
