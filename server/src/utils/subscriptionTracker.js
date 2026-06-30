const ClinicSubscription = require('../models/clinicSubscription.model');
const Hospital = require('../models/hospital.model');
const { getTenantModels } = require('../db/tenantModels');

/**
 * Tracks a newly registered patient for a clinic/hospital by updating their subscription record in the master DB.
 * Works for both clinicType = 'clinic' and clinicType = 'hospital'.
 * 
 * @param {object} req - Express request object (containing tenantDb if applicable)
 * @param {string} hospitalId - ID of the hospital/clinic
 */
const trackNewPatient = async (req, hospitalId) => {
    try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        // 1. Fetch hospital details
        const hospital = await Hospital.findById(hospitalId).select('clinicType subscription');
        if (!hospital) return;

        const rate = hospital.subscription?.ratePerPatient || 0;

        // 2. Count total patients in tenant DB or master DB
        let totalPatients = 0;
        if (req.tenantDb) {
            const models = getTenantModels(req.tenantDb);
            if (hospital.clinicType === 'clinic') {
                totalPatients = await models.ClinicPatient.countDocuments({ clinicId: hospitalId });
            } else {
                totalPatients = await models.HospitalPatient.countDocuments({ hospitalId });
            }
        } else {
            // Fallback to master collections
            if (hospital.clinicType === 'clinic') {
                const ClinicPatient = require('../models/clinicPatient.model');
                totalPatients = await ClinicPatient.countDocuments({ clinicId: hospitalId });
            } else {
                const HospitalPatient = require('../models/hospitalPatient.model');
                totalPatients = await HospitalPatient.countDocuments({ hospitalId });
            }
        }

        // 3. Upsert ClinicSubscription in the master DB
        await ClinicSubscription.findOneAndUpdate(
            { clinicId: hospitalId, month, year },
            {
                $inc: { newPatientCount: 1 },
                $set: { totalPatientCount: totalPatients, ratePerPatient: rate },
            },
            { upsert: true, new: true }
        ).then(sub => {
            sub.totalAmount = sub.newPatientCount * sub.ratePerPatient;
            return sub.save();
        });
    } catch (err) {
        console.error('Error tracking new patient registration:', err);
    }
};

module.exports = { trackNewPatient };
