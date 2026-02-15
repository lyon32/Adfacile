const selfsigned = require('selfsigned');
const fs = require('fs');

const attrs = [{ name: 'commonName', value: 'localhost' }];

(async () => {
    try {
        console.log('Generating certificates...');
        const pems = await selfsigned.generate(attrs, { days: 365 });
        
        fs.writeFileSync('key.pem', pems.private);
        fs.writeFileSync('cert.pem', pems.cert);
        
        console.log('Certificates generated successfully: key.pem, cert.pem');
    } catch (err) {
        console.error('Generation failed:', err);
    }
})();
