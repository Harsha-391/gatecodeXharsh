require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

// Configure standard DNS resolvers to prevent ECONNREFUSED issues on Windows
const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}

const MasterHospitalPatient = require('../src/models/hospitalPatient.model');
const MasterUser = require('../src/models/user.model');
const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels } = require('../src/db/tenantModels');

async function inspect() {
    const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://jabbamaster00_db_user:lvdtPEPM0i8hRCuh@cluster0.w01dnsr.mongodb.net/';
    await mongoose.connect(mongoUrl);

    const name = 'Raj Kumar Rao';

    console.log('=== MASTER DATABASE ===');
    const masterHospitalPatient = await MasterHospitalPatient.findOne({ name }).lean();
    console.log('Master HospitalPatient found:', masterHospitalPatient ? 'YES' : 'NO');
    if (masterHospitalPatient) console.log(masterHospitalPatient);

    const masterUser = await MasterUser.findOne({ name }).lean();
    console.log('Master User found:', masterUser ? 'YES' : 'NO');
    if (masterUser) console.log(masterUser);

    console.log('\n=== TENANT DATABASE ===');
    const hospitalId = '6a200269d01a91451fefb80d';
    const tenantDb = await getTenantConnection(hospitalId);
    if (tenantDb) {
        const collections = await tenantDb.db.listCollections().toArray();
        console.log('Tenant Collections list:', collections.map(c => c.name));

        const TenantHospitalPatient = getTenantModels(tenantDb).HospitalPatient;
        const tenantHospitalPatient = await TenantHospitalPatient.findOne({ name }).lean();
        console.log('Tenant HospitalPatient found:', tenantHospitalPatient ? 'YES' : 'NO');
        if (tenantHospitalPatient) console.log(tenantHospitalPatient);

        // Also check clinicpatients collection
        try {
            const clinicPatientsColl = tenantDb.collection('clinicpatients');
            const cp = await clinicPatientsColl.findOne({ name });
            console.log('Tenant clinicpatients collection search:', cp ? 'YES' : 'NO');
            if (cp) console.log(cp);
        } catch (e) {
            console.error('Error querying clinicpatients in tenant DB:', e.message);
        }
    }

    await mongoose.disconnect();
}

inspect().catch(console.error);
