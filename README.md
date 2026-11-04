# Manhwadle

[![Jouer dans le navigateur](https://img.shields.io/badge/jouer-dans_le_navigateur-8aa8e0)](https://kureo524.github.io/Manhwadle/)
[![Release](https://img.shields.io/github/v/release/Kureo524/Manhwadle?label=release&color=a597c0)](https://github.com/Kureo524/Manhwadle/releases/latest)
[![Builds](https://github.com/Kureo524/Manhwadle/actions/workflows/release.yml/badge.svg)](https://github.com/Kureo524/Manhwadle/actions/workflows/release.yml)

**▶ [Jouer dans le navigateur](https://kureo524.github.io/Manhwadle/)** ·
**[Télécharger](https://github.com/Kureo524/Manhwadle/releases/latest)** (Windows, macOS, Linux)

> **In English —** Manhwadle is a daily character-guessing game (Wordle-like) set in five Korean web novels / webtoons.
> Each guess is compared to the mystery character across 9 categories. It ships as a desktop app (Electron, sandboxed,
> built for Windows, macOS and Linux by GitHub Actions) and as a browser version on GitHub Pages. The UI is an original
> art direction inspired by the "system window" look of *Omniscient Reader's Viewpoint*. Personal fan project by
> [Kilian Monnier](https://github.com/Kureo524), game developer (Unity / Unreal).

> [Un nouveau scénario est arrivé.]
>
> **Condition de réussite :** identifier l'incarnation mystère.
> **Échec :** ???

Manhwadle est un jeu de déduction standalone (Electron), dans la veine des « -dle ». Le but : retrouver
un personnage de manhwa. À chaque essai, ton personnage est comparé au personnage mystère sur
9 catégories, et les constellations du Star Stream commentent ta progression.

![Une partie en cours](Docs/captures/partie.webp)

**Histoires disponibles** — 107 incarnations :

| Tag | Manhwa | Persos |
|---|---|---|
| `@ORV` | Omniscient Reader's Viewpoint | 22 |
| `@TWATF` | The World After The Fall | 18 |
| `@TBATE` | The Beginning After The End | 29 |
| `@Reinc` | Reincarnator | 10 |
| `@SESM` | Star-Embracing Swordmaster | 28 |

---

## Le scénario

Deux modes, présentés comme des scénarios du Star Stream :

- **Scénario principal — Le personnage du jour** : la même incarnation pour tout le monde, tirée parmi
  les 107. Le temps limite est minuit, heure locale.
- **Scénario secondaire — Incarnation inconnue** : mode infini. Tu choisis les histoires en jeu ;
  plus il y en a, plus la difficulté monte (de D à S).

La fenêtre de scénario affiche la catégorie, la difficulté, la condition de réussite, le temps
limite, la récompense et l'échec. L'indice (une silhouette floutée) se débloque à 6 essais et
devient presque net à 10.

**Série** : chaque perso du jour trouvé prolonge ta série de jours consécutifs ; un jour sauté ou un
échec la rompt. La fenêtre de scénario affiche la série en cours et ton record.

**Partager** : en fin de partie, « Partager le résultat » copie dans le presse-papiers une image de la
partie (fenêtre de scénario et essais) dans l'appli de bureau, ou une grille de carrés de couleur sur le site.

**Compte** : l'onglet « Compte » connecte le jeu à Discord. La série du perso du jour est alors vérifiée
par le serveur, retrouvée sur le site comme dans l'appli, et inscrite à l'onglet « Classement ». Sans compte,
tout reste sur l'appareil.

**Récompense** : 1 000 pièces au premier essai, puis 100 de moins par essai supplémentaire
(100 au minimum). Les pièces s'additionnent dans tes statistiques.

### Lecture des cases

| Case | Signification |
|---|---|
| Verte | même valeur |
| Jaune | au moins une valeur en commun, ou chapitre à 10 près |
| Rouge | aucune valeur en commun |
| Pointillés | donnée encore inconnue : pas de verdict |

Les 9 catégories : manhwa, genre, rôle, espèce, affiliation, pouvoir, statut, chapitre de
1re apparition dans le webtoon (une flèche indique s'il faut viser plus tôt ou plus tard),
cheveux.

### Nommer une incarnation

![Recherche par manhwa](Docs/captures/recherche.webp)

- Tape un nom : la recherche ignore les accents et place en tête les noms qui commencent par ta saisie.
- `@` liste les manhwa ; `@ORV` liste tous les persos d'ORV pas encore proposés ; `@ORV kim`
  cherche uniquement dans ORV. Un début de tag suffit (`@tb`, `@rein`, `@stellar`).
- Le grand aperçu à droite de la liste montre le portrait du personnage surligné.
- Clavier : ↑ ↓ pour naviguer, Entrée pour valider, Tab pour compléter un tag, Échap pour fermer.

### Les constellations

À chaque essai, une constellation réagit selon le nombre de cases justes : de « bâille » à
« retient son souffle ». Les constellations sont inventées pour le jeu.

---

## Direction artistique

La base est **« Verre d'encre »** (`Docs/DA/DA-Verre-d-encre.md`) : jetons de couleur bleu-nuit,
accent unique `#8aa8e0`, polices Gothic A1 / Barlow Condensed / IBM Plex Mono, rouge, jaune et
vert réservés aux verdicts.

Le jeu l'interprète librement, dans l'ambiance d'ORV :

- **Fenêtre transparente** : sous Hyprland (Caelestia), le fond d'écran flouté passe à travers.
  Un voile léger garde le texte lisible.
- **Pas de gros panneaux** : onglets texte, recherche en simple ligne, essais posés sur le fond.
- **Une seule fenêtre système**, celle du scénario : liseré bleu, coins en équerre, fond presque
  transparent.
- **Ton « roman »** : messages système entre crochets, en mono (`[Échec du scénario.]`).
- **Ciel de constellations** animé discrètement, et reflet du curseur sur la fenêtre de scénario.

---

## Ce que j'ai construit

| Domaine | Réalisation |
|---|---|
| **Gameplay** | Boucle de jeu « -dle » complète : deux modes, comparaison sur 9 catégories (exact / partiel / proximité de chapitre), indice progressif, statistiques, économie de pièces |
| **Logique testée** | Module pur sans DOM (`src/logic.js`) : comparaison, tirage du jour déterministe (hachage FNV-1a), recherche avec tags `@` ; tests `node:test` qui valident aussi les 107 fiches et l'absence de portraits en double |
| **Données** | Pipeline depuis les API MediaWiki des wikis Fandom, galerie + import des portraits (ImageMagick → WebP 320×320), crédits par image |
| **UI / DA** | Direction artistique originale « Verre d'encre », réinterprétée façon fenêtres système d'ORV : fenêtre transparente sous Hyprland, ciel de constellations animé en canvas, reflet du curseur, réactions des constellations |
| **Application** | Electron 45 en bac à sable (données via IPC, navigation bloquée, permissions refusées, fuses), une seule page partagée avec la version web |
| **Serveur** | API serverless Cloudflare Workers + D1 (SQLite) : connexion Discord OAuth2, sessions par jeton dont seul le SHA-256 est stocké, partie du jour **recalculée côté serveur** à partir de la même `src/logic.js` (impossible de tricher sur sa série), classement, suppression du compte |
| **CI / livraison** | GitHub Actions : builds natifs Windows / macOS / Linux sur chaque PR, publication des binaires et de leurs empreintes SHA-256 sur tag, déploiement GitHub Pages ; actions épinglées par SHA |
| **Méthode** | Branches par feature, PR vers `dev`, `main` pour les versions validées, commits atomiques |

---

## Lancer le jeu

```bash
npm install
npm install-scripts approve electron   # npm ≥ 12 bloque les scripts d'installation
npm start
```

**Mises à jour** : l'appli de bureau vérifie au lancement s'il existe une release plus récente sur GitHub,
télécharge en arrière-plan seulement ce qui a changé, et s'installe à la fermeture (ou tout de suite avec
« [Redémarrer maintenant] »). Windows (installateur) et Linux (AppImage) ; pas sur macOS, qui refuse la
mise à jour automatique d'une appli non signée. Une seule instance de l'appli peut être ouverte à la fois.

Pour publier une mise à jour : augmenter `version` dans `package.json`, fusionner dans `main`, puis poser
le tag `vX.Y.Z` : la CI construit et publie les binaires et leurs fichiers de mise à jour.

Exécutable Linux : `npm run dist` → `dist/Manhwadle-<version>.AppImage` (nécessite `fuse2`).

**Serveur** : l'API de connexion et de classement vit dans `server/` (`npm test` pour sa logique,
`npx wrangler deploy` pour la publier).

## Commandes

| Commande | Rôle |
|---|---|
| `npm start` | lance le jeu |
| `npm run site` | assemble la version navigateur dans `site/` |
| `npm test` | logique du jeu, validation des données, portraits sans doublon |
| `npm run dist` | construit l'AppImage |
| `npm run portraits:galerie` | page des portraits manquants, à enregistrer depuis le navigateur |
| `npm run portraits:import` | importe `assets/inbox/<id>.<ext>` en portraits WebP |

### Outils de développement

- **Capture hors écran** : `npx electron tools/screenshot.cjs capture.png endless kim-dokja,vlad`
  (`TYPE="@orv"` pré-remplit la recherche, `SKIP=1` abandonne la partie).
- **Mode démo du build** : `MANHWADLE_DEMO="kim-dokja,vlad" MANHWADLE_TYPE="@orv" ./Manhwadle.AppImage`
  rejoue des essais. Il ne touche ni aux parties ni aux statistiques du joueur.

## Workflow git

- `main` : versions validées (protégée, PR obligatoire)
- `dev` : intégration (protégée, PR obligatoire, branche par défaut)
- `feature/<sujet>` : une branche par feature, PR vers `dev`

## Crédits et droits

> [Ce scénario est une œuvre de fan.]

Manhwadle est un projet de fan **gratuit et non commercial**, sans lien avec les auteurs, illustrateurs
ou éditeurs des œuvres citées.

- **Œuvres, personnages et illustrations** : © leurs auteurs, illustrateurs et éditeurs respectifs
  (Omniscient Reader's Viewpoint, The World After The Fall, The Beginning After The End,
  Reincarnator, Star-Embracing Swordmaster).
- **Portraits** : issus des wikis Fandom des œuvres ; la source de chaque image est listée dans
  [`data/credits.json`](data/credits.json).
- **Fiches des personnages** : établies d'après les wikis communautaires
  ([ORV](https://omniscient-readers-viewpoint.fandom.com), [TWATF](https://the-world-after-the-fall.fandom.com),
  [TBATE](https://tbate.fandom.com), [Reincarnator](https://reincarnator.fandom.com),
  [SESM](https://starembracing-swordmaster.fandom.com)), dont les textes sont sous licence
  [CC BY-SA](https://www.fandom.com/licensing).
- **Polices** : Gothic A1, Barlow Condensed et IBM Plex Mono, sous licence SIL Open Font License 1.1
  (textes des licences dans [`assets/fonts`](assets/fonts)).

**Demande de retrait** : si vous êtes ayant droit et souhaitez qu'un contenu soit retiré,
[ouvrez une issue](https://github.com/Kureo524/Manhwadle/issues/new) ; il sera retiré rapidement.
