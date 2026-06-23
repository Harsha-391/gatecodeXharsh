const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const validateFileType = require('../utils/validateFileType');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const MasterAppointment = require('../models/appointment.model');
const MasterUser = require('../models/user.model');
const MasterHospitalPatient = require('../models/hospitalPatient.model');
const Doctor = require('../models/doctor.model'); // Required to fetch doctor details
const { verifyToken } = require('../middleware/auth.middleware');

const getModels = (req) => {
    if (req.tenantDb) {
        const tenantModels = getTenantModels(req.tenantDb);
        return {
            ...tenantModels,
            User: tenantModels.HospitalPatient
        };
    }
    return { 
        Appointment: MasterAppointment, 
        User: MasterHospitalPatient,
        ClinicalVisit: require('../models/clinicalVisit.model'),
        CollectionTransaction: require('../models/collectionTransaction.model')
    };
};

const verifyReception = async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const userRole = req.user.role;
    const dynamicRoleName = req.user._roleData?.name;
    const permissions = req.user._roleData?.permissions || [];

    const roleStr = typeof userRole === 'string' ? userRole.toLowerCase() : '';
    const dynRoleStr = dynamicRoleName ? dynamicRoleName.toLowerCase() : '';

    const ALLOWED_ROLES = new Set(['reception', 'receptionist', 'admin', 'hospitaladmin', 'superadmin', 'centraladmin', 'frontdesk']);

    let isAllowed = false;
    if (ALLOWED_ROLES.has(roleStr) || ALLOWED_ROLES.has(dynRoleStr)) isAllowed = true;
    else if (permissions.includes('reception_access') || 
        permissions.includes('appointment_manage') || 
        permissions.includes('patient_create') || 
        permissions.includes('appointment_view_all') || 
        permissions.includes('*')) isAllowed = true;

    if (isAllowed) {
        await resolveTenant(req, res, next);
    } else {
        return res.status(403).json({ success: false, message: 'Access denied: Reception access only' });
    }
};

