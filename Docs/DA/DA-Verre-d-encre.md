# Direction artistique « Verre d'encre »

> Système de design extrait de **Forge Studio** (outils éditeur Unity de DungeonCrawlerTools).
> Ce document est autonome : une autre instance de Claude doit pouvoir reproduire la DA dans n'importe
> quel projet (web, Unity UI Toolkit, desktop…) sans avoir accès au code source.
> Source de vérité d'origine : `Assets/_Project/Editor/Styles/Forge.uss`, `ForgeSky.cs`, `ForgeSkyAnimation.cs`, `GlassLight.cs`.

---

## 1. L'idée en une phrase

Des **panneaux de verre translucides** posés sur un **ciel de constellations nocturne**, dans une palette
**froide bleu-nuit** inspirée des illustrations du roman *Omniscient Reader's Viewpoint* (ORV) : blancs froids,
gris violacés, et deux teintes fines — **lavande** et **vert trèfle** — utilisées avec parcimonie.

Ambiance : calme, nocturne, « fenêtre système » d'un roman — pas un tableau de bord SaaS.

## 2. Principes non négociables

1. **Un seul thème, sombre (« Encre »).** Pas de thème clair (jugé fatigant pour les yeux). Ne pas en proposer.
2. **Une seule couleur d'accent : bleu froid `#8aa8e0`.** Rouge, jaune et vert sont **réservés aux états** (erreur, alerte, succès), jamais à la décoration.
3. **Lavande et vert = accents fins uniquement** (petits points, liens de constellation, lumières du fond). Jamais en aplat.
4. **Le verre, c'est : fond translucide + liseré clair en haut et à gauche** (la lumière vient du haut-gauche). Bords bas/droite plus discrets.
5. **Formes souples** : grands rayons, boutons quasi-capsules, rien d'anguleux.
6. **Une seule lumière qui suit le curseur**, visible uniquement sur le verre situé sous le curseur.
7. **Catégories plutôt que longue page qui défile** : contrôle segmenté pour découper un contenu dense.

### Interdits (« AI slop »)
- Pas de **glow** / ombres lumineuses colorées.
- Pas de **dégradés** décoratifs sur les boutons ou cartes.
- Pas de **cartes à bordure latérale colorée** comme décoration (exception tolérée : indicateur d'état d'une statistique).
- Pas de **petites capitales espacées** (tracked caps) en guise de titres/étiquettes.
- Pas d'emoji en guise d'icônes.
- Faire une recherche de références **avant** de designer, ne pas improviser un style générique.

---

## 3. Couleurs (jetons)

| Jeton | Valeur | Usage |
|---|---|---|
| `--bg` | `#0e0e13` (fenêtre : `#0c0c12`) | Fond derrière le ciel |
| `--glass` (bg-sidebar) | `rgba(30, 30, 40, 0.42)` | Verre « léger » : navigation, en-têtes, barres, segmenté |
| `--surface` | `rgba(22, 22, 30, 0.62)` | Verre « plein » : sections, cartes, fiche |
| `--surface-raised` | `rgba(232, 238, 250, 0.06)` | Boutons, éléments surélevés |
| `--hover` | `rgba(232, 238, 250, 0.06)` | Survol des lignes |
| `--border` | `rgba(232, 238, 250, 0.09)` | Bordure par défaut |
| `--border-strong` | `rgba(232, 238, 250, 0.17)` | Bordure au survol, boutons |
| `--rim` | `rgba(232, 238, 250, 0.24)` | **Liseré de lumière** (haut + gauche du verre) |
| `--input` | `rgba(10, 10, 15, 0.62)` (focus : `0.8`) | Champs de saisie |
| `--canvas` | `rgba(10, 10, 15, 0.72)` | Zones de travail (graphes, plans) |
| `--text` | `#e8eefa` | Texte principal (blanc froid) |
| `--text-2` | `#a3a6b6` | Libellés, texte secondaire |
| `--text-3` | `#8a8a9c` | Aides, méta, placeholders |
| `--accent` | `#8aa8e0` | Accent unique (focus, remplissage, sélection) |
| `--accent-hover` | `#9dbdff` | |
| `--accent-soft` | `rgba(138, 168, 224, 0.16)` | Fond d'élément sélectionné / actif |
| `--accent-text` | `#a9c4f0` | Texte accentué (titres système, survol de titre) |
| `--accent-tint` | `rgba(138, 168, 224, 0.50)` (hover `0.64`) | Bouton principal (verre teinté bleu) |
| `--lavender` | `#a597c0` / soft `rgba(165,151,192,0.16)` | Accent fin |
| `--success` | `#9ebd85` / soft `rgba(158,189,133,0.14)` | État OK (vert trèfle) |
| `--warning` | `#e7b52f` / soft `rgba(231,181,47,0.12)` | État alerte |
| `--danger` | `#e0606a` / soft `rgba(224,96,106,0.13)` | État erreur |

