import express from 'express';
import cors from 'cors';
import pool from './config.js';

const app = express();

// ✅ CORS FIX
app.use(cors({
    origin: "https://cep-eight-tau.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json());

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
