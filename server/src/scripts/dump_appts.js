require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    const mongoUrl = process.env.MONGODB_URL;
    await mongoose.connect(mongoUrl);
    
    const masterAppts = await mongoose.connection.db.collection('appointments').find().toArray();
    console.log(`Master DB (HSM) appointments count: ${masterAppts.length}`);
    if (masterAppts.length > 0) {
        console.log('Sample Master Appointment ID:', masterAppts[0]._id, 'Patient:', masterAppts[0].patientId || masterAppts[0].userId);
    }
    
    // Connect to tenant DB
    const tenantDbName = 'hms_hospital_6a1fd6d7582ad08b491956de';
    const tenantConn = mongoose.createConnection(`${mongoUrl.substring(0, mongoUrl.lastIndexOf('/'))}/${tenantDbName}`);
    await new Promise(r => tenantConn.once('open', r));
    
    const tenantAppts = await tenantConn.db.collection('appointments').find().toArray();
    console.log(`Tenant DB (${tenantDbName}) appointments count: ${tenantAppts.length}`);
    if (tenantAppts.length > 0) {
        console.log('Sample Tenant Appointment ID:', tenantAppts[0]._id, 'Patient:', tenantAppts[0].patientId || tenantAppts[0].userId);
    }
    
    await tenantConn.close();
    await mongoose.disconnect();
}

main().catch(console.error);
