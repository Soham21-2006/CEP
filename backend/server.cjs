const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Database connection
const pool = require('./config.js');

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ Database connected successfully');
        release();
    }
});

// Helper function to ensure integer conversion
const toInt = (value) => {
    const num = parseInt(value);
    return isNaN(num) ? null : num;
};

// CORS configuration
app.use(cors({
    origin: "https://cep-eight-tau.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

app.use(express.json());

// ============== SERVE STATIC FILES ==============
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, '../frontend/uploads')));

// ============== HTML ROUTES ==============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    if (req.session.isAdmin === true) {
        return res.sendFile(path.join(__dirname, '../frontend/admin.html'));
    } else {
        return res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
    }
});

app.get('/admin', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// File upload configuration
const uploadDir = path.join(__dirname, '../frontend/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        cb(null, allowedTypes.includes(file.mimetype));
    }
});

// ============== AUTHENTICATION ROUTES ==============

// REGISTER
app.post('/api/register', upload.single('profile_pic'), async (req, res) => {
    try {
        const { full_name, email, password, phone, roll_number, department, campus_code } = req.body;
        
        console.log('Registration attempt for:', email, 'Campus code:', campus_code);
        
        const campusCheck = await pool.query(
            'SELECT campus_id, campus_name FROM campuses WHERE campus_code = $1 AND is_active = true',
            [campus_code]
        );
        
        if (campusCheck.rows.length === 0) {
            return res.json({ success: false, message: 'Invalid campus code! Please enter a valid code.' });
        }
        
        const campus_id = campusCheck.rows[0].campus_id;
        const campus_name = campusCheck.rows[0].campus_name;
        
        const existing = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR roll_number = $2',
            [email, roll_number]
        );
        
        if (existing.rows.length > 0) {
            return res.json({ success: false, message: 'User already exists!' });
        }
        
        const passwordHash = await bcrypt.hash(password, 10);
        let profile_pic = 'default-avatar.png';
        
        if (req.file) {
            profile_pic = req.file.filename;
        }
        
        await pool.query(
            `INSERT INTO users (full_name, email, password_hash, phone, roll_number, department, 
             profile_pic, college_name, campus_id, campus_code, is_verified, reputation_points, items_found, items_returned) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [full_name, email, passwordHash, phone, roll_number, department, profile_pic, 
             campus_name, campus_id, campus_code, true, 0, 0, 0]
        );
        
        console.log('User registered successfully with campus:', campus_name);
        
        res.json({ success: true, message: 'Registration successful! You can now login.' });
    } catch (error) {
        console.error('Registration error:', error);
        res.json({ success: false, message: error.message });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.json({ success: false, message: 'Email and password are required!' });
        }
        
        console.log('Login attempt for:', email);
        
        const result = await pool.query(
            `SELECT id, full_name, email, password_hash, phone, roll_number, 
                    department, profile_pic, is_admin, is_verified, reputation_points
             FROM users 
             WHERE email = $1`,
            [email.toLowerCase().trim()]
        );
        
        if (result.rows.length === 0) {
            console.log('User not found:', email);
            return res.json({ success: false, message: 'Invalid email or password!' });
        }
        
        const user = result.rows[0];
        console.log('User found:', user.email, 'is_admin value:', user.is_admin);
        
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            console.log('Invalid password for:', email);
            return res.json({ success: false, message: 'Invalid email or password!' });
        }
        
        req.session.userId = parseInt(user.id, 10);
        req.session.userName = user.full_name;
        req.session.userEmail = user.email;
        req.session.isAdmin = user.is_admin === true || user.is_admin === 't' || user.is_admin === 1;
        
        console.log('Session isAdmin set to:', req.session.isAdmin);
        
        await pool.query('UPDATE users SET last_active = NOW() WHERE id = $1', [parseInt(user.id, 10)]);
        
        delete user.password_hash;
        
        console.log('Login successful for:', email);
        
        res.json({ success: true, message: 'Login successful!', user: user });
    } catch (error) {
        console.error('Login error details:', error);
        res.json({ success: false, message: 'Login failed. Please try again.' });
    }
});

// LOGOUT
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out successfully!' });
});

// ============== USER PROFILE ROUTES ==============

// GET current user
app.get('/api/current-user', async (req, res) => {
    const { user_id } = req.query;
    
    if (user_id) {
        try {
            const result = await pool.query(
                `SELECT id, full_name, email, phone, roll_number, department, profile_pic, 
                        reputation_points, items_found, items_returned, created_at, is_admin
                 FROM users WHERE id = $1`,
                [parseInt(user_id)]
            );
            if (result.rows.length > 0) {
                return res.json({ success: true, user: result.rows[0] });
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    }
    
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const userId = parseInt(req.session.userId, 10);
        const result = await pool.query(
            `SELECT id, full_name, email, phone, roll_number, department, profile_pic, 
                    reputation_points, items_found, items_returned, created_at, is_admin
             FROM users WHERE id = $1`,
            [userId]
        );
        
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        res.json({ success: false, message: error.message });
    }
});

// UPDATE PROFILE
app.post('/api/update-profile', upload.single('profile_pic'), async (req, res) => {
    const { full_name, phone, department, user_id } = req.body;
    let userId = user_id ? parseInt(user_id) : (req.session.userId ? parseInt(req.session.userId) : null);
    
    if (!userId) {
        return res.json({ success: false, message: 'User ID required!' });
    }
    
    try {
        let profile_pic = req.body.existing_pic;
        if (req.file) {
            profile_pic = req.file.filename;
        }
        
        await pool.query(
            `UPDATE users SET full_name = $1, phone = $2, department = $3, profile_pic = $4 
             WHERE id = $5`,
            [full_name, phone, department, profile_pic, userId]
        );
        
        res.json({ success: true, message: 'Profile updated successfully!' });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ITEM ROUTES ==============

// REPORT LOST ITEM
app.post('/api/lost-item', upload.single('image'), async (req, res) => {
    try {
        const { item_name, category, description, location_lost, date_lost, time_lost, contact_phone, latitude, longitude, user_id } = req.body;
        
        let userId = user_id ? parseInt(user_id) : (req.session.userId ? parseInt(req.session.userId) : null);
        
        if (!userId) {
            return res.json({ success: false, message: 'User ID required!' });
        }
        
        let image_url = req.file ? '/uploads/' + req.file.filename : null;
        
        const result = await pool.query(
            `INSERT INTO lost_items (user_id, item_name, category, description, image_url, location_lost, 
             latitude, longitude, date_lost, time_lost, contact_phone) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING item_id`,
            [userId, item_name, category, description, image_url, location_lost, 
             latitude, longitude, date_lost, time_lost, contact_phone]
        );
        
        // Get user's campus for notifications
        const userCampus = await pool.query(
            'SELECT campus_id, full_name FROM users WHERE id = $1',
            [userId]
        );
        const campusId = userCampus.rows[0]?.campus_id;
        const userName = userCampus.rows[0]?.full_name;
        
        if (campusId) {
            const sameCampusUsers = await pool.query(
                'SELECT id FROM users WHERE campus_id = $1 AND id != $2',
                [campusId, userId]
            );
            
            for (const user of sameCampusUsers.rows) {
                await pool.query(
                    `INSERT INTO notifications (user_id, title, message, type, is_read) 
                     VALUES ($1, $2, $3, $4, false)`,
                    [user.id, 'New Lost Item', `${userName} reported a lost item: ${item_name} at ${location_lost}`, 'lost']
                );
            }
            console.log(`Created ${sameCampusUsers.rows.length} notifications for lost item`);
        }
        
        res.json({ success: true, message: 'Lost item reported!', item_id: result.rows[0].item_id });
    } catch (error) {
        console.error('Error reporting lost item:', error);
        res.json({ success: false, message: error.message });
    }
});

// REPORT FOUND ITEM
app.post('/api/found-item', upload.single('image'), async (req, res) => {
    try {
        const { item_name, category, description, location_found, date_found, time_found, contact_phone, latitude, longitude, user_id } = req.body;
        
        let userId = user_id ? parseInt(user_id) : (req.session.userId ? parseInt(req.session.userId) : null);
        
        if (!userId) {
            return res.json({ success: false, message: 'User ID required!' });
        }
        
        let image_url = req.file ? '/uploads/' + req.file.filename : null;
        
        const result = await pool.query(
            `INSERT INTO found_items (user_id, item_name, category, description, image_url, location_found, 
             latitude, longitude, date_found, time_found, contact_phone) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING found_id`,
            [userId, item_name, category, description, image_url, location_found, 
             latitude, longitude, date_found, time_found, contact_phone]
        );
        
        await pool.query(
            `UPDATE users SET items_found = items_found + 1, reputation_points = reputation_points + 10 
             WHERE id = $1`,
            [userId]
        );
        
        // Get user's campus for notifications
        const userCampus = await pool.query(
            'SELECT campus_id, full_name FROM users WHERE id = $1',
            [userId]
        );
        const campusId = userCampus.rows[0]?.campus_id;
        const userName = userCampus.rows[0]?.full_name;
        
        if (campusId) {
            const sameCampusUsers = await pool.query(
                'SELECT id FROM users WHERE campus_id = $1 AND id != $2',
                [campusId, userId]
            );
            
            for (const user of sameCampusUsers.rows) {
                await pool.query(
                    `INSERT INTO notifications (user_id, title, message, type, is_read) 
                     VALUES ($1, $2, $3, $4, false)`,
                    [user.id, 'New Found Item', `${userName} found an item: ${item_name} at ${location_found}`, 'found']
                );
            }
            console.log(`Created ${sameCampusUsers.rows.length} notifications for found item`);
        }
        
        res.json({ success: true, message: 'Found item reported!', found_id: result.rows[0].found_id });
    } catch (error) {
        console.error('Error reporting found item:', error);
        res.json({ success: false, message: error.message });
    }
});

// GET MY ITEMS
app.get('/api/my-items', async (req, res) => {
    const { user_id } = req.query;
    let userId = user_id ? parseInt(user_id) : (req.session.userId ? parseInt(req.session.userId) : null);
    
    if (!userId) {
        return res.json({ success: false, message: 'User ID required' });
    }
    
    try {
        const lostItems = await pool.query(
            `SELECT * FROM lost_items WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );
        
        const foundItems = await pool.query(
            `SELECT * FROM found_items WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );
        
        res.json({ success: true, lostItems: lostItems.rows, foundItems: foundItems.rows });
    } catch (error) {
        console.error('Error fetching my items:', error);
        res.json({ success: false, message: error.message });
    }
});

// GET ALL LOST ITEMS (for public view)
app.get('/api/lost-items', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT li.*, u.full_name, u.email, u.phone as user_phone, u.profile_pic 
             FROM lost_items li 
             JOIN users u ON li.user_id = u.id 
             WHERE li.status = 'lost'
             ORDER BY li.created_at DESC`
        );
        res.json({ success: true, items: result.rows });
    } catch (error) {
        console.error('Error fetching lost items:', error);
        res.json({ success: false, message: error.message });
    }
});

