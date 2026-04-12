import express from 'express';
import pool from './config.js';

const app = express();
app.use(express.json());

// Test route
app.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.send("Database Connected ✅ " + result.rows[0].now);
    } catch (err) {
        console.error(err);
        res.send("Database Connection Failed ❌");
    }
});

app.listen(5000, () => {
    console.log('Server running on port 5000');
});