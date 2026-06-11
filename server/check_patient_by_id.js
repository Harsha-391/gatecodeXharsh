require('dotenv').config();
const mongoose = require('mongoose');

async function searchInDb(conn, dbName, targetId) {
    try {
        const collections = await conn.db.listCollections().toArray();
        for (const collInfo of collections) {
            const collName = collInfo.name;
            try {
                const doc1 = await conn.db.collection(collName).findOne({ _id: targetId });
                const doc2 = await conn.db.collection(collName).findOne({ _id: new mongoose.Types.ObjectId(targetId) });
                const found = doc1 || doc2;
                if (found) {
                    console.log(`FOUND ${targetId} in Database: ${dbName}, Collection: ${collName}`);
                    console.log(JSON.stringify(found, null, 2));
                }
            } catch (e) {
                // Ignore collection errors
            }
        }
    } catch (err) {
        console.error(`Error listing collections for ${dbName}:`, err.message);
    }
}

async function main() {
    const mongoUrl = process.env.MONGODB_URL;
    await mongoose.connect(mongoUrl);
    
    const targetId = '6a268cd55b9fa6ff401260d2';
    
    await searchInDb(mongoose.connection, 'Master (HSM)', targetId);
    
    const tenantDbName = 'hms_hospital_6a268cd35b9fa6ff40126098';
    const tenantConn = mongoose.createConnection(`${mongoUrl.substring(0, mongoUrl.lastIndexOf('/'))}/${tenantDbName}`);
    await new Promise(r => tenantConn.once('open', r));
    
    await searchInDb(tenantConn, tenantDbName, targetId);
    
    await tenantConn.close();
    await mongoose.disconnect();
}

main().catch(console.error);
