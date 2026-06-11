const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';

const mergeTestNames = (names) => {
    if (!Array.isArray(names)) return [];
    const merged = [];
    let temp = '';
    let openCount = 0;

    for (const name of names) {
        if (!name) continue;
        const trimmed = name.trim();
        const openParen = (trimmed.match(/\(/g) || []).length;
        const closeParen = (trimmed.match(/\)/g) || []).length;

        if (temp) {
            temp += ', ' + trimmed;
        } else {
            temp = trimmed;
        }

        openCount += openParen - closeParen;

        if (openCount <= 0) {
            merged.push(temp);
            temp = '';
            openCount = 0;
        }
    }
    if (temp) {
        merged.push(temp);
    }
    return merged;
};

async function main() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;

        // 1. Fetch all lab tests from Master DB to build price map
        console.log('Fetching lab tests...');
        const allLabTests = await db.collection('labtests').find({}).toArray();
        const globalPriceMap = {};
        allLabTests.forEach(t => {
            globalPriceMap[t.name.trim().toLowerCase()] = t.price;
        });

        const adminDb = mongoose.connection.client.db().admin();
        const dbsInfo = await adminDb.listDatabases();
        
        // 2. Loop through all tenant and master DBs to heal reports
        for (const d of dbsInfo.databases) {
            if (d.name === 'HSM' || d.name.startsWith('hms_hospital_')) {
                console.log(`\nProcessing database: ${d.name}...`);
                const conn = mongoose.connection.client.db(d.name);
                const reportsCol = conn.collection('labreports');
                
                const reports = await reportsCol.find({}).toArray();
                console.log(`Found ${reports.length} report(s).`);

                for (const r of reports) {
                    const originalTestNames = [...r.testNames];
                    const mergedNames = mergeTestNames(r.testNames);
                    const hospitalIdStr = r.hospitalId ? r.hospitalId.toString() : null;

                    // Resolve prices
                    let calculatedAmount = 0;
                    mergedNames.forEach(tName => {
                        const trimmedName = tName.trim().toLowerCase();
                        let price = globalPriceMap[trimmedName];
                        if (price === undefined) {
                            // Substring / fuzzy match
                            const matchedTest = allLabTests.find(t => {
                                const dbName = t.name.trim().toLowerCase();
                                return dbName.includes(trimmedName) || trimmedName.includes(dbName);
                            });
                            if (matchedTest) {
                                price = matchedTest.price;
                                if (hospitalIdStr && matchedTest.hospitalPrices) {
                                    const hPrice = matchedTest.hospitalPrices[hospitalIdStr] || matchedTest.hospitalPrices.get?.(hospitalIdStr);
                                    if (hPrice !== undefined && hPrice !== null) {
                                        price = hPrice;
                                    }
                                }
                            }
                        } else {
                            // Check for hospital price override
                            const matchedTest = allLabTests.find(t => t.name.trim().toLowerCase() === trimmedName);
                            if (matchedTest && hospitalIdStr && matchedTest.hospitalPrices) {
                                const hPrice = matchedTest.hospitalPrices[hospitalIdStr] || matchedTest.hospitalPrices.get?.(hospitalIdStr);
                                if (hPrice !== undefined && hPrice !== null) {
                                    price = hPrice;
                                }
                            }
                        }

                        calculatedAmount += (price || 0);
                    });

                    const finalAmount = (!r.amount || r.amount === 0) ? calculatedAmount : r.amount;
                    const needsUpdate = (JSON.stringify(originalTestNames) !== JSON.stringify(mergedNames)) || (!r.amount || r.amount === 0);

                    if (needsUpdate) {
                        console.log(`Healing report ${r._id}:`);
                        console.log(`  - Original: ${JSON.stringify(originalTestNames)}`);
                        console.log(`  - Healed: ${JSON.stringify(mergedNames)}`);
                        console.log(`  - Amount: ${r.amount} -> ${finalAmount}`);

                        await reportsCol.updateOne(
                            { _id: r._id },
                            { $set: { testNames: mergedNames, amount: finalAmount } }
                        );
                    }
                }
            }
        }

        console.log('\nAll databases processed and healed successfully!');
    } catch (err) {
        console.error('Error healing reports:', err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
