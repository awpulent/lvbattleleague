require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const { getDbConfig } = require('./db/config');

const dbUrl = process.env.DATABASE_URL || 'NOT SET';
console.log('DATABASE_URL host:', dbUrl.replace(/\/\/.*@/, '//***@'));

// Secret hygiene — warn loudly but do not crash (prod secret rotation is operator-controlled).
if (!process.env.ADMIN_SECRET) {
    console.warn('[security] ADMIN_SECRET is not set — the admin surface will reject all requests until it is configured.');
} else if (process.env.ADMIN_SECRET.length < 16) {
    console.warn(`[security] ADMIN_SECRET is only ${process.env.ADMIN_SECRET.length} chars. Use a 16+ char random value: node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`);
}
if (process.env.OVERLAY_API_KEY && process.env.OVERLAY_API_KEY.length < 16) {
    console.warn(`[security] OVERLAY_API_KEY is only ${process.env.OVERLAY_API_KEY.length} chars; consider a longer random value.`);
}

const pool = require('./db/pool');

const indexRoutes = require('./routes/index');
const playerRoutes = require('./routes/player');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');
const adminLimiter = require('./middleware/admin-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Behind the DigitalOcean App Platform edge proxy (1 hop). Required for correct
// req.ip (rate-limit keying) and req.secure (secure cookies). Do NOT use `true`.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security headers first, so they cover every response (static + rendered + API).
// CORP must be cross-origin so the OBS browser-source overlay can fetch /api JSON.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Global volumetric rate limit (public pages + admin), keyed on the real client IP.
app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
}));

app.use('/api', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use(cookieParser(process.env.ADMIN_SECRET));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRoutes);
app.use('/player', playerRoutes);
app.use('/admin', adminLimiter, adminRoutes);
app.use('/api', apiRoutes);

// 404 — after all routes.
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Global error handler — MUST be last and have 4 args. Logs full detail
// server-side; returns generic 5xx (no internal/DB error text) to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
});

async function start() {
    try {
        console.log('Running database migrations...');
        const { runner: migrate } = await import('node-pg-migrate');
        await migrate({
            databaseUrl: getDbConfig(),
            migrationsTable: 'pgmigrations',
            dir: path.join(__dirname, 'migrations'),
            direction: 'up',
            log: msg => console.log('[migrate]', msg),
        });
        console.log('Migrations complete.');
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`LV Battle League running on port ${PORT}`);
    });
}

start();
