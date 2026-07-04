require('dotenv').config();
const mongoose = require('mongoose');

async function inspectTenant() {
  try {
    const dbName = 'h_admit-6a3bc2edd348ffdf77b819a3';
    // Construct tenant connection URL
    const url = process.env.MONGODB_URL.replace(/\/?$/, `/${dbName}`);
    console.log(`Connecting to tenant DB: ${url}`);
    
    const conn = await mongoose.createConnection(url).asPromise();
    console.log('Connected to tenant DB');

    const collections = await conn.db.listCollections().toArray();
    console.log(`Collections in tenant DB "${dbName}":`);
    for (const coll of collections) {
      const count = await conn.db.collection(coll.name).countDocuments();
      console.log(`- ${coll.name}: ${count} documents`);
    }

    await conn.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

inspectTenant();
