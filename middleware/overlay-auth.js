const safeEqual = require('./safe-equal');

function overlayAuth(req, res, next) {
    // Header-only: the key must never travel in the query string (leaks into logs).
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || !process.env.OVERLAY_API_KEY || !safeEqual(token, process.env.OVERLAY_API_KEY)) {
        return res.status(401).json({ error: 'Invalid or missing API key' });
    }
    next();
}

module.exports = overlayAuth;
