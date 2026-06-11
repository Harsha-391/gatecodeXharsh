const express = require('express');
const router = express.Router();
const LabTest = require('../models/labTest.model');
const { verifyToken, verifyAdminOrSuperAdmin } = require('../middleware/auth.middleware');

// 1. GET ALL LAB TESTS (Accessible to any authenticated staff: Admin, Doctor, Lab Tech, etc.)
router.get('/', verifyToken, async (req, res) => {
    try {
        const isAdmin = ['superadmin', 'admin', 'centraladmin', 'hospitaladmin'].includes(req.user.role);
        const hospitalId = req.query.hospitalId || (req.user.hospitalId ? req.user.hospitalId.toString() : null);

        // Build query: always include global tests; also include hospital-specific tests if hospitalId is known
        let query = {};
        if (hospitalId) {
            query = { $or: [{ hospitalId: null }, { hospitalId: hospitalId }] };
        } else {
            query = { hospitalId: null };
        }

        // Non-admins only see active tests
        if (!isAdmin) query.isActive = true;

        const labTests = await LabTest.find(query).sort({ name: 1 }).lean();

        // Resolve hospital-specific prices
        if (hospitalId) {
            const hid = hospitalId.toString();
            labTests.forEach(test => {
                const hospitalPrice = test.hospitalPrices && test.hospitalPrices[hid];
                test.effectivePrice = hospitalPrice !== undefined ? hospitalPrice : test.price;
            });
        } else {
            labTests.forEach(test => {
                test.effectivePrice = test.price;
            });
        }

        res.json({ success: true, count: labTests.length, data: labTests });
    } catch (error) {
        console.error('Fetch Lab Tests Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 2. CREATE A NEW LAB TEST
router.post('/', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { name, code, description, price, category, isActive } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Test name is required' });
        }

        // Hospital admins create hospital-specific tests; central/super admins create global tests
        const isCentral = req.user.role === 'superadmin' || req.user.role === 'centraladmin';
        const hospitalId = isCentral ? null : (req.user.hospitalId || null);

        // Check uniqueness within the same scope (global or hospital-specific)
        const testExists = await LabTest.findOne({ name, hospitalId });
        if (testExists) {
            return res.status(400).json({ success: false, message: 'Lab test with this name already exists' });
        }

        const newTest = await LabTest.create({
            name, code, description, price, category, isActive, hospitalId
        });

        res.status(201).json({ success: true, message: 'Lab test created', data: newTest });
    } catch (error) {
        console.error('Create Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error creating lab test' });
    }
});

// 3. UPDATE A LAB TEST
router.put('/:id', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { name, code, description, price, category, isActive, hospitalPrices } = req.body;

        const test = await LabTest.findById(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        // Hospital admin can only edit their own hospital's tests
        const isCentral = req.user.role === 'superadmin' || req.user.role === 'centraladmin';
        if (!isCentral) {
            const testHid = test.hospitalId ? test.hospitalId.toString() : null;
            const userHid = req.user.hospitalId ? req.user.hospitalId.toString() : null;
            if (testHid !== userHid) {
                return res.status(403).json({ success: false, message: 'You can only edit tests created by your hospital' });
            }
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (code !== undefined) updateData.code = code;
        if (description !== undefined) updateData.description = description;
        if (price !== undefined) updateData.price = price;
        if (category !== undefined) updateData.category = category;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (hospitalPrices !== undefined) updateData.hospitalPrices = hospitalPrices;

        const updatedTest = await LabTest.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({ success: true, message: 'Lab test updated', data: updatedTest });
    } catch (error) {
        console.error('Update Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error updating lab test' });
    }
});

// 5. SET HOSPITAL-SPECIFIC PRICE FOR A LAB TEST
router.put('/:id/hospital-price', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { hospitalId, price } = req.body;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'hospitalId is required' });

        const test = await LabTest.findById(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        if (price === null || price === undefined || price === '') {
            // Remove hospital-specific price (fall back to default)
            test.hospitalPrices.delete(hospitalId);
        } else {
            test.hospitalPrices.set(hospitalId, Number(price));
        }
        await test.save();

        res.json({ success: true, message: 'Hospital price updated', data: test });
    } catch (error) {
        console.error('Set Hospital Price Error:', error);
        res.status(500).json({ success: false, message: 'Error setting hospital price' });
    }
});

