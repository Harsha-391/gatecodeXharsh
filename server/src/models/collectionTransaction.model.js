const mongoose = require('mongoose');

const collectionTransactionSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    patientName: { type: String, required: true },
    patientPhone: { type: String, default: '' },
    patientIdStr: { type: String, default: '' }, // MRN / patientId string
    invoiceNumber: { type: String, default: '', index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    amount: { type: Number, required: true },
    paymentMethod: { 
        type: String, 
        enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque', 'NEFT/RTGS', 'Insurance'], 
        required: true 
    },
    collectedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    collectedByName: { type: String, required: true },
    counterName: { type: String, default: 'Counter 1' },
    collectionType: { 
        type: String, 
        enum: [
            'OPD Registration', 
            'Follow-up Consultation', 
            'IPD Admission Advance', 
            'Lab Payment', 
            'Pharmacy Payment', 
            'Insurance Co-Pay', 
            'Insurance Settle',
            'Miscellaneous Collection'
        ], 
        required: true 
    },
    collectionTimestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

module.exports = mongoose.model('CollectionTransaction', collectionTransactionSchema);
