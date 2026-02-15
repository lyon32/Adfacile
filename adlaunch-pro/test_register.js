const http = require('http');

const user = JSON.stringify({
    name: 'Test User ' + Date.now(),
    email: 'test' + Date.now() + '@example.com',
    phone: '123456789',
    password: 'password123'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/register',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': user.length
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Body:', data);
    });
});

req.on('error', (e) => {
    console.error(`Error: ${e.message}`);
});

req.write(user);
req.end();
