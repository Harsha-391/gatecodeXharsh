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
        Facility: model('Facility', require('../models/facility.model').schema),
        Role: model('Role', require('../models/role.model').schema),
        Admission: model('Admission', require('../models/admission.model').schema),
        Transfer: model('Transfer', require('../models/transfer.model').schema),
        Invoice: model('Invoice', require('../models/invoice.model').schema),
        Refund: model('Refund', require('../models/refund.model').schema),
        BillingActivityLog: model('BillingActivityLog', require('../models/billingActivityLog.model').schema),
        Inventory: model('Inventory', require('../models/inventory.model').schema),
        ExpenseCategory: model('ExpenseCategory', require('../models/expenseCategory.model').schema),
        Expense: model('Expense', require('../models/expense.model').schema),
        Doctor: model('Doctor', require('../models/doctor.model').schema),
        Lab: model('Lab', require('../models/lab.model').schema),
        ClinicPatient: model('ClinicPatient', require('../models/clinicPatient.model').schema),
        HospitalPatient: model('HospitalPatient', require('../models/hospitalPatient.model').schema),
        LabTest: model('LabTest', require('../models/labTest.model').schema),
        Hospital: model('Hospital', require('../models/hospital.model').schema),
        ClinicalVisit: model('ClinicalVisit', require('../models/clinicalVisit.model').schema),
        Pharmacy: model('Pharmacy', require('../models/pharmacy.model').schema),
        Reception: model('Reception', require('../models/reception.model').schema),
        InsuranceClaim: model('InsuranceClaim', require('../models/insuranceClaim.model').schema),
        Reconciliation: model('Reconciliation', require('../models/reconciliation.model').schema),
        DeletedRecord: model('DeletedRecord', require('../models/deletedRecord.model').schema),
        UserActivityLog: model('UserActivityLog', require('../models/userActivityLog.model').schema),
        PayrollRecord: model('PayrollRecord', require('../models/payrollRecord.model').schema),
        DoctorPayout: model('DoctorPayout', require('../models/doctorPayout.model').schema),
        DiscountRequest: model('DiscountRequest', require('../models/discountRequest.model').schema),
        CollectionTransaction: model('CollectionTransaction', require('../models/collectionTransaction.model').schema),
        Service: model('Service', require('../models/service.model').schema),
        Resource: model('Resource', require('../models/resource.model').schema),
        TreatmentPlan: model('TreatmentPlan', require('../models/treatmentPlan.model').schema),
        ClinicSubscription: model('ClinicSubscription', require('../models/clinicSubscription.model').schema),
        Notification: model('Notification', require('../models/notification.model').schema),
        Medicine: model('Medicine', require('../models/medicine.model').schema),
        PharmacyPurchaseRequest: model('PharmacyPurchaseRequest', require('../models/pharmacyPurchaseRequest.model').schema),
        TestPackage: model('TestPackage', require('../models/testPackage.model').schema),
        UploadedFile: model('UploadedFile', require('../models/uploadedFile.model').schema),
        AuditLog: model('AuditLog', require('../models/auditLog.model').schema),
    };
}

module.exports = { getTenantModels };
