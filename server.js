require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('./db/pool');

const indexRoutes = require('./routes/index');
const playerRoutes = require('./routes/player');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', indexRoutes);
app.use('/player', playerRoutes);
app.use('/admin', adminRoutes);

// Auto-init: create tables if they don't exist, then start
async function start() {
    try {
        const check = await pool.query("SELECT to_regclass('public.players')");
        if (!check.rows[0].to_regclass) {
            console.log('Tables not found — running schema init...');
            const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
            await pool.query(schema);
            console.log('Schema created.');
        }
    } catch (err) {
        console.error('Schema auto-init failed:', err.message);
    }

    app.listen(PORT, () => {
        console.log(`LV Battle League running on port ${PORT}`);
    });
}

start();
