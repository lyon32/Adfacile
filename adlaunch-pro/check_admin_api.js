const http = require('http');

async function checkAdminAPI() {
    // 1. Login as admin
    const loginData = JSON.stringify({
        email: 'admin@adlaunch.pro',
        password: 'admin123'
    });

    const loginOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': loginData.length
        }
    };

    let token = '';
    const loginReq = http.request(loginOptions, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
            const data = JSON.parse(body);
            token = data.token;
            console.log('Login Success, Token obtained.');
            
            // 2. Fetch users
            const userOptions = {
                hostname: 'localhost', port: 3000, path: '/api/admin/users', method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            };
            
            http.request(userOptions, (res2) => {
                let body2 = '';
                res2.on('data', (c) => body2 += c);
                res2.on('end', () => {
                    const data2 = JSON.parse(body2);
                    console.log('API Status:', res2.statusCode);
                    console.log('Users Count:', Array.isArray(data2) ? data2.length : 'Error - not an array');
                    console.log('Users Data:', JSON.stringify(data2, null, 2));
                });
            }).end();
        });
    });
    loginReq.write(loginData);
    loginReq.end();
}

checkAdminAPI();
