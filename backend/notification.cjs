// ==========================================
// NOTIFICATION SERVICE - Campus Lost & Found
// ==========================================

const { Pool } = require('pg');
const { sendEmail } = require('./emailService.cjs');

// Database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// ============== NOTIFICATION TYPES ==============
const NOTIFICATION_TYPES = {
    LOST_ITEM: 'lost',
    FOUND_ITEM: 'found',
    CLAIM_REQUEST: 'claim',
    CLAIM_APPROVED: 'claim_approved',
    CLAIM_REJECTED: 'claim_rejected',
    NEW_MESSAGE: 'message',
    SYSTEM: 'system',
    CAMPUS_UPDATE: 'campus_update'
};

// ============== CREATE SINGLE NOTIFICATION ==============
async function createNotification(userId, title, message, type, relatedId = null) {
    try {
        const result = await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, is_read, related_id, created_at) 
             VALUES ($1, $2, $3, $4, false, $5, NOW()) RETURNING *`,
            [userId, title, message, type, relatedId]
        );
        console.log(`✅ Notification created for user ${userId}: ${title}`);
        return result.rows[0];
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
}

// ============== BULK CREATE NOTIFICATIONS ==============
async function createBulkNotifications(userIds, title, message, type, relatedId = null) {
    const results = [];
    for (const userId of userIds) {
        const notification = await createNotification(userId, title, message, type, relatedId);
        if (notification) results.push(notification);
    }
    console.log(`✅ Created ${results.length} bulk notifications`);
    return results;
}

// ============== GET NOTIFICATIONS FOR USER ==============
async function getUserNotifications(userId, limit = 50, offset = 0) {
    try {
        const result = await pool.query(
            `SELECT n.*, u.full_name as sender_name 
             FROM notifications n
             LEFT JOIN users u ON n.related_id = u.id
             WHERE n.user_id = $1 
             ORDER BY n.created_at DESC 
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        
        const countResult = await pool.query(
            `SELECT COUNT(*) as total FROM notifications WHERE user_id = $1`,
            [userId]
        );
        
        const unreadResult = await pool.query(
            `SELECT COUNT(*) as unread FROM notifications WHERE user_id = $1 AND is_read = false`,
            [userId]
        );
        
        return {
            success: true,
            notifications: result.rows,
            total: parseInt(countResult.rows[0].total),
            unread: parseInt(unreadResult.rows[0].unread)
        };
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return { success: false, notifications: [], total: 0, unread: 0 };
    }
}

// ============== MARK NOTIFICATION AS READ ==============
async function markNotificationAsRead(notificationId, userId) {
    try {
        const result = await pool.query(
            `UPDATE notifications SET is_read = true 
             WHERE id = $1 AND user_id = $2 
             RETURNING *`,
            [notificationId, userId]
        );
        
        if (result.rows.length > 0) {
            console.log(`✅ Notification ${notificationId} marked as read for user ${userId}`);
            return { success: true, notification: result.rows[0] };
        }
        return { success: false, message: 'Notification not found' };
    } catch (error) {
        console.error('Error marking notification as read:', error);
        return { success: false, message: error.message };
    }
}

// ============== MARK ALL NOTIFICATIONS AS READ ==============
async function markAllNotificationsAsRead(userId) {
    try {
        const result = await pool.query(
            `UPDATE notifications SET is_read = true 
             WHERE user_id = $1 AND is_read = false 
             RETURNING *`,
            [userId]
        );
        
        console.log(`✅ Marked ${result.rowCount} notifications as read for user ${userId}`);
        return { success: true, count: result.rowCount };
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        return { success: false, message: error.message };
    }
}