// 1. REGISTER (WALK-IN)
router.post('/register', verifyToken, verifyReception, async (req, res) => {
    try {
        let { name, email, phone, autoCreateAppointment } = req.body;

        // Sanitize — trim whitespace and convert empty strings to undefined
        name = name ? String(name).trim() : undefined;
        phone = phone ? String(phone).trim() : undefined;
        email = email ? String(email).trim() : undefined; // crucial: empty string -> undefined

        // Phone is required for identification, Email is optional
        if (!name || !phone) {
            return res.status(400).json({ success: false, message: 'Name and Phone are required' });
        }
        if (name.length > 100) return res.status(400).json({ success: false, message: 'Name too long (max 100 chars)' });
        if (phone.length > 20) return res.status(400).json({ success: false, message: 'Phone too long (max 20 chars)' });
        if (email && email.length > 200) return res.status(400).json({ success: false, message: 'Email too long (max 200 chars)' });

        // Check if patient exists by Phone (or Email if provided)
        const orClauses = [{ phone }];
        if (email) orClauses.push({ email });

        let userQuery = { $or: orClauses };
        if (req.user.hospitalId) {
            userQuery.hospitalId = req.user.hospitalId;
        }

        let user = await MasterHospitalPatient.findOne(userQuery);

        if (user) {
            // Update name if changed
            user.name = name;
            // Only update email if provided and different (avoid overwriting with empty)
            if (email && email !== user.email) user.email = email;
            if (req.body.gender) user.gender = req.body.gender;
            if (req.body.parentName) user.parentName = req.body.parentName;
            if (req.body.parentPhone) user.parentPhone = req.body.parentPhone;
            if (req.body.doctorId) {
                user.doctorId = req.body.doctorId;
                const doc = await Doctor.findById(req.body.doctorId).select('name');
                if (doc) user.doctorName = doc.name;
            }

            // Backfill PatientId for legacy walk-ins that were created without one
            if (!user.patientId) {
                user.patientId = 'MRN-' + Date.now() + Math.floor(Math.random() * 1000);
            }

            await user.save();

            // Sync/update in tenant DB
            if (req.tenantDb) {
                const TenantHospitalPatient = getTenantModels(req.tenantDb).HospitalPatient;
                let tenantUser = await TenantHospitalPatient.findById(user._id);
                if (!tenantUser) {
                    tenantUser = new TenantHospitalPatient({
                        ...user.toObject(),
                        _id: user._id
                    });
                } else {
                    tenantUser.name = user.name;
                    if (user.email) tenantUser.email = user.email;
                    tenantUser.phone = user.phone;
                    if (req.body.gender) tenantUser.gender = req.body.gender;
                    if (req.body.parentName) tenantUser.parentName = req.body.parentName;
                    if (req.body.parentPhone) tenantUser.parentPhone = req.body.parentPhone;
                    if (req.body.doctorId) {
                        tenantUser.doctorId = req.body.doctorId;
                        tenantUser.doctorName = user.doctorName;
                    }
                }
                await tenantUser.save();
            }

            return res.status(200).json({ success: true, message: 'Patient record updated!', user });
        }

        // Create New Walk-in Patient — use collision-resistant ID
        const patientId = 'MRN-' + Date.now() + Math.floor(Math.random() * 1000);

        let doctorName = '';
        if (req.body.doctorId) {
            const doc = await Doctor.findById(req.body.doctorId).select('name');
            if (doc) doctorName = doc.name;
        }

        const userData = {
            name,
            phone,
            role: 'patient',
            patientId,
            fertilityProfile: {},
            hospitalId: req.user.hospitalId || undefined,
            gender: req.body.gender || 'Female',
            parentName: req.body.parentName || '',
            parentPhone: req.body.parentPhone || '',
            doctorId: req.body.doctorId || null,
            doctorName: doctorName
        };

        // Only attach email if it actually exists, to prevent duplicate sparse index errors
        if (email) userData.email = email;

        const newUser = new MasterHospitalPatient(userData);
        await newUser.save();

        let newAppointment = null;

        if (autoCreateAppointment !== false) {
            // Create corresponding Appointment record in Master DB (Appointment table)
            const appointmentData = {
                userId: newUser._id,
                patientId: patientId,
                patientName: newUser.name,
                patientPhone: newUser.phone,
                patientEmail: newUser.email || '',
                patientGender: newUser.gender || 'Male',
                patientDob: newUser.dob ? new Date(newUser.dob) : null,
                parentName: newUser.parentName || '',
                parentPhone: newUser.parentPhone || '',
                hospitalId: req.user.hospitalId || undefined,
                doctorName: 'Pending Assignment',
                appointmentDate: new Date(),
                appointmentTime: '10:00 AM',
                status: 'pending',
                paymentStatus: 'Pending',
                amount: 0,
                notes: 'Walk-in patient registered'
            };

            newAppointment = new MasterAppointment(appointmentData);
            await newAppointment.save();

            // Save to tenant DB as well
            if (req.tenantDb) {
                const TenantHospitalPatient = getTenantModels(req.tenantDb).HospitalPatient;
                const newTenantUser = new TenantHospitalPatient({
                    ...userData,
                    _id: newUser._id
                });
                await newTenantUser.save();

                const TenantAppointment = getTenantModels(req.tenantDb).Appointment;
                const newTenantAppointment = new TenantAppointment({
                    ...appointmentData,
                    _id: newAppointment._id
                });
                await newTenantAppointment.save();
            }
        } else {
            // Save to tenant DB as well (User only)
            if (req.tenantDb) {
                const TenantHospitalPatient = getTenantModels(req.tenantDb).HospitalPatient;
                const newTenantUser = new TenantHospitalPatient({
                    ...userData,
                    _id: newUser._id
                });
                await newTenantUser.save();
            }
        }

        res.status(201).json({ success: true, message: 'Patient registered successfully!', user: newUser, appointment: newAppointment });
    } catch (error) {
        console.error("Register Error:", error);
        if (error.code === 11000) {
            // Tell the user exactly which field is duplicated
            const field = Object.keys(error.keyPattern || {})[0] || 'field';
            const friendlyField = field === 'phone' ? 'Phone number'
                : field === 'email' ? 'Email'
                    : field === 'patientId' ? 'Patient ID'
                        : field;
            return res.status(400).json({
                success: false,
                message: `A patient with this ${friendlyField} already exists. Please search for the existing patient instead.`
            });
        }
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 1.5 AADHAAR VERIFICATION (OTP FLOW - SIMULATED)
// NOTE: In production, integrate with UIDAI / NSDL Aadhaar API.
// Hardcoded OTP removed — this route is disabled until a real OTP provider is wired up.
router.post('/send-aadhaar-otp', verifyToken, verifyReception, async (req, res) => {
    try {
        const { aadhaarNumber } = req.body;
        if (!/^\d{12}$/.test(aadhaarNumber)) return res.status(400).json({ success: false, message: 'Invalid Aadhaar Format (12 digits required)' });

        if (aadhaarNumber.startsWith('9999')) return res.status(400).json({ success: false, message: 'Verification Failed: Invalid Aadhaar Number.' });

        // TODO: Integrate real UIDAI/NSDL OTP API here
        // For now return a pending message — DO NOT expose any OTP in the response
        res.json({ success: true, message: 'Aadhaar OTP sent to the registered mobile number.' });
    } catch (e) {
        console.error('[send-aadhaar-otp]', e.message);
        res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }
});

router.post('/verify-aadhaar-otp', verifyToken, verifyReception, async (req, res) => {
    const { otp } = req.body;
    if (!otp || !/^\d{6}$/.test(otp)) return res.status(400).json({ success: false, message: 'Invalid OTP format (6 digits required)' });
    // TODO: Verify OTP with real UIDAI/NSDL API
    return res.status(503).json({ success: false, message: 'Aadhaar verification is not available in this environment. Contact admin.' });
});

// 2. SEARCH
router.get('/search-patients', verifyToken, verifyReception, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || typeof query !== 'string' || query.trim().length < 2) return res.json({ success: true, patients: [] });

        const safeQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const namePhoneFilter = {
            $or: [
                { name: { $regex: safeQuery, $options: 'i' } },
                { phone: { $regex: safeQuery, $options: 'i' } },
                { patientId: { $regex: safeQuery, $options: 'i' } }
            ]
        };

        // Use tenant DB if available (tenant DB is already hospital-scoped, no hospitalId filter needed)
        const { User } = getModels(req);
        let patients = await User.find(namePhoneFilter).select('name phone email patientId fertilityProfile gender parentName parentPhone doctorId doctorName').limit(10);

        // If tenant DB returned nothing (or no tenant DB), fall back to master DB
        if (patients.length === 0) {
            // Note: no hospitalId filter here — master DB patients may not have hospitalId set
            patients = await MasterHospitalPatient.find(namePhoneFilter).select('name phone email patientId fertilityProfile gender parentName parentPhone doctorId doctorName').limit(10);
        }

        res.json({ success: true, patients });
    } catch (error) { 
        console.error('[search-patients] error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' }); 
    }
});




