const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Verify connection
transporter.verify((error, success) => {
    if (error) {
        console.error('Email service error:', error);
    } else {
        console.log('Email service ready');
    }
});

// Send email function
async function sendEmail({ to, subject, html, text }) {
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: to,
            subject: subject,
            text: text || '',
            html: html || '',
        });
        console.log('Email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Email sending failed:', error);
        return { success: false, error: error.message };
    }
}

// Registration welcome email
async function sendWelcomeEmail(user) {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8b5cf6;">Welcome to CampusTrace! 🎓</h2>
            <p>Hi ${user.full_name},</p>
            <p>Thank you for joining CampusTrace - your campus lost & found platform.</p>
            <p>You can now:</p>
            <ul>
                <li>Report lost or found items</li>
                <li>Connect with other students</li>
                <li>Earn reputation points</li>
            </ul>
            <a href="https://cep-eight-tau.vercel.app/dashboard.html" 
               style="background-color: #8b5cf6; color: white; padding: 10px 20px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
                Go to Dashboard
            </a>
            <p style="margin-top: 20px; font-size: 12px; color: #666;">
                CampusTrace - Trace It, Claim It, Return It
            </p>
        </div>
    `;
    
    return sendEmail({
        to: user.email,
        subject: 'Welcome to CampusTrace! 🎉',
        html: html,
    });
}

// New match notification email
async function sendMatchEmail(user, matchItem, matchPercentage) {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">Potential Match Found! 🎯</h2>
            <p>Hi ${user.full_name},</p>
            <p>We found a potential match for your item with <strong>${matchPercentage}%</strong> confidence!</p>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 10px; margin: 15px 0;">
                <h3 style="margin: 0 0 10px 0;">Item Details:</h3>
                <p><strong>Name:</strong> ${matchItem.item_name}</p>
                <p><strong>Category:</strong> ${matchItem.category || 'N/A'}</p>
                <p><strong>Location:</strong> ${matchItem.location_lost || matchItem.location_found || 'N/A'}</p>
                <p><strong>Description:</strong> ${matchItem.description || 'N/A'}</p>
            </div>
            <a href="https://cep-eight-tau.vercel.app/dashboard.html" 
               style="background-color: #22c55e; color: white; padding: 10px 20px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
                View Match
            </a>
        </div>
    `;
    
    return sendEmail({
        to: user.email,
        subject: '🎯 New Potential Match Found!',
        html: html,
    });
}

// New message notification email
async function sendNewMessageEmail(receiver, sender, messagePreview) {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8b5cf6;">New Message Received 💬</h2>
            <p>Hi ${receiver.full_name},</p>
            <p>You have a new message from <strong>${sender.full_name}</strong>:</p>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 10px; margin: 15px 0;">
                <em>"${messagePreview.substring(0, 100)}${messagePreview.length > 100 ? '...' : ''}"</em>
            </div>
            <a href="https://cep-eight-tau.vercel.app/messaging.html" 
               style="background-color: #8b5cf6; color: white; padding: 10px 20px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
                Reply Now
            </a>
        </div>
    `;
    
    return sendEmail({
        to: receiver.email,
        subject: `💬 New message from ${sender.full_name}`,
        html: html,
    });
}

// Claim status update email
async function sendClaimStatusEmail(user, itemName, status, ownerName) {
    const statusColor = status === 'approved' ? '#22c55e' : '#ef4444';
    const statusText = status === 'approved' ? 'Approved ✅' : 'Rejected ❌';
    
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${statusColor};">Claim ${statusText}</h2>
            <p>Hi ${user.full_name},</p>
            <p>Your claim for <strong>"${itemName}"</strong> has been <strong>${status}</strong> by ${ownerName}.</p>
            ${status === 'approved' ? 
                `<p>🎉 Congratulations! Please contact the owner to arrange the return of your item.</p>
                 <p><strong>Contact them through the messaging system to coordinate.</strong></p>` : 
                `<p>Sorry, your claim was not approved. Keep looking for your item!</p>`
            }
            <a href="https://cep-eight-tau.vercel.app/dashboard.html" 
               style="background-color: ${statusColor}; color: white; padding: 10px 20px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
                View Details
            </a>
        </div>
    `;
    
    return sendEmail({
        to: user.email,
        subject: `Claim ${status.toUpperCase()}: ${itemName}`,
        html: html,
    });
}

// Admin announcement email
async function sendAnnouncementEmail(user, announcement) {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8b5cf6;">📢 Campus Announcement</h2>
            <h3>${announcement.title}</h3>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 10px; margin: 15px 0;">
                <p>${announcement.content}</p>
            </div>
            <a href="https://cep-eight-tau.vercel.app/dashboard.html" 
               style="background-color: #8b5cf6; color: white; padding: 10px 20px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
                Go to Dashboard
            </a>
        </div>
    `;
    
    return sendEmail({
        to: user.email,
        subject: `📢 ${announcement.title}`,
        html: html,
    });
}

module.exports = {
    sendEmail,
    sendWelcomeEmail,
    sendMatchEmail,
    sendNewMessageEmail,
    sendClaimStatusEmail,
    sendAnnouncementEmail,
};