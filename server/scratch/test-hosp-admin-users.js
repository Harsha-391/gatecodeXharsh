require('dotenv').config({ path: 'c:/Users/omris/OneDrive/Desktop/hms-neew/gatecodeXharsh/server/.env' });
const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const Hospital = require('../src/models/hospital.model');

async function test() {
    try {
        console.log("Connecting to database...");
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("Connected successfully!");

        // Find admitadmin to get its hospital ID dynamically
        const admitAdminUser = await User.findOne({ email: 'admitadmin@crm.com' });
        if (!admitAdminUser) {
            console.error("Could not find admitadmin@crm.com in database!");
            await mongoose.disconnect();
            return;
        }

        const admitHospitalId = admitAdminUser.hospitalId;
        console.log(`Dynamic Hospital ID for admitadmin: ${admitHospitalId}`);

        // 1. Test Central Admin User fetch
        console.log("\n=== Test Fetching Hospital Admins (Central Admin view) ===");
        const adminRoles = await Role.find({ name: { $regex: /^(admin|hospitaladmin)$/i } });
        const adminRoleIds = adminRoles.map(r => r._id);

        const centralQuery = {
            $or: [
                { role: { $in: ['hospitaladmin', 'admin'] } },
                { role: { $in: adminRoleIds } }
            ],
            patientId: { $exists: false }
        };

        const hospitalAdmins = await User.find(centralQuery).sort({ createdAt: -1 });
        console.log(`Found ${hospitalAdmins.length} hospital administrators:`);
        hospitalAdmins.forEach(u => {
            console.log(`- Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, Hospital ID: ${u.hospitalId}`);
        });

        // 2. Test Hospital Admin User fetch
        console.log(`\n=== Test Fetching Staff (Hospital Admin view for Hospital ${admitHospitalId}) ===`);
        const systemRoles = ['centraladmin', 'superadmin', 'hospitaladmin'];
        
        // Exclude primary admin
        const excludeUserIds = [];
        const hospital = await Hospital.findById(admitHospitalId);
        if (hospital && hospital.adminUserId) {
            excludeUserIds.push(hospital.adminUserId);
        }

        const staffQuery = {
            hospitalId: admitHospitalId,
            _id: { $nin: excludeUserIds },
            role: { $nin: systemRoles },
            patientId: { $exists: false }
        };

        const staffUsers = await User.find(staffQuery).sort({ createdAt: -1 });
        console.log(`Found ${staffUsers.length} general staff members (excluding admins):`);
        staffUsers.forEach(u => {
            console.log(`- Name: ${u.name}, Email: ${u.email}, Role: ${u.role}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error("Error during test:", err);
    }
}

test();
