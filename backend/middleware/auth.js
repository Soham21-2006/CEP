// middleware/auth.js
const authMiddleware = (req, res, next) => {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Please login first!' });
    }
};

module.exports = authMiddleware;