const mongoose = require('mongoose');
const dns = require('dns');

// Configure standard DNS resolvers to prevent ECONNREFUSED issues with Node's c-ares on Windows
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    console.log('🌐 Configured custom DNS resolvers (8.8.8.8, 1.1.1.1) for SRV records.');
} catch (e) {
    console.warn('⚠️ Failed to configure DNS resolvers:', e.message);
}

async function connectDB() {
    try {
        const mongoUrl = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/hms';
        
        if (!process.env.MONGODB_URL) {
            console.warn('⚠️ MONGODB_URL is not defined in environment variables. Falling back to local database: mongodb://127.0.0.1:27017/hms');
        }

        // Validate connection string format
        if (mongoUrl.includes('mongodb+srv://') || mongoUrl.includes('mongodb://')) {
            console.log('🔗 Attempting to connect to MongoDB...');
        } else {
            console.error('❌ Invalid MongoDB connection string format');
            console.error('   Expected format: mongodb+srv://username:password@cluster.mongodb.net/databaseName');
            process.exit(1);
        }

        // MongoDB Atlas connection options
        const options = {
            serverSelectionTimeoutMS: 30000, // Increased timeout for Atlas
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
            connectTimeoutMS: 30000, // Give up initial connection after 30 seconds
            retryWrites: true,
            w: 'majority',
            maxPoolSize: 10, // Maintain up to 10 socket connections
            minPoolSize: 2, // Maintain at least 2 socket connections
        };

        await mongoose.connect(mongoUrl, options);
        console.log('✅ Connected to MongoDB successfully');

        // Self-heal hospital adminUserId links
        await healHospitalAdmins();

        // Seed default superadmin department if empty
        await seedDefaultDepartments();

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err.message);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB disconnected');
        });

        // Drop old username index if it exists (migration fix)
        // This fixes the E11000 duplicate key error for username field
        try {
            const User = mongoose.connection.collection('users');
            const indexes = await User.indexes();
            const usernameIndex = indexes.find(idx => idx.name === 'username_1');

            if (usernameIndex) {
                await User.dropIndex('username_1');
                console.log('✓ Dropped old username_1 index (migration fix)');
            }
        } catch (indexError) {
            // Index might not exist or collection might not exist, ignore error
            // Code 26 is "NamespaceNotFound", Code 27 is "IndexNotFound"
            if (indexError.code !== 27 && indexError.code !== 26 && indexError.codeName !== 'IndexNotFound' && indexError.codeName !== 'NamespaceNotFound') {
                console.log('Note: Could not check/drop username index:', indexError.message);
            }
        }
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
        
        // Provide helpful error messages
        if (err.message.includes('IP') || err.message.includes('whitelist') || err.message.includes('ReplicaSetNoPrimary')) {
            console.error('\n💡 IP Whitelist / Network Access Issue:');
            console.error('   1. Go to MongoDB Atlas → Network Access (or Security → Network Access)');
            console.error('   2. Click "Add IP Address"');
            console.error('   3. Add 0.0.0.0/0 (allow from anywhere) OR your current IP address');
            console.error('   4. IMPORTANT: Wait 2-5 minutes for changes to propagate');
            console.error('   5. If you added 0.0.0.0/0, make sure it shows as "Active" in the list');
            console.error('   6. Try restarting your server after waiting\n');
        } else if (err.message.includes('authentication') || err.message.includes('bad auth')) {
            console.error('\n💡 Authentication Issue:');
            console.error('   1. Check your MongoDB Atlas username and password');
            console.error('   2. If your password contains special characters, URL encode them:');
            console.error('      - @ becomes %40');
            console.error('      - : becomes %3A');
            console.error('      - / becomes %2F');
            console.error('      - # becomes %23');
            console.error('      - Space becomes %20');
            console.error('   3. Ensure your database user has proper permissions');
            console.error('   4. Verify your connection string format:');
            console.error('      mongodb+srv://username:password@cluster.mongodb.net/databaseName\n');
        } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
            console.error('\n💡 Network/DNS Issue:');
            console.error('   1. Check your internet connection');
            console.error('   2. Verify the MongoDB Atlas cluster is running');
            console.error('   3. Check if your connection string is correct\n');
        }
        
        // Don't exit the process, let the server start but log the error
        // The server can retry connection on next request
    }
}

async function healHospitalAdmins() {
    try {
        const Hospital = require('../models/hospital.model');
        const User = require('../models/user.model');
        const Role = require('../models/role.model');

        console.log('🔄 Running self-healing logic for hospital administrators...');
        const hospitals = await Hospital.find({});
        for (const hospital of hospitals) {
            let validAdminExists = false;
            if (hospital.adminUserId) {
                const user = await User.findById(hospital.adminUserId);
                if (user && String(user.hospitalId) === String(hospital._id)) {
                    validAdminExists = true;
                }
            }

            if (!validAdminExists) {
                // Find users belonging to this hospital
                const users = await User.find({ hospitalId: hospital._id });
                let foundAdmin = null;

                for (const user of users) {
                    let isAdmin = false;
                    const role = String(user.role || '');

                    if (role === 'hospitaladmin' || role === 'admin' || role === 'administrator') {
                        isAdmin = true;
                    } else if (mongoose.Types.ObjectId.isValid(user.role)) {
                        const roleDoc = await Role.findById(user.role);
                        if (roleDoc && ['admin', 'administrator', 'hospitaladmin'].includes(roleDoc.name.toLowerCase())) {
                            isAdmin = true;
                        }
                    }

                    if (isAdmin) {
                        foundAdmin = user;
                        break;
                    }
                }

                if (foundAdmin) {
                    hospital.adminUserId = foundAdmin._id;
                    await hospital.save();
                    console.log(`✅ Healed: Mapped hospital admin "${foundAdmin.name}" (${foundAdmin.email}) to hospital "${hospital.name}"`);
                } else if (hospital.adminUserId) {
                    hospital.adminUserId = null;
                    await hospital.save();
                    console.log(`⚠️ Cleared invalid adminUserId for hospital "${hospital.name}"`);
                }
            }
        }
        console.log('🔄 Self-healing logic complete.');
    } catch (err) {
        console.error('❌ Error during self-healing for hospital administrators:', err.message);
    }
}

async function seedDefaultDepartments() {
    try {
        const Department = require('../models/department.model');
        const count = await Department.countDocuments({});
        if (count === 0) {
            await Department.create({
                name: 'General',
                description: 'General OPD & clinical consultation department',
                isActive: true
            });
            console.log('✅ Seeded default superadmin department: General');
        }
    } catch (err) {
        console.error('❌ Error seeding default departments:', err.message);
    }
}

module.exports = connectDB;