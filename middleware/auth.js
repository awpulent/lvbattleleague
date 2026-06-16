const crypto = require('crypto');

function safeCompare(a, b) {
    const ha = crypto.createHmac('sha256', 'lvbl').update(String(a)).digest();
    const hb = crypto.createHmac('sha256', 'lvbl').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function adminAuth(req, res, next) {
    let token;
    if (req.method === 'GET') {
        token = req.headers.authorization?.replace('Bearer ', '') ||
                req.body?.adminSecret ||
                req.query?.secret;
    } else {
        // POST/PUT/DELETE: never accept secret in query string — it leaks into server logs
        token = req.headers.authorization?.replace('Bearer ', '') ||
                req.body?.adminSecret;
    }

    if (!token || !safeCompare(token, process.env.ADMIN_SECRET || '')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

module.exports = adminAuth;
