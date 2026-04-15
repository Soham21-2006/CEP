const express = require('express');
const pool = require('./config.js');
const router = express.Router();

// ============== SEND MESSAGE ==============
router.post('/send-message', async (req, res) => {
    const { sender_id, receiver_id, message, share_contact } = req.body;
    
    if (!sender_id || !receiver_id) {
        return res.json({ success: false, message: 'Sender and receiver IDs required!' });
    }
    
    try {
        let finalMessage = message;
        
        // If sharing contact, add user details
        if (share_contact) {
            const senderInfo = await pool.query(
                'SELECT full_name, phone, email FROM users WHERE id = $1',
                [parseInt(sender_id)]
            );
            if (senderInfo.rows.length > 0) {
                finalMessage = `${message}\n\n--- Contact Information ---\nName: ${senderInfo.rows[0].full_name}\nPhone: ${senderInfo.rows[0].phone}\nEmail: ${senderInfo.rows[0].email}`;
            }
        }
        
        await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, message, created_at, is_read) 
             VALUES ($1, $2, $3, NOW(), false)`,
            [parseInt(sender_id), parseInt(receiver_id), finalMessage]
        );
        
        // Create notification for receiver
        const senderName = await pool.query(
            'SELECT full_name FROM users WHERE id = $1',
            [parseInt(sender_id)]
        );
        
        await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, is_read, created_at) 
             VALUES ($1, $2, $3, $4, false, NOW())`,
            [parseInt(receiver_id), 'New Message', `${senderName.rows[0].full_name} sent you a message about an item.`, 'message']
        );
        
        res.json({ success: true, message: 'Message sent!' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== GET CONVERSATION BETWEEN TWO USERS ==============
router.get('/conversation/:userId', async (req, res) => {
    const { user_id } = req.query;
    const otherUserId = parseInt(req.params.userId);
    const currentUserId = parseInt(user_id);
    
    if (!currentUserId) {
        return res.json({ success: false, message: 'User ID required!' });
    }
    
    try {
        const result = await pool.query(
            `SELECT m.*, u1.full_name as sender_name, u2.full_name as receiver_name 
             FROM messages m
             JOIN users u1 ON m.sender_id = u1.id
             JOIN users u2 ON m.receiver_id = u2.id
             WHERE (m.sender_id = $1 AND m.receiver_id = $2) 
                OR (m.sender_id = $2 AND m.receiver_id = $1)
             ORDER BY m.created_at ASC`,
            [currentUserId, otherUserId]
        );
        
        // Mark unread messages as read
        await pool.query(
            `UPDATE messages SET is_read = true 
             WHERE receiver_id = $1 AND sender_id = $2 AND is_read = false`,
            [currentUserId, otherUserId]
        );
        
        res.json({ success: true, messages: result.rows });
    } catch (error) {
        console.error('Error fetching conversation:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== GET USER DETAILS ==============
router.get('/user/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const result = await pool.query(
            'SELECT id, full_name, email, phone, profile_pic FROM users WHERE id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== GET UNREAD MESSAGE COUNT ==============
router.get('/unread-messages', async (req, res) => {
    const { user_id } = req.query;
    
    if (!user_id) {
        return res.json({ success: false, message: 'User ID required!' });
    }
    
    try {
        const result = await pool.query(
            'SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = false',
            [parseInt(user_id)]
        );
        
        res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== GET ALL CHATS FOR USER ==============
router.get('/chats', async (req, res) => {
    const { user_id } = req.query;
    
    if (!user_id) {
        return res.json({ success: false, message: 'User ID required!' });
    }
    
    try {
        const result = await pool.query(
            `SELECT DISTINCT 
                CASE 
                    WHEN m.sender_id = $1 THEN m.receiver_id
                    ELSE m.sender_id
                END as other_user_id,
                u.full_name as other_user_name,
                u.profile_pic,
                (SELECT message FROM messages 
                 WHERE (sender_id = $1 AND receiver_id = u.id) 
                    OR (sender_id = u.id AND receiver_id = $1)
                 ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages 
                 WHERE (sender_id = $1 AND receiver_id = u.id) 
                    OR (sender_id = u.id AND receiver_id = $1)
                 ORDER BY created_at DESC LIMIT 1) as last_message_time,
                (SELECT COUNT(*) FROM messages 
                 WHERE receiver_id = $1 AND sender_id = u.id AND is_read = false) as unread_count
             FROM messages m
             JOIN users u ON (u.id = m.sender_id OR u.id = m.receiver_id)
             WHERE (m.sender_id = $1 OR m.receiver_id = $1) AND u.id != $1
             ORDER BY last_message_time DESC`,
            [parseInt(user_id)]
        );
        
        res.json({ success: true, chats: result.rows });
    } catch (error) {
        console.error('Error fetching chats:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== MARK CONVERSATION AS READ ==============
router.put('/mark-conversation-read/:otherUserId', async (req, res) => {
    const { user_id } = req.query;
    const otherUserId = parseInt(req.params.otherUserId);
    
    if (!user_id) {
        return res.json({ success: false, message: 'User ID required!' });
    }
    
    try {
        await pool.query(
            'UPDATE messages SET is_read = true WHERE receiver_id = $1 AND sender_id = $2 AND is_read = false',
            [parseInt(user_id), otherUserId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking conversation as read:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============== MARK SINGLE MESSAGE AS READ ==============
router.put('/mark-read/:messageId', async (req, res) => {
    const { user_id } = req.query;
    const messageId = parseInt(req.params.messageId);
    
    if (!user_id) {
        return res.json({ success: false, message: 'User ID required!' });
    }
    
    try {
        await pool.query(
            'UPDATE messages SET is_read = true WHERE id = $1 AND receiver_id = $2',
            [messageId, parseInt(user_id)]
        );
        
        res.json({ success: true, message: 'Message marked as read' });
    } catch (error) {
        console.error('Error marking message as read:', error);
        res.json({ success: false, message: error.message });
    }
});

module.exports = router;