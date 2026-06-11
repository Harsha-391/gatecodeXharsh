const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const Doctor = require('../models/doctor.model');
const Lab = require('../models/lab.model');
const Pharmacy = require('../models/pharmacy.model');
const Reception = require('../models/reception.model');
const Service = require('../models/service.model');
const User = require('../models/user.model');
const { verifyAdminOrSuperAdmin } = require('../middleware/auth.middleware');
const bcrypt = require('bcryptjs');

/**
 * Returns hospitalId filter for queries.
 * Central admin: no filter (sees all) unless ?hospitalId= query param
 * Hospital admin / staff: always scoped to their hospitalId
 */
function getHospitalFilter(req) {
  const role = req.user ? req.user.role : null;
  const isCentral = role === 'centraladmin' || role === 'superadmin';
  if (isCentral) {
    const qhid = req.query.hospitalId;
    return qhid ? { hospitalId: qhid } : {};
  }
  const hid = req.user && req.user.hospitalId;
  return hid ? { hospitalId: hid } : { hospitalId: null };
}

function getHospitalId(req) {
  const role = req.user ? req.user.role : null;
  const isCentral = role === 'centraladmin' || role === 'superadmin';
  if (isCentral) return req.body.hospitalId || null;
  return (req.user && req.user.hospitalId) || null;
}

