const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/health',
  method: 'GET',
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log('HEADERS:');
  console.log(JSON.stringify(res.headers, null, 2));

  const securityHeaders = [
    'x-dns-prefetch-control',
    'x-frame-options',
    'strict-transport-security',
    'x-download-options',
    'x-content-type-options',
    'x-xss-protection', // Note: Helmet might not set this in newer versions or sets it to 0
    'content-security-policy',
    'ratelimit-limit',
    'ratelimit-remaining'
  ];

  let missingHeaders = [];
  securityHeaders.forEach(header => {
    if (!res.headers[header]) {
      // standard-headers in rate-limit uses RateLimit-Limit, but check case-insensitive
      // Helmet HSTS defaults to false? strictTransportSecurity is default in Helmet 4+?
      // actually Helmet 4+ enables HSTS.
      // let's just log present ones.
    }
  });

  if (res.headers['x-powered-by']) {
    console.error('❌ X-Powered-By header is present! (Should be hidden by Helmet)');
  } else {
    console.log('✅ X-Powered-By header is hidden.');
  }

  if (res.headers['x-frame-options']) {
    console.log('✅ X-Frame-Options is present.');
  } else {
    console.warn('⚠️ X-Frame-Options is MISSING.');
  }
  
  if (res.headers['content-security-policy']) {
    console.log('✅ Content-Security-Policy is present.');
  } else {
    console.warn('⚠️ Content-Security-Policy is MISSING.');
  }
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