Règle : toutes les teintes claires translucides partent du **même blanc froid `rgb(232, 238, 250)`** avec une opacité variable — c'est ce qui donne la cohérence « verre ».

### Graphiques
Palette catégorielle (version sombre, validée daltonisme/contraste), ordre fixe, max 8 séries (au-delà → « Autres ») :
`#3987e5 #d95926 #199e70 #c98500 #d55181 #008300 #9085e9 #e66767`
- Neutre (« Rien », « Autres », comparaison) : `rgb(140, 140, 135)`
- Grille `rgba(255,255,255,0.07)` · Axes `rgba(255,255,255,0.22)` · Piste `rgba(255,255,255,0.08)`
- Statuts (jamais pour des séries) : bon `#0ca30c`, alerte `#fab219`, critique `#d03b3b`
- Fond de tracé : `rgba(10,10,15,0.5)`, rayon 14. Libellés d'axes en mono.

---

## 4. Typographie (toutes sous licence OFL, Google Fonts)

| Rôle | Police | Exemples |
|---|---|---|
| Texte courant | **Gothic A1** Regular, 12px | corps, libellés, champs, menus |
| Titres | **Gothic A1** Bold | titre de page, titre de section (13px), titre de fiche (17px), nom d'élément |
| Grands nombres | **Barlow Condensed** SemiBold | valeur d'une stat (26px, compact 18px), niveaux, totaux |
| Système / données | **IBM Plex Mono** Regular | messages système, valeurs alignées, noms de fichiers, statut, axes de graphes (10–12px) |

Tailles : 10px (méta, badges), 11px (aides, descriptions), 12px (base), 13px (titres de section), 15px (titre de courbe), 17px (titre de fiche).
Pas de capitales forcées, pas de letter-spacing.

### Ton « roman » (ORV)
- Les **messages système** s'écrivent **entre crochets**, en mono, couleur `--accent-text` : `[Le niveau 12 est inaccessible.]`
- Les blocs d'information « système » sont des **fenêtres de statut** : cadre fin bleuté
  (`border rgba(138,168,224,0.28)`, haut/gauche `0.45`), fond `rgba(16,20,32,0.55)`, rayon 12.

---

## 5. Le verre

```css
.glass {
  overflow: hidden;                         /* pour découper le reflet du curseur */
  border: 1px solid var(--border);
  border-top-color: var(--rim);             /* la lumière vient du haut-gauche */
  border-left-color: var(--rim);
  background: var(--surface);               /* ou var(--glass) pour le verre léger */
  border-radius: 18px;
  /* Web uniquement, optionnel : backdrop-filter: blur(18px) saturate(1.2); */
}
```