// Create doctor
router.post('/doctors', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    console.log('CREATE DOCTOR REQ BODY:', req.body);
    const { 
      name, email, phone, specialty, experience, education, services, availability, 
      successRate, patientsCount, image, bio, consultationFee, password, departments,
      firstName, middleName, lastName, dob, gender, nationalId, medicalLicense, 
      specialization, qualification, experienceYears, personalEmail, currentAddress, 
      emergencyContact, bloodGroup, joiningDate, employmentType, status
    } = req.body;

    // Validate phone number (exactly 10 digits) if provided
    if (phone && !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits' });
    }
    if (emergencyContact && emergencyContact.phone && !/^\d{10}$/.test(emergencyContact.phone)) {
      return res.status(400).json({ success: false, message: 'Emergency contact phone number must be exactly 10 digits' });
    }

    // Compute full name
    const computedName = name || [firstName, middleName, lastName].filter(Boolean).join(' ');

    // Validate required fields
    if (!computedName || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Generate unique doctor ID using nanoid
    let doctorId;
    let isUnique = false;
    while (!isUnique) {
      doctorId = nanoid(10); // Generate 10-character ID
      const existingDoctor = await Doctor.findOne({ doctorId });
      if (!existingDoctor) {
        isUnique = true;
      }
    }

    // Create user account for the doctor
    const defaultPassword = password || nanoid(12); // Generate password if not provided
    // Don't hash password here - User model's pre-save hook will handle it

    const user = new User({
      name: computedName,
      email: email.toLowerCase(),
      password: defaultPassword,
      phone: phone || '',
      role: 'doctor',
      services: services || [],
      hospitalId: getHospitalId(req)
    });

    await user.save();

    // Ensure availability has proper structure
    const defaultAvailability = {
      monday: { available: true, startTime: '09:00', endTime: '17:00' },
      tuesday: { available: true, startTime: '09:00', endTime: '17:00' },
      wednesday: { available: true, startTime: '09:00', endTime: '17:00' },
      thursday: { available: true, startTime: '09:00', endTime: '17:00' },
      friday: { available: true, startTime: '09:00', endTime: '17:00' },
      saturday: { available: false, startTime: '09:00', endTime: '17:00' },
      sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    };

    const mergedAvailability = { ...defaultAvailability };
    if (availability && typeof availability === 'object') {
      Object.keys(availability).forEach(day => {
        if (defaultAvailability[day]) {
          mergedAvailability[day] = {
            available: availability[day].available !== undefined ? availability[day].available : false,
            startTime: availability[day].startTime || defaultAvailability[day].startTime,
            endTime: availability[day].endTime || defaultAvailability[day].endTime
          };
        }
      });
    }

    const doctor = new Doctor({
      doctorId: doctorId,
      userId: user._id,
      hospitalId: getHospitalId(req),
      name: computedName,
      email: email.toLowerCase(),
      phone: phone || '',
      specialty: specialization || specialty || '',
      experience: experienceYears !== undefined ? `${experienceYears} Years` : (experience || ''),
      education: Array.isArray(qualification) ? qualification.join(', ') : (education || ''),
      services: services || [],
      departments: (departments && departments.length > 0) ? departments : [specialization || specialty].filter(Boolean),
      availability: mergedAvailability,
      successRate: successRate || '90%',
      patientsCount: patientsCount || '100+',
      image: image || '👨‍⚕️',
      bio: bio || '',
      consultationFee: consultationFee || 0,
      
      // New fields
      firstName: firstName || '',
      middleName: middleName || '',
      lastName: lastName || '',
      dob: dob || null,
      gender: gender || 'Male',
      nationalId: nationalId || '',
      medicalLicense: medicalLicense || '',
      specialization: specialization || specialty || '',
      qualification: qualification || [],
      experienceYears: experienceYears || 0,
      personalEmail: personalEmail || '',
      currentAddress: currentAddress || '',
      emergencyContact: emergencyContact || { name: '', relationship: '', phone: '' },
      bloodGroup: bloodGroup || 'O+',
      joiningDate: joiningDate || null,
      employmentType: employmentType || 'Full-time',
      status: status || 'Active'
    });

    await doctor.save();

    // Sync to tenant DB
    const { syncToTenant } = require('../utils/tenantSync');
    const hospitalId = getHospitalId(req);
    await syncToTenant('User', user, 'save', hospitalId);
    await syncToTenant('Doctor', doctor, 'save', hospitalId);

    // Automatically add the doctor's departments to the Hospital's departments if not already present
    const docHospitalId = getHospitalId(req);
    if (docHospitalId) {
      const Hospital = require('../models/hospital.model');
      const hospitalObj = await Hospital.findById(docHospitalId);
      if (hospitalObj) {
        let updatedDepts = [...(hospitalObj.departments || [])];
        let hasNewDept = false;
        
        const deptsToAdd = doctor.departments || [];
        deptsToAdd.forEach(d => {
          if (d && !updatedDepts.includes(d)) {
            updatedDepts.push(d);
            hasNewDept = true;
          }
        });

        if (hasNewDept) {
          hospitalObj.departments = updatedDepts;
          await hospitalObj.save();
        }
      }
    }

    const populatedDoctor = await Doctor.findById(doctor._id).populate('userId', 'name email phone role');

    res.status(201).json({
      success: true,
      message: 'Doctor created successfully',
      doctor: populatedDoctor,
      generatedPassword: !password ? defaultPassword : undefined // Return generated password if not provided
    });
  } catch (error) {
    console.error('Create doctor error:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message).join(', ');
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: errors
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Doctor profile already exists for this user'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating doctor',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get all doctors
router.get('/doctors', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const filter = getHospitalFilter(req);
    const doctors = await Doctor.find(filter).populate('userId', 'name email phone role').sort({ createdAt: -1 });
    res.json({ success: true, doctors });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching doctors' });
  }
});

// Get single doctor
router.get('/doctors/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate('userId', 'name email phone role');
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    res.json({ success: true, doctor });
  } catch (error) {
    console.error('Get doctor error:', error);
    res.status(500).json({ success: false, message: 'Error fetching doctor' });
  }
});

