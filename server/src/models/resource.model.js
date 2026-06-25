const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
    hospitalId: {
        type: String,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: [true, 'Resource name is required'],
        trim: true
    },
    type: {
        type: String,
        enum: ['Room', 'Bed', 'Equipment', 'Vehicle', 'Other'],
        default: 'Equipment'
    },
    total: {
        type: Number,
        required: [true, 'Total count is required'],
        min: 0,
        default: 1
    },
    description: {
        type: String,
        default: ''
    },
    pricePerDay: {
        type: Number,
        default: 0
    },
    ward: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

resourceSchema.index({ hospitalId: 1, isActive: 1 });

const Resource = mongoose.model('Resource', resourceSchema);

module.exports = Resource;
