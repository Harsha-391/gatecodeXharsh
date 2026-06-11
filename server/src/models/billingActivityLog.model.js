const mongoose = require('mongoose');

const billingActivityLogSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    performedByName: { type: String, required: true },
    action: { type: String, enum: ['Invoice Generated', 'Payment Collected', 'Invoice Cancelled', 'Refund Issued', 'Override Approved'], required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    patientName: { type: String, required: true },
    details: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('BillingActivityLog', billingActivityLogSchema);
