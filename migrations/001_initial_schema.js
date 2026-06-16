exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS players (
            id              SERIAL PRIMARY KEY,
            startgg_id      INTEGER UNIQUE,
            display_name    TEXT NOT NULL,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS player_aliases (
            id              SERIAL PRIMARY KEY,
            player_id       INTEGER NOT NULL REFERENCES players(id),
            alias           TEXT NOT NULL,
            UNIQUE(player_id, alias)
        );

        CREATE TABLE IF NOT EXISTS seasons (
            id              SERIAL PRIMARY KEY,
            name            TEXT NOT NULL UNIQUE,
            start_date      DATE,
            end_date        DATE,
            is_active       BOOLEAN DEFAULT FALSE
        );

        CREATE TABLE IF NOT EXISTS tournaments (
            id              SERIAL PRIMARY KEY,
            season_id       INTEGER NOT NULL REFERENCES seasons(id),
            startgg_tournament_id INTEGER UNIQUE,
            startgg_event_id      INTEGER UNIQUE,
            name            TEXT NOT NULL,
            week_number     INTEGER,
            date            DATE,
            entrant_count   INTEGER,
            synced_at       TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS sets (
            id              SERIAL PRIMARY KEY,
            tournament_id   INTEGER NOT NULL REFERENCES tournaments(id),
            startgg_set_id  INTEGER UNIQUE,
            winner_id       INTEGER NOT NULL REFERENCES players(id),
            loser_id        INTEGER NOT NULL REFERENCES players(id),
            winner_score    INTEGER,
            loser_score     INTEGER,
            round_text      TEXT,
            bracket_phase   TEXT
        );

        CREATE TABLE IF NOT EXISTS games (
            id              SERIAL PRIMARY KEY,
            set_id          INTEGER NOT NULL REFERENCES sets(id),
            game_number     INTEGER NOT NULL,
            winner_id       INTEGER NOT NULL REFERENCES players(id),
            winner_char     TEXT,
            loser_char      TEXT
        );

        CREATE TABLE IF NOT EXISTS placements (
            id              SERIAL PRIMARY KEY,
            tournament_id   INTEGER NOT NULL REFERENCES tournaments(id),
            player_id       INTEGER NOT NULL REFERENCES players(id),
            placement       INTEGER NOT NULL,
            points          NUMERIC(6,1) NOT NULL,
            UNIQUE(tournament_id, player_id)
        );

        CREATE TABLE IF NOT EXISTS sponsors (
            id              SERIAL PRIMARY KEY,
            name            TEXT NOT NULL,
            logo_url        TEXT NOT NULL,
            website_url     TEXT,
            display_order   INTEGER DEFAULT 0,
            is_active       BOOLEAN DEFAULT TRUE
        );

        CREATE INDEX IF NOT EXISTS idx_placements_player ON placements(player_id);
        CREATE INDEX IF NOT EXISTS idx_placements_tournament ON placements(tournament_id);
        CREATE INDEX IF NOT EXISTS idx_sets_winner ON sets(winner_id);
        CREATE INDEX IF NOT EXISTS idx_sets_loser ON sets(loser_id);
        CREATE INDEX IF NOT EXISTS idx_sets_tournament ON sets(tournament_id);
        CREATE INDEX IF NOT EXISTS idx_games_set ON games(set_id);
        CREATE INDEX IF NOT EXISTS idx_tournaments_season ON tournaments(season_id);
    `);
};

exports.down = false;
