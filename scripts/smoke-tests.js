const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

console.log(`Running smoke tests against ${BASE_URL}...`);

const req = https.get(`${BASE_URL}/api/health`, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  if (res.statusCode >= 200 && res.statusCode < 300) {
    console.log('✅ Health check passed!');
    process.exit(0);
  } else {
    console.error('❌ Health check failed!');
    process.exit(1);
  }
});

req.on('error', (e) => {
  console.error(`❌ Connection error: ${e.message}`);
  process.exit(1);
});

req.end();
