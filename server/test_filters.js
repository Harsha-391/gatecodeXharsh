require('dotenv').config();
const mongoose = require('mongoose');

async function testFilter() {
    try {
        const mongoUrl = process.env.MONGODB_URL;
        if (!mongoUrl) {
            console.error('❌ MONGODB_URL is not defined in environment variables.');
            process.exit(1);
        }
        await mongoose.connect(mongoUrl);
        const Hospital = require('./src/models/hospital.model');
        const Appointment = require('./src/models/appointment.model');
        const Doctor = require('./src/models/doctor.model');
        const hospital = await Hospital.findOne({});
        console.log("Hospital", hospital._id, hospital.name);

        const doctorIds = await Doctor.find({ hospitalId: hospital._id }).select('_id doctorId');
        const doctorObjectIds = doctorIds.map(d => d._id);
        console.log("Doctors mapping to this hospital", doctorObjectIds);

        const allAppointments = await Appointment.find({ doctorId: { $in: doctorObjectIds } });
        console.log("Total Appointments ever:", allAppointments.length);
        if (allAppointments.length > 0) {
            console.log("Sample appointment date:", allAppointments[0].appointmentDate);
        }

        const now = new Date();
        const startD = new Date();
        startD.setDate(startD.getDate() - 30);

        console.log("Between", startD, "and", now);

        const count = await Appointment.countDocuments({
            doctorId: { $in: doctorObjectIds },
            appointmentDate: { $gte: startD, $lte: now }
        });
        console.log("Appointments in last 30 days:", count);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
testFilter();
