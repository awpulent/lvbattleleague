const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const useSSL = connectionString && connectionString.includes('sslmode=require');

const pool = new Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false
});

module.exports = pool;
