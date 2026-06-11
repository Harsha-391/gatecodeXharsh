// server/scripts/fix-question-library.js
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/db/db');
const QuestionLibrary = require('../src/models/questionLibrary.model');

async function run() {
    try {
        await connectDB();
        console.log("Database connected successfully.");
        
        const libraries = await QuestionLibrary.find({});
        console.log(`Found ${libraries.length} libraries.`);
        
        for (const lib of libraries) {
            console.log("\nChecking library ID:", lib._id);
            const data = lib.data || {};
            
            // Check if this document has "specialty" and "questions" at the top level
            if (data.specialty || data.questions) {
                console.log("Found malformed/legacy question library format. Migrating...");
                
                const specialtyName = data.specialty || "Gynecology";
                const legacyQuestions = data.questions || [];
                
                // Map the legacy questions to the format expected by DynamicQuestionForm & the QL builder
                const mappedQuestions = legacyQuestions.map(q => {
                    let type = q.type;
                    if (type === 'boolean') {
                        type = 'yes-no';
                    }
                    return {
                        q: q.label || q.q || "Question",
                        type: type || 'text'
                    };
                });
                
                // Build the correct nested structure: [Department] -> [Category] -> [Questions]
                const newData = {
                    "General": {},
                    "Orthopedics": {},
                    "ENT": {}
                };
                
                newData[specialtyName] = {
                    "Clinical Questions": mappedQuestions
                };
                
                console.log("New structured data:", JSON.stringify(newData, null, 2));
                
                lib.data = newData;
                lib.markModified('data');
                await lib.save();
                console.log(`✅ Library ${lib._id} updated successfully.`);
            } else {
                console.log("Library format is already correct or does not contain specialty/questions keys.");
            }
        }
        
        process.exit(0);
    } catch (err) {
        console.error("Error during migration:", err);
        process.exit(1);
    }
}

run();
