const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/?retryWrites=true&w=majority')
    .then(async () => {
        const admin = new mongoose.mongo.Admin(mongoose.connection.db);
        const dbs = await admin.listDatabases();
        console.log(dbs.databases.map(d => d.name));
        process.exit(0);
    })
    .catch(console.error);
