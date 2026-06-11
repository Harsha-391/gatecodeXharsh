const axios = require('axios');

async function test() {
    try {
        const baseURL = 'http://localhost:3000';
        console.log('Logging in as Dr. Rajesh Kumar...');
        
        // 1. Login
        const loginRes = await axios.post(`${baseURL}/api/auth/login`, {
            email: 'rajesh@crm.com',
            password: '123'
        });
        
        if (!loginRes.data.success) {
            console.error('Login failed:', loginRes.data);
            return;
        }
        
        const token = loginRes.data.token;
        const hospitalId = loginRes.data.user.hospitalId;
        console.log('Login successful. Token acquired. Hospital ID:', hospitalId);

        // 2. Find a confirmed appointment for Rajesh in the DB (or use the one we saw)
        const aptId = '6a1d5680592d0fcc3180c5f1';
        console.log(`Recommending admission for appointment ID: ${aptId}...`);

        // 3. Post to recommend-admission
        const recommendRes = await axios.post(
            `${baseURL}/api/doctor/appointments/${aptId}/recommend-admission`,
            {
                notes: 'Patient requires immediate 24h cardiac monitoring for unstable angina.',
                priority: 'Critical',
                requestedDepartment: 'Cardiology'
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        console.log('Recommend Admission Response:', recommendRes.data);
        
        // 4. Verify admission record exists
        console.log('\nFetching active admissions as Receptionist to verify card data...');
        const receptionLoginRes = await axios.post(`${baseURL}/api/auth/login`, {
            email: 'reception@crm.com',
            password: '123'
        });
        const receptionToken = receptionLoginRes.data.token;

        const activeAdmissionsRes = await axios.get(`${baseURL}/api/admissions/active`, {
            headers: {
                Authorization: `Bearer ${receptionToken}`
            }
        });
        console.log('Active Admissions:', JSON.stringify(activeAdmissionsRes.data, null, 2));

    } catch (err) {
        console.error('Error during integration test:', err.response ? err.response.data : err.message);
    }
}

test();
