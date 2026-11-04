-- Joueurs (identifiés par Discord), sessions, parties du jour et états OAuth.
CREATE TABLE users (
  id          TEXT PRIMARY KEY,            -- identifiant Discord
  name        TEXT NOT NULL,
  avatar      TEXT,                        -- hash d'avatar Discord
  streak      INTEGER NOT NULL DEFAULT 0,  -- série en cours (jours consécutifs réussis)
  best        INTEGER NOT NULL DEFAULT 0,
  played      INTEGER NOT NULL DEFAULT 0,
  won         INTEGER NOT NULL DEFAULT 0,
  guesses     INTEGER NOT NULL DEFAULT 0,  -- total des essais des parties gagnées
  last_day    TEXT,                        -- dernier jour joué (AAAA-MM-JJ)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,            -- SHA-256 du jeton : le jeton lui-même n'est jamais stocké
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE daily_games (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  guesses     INTEGER NOT NULL,
  won         INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, day)
);

CREATE TABLE oauth_states (
  state       TEXT PRIMARY KEY,
  expires_at  TEXT NOT NULL
);

CREATE INDEX users_leaderboard ON users(best DESC, streak DESC);
