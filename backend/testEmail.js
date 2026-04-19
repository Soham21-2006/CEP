const sendEmail = require("./email");

async function test() {
  try {
    const res = await sendEmail(
      "YOUR_PERSONAL_EMAIL@gmail.com",
      "Test Email",
      "<h1>If you see this, email works ✅</h1>"
    );

    console.log("✅ Email sent:", res);
  } catch (err) {
    console.error("❌ Email failed:", err);
  }
}

test();