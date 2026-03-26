/**
 * Initialize database schema using Node.js pg client
 * Usage: node db/init.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function init() {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('Running schema...');
    await pool.query(schema);
    console.log('Schema created successfully.');
    await pool.end();
}

init().catch(err => {
    console.error('Schema init failed:', err);
    process.exit(1);
});
