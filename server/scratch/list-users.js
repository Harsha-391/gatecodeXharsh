const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log('Connected to DB:', mongoose.connection.name);
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const users = await User.find({}, 'name email role isActive').lean();
  console.log('All Users in DB:');
  console.log(users);
  await mongoose.disconnect();
}
run();
