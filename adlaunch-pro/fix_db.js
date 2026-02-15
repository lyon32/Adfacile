const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'adlaunch.db'));

db.serialize(() => {
    db.run('ALTER TABLE users ADD COLUMN last_seen DATETIME', (err) => {
        if (err) {
            console.log('Error or already exists:', err.message);
        } else {
            console.log('Column last_seen added successfully.');
            db.run("UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE last_seen IS NULL");
        }
    });
});

db.close();
