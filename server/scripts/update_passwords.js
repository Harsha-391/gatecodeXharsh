require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../src/models/user.model');

async function main() {
    const newPassword = process.argv[2] || process.env.DEFAULT_PASSWORD;
    if (!newPassword) {
        console.error('❌ Error: No password provided.');
        console.log('\nUsage:');
        console.log('  node scripts/update_passwords.js <new_password>');
        console.log('  or set the DEFAULT_PASSWORD environment variable.');
        process.exit(1);
    }

    const MONGO_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!MONGO_URI) {
        console.error('❌ Error: MONGODB_URL is not defined in environment variables.');
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log('🔗 Connected to MongoDB');

    const emailsToUpdate = [
        'admitadmin@crm.com',
        'administrator@crm.com',
        'admin@admin.com',
        'accountant@crm.com'
    ];

    let successCount = 0;
    for (const email of emailsToUpdate) {
        try {
            const user = await User.findOne({ email: email.toLowerCase() });
            if (user) {
                user.password = newPassword;
                await user.save();
                console.log(`✅ Successfully updated password for: ${email}`);
                successCount++;
            } else {
                console.log(`⚠️ User not found: ${email}`);
            }
        } catch (err) {
            console.error(`❌ Failed to update password for ${email}:`, err.message);
        }
    }

    console.log(`\n🎉 Completed password update. Successfully updated ${successCount}/${emailsToUpdate.length} accounts.`);
    await mongoose.disconnect();
}

main().catch(console.error);

