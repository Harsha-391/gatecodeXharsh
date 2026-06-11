const mongoose = require('mongoose');

function getTenantModels(tenantDb) {
    if (!tenantDb) {
        throw new Error('tenantDb connection is required for getTenantModels()');
    }

    // Helper: register model once per connection
    const model = (name, schema) => {
        try {
            return tenantDb.model(name);
        } catch {
            return tenantDb.model(name, schema);
        }
    };

    return {
        User: model('User', require('../models/user.model').schema),
        Appointment: model('Appointment', require('../models/appointment.model').schema),
        LabReport: model('LabReport', require('../models/labReport.model').schema),
        PharmacyOrder: model('PharmacyOrder', require('../models/pharmacyOrder.model').schema),
        FacilityCharge: model('FacilityCharge', require('../models/facilityCharge.model').schema),
        Role: model('Role', require('../models/role.model').schema),
        Admission: model('Admission', require('../models/admission.model').schema),
        Invoice: model('Invoice', require('../models/invoice.model').schema),
        Refund: model('Refund', require('../models/refund.model').schema),
        BillingActivityLog: model('BillingActivityLog', require('../models/billingActivityLog.model').schema),
        Inventory: model('Inventory', require('../models/inventory.model').schema),
        ExpenseCategory: model('ExpenseCategory', require('../models/expenseCategory.model').schema),
        Expense: model('Expense', require('../models/expense.model').schema),
        Doctor: model('Doctor', require('../models/doctor.model').schema),
        Lab: model('Lab', require('../models/lab.model').schema),
        ClinicPatient: model('ClinicPatient', require('../models/clinicPatient.model').schema),
        Hospital: model('Hospital', require('../models/hospital.model').schema),
        ClinicalVisit: model('ClinicalVisit', require('../models/clinicalVisit.model').schema),
        Pharmacy: model('Pharmacy', require('../models/pharmacy.model').schema),
        Reception: model('Reception', require('../models/reception.model').schema),
    };
}

module.exports = { getTenantModels };
