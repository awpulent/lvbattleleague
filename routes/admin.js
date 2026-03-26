const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const adminAuth = require('../middleware/auth');
const pool = require('../db/pool');

// Sponsor logo upload config
const storage = multer.diskStorage({
    destination: path.join(__dirname, '..', 'public', 'img', 'sponsors'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = file.originalname.replace(ext, '').replace(/\s+/g, '-').toLowerCase();
        cb(null, `${name}-${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

// Admin page
router.get('/', adminAuth, async (req, res) => {
    try {
        const seasons = await pool.query('SELECT * FROM seasons ORDER BY id DESC');
        const sponsors = await pool.query('SELECT * FROM sponsors ORDER BY display_order ASC');
        res.render('admin', { seasons: seasons.rows, sponsors: sponsors.rows });
    } catch (err) {
        console.error('Admin page error:', err);
        res.status(500).json({ error: 'Failed to load admin page' });
    }
});

// Sync trigger
router.post('/sync', adminAuth, async (req, res) => {
    try {
        const { tournamentSlug, seasonId, weekNumber } = req.body;
        const ingest = require('../sync/ingest');
        const result = await ingest.syncTournament(tournamentSlug, parseInt(seasonId), parseInt(weekNumber));
        res.json({ success: true, result });
    } catch (err) {
        console.error('Sync error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Add sponsor
router.post('/sponsors', adminAuth, upload.single('logo'), async (req, res) => {
    try {
        const { name, website_url, display_order } = req.body;
        const logo_url = `/img/sponsors/${req.file.filename}`;
        await pool.query(
            'INSERT INTO sponsors (name, logo_url, website_url, display_order) VALUES ($1, $2, $3, $4)',
            [name, logo_url, website_url || null, parseInt(display_order) || 0]
        );
        res.redirect(`/admin?secret=${process.env.ADMIN_SECRET}`);
    } catch (err) {
        console.error('Add sponsor error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete sponsor
router.post('/sponsors/:id/delete', adminAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM sponsors WHERE id = $1', [req.params.id]);
        res.redirect(`/admin?secret=${process.env.ADMIN_SECRET}`);
    } catch (err) {
        console.error('Delete sponsor error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
