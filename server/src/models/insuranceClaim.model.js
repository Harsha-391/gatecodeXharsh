const mongoose = require('mongoose');

const insuranceClaimSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    patientName: {
        type: String,
        required: true
    },
    policyNumber: {
        type: String,
        required: true
    },
    insuranceProvider: {
        type: String,
        required: true
    },
    claimNumber: {
        type: String,
        required: true,
        unique: true
    },
    invoiceNumber: {
        type: String,
        required: true
    },
    claimAmount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['Submitted', 'Pending', 'Approved', 'Rejected'],
        default: 'Submitted'
    },
    treatmentDescription: {
        type: String,
        default: ''
    },
    submissionDate: {
        type: Date,
        default: Date.now
    },
    actionDate: {
        type: Date
    },
    approvedAmount: {
        type: Number,
        default: 0
    },
    rejectionReason: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

const InsuranceClaim = mongoose.model('InsuranceClaim', insuranceClaimSchema);

module.exports = InsuranceClaim;
