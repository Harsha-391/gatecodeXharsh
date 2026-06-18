const mongoose = require('mongoose');

const reconciliationSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    cashExpected: { type: Number, default: 0 },
    cashActual: { type: Number, default: 0 },
    upiExpected: { type: Number, default: 0 },
    upiActual: { type: Number, default: 0 },
    cardExpected: { type: Number, default: 0 },
    cardActual: { type: Number, default: 0 },
    bankExpected: { type: Number, default: 0 },
    bankActual: { type: Number, default: 0 },
    reconciledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reconciledByName: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['Pending', 'Balanced', 'Discrepancy'],
        default: 'Pending'
    },
    notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Ensure only one reconciliation per date per hospital
reconciliationSchema.index({ hospitalId: 1, date: 1 }, { unique: true });

const Reconciliation = mongoose.model('Reconciliation', reconciliationSchema);

module.exports = Reconciliation;
