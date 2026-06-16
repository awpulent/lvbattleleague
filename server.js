require('dotenv').config();
const express = require('express');
const path = require('path');
const { default: migrate } = require('node-pg-migrate');
const { getDbConfig } = require('./db/config');

const dbUrl = process.env.DATABASE_URL || 'NOT SET';
console.log('DATABASE_URL host:', dbUrl.replace(/\/\/.*@/, '//***@'));

const pool = require('./db/pool');

const indexRoutes = require('./routes/index');
const playerRoutes = require('./routes/player');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/api', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRoutes);
app.use('/player', playerRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

async function start() {
    try {
        console.log('Running database migrations...');
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