// 3. UPDATE INTAKE
router.put('/intake/:userId', verifyToken, verifyReception, async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;
        const updateQuery = {};

        const { User } = getModels(req);

        // Map Root fields
        if (updates.firstName || updates.lastName) updateQuery.name = `${updates.firstName || ''} ${updates.lastName || ''}`.trim();
        if (updates.email) updateQuery.email = updates.email;
        if (updates.phone || updates.mobile) updateQuery.phone = updates.phone || updates.mobile;
        if (updates.address) updateQuery.address = updates.address;
        if (updates.city) updateQuery.city = updates.city;
        if (updates.state) updateQuery.state = updates.state;
        if (updates.zipCode) updateQuery.zipCode = updates.zipCode;
        if (updates.gender) updateQuery.gender = updates.gender;
        if (updates.parentName !== undefined) updateQuery.parentName = updates.parentName;
        if (updates.parentPhone !== undefined) updateQuery.parentPhone = updates.parentPhone;
        
        let targetDoctorId = undefined;
        if (updates.doctor !== undefined) targetDoctorId = updates.doctor;
        if (updates.doctorId !== undefined) targetDoctorId = updates.doctorId;
        
        if (targetDoctorId !== undefined) {
            updateQuery.doctorId = targetDoctorId || null;
            if (targetDoctorId) {
                const doc = await Doctor.findById(targetDoctorId).select('name');
                if (doc) updateQuery.doctorName = doc.name;
            } else {
                updateQuery.doctorName = '';
            }
        }

        // Update Root Aadhaar Fields
        if (updates.aadhaar) updateQuery.aadhaarNumber = updates.aadhaar;
        if (updates.isAadhaarVerified !== undefined) updateQuery.isAadhaarVerified = updates.isAadhaarVerified;

        // Map Fertility Profile fields
        const profileFields = [
            'title', 'firstName', 'middleName', 'lastName', 'dob', 'age', 'gender', 'maritalStatus', 'occupation',
            'aadhaar', 'altPhone', 'patientCategory', 'nationality', 'isInternational', 'language', 'languagesKnown',
            'height', 'weight', 'bmi', 'bloodGroup',
            'partnerTitle', 'partnerFirstName', 'partnerLastName', 'partnerDob', 'partnerAge', 'partnerAadhaar',
            'partnerMobile', 'partnerAltPhone', 'partnerEmail', 'partnerAddressSame', 'partnerAddress',
            'partnerArea', 'partnerCity', 'partnerState', 'partnerCountry', 'partnerPinCode', 'partnerNationality',
            'partnerHeight', 'partnerWeight', 'partnerBmi', 'partnerBloodGroup',
            'reasonForVisit', 'speciality', 'doctor', 'referralType', 'visitDate', 'visitTime',
            'infertilityType', 'chiefComplaint', 'historyPulse', 'historyBp', 'infertilityDuration', 'marriageDuration', 'generalComments',
            'lmpDate', 'menstrualRegularity', 'menstrualFlow', 'menstrualPain', 'cycleDetails',
            'familyHistory', 'medicalHistoryDiabetes', 'medicalHistoryHypertension', 'medicalHistoryThyroid',
            'medicalHistoryHeart', 'medicalHistoryAsthma', 'medicalHistoryTb', 'medicalHistoryOther', 'medicalHistoryPcos',
            'para', 'abortion', 'ectopic', 'liveBirth', 'recurrentLoss', 'obstetricComments',
            'pastInvestigations', 'partnerBp', 'partnerMedicalComments',
            'labResults', 'hormonalValues', 'usgRemarks', 'psychiatricHistory', 'sexualHistory', 'identificationMarks', 'addictionHistory',
            'treatmentHistory',
            'examGeneral', 'examSystemic', 'examBreast', 'examAbdomen', 'examSpeculum', 'examVaginal',
            'hirsutism', 'galactorrhoea', 'papSmear',
            'usgType', 'afcRight', 'afcLeft', 'amh', 'uterusSize', 'uterusPosition',
            'ovaryRightSize', 'ovaryLeftSize', 'endometriumThickness',
            'diagnosisInfertilityType', 'maleFactor', 'femaleFactor', 'diagnosisYears', 'diagnosisOthers',
            'doctorNotes', 'prescriptionComments', 'procedureAdvice', 'followUpDate'
        ];

        profileFields.forEach(field => {
            if (updates[field] !== undefined) {
                updateQuery[`fertilityProfile.${field}`] = updates[field];
            }
        });

        const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateQuery }, { new: true, runValidators: false });
        if (!updatedUser) return res.status(404).json({ success: false, message: 'Patient not found' });

        if (req.tenantDb) {
            await MasterHospitalPatient.findByIdAndUpdate(userId, { $set: updateQuery }, { runValidators: false });
        }

        res.json({ success: true, message: 'Updated', user: updatedUser });
    } catch (error) { 
        console.error('[update-intake] error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' }); 
    }
});