// Update doctor
router.put('/doctors/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { 
      name, email, phone, specialty, experience, education, services, availability, 
      successRate, patientsCount, image, bio, consultationFee, departments,
      firstName, middleName, lastName, dob, gender, nationalId, medicalLicense, 
      specialization, qualification, experienceYears, personalEmail, currentAddress, 
      emergencyContact, bloodGroup, joiningDate, employmentType, status
    } = req.body;

    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    // Validate phone number (exactly 10 digits) if provided
    if (phone && !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits' });
    }
    if (emergencyContact && emergencyContact.phone && !/^\d{10}$/.test(emergencyContact.phone)) {
      return res.status(400).json({ success: false, message: 'Emergency contact phone number must be exactly 10 digits' });
    }

    // Update doctor fields
    if (firstName !== undefined) doctor.firstName = firstName;
    if (middleName !== undefined) doctor.middleName = middleName;
    if (lastName !== undefined) doctor.lastName = lastName;

    // Compute updated full name
    const computedName = [
      firstName !== undefined ? firstName : doctor.firstName,
      middleName !== undefined ? middleName : doctor.middleName,
      lastName !== undefined ? lastName : doctor.lastName
    ].filter(Boolean).join(' ');

    if (computedName) {
      doctor.name = computedName;
    } else if (name) {
      doctor.name = name;
    }

    if (email) doctor.email = email.toLowerCase();
    if (phone !== undefined) doctor.phone = phone;
    
    // Sync specialty / specialization
    if (specialization !== undefined) {
      doctor.specialization = specialization;
      doctor.specialty = specialization;
    } else if (specialty !== undefined) {
      doctor.specialty = specialty;
      doctor.specialization = specialty;
    }

    // Sync experience / experienceYears
    if (experienceYears !== undefined) {
      doctor.experienceYears = experienceYears;
      doctor.experience = `${experienceYears} Years`;
    } else if (experience !== undefined) {
      doctor.experience = experience;
      const parsedExp = parseInt(experience, 10);
      if (!isNaN(parsedExp)) {
        doctor.experienceYears = parsedExp;
      }
    }

    // Sync education / qualification
    if (qualification !== undefined) {
      doctor.qualification = qualification;
      doctor.education = Array.isArray(qualification) ? qualification.join(', ') : '';
    } else if (education !== undefined) {
      doctor.education = education;
      doctor.qualification = education.split(',').map(q => q.trim()).filter(Boolean);
    }

    if (dob !== undefined) doctor.dob = dob;
    if (gender !== undefined) doctor.gender = gender;
    if (nationalId !== undefined) doctor.nationalId = nationalId;
    if (medicalLicense !== undefined) doctor.medicalLicense = medicalLicense;
    if (personalEmail !== undefined) doctor.personalEmail = personalEmail;
    if (currentAddress !== undefined) doctor.currentAddress = currentAddress;
    if (emergencyContact !== undefined) {
      doctor.emergencyContact = {
        name: emergencyContact.name || '',
        relationship: emergencyContact.relationship || '',
        phone: emergencyContact.phone || ''
      };
      doctor.markModified('emergencyContact');
    }
    if (bloodGroup !== undefined) doctor.bloodGroup = bloodGroup;
    if (joiningDate !== undefined) doctor.joiningDate = joiningDate;
    if (employmentType !== undefined) doctor.employmentType = employmentType;
    if (status !== undefined) doctor.status = status;

    if (services !== undefined) doctor.services = services;
    if (departments !== undefined) {
      doctor.departments = departments.length > 0 ? departments : [specialization || specialty || doctor.specialization || doctor.specialty].filter(Boolean);
    } else if (specialization !== undefined || specialty !== undefined) {
      doctor.departments = [doctor.specialization || doctor.specialty].filter(Boolean);
    }
    if (availability !== undefined) {
      const defaultAvailability = {
        monday: { available: true, startTime: '09:00', endTime: '17:00' },
        tuesday: { available: true, startTime: '09:00', endTime: '17:00' },
        wednesday: { available: true, startTime: '09:00', endTime: '17:00' },
        thursday: { available: true, startTime: '09:00', endTime: '17:00' },
        friday: { available: true, startTime: '09:00', endTime: '17:00' },
        saturday: { available: false, startTime: '09:00', endTime: '17:00' },
        sunday: { available: false, startTime: '09:00', endTime: '17:00' }
      };
      const mergedAvailability = { ...defaultAvailability };
      if (availability && typeof availability === 'object') {
        Object.keys(availability).forEach(day => {
          if (defaultAvailability[day]) {
            mergedAvailability[day] = {
              available: availability[day].available !== undefined ? availability[day].available : false,
              startTime: availability[day].startTime || defaultAvailability[day].startTime,
              endTime: availability[day].endTime || defaultAvailability[day].endTime
            };
          }
        });
      }
      doctor.availability = mergedAvailability;
    }
    if (successRate !== undefined) doctor.successRate = successRate;
    if (patientsCount !== undefined) doctor.patientsCount = patientsCount;
    if (image !== undefined) doctor.image = image;
    if (bio !== undefined) doctor.bio = bio;
    if (consultationFee !== undefined) doctor.consultationFee = consultationFee;

    await doctor.save();

    // Automatically add the doctor's departments to the Hospital's departments if not already present
    const docHospitalId = doctor.hospitalId;
    if (docHospitalId) {
      const Hospital = require('../models/hospital.model');
      const hospitalObj = await Hospital.findById(docHospitalId);
      if (hospitalObj) {
        let updatedDepts = [...(hospitalObj.departments || [])];
        let hasNewDept = false;
        
        const deptsToAdd = doctor.departments || [];
        deptsToAdd.forEach(d => {
          if (d && !updatedDepts.includes(d)) {
            updatedDepts.push(d);
            hasNewDept = true;
          }
        });

        if (hasNewDept) {
          hospitalObj.departments = updatedDepts;
          await hospitalObj.save();
        }
      }
    }

    // Update user if exists
    if (doctor.userId) {
      const user = await User.findById(doctor.userId);
      if (user) {
        if (doctor.name) user.name = doctor.name;
        if (email) user.email = email.toLowerCase();
        if (phone !== undefined) user.phone = phone;
        if (services !== undefined) user.services = services;
        await user.save();
        const { syncToTenant } = require('../utils/tenantSync');
        await syncToTenant('User', user, 'save', doctor.hospitalId);
      }
    }

    const { syncToTenant } = require('../utils/tenantSync');
    await syncToTenant('Doctor', doctor, 'save', doctor.hospitalId);

    const populatedDoctor = await Doctor.findById(doctor._id).populate('userId', 'name email phone role');
    res.json({ success: true, message: 'Doctor updated successfully', doctor: populatedDoctor });
  } catch (error) {
    console.error('Update doctor error:', error);
    res.status(500).json({ success: false, message: 'Error updating doctor' });
  }
});

