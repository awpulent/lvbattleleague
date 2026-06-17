const { Pool } = require('pg');
const { getDbConfig } = require('./config');

// Bound the pool and add timeouts so a burst or a stalled query can't pin the
// event loop / exhaust connections. Applied only to the app pool (migrations use
// getDbConfig() directly and are unaffected).
const pool = new Pool({
    ...getDbConfig(),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    query_timeout: 10000,
});

module.exports = pool;
