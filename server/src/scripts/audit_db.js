require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    const mongoUrl = process.env.MONGODB_URL;
    console.log('Connecting to:', mongoUrl);
    await mongoose.connect(mongoUrl);
    const db = mongoose.connection.db;
    
    // List databases
    const admin = db.admin();
    const { databases } = await admin.listDatabases();
    console.log('\n--- DATABASES ---');
    for (const d of databases) {
        console.log(`Database: ${d.name} (${d.sizeOnDisk} bytes)`);
        
        // Let's connect to each database to list collections and count documents
        const tempConn = mongoose.createConnection(`${mongoUrl.substring(0, mongoUrl.lastIndexOf('/'))}/${d.name}`);
        await new Promise(r => tempConn.once('open', r));
        
        const collections = await tempConn.db.listCollections().toArray();
        for (const col of collections) {
            const count = await tempConn.db.collection(col.name).countDocuments();
            if (count > 0 || d.name !== 'admin' && d.name !== 'local') {
                console.log(`  - Collection: ${col.name} -> Count: ${count}`);
            }
        }
        await tempConn.close();
    }
    
    await mongoose.disconnect();
}

main().catch(console.error);