// Delete doctor
router.delete('/doctors/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    // Optionally delete associated user
    const { syncToTenant } = require('../utils/tenantSync');
    if (doctor.userId) {
      const user = await User.findById(doctor.userId);
      if (user) {
        await syncToTenant('User', user, 'delete', doctor.hospitalId);
        await User.findByIdAndDelete(doctor.userId);
      }
    }

    await syncToTenant('Doctor', doctor, 'delete', doctor.hospitalId);
    await Doctor.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Doctor deleted successfully' });
  } catch (error) {
    console.error('Delete doctor error:', error);
    res.status(500).json({ success: false, message: 'Error deleting doctor' });
  }
});

// Labs routes
router.post('/labs', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, services, facilities, availability, description, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if email already exists in User collection
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Check if lab already exists
    const existingLab = await Lab.findOne({ email: email.toLowerCase() });
    if (existingLab) {
      return res.status(400).json({ success: false, message: 'Lab with this email already exists' });
    }

    // Create user account for the lab
    const defaultPassword = password || nanoid(12); // Generate password if not provided
    // Don't hash password here - User model's pre-save hook will handle it

    const user = new User({
      name,
      email: email.toLowerCase(),
      password: defaultPassword,
      phone: phone || '',
      role: 'lab',
      hospitalId: getHospitalId(req)
    });

    await user.save();

    // Ensure availability has proper structure
    const defaultAvailability = {
      monday: { available: false, startTime: '09:00', endTime: '17:00' },
      tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
      wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
      thursday: { available: false, startTime: '09:00', endTime: '17:00' },
      friday: { available: false, startTime: '09:00', endTime: '17:00' },
      saturday: { available: false, startTime: '09:00', endTime: '17:00' },
      sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    };

    const mergedAvailability = { ...defaultAvailability };
    if (availability && typeof availability === 'object') {
      Object.keys(availability).forEach(day => {
        if (defaultAvailability[day]) {
          mergedAvailability[day] = {
            available: availability[day].available !== undefined ? availability[day].available : false,
            startTime: availability[day].startTime || defaultAvailability[day].startTime,
            endTime: availability[day].endTime || defaultAvailability[day].endTime
          };
        }
      });
    }

    const lab = new Lab({
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      address: address || '',
      services: services || [],
      facilities: facilities || [],
      availability: mergedAvailability,
      description: description || '',
      hospitalId: getHospitalId(req)
    });

    await lab.save();

    // Sync to tenant DB
    const { syncToTenant } = require('../utils/tenantSync');
    const hospitalId = getHospitalId(req);
    await syncToTenant('User', user, 'save', hospitalId);
    await syncToTenant('Lab', lab, 'save', hospitalId);

    res.status(201).json({
      success: true,
      message: 'Lab created successfully',
      lab,
      generatedPassword: !password ? defaultPassword : undefined // Return generated password if not provided
    });
  } catch (error) {
    console.error('Create lab error:', error);
    res.status(500).json({ success: false, message: 'Error creating lab' });
  }
});

