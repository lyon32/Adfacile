const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'your_super_secret_key_change_it';
const DB_PATH = path.join(__dirname, 'adlaunch.db');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Prevent caching for HTML files
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
    next();
});

app.use(express.static(__dirname));

// --- SQLITE DATABASE SETUP ---
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite database.');
});

// Helper for database queries with Promises
const dbRun = (query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
    });
});

const dbGet = (query, params = []) => new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const dbAll = (query, params = []) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

const initDB = async () => {
    // Users table
    await dbRun(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        avatar TEXT,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);


    // Add last_seen column if it doesn't exist
    try {
        await dbRun('ALTER TABLE users ADD COLUMN last_seen DATETIME');
        await dbRun('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE last_seen IS NULL');
    } catch (e) {}

    // Add Facebook columns if they don't exist
    try {
        await dbRun('ALTER TABLE users ADD COLUMN fb_access_token TEXT');
        await dbRun('ALTER TABLE users ADD COLUMN fb_user_id TEXT');
    } catch (e) {}

    // Transactions table
    await dbRun(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        userName TEXT,
        amount REAL,
        status TEXT,
        plan TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    // Payments table
    await dbRun(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount REAL,
        currency TEXT DEFAULT 'XOF',
        status TEXT DEFAULT 'pending',
        transaction_id TEXT UNIQUE,
        provider TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        campaign_data TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Default Admin
    const admin = await dbGet('SELECT * FROM users WHERE role = ?', ['admin']);
    if (!admin) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await dbRun('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', 
            ['Administrator', 'admin@adlaunch.pro', hashedPassword, 'admin']);
        console.log('Default admin created.');
    }

    // Default Transaction if empty
    const txCount = await dbGet('SELECT COUNT(*) as count FROM transactions');
    if (txCount.count === 0) {
        await dbRun('INSERT INTO transactions (userId, userName, amount, status, plan) VALUES (?, ?, ?, ?, ?)',
            [1, 'Administrator', 49.99, 'completed', 'Pro Plan']);
    }

    // Ensure uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
};

initDB();

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Accès refusé' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Session invalide' });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès administrateur requis' });
    next();
};

// --- AUTH ROUTES ---

