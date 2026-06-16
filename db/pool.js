const { Pool } = require('pg');
const { getDbConfig } = require('./config');

const pool = new Pool(getDbConfig());

module.exports = pool;
