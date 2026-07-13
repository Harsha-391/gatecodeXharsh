const mongoose = require('mongoose');

const workflowConfigSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        unique: true,
        index: true
    },
    slas: {
        type: Map,
        of: Number,
        default: {
            'Registered': 15,
            'Waiting': 30,
            'Consultation': 20,
            'Lab Ordered': 15,
            'Sample Collected': 15,
            'Testing': 120,
            'Report Ready': 15,
            'Medicine Pending': 20,
            'Billing Pending': 20,
            'Payment Completed': 15,
            'Discharged': 15
        }
    },
    reminderIntervalMinutes: {
        type: Number,
        default: 10
    },
    escalationThresholds: {
        type: Map,
        of: Number,
        default: {
            '1': 10,  // Level 1: 10 minutes overdue
            '2': 20,  // Level 2: 20 minutes overdue
            '3': 30   // Level 3: 30 minutes overdue
        }
    }
}, { timestamps: true });

const WorkflowConfig = mongoose.model('WorkflowConfig', workflowConfigSchema);

module.exports = WorkflowConfig;