app.post('/api/register', async (req, res) => {
    const { name, email, phone, password } = req.body;
    console.log(`[Registration Attempt] Name: ${name}, Email: ${email}`);
    try {
        // Check email
        const existingEmail = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (existingEmail) return res.status(400).json({ error: 'Cet email est déjà utilisé' });

        // Check phone
        const existingPhone = await dbGet('SELECT * FROM users WHERE phone = ?', [phone]);
        if (existingPhone) return res.status(400).json({ error: 'Ce numéro de téléphone est déjà utilisé' });

        // Check name (if requested to be unique)
        const existingName = await dbGet('SELECT * FROM users WHERE name = ?', [name]);
        if (existingName) return res.status(400).json({ error: 'Ce nom est déjà utilisé' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await dbRun('INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)', 
            [name, email, phone, hashedPassword]);
        
        const token = jwt.sign({ id: result.lastID, email, name, role: 'user' }, SECRET_KEY, { expiresIn: '24h' });
        
        // Log total users to prove real-time update
        const count = await dbGet('SELECT COUNT(*) as total FROM users');
        console.log(`[Registration Success] User ID: ${result.lastID} | Total Users: ${count.total}`);
        
        res.status(201).json({ 
            message: 'Utilisateur enregistré avec succès',
            token,
            user: { id: result.lastID, name, email, phone, role: 'user', avatar: null }
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) return res.status(400).json({ error: 'Utilisateur non trouvé' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Mot de passe incorrect' });
        
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
        res.json({
            message: 'Connexion réussie',
            token,
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatar: user.avatar }
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

// --- USER ROUTES ---

app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await dbGet('SELECT id, name, email, phone, role, avatar, fb_access_token, fb_user_id FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
    const { name, phone, password, avatar } = req.body;
    try {
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

        // Check duplicates for NEW values only
        if (name && name !== user.name) {
            const existingName = await dbGet('SELECT * FROM users WHERE name = ? AND id != ?', [name, req.user.id]);
            if (existingName) return res.status(400).json({ error: 'Ce nom est déjà utilisé' });
        }
        if (phone && phone !== user.phone) {
            const existingPhone = await dbGet('SELECT * FROM users WHERE phone = ? AND id != ?', [phone, req.user.id]);
            if (existingPhone) return res.status(400).json({ error: 'Ce numéro de téléphone est déjà utilisé' });
        }

        const newName = name || user.name;
        const newPhone = phone || user.phone;
        const newAvatar = avatar !== undefined ? avatar : user.avatar;
        let newPassword = user.password;

        if (password) newPassword = await bcrypt.hash(password, 10);

        await dbRun('UPDATE users SET name = ?, phone = ?, password = ?, avatar = ? WHERE id = ?', 
            [newName, newPhone, newPassword, newAvatar, req.user.id]);
        
        res.json({ message: 'Profil mis à jour avec succès' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

app.post('/api/user/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier téléchargé' });
    const avatarUrl = `/uploads/${req.file.filename}`;
});

app.post('/api/user/facebook', authenticateToken, async (req, res) => {
    const { accessToken, userId } = req.body;
    try {
        await dbRun('UPDATE users SET fb_access_token = ?, fb_user_id = ? WHERE id = ?', 
            [accessToken, userId, req.user.id]);
        res.json({ success: true, message: 'Compte Facebook connecté avec succès' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

app.post('/api/user/heartbeat', authenticateToken, async (req, res) => {
    try {
        await dbRun('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [req.user.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

// --- ADMIN ROUTES ---

app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        // Users are considered online if they've been seen in the last 5 minutes
        const users = await dbAll(`
            SELECT id, name, email, phone, role, avatar, created_at, last_seen,
            (strftime('%s', 'now') - strftime('%s', last_seen) < 300) as is_online
            FROM users
        `);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await dbRun('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'Utilisateur supprimé avec succès' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

app.put('/api/admin/users/:id/role', authenticateToken, isAdmin, async (req, res) => {
    try {
        await dbRun('UPDATE users SET role = ? WHERE id = ?', [req.body.role, req.params.id]);
        res.json({ message: 'Rôle mis à jour avec succès' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

app.get('/api/admin/transactions', authenticateToken, isAdmin, async (req, res) => {
    try {
        const transactions = await dbAll('SELECT * FROM transactions ORDER BY date DESC');
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

// --- PAYMENT ROUTES ---

app.post('/api/payments/init', authenticateToken, async (req, res) => {
    const { amount, provider, campaignData } = req.body;
    try {
        const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        
        await dbRun(`INSERT INTO payments (user_id, amount, status, transaction_id, provider, campaign_data) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, amount, 'pending', transactionId, provider, JSON.stringify(campaignData)]
        );

        res.json({ 
            transactionId, 
            status: 'pending',
            message: 'Transaction initialisée'
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur lors de l\'initialisation du paiement: ' + error.message });
    }
});

app.post('/api/payments/verify', authenticateToken, async (req, res) => {
    const { transaction_id } = req.body;
    try {
        const payment = await dbGet('SELECT * FROM payments WHERE transaction_id = ?', [transaction_id]);
        if (!payment) return res.status(404).json({ error: 'Transaction non trouvée' });

        if (payment.status !== 'completed') {
             // For simulation/dev, we auto-complete if requested or verified
             await dbRun('UPDATE payments SET status = ? WHERE id = ?', ['completed', payment.id]);
        }

        res.json({ 
            status: 'completed',
            campaignData: JSON.parse(payment.campaign_data || '{}')
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur lors de la vérification du paiement: ' + error.message });
    }
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: `Chemin ${req.path} non trouvé` });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Multer error: ${err.message}` });
    }
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// HTTPS Setup
const https = require('https');

let server;
try {
    const keyPath = path.join(__dirname, 'key.pem');
    const certPath = path.join(__dirname, 'cert.pem');
    
    console.log(`[Startup] Loading certificates from: ${keyPath}`);
    
    if (!fs.existsSync(keyPath)) throw new Error(`File not found: ${keyPath}`);
    if (!fs.existsSync(certPath)) throw new Error(`File not found: ${certPath}`);

    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const certificate = fs.readFileSync(certPath, 'utf8');
    const credentials = { key: privateKey, cert: certificate };
    
    server = https.createServer(credentials, app);
    
    server.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`✅ SECURE HTTPS Server running on https://localhost:${PORT}`);
        console.log(`=======================================================`);
    });
} catch (e) {
    console.error('❌ FATAL: Could not load SSL certificates. Falling back to HTTP.');
    console.error('Error details:', e.message);
    
    server = app.listen(PORT, () => {
        console.log(`⚠️  INSECURE HTTP Server running on http://localhost:${PORT}`);
        console.log(`   (Facebook Login will NOT work in this mode)`);
    });
}
