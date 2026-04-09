// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const config = require('./config');
const authMiddleware = require('./middleware/auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, '../frontend/uploads')));

// Session configuration
app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Database connection
const pool = new Pool(config.DB_CONFIG);

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../frontend/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    if (config.ALLOWED_FILE_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: config.MAX_FILE_SIZE },
    fileFilter: fileFilter
});

// Routes - Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../templates/index.html'));
});

app.get('/dashboard', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, '../templates/dashboard.html'));
});

// API Routes

// Register User
app.post('/api/register', upload.single('profile_pic'), async (req, res) => {
    try {
        const { full_name, email, password, phone, roll_number, department } = req.body;
        
        // Check if user exists
        const userExists = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR roll_number = $2',
            [email, roll_number]
        );
        
        if (userExists.rows.length > 0) {
            return res.json({ success: false, message: 'User already exists with this email or roll number!' });
        }
        
        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Profile picture
        let profilePic = 'default-avatar.png';
        if (req.file) {
            profilePic = req.file.filename;
        }
        
        // Insert user
        const result = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, phone, roll_number, department, profile_pic) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id`,
            [full_name, email, passwordHash, phone, roll_number, department, profilePic]
        );
        
        res.json({ success: true, message: 'Registration successful! Please login.' });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Registration failed: ' + error.message });
    }
});

// Login User
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Invalid email or password!' });
        }
        
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.json({ success: false, message: 'Invalid email or password!' });
        }
        
        // Set session
        req.session.userId = user.user_id;
        req.session.userName = user.full_name;
        req.session.userEmail = user.email;
        
        // Remove sensitive data
        delete user.password_hash;
        
        res.json({ success: true, message: 'Login successful!', user: user });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Login failed!' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out successfully!' });
});

// Get current user
app.get('/api/current-user', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT user_id, full_name, email, phone, roll_number, department, profile_pic, created_at FROM users WHERE user_id = $1',
            [req.session.userId]
        );
        
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.json({ success: false, message: 'User not found!' });
        }
    } catch (error) {
        res.json({ success: false, message: 'Error fetching user data!' });
    }
});

// Report Lost Item
app.post('/api/lost-item', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        const { item_name, category, description, location_lost, date_lost, contact_phone } = req.body;
        let imageUrl = null;
        
        if (req.file) {
            imageUrl = '/uploads/' + req.file.filename;
        }
        
        const result = await pool.query(
            `INSERT INTO lost_items (user_id, item_name, category, description, image_url, location_lost, date_lost, contact_phone) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING item_id`,
            [req.session.userId, item_name, category, description, imageUrl, location_lost, date_lost, contact_phone]
        );
        
        res.json({ success: true, message: 'Lost item reported successfully!' });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Failed to report lost item!' });
    }
});

// Report Found Item
app.post('/api/found-item', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        const { item_name, category, description, location_found, date_found, contact_phone } = req.body;
        let imageUrl = null;
        
        if (req.file) {
            imageUrl = '/uploads/' + req.file.filename;
        }
        
        const result = await pool.query(
            `INSERT INTO found_items (user_id, item_name, category, description, image_url, location_found, date_found, contact_phone) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING found_id`,
            [req.session.userId, item_name, category, description, imageUrl, location_found, date_found, contact_phone]
        );
        
        res.json({ success: true, message: 'Found item reported successfully!' });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Failed to report found item!' });
    }
});

// Get Lost Items
app.get('/api/lost-items', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT li.*, u.full_name, u.email, u.phone as user_phone, u.profile_pic 
             FROM lost_items li 
             JOIN users u ON li.user_id = u.user_id 
             WHERE li.status = 'lost'
             ORDER BY li.created_at DESC`
        );
        res.json({ success: true, items: result.rows });
    } catch (error) {
        res.json({ success: false, message: 'Error fetching lost items!' });
    }
});

// Get Found Items
app.get('/api/found-items', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT fi.*, u.full_name, u.email, u.phone as user_phone, u.profile_pic 
             FROM found_items fi 
             JOIN users u ON fi.user_id = u.user_id 
             WHERE fi.status = 'found'
             ORDER BY fi.created_at DESC`
        );
        res.json({ success: true, items: result.rows });
    } catch (error) {
        res.json({ success: false, message: 'Error fetching found items!' });
    }
});

// Get My Items (Lost & Found)
app.get('/api/my-items', authMiddleware, async (req, res) => {
    try {
        const lostItems = await pool.query(
            'SELECT * FROM lost_items WHERE user_id = $1 ORDER BY created_at DESC',
            [req.session.userId]
        );
        
        const foundItems = await pool.query(
            'SELECT * FROM found_items WHERE user_id = $1 ORDER BY created_at DESC',
            [req.session.userId]
        );
        
        res.json({ 
            success: true, 
            lostItems: lostItems.rows,
            foundItems: foundItems.rows
        });
    } catch (error) {
        res.json({ success: false, message: 'Error fetching your items!' });
    }
});

// Get Campus News
app.get('/api/campus-news', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM campus_news ORDER BY created_at DESC LIMIT 10'
        );
        res.json({ success: true, news: result.rows });
    } catch (error) {
        res.json({ success: false, message: 'Error fetching news!' });
    }
});

// Contact Form
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        
        await pool.query(
            `INSERT INTO contact_messages (name, email, subject, message) 
             VALUES ($1, $2, $3, $4)`,
            [name, email, subject, message]
        );
        
        res.json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
        res.json({ success: false, message: 'Failed to send message!' });
    }
});

// Delete Lost Item
app.delete('/api/lost-item/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM lost_items WHERE item_id = $1 AND user_id = $2',
            [req.params.id, req.session.userId]
        );
        res.json({ success: true, message: 'Item deleted successfully!' });
    } catch (error) {
        res.json({ success: false, message: 'Error deleting item!' });
    }
});

// Delete Found Item
app.delete('/api/found-item/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM found_items WHERE found_id = $1 AND user_id = $2',
            [req.params.id, req.session.userId]
        );
        res.json({ success: true, message: 'Item deleted successfully!' });
    } catch (error) {
        res.json({ success: false, message: 'Error deleting item!' });
    }
});

// Start server
app.listen(config.PORT, () => {
    console.log(`🚀 Server running on http://localhost:${config.PORT}`);
    console.log(`📱 Open http://localhost:${config.PORT} to view the application`);
});