-- Identifiant public distinct de l'identifiant Discord, choix d'apparaître au classement, dernière connexion.
ALTER TABLE users ADD COLUMN public_id TEXT;
UPDATE users SET public_id = lower(hex(randomblob(16)));
CREATE UNIQUE INDEX users_public_id ON users(public_id);

ALTER TABLE users ADD COLUMN show_on_board INTEGER NOT NULL DEFAULT 1;

ALTER TABLE users ADD COLUMN last_seen TEXT;
UPDATE users SET last_seen = date('now');
