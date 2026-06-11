const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM')
    .then(async () => {
        const PharmacyOrder = require('./src/models/pharmacyOrder.model');
        const orders = await PharmacyOrder.find().sort({ createdAt: -1 }).limit(2).lean();
        console.log('Orders found:', orders.length);
        if (orders.length > 0) {
            console.log('Order 1:', JSON.stringify(orders[0], null, 2));
        }
        process.exit(0);
    })
    .catch(console.error);
