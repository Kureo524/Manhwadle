-- Perso du jour joué côté serveur : personnage du jour figé, essais enregistrés un par un.
CREATE TABLE daily_targets (
  day           TEXT PRIMARY KEY,
  character_id  TEXT NOT NULL
);

CREATE TABLE daily_guesses (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           TEXT NOT NULL,
  position      INTEGER NOT NULL,
  character_id  TEXT NOT NULL,
  PRIMARY KEY (user_id, day, position),
  UNIQUE (user_id, day, character_id)
);

-- Modération : un joueur masqué n'apparaît plus au classement.
ALTER TABLE users ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
