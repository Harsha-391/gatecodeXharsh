const mongoose = require('mongoose');

const facilitySchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    pricePerDay: {
        type: Number,
        required: true,
        min: 0,
    },
    bedCount: {
        type: Number,
        default: 0,
    }
}, { timestamps: true });

// Ensure unique facility name per hospital
facilitySchema.index({ hospitalId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Facility', facilitySchema);
