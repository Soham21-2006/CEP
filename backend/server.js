import express from 'express';
import cors from 'cors';
import pool from './config.js';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();

// ✅ CORS FIX
app.use(cors({
    origin: "https://cep-eight-tau.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true on Render with HTTPS
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}));

app.use(express.json());

// ============== ADD FILE UPLOAD CONFIGURATION ==============
// Create uploads directory if not exists
const uploadDir = path.join(__dirname, '../frontend/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        cb(null, allowedTypes.includes(file.mimetype));
    }
});

// ============== REPLACE YOUR EXISTING /api/current-user ROUTE ==============
// Replace your current /api/current-user with this:
app.get('/api/current-user', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const result = await pool.query(
            `SELECT id, full_name, email, phone, roll_number, department, profile_pic, 
                    reputation_points, items_found, items_returned, created_at 
             FROM users WHERE id = $1`,
            [req.session.userId]
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

// ============== ADD UPDATE PROFILE ROUTE ==============
app.post('/api/update-profile', upload.single('profile_pic'), async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const { full_name, phone, department } = req.body;
        let profile_pic = req.body.existing_pic;
        
        if (req.file) {
            profile_pic = req.file.filename;
        }
        
        await pool.query(
            `UPDATE users SET full_name = $1, phone = $2, department = $3, profile_pic = $4 
             WHERE id = $5`,
            [full_name, phone, department, profile_pic, req.session.userId]
        );
        
        res.json({ success: true, message: 'Profile updated successfully!' });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD REPORT LOST ITEM ROUTE ==============
app.post('/api/lost-item', upload.single('image'), async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const { item_name, category, description, location_lost, date_lost, time_lost, contact_phone, latitude, longitude } = req.body;
        let image_url = req.file ? '/uploads/' + req.file.filename : null;
        
        const result = await pool.query(
            `INSERT INTO lost_items (user_id, item_name, category, description, image_url, location_lost, 
             latitude, longitude, date_lost, time_lost, contact_phone) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING item_id`,
            [req.session.userId, item_name, category, description, image_url, location_lost, 
             latitude, longitude, date_lost, time_lost, contact_phone]
        );
        
        res.json({ success: true, message: 'Lost item reported!', item_id: result.rows[0].item_id });
    } catch (error) {
        console.error('Error reporting lost item:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD REPORT FOUND ITEM ROUTE ==============
app.post('/api/found-item', upload.single('image'), async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const { item_name, category, description, location_found, date_found, time_found, contact_phone, latitude, longitude } = req.body;
        let image_url = req.file ? '/uploads/' + req.file.filename : null;
        
        const result = await pool.query(
            `INSERT INTO found_items (user_id, item_name, category, description, image_url, location_found, 
             latitude, longitude, date_found, time_found, contact_phone) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING found_id`,
            [req.session.userId, item_name, category, description, image_url, location_found, 
             latitude, longitude, date_found, time_found, contact_phone]
        );
        
        // Update user's found count and reputation
        await pool.query(
            `UPDATE users SET items_found = items_found + 1, reputation_points = reputation_points + 10 
             WHERE id = $1`,
            [req.session.userId]
        );
        
        res.json({ success: true, message: 'Found item reported!', found_id: result.rows[0].found_id });
    } catch (error) {
        console.error('Error reporting found item:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD GET MY ITEMS ROUTE ==============
app.get('/api/my-items', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const lostItems = await pool.query(
            `SELECT * FROM lost_items WHERE user_id = $1 ORDER BY created_at DESC`,
            [req.session.userId]
        );
        
        const foundItems = await pool.query(
            `SELECT * FROM found_items WHERE user_id = $1 ORDER BY created_at DESC`,
            [req.session.userId]
        );
        
        res.json({ 
            success: true, 
            lostItems: lostItems.rows, 
            foundItems: foundItems.rows 
        });
    } catch (error) {
        console.error('Error fetching my items:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD GET ALL LOST ITEMS ROUTE ==============
app.get('/api/lost-items', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = `
            SELECT li.*, u.full_name, u.email, u.phone as user_phone, u.profile_pic 
            FROM lost_items li 
            JOIN users u ON li.user_id = u.id 
            WHERE li.status = 'lost'
        `;
        let params = [];
        let paramIndex = 1;
        
        if (category && category !== 'all') {
            query += ` AND li.category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }
        
        if (search) {
            query += ` AND (li.item_name ILIKE $${paramIndex} OR li.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
        }
        
        query += ` ORDER BY li.created_at DESC`;
        
        const result = await pool.query(query, params);
        res.json({ success: true, items: result.rows });
    } catch (error) {
        console.error('Error fetching lost items:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD GET ALL FOUND ITEMS ROUTE ==============
app.get('/api/found-items', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = `
            SELECT fi.*, u.full_name, u.email, u.phone as user_phone, u.profile_pic 
            FROM found_items fi 
            JOIN users u ON fi.user_id = u.id 
            WHERE fi.status = 'found'
        `;
        let params = [];
        let paramIndex = 1;
        
        if (category && category !== 'all') {
            query += ` AND fi.category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }
        
        if (search) {
            query += ` AND (fi.item_name ILIKE $${paramIndex} OR fi.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
        }
        
        query += ` ORDER BY fi.created_at DESC`;
        
        const result = await pool.query(query, params);
        res.json({ success: true, items: result.rows });
    } catch (error) {
        console.error('Error fetching found items:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD DELETE ITEM ROUTE ==============
app.delete('/api/item/:type/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const { type, id } = req.params;
        const table = type === 'lost' ? 'lost_items' : 'found_items';
        const idField = type === 'lost' ? 'item_id' : 'found_id';
        
        const result = await pool.query(
            `DELETE FROM ${table} WHERE ${idField} = $1 AND user_id = $2`,
            [id, req.session.userId]
        );
        
        res.json({ success: true, message: 'Item deleted successfully!' });
    } catch (error) {
        console.error('Error deleting item:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD GET MESSAGES ROUTE ==============
app.get('/api/messages/:userId', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const result = await pool.query(
            `SELECT m.*, u1.full_name as sender_name, u2.full_name as receiver_name 
             FROM messages m
             JOIN users u1 ON m.sender_id = u1.id
             JOIN users u2 ON m.receiver_id = u2.id
             WHERE (m.sender_id = $1 AND m.receiver_id = $2) 
                OR (m.sender_id = $2 AND m.receiver_id = $1)
             ORDER BY m.created_at ASC`,
            [req.session.userId, req.params.userId]
        );
        
        res.json({ success: true, messages: result.rows });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD SEND MESSAGE ROUTE ==============
app.post('/api/send-message', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const { receiver_id, message } = req.body;
        
        await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, message) VALUES ($1, $2, $3)`,
            [req.session.userId, receiver_id, message]
        );
        
        // Create notification for receiver
        await pool.query(
            `INSERT INTO notifications (user_id, title, message, type) 
             VALUES ($1, $2, $3, $4)`,
            [receiver_id, 'New Message', 'You have a new message', 'message']
        );
        
        res.json({ success: true, message: 'Message sent!' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD GET NOTIFICATIONS ROUTE ==============
app.get('/api/notifications', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const result = await pool.query(
            `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
            [req.session.userId]
        );
        
        // Mark unread as read
        await pool.query(
            `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
            [req.session.userId]
        );
        
        res.json({ success: true, notifications: result.rows });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD GET LEADERBOARD ROUTE ==============
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, profile_pic, reputation_points, items_found, items_returned 
             FROM users 
             WHERE reputation_points > 0 
             ORDER BY reputation_points DESC 
             LIMIT 50`
        );
        
        res.json({ success: true, leaderboard: result.rows });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD GET ANNOUNCEMENTS ROUTE ==============
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

// ============== ADD SUBMIT CLAIM ROUTE ==============
app.post('/api/submit-claim', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const { lost_item_id, found_item_id, message } = req.body;
        
        let owner_id;
        if (lost_item_id) {
            const item = await pool.query('SELECT user_id FROM lost_items WHERE item_id = $1', [lost_item_id]);
            owner_id = item.rows[0].user_id;
        } else {
            const item = await pool.query('SELECT user_id FROM found_items WHERE found_id = $1', [found_item_id]);
            owner_id = item.rows[0].user_id;
        }
        
        await pool.query(
            `INSERT INTO claims (lost_item_id, found_item_id, claimant_id, owner_id, message) 
             VALUES ($1, $2, $3, $4, $5)`,
            [lost_item_id || null, found_item_id || null, req.session.userId, owner_id, message]
        );
        
        // Get claimant name for notification
        const claimant = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.session.userId]);
        
        await pool.query(
            `INSERT INTO notifications (user_id, title, message, type) 
             VALUES ($1, $2, $3, $4)`,
            [owner_id, 'New Claim', `${claimant.rows[0].full_name} has claimed an item you reported.`, 'claim']
        );
        
        res.json({ success: true, message: 'Claim submitted!' });
    } catch (error) {
        console.error('Error submitting claim:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD MATCHING ALGORITHM ROUTE ==============
app.get('/api/matches', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    
    try {
        const lostItems = await pool.query(
            `SELECT * FROM lost_items WHERE status = 'lost'`
        );
        
        const foundItems = await pool.query(
            `SELECT * FROM found_items WHERE status = 'found'`
        );
        
        const matches = [];
        
        for (const lost of lostItems.rows) {
            for (const found of foundItems.rows) {
                let matchScore = 0;
                
                // Title similarity
                if (lost.item_name.toLowerCase().includes(found.item_name.toLowerCase()) ||
                    found.item_name.toLowerCase().includes(lost.item_name.toLowerCase())) {
                    matchScore += 40;
                }
                
                // Category match
                if (lost.category === found.category) matchScore += 30;
                
                // Location proximity
                if (lost.location_lost === found.location_found) matchScore += 20;
                
                // Description keyword matching
                const lostKeywords = lost.description.toLowerCase().split(' ');
                const foundKeywords = found.description.toLowerCase().split(' ');
                const commonKeywords = lostKeywords.filter(k => foundKeywords.includes(k));
                matchScore += Math.min(commonKeywords.length * 5, 20);
                
                if (matchScore >= 50) {
                    matches.push({
                        lost_item: lost,
                        found_item: found,
                        score: matchScore,
                        match_percentage: Math.min(matchScore, 100)
                    });
                }
            }
        }
        
        // Sort by score and filter for current user
        matches.sort((a, b) => b.score - a.score);
        const userMatches = matches.filter(m => 
            m.lost_item.user_id === req.session.userId || 
            m.found_item.user_id === req.session.userId
        );
        
        res.json({ success: true, matches: userMatches });
    } catch (error) {
        console.error('Error finding matches:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== ADD SERVE UPLOADS STATIC FOLDER ==============
app.use('/uploads', express.static(path.join(__dirname, '../frontend/uploads')));

// ✅ ROOT ROUTE
app.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ success: true, time: result.rows[0].now });
    } catch (err) {
        res.status(500).json({ success: false, message: "DB Error" });
    }
});

// ✅ REGISTER
app.post('/api/register', async (req, res) => {
    try {
        const { full_name, email, password, phone, roll_number, department } = req.body;

        await pool.query(
            `INSERT INTO users (full_name, email, password_hash, phone, roll_number, department)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [full_name, email, password, phone, roll_number, department]
        );

        res.json({
            success: true,
            message: "User Registered Successfully"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Registration Failed"
        });
    }
});

// ✅ LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 AND password_hash = $2',
            [email, password]
        );

        if (result.rows.length > 0) {
            res.json({
                success: true,
                message: "Login Successful"
            });
        } else {
            res.status(401).json({
                success: false,
                message: "Invalid Credentials"
            });
        }

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Login Failed"
        });
    }
});

// ✅ STATS
app.get('/api/stats', async (req, res) => {
    try {
        const users = await pool.query('SELECT COUNT(*) FROM users');

        res.json({
            success: true,
            lostCount: users.rows[0].count,
            foundCount: 0,
            recoveredCount: 0
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Error fetching stats"
        });
    }
});

// ✅ PORT (Render compatible)
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
