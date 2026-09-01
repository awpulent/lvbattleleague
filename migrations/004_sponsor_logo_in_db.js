exports.shorthands = undefined;

// Sponsor logos move from the container filesystem into the database.
// App Platform rebuilds the filesystem on every deploy, so a logo written
// under public/img/sponsors/ vanished with the next push.
exports.up = pgm => {
    pgm.sql(`
        ALTER TABLE sponsors
            ADD COLUMN IF NOT EXISTS logo_data BYTEA,
            ADD COLUMN IF NOT EXISTS logo_mime TEXT
    `);
};

exports.down = pgm => {
    pgm.sql('ALTER TABLE sponsors DROP COLUMN IF EXISTS logo_data, DROP COLUMN IF EXISTS logo_mime');
};