router.get('/labs', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const filter = getHospitalFilter(req);
    const labs = await Lab.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, labs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching labs' });
  }
});

router.put('/labs/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const lab = await Lab.findById(req.params.id);
    if (!lab) {
      return res.status(404).json({ success: false, message: 'Lab not found' });
    }

    Object.assign(lab, req.body);
    await lab.save();

    const { syncToTenant } = require('../utils/tenantSync');
    await syncToTenant('Lab', lab, 'save', lab.hospitalId);

    // Also sync User if it is updated (email, phone, name etc.)
    const user = await User.findOne({ email: lab.email });
    if (user) {
        if (lab.name) user.name = lab.name;
        if (lab.phone !== undefined) user.phone = lab.phone;
        await user.save();
        await syncToTenant('User', user, 'save', lab.hospitalId);
    }

    res.json({ success: true, message: 'Lab updated successfully', lab });
  } catch (error) {
    console.error('Update lab error:', error);
    res.status(500).json({ success: false, message: 'Error updating lab' });
  }
});

router.delete('/labs/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const lab = await Lab.findById(req.params.id);
    if (!lab) {
      return res.status(404).json({ success: false, message: 'Lab not found' });
    }

    // Delete associated user account
    const { syncToTenant } = require('../utils/tenantSync');
    if (lab.email) {
      const user = await User.findOneAndDelete({ email: lab.email });
      if (user) await syncToTenant('User', user, 'delete', lab.hospitalId);
    }

    await syncToTenant('Lab', lab, 'delete', lab.hospitalId);
    await Lab.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Lab deleted successfully' });
  } catch (error) {
    console.error('Delete lab error:', error);
    res.status(500).json({ success: false, message: 'Error deleting lab' });
  }
});

// Pharmacy routes
router.post('/pharmacies', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, medications, availability, description, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if email already exists in User collection
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Check if pharmacy already exists
    const existingPharmacy = await Pharmacy.findOne({ email: email.toLowerCase() });
    if (existingPharmacy) {
      return res.status(400).json({ success: false, message: 'Pharmacy with this email already exists' });
    }

    // Create user account for the pharmacy
    const defaultPassword = password || nanoid(12); // Generate password if not provided
    // Don't hash password here - User model's pre-save hook will handle it

    const user = new User({
      name,
      email: email.toLowerCase(),
      password: defaultPassword,
      phone: phone || '',
      role: 'pharmacy',
      hospitalId: getHospitalId(req)
    });

    await user.save();

    // Ensure availability has proper structure
    const defaultAvailability = {
      monday: { available: false, startTime: '09:00', endTime: '17:00' },
      tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
      wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
      thursday: { available: false, startTime: '09:00', endTime: '17:00' },
      friday: { available: false, startTime: '09:00', endTime: '17:00' },
      saturday: { available: false, startTime: '09:00', endTime: '17:00' },
      sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    };

    const mergedAvailability = { ...defaultAvailability };
    if (availability && typeof availability === 'object') {
      Object.keys(availability).forEach(day => {
        if (defaultAvailability[day]) {
          mergedAvailability[day] = {
            available: availability[day].available !== undefined ? availability[day].available : false,
            startTime: availability[day].startTime || defaultAvailability[day].startTime,
            endTime: availability[day].endTime || defaultAvailability[day].endTime
          };
        }
      });
    }

    const pharmacy = new Pharmacy({
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      address: address || '',
      medications: medications || [],
      availability: mergedAvailability,
      description: description || '',
      hospitalId: getHospitalId(req)
    });

    await pharmacy.save();

    // Sync to tenant DB
    const { syncToTenant } = require('../utils/tenantSync');
    const hospitalId = getHospitalId(req);
    await syncToTenant('User', user, 'save', hospitalId);
    await syncToTenant('Pharmacy', pharmacy, 'save', hospitalId);

    res.status(201).json({
      success: true,
      message: 'Pharmacy created successfully',
      pharmacy,
      generatedPassword: !password ? defaultPassword : undefined // Return generated password if not provided
    });
  } catch (error) {
    console.error('Create pharmacy error:', error);
    res.status(500).json({ success: false, message: 'Error creating pharmacy' });
  }
});

