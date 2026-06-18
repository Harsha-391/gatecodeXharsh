const mongoose = require('mongoose');

const userActivityLogSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    activity: { type: String, required: true }, // e.g. "Export Report", "Download PDF", "Login", etc.
    details: { type: String, default: '' },
    ipAddress: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('UserActivityLog', userActivityLogSchema);