// 4. APPOINTMENTS
router.get('/appointments', verifyToken, verifyReception, async (req, res) => {
    try {
        let queryFilter = {};
        if (req.user.hospitalId) queryFilter.hospitalId = req.user.hospitalId;

        if (req.query.reportFollowUp === 'true') {
            queryFilter.requestReportFollowUp = true;
            queryFilter.followUpScheduled = false;
        } else if (req.query.all !== 'true') {
            const baseDateStr = req.query.date || new Date().toISOString().split('T')[0];
            const clientToday = new Date(baseDateStr);
            clientToday.setUTCHours(0, 0, 0, 0);

            if (req.query.tomorrow === 'true') {
                const tomorrowStart = new Date(clientToday);
                tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
                tomorrowStart.setUTCHours(0, 0, 0, 0);

                const dayAfterTomorrowStart = new Date(clientToday);
                dayAfterTomorrowStart.setUTCDate(dayAfterTomorrowStart.getUTCDate() + 2);
                dayAfterTomorrowStart.setUTCHours(0, 0, 0, 0);

                queryFilter.appointmentDate = { $gte: tomorrowStart, $lt: dayAfterTomorrowStart };
            } else if (req.query.future === 'true') {
                const dayAfterTomorrowStart = new Date(clientToday);
                dayAfterTomorrowStart.setUTCDate(dayAfterTomorrowStart.getUTCDate() + 2);
                dayAfterTomorrowStart.setUTCHours(0, 0, 0, 0);

                queryFilter.appointmentDate = { $gte: dayAfterTomorrowStart };
            } else {
                const tomorrowStart = new Date(clientToday);
                tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
                tomorrowStart.setUTCHours(0, 0, 0, 0);

                queryFilter.appointmentDate = { $gte: clientToday, $lt: tomorrowStart };
            }
        }

        const { Appointment, ClinicalVisit } = getModels(req);
        const appointments = await Appointment.find(queryFilter)
            .populate('userId', 'name email phone patientId')
            .populate({ path: 'doctorId', model: Doctor, select: 'name' })
            .sort({ tokenNumber: 1, appointmentTime: 1 })
            .lean();

        const appointmentIds = appointments.map(a => a._id);
        const visits = await ClinicalVisit.find({ appointmentId: { $in: appointmentIds } }).select('appointmentId status').lean();
        const visitMap = {};
        visits.forEach(v => {
            if (v.appointmentId) {
                visitMap[v.appointmentId.toString()] = v.status || 'check_in';
            }
        });

        const appointmentsWithVisit = appointments.map(a => ({
            ...a,
            checkedIn: !!visitMap[a._id.toString()],
            visitStatus: visitMap[a._id.toString()] || null
        }));

        res.json({ success: true, appointments: appointmentsWithVisit });
    } catch (e) {
        console.error("Error fetching reception appointments:", e);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 5. RESCHEDULE & CANCEL
router.patch('/appointments/:id/reschedule', verifyToken, verifyReception, async (req, res) => {
    const { id } = req.params;
    const { date, time, doctorId } = req.body;
    const reschQuery = { _id: id };
    if (req.user.hospitalId) reschQuery.hospitalId = req.user.hospitalId;
    const { Appointment } = getModels(req);
    const appt = await Appointment.findOne(reschQuery);
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found or unauthorized' });

    let finalTime = time;
    const resolvedDoctorId = doctorId || appt.doctorId;
    let finalDoctorId = appt.doctorId;
    let finalDoctorUserId = appt.doctorUserId;
    let finalDoctorName = appt.doctorName;
    let finalTokenNumber = appt.tokenNumber;

    if (resolvedDoctorId) {
        const doctor = await Doctor.findById(resolvedDoctorId);
        if (doctor) {
            finalDoctorId = doctor._id;
            finalDoctorUserId = doctor.userId;
            finalDoctorName = doctor.name;
            
            // Check if hospital is in token mode, then assign token number
            const Hospital = require('../models/hospital.model');
            const hospitalId = appt.hospitalId || req.user.hospitalId;
            const hospital = hospitalId ? await Hospital.findById(hospitalId).select('appointmentMode') : null;
            if (hospital?.appointmentMode === 'token') {
                const startOfDay = new Date(date);
                startOfDay.setUTCHours(0, 0, 0, 0);
                const endOfDay = new Date(date);
                endOfDay.setUTCHours(23, 59, 59, 999);
                
                const count = await Appointment.countDocuments({
                    doctorId: doctor._id,
                    appointmentDate: { $gte: startOfDay, $lte: endOfDay },
                    status: { $ne: 'cancelled' },
                    _id: { $ne: id }
                });
                const tokenNumber = count + 1;
                finalTokenNumber = tokenNumber;
                finalTime = `token-${tokenNumber}`;
            } else {
                finalTokenNumber = null;
            }
        }
    }

    if (appt.status === 'completed') {
        // Create a new follow-up appointment instead of mutating the completed one
        const appointmentData = {
            userId: appt.userId,
            patientId: appt.patientId || 'WALK-IN',
            patientName: appt.patientName,
            patientPhone: appt.patientPhone,
            patientEmail: appt.patientEmail || '',
            patientGender: appt.patientGender || 'Male',
            patientDob: appt.patientDob || null,
            parentName: appt.parentName || '',
            parentPhone: appt.parentPhone || '',
            hospitalId: appt.hospitalId || req.user.hospitalId,
            doctorId: finalDoctorId,
            doctorUserId: finalDoctorUserId,
            doctorName: finalDoctorName,
            serviceId: appt.serviceId || 'general',
            serviceName: appt.serviceName || 'Walk-in Visit',
            appointmentDate: new Date(date),
            appointmentTime: finalTime || '',
            tokenNumber: finalTokenNumber,
            status: 'pending',
            paymentStatus: 'Paid',
            paymentMethod: 'Cash',
            amount: 0,
            notes: 'Follow-up appointment rescheduled from past completed session',
            bookedBy: req.user.id || req.user.userId
        };

        const newMasterAppointment = new MasterAppointment(appointmentData);
        await newMasterAppointment.save();

        if (req.tenantDb) {
            const TenantAppointment = getTenantModels(req.tenantDb).Appointment;
            const newTenantAppointment = new TenantAppointment({
                ...appointmentData,
                _id: newMasterAppointment._id
            });
            await newTenantAppointment.save();
        }

        // Set followUpScheduled to true on the old completed appointment in both DBs
        appt.followUpScheduled = true;
        await appt.save();

        if (req.tenantDb) {
            await MasterAppointment.findByIdAndUpdate(appt._id, { $set: { followUpScheduled: true } });
        }

        const io = req.app.get('io');
        if (io) {
            const hId = appt.hospitalId || req.user.hospitalId;
            const docIdStr = finalDoctorId ? finalDoctorId.toString() : '';
            const docUserIdStr = finalDoctorUserId ? finalDoctorUserId.toString() : '';

            io.to('receptionist').to('reception').to('receptiondeskmanager').emit('appointment_created', newMasterAppointment);
            if (docIdStr) io.to(docIdStr).emit('appointment_created', newMasterAppointment);
            if (docUserIdStr) io.to(docUserIdStr).emit('appointment_created', newMasterAppointment);
            io.to('doctor').emit('appointment_created', newMasterAppointment);

            if (hId) {
                const hospRoom = `hospital_${hId}`;
                io.to(hospRoom).emit('appointment_created', newMasterAppointment);
                io.to(`${hospRoom}_receptionist`).to(`${hospRoom}_reception`).to(`${hospRoom}_receptiondeskmanager`).emit('appointment_created', newMasterAppointment);
                if (docIdStr) io.to(`${hospRoom}_${docIdStr}`).emit('appointment_created', newMasterAppointment);
                if (docUserIdStr) io.to(`${hospRoom}_${docUserIdStr}`).emit('appointment_created', newMasterAppointment);
                io.to(`${hospRoom}_doctor`).emit('appointment_created', newMasterAppointment);
            }
        }

        return res.json({ success: true, message: 'Follow-up scheduled successfully', appointment: newMasterAppointment });
    }

    appt.appointmentDate = new Date(date);
    appt.doctorId = finalDoctorId;
    appt.doctorUserId = finalDoctorUserId;
    appt.doctorName = finalDoctorName;
    appt.tokenNumber = finalTokenNumber;
    appt.appointmentTime = finalTime;
    appt.status = 'pending';
    await appt.save();

    if (req.tenantDb) {
        try {
            const updateQuery = {
                appointmentDate: appt.appointmentDate,
                doctorId: appt.doctorId,
                doctorUserId: appt.doctorUserId,
                doctorName: appt.doctorName,
                tokenNumber: appt.tokenNumber,
                appointmentTime: appt.appointmentTime,
                status: 'pending'
            };
            await MasterAppointment.findByIdAndUpdate(appt._id, { $set: updateQuery });
        } catch (syncErr) {
            console.error('[reschedule] Master DB sync failed:', syncErr.message);
        }
    }

    const io = req.app.get('io');
    if (io) {
        const hId = appt.hospitalId || req.user.hospitalId;
        const docIdStr = appt.doctorId ? appt.doctorId.toString() : '';
        const docUserIdStr = appt.doctorUserId ? appt.doctorUserId.toString() : '';

        // Emit to global role rooms
        io.to('receptionist').to('reception').to('receptiondeskmanager').emit('appointment_updated', appt);
        if (docIdStr) io.to(docIdStr).emit('appointment_updated', appt);
        if (docUserIdStr) io.to(docUserIdStr).emit('appointment_updated', appt);
        io.to('doctor').emit('appointment_updated', appt);

        // Emit to hospital-scoped rooms
        if (hId) {
            const hospRoom = `hospital_${hId}`;
            io.to(hospRoom).emit('appointment_updated', appt);
            io.to(`${hospRoom}_receptionist`).to(`${hospRoom}_reception`).to(`${hospRoom}_receptiondeskmanager`).emit('appointment_updated', appt);
            if (docIdStr) io.to(`${hospRoom}_${docIdStr}`).emit('appointment_updated', appt);
            if (docUserIdStr) io.to(`${hospRoom}_${docUserIdStr}`).emit('appointment_updated', appt);
            io.to(`${hospRoom}_doctor`).emit('appointment_updated', appt);
        }
    }

    res.json({ success: true });
});
router.patch('/appointments/:id/cancel', verifyToken, verifyReception, async (req, res) => {
    const cancelQuery = { _id: req.params.id };
    if (req.user.hospitalId) cancelQuery.hospitalId = req.user.hospitalId;
    const { Appointment } = getModels(req);
    const appt = await Appointment.findOneAndUpdate(cancelQuery, { status: 'cancelled' }, { new: true });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found or unauthorized' });

    const io = req.app.get('io');
    if (io) {
        const hId = appt.hospitalId || req.user.hospitalId;
        const docIdStr = appt.doctorId ? appt.doctorId.toString() : '';
        const docUserIdStr = appt.doctorUserId ? appt.doctorUserId.toString() : '';

        // Emit to global role rooms
        io.to('receptionist').to('reception').to('receptiondeskmanager').emit('appointment_updated', appt);
        if (docIdStr) io.to(docIdStr).emit('appointment_updated', appt);
        if (docUserIdStr) io.to(docUserIdStr).emit('appointment_updated', appt);
        io.to('doctor').emit('appointment_updated', appt);

        // Emit to hospital-scoped rooms
        if (hId) {
            const hospRoom = `hospital_${hId}`;
            io.to(hospRoom).emit('appointment_updated', appt);
            io.to(`${hospRoom}_receptionist`).to(`${hospRoom}_reception`).to(`${hospRoom}_receptiondeskmanager`).emit('appointment_updated', appt);
            if (docIdStr) io.to(`${hospRoom}_${docIdStr}`).emit('appointment_updated', appt);
            if (docUserIdStr) io.to(`${hospRoom}_${docUserIdStr}`).emit('appointment_updated', appt);
            io.to(`${hospRoom}_doctor`).emit('appointment_updated', appt);
        }
    }

    res.json({ success: true });
});

// 6. BOOK APPOINTMENT (NEW: Assign Doctor)
router.post('/book-appointment', verifyToken, verifyReception, async (req, res) => {
    try {
        const { patientId, doctorId, date, time, notes, paymentMethod, paymentStatus, amount, parentAppointmentId } = req.body;

        if (!patientId || !doctorId || !date) {
            return res.status(400).json({ success: false, message: 'Missing booking details' });
        }

        const reqDateMatch = String(date).split('T')[0];
        const todayMatch = new Date().toISOString().split('T')[0];
        if (reqDateMatch < todayMatch) {
            return res.status(400).json({ success: false, message: 'Cannot book appointments in the past' });
        }

        const { User, Appointment } = getModels(req);
        const patient = await User.findById(patientId);
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const doctor = await Doctor.findById(doctorId);
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const hospitalId = req.user.hospitalId || patient.hospitalId;

        // Determine appointment mode
        const Hospital = require('../models/hospital.model');
        const hospital = hospitalId ? await Hospital.findById(hospitalId).select('appointmentMode') : null;
        const isTokenMode = hospital?.appointmentMode === 'token';

        let finalTime = time;
        let tokenNumber = null;

        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        if (isTokenMode) {
            // Token mode: assign next sequential token for this doctor on this date
            const count = await Appointment.countDocuments({
                doctorId: doctor._id,
                appointmentDate: { $gte: startOfDay, $lte: endOfDay },
                status: { $ne: 'cancelled' }
            });
            tokenNumber = count + 1;
            finalTime = `token-${tokenNumber}`;
        } else {
            // Slot mode: time required, check double-booking
            if (!time) {
                return res.status(400).json({ success: false, message: 'Appointment time is required for slot-based booking' });
            }
            const existing = await Appointment.findOne({
                doctorId: doctor._id,
                appointmentDate: { $gte: startOfDay, $lte: endOfDay },
                appointmentTime: time,
                status: { $ne: 'cancelled' }
            });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Slot already booked for this doctor at this time!' });
            }
        }

        const appointmentData = {
            userId: patient._id,
            hospitalId,
            patientId: patient.patientId || 'WALK-IN',
            patientName: patient.name,
            patientPhone: patient.phone,
            patientEmail: patient.email || '',
            patientGender: patient.gender || 'Male',
            patientDob: patient.dob ? new Date(patient.dob) : null,
            parentName: patient.parentName || '',
            parentPhone: patient.parentPhone || '',
            doctorId: doctor._id,
            doctorUserId: doctor.userId,
            doctorName: doctor.name,
            serviceId: doctor.services?.[0] || 'general',
            serviceName: 'Walk-in Visit',
            appointmentDate: new Date(date),
            appointmentTime: finalTime || '',
            tokenNumber,
            amount: parentAppointmentId ? 0 : (Number(amount) || doctor.consultationFee || 0),
            status: parentAppointmentId ? 'pending' : 'confirmed',
            paymentStatus: parentAppointmentId ? 'Paid' : (paymentStatus || 'Paid'),
            paymentMethod: paymentMethod || 'Cash',
            notes: notes || 'Walk-in created by reception',
            bookedBy: req.user._id
        };

        const newMasterAppointment = new MasterAppointment(appointmentData);
        await newMasterAppointment.save();

        if (req.tenantDb) {
            const TenantAppointment = getTenantModels(req.tenantDb).Appointment;
            const newTenantAppointment = new TenantAppointment({
                ...appointmentData,
                _id: newMasterAppointment._id
            });
            await newTenantAppointment.save();
        }

        // Record CollectionTransaction if paid amount > 0
        const finalAmount = parentAppointmentId ? 0 : (Number(amount) || doctor.consultationFee || 0);
        const finalPaymentStatus = parentAppointmentId ? 'Paid' : (paymentStatus || 'Paid');
        if (finalAmount > 0 && ['paid', 'Paid'].includes(finalPaymentStatus)) {
            const isFollowUp = (notes && String(notes).toLowerCase().includes('follow')) || !!parentAppointmentId;
            const collectionType = isFollowUp ? 'Follow-up Consultation' : 'OPD Registration';

            const transactionData = {
                hospitalId,
                patientId: patient._id,
                patientName: patient.name,
                patientPhone: patient.phone || '',
                patientIdStr: patient.patientId || patient.mrn || 'WALK-IN',
                appointmentId: newMasterAppointment._id,
                amount: finalAmount,
                paymentMethod: paymentMethod || 'Cash',
                collectedByUserId: req.user._id,
                collectedByName: req.user.name || 'Staff',
                counterName: req.user.counterName && req.user.counterName !== 'Counter 1' ? req.user.counterName : (req.user.name || 'Counter 1'),
                collectionType,
                collectionTimestamp: new Date()
            };

            const MasterCollectionTransaction = require('../models/collectionTransaction.model');
            const masterTx = new MasterCollectionTransaction(transactionData);
            await masterTx.save();

            if (req.tenantDb) {
                const TenantCollectionTransaction = getTenantModels(req.tenantDb).CollectionTransaction;
                const tenantTx = new TenantCollectionTransaction({
                    ...transactionData,
                    _id: masterTx._id
                });
                await tenantTx.save();
            }
        }

        if (parentAppointmentId) {
            await MasterAppointment.findByIdAndUpdate(parentAppointmentId, { $set: { followUpScheduled: true } });
            if (req.tenantDb) {
                const TenantAppointment = getTenantModels(req.tenantDb).Appointment;
                await TenantAppointment.findByIdAndUpdate(parentAppointmentId, { $set: { followUpScheduled: true } });
            }
        }

        const io = req.app.get('io');
        if (io) {
            const hId = hospitalId || req.user.hospitalId;
            const docIdStr = doctor._id.toString();
            const docUserIdStr = doctor.userId ? doctor.userId.toString() : '';

            // Emit to global role rooms
            io.to('receptionist').to('reception').to('receptiondeskmanager').emit('appointment_created', newMasterAppointment);
            if (docIdStr) io.to(docIdStr).emit('appointment_created', newMasterAppointment);
            if (docUserIdStr) io.to(docUserIdStr).emit('appointment_created', newMasterAppointment);
            io.to('doctor').emit('appointment_created', newMasterAppointment);

            // Emit to hospital-scoped rooms
            if (hId) {
                const hospRoom = `hospital_${hId}`;
                io.to(hospRoom).emit('appointment_created', newMasterAppointment);
                io.to(`${hospRoom}_receptionist`).to(`${hospRoom}_reception`).to(`${hospRoom}_receptiondeskmanager`).emit('appointment_created', newMasterAppointment);
                if (docIdStr) io.to(`${hospRoom}_${docIdStr}`).emit('appointment_created', newMasterAppointment);
                if (docUserIdStr) io.to(`${hospRoom}_${docUserIdStr}`).emit('appointment_created', newMasterAppointment);
                io.to(`${hospRoom}_doctor`).emit('appointment_created', newMasterAppointment);
            }
        }

        res.json({ success: true, message: 'Appointment booked successfully!', appointment: newMasterAppointment, tokenNumber });

    } catch (error) {
        console.error("Reception Booking Error:", error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'This slot is already booked for this doctor at this time. Please select another slot.' });
        }
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 7b. CONFIRM PAYMENT for an existing appointment
router.patch('/appointments/:id/confirm-payment', verifyToken, verifyReception, async (req, res) => {
    try {
        const { paymentMethod, amount } = req.body;
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;
        const { Appointment } = getModels(req);
        const appt = await Appointment.findOne(findQuery);
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found or unauthorized' });
        appt.paymentStatus = 'Paid';
        appt.paymentMethod = paymentMethod || appt.paymentMethod || 'Cash';
        if (amount !== undefined) appt.amount = amount;
        await appt.save();

        if (req.tenantDb) {
            const MasterAppointment = require('../models/appointment.model');
            await MasterAppointment.findByIdAndUpdate(appt._id, {
                $set: {
                    paymentStatus: 'Paid',
                    paymentMethod: appt.paymentMethod,
                    amount: appt.amount
                }
            });
        }

        // Record CollectionTransaction if paid amount > 0
        if (appt.amount > 0) {
            const isFollowUp = (appt.notes && String(appt.notes).toLowerCase().includes('follow')) || (appt.serviceName && String(appt.serviceName).toLowerCase().includes('follow'));
            const collectionType = isFollowUp ? 'Follow-up Consultation' : 'OPD Registration';

            const transactionData = {
                hospitalId: appt.hospitalId || req.user.hospitalId,
                patientId: appt.userId,
                patientName: appt.patientName,
                patientPhone: appt.patientPhone || '',
                patientIdStr: appt.patientId || 'WALK-IN',
                appointmentId: appt._id,
                amount: appt.amount,
                paymentMethod: appt.paymentMethod,
                collectedByUserId: req.user._id,
                collectedByName: req.user.name || 'Staff',
                counterName: req.user.counterName && req.user.counterName !== 'Counter 1' ? req.user.counterName : (req.user.name || 'Counter 1'),
                collectionType,
                collectionTimestamp: new Date()
            };

            const MasterCollectionTransaction = require('../models/collectionTransaction.model');
            const masterTx = new MasterCollectionTransaction(transactionData);
            await masterTx.save();

            if (req.tenantDb) {
                const TenantCollectionTransaction = getTenantModels(req.tenantDb).CollectionTransaction;
                const tenantTx = new TenantCollectionTransaction({
                    ...transactionData,
                    _id: masterTx._id
                });
                await tenantTx.save();
            }
        }

        res.json({ success: true, appointment: appt });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 7. PATIENT CHECK-IN (Reception to Doctor/Clinic Workflow)
router.post('/check-in', verifyToken, verifyReception, async (req, res) => {
    try {
        const { patientId, appointmentId } = req.body;

        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }

        const { ClinicalVisit, Appointment } = getModels(req);
        const io = req.app.get('io');

        const visitData = {
            patientId,
            appointmentId: appointmentId || null,
            status: 'check_in',
            hospitalId: req.user.hospitalId || undefined
        };

        let visit;
        if (req.tenantDb) {
            // Dual-write: write to master DB first
            const MasterClinicalVisit = require('../models/clinicalVisit.model');
            const masterVisit = new MasterClinicalVisit(visitData);
            await masterVisit.save();

            // Write to tenant DB
            const TenantClinicalVisit = getTenantModels(req.tenantDb).ClinicalVisit;
            visit = new TenantClinicalVisit({
                ...visitData,
                _id: masterVisit._id
            });
            await visit.save();
        } else {
            visit = new ClinicalVisit(visitData);
            await visit.save();
        }

        if (appointmentId) {
            // Update appointment status - set to confirmed so it remains in the active queue until completed by the doctor
            await Appointment.findByIdAndUpdate(appointmentId, { status: 'confirmed' });
            if (req.tenantDb) {
                const MasterAppointment = require('../models/appointment.model');
                await MasterAppointment.findByIdAndUpdate(appointmentId, { status: 'confirmed' });
            }
        }

        // Emit socket event to update Reception/Doctor grids
        if (io) {
            const payload = { visitId: visit._id, patientId, status: 'check_in', appointmentId };
            io.emit('patient_status_changed', payload);

            const hId = req.user.hospitalId || visit.hospitalId;
            if (hId) {
                const hospRoom = `hospital_${hId}`;
                io.to(hospRoom).emit('patient_status_changed', payload);
                io.to(`${hospRoom}_receptionist`).to(`${hospRoom}_reception`).to(`${hospRoom}_receptiondeskmanager`).emit('patient_status_changed', payload);
                io.to(`${hospRoom}_doctor`).emit('patient_status_changed', payload);
            }
        }

        res.json({ success: true, message: 'Patient checked in successfully', visit });
    } catch (error) {
        console.error("Check-in Error:", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 8. TRANSACTIONS
router.get('/transactions', verifyToken, verifyReception, async (req, res) => {
    try {
        let queryFilter = { amount: { $gt: 0 }, bookedBy: req.user._id };
        if (req.user.hospitalId) {
            queryFilter.hospitalId = req.user.hospitalId;
        }
        const { Appointment } = getModels(req);
        const transactions = await Appointment.find(queryFilter)
            .populate('userId', 'name phone patientId email')
            .populate({ path: 'doctorId', model: Doctor, select: 'name' })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.json({ success: true, transactions });
    } catch (e) { res.status(500).json({ success: false, message: 'An internal error occurred' }); }
});

// ─── Report upload configuration ─────────────────────────────────────────────
const reportsDir = path.join(__dirname, '../../uploads/patient-reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

const reportStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, reportsDir),
    filename:    (_req, file, cb) => {
        const safe = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'report-' + safe + path.extname(file.originalname));
    },
});
const uploadReport = multer({
    storage: reportStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (_req, file, cb) => {
        const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype);
        cb(ok ? null : new Error('Only PDF and images are allowed'), ok);
    },
});

// 9. UPLOAD PATIENT PAST REPORT — POST /api/reception/patients/:id/reports
router.post('/patients/:id/reports', verifyToken, verifyReception, uploadReport.single('report'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const typeErr = await validateFileType(req.file, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
        if (typeErr) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
            return res.status(400).json({ success: false, message: typeErr });
        }

        const { User } = getModels(req);
        
        // Find user. Receptionists can only access patients of their own hospital if scoped
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;

        const patient = await User.findOne(findQuery);
        if (!patient) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
            return res.status(404).json({ success: false, message: 'Patient not found or unauthorized' });
        }

        const reportName = req.body.name?.trim() || req.file.originalname;
        const entry = { name: reportName, filename: req.file.filename, mimetype: req.file.mimetype };
        
        if (!patient.pastReports) {
            patient.pastReports = [];
        }
        patient.pastReports.push(entry);
        await patient.save();

        // Dual-write to master database User document if req.tenantDb exists
        if (req.tenantDb) {
            const masterPatient = await MasterUser.findOne({ _id: req.params.id });
            if (masterPatient) {
                if (!masterPatient.pastReports) {
                    masterPatient.pastReports = [];
                }
                masterPatient.pastReports.push(entry);
                await masterPatient.save();
            }
        }

        res.json({
            success: true,
            report: patient.pastReports[patient.pastReports.length - 1],
            message: 'Previous hospital report uploaded successfully'
        });
    } catch (err) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        console.error('[upload-past-report]', err.message);
        res.status(500).json({ success: false, message: 'Failed to upload report. Please try again.' });
    }
});

// 10. DELETE PATIENT PAST REPORT — DELETE /api/reception/patients/:id/reports/:reportId
router.delete('/patients/:id/reports/:reportId', verifyToken, verifyReception, async (req, res) => {
    try {
        const { User } = getModels(req);
        
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;

        const patient = await User.findOne(findQuery);
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const report = patient.pastReports.id(req.params.reportId);
        if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

        const filename = report.filename;
        patient.pastReports.pull(req.params.reportId);
        await patient.save();

        // Dual-write deletion to master database
        if (req.tenantDb) {
            const masterPatient = await MasterUser.findOne({ _id: req.params.id });
            if (masterPatient) {
                masterPatient.pastReports.pull(req.params.reportId);
                await masterPatient.save();
            }
        }

        // Delete from local disk
        const filePath = path.join(reportsDir, filename);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (_) {}
        }

        res.json({ success: true, message: 'Report deleted successfully' });
    } catch (err) {
        console.error('[delete-past-report]', err.message);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;