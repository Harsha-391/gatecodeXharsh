const mongoose = require('mongoose');

const patientTimelineSchema = new mongoose.Schema({
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
    encounterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PatientEncounter',
        required: true,
        index: true
    },
    eventType: {
        type: String,
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: {
        type: String,
        default: ''
    },
    department: {
        type: String,
        required: true,
        index: true
    },
    attachments: [{
        name: { type: String, required: true },
        url: { type: String, required: true },
        fileId: { type: String }
    }],
    transitionStart: {
        type: Date
    },
    transitionEnd: {
        type: Date
    },
    durationMs: {
        type: Number
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

// Immutability pre-hooks: block updates and deletions
patientTimelineSchema.pre('save', function (next) {
    if (!this.isNew) {
        return next(new Error('Timeline records are immutable and cannot be updated.'));
    }
    next();
});

patientTimelineSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany', 'findByIdAndUpdate'], function (next) {
    next(new Error('Timeline records are immutable — updates are not permitted.'));
});

patientTimelineSchema.pre(['deleteOne', 'findOneAndDelete', 'deleteMany', 'findByIdAndDelete', 'remove'], function (next) {
    next(new Error('Timeline records are immutable — deletion is not permitted.'));
});

const PatientTimeline = mongoose.model('PatientTimeline', patientTimelineSchema);

module.exports = PatientTimeline;
