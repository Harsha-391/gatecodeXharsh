const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/?retryWrites=true&w=majority')
    .then(async () => {
        const admin = new mongoose.mongo.Admin(mongoose.connection.db);
        const dbs = await admin.listDatabases();
        for (const db of dbs.databases) {
            if (db.name.startsWith('hms_hospital_')) {
                const conn = mongoose.connection.useDb(db.name);
                const orderSchema = require('./src/models/pharmacyOrder.model').schema;
                const userSchema = require('./src/models/user.model').schema;
                const PharmacyOrder = conn.model('PharmacyOrder', orderSchema);
                const User = conn.model('User', userSchema);
                const orders = await PharmacyOrder.find().lean();
                if (orders.length > 0) {
                    console.log(`Found ${orders.length} orders in ${db.name}`);
                    const order = orders[0];
                    console.log('Order doctorId:', order.doctorId);
                    if (order.doctorId) {
                        const doctorUser = await User.findById(order.doctorId).lean();
                        console.log('Doctor User object:', doctorUser);
                    }
                }
            }
        }
        process.exit(0);
    })
    .catch(console.error);
