const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    patientName: { type: String, required: true },
    invoiceNumber: { type: String, default: '' },
    refundType: { type: String, enum: ['Cancelled Lab Test', 'Returned Medicine', 'Duplicate Payment', 'Manual Refund'], required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId },
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['Refund Pending', 'Refund Approved', 'Refunded'], default: 'Refund Pending' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedByName: { type: String },
    actionDate: { type: Date },
    history: [{
        status: String,
        actionDate: { type: Date, default: Date.now },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        performedByName: String,
        notes: String
    }]
}, { timestamps: true });

module.exports = mongoose.model('Refund', refundSchema);
