const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Per-/api limiter. overlayAuth runs BEFORE this (see routes/api.js), so only
// already-authenticated traffic reaches it. The single legitimate overlay key
// shares one bucket; unauthenticated/rotated keys are rejected upstream and never
// create a bucket. Falls back to a normalized (IPv6-safe) client IP if no header.
module.exports = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.headers.authorization || ipKeyGenerator(req.ip),
});
