// backend/test-email.cjs
require('dotenv').config();

// Check if email is configured
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ Email not configured!');
    console.log('Please add EMAIL_USER and EMAIL_PASS to your .env file');
    process.exit(1);
}

// Simple email test without using emailService
const nodemailer = require('nodemailer');

async function testEmail() {
    console.log('📧 Testing email configuration...');
    console.log(`📧 Using email: ${process.env.EMAIL_USER}`);
    
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
    
    // Verify connection
    try {
        await transporter.verify();
        console.log('✅ Email transporter verified successfully!');
    } catch (error) {
        console.error('❌ Email verification failed:', error.message);
        return;
    }
    
    // Send test email
    try {
        const result = await transporter.sendMail({
            from: process.env.EMAIL_FROM || `"CampusTrace Test" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER, // Send to yourself
            subject: '✅ CampusTrace Email Test - Successful!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #8b5cf6;">CampusTrace Email Test</h2>
                    <p>✅ <strong>Success!</strong> Your email system is working properly.</p>
                    <p>You will now receive:</p>
                    <ul>
                        <li>Welcome emails for new users</li>
                        <li>Notifications for lost/found items</li>
                        <li>Message alerts</li>
                        <li>Claim status updates</li>
                    </ul>
                    <hr>
                    <p style="color: #666; font-size: 12px;">CampusTrace - Trace It, Claim It, Return It</p>
                </div>
            `,
            text: 'CampusTrace Email Test - Success! Your email system is working properly.'
        });
        console.log('✅ Test email sent successfully!');
        console.log('📧 Message ID:', result.messageId);
        console.log('📧 Check your inbox at:', process.env.EMAIL_USER);
    } catch (error) {
        console.error('❌ Failed to send test email:', error.message);
    }
}

testEmail();