router.get('/pharmacies', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const filter = getHospitalFilter(req);
    const pharmacies = await Pharmacy.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, pharmacies });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching pharmacies' });
  }
});

router.put('/pharmacies/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findById(req.params.id);
    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found' });
    }

    Object.assign(pharmacy, req.body);
    await pharmacy.save();

    const { syncToTenant } = require('../utils/tenantSync');
    await syncToTenant('Pharmacy', pharmacy, 'save', pharmacy.hospitalId);

    // Also sync User if it is updated (email, phone, name etc.)
    const user = await User.findOne({ email: pharmacy.email });
    if (user) {
        if (pharmacy.name) user.name = pharmacy.name;
        if (pharmacy.phone !== undefined) user.phone = pharmacy.phone;
        await user.save();
        await syncToTenant('User', user, 'save', pharmacy.hospitalId);
    }

    res.json({ success: true, message: 'Pharmacy updated successfully', pharmacy });
  } catch (error) {
    console.error('Update pharmacy error:', error);
    res.status(500).json({ success: false, message: 'Error updating pharmacy' });
  }
});

router.delete('/pharmacies/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findById(req.params.id);
    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found' });
    }

    // Delete associated user account
    const { syncToTenant } = require('../utils/tenantSync');
    if (pharmacy.email) {
      const user = await User.findOneAndDelete({ email: pharmacy.email });
      if (user) await syncToTenant('User', user, 'delete', pharmacy.hospitalId);
    }

    await syncToTenant('Pharmacy', pharmacy, 'delete', pharmacy.hospitalId);
    await Pharmacy.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Pharmacy deleted successfully' });
  } catch (error) {
    console.error('Delete pharmacy error:', error);
    res.status(500).json({ success: false, message: 'Error deleting pharmacy' });
  }
});

// Reception routes
router.post('/receptions', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, services, availability, description, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if email already exists in User collection
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Create user account for the reception
    const defaultPassword = password || nanoid(12); // Generate password if not provided

    const user = new User({
      name,
      email: email.toLowerCase(),
      password: defaultPassword,
      phone: phone || '',
      role: 'reception',
      services: services || [],
      hospitalId: getHospitalId(req)
    });

    await user.save();

    const reception = new Reception({
      userId: user._id,
      hospitalId: getHospitalId(req),
      isActive: true
    });

    await reception.save();

    // Sync to tenant DB
    const { syncToTenant } = require('../utils/tenantSync');
    const hospitalId = getHospitalId(req);
    await syncToTenant('User', user, 'save', hospitalId);
    await syncToTenant('Reception', reception, 'save', hospitalId);

    res.status(201).json({
      success: true,
      message: 'Reception created successfully',
      reception: {
        _id: reception._id,
        userId: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        services: user.services,
        isActive: reception.isActive
      },
      generatedPassword: !password ? defaultPassword : undefined // Return generated password if not provided
    });
  } catch (error) {
    console.error('Create reception error:', error);
    res.status(500).json({ success: false, message: 'Error creating reception' });
  }
});

router.get('/receptions', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const filter = getHospitalFilter(req);
    const receptions = await Reception.find(filter)
      .populate('userId', 'name email phone services')
      .sort({ createdAt: -1 })
      .lean();

    const flattenedReceptions = receptions.map(r => ({
      _id: r._id,
      userId: r.userId?._id,
      name: r.userId?.name || '',
      email: r.userId?.email || '',
      phone: r.userId?.phone || '',
      services: r.userId?.services || [],
      isActive: r.isActive,
      createdAt: r.createdAt
    }));

    res.json({ success: true, receptions: flattenedReceptions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching receptions' });
  }
});

