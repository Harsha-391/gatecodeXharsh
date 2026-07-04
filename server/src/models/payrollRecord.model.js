const mongoose = require('mongoose');

const payrollRecordSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    month: {
        type: String, // format: 'YYYY-MM', e.g., '2026-06'
        required: true,
        index: true
    },
    basicSalary: {
        type: Number,
        required: true,
        default: 0
    },
    allowances: {
        type: Number,
        default: 0
    },
    deductions: {
        type: Number,
        default: 0
    },
    netSalary: {
        type: Number,
        required: true,
        default: 0
    },
    status: {
        type: String,
        enum: ['Draft', 'Paid', 'Reversed'],
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
    },
    // Denormalised fields: stored at generation time so history displays correctly
    // even if the employee is deleted or renamed later
    employeeName: {
        type: String,
        default: ''
    },
    employeeRole: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Compound index to prevent duplicate generation for the same employee in the same month
payrollRecordSchema.index({ hospitalId: 1, employeeId: 1, month: 1 }, { unique: true });

const PayrollRecord = mongoose.model('PayrollRecord', payrollRecordSchema);
module.exports = PayrollRecord;
