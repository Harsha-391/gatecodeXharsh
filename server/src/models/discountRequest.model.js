const mongoose = require('mongoose');

const discountRequestSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    patientName: { type: String, required: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    invoiceNumber: { type: String, default: '' },

    requestType: {
        type: String,
        enum: ['Discount', 'Waiver', 'Adjustment'],
        required: true
    },
    // Either fixed amount OR percentage (one must be set)
    amount: { type: Number, default: 0 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    reason: { type: String, required: true },

    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Applied'],
        default: 'Pending',
        index: true
    },

    // Created by Billing staff
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedByName: { type: String, default: '' },

    // Approved/Rejected by Accountant or Admin
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedByName: { type: String, default: '' },
    approvalNotes: { type: String, default: '' },
    actionDate: { type: Date },

    // Applied by Billing staff after approval
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    appliedByName: { type: String, default: '' },
    appliedDate: { type: Date },

}, { timestamps: true });

discountRequestSchema.index({ hospitalId: 1, status: 1 });
discountRequestSchema.index({ hospitalId: 1, createdAt: -1 });

const DiscountRequest = mongoose.model('DiscountRequest', discountRequestSchema);
module.exports = DiscountRequest;
