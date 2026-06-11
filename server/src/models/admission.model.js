const mongoose = require('mongoose');

const admissionSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    patientName: { type: String, default: '' },
    patientPhone: { type: String, default: '' },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    admittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    admissionDate: { type: Date, default: Date.now },
    dischargeDate: Date,
    status: { type: String, enum: ['Admitted', 'Discharged', 'Pending Allocation'], default: 'Pending Allocation' },
    ward: String,
    bedNumber: String,
    dailyWardCharge: { type: Number, default: 0 },
    privateRoom: { type: Boolean, default: false },
    requestedDepartment: { type: String, default: '' },
    priority: { type: String, enum: ['Normal', 'Urgent', 'Critical'], default: 'Normal' },
    selectedFacilities: [{
        facilityName: { type: String, required: true },
        pricePerDay: { type: Number, required: true },
        days: { type: Number, required: true },
        totalAmount: { type: Number, required: true }
    }],
    totalAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
    notes: String,
}, { timestamps: true });

admissionSchema.index({ hospitalId: 1 });
admissionSchema.index({ patientId: 1 });
admissionSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Admission', admissionSchema);
