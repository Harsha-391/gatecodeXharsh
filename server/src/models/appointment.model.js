const mongoose = require('mongoose');

const pharmacyItemSchema = new mongoose.Schema({
    medicineName: { type: String, required: [true, 'Medicine name is required'], trim: true },
    saltName: { type: String, default: '', trim: true },
    frequency: { type: String, default: '', trim: true },
    duration: { type: String, default: '', trim: true }
}, { _id: false });

const vitalsSchema = new mongoose.Schema({
    weight:     { type: String, default: '' },  // kg
    height:     { type: String, default: '' },  // cm
    bmi:        { type: String, default: '' },
    bp:         { type: String, default: '' },  // e.g. 120/80
    temperature:{ type: String, default: '' },  // °F
    pulse:      { type: String, default: '' },  // bpm
    spo2:       { type: String, default: '' },  // %
    rr:         { type: String, default: '' },  // breaths/min
}, { _id: false });

const appointmentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        default: null
    },
    patientId: { type: String, required: false, index: true },
    patientName: { type: String, default: '' },
    patientPhone: { type: String, default: '' },
    patientEmail: { type: String, default: '' },
    patientGender: { type: String, default: '' },
    patientDob: { type: Date, default: null },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', index: true },

    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: false,
        default: null
    },
    // clinicPatientId: for simple clinic appointments where userId may differ
    clinicPatientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClinicPatient',
        default: null
    },

    doctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    doctorName: { type: String, required: [true, 'Doctor name is required'] },

    serviceId: { type: String, required: false },
    serviceName: { type: String, required: false },
    appointmentDate: { type: Date, required: [true, 'Appointment date is required'] },
    appointmentTime: { type: String, required: false, default: '' },
    // Token-mode fields — only populated when hospital appointmentMode === 'token'
    tokenNumber: { type: Number, default: null },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'completed', 'cancelled', 'Admitted'],
        default: 'pending',
        index: true
    },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded', 'Paid', 'Pending'], default: 'pending' },
    paymentMethod: { type: String, default: 'Cash' },
    amount: { type: Number, default: 0 },
    cardRef: { type: String, default: '' },
    upiScreenshotUrl: { type: String, default: '' },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Clinical Data
    notes: { type: String, default: '' },
    doctorNotes: { type: String, default: '' },
    symptoms: { type: String, default: '' },
    diagnosis: { type: String, default: '' },

    labId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab', default: null },

    labTests: [{ type: String, trim: true }],
    dietPlan: [{ type: String, trim: true }],
    pharmacy: [pharmacyItemSchema],
    vitals: { type: vitalsSchema, default: () => ({}) },
    ivfDetails: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Files
    prescription: { type: String, default: '' },
    prescriptions: [{
        url: { type: String, required: true },
        fileId: { type: String },
        name: { type: String },
        uploadedAt: { type: Date, default: Date.now },
        type: { type: String }
    }],
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recommendAdmission: { type: Boolean, default: false },
    recommendAdmissionNotes: { type: String, default: '' },
    recommendAdmissionPriority: { type: String, enum: ['Normal', 'Urgent', 'Critical'], default: 'Normal' },
    recommendAdmissionDept: { type: String, default: '' },
    requestReportFollowUp: { type: Boolean, default: false },
    followUpScheduled: { type: Boolean, default: false }
}, {
    timestamps: true
});

appointmentSchema.index({ doctorId: 1 });
appointmentSchema.index({ appointmentDate: 1 });
appointmentSchema.index({ createdAt: 1 });

appointmentSchema.index(
    { doctorId: 1, appointmentDate: 1, appointmentTime: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['pending', 'confirmed', 'completed', 'Admitted'] } } }
);

const Appointment = mongoose.model('Appointment', appointmentSchema);
module.exports = Appointment;