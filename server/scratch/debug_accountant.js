const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    try {
        const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URL;
        console.log('Connecting to', mongoUrl);
        await mongoose.connect(mongoUrl);
        console.log('Connected to Master DB.');

        // Find accountant user
        const user = await mongoose.connection.db.collection('users').findOne({ email: 'accountant@crm.com' });
        const hospitalId = user.hospitalId;

        // Let's connect to the tenant database
        const tenantDbName = `hms_hospital_${hospitalId.toString()}`;
        console.log(`Connecting to tenant DB: ${tenantDbName}`);
        
        const baseUrl = mongoUrl.substring(0, mongoUrl.lastIndexOf('/'));
        const tenantConn = mongoose.createConnection(`${baseUrl}/${tenantDbName}`);
        await new Promise((resolve) => tenantConn.once('open', resolve));

        const invoices = await tenantConn.db.collection('invoices').find({ paymentStatus: { $ne: 'Cancelled' } }).toArray();

        let todayRevenue = 0;
        let monthlyRevenue = 0;
        let pendingPayments = 0;
        let outstandingDues = 0;
        let totalPaidInvoices = 0;
        let totalPartialPayments = 0;

        let labRevenue = 0;
        let pharmacyRevenue = 0;
        let admissionRevenue = 0;

        let cashCollections = 0;
        let upiCollections = 0;
        let cardCollections = 0;
        let bankCollections = 0;

        const todayStr = new Date().toDateString();
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        invoices.forEach(inv => {
            outstandingDues += inv.outstandingAmount || 0;
            if (inv.paymentStatus === 'Paid') {
                totalPaidInvoices++;
            } else if (inv.paymentStatus === 'Partially Paid') {
                totalPartialPayments++;
            } else if (inv.paymentStatus === 'Pending') {
                pendingPayments += inv.outstandingAmount || 0;
            }

            // Sift through invoice items for source revenue
            if (inv.items) {
                inv.items.forEach(item => {
                    const isPaid = item.paymentStatus === 'Paid' || inv.paymentStatus === 'Paid' || inv.paymentStatus === 'Partially Paid';
                    if (isPaid) {
                        if (item.itemType === 'Laboratory') labRevenue += item.totalAmount || 0;
                        else if (item.itemType === 'Pharmacy') pharmacyRevenue += item.totalAmount || 0;
                        else if (item.itemType === 'Admission') admissionRevenue += item.totalAmount || 0;
                    }
                });
            }

            // payments breakdown
            if (inv.payments) {
                inv.payments.forEach(p => {
                    const payDate = new Date(p.date);
                    if (payDate.toDateString() === todayStr) {
                        todayRevenue += p.amount || 0;
                    }
                    if (payDate.getMonth() === currentMonth && payDate.getFullYear() === currentYear) {
                        monthlyRevenue += p.amount || 0;
                    }

                    if (p.method === 'Cash') cashCollections += p.amount || 0;
                    else if (p.method === 'UPI') upiCollections += p.amount || 0;
                    else if (p.method === 'Card') cardCollections += p.amount || 0;
                    else if (p.method === 'Bank Transfer') bankCollections += p.amount || 0;
                });
            }
        });

        console.log('Analytics response simulation:');
        console.log({
            todayRevenue,
            monthlyRevenue,
            pendingPayments,
            outstandingDues,
            paidInvoices: totalPaidInvoices,
            partialPayments: totalPartialPayments,
            labRevenue,
            pharmacyRevenue,
            admissionRevenue,
            totalCollections: cashCollections + upiCollections + cardCollections + bankCollections,
            cashCollections,
            upiCollections,
            cardCollections,
            bankCollections
        });

        await tenantConn.close();
        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
