require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    const mongoUrl = process.env.MONGODB_URL;
    await mongoose.connect(mongoUrl);
    
    const masterUsers = await mongoose.connection.db.collection('users').find().toArray();
    console.log(`Master DB (HSM) users count: ${masterUsers.length}`);
    if (masterUsers.length > 0) {
        console.log('Sample Master User:', masterUsers[0].name, 'Email:', masterUsers[0].email, 'Role:', masterUsers[0].role);
    }
    
    // Connect to tenant DB
    const tenantDbName = 'hms_hospital_6a1fd6d7582ad08b491956de';
    const tenantConn = mongoose.createConnection(`${mongoUrl.substring(0, mongoUrl.lastIndexOf('/'))}/${tenantDbName}`);
    await new Promise(r => tenantConn.once('open', r));
    
    const tenantUsers = await tenantConn.db.collection('users').find().toArray();
    console.log(`Tenant DB (${tenantDbName}) users count: ${tenantUsers.length}`);
    if (tenantUsers.length > 0) {
        console.log('Sample Tenant User:', tenantUsers[0].name, 'Email:', tenantUsers[0].email, 'Role:', tenantUsers[0].role);
    }
    
    await tenantConn.close();
    await mongoose.disconnect();
}

main().catch(console.error);
