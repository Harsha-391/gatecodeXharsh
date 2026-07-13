const mongoose = require('mongoose');

function getTenantModels(tenantDb) {
    if (!tenantDb) {
        throw new Error('tenantDb connection is required for getTenantModels()');
    }

    if (tenantDb.cachedModels) {
        return tenantDb.cachedModels;
    }

    const isClinic = tenantDb.isClinic === true;

    // Helper: register model once per connection, or globally if not required for clinic
    const model = (name, schema, isRequiredForClinic = true) => {
        if (isClinic && !isRequiredForClinic) {
            // Register/fetch globally on the master mongoose connection so it never touches the tenant DB
            try {
                return mongoose.model(name);
            } catch {
                return mongoose.model(name, schema);
            }
        }
        
        try {
            return tenantDb.model(name);
        } catch {
            return tenantDb.model(name, schema);
        }
    };

    const compiled = {
        User: model('User', require('../models/user.model').schema, true),
        Appointment: model('Appointment', require('../models/appointment.model').schema, true),
        LabReport: model('LabReport', require('../models/labReport.model').schema, false),
        PharmacyOrder: model('PharmacyOrder', require('../models/pharmacyOrder.model').schema, true),
        FacilityCharge: model('FacilityCharge', require('../models/facilityCharge.model').schema, false),
        Facility: model('Facility', require('../models/facility.model').schema, false),
        Role: model('Role', require('../models/role.model').schema, false),
        Admission: model('Admission', require('../models/admission.model').schema, false),
        Transfer: model('Transfer', require('../models/transfer.model').schema, false),
        Invoice: model('Invoice', require('../models/invoice.model').schema, false),
        Refund: model('Refund', require('../models/refund.model').schema, false),
        BillingActivityLog: model('BillingActivityLog', require('../models/billingActivityLog.model').schema, true),
        Inventory: model('Inventory', require('../models/inventory.model').schema, true),
        ExpenseCategory: model('ExpenseCategory', require('../models/expenseCategory.model').schema, false),
        Expense: model('Expense', require('../models/expense.model').schema, false),
        Doctor: model('Doctor', require('../models/doctor.model').schema, true),
        Lab: model('Lab', require('../models/lab.model').schema, false),
        ClinicPatient: model('ClinicPatient', require('../models/clinicPatient.model').schema, true),
        HospitalPatient: model('HospitalPatient', require('../models/hospitalPatient.model').schema, false),
        LabTest: model('LabTest', require('../models/labTest.model').schema, false),
        Hospital: model('Hospital', require('../models/hospital.model').schema, false),
        ClinicalVisit: model('ClinicalVisit', require('../models/clinicalVisit.model').schema, true),
        Pharmacy: model('Pharmacy', require('../models/pharmacy.model').schema, true),
        Reception: model('Reception', require('../models/reception.model').schema, false),
        InsuranceClaim: model('InsuranceClaim', require('../models/insuranceClaim.model').schema, false),
        Reconciliation: model('Reconciliation', require('../models/reconciliation.model').schema, false),
        DeletedRecord: model('DeletedRecord', require('../models/deletedRecord.model').schema, true),
        UserActivityLog: model('UserActivityLog', require('../models/userActivityLog.model').schema, false),
        PayrollRecord: model('PayrollRecord', require('../models/payrollRecord.model').schema, false),
        DoctorPayout: model('DoctorPayout', require('../models/doctorPayout.model').schema, false),
        DiscountRequest: model('DiscountRequest', require('../models/discountRequest.model').schema, false),
        CollectionTransaction: model('CollectionTransaction', require('../models/collectionTransaction.model').schema, false),
        Service: model('Service', require('../models/service.model').schema, false),
        Resource: model('Resource', require('../models/resource.model').schema, false),
        TreatmentPlan: model('TreatmentPlan', require('../models/treatmentPlan.model').schema, true),
        ClinicSubscription: model('ClinicSubscription', require('../models/clinicSubscription.model').schema, true),
        Notification: model('Notification', require('../models/notification.model').schema, false),
        Medicine: model('Medicine', require('../models/medicine.model').schema, false),
        PharmacyPurchaseRequest: model('PharmacyPurchaseRequest', require('../models/pharmacyPurchaseRequest.model').schema, false),
        TestPackage: model('TestPackage', require('../models/testPackage.model').schema, false),
        UploadedFile: model('UploadedFile', require('../models/uploadedFile.model').schema, true),
        AuditLog: model('AuditLog', require('../models/auditLog.model').schema, false),
        QuestionLibrary: model('QuestionLibrary', require('../models/questionLibrary.model').schema, false),
        DocumentTemplate: model('DocumentTemplate', require('../models/documentTemplate.model').schema, true),
        PatientEncounter: model('PatientEncounter', require('../models/patientEncounter.model').schema, true),
        PatientTimeline: model('PatientTimeline', require('../models/patientTimeline.model').schema, true),
        WorkflowConfig: model('WorkflowConfig', require('../models/workflowConfig.model').schema, true),
    };

    tenantDb.cachedModels = compiled;
    return compiled;
}

module.exports = { getTenantModels };
