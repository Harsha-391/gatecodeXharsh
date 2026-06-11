// server/scripts/list-roles.js
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/db/db');
const Role = require('../src/models/role.model');

async function run() {
    try {
        await connectDB();
        
        // 1. Roles in Master DB (Global)
        const globalRoles = await Role.find({ hospitalId: null });
        console.log(`\n--- GLOBAL ROLES (Count: ${globalRoles.length}) ---`);
        globalRoles.forEach(r => console.log(`- name: "${r.name}", _id: ${r._id}`));

        // 2. Roles in Master DB (Admit Hospital)
        const hospitalId = '6a268cd35b9fa6ff40126098';
        const hospitalRoles = await Role.find({ hospitalId });
        console.log(`\n--- HOSPITAL-SPECIFIC ROLES (Count: ${hospitalRoles.length}) ---`);
        hospitalRoles.forEach(r => console.log(`- name: "${r.name}", _id: ${r._id}`));
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

run();
