/**
 * migrate-all-to-tenant.js
 * =========================================================
 * ONE-TIME MIGRATION: Copies ALL existing hospital-specific
 * data from the Master DB into each hospital's Tenant DB.
 *
 * Collections migrated per hospital:
 *   - users        (staff & patients belonging to the hospital)
 *   - doctors
 *   - labs
 *   - pharmacies
 *   - receptions
 *   - appointments
 *   - admissions
 *   - clinicalvisits
 *   - labreports
 *   - pharmacyorders
 *   - invoices
 *   - refunds
 *   - facilitycharges
 *   - inventories
 *   - expensecategories
 *   - expenses
 *   - billingactivitylogs
 *   - roles        (hospital-scoped)
 *   - clinicpatients
 *
 * Usage:
 *   cd server
 *   node scripts/migrate-all-to-tenant.js
 * =========================================================
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// Master DB models
const Hospital   = require('../src/models/hospital.model');
const User       = require('../src/models/user.model');
const Doctor     = require('../src/models/doctor.model');
const Lab        = require('../src/models/lab.model');
const Pharmacy   = require('../src/models/pharmacy.model');
const Reception  = require('../src/models/reception.model');
const Appointment  = require('../src/models/appointment.model');
const Admission    = require('../src/models/admission.model');
const ClinicalVisit = require('../src/models/clinicalVisit.model');
const LabReport  = require('../src/models/labReport.model');
const PharmacyOrder = require('../src/models/pharmacyOrder.model');
const Invoice    = require('../src/models/invoice.model');
const Refund     = require('../src/models/refund.model');
const FacilityCharge = require('../src/models/facilityCharge.model');
const Inventory  = require('../src/models/inventory.model');
const ExpenseCategory = require('../src/models/expenseCategory.model');
const Expense    = require('../src/models/expense.model');
const BillingActivityLog = require('../src/models/billingActivityLog.model');
const Role       = require('../src/models/role.model');
const ClinicPatient = require('../src/models/clinicPatient.model');

const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels } = require('../src/db/tenantModels');

// ─── helpers ─────────────────────────────────────────────
const pad = (s) => String(s).padEnd(22);
const log = (label, count, skipped = 0) =>
    console.log(`  ✔  ${pad(label)} inserted: ${count}  skipped/dup: ${skipped}`);

/**
 * Bulk-upsert an array of plain objects into a Mongoose model.
 * Uses findByIdAndUpdate with upsert:true so re-running is safe (idempotent).
 */
async function bulkUpsert(TenantModel, docs) {
    if (!docs || docs.length === 0) return { inserted: 0, skipped: 0 };
    let inserted = 0, skipped = 0;
    for (const doc of docs) {
        try {
            const plain = doc.toObject ? doc.toObject() : doc;
            await TenantModel.findByIdAndUpdate(
                plain._id,
                plain,
                { upsert: true, new: true, runValidators: false, setDefaultsOnInsert: true }
            );
            inserted++;
        } catch (err) {
            if (err.code === 11000) {
                skipped++;   // already exists with same unique key
            } else {
                console.warn(`    ⚠  Skipped doc ${doc._id}: ${err.message}`);
                skipped++;
            }
        }
    }
    return { inserted, skipped };
}

