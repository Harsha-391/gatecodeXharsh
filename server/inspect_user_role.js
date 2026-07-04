require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Role = require('./src/models/role.model');

async function checkRole() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: 'admitadmin@crm.com' });
    console.log('User role ID:', user.role);

    const role = await Role.findById(user.role);
    console.log('Role document:', role);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkRole();
