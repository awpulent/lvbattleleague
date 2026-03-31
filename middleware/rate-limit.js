// Simple in-memory rate limiter
// No external dependencies — resets on app restart which is fine for this use case

const windowMs = 60 * 1000; // 1 minute
const maxRequests = 60; // Autocomplete + stats lookups need headroom

const requests = new Map(); // key -> { count, resetAt }

function rateLimit(req, res, next) {
    const key = req.headers.authorization || req.query.key || req.ip;
    const now = Date.now();

    let entry = requests.get(key);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs };
        requests.set(key, entry);
    }

    entry.count++;

    res.set('X-RateLimit-Limit', String(maxRequests));
    res.set('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));

    if (entry.count > maxRequests) {
        return res.status(429).json({ error: 'Rate limit exceeded. Max 60 requests per minute.' });
    }

    next();
}

// Clean up stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of requests) {
        if (now > entry.resetAt) requests.delete(key);
    }
}, 5 * 60 * 1000);

module.exports = rateLimit;
