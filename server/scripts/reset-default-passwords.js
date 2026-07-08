require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../src/models/user.model');

const defaultPasswords = {
  'admin@admin.com': 'admin',
  'reception@crm.com': '123',
  'billing@crm.com': 'Billing@123',
  'accountant@crm.com': 'Accountant@123',
  'pharmacy@crm.com': '123',
  'lab@crm.com': '123',
  'rajesh@crm.com': '123',
  'amit.singh@gmail.com': '123',
  'admitadmin@crm.com': '123',
  'administrator@crm.com': '12344321a'
};

async function main() {
  const MONGO_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URL is not defined in environment variables.');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB successfully.');

    for (const [email, plainPassword] of Object.entries(defaultPasswords)) {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        user.password = plainPassword;
        await user.save();
        console.log(`Updated user: ${email} -> password: "${plainPassword}"`);
      } else {
        console.log(`⚠️ User not found: ${email}`);
      }
    }

    await mongoose.disconnect();
    console.log('🎉 Password reset complete.');
  } catch (error) {
    console.error('Error during password reset:', error);
  }
}

main().catch(console.error);
