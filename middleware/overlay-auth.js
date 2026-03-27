function overlayAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '') ||
                  req.query.key;

    if (!token || token !== process.env.OVERLAY_API_KEY) {
        return res.status(401).json({ error: 'Invalid or missing API key' });
    }
    next();
}

module.exports = overlayAuth;
