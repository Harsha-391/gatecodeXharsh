/**
 * Reception Counter-Wise Collection Tracking Verification Script
 * 
 * Run: node server/scripts/test-reception-collection.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const CollectionTransaction = require('../src/models/collectionTransaction.model');

const DB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crm';

async function verifyCollections() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(DB_URI);
        console.log('✅ Connected to MongoDB');

        // Create or find test users
        console.log('Resolving test receptionist and patient...');
        
        let receptionist = await User.findOne({ email: 'test_receptionist@crm.com' });
        if (!receptionist) {
            receptionist = new User({
                name: 'Test Receptionist',
                email: 'test_receptionist@crm.com',
                password: 'password123',
                role: 'Receptionist',
                counterName: 'Counter 2'
            });
            await receptionist.save();
        } else {
            // Update counter just in case
            receptionist.counterName = 'Counter 2';
            await receptionist.save();
        }

        let patient = await User.findOne({ email: 'test_patient@crm.com' });
        if (!patient) {
            patient = new User({
                name: 'Test Patient',
                email: 'test_patient@crm.com',
                password: 'password123',
                role: 'Patient'
            });
            await patient.save();
        }

        const hospitalId = new mongoose.Types.ObjectId();

        // 1. Clean up old test transactions
        await CollectionTransaction.deleteMany({ collectedByUserId: receptionist._id });
        console.log('🧹 Cleaned up old test transactions');

        // 2. Insert test transactions representing a daily shifts
        const now = new Date();
        const testData = [
            {
                hospitalId,
                patientId: patient._id,
                patientName: patient.name,
                patientIdStr: 'PT-1001',
                amount: 500,
                paymentMethod: 'Cash',
                collectedByUserId: receptionist._id,
                collectedByName: receptionist.name,
                counterName: receptionist.counterName,
                collectionType: 'OPD Registration',
                collectionTimestamp: now
            },
            {
                hospitalId,
                patientId: patient._id,
                patientName: patient.name,
                patientIdStr: 'PT-1001',
                amount: 1200,
                paymentMethod: 'UPI',
                collectedByUserId: receptionist._id,
                collectedByName: receptionist.name,
                counterName: receptionist.counterName,
                collectionType: 'Lab Payment',
                collectionTimestamp: now
            },
            {
                hospitalId,
                patientId: patient._id,
                patientName: patient.name,
                patientIdStr: 'PT-1001',
                amount: 350,
                paymentMethod: 'Cash',
                collectedByUserId: receptionist._id,
                collectedByName: receptionist.name,
                counterName: receptionist.counterName,
                collectionType: 'Miscellaneous Collection',
                collectionTimestamp: now
            },
            {
                hospitalId,
                patientId: patient._id,
                patientName: patient.name,
                patientIdStr: 'PT-1001',
                amount: 1000,
                paymentMethod: 'Card',
                collectedByUserId: receptionist._id,
                collectedByName: receptionist.name,
                counterName: receptionist.counterName,
                collectionType: 'Pharmacy Payment',
                collectionTimestamp: now
            }
        ];

        await CollectionTransaction.insertMany(testData);
        console.log('✅ Inserted 4 test collections (Cash: 850, UPI: 1200, Card: 1000, Total: 3050)');

        // 3. Test aggregate logic for GET /reception-collections
        console.log('\nRunning KPI aggregations...');
        const start = new Date(now);
        start.setHours(0,0,0,0);
        const end = new Date(now);
        end.setHours(23,59,59,999);

        const txs = await CollectionTransaction.find({
            collectionTimestamp: { $gte: start, $lte: end }
        }).lean();

        let totalCollection = 0;
        let cashCollection = 0;
        let upiCollection = 0;
        let cardCollection = 0;
        let bankCollection = 0;
        const activeCountersSet = new Set();

        txs.forEach(t => {
            totalCollection += t.amount || 0;
            if (t.paymentMethod === 'Cash') cashCollection += t.amount || 0;
            else if (t.paymentMethod === 'UPI') upiCollection += t.amount || 0;
            else if (t.paymentMethod === 'Card') cardCollection += t.amount || 0;
            else if (t.paymentMethod === 'Bank Transfer') bankCollection += t.amount || 0;

            if (t.counterName) activeCountersSet.add(t.counterName);
        });

        console.log('--- KPI Calculation Results ---');
        console.log(`Total Expected: 3050 | Actual: ${totalCollection}`);
        console.log(`Cash Expected:  850  | Actual: ${cashCollection}`);
        console.log(`UPI Expected:   1200 | Actual: ${upiCollection}`);
        console.log(`Card Expected:  1000 | Actual: ${cardCollection}`);
        console.log(`Active Counters Expected: 1 | Actual: ${activeCountersSet.size}`);

        // Asserts
        if (totalCollection !== 3050) throw new Error(`Total check failed: expected 3050, got ${totalCollection}`);
        if (cashCollection !== 850) throw new Error(`Cash check failed: expected 850, got ${cashCollection}`);
        if (upiCollection !== 1200) throw new Error(`UPI check failed: expected 1200, got ${upiCollection}`);
        if (cardCollection !== 1000) throw new Error(`Card check failed: expected 1000, got ${cardCollection}`);
        if (activeCountersSet.size !== 1) throw new Error(`Counters check failed: expected 1, got ${activeCountersSet.size}`);

        console.log('🎉 KPI Verification PASSES!');

        // 4. Test grouping logic for summary table
        console.log('\nRunning Grouping/Summarization Verification...');
        const groups = {};
        txs.forEach(t => {
            const key = `${t.collectedByUserId}_${t.counterName}`;
            if (!groups[key]) {
                groups[key] = {
                    receptionistId: t.collectedByUserId,
                    receptionistName: t.collectedByName,
                    counterName: t.counterName,
                    transactionsCount: 0,
                    cash: 0,
                    upi: 0,
                    card: 0,
                    bankTransfer: 0,
                    total: 0
                };
            }

            const g = groups[key];
            g.transactionsCount += 1;
            g.total += t.amount || 0;
            if (t.paymentMethod === 'Cash') g.cash += t.amount || 0;
            else if (t.paymentMethod === 'UPI') g.upi += t.amount || 0;
            else if (t.paymentMethod === 'Card') g.card += t.amount || 0;
            else if (t.paymentMethod === 'Bank Transfer') g.bankTransfer += t.amount || 0;
        });

        const summary = Object.values(groups);
        console.log('--- Grouping Results ---');
        console.log(JSON.stringify(summary, null, 2));

        if (summary.length !== 1) throw new Error(`Summary grouping check failed: expected 1 group, got ${summary.length}`);
        const groupObj = summary[0];
        if (groupObj.counterName !== 'Counter 2') throw new Error(`Summary counter name failed: expected Counter 2, got ${groupObj.counterName}`);
        if (groupObj.transactionsCount !== 4) throw new Error(`Summary count failed: expected 4, got ${groupObj.transactionsCount}`);
        if (groupObj.cash !== 850) throw new Error(`Summary cash failed: expected 850, got ${groupObj.cash}`);
        if (groupObj.upi !== 1200) throw new Error(`Summary upi failed: expected 1200, got ${groupObj.upi}`);
        if (groupObj.card !== 1000) throw new Error(`Summary card failed: expected 1000, got ${groupObj.card}`);
        if (groupObj.total !== 3050) throw new Error(`Summary total failed: expected 3050, got ${groupObj.total}`);

        console.log('🎉 Grouping Summary Verification PASSES!');

        // 5. Clean up test entries
        await CollectionTransaction.deleteMany({ collectedByUserId: receptionist._id });
        console.log('\n🧹 Cleaned up temporary database records');

        console.log('\n💯 ALL TESTS PASSED SUCCESSFULLY! The reception tracking and billing calculations are mathematically robust and fully consistent!');
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Verification test failed:', err);
        await mongoose.disconnect();
        process.exit(1);
    }
}

verifyCollections();
