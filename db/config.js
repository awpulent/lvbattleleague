function getDbConfig() {
    let connectionString = process.env.DATABASE_URL;
    const useSSL = connectionString?.includes('sslmode=');
    if (connectionString) {
        connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
    }
    return {
        connectionString,
        ssl: useSSL ? { rejectUnauthorized: false } : false
    };
}

module.exports = { getDbConfig };