router.put('/receptions/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, services, password } = req.body;
    const reception = await Reception.findById(req.params.id);
    if (!reception) {
      return res.status(404).json({ success: false, message: 'Reception not found' });
    }

    const user = await User.findById(reception.userId);
    if (user) {
      if (name) user.name = name;
      if (email) user.email = email.toLowerCase();
      if (phone !== undefined) user.phone = phone;
      if (services !== undefined) user.services = services;
      if (password) user.password = password; // pre-save hook will hash it
      await user.save();
      const { syncToTenant } = require('../utils/tenantSync');
      await syncToTenant('User', user, 'save', reception.hospitalId);
    }

    reception.isActive = req.body.isActive !== undefined ? req.body.isActive : reception.isActive;
    await reception.save();

    const { syncToTenant } = require('../utils/tenantSync');
    await syncToTenant('Reception', reception, 'save', reception.hospitalId);

    res.json({ 
      success: true, 
      message: 'Reception updated successfully', 
      reception: {
        _id: reception._id,
        userId: user ? user._id : null,
        name: user ? user.name : '',
        email: user ? user.email : '',
        phone: user ? user.phone : '',
        services: user ? user.services : [],
        isActive: reception.isActive
      } 
    });
  } catch (error) {
    console.error('Update reception error:', error);
    res.status(500).json({ success: false, message: 'Error updating reception' });
  }
});

router.delete('/receptions/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const reception = await Reception.findById(req.params.id);
    if (!reception) {
      return res.status(404).json({ success: false, message: 'Reception not found' });
    }

    // Delete associated user account
    const { syncToTenant } = require('../utils/tenantSync');
    if (reception.userId) {
      const user = await User.findByIdAndDelete(reception.userId);
      if (user) await syncToTenant('User', user, 'delete', reception.hospitalId);
    }

    await syncToTenant('Reception', reception, 'delete', reception.hospitalId);
    await Reception.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Reception deleted successfully' });
  } catch (error) {
    console.error('Delete reception error:', error);
    res.status(500).json({ success: false, message: 'Error deleting reception' });
  }
});

// Services routes
router.post('/services', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const {
      id, title, description, icon, color, price, duration, category, features, active,
      includedCharges, department, billingType, gst, serviceType, visibility
    } = req.body;

    if (!id || !title || !description) {
      return res.status(400).json({ success: false, message: 'ID, title, and description are required' });
    }

    const existingService = await Service.findOne({ id });
    if (existingService) {
      return res.status(400).json({ success: false, message: 'Service with this ID already exists' });
    }

    const service = new Service({
      id,
      title,
      description,
      icon: icon || '🏥',
      color: color || '#14C38E',
      price: price || 0,
      duration: duration || '',
      category: category || '',
      features: features || [],
      active: active !== undefined ? active : true,
      includedCharges: includedCharges || '',
      department: department || '',
      billingType: billingType || 'Fixed',
      gst: gst !== undefined ? Number(gst) : 0,
      serviceType: serviceType || 'Consultation',
      visibility: visibility || 'Both'
    });

    await service.save();
    res.status(201).json({ success: true, message: 'Service created successfully', service });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ success: false, message: 'Error creating service', error: error.message });
  }
});

router.get('/services', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const services = await Service.find().sort({ title: 1 });
    res.json({ success: true, services });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ success: false, message: 'Error fetching services' });
  }
});

router.put('/services/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    // Support lookup by MongoDB _id (ObjectId) or by the string 'id' field
    const mongoose = require('mongoose');
    let service;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      service = await Service.findById(req.params.id);
    }
    if (!service) {
      service = await Service.findOne({ id: req.params.id });
    }
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    // Apply allowed fields
    const allowed = [
      'title', 'description', 'icon', 'color', 'price', 'duration', 'category',
      'features', 'active', 'includedCharges', 'department', 'billingType',
      'gst', 'serviceType', 'visibility'
    ];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        service[field] = field === 'gst' ? Number(req.body[field]) : req.body[field];
      }
    });

    await service.save();
    res.json({ success: true, message: 'Service updated successfully', service });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ success: false, message: 'Error updating service', error: error.message });
  }
});

router.delete('/services/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    let service;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      service = await Service.findByIdAndDelete(req.params.id);
    }
    if (!service) {
      service = await Service.findOneAndDelete({ id: req.params.id });
    }
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ success: false, message: 'Error deleting service' });
  }
});

module.exports = router;
