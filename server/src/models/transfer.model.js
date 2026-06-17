const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    patientName: { type: String, default: '' },
    fromDepartment: { type: String, default: '' },
    toDepartment: { type: String, default: '' },
    fromBed: { type: String, default: '' },
    toBed: { type: String, default: '' },
    transferDate: { type: Date, default: Date.now },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

transferSchema.index({ hospitalId: 1 });
transferSchema.index({ patientId: 1 });
transferSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Transfer', transferSchema);
