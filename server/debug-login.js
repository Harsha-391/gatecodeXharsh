require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Role = require('./src/models/role.model');

(async () => {
    const dbUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crm';
    await mongoose.connect(dbUri);
    
    // Simulate login flow
    const email = 'patient@crm.com';
    const password = '123';
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Looking for email:', normalizedEmail);
    
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
        console.log('ERROR: User not found!');
        await mongoose.disconnect();
        return;
    }
    console.log('Found user:', user.name, user.email);
    console.log('User role field:', user.role, '(type:', typeof user.role + ')');
    
    // Check if role is special admin string
    const specialRoles = ['superadmin', 'centraladmin', 'hospitaladmin'];
    if (specialRoles.includes(user.role)) {
        console.log('Role is special string:', user.role);
    } else if (user.role) {
        console.log('Role appears to be ObjectId, resolving...');
        if (mongoose.Types.ObjectId.isValid(user.role)) {
            const roleData = await Role.findById(user.role);
            console.log('Found role via ObjectId:', roleData ? roleData.name : 'null');
        } else {
            console.log('Role is not valid ObjectId');
        }
    }
    
    // Password check
    const pwMatch = await user.comparePassword(password);
    console.log('Password matches:', pwMatch);
    
    await mongoose.disconnect();
})();