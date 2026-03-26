const { Pool } = require('pg');

let connectionString = process.env.DATABASE_URL;

// Strip sslmode from the connection string — we handle SSL config explicitly
if (connectionString) {
    connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '');
    // Clean up trailing ? if sslmode was the only param
    connectionString = connectionString.replace(/\?$/, '');
}

const useSSL = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=');

const pool = new Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false
});

module.exports = pool;
