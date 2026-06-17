const safeEqual = require('./safe-equal');

// In-memory failed-attempt counter purely for observability (resets on restart).
// Bounded so a flood of distinct source IPs can't grow it without limit.
const failures = new Map(); // ip -> count

function noteFailure(req) {
    if (failures.size > 10000) failures.clear();
    const n = (failures.get(req.ip) || 0) + 1;
    failures.set(req.ip, n);
    const line = `[admin-auth] FAILED ip=${req.ip} method=${req.method} path=${req.originalUrl} attempts=${n} ${new Date().toISOString()}`;
    if (n >= 10) console.error(line + ' (possible brute-force)');
    else console.warn(line);
}

function isAuthed(req) {
    const secret = process.env.ADMIN_SECRET || '';
    if (!secret) return false;
    // 1) Signed session cookie set by POST /admin/login (browser flow).
    if (req.signedCookies && req.signedCookies.lvbl_admin === '1') return true;
    // 2) Authorization: Bearer <secret> or body adminSecret (curl / API callers).
    //    The secret is NEVER read from the query string (it leaks into logs/history).
    const token = req.headers.authorization?.replace('Bearer ', '') || req.body?.adminSecret;
    return !!token && safeEqual(token, secret);
}

function adminAuth(req, res, next) {
    if (isAuthed(req)) {
        failures.delete(req.ip);
        return next();
    }
    noteFailure(req);
    // Browser navigation → send to the login page; API/curl → 401 JSON.
    if (req.method === 'GET' && req.accepts(['html', 'json']) === 'html') {
        return res.redirect('/admin/login');
    }
    return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = adminAuth;