// GET ALL FOUND ITEMS (for public view)
app.get('/api/found-items', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT fi.*, u.full_name, u.email, u.phone as user_phone, u.profile_pic 
             FROM found_items fi 
             JOIN users u ON fi.user_id = u.id 
             WHERE fi.status = 'found'
             ORDER BY fi.created_at DESC`
        );
        res.json({ success: true, items: result.rows });
    } catch (error) {
        console.error('Error fetching found items:', error);
        res.json({ success: false, message: error.message });
    }
});

// DELETE ITEM
app.delete('/api/item/:type/:id', async (req, res) => {
    const { user_id } = req.query;
    const { type, id } = req.params;
    let userId = user_id ? parseInt(user_id) : (req.session.userId ? parseInt(req.session.userId) : null);
    
    if (!userId) {
        return res.json({ success: false, message: 'User ID required!' });
    }
    
    try {
        const table = type === 'lost' ? 'lost_items' : 'found_items';
        const idField = type === 'lost' ? 'item_id' : 'found_id';
        
        await pool.query(
            `DELETE FROM ${table} WHERE ${idField} = $1 AND user_id = $2`,
            [id, userId]
        );
        
        res.json({ success: true, message: 'Item deleted successfully!' });
    } catch (error) {
        console.error('Error deleting item:', error);
        res.json({ success: false, message: error.message });
    }
});

// SUBMIT CLAIM
app.post('/api/submit-claim', async (req, res) => {
    const { claimant_id, lost_item_id, found_item_id, message } = req.body;
    let claimantId = claimant_id ? parseInt(claimant_id) : (req.session.userId ? parseInt(req.session.userId) : null);
    
    if (!claimantId) {
        return res.json({ success: false, message: 'Claimant ID required!' });
    }
    
    try {
        let owner_id;
        let itemName = '';
        
        if (lost_item_id) {
            const item = await pool.query('SELECT user_id, item_name FROM lost_items WHERE item_id = $1', [lost_item_id]);
            if (item.rows.length === 0) {
                return res.json({ success: false, message: 'Lost item not found!' });
            }
            owner_id = item.rows[0].user_id;
            itemName = item.rows[0].item_name;
        } else if (found_item_id) {
            const item = await pool.query('SELECT user_id, item_name FROM found_items WHERE found_id = $1', [found_item_id]);
            if (item.rows.length === 0) {
                return res.json({ success: false, message: 'Found item not found!' });
            }
            owner_id = item.rows[0].user_id;
            itemName = item.rows[0].item_name;
        } else {
            return res.json({ success: false, message: 'Either lost_item_id or found_item_id is required!' });
        }
        
        // Check if claim already exists
        const existingClaim = await pool.query(
            `SELECT * FROM claims WHERE (lost_item_id = $1 OR found_item_id = $2) AND claimant_id = $3 AND status = 'pending'`,
            [lost_item_id || null, found_item_id || null, claimantId]
        );
        
        if (existingClaim.rows.length > 0) {
            return res.json({ success: false, message: 'You already have a pending claim for this item!' });
        }
        
        // Insert the claim
        await pool.query(
            `INSERT INTO claims (lost_item_id, found_item_id, claimant_id, owner_id, message, status) 
             VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [lost_item_id || null, found_item_id || null, claimantId, owner_id, message || '']
        );
        
        // Get claimant name for notification
        const claimant = await pool.query('SELECT full_name FROM users WHERE id = $1', [claimantId]);
        const claimantName = claimant.rows[0]?.full_name || 'Someone';
        
        // Create notification for owner
        await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, is_read) 
             VALUES ($1, $2, $3, $4, false)`,
            [owner_id, 'New Claim Request', `${claimantName} wants to claim "${itemName}". Please review.`, 'claim']
        );
        
        res.json({ success: true, message: 'Claim submitted successfully! The owner will be notified.' });
    } catch (error) {
        console.error('Error submitting claim:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== NOTIFICATION ROUTES ==============

// GET NOTIFICATIONS
app.get('/api/notifications', async (req, res) => {
    const { user_id } = req.query;
    let userId = user_id ? parseInt(user_id) : (req.session.userId ? parseInt(req.session.userId) : null);
    
    if (!userId) {
        return res.json({ success: false, message: 'User ID required!' });
    }
    
    try {
        const result = await pool.query(
            `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
            [userId]
        );
        
        await pool.query(
            `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
            [userId]
        );
        
        res.json({ success: true, notifications: result.rows });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.json({ success: false, message: error.message });
    }
});

// MARK NOTIFICATIONS AS READ
app.post('/api/notifications/mark-read', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) {
        return res.json({ success: false, message: 'User ID required!' });
    }
    
    try {
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
            [parseInt(user_id)]
        );
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ============== STATS ROUTES ==============

// GET STATS
app.get('/api/stats', async (req, res) => {
    try {
        const lost = await pool.query('SELECT COUNT(*) FROM lost_items');
        const found = await pool.query('SELECT COUNT(*) FROM found_items');

        res.json({
            success: true,
            lostCount: lost.rows[0].count,
            foundCount: found.rows[0].count,
            recoveredCount: 0
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({
            success: false,
            message: "Error fetching stats"
        });
    }
});

// ============== ADMIN ROUTES ==============

// ADMIN: CREATE CAMPUS
app.post('/api/admin/create-campus', async (req, res) => {
    try {
        const { campus_name, campus_code, location, user_id } = req.body;
        
        if (!user_id) {
            return res.json({ success: false, message: 'User ID required!' });
        }
        
        const userId = parseInt(user_id, 10);
        
        const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
        
        if (!adminCheck.rows[0]?.is_admin) {
            return res.json({ success: false, message: 'Admin access required!' });
        }
        
        if (!campus_name || !campus_code) {
            return res.json({ success: false, message: 'Campus name and code are required!' });
        }
        
        const existing = await pool.query('SELECT * FROM campuses WHERE campus_code = $1', [campus_code]);
        
        if (existing.rows.length > 0) {
            return res.json({ success: false, message: 'Campus code already exists!' });
        }
        
        await pool.query(
            `INSERT INTO campuses (campus_name, campus_code, location, is_active, created_by) 
             VALUES ($1, $2, $3, true, $4)`,
            [campus_name, campus_code, location, userId]
        );
        
        res.json({ success: true, message: `Campus "${campus_name}" created with code: ${campus_code}` });
    } catch (error) {
        console.error('Error creating campus:', error);
        res.json({ success: false, message: error.message });
    }
});

// ADMIN: GET ALL CAMPUSES
app.get('/api/admin/campuses', async (req, res) => {
    try {
        const { user_id } = req.query;
        
        if (!user_id) {
            return res.json({ success: false, message: 'User ID required!' });
        }
        
        const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [parseInt(user_id)]);
        
        if (!adminCheck.rows[0]?.is_admin) {
            return res.json({ success: false, message: 'Admin access required!' });
        }
        
        const result = await pool.query(
            `SELECT c.*, u.full_name as created_by_name 
             FROM campuses c
             LEFT JOIN users u ON c.created_by = u.id
             ORDER BY c.created_at DESC`
        );
        
        res.json({ success: true, campuses: result.rows });
    } catch (error) {
        console.error('Error fetching campuses:', error);
        res.json({ success: false, message: error.message });
    }
});

// ADMIN: GET ALL USERS
app.get('/api/admin/users', async (req, res) => {
    try {
        const { user_id } = req.query;
        
        if (!user_id) {
            return res.json({ success: false, message: 'User ID required!' });
        }
        
        const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [parseInt(user_id)]);
        
        if (!adminCheck.rows[0]?.is_admin) {
            return res.json({ success: false, message: 'Admin access required!' });
        }
        
        const result = await pool.query(
            'SELECT id, full_name, email, phone, roll_number, department, college_name, reputation_points, is_verified, created_at FROM users ORDER BY created_at DESC'
        );
        res.json({ success: true, users: result.rows });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.json({ success: false, message: error.message });
    }
});

// ADMIN: DELETE CAMPUS
app.delete('/api/admin/delete-campus/:campusId', async (req, res) => {
    try {
        const { user_id } = req.body;
        
        if (!user_id) {
            return res.json({ success: false, message: 'User ID required!' });
        }
        
        const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [parseInt(user_id)]);
        
        if (!adminCheck.rows[0]?.is_admin) {
            return res.json({ success: false, message: 'Admin access required!' });
        }
        
        await pool.query('DELETE FROM campuses WHERE campus_id = $1', [req.params.campusId]);
        res.json({ success: true, message: 'Campus deleted successfully!' });
    } catch (error) {
        console.error('Error deleting campus:', error);
        res.json({ success: false, message: error.message });
    }
});

// ADMIN: CREATE ANNOUNCEMENT
app.post('/api/admin/create-announcement', async (req, res) => {
    try {
        const { title, content, user_id } = req.body;
        
        if (!user_id) {
            return res.json({ success: false, message: 'User ID required!' });
        }
        
        const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [parseInt(user_id)]);
        
        if (!adminCheck.rows[0]?.is_admin) {
            return res.json({ success: false, message: 'Admin access required!' });
        }
        
        await pool.query(
            'INSERT INTO announcements (title, content, created_by, is_active) VALUES ($1, $2, $3, true)',
            [title, content, parseInt(user_id)]
        );
        res.json({ success: true, message: 'Announcement created!' });
    } catch (error) {
        console.error('Error creating announcement:', error);
        res.json({ success: false, message: error.message });
    }
});

// VERIFY CAMPUS CODE
app.post('/api/verify-campus-code', async (req, res) => {
    try {
        const { campus_code } = req.body;
        
        const result = await pool.query(
            'SELECT campus_id, campus_name FROM campuses WHERE campus_code = $1 AND is_active = true',
            [campus_code]
        );
        
        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Invalid campus code!' });
        }
        
        res.json({ success: true, campus_id: result.rows[0].campus_id, campus_name: result.rows[0].campus_name });
    } catch (error) {
        console.error('Error verifying campus code:', error);
        res.json({ success: false, message: error.message });
    }
});

// CHECK IF USER IS ADMIN
app.get('/api/user/is-admin', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in', isAdmin: false });
    }
    
    try {
        const userId = parseInt(req.session.userId, 10);
        const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
        
        const isAdmin = result.rows[0]?.is_admin === true;
        console.log('Admin check for user:', userId, 'isAdmin:', isAdmin);
        
        res.json({ success: true, isAdmin: isAdmin });
    } catch (error) {
        console.error('Error checking admin:', error);
        res.json({ success: false, message: error.message, isAdmin: false });
    }
});

// ============== LEADERBOARD ==============
app.get('/api/leaderboard', async (req, res) => {
    const { user_id } = req.query;
    let userId = user_id ? parseInt(user_id) : (req.session.userId ? parseInt(req.session.userId) : null);
    
    if (!userId) {
        return res.json({ success: false, message: 'User ID required!' });
    }
    
    try {
        const userResult = await pool.query('SELECT campus_id FROM users WHERE id = $1', [userId]);
        const campusId = userResult.rows[0]?.campus_id;
        
        const result = await pool.query(
            `SELECT id, full_name, profile_pic, reputation_points, items_found, items_returned 
             FROM users 
             WHERE reputation_points > 0 AND campus_id::text = $1::text
             ORDER BY reputation_points DESC 
             LIMIT 50`,
            [campusId]
        );
        
        res.json({ success: true, leaderboard: result.rows });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ANNOUNCEMENTS ==============
app.get('/api/announcements', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM announcements 
             WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) 
             ORDER BY created_at DESC`
        );
        
        res.json({ success: true, announcements: result.rows });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== START SERVER ==============
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Open http://localhost:${PORT}`);
});
