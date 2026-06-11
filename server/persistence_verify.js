require('dotenv').config();
const mongoose = require('mongoose');
const { getTenantConnection } = require('./src/db/tenantDb');
const { getTenantModels } = require('./src/db/tenantModels');

const MasterMedicine = require('./src/models/medicine.model');
const MasterPharmacy = require('./src/models/pharmacy.model');
const MasterNotification = require('./src/models/notification.model');
const Hospital = require('./src/models/hospital.model');
const MasterUser = require('./src/models/user.model');

const MONGO_URI = 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';

async function runVerification() {
    try {
        console.log('Connecting to master MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected to Master DB successfully!\n');

        // Find a valid hospital
        const hospital = await Hospital.findOne({});
        if (!hospital) {
            console.error('No hospital found in master database! Cannot run tenant checks.');
            await mongoose.disconnect();
            return;
        }

        const hospitalId = hospital._id.toString();
        const tenantDbName = `hms_hospital_${hospitalId}`;
        console.log(`--- DATABASE CONFIGURATION ---`);
        console.log(`Master DB Name: HSM`);
        console.log(`Active Hospital ID: ${hospitalId}`);
        console.log(`Tenant DB Name: ${tenantDbName}\n`);

        // Get tenant DB connection
        const tenantConn = await getTenantConnection(hospitalId);
        const tenantModels = getTenantModels(tenantConn);

        const results = [];

        async function verifyCRUD(name, isTenant, model, createData, updateData) {
            console.log(`[${name}] Starting CRUD test...`);
            const stageResults = { module: name, database: isTenant ? tenantDbName : 'HSM', collection: model.collection.name };
            try {
                // 1. CREATE
                const doc = new model(createData);
                await doc.save();
                console.log(`  -> Created document with ID: ${doc._id}`);
                stageResults.createId = doc._id.toString();

                // Verification of existence
                const foundAfterCreate = await model.findById(doc._id);
                stageResults.createVerified = foundAfterCreate ? true : false;
                console.log(`  -> Verified existence: ${stageResults.createVerified}`);

                // 2. UPDATE
                Object.assign(doc, updateData);
                await doc.save();
                console.log(`  -> Updated document`);
                
                // Verification of update
                const foundAfterUpdate = await model.findById(doc._id);
                let updateVerified = true;
                for (const key of Object.keys(updateData)) {
                    if (foundAfterUpdate[key] !== updateData[key] && JSON.stringify(foundAfterUpdate[key]) !== JSON.stringify(updateData[key])) {
                        updateVerified = false;
                    }
                }
                stageResults.updateVerified = updateVerified;
                console.log(`  -> Verified update: ${stageResults.updateVerified}`);

                // 3. DELETE
                await model.findByIdAndDelete(doc._id);
                console.log(`  -> Deleted document`);

                // Verification of deletion
                const foundAfterDelete = await model.findById(doc._id);
                stageResults.deleteVerified = foundAfterDelete === null;
                console.log(`  -> Verified deletion: ${stageResults.deleteVerified}\n`);
            } catch (err) {
                console.error(`  -> Failed:`, err.message);
                stageResults.error = err.message;
            }
            results.push(stageResults);
        }

        // Setup a test patient user in tenant DB for ref fields if needed
        const testUser = new tenantModels.User({
            name: 'Verification Test Patient',
            email: `test_patient_${Date.now()}@test.com`,
            role: 'patient',
            hospitalId: hospital._id
        });
        await testUser.save();
        const testPatientId = testUser._id;

        // Setup test doctor in master
        const testDoctor = new MasterUser({
            name: 'Verification Test Doctor',
            email: `test_doctor_${Date.now()}@test.com`,
            role: 'doctor',
            hospitalId: hospital._id
        });
        await testDoctor.save();

        // 1. Medicines (Master)
        await verifyCRUD('Medicines', false, MasterMedicine, {
            name: `Test Medicine ${Date.now()}`,
            genericName: 'Test Generic',
            category: 'General',
            description: 'Test Verification medicine'
        }, {
            category: 'Antibiotics'
        });

        // 2. Pharmacies (Master)
        await verifyCRUD('Pharmacies', false, MasterPharmacy, {
            name: `Test Pharmacy ${Date.now()}`,
            hospitalId: hospital._id,
            email: `pharmacy_${Date.now()}@test.com`,
            phone: '1234567890',
            address: '123 Test St'
        }, {
            address: '456 Updated St'
        });

        // 3. Notifications (Master)
        await verifyCRUD('Notifications', false, MasterNotification, {
            senderId: testDoctor._id,
            recipientRole: 'receptionist',
            message: 'Test notification payload',
            referenceType: 'Test',
            referenceId: new mongoose.Types.ObjectId(),
            status: 'Unread',
            patientId: 'PAT-12345'
        }, {
            status: 'Read'
        });

        // 4. Inventory (Tenant)
        await verifyCRUD('Inventory', true, tenantModels.Inventory, {
            hospitalId: hospital._id,
            name: `Test Inv Med ${Date.now()}`,
            salt: 'Test Salt',
            category: 'General',
            stock: 120,
            unit: 'Tablets',
            buyingPrice: 5,
            sellingPrice: 15,
            status: 'In Stock'
        }, {
            stock: 80
        });

        // 5. Appointments (Tenant)
        await verifyCRUD('Appointments', true, tenantModels.Appointment, {
            userId: testPatientId,
            patientId: 'PAT-12345',
            hospitalId: hospital._id,
            doctorName: 'Dr. Test Master',
            appointmentDate: new Date(),
            appointmentTime: '10:30',
            amount: 200,
            status: 'pending'
        }, {
            status: 'confirmed'
        });

        // 6. Admissions (Tenant)
        await verifyCRUD('Admissions', true, tenantModels.Admission, {
            hospitalId: hospital._id,
            patientId: testPatientId,
            patientName: 'Verification Test Patient',
            patientPhone: '1234567890',
            status: 'Pending Allocation',
            priority: 'Normal',
            totalAmount: 100,
            paymentStatus: 'Pending',
            notes: 'Test admission note'
        }, {
            status: 'Admitted',
            ward: 'General Ward A',
            bedNumber: 'Bed 101'
        });

        // 7. Lab Reports (Tenant)
        await verifyCRUD('Lab Reports', true, tenantModels.LabReport, {
            patientId: 'PAT-12345',
            userId: testPatientId,
            doctorId: testDoctor._id,
            hospitalId: hospital._id,
            testNames: ['Blood Routine', 'Thyroid Profile'],
            testStatus: 'PENDING',
            reportStatus: 'PENDING',
            paymentStatus: 'PENDING',
            amount: 750,
            status: 'Pending'
        }, {
            status: 'Sample Collected',
            testStatus: 'IN_PROGRESS'
        });

        // 8. Invoices (Tenant)
        await verifyCRUD('Invoices', true, tenantModels.Invoice, {
            hospitalId: hospital._id,
            patientId: testPatientId,
            patientName: 'Verification Test Patient',
            invoiceNumber: `INV-${Date.now()}`,
            invoiceDate: new Date(),
            items: [{
                itemType: 'Consultation',
                name: 'Consultation Fee',
                quantity: 1,
                unitPrice: 300,
                totalAmount: 300,
                paymentStatus: 'Pending'
            }],
            grandTotal: 300,
            outstandingAmount: 300,
            paymentStatus: 'Pending'
        }, {
            paymentStatus: 'Paid',
            outstandingAmount: 0,
            amountPaid: 300
        });

        // 9. Expenses (Tenant)
        await verifyCRUD('Expenses', true, tenantModels.Expense, {
            hospitalId: hospital._id,
            category: 'Office Supplies',
            amount: 450,
            date: new Date(),
            description: 'Verification testing expense',
            paymentMethod: 'Cash',
            paymentStatus: 'Paid'
        }, {
            amount: 500
        });

        // Clean up test doctor and tenant patient
        await MasterUser.findByIdAndDelete(testDoctor._id);
        await tenantModels.User.findByIdAndDelete(testPatientId);

        console.log(`\nVerification complete. Result summary:`);
        console.log(JSON.stringify(results, null, 2));

    } catch (error) {
        console.error('Fatal Verification Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
}

runVerification();
