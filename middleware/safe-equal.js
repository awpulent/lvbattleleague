const crypto = require('crypto');

// Constant-time, length-safe comparison of two secrets/tokens.
// Both sides are HMAC'd to a fixed-length digest so crypto.timingSafeEqual
// never throws on a length mismatch and the secret's length is not leaked via
// timing. The HMAC key here only normalizes length — it is NOT itself a secret.
function safeEqual(a, b) {
    if (a == null || b == null) return false;
    const ha = crypto.createHmac('sha256', 'lvbl').update(String(a)).digest();
    const hb = crypto.createHmac('sha256', 'lvbl').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

module.exports = safeEqual;
