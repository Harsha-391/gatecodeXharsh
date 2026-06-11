const mongoose = require('mongoose');

const facilityChargeSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    facilityName: { type: String, required: true },
    pricePerDay: { type: Number, required: true },
    days: { type: Number },
    daysUsed: { type: Number },
    totalAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

facilityChargeSchema.pre('save', function(next) {
    if (this.daysUsed !== undefined && this.days === undefined) {
        this.days = this.daysUsed;
    } else if (this.days !== undefined && this.daysUsed === undefined) {
        this.daysUsed = this.days;
    }
    
    if (this.days === undefined && this.daysUsed === undefined) {
        return next(new Error('Either days or daysUsed is required'));
    }
    
    next();
});

module.exports = mongoose.model('FacilityCharge', facilityChargeSchema);
