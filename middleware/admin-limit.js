const { rateLimit } = require('express-rate-limit');

// Strict limiter for the admin surface to throttle brute-forcing of ADMIN_SECRET.
// Only failed attempts count (skipSuccessfulRequests), so normal admin use is
// never throttled. Default keyGenerator buckets on the real client IP (requires
// `app.set('trust proxy', 1)` in server.js, which is set).
module.exports = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10,                // 10 failed attempts / IP / window
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
        console.error(`[admin-auth] rate-limit tripped ip=${req.ip} path=${req.originalUrl} ${new Date().toISOString()}`);
        res.status(429).json({ error: 'Too many attempts. Try again later.' });
    },
});
