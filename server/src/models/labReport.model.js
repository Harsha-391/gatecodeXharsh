const mongoose = require('mongoose');

const labReportSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: false,
    index: true
  },
  patientId: {
    type: String, // Persistent ID like P-101
    required: true
  },
  userId: { // Patient's User ObjectId
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Linking to the Doctor's User ID for notifications/queries
    required: false
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    index: true
  },
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab' // Optional: If you want to assign to a specific lab later
  },
  testNames: [{
    type: String,
    required: true
  }],
  testStatus: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'DONE'],
    default: 'PENDING',
    index: true
  },
  reportStatus: {
    type: String,
    enum: ['PENDING', 'UPLOADED', 'CANCELLED'],
    default: 'PENDING'
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID'],
    default: 'PENDING',
    index: true
  },
  paymentMode: {
    type: String,
    enum: ['CASH', 'ONLINE', 'UPI', 'CARD', 'NONE'],
    default: 'NONE'
  },
  amount: {
    type: Number,
    default: 0
  },
  reportFile: {
    url: String,
    fileId: String,
    name: String,
    uploadedAt: Date
  },
  notes: {
    type: String,
    default: ''
  },
  sampleCollected: {
    type: Boolean,
    default: false
  },
  sampleCollectedAt: {
    type: Date
  },
  sampleCollectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sampleType: {
    type: String,
    enum: ['Blood', 'Urine', 'Stool', 'Saliva', 'Sputum', 'Swab', 'Tissue', 'Other']
  },
  collectionNotes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Pending', 'Sample Collected', 'In Testing', 'Report Ready', 'Completed', 'Cancelled'],
    default: 'Pending',
    index: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  statusHistory: [{
    status: String,
    updatedAt: { type: Date, default: Date.now },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedByName: String,
    notes: String
  }]
}, {
  timestamps: true
});

const LabReport = mongoose.model('LabReport', labReportSchema);

module.exports = LabReport;