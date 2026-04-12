import cors from 'cors';
import express from 'express';
import pool from './config.js';

const app = express();
app.use(express.json());

app.use(cors({
    origin: "https://cep-eight-tau.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.options('*', cors());

// ✅ ROOT ROUTE (check server + DB)
app.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.send("Database Connected ✅ " + result.rows[0].now);
    } catch (err) {
        console.error(err);
        res.send("Database Connection Failed ❌");
    }
});

// ✅ REGISTER API
app.post('/api/register', async (req, res) => {
    try {
        const { full_name, email, password, phone, roll_number, department } = req.body;

        await pool.query(
            `INSERT INTO users (full_name, email, password_hash, phone, roll_number, department)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [full_name, email, password, phone, roll_number, department]
        );

        res.json({ message: "User Registered Successfully ✅" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Registration Failed ❌" });
    }
});

// ✅ LOGIN API (basic)
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 AND password_hash = $2',
            [email, password]
        );

        if (result.rows.length > 0) {
            res.json({ message: "Login Successful ✅" });
        } else {
            res.status(401).json({ message: "Invalid Credentials ❌" });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Login Failed ❌" });
    }
});

// ✅ STATS API
app.get('/api/stats', async (req, res) => {
    try {
        const users = await pool.query('SELECT COUNT(*) FROM users');

        res.json({
            users: users.rows[0].count,
            items: 0,
            recovered: 0
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching stats ❌" });
    }
});

// ✅ PORT FIX (IMPORTANT FOR RENDER)
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
