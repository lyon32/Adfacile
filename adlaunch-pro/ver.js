const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');
db.get('SELECT sqlite_version()', (err, row) => {
    console.log(row);
});
