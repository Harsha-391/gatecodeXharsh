require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URL)
    .then(async () => {
        const admin = new mongoose.mongo.Admin(mongoose.connection.db);
        const dbs = await admin.listDatabases();
        console.log(dbs.databases.map(d => d.name));
        process.exit(0);
    })
    .catch(console.error);