// ============== DELETE NOTIFICATION ==============
async function deleteNotification(notificationId, userId) {
    try {
        const result = await pool.query(
            `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
            [notificationId, userId]
        );
        
        if (result.rows.length > 0) {
            console.log(`✅ Notification ${notificationId} deleted for user ${userId}`);
            return { success: true };
        }
        return { success: false, message: 'Notification not found' };
    } catch (error) {
        console.error('Error deleting notification:', error);
        return { success: false, message: error.message };
    }
}

// ============== GET UNREAD COUNT ==============
async function getUnreadNotificationCount(userId) {
    try {
        const result = await pool.query(
            `SELECT COUNT(*) as unread FROM notifications WHERE user_id = $1 AND is_read = false`,
            [userId]
        );
        return parseInt(result.rows[0].unread);
    } catch (error) {
        console.error('Error getting unread count:', error);
        return 0;
    }
}

// ============== NOTIFICATION FOR NEW LOST ITEM ==============
async function notifyNewLostItem(lostItemId, userId, itemName, location) {
    try {
        const userResult = await pool.query(
            `SELECT campus_id, full_name FROM users WHERE id = $1`,
            [userId]
        );
        
        const campusId = userResult.rows[0]?.campus_id;
        const userName = userResult.rows[0]?.full_name;
        
        if (campusId) {
            const sameCampusUsers = await pool.query(
                `SELECT id FROM users WHERE campus_id = $1 AND id != $2`,
                [campusId, userId]
            );
            
            const userIds = sameCampusUsers.rows.map(row => row.id);
            
            if (userIds.length > 0) {
                await createBulkNotifications(
                    userIds,
                    '📦 New Lost Item Reported',
                    `${userName} reported a lost item: "${itemName}" at ${location}. Help spread the word!`,
                    NOTIFICATION_TYPES.LOST_ITEM,
                    lostItemId
                );
            }
        }
        return { success: true };
    } catch (error) {
        console.error('Error notifying new lost item:', error);
        return { success: false, message: error.message };
    }
}

// ============== NOTIFICATION FOR NEW FOUND ITEM ==============
async function notifyClaimRequest(claimId, ownerId, claimantName, itemName) {
    try {

        // in-app notification
        await createNotification(
            ownerId,
            '📋 New Claim Request',
            `${claimantName} wants to claim "${itemName}". Click to review the claim.`,
            NOTIFICATION_TYPES.CLAIM_REQUEST,
            claimId
        );

        // get owner's email
        const userResult = await pool.query(
            `SELECT email FROM users WHERE id = $1`,
            [ownerId]
        );

        const ownerEmail = userResult.rows[0]?.email;

        // send email
        if (ownerEmail) {
            await sendEmail(
                ownerEmail,
                "Someone Claimed Your Item",
                `${claimantName} wants to claim "${itemName}". Login to review the claim.`
            );
        }

        return { success: true };

    } catch (error) {
        console.error('Error notifying claim request:', error);
        return { success: false, message: error.message };
    }
}
// ============== NOTIFICATION FOR NEW FOUND ITEM ==============
async function notifyNewFoundItem(foundItemId, userId, itemName, location) {
    try {
        const userResult = await pool.query(
            `SELECT campus_id, full_name FROM users WHERE id = $1`,
            [userId]
        );

        const campusId = userResult.rows[0]?.campus_id;
        const userName = userResult.rows[0]?.full_name;

        if (campusId) {
            const sameCampusUsers = await pool.query(
                `SELECT id FROM users WHERE campus_id = $1 AND id != $2`,
                [campusId, userId]
            );

            const userIds = sameCampusUsers.rows.map(row => row.id);

            if (userIds.length > 0) {
                await createBulkNotifications(
                    userIds,
                    '🔍 New Found Item Reported',
                    `${userName} found an item: "${itemName}" at ${location}. Is this yours?`,
                    NOTIFICATION_TYPES.FOUND_ITEM,
                    foundItemId
                );
            }
        }

        return { success: true };

    } catch (error) {
        console.error('Error notifying new found item:', error);
        return {
            success: false,
            message: error.message
        };
    }
}
// ============== NOTIFICATION FOR CLAIM REQUEST ==============
async function notifyClaimRequest(claimId, ownerId, claimantName, itemName)  {
    try {
        await createNotification(
            ownerId,
            '📋 New Claim Request',
            `${claimantName} wants to claim "${itemName}". Click to review the claim.`,
            NOTIFICATION_TYPES.CLAIM_REQUEST,
            claimId
        );
        return { success: true };
    } catch (error) {
        console.error('Error notifying claim request:', error);
        return { success: false, message: error.message };
    }
}

// ============== NOTIFICATION FOR CLAIM APPROVED ==============
async function notifyClaimApproved(claimId, claimantId, ownerName, itemName) {
    try {
        await createNotification(
            claimantId,
            '✅ Claim Approved!',
            `Your claim for "${itemName}" has been approved by ${ownerName}. You can now contact them.`,
            NOTIFICATION_TYPES.CLAIM_APPROVED,
            claimId
        );

        return { success: true };

    } catch (error) {
        console.error('Error notifying claim approved:', error);
        return { success: false, message: error.message };
    }
}
// ============== NOTIFICATION FOR CLAIM REJECTED ==============
async function notifyClaimRejected(claimId, claimantId, ownerName, itemName, reason = null) {
    try {
        const message = reason 
            ? `Your claim for "${itemName}" was rejected by ${ownerName}. Reason: ${reason}`
            : `Your claim for "${itemName}" was rejected by ${ownerName}.`;
            
        await createNotification(
            claimantId,
            '❌ Claim Rejected',
            message,
            NOTIFICATION_TYPES.CLAIM_REJECTED,
            claimId
        );
        return { success: true };
    } catch (error) {
        console.error('Error notifying claim rejected:', error);
        return { success: false, message: error.message };
    }
}

// ============== NOTIFICATION FOR NEW MESSAGE ==============
async function notifyNewMessage(receiverId, senderName, message) {
    try {
        await createNotification(
            receiverId,
            '💬 New Message',
            `${senderName} sent you a message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`,
            NOTIFICATION_TYPES.NEW_MESSAGE
        );
        return { success: true };
    } catch (error) {
        console.error('Error notifying new message:', error);
        return { success: false, message: error.message };
    }
}

// ============== GET NOTIFICATION DETAILS ==============
async function getNotificationDetails(notificationId, userId) {
    try {
        const result = await pool.query(
            `SELECT n.*, 
                    CASE 
                        WHEN n.type = 'claim' AND n.related_id IS NOT NULL THEN
                            (SELECT json_build_object('claim_id', c.claim_id, 'item_name', 
                                CASE 
                                    WHEN c.lost_item_id IS NOT NULL THEN li.item_name
                                    ELSE fi.item_name
                                END, 
                                'claimant_name', u.full_name)
                             FROM claims c
                             LEFT JOIN lost_items li ON c.lost_item_id = li.item_id
                             LEFT JOIN found_items fi ON c.found_item_id = fi.found_id
                             JOIN users u ON c.claimant_id = u.id
                             WHERE c.claim_id = n.related_id)
                        WHEN n.type IN ('lost', 'found') AND n.related_id IS NOT NULL THEN
                            (SELECT json_build_object('item_id', item_id, 'item_name', item_name, 
                                'location', CASE WHEN n.type = 'lost' THEN location_lost ELSE location_found END)
                             FROM ${n.type === 'lost' ? 'lost_items' : 'found_items'}
                             WHERE ${n.type === 'lost' ? 'item_id' : 'found_id'} = n.related_id)
                        ELSE NULL
                    END as details
             FROM notifications n
             WHERE n.id = $1 AND n.user_id = $2`,
            [notificationId, userId]
        );
        
        if (result.rows.length === 0) {
            return { success: false, message: 'Notification not found' };
        }
        
        return { success: true, notification: result.rows[0] };
    } catch (error) {
        console.error('Error getting notification details:', error);
        return { success: false, message: error.message };
    }
}

// ============== CLEAN OLD NOTIFICATIONS ==============
async function cleanOldNotifications(daysOld = 30) {
    try {
        const result = await pool.query(
            `DELETE FROM notifications 
             WHERE created_at < NOW() - INTERVAL '${daysOld} days' 
             AND is_read = true 
             RETURNING id`,
            []
        );
        console.log(`✅ Cleaned up ${result.rowCount} old notifications`);
        return { success: true, count: result.rowCount };
    } catch (error) {
        console.error('Error cleaning old notifications:', error);
        return { success: false, message: error.message };
    }
}

// ============== EXPORT MODULES ==============
module.exports = {
    NOTIFICATION_TYPES,
    createNotification,
    createBulkNotifications,
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    getUnreadNotificationCount,
    notifyNewLostItem,
    notifyNewFoundItem,
    notifyClaimRequest,
    notifyClaimApproved,
    notifyClaimRejected,
    notifyNewMessage,
    getNotificationDetails,
    cleanOldNotifications
};
