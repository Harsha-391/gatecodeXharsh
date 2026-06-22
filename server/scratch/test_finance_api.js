const axios = require('axios');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = 'a7ad54f3356c02e5256a7a148afecede';

async function test() {
    try {
        console.log('Generating accountant token...');
        const token = jwt.sign(
            {
                jti: uuidv4(),
                userId: '6a33e0cbe369bef405196fb9',
                email: 'accountant@crm.com',
                roleId: '6a33e0cbe369bef405196f94',
                hospitalId: '6a33e0cbe369bef405196f97',
                tv: 0,
            },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        console.log('Token generated:', token.substring(0, 15) + '...');
        
        console.log('Fetching reception-collections...');
        const res = await axios.get('http://localhost:3000/api/finance/reception-collections', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        
        console.log('Response status:', res.status);
        console.log('Response data:', JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('API call failed:');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data);
        } else {
            console.error(err.message);
        }
    }
}

test();
