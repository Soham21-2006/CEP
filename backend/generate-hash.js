const bcrypt = require('bcrypt');

async function generateHash() {
    const password = 'admin123'; // Change this to your desired admin password
    const hash = await bcrypt.hash(password, 10);
    console.log('Password:', password);
    console.log('Hash:', hash);
    console.log('\nUse this SQL:');
    console.log(`INSERT INTO users (full_name, email, password_hash, phone, roll_number, department, is_admin, is_verified)
VALUES ('Admin User', 'admin@campus.com', '${hash}', '0000000000', 'ADMIN001', 'Administration', true, true);`);
}

generateHash();