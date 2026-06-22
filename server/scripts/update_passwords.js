require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/user.model');

async function main() {
    await mongoose.connect(process.env.MONGODB_URL);
    const source = await User.findOne({ email: 'reception@crm.com' });
    if (source) {
        await User.updateOne({ email: 'admitadmin@crm.com' }, { $set: { password: source.password } });
        await User.updateOne({ email: 'administrator@crm.com' }, { $set: { password: source.password } });
        await User.updateOne({ email: 'admin@admin.com' }, { $set: { password: source.password } });
        await User.updateOne({ email: 'accountant@crm.com' }, { $set: { password: source.password } });
        console.log('Successfully updated passwords!');
    } else {
        console.error('Source user reception@crm.com not found!');
    }
    await mongoose.disconnect();
}

main().catch(console.error);
