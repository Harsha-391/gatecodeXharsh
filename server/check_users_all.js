require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    const mongoUrl = process.env.MONGODB_URL;
    await mongoose.connect(mongoUrl);
    
    // Check master users
    const masterUsers = await mongoose.connection.db.collection('users').find({
        name: /amit|payal/i
    }).toArray();
    console.log('Master DB users matching amit/payal:', masterUsers.map(u => ({ id: u._id, name: u.name, role: u.role })));
    
    // Connect to tenant DB
    const tenantDbName = 'hms_hospital_6a268cd35b9fa6ff40126098';
    const tenantConn = mongoose.createConnection(`${mongoUrl.substring(0, mongoUrl.lastIndexOf('/'))}/${tenantDbName}`);
    await new Promise(r => tenantConn.once('open', r));
    
    const tenantUsers = await tenantConn.db.collection('users').find({
        name: /amit|payal/i
    }).toArray();
    console.log('Tenant DB users matching amit/payal:', tenantUsers.map(u => ({ id: u._id, name: u.name, role: u.role })));
    
    await tenantConn.close();
    await mongoose.disconnect();
}

main().catch(console.error);
