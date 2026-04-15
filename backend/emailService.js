require("dotenv").config();
const { Pool } = require("pg");
const sendEmail = require("./email"); // 👈 using your existing file

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let lastCheck = new Date();

async function checkNewItems() {
  try {
    // LOST ITEMS
    const lostItems = await pool.query(`
      SELECT li.*, u.campus_code, u.full_name, u.phone
      FROM lost_items li
      JOIN users u ON li.user_id = u.id
      WHERE li.created_at > $1
    `, [lastCheck]);

    for (let item of lostItems.rows) {
      const users = await pool.query(
        "SELECT email FROM users WHERE campus_code = $1",
        [item.campus_code]
      );

      for (let user of users.rows) {
        await sendEmail(
          user.email,
          "📦 Lost Item Alert",
          `
          <h2>📦 Lost Item</h2>
          <p><b>Item:</b> ${item.item_name}</p>
          <p><b>Description:</b> ${item.description}</p>
          <p><b>Location:</b> ${item.location_lost}</p>
          <p><b>Date:</b> ${item.date_lost}</p>
          <p><b>Contact:</b> ${item.phone}</p>
          <p><b>Time:</b> ${new Date(item.created_at).toLocaleString()}</p>
          `
        );
      }
    }

    // FOUND ITEMS
    const foundItems = await pool.query(`
      SELECT fi.*, u.campus_code, u.full_name, u.phone
      FROM found_items fi
      JOIN users u ON fi.user_id = u.id
      WHERE fi.created_at > $1
    `, [lastCheck]);

    for (let item of foundItems.rows) {
      const users = await pool.query(
        "SELECT email FROM users WHERE campus_code = $1",
        [item.campus_code]
      );

      for (let user of users.rows) {
        await sendEmail(
          user.email,
          "🔍 Found Item Alert",
          `
          <h2>🔍 Found Item</h2>
          <p><b>Item:</b> ${item.item_name}</p>
          <p><b>Description:</b> ${item.description}</p>
          <p><b>Location:</b> ${item.location_found}</p>
          <p><b>Date:</b> ${item.date_found}</p>
          <p><b>Contact:</b> ${item.phone}</p>
          <p><b>Time:</b> ${new Date(item.created_at).toLocaleString()}</p>
          `
        );
      }
    }

    lastCheck = new Date();

  } catch (err) {
    console.error("Email Service Error:", err);
  }
}

// Run every 10 sec
setInterval(checkNewItems, 10000);

console.log("📧 Email Service Started...");
