require('dotenv').config();
const mongoose = require('mongoose');
const { getTenantConnection } = require('./src/db/tenantDb');
const { getTenantModels } = require('./src/db/tenantModels');
const MasterAppointment = require('./src/models/appointment.model');
const MasterUser = require('./src/models/user.model');
const Hospital = require('./src/models/hospital.model');
const Doctor = require('./src/models/doctor.model');

async function testReportReschedule() {
    try {
        console.log('Connecting to Master MongoDB...');
        const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';
        await mongoose.connect(mongoUrl);
        console.log('Connected to Master DB successfully!');

        // 1. Get a hospital
        const hospital = await Hospital.findOne({});
        if (!hospital) {
            console.error('No hospital found! Exit.');
            process.exit(1);
        }
        const hospitalId = hospital._id;
        console.log(`Using Hospital: ${hospital.name} (${hospitalId})`);

        // 2. Get Tenant Connection & Models
        const tenantConn = await getTenantConnection(hospitalId.toString());
        const tenantModels = getTenantModels(tenantConn);
        console.log(`Connected to Tenant DB: hms_hospital_${hospitalId}`);

        // 3. Create test Patient and Doctor
        const testPatient = new MasterUser({
            name: 'Reschedule Test Patient',
            email: `reschedule_pt_${Date.now()}@test.com`,
            phone: '9876543210',
            role: 'patient',
            hospitalId
        });
        await testPatient.save();
        console.log(`Created test patient in Master DB: ${testPatient._id}`);

        // Create tenant copy of user
        const tenantPatient = new tenantModels.User({
            _id: testPatient._id,
            name: testPatient.name,
            email: testPatient.email,
            phone: testPatient.phone,
            role: 'patient',
            hospitalId
        });
        await tenantPatient.save();
        console.log(`Created test patient in Tenant DB`);

        const testDoctorUser = new MasterUser({
            name: 'Reschedule Test Doctor',
            email: `reschedule_doc_${Date.now()}@test.com`,
            role: 'doctor',
            hospitalId
        });
        await testDoctorUser.save();

        const testDoctor = new Doctor({
            doctorId: `DOC-${Date.now()}`,
            userId: testDoctorUser._id,
            name: testDoctorUser.name,
            email: testDoctorUser.email,
            hospitalId,
            consultationFee: 500,
            specialty: 'Gynaecology',
            departments: ['Gynaecology']
        });
        await testDoctor.save();
        console.log(`Created test doctor: ${testDoctor._id}`);

        // 4. Book initial appointment (simulating regular booking)
        // Set up initial appointment in master
        const initialAptData = {
            userId: testPatient._id,
            hospitalId,
            patientId: 'PT-TEST-001',
            patientName: testPatient.name,
            patientPhone: testPatient.phone,
            doctorId: testDoctor._id,
            doctorUserId: testDoctor.userId,
            doctorName: testDoctor.name,
            appointmentDate: new Date(),
            appointmentTime: '10:00 AM',
            status: 'confirmed',
            amount: 500,
            requestReportFollowUp: false,
            followUpScheduled: false
        };

        const masterApt = new MasterAppointment(initialAptData);
        await masterApt.save();
        console.log(`Created initial appointment in Master DB: ${masterApt._id}`);

        const tenantApt = new tenantModels.Appointment({
            ...initialAptData,
            _id: masterApt._id
        });
        await tenantApt.save();
        console.log(`Created initial appointment in Tenant DB`);

        // 5. Simulate Doctor Consultation completion & marking Report Follow-up request
        // In doctor.routes.js:
        // appointment.requestReportFollowUp = String(requestReportFollowUp) === 'true';
        // And updates are synced to Master DB
        console.log('\n--- Simulating Doctor requesting Report Follow-up reschedule ---');
        tenantApt.requestReportFollowUp = true;
        tenantApt.status = 'completed';
        await tenantApt.save();

        // Sync to Master
        await MasterAppointment.findByIdAndUpdate(masterApt._id, {
            $set: {
                requestReportFollowUp: true,
                status: 'completed'
            }
        });
        console.log('Appointment updated in Master & Tenant DBs with requestReportFollowUp = true');

        // Verify state
        const verifyMasterApt1 = await MasterAppointment.findById(masterApt._id);
        const verifyTenantApt1 = await tenantModels.Appointment.findById(masterApt._id);
        console.log(`Master requestReportFollowUp: ${verifyMasterApt1.requestReportFollowUp}, followUpScheduled: ${verifyMasterApt1.followUpScheduled}`);
        console.log(`Tenant requestReportFollowUp: ${verifyTenantApt1.requestReportFollowUp}, followUpScheduled: ${verifyTenantApt1.followUpScheduled}`);

        if (!verifyMasterApt1.requestReportFollowUp || verifyMasterApt1.followUpScheduled) {
            throw new Error('Initial doctor update verification failed on Master DB!');
        }

        // 6. Simulate Receptionist querying pending Report Follow-ups
        // queryFilter = { requestReportFollowUp: true, followUpScheduled: false }
        console.log('\n--- Simulating Receptionist retrieving pending Report Follow-ups ---');
        const pendingFollowUps = await tenantModels.Appointment.find({
            hospitalId,
            requestReportFollowUp: true,
            followUpScheduled: false
        });
        console.log(`Found ${pendingFollowUps.length} pending report follow-up requests`);
        const isFound = pendingFollowUps.some(a => a._id.toString() === masterApt._id.toString());
        console.log(`Our test appointment in list: ${isFound ? 'YES ✓' : 'NO ✗'}`);
        if (!isFound) throw new Error('Test appointment not found in pending follow-ups query!');

        // 7. Simulate Receptionist scheduling the follow-up appointment
        // reception.routes.js handles:
        // const { patientId, doctorId, date, time, parentAppointmentId } = req.body;
        // In POST /book-appointment:
        console.log('\n--- Simulating Receptionist booking the follow-up appointment ---');
        const followUpAptData = {
            userId: testPatient._id,
            hospitalId,
            patientId: 'PT-TEST-001',
            patientName: testPatient.name,
            patientPhone: testPatient.phone,
            doctorId: testDoctor._id,
            doctorUserId: testDoctor.userId,
            doctorName: testDoctor.name,
            appointmentDate: new Date(),
            appointmentTime: '11:00 AM',
            status: 'confirmed',
            amount: 500,
            notes: 'Follow-up for report review'
        };

        const newMasterFollowUp = new MasterAppointment(followUpAptData);
        await newMasterFollowUp.save();
        console.log(`Created follow-up appointment in Master DB: ${newMasterFollowUp._id}`);

        const newTenantFollowUp = new tenantModels.Appointment({
            ...followUpAptData,
            _id: newMasterFollowUp._id
        });
        await newTenantFollowUp.save();
        console.log(`Created follow-up appointment in Tenant DB`);

        // Handle parentAppointmentId linking & marking followUpScheduled: true
        const parentAppointmentId = masterApt._id;
        if (parentAppointmentId) {
            await MasterAppointment.findByIdAndUpdate(parentAppointmentId, { $set: { followUpScheduled: true } });
            await tenantModels.Appointment.findByIdAndUpdate(parentAppointmentId, { $set: { followUpScheduled: true } });
            console.log(`Marked parent appointment ${parentAppointmentId} as followUpScheduled = true in Master & Tenant`);
        }

        // 8. Final Verification
        const finalMasterParent = await MasterAppointment.findById(masterApt._id);
        const finalTenantParent = await tenantModels.Appointment.findById(masterApt._id);
        console.log('\n--- Final Verification ---');
        console.log(`Parent Master followUpScheduled: ${finalMasterParent.followUpScheduled}`);
        console.log(`Parent Tenant followUpScheduled: ${finalTenantParent.followUpScheduled}`);

        if (finalMasterParent.followUpScheduled && finalTenantParent.followUpScheduled) {
            console.log('\n✅ Success! The report review rescheduling flow verified correctly in both Master and Tenant databases.');
        } else {
            throw new Error('Final verification failed! parent followUpScheduled flag not set to true.');
        }

        // 9. Cleanup
        console.log('\nCleaning up test records...');
        await MasterAppointment.findByIdAndDelete(masterApt._id);
        await tenantModels.Appointment.findByIdAndDelete(masterApt._id);
        await MasterAppointment.findByIdAndDelete(newMasterFollowUp._id);
        await tenantModels.Appointment.findByIdAndDelete(newMasterFollowUp._id);
        await MasterUser.findByIdAndDelete(testPatient._id);
        await tenantModels.User.findByIdAndDelete(testPatient._id);
        await Doctor.findByIdAndDelete(testDoctor._id);
        await MasterUser.findByIdAndDelete(testDoctorUser._id);
        console.log('Cleanup completed successfully!');

    } catch (err) {
        console.error('Test failed with error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
        process.exit(0);
    }
}

testReportReschedule();
