/**
 * Seed Tenant-Specific Billing and Clinical Data
 * Run: node seed-billing.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Master Models (source data)
const MasterHospital = require('./src/models/hospital.model');
const MasterUser = require('./src/models/user.model');
const MasterAppointment = require('./src/models/appointment.model');
const MasterLabReport = require('./src/models/labReport.model');
const MasterPharmacyOrder = require('./src/models/pharmacyOrder.model');

// Tenant Connection Resolvers
const { getTenantConnection } = require('./src/db/tenantDb');
const { getTenantModels } = require('./src/db/tenantModels');

const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';

async function seedTenantBilling() {
    try {
        console.log('⏳ Connecting to Master MongoDB...');
        await mongoose.connect(DB_URI);
        console.log('✅ Connected to Master MongoDB.');

        // 1. Resolve Hospital ID
        const hospital = await MasterHospital.findOne({ slug: 'admit' });
        if (!hospital) {
            console.error('❌ Hospital "Admit Hospital" not found. Please run reset-database.js first.');
            process.exit(1);
        }
        const hospitalId = hospital._id;
        console.log(`🏥 Hospital Resolved: Admit Hospital (ID: ${hospitalId})`);

        // 2. Connect to Tenant Database
        const tenantDb = await getTenantConnection(String(hospitalId));
        const {
            User: TenantUser,
            Appointment: TenantAppointment,
            LabReport: TenantLabReport,
            PharmacyOrder: TenantPharmacyOrder,
            FacilityCharge: TenantFacilityCharge,
            Admission: TenantAdmission,
            Invoice: TenantInvoice,
            Refund: TenantRefund,
            BillingActivityLog: TenantBillingActivityLog
        } = getTenantModels(tenantDb);

        console.log(`🧹 Clearing old tenant-specific records in database: hms_hospital_${hospitalId}...`);
        await Promise.all([
            TenantUser.deleteMany({}),
            TenantAppointment.deleteMany({}),
            TenantLabReport.deleteMany({}),
            TenantPharmacyOrder.deleteMany({}),
            TenantFacilityCharge.deleteMany({}),
            TenantAdmission.deleteMany({}),
            TenantInvoice.deleteMany({}),
            TenantRefund.deleteMany({}),
            TenantBillingActivityLog.deleteMany({})
        ]);
        console.log('✅ Tenant database cleared.');

        // 3. Copy Clinical data from Master to Tenant
        console.log('📋 Copying Master users, patients, and clinical records to the Tenant database...');
        
        // Copy Users
        const masterUsers = await MasterUser.find({});
        if (masterUsers.length > 0) {
            await TenantUser.insertMany(masterUsers);
            console.log(`   + Copied ${masterUsers.length} Users/Staff/Patients.`);
        }

        // Copy Appointments
        const masterAppointments = await MasterAppointment.find({ hospitalId });
        if (masterAppointments.length > 0) {
            const tenantAppointments = masterAppointments.map(app => {
                let pStatus = 'Pending';
                if (app.paymentStatus) {
                    const lStatus = app.paymentStatus.toLowerCase();
                    if (lStatus === 'paid') pStatus = 'Paid';
                    else if (lStatus === 'waived') pStatus = 'Waived';
                }
                
                return {
                    _id: app._id,
                    patientId: app.userId,
                    doctorId: app.doctorUserId || app.doctorId,
                    hospitalId: app.hospitalId,
                    appointmentDate: app.appointmentDate,
                    appointmentTime: app.appointmentTime,
                    tokenNumber: app.tokenNumber,
                    status: app.status || 'Scheduled',
                    paymentStatus: pStatus,
                    amount: app.amount,
                    notes: app.notes,
                    doctorName: app.doctorName,
                    serviceName: app.serviceName,
                    recommendAdmission: app.recommendAdmission,
                    recommendAdmissionNotes: app.recommendAdmissionNotes,
                    recommendAdmissionPriority: app.recommendAdmissionPriority,
                    recommendAdmissionDept: app.recommendAdmissionDept
                };
            });
            await TenantAppointment.insertMany(tenantAppointments);
            console.log(`   + Copied and mapped ${tenantAppointments.length} Appointments.`);
        }

        // Copy Lab Reports
        const masterLabReports = await MasterLabReport.find({ hospitalId });
        if (masterLabReports.length > 0) {
            await TenantLabReport.insertMany(masterLabReports);
            console.log(`   + Copied ${masterLabReports.length} Lab Reports.`);
        }

        // Copy Pharmacy Orders
        const masterPharmacyOrders = await MasterPharmacyOrder.find({ hospitalId });
        if (masterPharmacyOrders.length > 0) {
            const tenantPharmacyOrders = masterPharmacyOrders.map(order => {
                let pStatus = 'Pending';
                if (order.paymentStatus) {
                    const lStatus = order.paymentStatus.toLowerCase();
                    if (lStatus === 'paid') pStatus = 'Paid';
                }

                return {
                    _id: order._id,
                    appointmentId: order.appointmentId,
                    patientId: order.patientId || String(order.userId),
                    userId: order.userId,
                    doctorId: order.doctorId,
                    items: (order.items || []).map(item => ({
                        medicineName: item.medicineName || item.name,
                        frequency: item.frequency,
                        duration: item.duration,
                        price: item.price,
                        purchased: item.purchased,
                        unitPrice: item.unitPrice,
                        quantity: item.quantity || item.qty || 1,
                        totalPrice: item.totalPrice
                    })),
                    totalAmount: order.totalAmount,
                    paymentStatus: pStatus,
                    hospitalId: order.hospitalId
                };
            });
            await TenantPharmacyOrder.insertMany(tenantPharmacyOrders);
            console.log(`   + Copied and mapped ${tenantPharmacyOrders.length} Pharmacy Orders.`);
        }

        // 4. Resolve Specific Patients for Billing Seeding
        const amit = await TenantUser.findOne({ email: 'amit.singh@gmail.com' });
        const priya = await TenantUser.findOne({ email: 'priya.verma@yahoo.com' });
        const rahul = await TenantUser.findOne({ email: 'rahul.roy@gmail.com' });
        const sneha = await TenantUser.findOne({ email: 'sneha.g@outlook.com' });
        const billingStaff = await TenantUser.findOne({ email: 'billing@crm.com' });

        if (!amit || !priya || !rahul || !sneha || !billingStaff) {
            console.error('❌ Failed to resolve newly copied tenant patient users.');
            process.exit(1);
        }

        console.log('🌱 Seeding billing invoices and ledger logs directly into the Tenant database...');

        const invoicesList = [];
        const refundsList = [];
        const logsList = [];
        let invoiceCounter = 1;
        let receiptCounter = 1;
        const now = new Date();

        const servicesList = [
            { type: 'Consultation', name: 'Consultation - Cardiology (Dr. Rajesh Kumar)', fee: 800 },
            { type: 'Consultation', name: 'Consultation - Gynecology (Dr. Sarah Jenkins)', fee: 600 },
            { type: 'Consultation', name: 'Consultation - Pediatrics (Dr. Anita Desai)', fee: 500 },
            { type: 'Consultation', name: 'Consultation - Orthopedics (Dr. David Miller)', fee: 600 },
            { type: 'Consultation', name: 'Consultation - Dermatology (Dr. Priya Sharma)', fee: 550 },
            { type: 'Laboratory', name: 'Laboratory: CBC & Blood Count', fee: 400 },
            { type: 'Laboratory', name: 'Laboratory: Lipid Profile', fee: 600 },
            { type: 'Laboratory', name: 'Laboratory: Thyroid Screen', fee: 550 },
            { type: 'Laboratory', name: 'Laboratory: Blood Sugar Mapping', fee: 350 },
            { type: 'Laboratory', name: 'Laboratory: Renal Function Test', fee: 700 },
            { type: 'Pharmacy', name: 'Pharmacy Dispensed Medicines (Antibiotics + Analgesics)', fee: 320 },
            { type: 'Pharmacy', name: 'Pharmacy Dispensed Medicines (Antidiabetics)', fee: 240 },
            { type: 'Pharmacy', name: 'Pharmacy Dispensed Medicines (Cardiac Beta-blockers)', fee: 480 },
            { type: 'Admission', name: 'Facility Usage: Oxygen Concentrator Therapy (1 day)', fee: 1200 },
            { type: 'Admission', name: 'Facility Usage: Physiotherapy Session (2 days)', fee: 900 }
        ];

        const paymentMethods = ['Cash', 'Card', 'UPI', 'Bank Transfer'];
        const billingStatuses = ['Paid', 'Partially Paid', 'Pending', 'Cancelled'];

        // Seed 1-2 Invoices for all patients in the list
        const testPatients = [amit, priya, rahul, sneha];
        // Get all other patients to populate stats fully
        const allPatients = await TenantUser.find({ email: { $in: emails = [
            'amit.singh@gmail.com', 'priya.verma@yahoo.com', 'rahul.roy@gmail.com', 'sneha.g@outlook.com',
            'vikram.m@gmail.com', 'kiran.patel@gmail.com', 'arjun.reddy@gmail.com', 'deepa.nair@hotmail.com',
            'manish.s@gmail.com', 'rohan.joshi@gmail.com', 'anjali.sen@gmail.com', 'abhishek.m@gmail.com',
            'divya.iyer@gmail.com', 'sanjay.d@gmail.com', 'meera.k@gmail.com'
        ] } });

        for (let i = 0; i < allPatients.length; i++) {
            const patient = allPatients[i];
            
            // 1. Fully Paid Invoice
            const pMethod = paymentMethods[i % paymentMethods.length];
            const date = new Date();
            date.setDate(now.getDate() - (i % 15) - 2); // 2 to 17 days ago

            const item1 = servicesList[i % servicesList.length];
            const item2 = servicesList[(i + 3) % servicesList.length];
            const item3 = servicesList[(i + 7) % servicesList.length];
            
            const gTotal = item1.fee + item2.fee + item3.fee;
            const invNum = `INV-2026-${String(invoiceCounter++).padStart(6, '0')}`;
            const recNum = `REC-2026-${String(receiptCounter++).padStart(6, '0')}`;

            invoicesList.push({
                hospitalId,
                patientId: patient._id,
                patientName: patient.name,
                invoiceNumber: invNum,
                invoiceDate: date,
                items: [
                    { itemType: item1.type, itemId: new mongoose.Types.ObjectId(), name: item1.name, quantity: 1, unitPrice: item1.fee, totalAmount: item1.fee, paymentStatus: 'Paid' },
                    { itemType: item2.type, itemId: new mongoose.Types.ObjectId(), name: item2.name, quantity: 1, unitPrice: item2.fee, totalAmount: item2.fee, paymentStatus: 'Paid' },
                    { itemType: item3.type, itemId: new mongoose.Types.ObjectId(), name: item3.name, quantity: 1, unitPrice: item3.fee, totalAmount: item3.fee, paymentStatus: 'Paid' }
                ],
                grandTotal: gTotal,
                amountPaid: gTotal,
                outstandingAmount: 0,
                paymentStatus: 'Paid',
                payments: [
                    {
                        receiptNumber: recNum,
                        amount: gTotal,
                        date: date,
                        method: pMethod,
                        reference: pMethod === 'Cash' ? 'DESK-CASH' : `TXN-${pMethod.toUpperCase()}-${100000 + i}`,
                        collectedBy: billingStaff._id,
                        collectedByName: billingStaff.name
                    }
                ],
                generatedBy: billingStaff._id,
                generatedByName: billingStaff.name
            });

            logsList.push({
                hospitalId,
                performedBy: billingStaff._id,
                performedByName: billingStaff.name,
                action: 'Invoice Generated',
                patientId: patient._id,
                patientName: patient.name,
                details: `Consolidated Invoice ${invNum} generated for ${patient.name}. Total: ₹${gTotal}`
            });

            logsList.push({
                hospitalId,
                performedBy: billingStaff._id,
                performedByName: billingStaff.name,
                action: 'Payment Collected',
                patientId: patient._id,
                patientName: patient.name,
                details: `Collected payment of ₹${gTotal} on invoice ${invNum} via ${pMethod}. Receipt: ${recNum}`
            });

            // 2. Unpaid/Partially Paid/Cancelled Invoice (alternate patients)
            if (i % 2 === 0) {
                const altStatus = billingStatuses[(i / 2) % billingStatuses.length];
                const dateAlt = new Date();
                dateAlt.setDate(now.getDate() - (i % 10)); // 0 to 9 days ago
                
                const itemAlt = servicesList[(i + 1) % servicesList.length];
                const totalAlt = itemAlt.fee;
                const invNumAlt = `INV-2026-${String(invoiceCounter++).padStart(6, '0')}`;

                let amtPaid = 0;
                let outAmt = totalAlt;
                let payments = [];

                if (altStatus === 'Paid') {
                    const recNumAlt = `REC-2026-${String(receiptCounter++).padStart(6, '0')}`;
                    amtPaid = totalAlt;
                    outAmt = 0;
                    payments.push({
                        receiptNumber: recNumAlt,
                        amount: totalAlt,
                        date: dateAlt,
                        method: 'UPI',
                        reference: `TXN-UPI-${800000 + i}`,
                        collectedBy: billingStaff._id,
                        collectedByName: billingStaff.name
                    });
                } else if (altStatus === 'Partially Paid') {
                    const recNumAlt = `REC-2026-${String(receiptCounter++).padStart(6, '0')}`;
                    amtPaid = Math.floor(totalAlt / 2);
                    outAmt = totalAlt - amtPaid;
                    payments.push({
                        receiptNumber: recNumAlt,
                        amount: amtPaid,
                        date: dateAlt,
                        method: 'Card',
                        reference: `TXN-CARD-${700000 + i}`,
                        collectedBy: billingStaff._id,
                        collectedByName: billingStaff.name
                    });
                } else if (altStatus === 'Cancelled') {
                    amtPaid = 0;
                    outAmt = totalAlt;
                }

                invoicesList.push({
                    hospitalId,
                    patientId: patient._id,
                    patientName: patient.name,
                    invoiceNumber: invNumAlt,
                    invoiceDate: dateAlt,
                    items: [
                        {
                            itemType: itemAlt.type,
                            itemId: new mongoose.Types.ObjectId(),
                            name: itemAlt.name,
                            quantity: 1,
                            unitPrice: itemAlt.fee,
                            totalAmount: totalAlt,
                            paymentStatus: altStatus === 'Paid' ? 'Paid' : 'Pending'
                        }
                    ],
                    grandTotal: totalAlt,
                    amountPaid: amtPaid,
                    outstandingAmount: outAmt,
                    paymentStatus: altStatus,
                    payments,
                    generatedBy: billingStaff._id,
                    generatedByName: billingStaff.name
                });

                logsList.push({
                    hospitalId,
                    performedBy: billingStaff._id,
                    performedByName: billingStaff.name,
                    action: altStatus === 'Cancelled' ? 'Invoice Cancelled' : 'Invoice Generated',
                    patientId: patient._id,
                    patientName: patient.name,
                    details: altStatus === 'Cancelled' ? `Cancelled invoice ${invNumAlt}` : `Consolidated Invoice ${invNumAlt} generated for ${patient.name}. Total: ₹${totalAlt}`
                });

                if (amtPaid > 0) {
                    logsList.push({
                        hospitalId,
                        performedBy: billingStaff._id,
                        performedByName: billingStaff.name,
                        action: 'Payment Collected',
                        patientId: patient._id,
                        patientName: patient.name,
                        details: `Collected payment of ₹${amtPaid} on invoice ${invNumAlt} via Card. Receipt: REC-2026-${receiptCounter - 1}`
                    });
                }
            }
        }

        await TenantInvoice.insertMany(invoicesList);
        console.log(`   + Seeded ${invoicesList.length} Tenant Invoices.`);

        // 5. Seed Refunds
        refundsList.push(
            {
                hospitalId,
                patientId: rahul._id,
                patientName: rahul.name,
                invoiceNumber: 'INV-2026-000003',
                refundType: 'Cancelled Lab Test',
                itemId: new mongoose.Types.ObjectId(),
                amount: 400,
                reason: 'Doctor cancelled Cardiology Consultation.',
                status: 'Refund Pending',
                requestedBy: billingStaff._id,
                requestedByName: billingStaff.name,
                history: [{ status: 'Refund Pending', performedBy: billingStaff._id, performedByName: billingStaff.name, notes: 'Technician flagged cancellation.' }]
            },
            {
                hospitalId,
                patientId: amit._id,
                patientName: amit.name,
                invoiceNumber: 'INV-2026-000001',
                refundType: 'Returned Medicine',
                itemId: new mongoose.Types.ObjectId(),
                amount: 250,
                reason: 'Patient returned unopened medicines.',
                status: 'Refunded',
                requestedBy: billingStaff._id,
                requestedByName: billingStaff.name,
                approvedBy: billingStaff._id,
                approvedByName: billingStaff.name,
                actionDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                history: [
                    { status: 'Refund Pending', performedBy: billingStaff._id, performedByName: billingStaff.name, notes: 'Returned to pharmacy inventory.' },
                    { status: 'Refunded', performedBy: billingStaff._id, performedByName: billingStaff.name, notes: 'Cash returned to patient.' }
                ]
            }
        );
        await TenantRefund.insertMany(refundsList);
        console.log(`   + Seeded ${refundsList.length} Tenant Refunds.`);

        // 6. Seed active Admissions
        const admissionsData = [
            {
                hospitalId,
                patientId: priya._id,
                patientName: priya.name,
                patientPhone: priya.phone,
                admissionDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                status: 'Admitted',
                ward: 'General Ward',
                bedNumber: 'GW-104',
                requestedDepartment: 'Obstetrics & Gynecology',
                priority: 'Normal',
                selectedFacilities: [
                    { facilityName: 'ICU Monitor Setup', pricePerDay: 1200, days: 3, totalAmount: 3600 }
                ],
                totalAmount: 6000,
                paymentStatus: 'Pending',
                notes: 'Admitted for obstetric observation.'
            },
            {
                hospitalId,
                patientId: allPatients[4]._id, // Vikram Malhotra
                patientName: allPatients[4].name,
                patientPhone: allPatients[4].phone,
                admissionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
                status: 'Admitted',
                ward: 'Private Suite',
                bedNumber: 'PS-301',
                requestedDepartment: 'Cardiology',
                priority: 'Urgent',
                selectedFacilities: [
                    { facilityName: 'High-Flow Oxygen Support', pricePerDay: 1800, days: 5, totalAmount: 9000 }
                ],
                totalAmount: 24000,
                paymentStatus: 'Pending',
                notes: 'Admitted for active oxygen therapy.'
            }
        ];
        await TenantAdmission.insertMany(admissionsData);
        console.log(`   + Seeded ${admissionsData.length} Tenant active IPD Admissions.`);

        // 7. Seed pending un-invoiced Facility charges
        await new TenantFacilityCharge({
            hospitalId,
            patientId: amit._id,
            facilityName: 'Premium Physiotherapy Session',
            pricePerDay: 450,
            daysUsed: 2,
            totalAmount: 900,
            paymentStatus: 'Pending',
            addedBy: billingStaff._id
        }).save();

        console.log('   + Seeded pending facility charges.');

        // 8. Add system audit override logs to logs collection
        logsList.push(
            { hospitalId, performedBy: billingStaff._id, performedByName: billingStaff.name, action: 'Override Approved', patientId: priya._id, patientName: priya.name, details: 'Authorized billing override for patient Priya Verma to bypass discharge block.' }
        );
        await TenantBillingActivityLog.insertMany(logsList);
        console.log('   + Seeded activity logs.');

        console.log('\n🎉 TENANT DATABASE POPULATED SUCCESSFULLY WITH FULL RELATION DATA!');
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during tenant database seeding:', err);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        process.exit(1);
    }
}

seedTenantBilling();
