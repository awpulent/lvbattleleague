function adminAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '') ||
                  req.body?.adminSecret ||
                  req.query?.secret;

    if (token !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

module.exports = adminAuth;
