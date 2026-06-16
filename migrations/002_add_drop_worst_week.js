exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql('ALTER TABLE seasons ADD COLUMN IF NOT EXISTS drop_worst_week BOOLEAN DEFAULT TRUE');
};

exports.down = pgm => {
    pgm.sql('ALTER TABLE seasons DROP COLUMN IF EXISTS drop_worst_week');
};
