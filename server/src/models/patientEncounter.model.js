const mongoose = require('mongoose');

const patientEncounterSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HospitalPatient',
        required: true,
        index: true
    },
    encounterType: {
        type: String,
        enum: ['OPD', 'IPD', 'Emergency', 'Telemedicine', 'HomeCare'],
        required: true,
        default: 'OPD'
    },
    encounterNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    currentStatus: {
        type: String,
        enum: [
            'Registered', 'Waiting', 'Consultation', 'Lab Ordered', 'Sample Collected',
            'Testing', 'Report Ready', 'Medicine Pending', 'Billing Pending',
            'Payment Completed', 'Discharged', 'Follow-up Scheduled', 'Cancelled', 'No Show'
        ],
        required: true,
        default: 'Registered',
        index: true
    },
    activeAppointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        default: null
    },
    activeAdmissionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admission',
        default: null
    },
    assignedDoctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        default: null
    },
    currentDepartment: {
        type: String,
        default: 'reception',
        index: true
    },
    assignedUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    assignedRole: {
        type: String,
        default: 'receptionist',
        index: true
    },
    waitingSince: {
        type: Date,
        default: Date.now
    },
    targetSLA: {
        type: Number, // in minutes
        default: 15
    },
    escalationLevel: {
        type: Number,
        default: 0
    },
    isArchived: {
        type: Boolean,
        default: false,
        index: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'emergency'],
        default: 'medium',
        index: true
    },
    workflowVersion: {
        type: String,
        default: '1.0.0'
    },
    transitionVersion: {
        type: String,
        default: '1.0'
    }
}, { timestamps: true });

const PatientEncounter = mongoose.model('PatientEncounter', patientEncounterSchema);

module.exports = PatientEncounter;
