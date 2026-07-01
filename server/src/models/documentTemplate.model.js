const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
    version: { type: Number, required: true },
    url: { type: String, required: true },
    fileId: { type: String, required: true },
    fileName: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

const documentTemplateSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null },
    templateType: {
        type: String,
        required: true,
        enum: [
            'doctor_prescription',
            'billing_payment'
        ]
    },
    fileName: { type: String, required: true },
    url: { type: String, required: true },
    fileId: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    
    // Layout Margins (in mm, used in jsPDF rendering)
    headerHeight: { type: Number, default: 50 },
    footerHeight: { type: Number, default: 30 },
    leftMargin: { type: Number, default: 15 },
    rightMargin: { type: Number, default: 15 },
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    version: { type: Number, default: 1 },
    history: [historySchema]
}, {
    timestamps: true
});

module.exports = mongoose.model('DocumentTemplate', documentTemplateSchema);