- Unity UI Toolkit n'a **pas de `backdrop-filter`** : le verre y est uniquement translucidité + liserés. Sur le web, un flou d'arrière-plan léger est autorisé mais pas obligatoire — le rendu doit tenir sans.
- Deux épaisseurs : **verre léger** (`--glass`, 0.42) pour la structure (navigation, en-têtes, barre d'actions, groupes segmentés) ; **verre plein** (`--surface`, 0.62) pour le contenu (sections, cartes, fiches).
- Tooltips et menus déroulants : verre presque opaque `rgba(23,23,30,0.94–0.97)`, bordure `--border-strong` + liseré.
- Panneaux espacés de **12px** ; fenêtre avec 12px de marge intérieure → les panneaux « flottent » sur le ciel.

### Reflet du curseur
- Un **unique** halo blanc de 360×360px, dégradé radial : `alpha = 0.09 × (1 − d)²` (d = distance normalisée au centre).
- Il est inséré **dans** le panneau de verre le plus imbriqué sous le curseur, derrière son contenu, au-dessus de son fond ; découpé par `overflow: hidden`.
- Opacité 0 → 1 en 0.25s ; disparaît dès que le curseur quitte le verre. Ne capte pas les clics.

```js
// Web : un seul élément .glass-light déplacé vers le .glass sous le pointeur
// background: radial-gradient(circle, rgba(255,255,255,.09) 0%, rgba(255,255,255,0) 70%);
```

---

## 6. Le ciel (fond)

Généré, aucun fichier image.

**Couche statique** (texture 1280×800, `scale-and-crop`) :
- Fond `rgb(12, 12, 18)`.
- Trois lumières froides diffuses (position relative x,y · rayon relatif · intensité au centre, décroissance linéaire) :
  - bleu `#8aa8e0` en haut-gauche (0.12, 0.18) · r 0.42 · 0.31
  - lavande `#a597c0` en haut-droite (0.88, 0.12) · r 0.36 · 0.25
  - vert `#9ebd85` en bas (0.60, 1.00) · r 0.42 · 0.19
- Étoiles : ~1 pour 2400px², rayon 0.3–1.6px, couleur `#e8eefa`, opacité 0.2–0.65, graine fixe (toujours le même ciel).
- Constellation : jusqu'à 14 étoiles brillantes reliées par des traits de 1px à 16% d'opacité (seulement si proches).

**Couche animée** (au-dessus, sous le verre ; 20 i/s, en pause quand invisible) :
- 70 étoiles qui scintillent : opacité `0.12 + 0.5 × twinkle`, taille ×(0.8–1.2), vitesses et phases aléatoires.
- Une constellation de 6 étoiles en lavande, dont les liens respirent : opacité 0.08 → 0.20, période ~16s.
- Une étoile filante toutes les 7–14s dans le tiers haut : traînée de 140px, 1.3s, couleur `rgb(201,214,245)`, fondu sinusoïdal.

Tout reste **très discret** : le ciel est une ambiance, jamais un élément qu'on remarque en premier.

---

## 7. Formes et rayons

Rayons fixes (attention : au-delà de la moitié de la hauteur, Unity dessine une ellipse — rester en dessous) :

| Rayon | Éléments |
|---|---|
| 3 | poignée de barre de défilement |
| 6–8 | badges, pastilles de couleur, items de menu |
| 10 | boutons, champs, éléments d'un segmenté |
| 12 | lignes de liste, éléments de navigation, problèmes, fenêtres de statut, HelpBox |
| 14 | groupe segmenté, tooltip, tracé de graphe, statut latéral |
| 16 | barre de validation flottante |
| 18 | sections, cartes, zones de travail |
| 22 | grands panneaux (navigation latérale, en-tête, liste, fiche, tiroir d'aide) |

---

## 8. Composants

**Boutons** — hauteur 28, padding 0 14px, rayon 10.
- Normal : fond `--surface-raised`, bordure `--border-strong` + liseré haut/gauche ; survol `rgba(232,238,250,0.11)`.
- Principal : **verre teinté bleu** `--accent-tint`, bordure `rgba(255,255,255,0.32)` (survol 0.45), texte blanc. Pas d'aplat d'accent saturé.
- Discret : transparent, texte `--text-2` ; survol `--accent-soft` + `--text`.
- Danger : transparent, texte `--danger` ; survol `--danger-soft`.
- Icône : carré 26px, symbole centré.

**Champs** — hauteur 26, padding 2px 10px, rayon 10, fond `--input`, bordure `--border` → `--border-strong` au survol → `--accent` au focus (fond 0.8). Transition 0.12s sur la bordure. Libellés en `--text-2`, centrés verticalement sur le champ.

**Curseur (slider)** — piste fine 4px rayon 2 `rgba(232,238,250,0.12)`, remplissage `--accent`, poignée ronde 16px blanche `#e8eefa` bordure `rgba(255,255,255,0.55)`. Champ numérique 52px à droite.

**Barres de défilement** — 10px, sans flèches, piste invisible, poignée `rgba(232,238,250,0.18)` (survol 0.3), rayon 3. Ne jamais leur donner le style des sliders.

**Contrôle segmenté (catégories / vues)** — groupe en verre léger, padding 4, rayon 14. Items transparents `--text-2` (survol `--text`). L'item actif est marqué par une **pastille de verre qui glisse** (`--accent-soft` + liseré, rayon 10) : transition `left, width` 0.32s `ease-out-back`. Compteur optionnel en 10px `--text-3`.

**Navigation latérale** — panneau verre léger rayon 22 ; items rayon 12 ; item actif `--accent-soft` + liseré haut/gauche. Marque/logo sur pastille `--accent-tint` rayon 10.

**Liste + fiche** — liste en verre léger (rayon 22, min 200px), lignes rayon 12 espacées ; sélection `--accent-soft` + liseré. Fiche : en-tête en verre plein rayon 22 (aperçu 60×60 rayon 10, titre 17px bold), puis sections.

**Sections** — verre plein, rayon 18, padding 14px 16px, marge basse 12. Titre 13px Gothic A1 Bold, description 11px `--text-2`. Repliables : chevron 14px `--text-3`, titre → `--accent-text` au survol.

**Cartes** — verre plein rayon 18 ; cliquables : bordure `--accent` + `translate: 0 -2px` au survol (0.15s ease-out). Grilles en flex-wrap, base 220px (large 420px).

**Statistiques** — titre 11px `--text-2`, valeur Barlow Condensed 26px. Seule exception tolérée à la bordure latérale : 3px de couleur d'**état**.

**Badges** — pastille teintée (fond `*-soft`, bordure fine), **point de couleur 6px** + texte neutre 10px bold. Rayon 8.

**Barre de validation** — **capsule de verre flottante centrée** en bas (rayon 16, padding 6px 6px 6px 16px) : statut en mono à gauche, boutons à droite.

**HelpBox / messages** — panneau rayon 12 teinté par l'état (fond `*-soft`, bordure couleur d'état à 30%).

**Menus déroulants** — verre opaque 0.97, rayon 12, padding 4 ; items 26px rayon 8, survol `--accent-soft`, coche `--accent`.

**Zones de travail** (graphes, plans) — verre sombre `--canvas`, rayon 18, liseré — jamais un aplat noir.

---

## 9. Mouvement

- Survols : 0.12–0.15s sur bordure/fond.
- Reflet du curseur : opacité 0.25s.
- Segmenté : 0.32s `ease-out-back` (léger rebond).
- Barres et jauges : **grandissent à l'ouverture** du panneau, 0.45s `ease-out-cubic`.
- Ciel : animation lente et continue, jamais rapide.

---

## 10. Démarrage rapide (CSS web)

```css
@import url('https://fonts.googleapis.com/css2?family=Gothic+A1:wght@400;700&family=Barlow+Condensed:wght@600&family=IBM+Plex+Mono&display=swap');

:root {
  color-scheme: dark;
  --bg:#0e0e13; --glass:rgba(30,30,40,.42); --surface:rgba(22,22,30,.62);
  --surface-raised:rgba(232,238,250,.06); --hover:rgba(232,238,250,.06);
  --border:rgba(232,238,250,.09); --border-strong:rgba(232,238,250,.17); --rim:rgba(232,238,250,.24);
  --input:rgba(10,10,15,.62); --canvas:rgba(10,10,15,.72);
  --text:#e8eefa; --text-2:#a3a6b6; --text-3:#8a8a9c;
  --accent:#8aa8e0; --accent-hover:#9dbdff; --accent-soft:rgba(138,168,224,.16);
  --accent-text:#a9c4f0; --accent-tint:rgba(138,168,224,.5);
  --lavender:#a597c0; --success:#9ebd85; --warning:#e7b52f; --danger:#e0606a;
  --font:'Gothic A1',sans-serif; --font-num:'Barlow Condensed',sans-serif; --font-mono:'IBM Plex Mono',monospace;
}
body { margin:0; padding:12px; background:#0c0c12; color:var(--text); font:12px/1.5 var(--font); }
.glass { position:relative; overflow:hidden; border:1px solid var(--border);
  border-top-color:var(--rim); border-left-color:var(--rim); background:var(--surface); border-radius:18px; }
.glass--light { background:var(--glass); border-radius:22px; }
.btn { height:28px; padding:0 14px; border-radius:10px; border:1px solid var(--border-strong);
  border-top-color:var(--rim); border-left-color:var(--rim); background:var(--surface-raised); color:var(--text);
  transition:background-color .12s, border-color .12s; }
.btn:hover { background:rgba(232,238,250,.11); }
.btn--primary { background:var(--accent-tint); border-color:rgba(255,255,255,.32); color:#fff; }
.btn--primary:hover { background:rgba(138,168,224,.64); border-color:rgba(255,255,255,.45); }
.input { height:26px; padding:2px 10px; border-radius:10px; border:1px solid var(--border);
  background:var(--input); color:var(--text); transition:border-color .12s; }
.input:hover { border-color:var(--border-strong); }
.input:focus { outline:none; border-color:var(--accent); background:rgba(10,10,15,.8); }
.system { font-family:var(--font-mono); color:var(--accent-text); } /* « [Message système.] » */
.big-number { font-family:var(--font-num); font-weight:600; font-size:26px; }
```

Pour un projet Unity UI Toolkit : mêmes jetons dans un bloc de variables USS, `-unity-font-definition` pour les polices,
pas de `backdrop-filter`, ciel en `Texture2D` générée + `VisualElement` animé via `Painter2D`.

---

## 11. Checklist avant de livrer une UI

- [ ] Fond sombre uniquement, ciel discret visible à travers le verre.
- [ ] Chaque panneau a son liseré clair haut/gauche.
- [ ] Une seule couleur d'accent ; rouge/jaune/vert uniquement pour des états.
- [ ] Lavande/vert seulement en touches fines.
- [ ] Rayons pris dans l'échelle (6/10/12/14/16/18/22).
- [ ] Trois polices aux bons rôles ; messages système en mono entre crochets.
- [ ] Aucun glow, dégradé décoratif, bordure latérale décorative ni tracked caps.
- [ ] Contenu dense découpé en catégories (segmenté) plutôt qu'en longue page.
