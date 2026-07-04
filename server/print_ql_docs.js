require('dotenv').config();
const mongoose = require('mongoose');

async function printDocs() {
  try {
    // 1. Master DB
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to Master DB');
    const masterQLs = await mongoose.connection.db.collection('questionlibraries').find({}).toArray();
    console.log('\nMASTER DB QUESTION LIBRARIES:');
    masterQLs.forEach(doc => {
      console.log(`- ID: ${doc._id}, HospitalId: ${doc.hospitalId}, Version: ${doc.version}`);
      console.log('  Keys:', Object.keys(doc.data || {}));
    });
    await mongoose.disconnect();

    // 2. Tenant DB
    const dbName = 'h_admit-6a3bc2edd348ffdf77b819a3';
    const url = process.env.MONGODB_URL.replace(/\/?$/, `/${dbName}`);
    const conn = await mongoose.createConnection(url).asPromise();
    console.log('\nConnected to Tenant DB');
    const tenantQLs = await conn.db.collection('questionlibraries').find({}).toArray();
    console.log('TENANT DB QUESTION LIBRARIES:');
    tenantQLs.forEach(doc => {
      console.log(`- ID: ${doc._id}, HospitalId: ${doc.hospitalId}, Version: ${doc.version}`);
      console.log('  Keys:', Object.keys(doc.data || {}));
    });
    await conn.close();

  } catch (error) {
    console.error('Error:', error);
  }
}

printDocs();
