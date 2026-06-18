const mongoose = require('mongoose');

const deletedRecordSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    originalId: { type: String, required: true },
    recordType: { type: String, enum: ['Invoice', 'Payment', 'Refund', 'Expense'], required: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deletedByName: { type: String, required: true },
    reason: { type: String, default: '' },
    deletedAt: { type: Date, default: Date.now },
    originalData: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('DeletedRecord', deletedRecordSchema);
