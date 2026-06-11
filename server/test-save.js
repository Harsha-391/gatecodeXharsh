require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
    const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const User = require('./src/models/user.model');
    
    // Find the user reception@crm.com
    const user = await User.findOne({ email: 'reception@crm.com' });
    console.log('User found:', user.email);
    console.log('Current password hash:', user.password);

    // Let's modify a field, e.g. hospitalId
    const originalHospitalId = user.hospitalId;
    user.hospitalId = new mongoose.Types.ObjectId(); // temporary new ID
    
    console.log('Is password modified before save?', user.isModified('password'));
    
    // Let's save the user
    await user.save();
    console.log('User saved.');
    console.log('Password hash after save:', user.password);
    console.log('Is password modified after save?', user.isModified('password'));

    // Check if comparePassword still works with the correct password '123'
    const compareResult = await user.comparePassword('123');
    console.log('Does password check "123" succeed?', compareResult);

    // Revert hospitalId and save again
    user.hospitalId = originalHospitalId;
    await user.save();
    console.log('Reverted hospital ID and saved.');

    await mongoose.disconnect();
}

main().catch(console.error);
