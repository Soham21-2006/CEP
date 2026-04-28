require("dotenv").config();
const sendEmail = require("./mailer");

async function test() {
  try {
    await sendEmail(
      "roshanmohod428@gmail.com",
      "Test Email",
      "If you see this, email works"
    );

    console.log("✅ Email sent");
  } catch (err) {
    console.error("❌ Email failed:", err);
  }
}

test();