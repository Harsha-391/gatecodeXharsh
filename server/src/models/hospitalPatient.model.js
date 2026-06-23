const mongoose = require('mongoose');

const hospitalPatientSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true,
    },
    patientId: {
        type: String,
        required: true,
        trim: true,
    },

    // Core Identity
    name:   { type: String, required: true, trim: true },
    phone:  { type: String, required: true, trim: true },
    email:  { type: String, trim: true, default: '' },
    gender: { type: String, default: 'Female' },
    dob:    { type: Date, default: null },
    parentName: { type: String, default: '' },
    parentPhone: { type: String, default: '' },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Medical Demographics
    bloodGroup:        { type: String, default: '' },
    address:           { type: String, default: '' },
    city:              { type: String, default: '' },
    allergies:         { type: String, default: '' },
    chronicConditions: { type: String, default: '' },
    medicalNotes:      { type: String, default: '' },

    // Identity Verification (KYC)
    aadhaarNumber:     { type: String, trim: true },
    isAadhaarVerified: { type: Boolean, default: false },

    // Clinical / IVF Profile
    patientType:      { type: String, enum: ['Primary', 'Partner'], default: 'Primary' },
    partner:          { type: mongoose.Schema.Types.ObjectId, ref: 'HospitalPatient', default: null },
    fertilityProfile: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Relatives / emergency contacts
    relatives: [{
        name:     { type: String, trim: true, default: '' },
        relation: { type: String, trim: true, default: '' },
        phone:    { type: String, trim: true, default: '' },
    }],

    // Uploaded medical reports (PDFs / images)
    reports: [{
        name:       { type: String, required: true, trim: true },
        filename:   { type: String, required: true },
        mimetype:   { type: String, default: 'application/pdf' },
        uploadedAt: { type: Date, default: Date.now },
    }],

    isActive: { type: Boolean, default: true },
}, { timestamps: true });

// patientId unique per hospital
hospitalPatientSchema.index({ hospitalId: 1, patientId: 1 }, { unique: true });
// phone unique per hospital
hospitalPatientSchema.index({ hospitalId: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('HospitalPatient', hospitalPatientSchema);
