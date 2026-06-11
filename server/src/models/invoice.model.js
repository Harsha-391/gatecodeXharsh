const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    patientName: { type: String, required: true },
    invoiceNumber: { type: String, required: true },
    invoiceDate: { type: Date, default: Date.now },
    items: [{
        itemType: { type: String, enum: ['Consultation', 'Laboratory', 'Pharmacy', 'Admission', 'Facility', 'Service', 'Other'] },
        itemId: { type: mongoose.Schema.Types.ObjectId },
        name: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        unitPrice: { type: Number, required: true },
        totalAmount: { type: Number, required: true },
        paymentStatus: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' }
    }],
    grandTotal: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    outstandingAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['Pending', 'Partially Paid', 'Paid', 'Cancelled'], default: 'Pending' },
    payments: [{
        receiptNumber: { type: String, required: true },
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now },
        method: { type: String, enum: ['Cash', 'Card', 'UPI', 'Bank Transfer'], required: true },
        reference: { type: String, default: '' },
        collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        collectedByName: { type: String, default: '' }
    }],
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    generatedByName: { type: String, default: '' }
}, { timestamps: true });

invoiceSchema.index({ hospitalId: 1 });
invoiceSchema.index({ patientId: 1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ createdAt: 1 });

// Compound index to ensure invoice numbers are unique per hospital
invoiceSchema.index({ hospitalId: 1, invoiceNumber: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
