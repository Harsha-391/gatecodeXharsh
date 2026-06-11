const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Service ID is required'],
    unique: true
  },
  title: {
    type: String,
    required: [true, 'Service title is required']
  },
  description: {
    type: String,
    required: [true, 'Service description is required']
  },
  // Legacy fields (kept for backward compatibility)
  icon: {
    type: String,
    default: '🏥'
  },
  color: {
    type: String,
    default: '#14C38E'
  },
  features: [{
    type: String
  }],
  // Core fields
  price: {
    type: Number,
    default: 0
  },
  duration: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: ''
  },
  active: {
    type: Boolean,
    default: true
  },
  // New fields
  includedCharges: {
    type: String,
    default: ''
  },
  department: {
    type: String,
    default: ''
  },
  billingType: {
    type: String,
    enum: ['Fixed', 'Per Visit', 'Per Day', 'Per Procedure', 'Per Test', 'Package', ''],
    default: 'Fixed'
  },
  gst: {
    type: Number,
    default: 0
  },
  serviceType: {
    type: String,
    enum: ['Consultation', 'Procedure', 'Diagnostic', 'Pharmacy', 'Room', 'OT', 'ICU', 'Ambulance', 'Other', ''],
    default: 'Consultation'
  },
  visibility: {
    type: String,
    enum: ['OPD', 'IPD', 'Both'],
    default: 'Both'
  }
}, {
  timestamps: true
});

// Add indexes for better query performance
serviceSchema.index({ active: 1 });
serviceSchema.index({ department: 1 });
serviceSchema.index({ serviceType: 1 });
serviceSchema.index({ visibility: 1 });

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
