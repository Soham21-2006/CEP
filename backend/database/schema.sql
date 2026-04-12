-- Create Database
CREATE DATABASE lost_found_db;

-- Users Table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    roll_number VARCHAR(50) UNIQUE NOT NULL,
    department VARCHAR(100),
    profile_pic VARCHAR(255) DEFAULT 'default-avatar.png',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lost Items Table
CREATE TABLE lost_items (
    item_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    item_name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    description TEXT,
    image_url VARCHAR(255),
    location_lost VARCHAR(200),
    date_lost DATE,
    status VARCHAR(20) DEFAULT 'lost',
    contact_phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Found Items Table
CREATE TABLE found_items (
    found_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    item_name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    description TEXT,
    image_url VARCHAR(255),
    location_found VARCHAR(200),
    date_found DATE,
    status VARCHAR(20) DEFAULT 'found',
    contact_phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contact Messages
CREATE TABLE contact_messages (
    message_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    subject VARCHAR(200),
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campus News
CREATE TABLE campus_news (
    news_id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications
CREATE TABLE notifications (
    notif_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(200),
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Sample Data
INSERT INTO campus_news (title, content) VALUES 
('🎓 Annual Tech Fest 2024', 'Join us for the biggest tech event of the year on December 15-17! Register now at the student affairs office.'),
('📚 Exam Schedule Released', 'Final examination schedule has been published on the portal. Check your department notice board.'),
('🔍 Lost & Found Drive', 'Campus security conducting lost item drive this week. Claim your items at security office.'),
('💡 Innovation Challenge', 'Submit your innovative project ideas by December 20th. Win exciting prizes!');

INSERT INTO users (full_name, email, password_hash, phone, roll_number, department) VALUES 
('Admin User', 'admin@campus.edu', '$2b$10$YourHashHere', '1234567890', 'ADMIN001', 'Administration');