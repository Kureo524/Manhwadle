# Manhwadle

Jeu de déduction standalone (Electron) : devine un personnage de manhwa à partir de catégories.
Chaque essai compare ton personnage au personnage mystère sur : manhwa, genre, rôle, espèce,
affiliation, pouvoir, statut, chapitre de 1re apparition (webtoon) et couleur de cheveux.

Œuvres : Omniscient Reader's Viewpoint, The World After The Fall, The Beginning After The End,
Reincarnator, Star-Embracing Swordmaster.

Direction artistique : `Docs/DA/DA-Verre-d-encre.md`.

## Modes
- **Perso du jour** : le même personnage pour tout le monde, change à minuit (heure locale).
- **Infini** : parties à la suite, avec choix des manhwa en jeu.

Un indice (portrait flouté) se débloque après 6 essais, plus net à 10.

## Commandes
```bash
npm install                 # puis : npm install-scripts approve electron (npm >= 12)
npm start                   # lance le jeu
npm test                    # tests de la logique et validation des données
npm run fetch-images        # télécharge les portraits manquants depuis les wikis
npm run dist                # construit dist/Manhwadle-<version>.AppImage
npx electron tools/screenshot.cjs capture.png endless kim-dokja,vlad   # capture hors écran
```

## Données
- `data/manhwas.json` : les œuvres et l'API de leur wiki.
- `data/characters.json` : les personnages. `page` = titre de la page wiki (sert au téléchargement
  du portrait). Une valeur `"?"` ou un `chapter` à `null` s'affiche comme « inconnu » (aucun verdict).
  `"verify": true` marque une fiche à relire.
- `assets/characters/<manhwa>/<id>.webp` : portraits 320×320. Sans fichier, un monogramme s'affiche.
- `data/credits.json` : source de chaque portrait (généré par `fetch-images`).

Le **statut** suit l'état dans le webtoon quand le wiki le précise.

## Workflow git
- `main` : versions validées (protégée, PR obligatoire)
- `dev` : intégration (protégée, PR obligatoire, branche par défaut)
- `feature/<sujet>` : une branche par feature, PR vers `dev`
