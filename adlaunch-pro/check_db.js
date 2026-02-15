const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'adlaunch.db'));

const query = `
    SELECT id, name, email, phone, role FROM users
`;

db.all(query, [], (err, rows) => {
    if (err) {
        console.error('QUERY ERROR:', err.message);
        return;
    }
    console.log(`TOTAL USERS FOUND: ${rows.length}`);
    rows.forEach(r => console.log(`ID: ${r.id} | Name: ${r.name} | Email: ${r.email}`));
    db.close();
});