// ─── main migration ───────────────────────────────────────
async function migrateHospital(hospital) {
    const hospitalId = hospital._id;
    const hid        = String(hospitalId);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🏥  Hospital: ${hospital.name}  (${hid})`);
    console.log(`${'═'.repeat(60)}`);

    // Open (or reuse) tenant DB connection
    const tenantDb = await getTenantConnection(hid);
    const M        = getTenantModels(tenantDb);

    const filter = { hospitalId };

    // 1. Roles (hospital-scoped only)
    const roles = await Role.find({ hospitalId }).lean();
    const rr = await bulkUpsert(M.Role, roles);
    log('roles', rr.inserted, rr.skipped);

    // 2. Users (staff + patients belonging to this hospital)
    const users = await User.find(filter).lean();
    const ur = await bulkUpsert(M.User, users);
    log('users', ur.inserted, ur.skipped);

    // 3. Doctors
    const doctors = await Doctor.find(filter).lean();
    const dr = await bulkUpsert(M.Doctor, doctors);
    log('doctors', dr.inserted, dr.skipped);

    // 4. Labs
    const labs = await Lab.find(filter).lean();
    const lr = await bulkUpsert(M.Lab, labs);
    log('labs', lr.inserted, lr.skipped);

    // 5. Pharmacies
    const pharmacies = await Pharmacy.find(filter).lean();
    const pr = await bulkUpsert(M.Pharmacy, pharmacies);
    log('pharmacies', pr.inserted, pr.skipped);

    // 6. Receptions
    const receptions = await Reception.find(filter).lean();
    const rec = await bulkUpsert(M.Reception, receptions);
    log('receptions', rec.inserted, rec.skipped);

    // 7. Appointments
    const appointments = await Appointment.find(filter).lean();
    const ar = await bulkUpsert(M.Appointment, appointments);
    log('appointments', ar.inserted, ar.skipped);

    // 8. Admissions
    const admissions = await Admission.find(filter).lean();
    const admr = await bulkUpsert(M.Admission, admissions);
    log('admissions', admr.inserted, admr.skipped);

    // 9. ClinicalVisits (may use patientId reference — filter by hospitalId)
    const clinicalVisits = await ClinicalVisit.find(filter).lean();
    const cvr = await bulkUpsert(M.ClinicalVisit, clinicalVisits);
    log('clinicalvisits', cvr.inserted, cvr.skipped);

    // 10. Lab Reports
    const labReports = await LabReport.find(filter).lean();
    const labrr = await bulkUpsert(M.LabReport, labReports);
    log('labreports', labrr.inserted, labrr.skipped);

    // 11. Pharmacy Orders
    const pharmOrders = await PharmacyOrder.find(filter).lean();
    const por = await bulkUpsert(M.PharmacyOrder, pharmOrders);
    log('pharmacyorders', por.inserted, por.skipped);

    // 12. Invoices
    const invoices = await Invoice.find(filter).lean();
    const invr = await bulkUpsert(M.Invoice, invoices);
    log('invoices', invr.inserted, invr.skipped);

    // 13. Refunds
    const refunds = await Refund.find(filter).lean();
    const rfr = await bulkUpsert(M.Refund, refunds);
    log('refunds', rfr.inserted, rfr.skipped);

    // 14. Facility Charges
    const facilityCharges = await FacilityCharge.find(filter).lean();
    const fcr = await bulkUpsert(M.FacilityCharge, facilityCharges);
    log('facilityscharges', fcr.inserted, fcr.skipped);

    // 15. Inventory
    const inventories = await Inventory.find(filter).lean();
    const inr = await bulkUpsert(M.Inventory, inventories);
    log('inventories', inr.inserted, inr.skipped);

    // 16. Expense Categories
    const expCats = await ExpenseCategory.find(filter).lean();
    const ecr = await bulkUpsert(M.ExpenseCategory, expCats);
    log('expensecategories', ecr.inserted, ecr.skipped);

    // 17. Expenses
    const expenses = await Expense.find(filter).lean();
    const expr = await bulkUpsert(M.Expense, expenses);
    log('expenses', expr.inserted, expr.skipped);

    // 18. Billing Activity Logs
    const billingLogs = await BillingActivityLog.find(filter).lean();
    const blr = await bulkUpsert(M.BillingActivityLog, billingLogs);
    log('billingactivitylogs', blr.inserted, blr.skipped);

    // 19. Clinic Patients
    const clinicPatients = await ClinicPatient.find(filter).lean();
    const cpr = await bulkUpsert(M.ClinicPatient, clinicPatients);
    log('clinicpatients', cpr.inserted, cpr.skipped);

    // 20. Hospital metadata (store a copy in the tenant DB itself)
    const hospitalPlain = hospital.toObject ? hospital.toObject() : hospital;
    await bulkUpsert(M.Hospital, [hospitalPlain]);
    log('hospital_meta', 1, 0);

    console.log(`\n✅  ${hospital.name} migration complete.`);
}

async function main() {
    console.log('\n🚀  Starting Full Tenant DB Migration...');
    console.log(`    Master DB: ${process.env.MONGODB_URL}\n`);

    await mongoose.connect(process.env.MONGODB_URL, {
        serverSelectionTimeoutMS: 30000,
    });
    console.log('✅  Connected to Master DB');

    const hospitals = await Hospital.find({});
    console.log(`🏥  Found ${hospitals.length} hospital(s): ${hospitals.map(h => h.name).join(', ')}`);

    for (const hospital of hospitals) {
        await migrateHospital(hospital);
    }

    console.log('\n\n🎉  ALL HOSPITALS MIGRATED SUCCESSFULLY!');
    console.log('    You can now verify data in MongoDB Compass for each tenant DB.\n');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('❌  Migration failed:', err);
    process.exit(1);
});
