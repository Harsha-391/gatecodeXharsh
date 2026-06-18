const mongoose = require('mongoose');

const doctorPayoutSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: true,
        index: true
    },
    month: {
        type: String, // format: 'YYYY-MM', e.g., '2026-06'
        required: true,
        index: true
    },
    patientsSeen: {
        type: Number,
        default: 0
    },
    revenueGenerated: {
        type: Number,
        default: 0
    },
    commissionPercent: {
        type: Number,
        default: 0
    },
    commissionAmount: {
        type: Number,
        default: 0
    },
    fixedSalary: {
        type: Number,
        default: 0
    },
    totalPayable: {
        type: Number,
        required: true,
        default: 0
    },
    status: {
        type: String,
        enum: ['Draft', 'Approved', 'Paid'],
        default: 'Draft',
        index: true
    },
    paymentDate: {
        type: Date,
        default: null
    },
    paymentMethod: {
        type: String,
        default: ''
    },
    transactionReference: {
        type: String,
        default: ''
    },
    paidBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Compound index to prevent duplicate payout record creation for the same doctor in the same month
doctorPayoutSchema.index({ hospitalId: 1, doctorId: 1, month: 1 }, { unique: true });

const DoctorPayout = mongoose.model('DoctorPayout', doctorPayoutSchema);
module.exports = DoctorPayout;
