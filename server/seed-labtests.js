const mongoose = require('mongoose');
const LabTest = require('./src/models/labTest.model');

const MONGO_URI = 'mongodb+srv://omrishisharma:1234@cluster0.fkmafvw.mongodb.net/HSM';

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

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB successfully for seeding...');

        let addedCount = 0;
        let skippedCount = 0;

        for (const testData of dummyTests) {
            // Check if test already exists in global scope
            const exists = await LabTest.findOne({ name: testData.name, hospitalId: null });
            if (!exists) {
                await LabTest.create({
                    ...testData,
                    hospitalId: null,
                    isActive: true
                });
                console.log(`[ADDED] ${testData.name}`);
                addedCount++;
            } else {
                console.log(`[SKIPPED] ${testData.name} (already exists)`);
                skippedCount++;
            }
        }

        console.log(`\nSeeding completed! Added: ${addedCount}, Skipped: ${skippedCount}\n`);
        await mongoose.disconnect();
    } catch (err) {
        console.error('Error during seeding:', err);
    }
}

seed();
