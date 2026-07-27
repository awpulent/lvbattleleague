exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`
        ALTER TABLE seasons ADD COLUMN IF NOT EXISTS sponsor_id INTEGER
            REFERENCES sponsors(id) ON DELETE SET NULL
    `);
};

exports.down = pgm => {
    pgm.sql('ALTER TABLE seasons DROP COLUMN IF EXISTS sponsor_id');
};
