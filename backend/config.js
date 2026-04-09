// config.js
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    PORT: process.env.PORT || 5000,
    DB_CONFIG: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'lost_found_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'yourpassword',
    },
    SESSION_SECRET: process.env.SESSION_SECRET || 'your-super-secret-key-change-this',
    JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-key',
    UPLOAD_FOLDER: 'frontend/uploads',
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_FILE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
};