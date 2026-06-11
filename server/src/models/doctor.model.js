const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  doctorId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    unique: true,
    sparse: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    default: null,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Doctor name is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required']
  },
  phone: {
    type: String,
    default: ''
  },
  specialty: {
    type: String,
    default: ''
  },
  experience: {
    type: String,
    default: ''
  },
  education: {
    type: String,
    default: ''
  },
  services: [{
    type: String
  }],
  departments: [{
    type: String
  }],
  availability: {
    monday: { available: Boolean, startTime: String, endTime: String },
    tuesday: { available: Boolean, startTime: String, endTime: String },
    wednesday: { available: Boolean, startTime: String, endTime: String },
    thursday: { available: Boolean, startTime: String, endTime: String },
    friday: { available: Boolean, startTime: String, endTime: String },
    saturday: { available: Boolean, startTime: String, endTime: String },
    sunday: { available: Boolean, startTime: String, endTime: String }
  },
  successRate: {
    type: String,
    default: '90%'
  },
  patientsCount: {
    type: String,
    default: '100+'
  },
  image: {
    type: String,
    default: '👨‍⚕️'
  },
  bio: {
    type: String,
    default: ''
  },
  consultationFee: {
    type: Number,
    default: 0
  },
  firstName: {
    type: String,
    default: ''
  },
  middleName: {
    type: String,
    default: ''
  },
  lastName: {
    type: String,
    default: ''
  },
  dob: {
    type: Date,
    default: null
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    default: 'Male'
  },
  nationalId: {
    type: String,
    default: ''
  },
  medicalLicense: {
    type: String,
    default: ''
  },
  specialization: {
    type: String,
    default: ''
  },
  qualification: [{
    type: String
  }],
  experienceYears: {
    type: Number,
    min: 0,
    max: 50,
    default: 0
  },
  personalEmail: {
    type: String,
    default: ''
  },
  currentAddress: {
    type: String,
    default: ''
  },
  emergencyContact: {
    name: { type: String, default: '' },
    relationship: { type: String, default: '' },
    phone: { type: String, default: '' }
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
    default: 'O+'
  },
  joiningDate: {
    type: Date,
    default: null
  },
  employmentType: {
    type: String,
    enum: ['Full-time', 'Part-time', 'Visiting Consultant'],
    default: 'Full-time'
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'On leave'],
    default: 'Active'
  }
}, {
  timestamps: true
});

// Add indexes for better query performance
doctorSchema.index({ services: 1 }); // Index for filtering by services

doctorSchema.index({ email: 1 }); // Index for email lookups

const Doctor = mongoose.model('Doctor', doctorSchema);
//doctor dda
module.exports = Doctor;

