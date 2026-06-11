require('dotenv').config();
const dns = require('dns');

// Configure standard DNS resolvers to prevent ECONNREFUSED issues with Node's c-ares on Windows
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    console.log('🌐 Configured custom DNS resolvers (8.8.8.8, 1.1.1.1) for SRV records.');
} catch (e) {
    console.warn('⚠️ Failed to configure DNS resolvers:', e.message);
}

const mongoose = require('mongoose');
const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://jabbamaster00_db_user:lvdtPEPM0i8hRCuh@cluster0.w01dnsr.mongodb.net/';

console.log('🔗 Attempting to connect to:', mongoUrl);

mongoose.connect(mongoUrl)
    .then(() => {
        console.log('✅ Connected to MongoDB successfully!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Connection failed:', err);
        process.exit(1);
    });
