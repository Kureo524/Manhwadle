-- Connexion depuis l'appli installée sur téléphone (PWA) : Discord s'ouvre dans le navigateur
-- (ou l'appli Discord), et l'appli récupère la session en interrogeant /auth/poll.
-- oauth_states.poll_hash : SHA-256 du code secret gardé par l'appli (le code lui-même ne transite qu'en POST).
ALTER TABLE oauth_states ADD COLUMN poll_hash TEXT;

-- Résultat d'une connexion en attente d'être récupéré par l'appli (usage unique, 10 minutes).
-- Aucun jeton n'est stocké : la session n'est créée qu'au moment de la récupération.
CREATE TABLE login_polls (
  poll_hash   TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  error       TEXT,                        -- annule | expire | erreur
  expires_at  TEXT NOT NULL
);