// 4. DELETE A LAB TEST
router.delete('/:id', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const test = await LabTest.findById(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        // Hospital admin can only delete their own hospital's tests
        const isCentral = req.user.role === 'superadmin' || req.user.role === 'centraladmin';
        if (!isCentral) {
            const testHid = test.hospitalId ? test.hospitalId.toString() : null;
            const userHid = req.user.hospitalId ? req.user.hospitalId.toString() : null;
            if (testHid !== userHid) {
                return res.status(403).json({ success: false, message: 'You can only delete tests created by your hospital' });
            }
        }

        await test.deleteOne();
        res.json({ success: true, message: 'Lab test deleted successfully' });
    } catch (error) {
        console.error('Delete Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error deleting lab test' });
    }
});

// 6. SEED DUMMY LAB TESTS WITH PRICES
router.post('/seed-dummy', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const isCentral = req.user.role === 'superadmin' || req.user.role === 'centraladmin';
        const hospitalId = isCentral ? null : (req.user.hospitalId || null);

        const dummyTests = [
            { name: 'Complete Blood Count (CBC)', code: 'CBC', category: 'Hematology', price: 350, description: 'Measures red and white blood cells, platelets, and hemoglobin. Useful for checking anemia and infection. No fasting required.' },
            { name: 'Lipid Profile', code: 'LIPID', category: 'Biochemistry', price: 600, description: 'Measures total cholesterol, HDL, LDL, and triglycerides. Fasting of 10-12 hours is strictly required.' },
            { name: 'Liver Function Test (LFT)', code: 'LFT', category: 'Biochemistry', price: 750, description: 'Evaluates protein, bilirubin, and liver enzymes (SGOT, SGPT, ALP) in the blood to assess liver health.' },
            { name: 'Kidney Function Test (KFT)', code: 'KFT', category: 'Biochemistry', price: 700, description: 'Tests blood levels of urea, creatinine, uric acid, and electrolytes to check how well kidneys filter waste.' },
            { name: 'Thyroid Profile (T3, T4, TSH)', code: 'THYROID', category: 'Endocrinology', price: 850, description: 'Screening test for hyperthyroidism and hypothyroidism. TSH is highly sensitive.' },
            { name: 'HbA1c (Glycated Hemoglobin)', code: 'HBA1C', category: 'Diabetology', price: 450, description: 'Reflects your average blood sugar levels over the past 3 months. Essential for diabetes management. No fasting required.' },
            { name: 'Blood Glucose (Fasting & PP)', code: 'GLUCOSE', category: 'Diabetology', price: 150, description: 'Measures glucose levels before and 2 hours after a meal. Used to diagnose and monitor diabetes.' },
            { name: 'Urine Routine & Microscopy', code: 'URINE', category: 'Pathology', price: 200, description: 'Analysis of urine sample for color, pH, protein, glucose, and microscopic elements like cells or bacteria.' },
            { name: 'Vitamin D3 (25-Hydroxy)', code: 'VITD3', category: 'Vitamins', price: 1200, description: 'Measures levels of Vitamin D to assess bone strength, calcium absorption, and immune function.' },
            { name: 'Vitamin B12', code: 'VITB12', category: 'Vitamins', price: 900, description: 'Measures Vitamin B12 levels. Vital for nerve health and red blood cell production.' },
            { name: 'Iron Profile', code: 'IRON', category: 'Hematology', price: 800, description: 'Measures serum iron, ferritin, and total iron-binding capacity (TIBC) to diagnose iron-deficiency anemia.' },
            { name: 'Electrolytes Panel', code: 'ELECTROLYTES', category: 'Biochemistry', price: 400, description: 'Measures blood sodium, potassium, and chloride levels. Vital for nerve and muscle function.' },
            { name: 'Dengue NS1 Antigen & Antibody', code: 'DENGUE', category: 'Serology', price: 1100, description: 'Rapid antigen and antibody test for early detection of Dengue viral infection.' },
            { name: 'Widal Test (Typhoid)', code: 'WIDAL', category: 'Serology', price: 300, description: 'Slide agglutination test to screen for enteric fever (Typhoid).' },
            { name: 'C-Reactive Protein (CRP)', code: 'CRP', category: 'Immunology', price: 450, description: 'Measures general level of inflammation in the body. Useful in diagnosing infectious or chronic inflammatory conditions.' }
        ];

        let addedCount = 0;
        let skippedCount = 0;

        for (const testData of dummyTests) {
            // Check if test already exists in this scope
            const exists = await LabTest.findOne({ name: testData.name, hospitalId });
            if (!exists) {
                await LabTest.create({
                    ...testData,
                    hospitalId,
                    isActive: true
                });
                addedCount++;
            } else {
                skippedCount++;
            }
        }

        res.status(201).json({
            success: true,
            message: `Successfully seeded dummy lab tests!`,
            added: addedCount,
            skipped: skippedCount
        });
    } catch (error) {
        console.error('Seed Lab Tests Error:', error);
        res.status(500).json({ success: false, message: 'Error seeding lab tests' });
    }
});

module.exports = router;

