const mongoose = require('mongoose');

const pharmacyPurchaseRequestSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    item: {
        type: String,
        required: true,
        trim: true
    },
    qty: {
        type: Number,
        required: true,
        default: 0
    },
    status: {
        type: String,
        enum: ['Approval Pending', 'Ordered', 'Approved', 'Rejected'],
        default: 'Approval Pending'
    },
    requestedBy: {
        type: String,
        default: 'Lead Pharmacist'
    }
}, { timestamps: true });

module.exports = mongoose.model('PharmacyPurchaseRequest', pharmacyPurchaseRequestSchema);
