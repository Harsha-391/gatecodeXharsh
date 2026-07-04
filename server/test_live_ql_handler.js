require('dotenv').config();
const mongoose = require('mongoose');
const { getTenantConnection } = require('./src/db/tenantDb');
const { getTenantModels } = require('./src/db/tenantModels');
const Hospital = require('./src/models/hospital.model');
const Clinic = require('./src/models/clinic.model');
const User = require('./src/models/user.model');
const Role = require('./src/models/role.model');

// Mimic the getModels function from routes
const getModels = (tenantDb) => {
    if (tenantDb) {
        const tenantModels = getTenantModels(tenantDb);
        return { 
            QuestionLibrary: tenantModels.QuestionLibrary,
            Hospital: require('./src/models/hospital.model'),
            Department: require('./src/models/department.model')
        };
    }
    return { 
        QuestionLibrary: require('./src/models/questionLibrary.model'),
        Hospital: require('./src/models/hospital.model'),
        Department: require('./src/models/department.model')
    };
};

async function testHandler() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to Master DB');

    const hospitalId = '6a3bc2edd348ffdf77b819a3'; // Admit
    const tenantDb = await getTenantConnection(hospitalId);
    console.log('Connected to Tenant DB');

    const { QuestionLibrary, Hospital, Department } = getModels(tenantDb);

    let library = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
    let hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
        const Clinic = require('./src/models/clinic.model');
        hospital = await Clinic.findById(hospitalId);
    }

    let allowedDepartments = null;
    if (hospital && hospital.departments) {
        allowedDepartments = hospital.departments;
    } else {
        allowedDepartments = [];
    }

    console.log('Backend allowedDepartments:', allowedDepartments);

    if (!library) {
        library = await QuestionLibrary.findOne({ hospitalId: null }).sort({ version: -1 });
    }

    let libraryDataObj = {};
    if (library && library.data) {
        libraryDataObj = library.data;
    }

    console.log('Raw database library keys:', Object.keys(libraryDataObj));

    let mergedData;
    if (allowedDepartments === null) {
        const activeDepartments = await Department.find({ isActive: true });
        const activeDeptNames = activeDepartments.map(d => d.name);
        mergedData = { ...libraryDataObj };
        activeDeptNames.forEach(dept => {
            if (!mergedData[dept]) {
                mergedData[dept] = {};
            }
        });
    } else {
        let defaultDepts = {};
        if (allowedDepartments.length > 0) {
            allowedDepartments.forEach(dept => {
                defaultDepts[dept] = {};
            });
        } else {
            defaultDepts = { "General": {} };
        }

        mergedData = {};
        Object.keys(defaultDepts).forEach(dept => {
            mergedData[dept] = libraryDataObj[dept] || {};
        });
    }

    console.log('Merged output library keys:', Object.keys(mergedData));
    console.log('allowedDepartments returned:', allowedDepartments);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

testHandler();
