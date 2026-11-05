// Traductions de l'interface (français, anglais).
// - Langue : choix enregistré du joueur, sinon celle du système / navigateur (français si elle
//   commence par « fr », anglais sinon).
// - Les valeurs des fiches (data/characters.json) sont écrites en français : elles servent aussi
//   de clés de comparaison et ne changent jamais ; seul leur affichage est traduit (VALUES_EN).
// - Les noms propres (personnages, manhwa, la plupart des affiliations) restent tels quels.
(function () {
  'use strict';
  const LANGS = ['fr', 'en'];
  const KEY = 'manhwadle.lang';

  const s = (n) => (n > 1 ? 's' : '');
  const days = { fr: (n) => `jour${s(n)}`, en: (n) => `day${n === 1 ? '' : 's'}` };

  const STRINGS = {
    fr: {
      'brand.channel': 'Star Stream · canal #MW-0107',
      'tab.daily': 'Perso du jour',
      'tab.endless': 'Infini',
      'tab.ranking': 'Classement',
      'tab.account': 'Compte',
      'nav.label': 'Mode de jeu',
      'search.label': 'Nom du personnage',
      'search.placeholder': 'Nomme une incarnation…  (@ORV pour lister un manhwa)',
      'search.doneDaily': 'Le prochain scénario commence à minuit UTC.',
      'search.doneEndless': 'Scénario terminé.',
      'giveUp': 'Abandonner',
      'legend.label': 'Lecture des cases',
      'legend.ok': 'exact',
      'legend.partial': 'partiel · chapitre à 10 près',
      'legend.no': 'faux',
      'legend.unknown': 'inconnu',
      'legend.tip': '@ORV liste un manhwa',
      'quit': '[Quitter]',
      'quit.title': 'Quitter (Ctrl+Q)',
      'pool': ({ n, stories }) => `[${n} incarnations · ${stories} histoires]`,

      'col.character': 'Personnage',
      'col.manhwa': 'Manhwa', 'col.gender': 'Genre', 'col.role': 'Rôle', 'col.species': 'Espèce',
      'col.affiliations': 'Affiliation', 'col.powers': 'Pouvoir', 'col.status': 'Statut',
      'col.chapter': '1re apparition', 'col.hair': 'Cheveux',
      'cell.later': 'Apparaît plus tard',
      'cell.earlier': 'Apparaît plus tôt',
      'grid.empty': 'Aucune incarnation nommée pour l\'instant.',

      'constellations': [
        'Lectrice des dernières pages', 'Démon aux mille masques', 'Prisonnier de la tour sans fin',
        'Juge des braises', 'Gardien des histoires oubliées', 'Conteur sans nom', 'Épéiste qui compte les étoiles',
      ],
      'react.win': 'Toutes les constellations applaudissent.',
      'react.close': ['retient son souffle.', 'se penche vers l\'écran.', 'murmure que vous y êtes presque.'],
      'react.story': ['a reconnu cette histoire.', 'hoche lentement la tête.'],
      'react.warm': ['s\'intéresse à votre choix.', 'vous fait signe de continuer.'],
      'react.lukewarm': ['penche la tête, perplexe.', 'feuillette un autre chapitre.'],
      'react.cold': ['bâille.', 'détourne le regard.', 'trouve ce choix audacieux.'],
      'feed.constellation': ({ who, text }) => [`[La constellation `, `« ${who} »`, ` ${text}]`],
      'feed.streakAtStake': ({ n }) => `Votre série de ${n} ${days.fr(n)} est en jeu. Le scénario se termine à minuit UTC.`,
      'feed.lost': 'Les constellations sont déçues.',
      'feed.coins': ({ n }) => `${n} pièces ont été sponsorisées.`,
      'feed.record': ({ n }) => `Nouveau record : ${n} jours consécutifs.`,
      'feed.streak': ({ n }) => `Série : ${n} ${days.fr(n)}.`,
      'feed.broken': 'La série est rompue.',

      'sc.titleDaily': '[Scénario principal — Le personnage du jour]',
      'sc.titleEndless': '[Scénario secondaire — Incarnation inconnue]',
      'sc.won': '[Le scénario principal est terminé.]',
      'sc.lost': '[Échec du scénario.]',
      'sc.category': 'Catégorie', 'sc.main': 'Principal', 'sc.side': 'Secondaire',
      'sc.difficulty': 'Difficulté',
      'sc.goal': 'Condition de réussite',
      'sc.goalText': ({ n }) => `Identifier le personnage mystère parmi ${n} incarnations.`,
      'sc.timeLimit': 'Temps limite',
      'sc.untilMidnight': ({ time }) => `${time} (minuit UTC)`,
      'daily.loading': '[Connexion au scénario du jour…]',
      'daily.lockedTitle': '[Scénario principal — Compte requis]',
      'daily.lockedText': 'Le perso du jour se joue avec un compte Discord : une partie par jour, décidée par le serveur, et ta série au classement. Le mode Infini reste libre, sans compte et hors ligne.',
      'daily.offlineTitle': '[Star Stream injoignable]',
      'daily.offlineText': 'Le perso du jour a besoin du serveur, qui ne répond pas. Réessaie plus tard, ou joue en mode Infini en attendant.',
      'daily.retry': '[Réessayer]',
      'daily.playEndless': '[Jouer en mode Infini]',
      'daily.update': 'Ce personnage est inconnu du serveur : mets le jeu à jour.',
      'daily.sendFailed': 'Essai non envoyé : le serveur ne répond pas. Réessaie.',
      'search.dailyGated': 'Perso du jour indisponible',
      'sc.none': 'Aucun',
      'sc.reward': 'Récompense', 'sc.coins': 'pièces', 'sc.noReward': 'aucune',
      'sc.failure': 'Échec', 'sc.giveUp': 'Abandon',
      'sc.guesses': 'Essais',
      'sc.next': 'Prochain scénario', 'sc.in': ({ time }) => `dans ${time}`,
      'sc.streak': 'Série',
      'sc.noStreak': 'aucune en cours',
      'sc.noStreakBest': ({ best }) => `aucune en cours · record ${best} ${days.fr(best)}`,
      'sc.streakRun': ({ n, best }) => `${days.fr(n)} consécutif${s(n)} · record ${best}`,
      'sc.share': '[Partager le résultat]',
      'sc.imageCopied': '[Image copiée.]',
      'sc.textCopied': '[Résultat copié.]',
      'sc.copyFailed': '[Copie impossible.]',
      'sc.nextScenario': '[Scénario suivant]',
      'hint.blurry': ({ at }) => `[Indice : silhouette floue. Plus nette à ${at} essais.]`,
      'hint.clear': '[Indice : silhouette presque nette.]',
      'hint.none': '[Pas d\'image d\'indice pour ce scénario.]',
      'hint.locked': ({ n }) => `[Indice dans ${n} essai${s(n)}.]`,
      'time': ({ h, m }) => `${h} h ${m}`,

      'stats.played': 'Scénarios', 'stats.won': 'Réussis', 'stats.streak': 'Série', 'stats.best': 'Record',
      'stats.avg': 'Essais moyens', 'stats.coins': 'Pièces',
      'filter.remove': 'retirer de la partie', 'filter.add': 'ajouter à la partie',

      'sugg.filter': 'Filtrer par manhwa',
      'sugg.count': ({ title, n }) => `${title} · ${n} personnage${s(n)}`,
      'sugg.noManhwa': 'Aucun manhwa ne correspond.',
      'sugg.noChar': 'Aucun personnage ne correspond.',
      'sugg.left': ({ n }) => `${n} persos`,

      'update.downloading': ({ v }) => `[Une mise à jour${v} est en cours de téléchargement.]`,
      'update.ready': ({ v }) => `[La mise à jour${v} est prête. Elle s'installera à la fermeture.]`,
      'update.restart': '[Redémarrer maintenant]',

      'acc.login': '[Se connecter]',
      'acc.loginTitle': 'Se connecter avec Discord : série synchronisée et classement',
      'acc.connecting': '[Connexion…]',
      'acc.me': 'Mon compte',
      'acc.titleOut': '[Connexion à la Star Stream]',
      'acc.intro': 'Connecte-toi avec Discord : le perso du jour se joue sur le serveur, '
        + 'ta partie te suit sur le site comme dans l\'appli, et ta série entre au classement : ton pseudo et ton avatar y sont publics. Sans compte, le mode Infini reste libre.',
      'acc.loginDiscord': '[Se connecter avec Discord]',
      'acc.cancel': '[Annuler]',
      'acc.connectingServer': 'Connexion au serveur…',
      'acc.titleIn': '[Fiche de l\'incarnation]',
      'acc.sub': 'Connecté avec Discord · série synchronisée entre le site et l\'appli',
      'acc.streak': 'Série en cours', 'acc.best': 'Record', 'acc.won': 'Scénarios réussis',
      'acc.outOf': ({ n }) => `sur ${n}`, 'acc.avg': 'Essais moyens', 'acc.last': 'Dernier scénario',
      'acc.lastValue': ({ n, date }) => `n° ${n} (${date})`, 'acc.never': 'aucun',
      'acc.days': ({ n }) => days.fr(n),
      'acc.logout': '[Se déconnecter]',
      'acc.delete': '[Supprimer mon compte]',
      'acc.deleteConfirm': '[Confirmer : tout supprimer]',
      'acc.note': 'Données gardées sur le serveur : ton identifiant, ton pseudo et ton avatar Discord, et pour chaque perso du jour '
        + 'la date, le nombre d\'essais et la réussite. Rien d\'autre n\'est lu sur ton compte Discord. '
        + 'Supprimer le compte efface tout, définitivement.',
      'acc.language': 'Langue',
      'msg.loginWindow': 'Connexion dans la fenêtre Discord… (Échap pour la fermer)',
      'msg.loginRedirect': 'Connexion à Discord…',
      'msg.loginApp': ({ code }) => `Code de connexion : ${code}. Vérifie que la page qui vient de s'ouvrir affiche le même, connecte-toi, puis reviens ici. (Touche [Connexion…] pour la rouvrir.)`,
      'msg.sessionExpired': 'Session expirée : reconnecte-toi.',
      'msg.offline': 'Serveur injoignable pour l\'instant.',
      'msg.loggedOut': 'Déconnecté. Ta série reste sur cet appareil.',
      'msg.deleted': 'Compte supprimé : toutes tes données en ligne ont été effacées.',
      'msg.deleteFailed': 'Suppression impossible pour l\'instant. Réessaie plus tard.',
      'login.annule': 'Connexion annulée.',
      'login.expire': 'La demande de connexion a expiré. Réessaie.',
      'login.erreur': 'Discord n\'a pas pu confirmer la connexion. Réessaie.',

      'rank.title': '[Classement des incarnations — Perso du jour]',
      'rank.intro': 'Meilleures séries de scénarios principaux réussis. Chaque partie est vérifiée par le serveur.',
      'rank.loading': '[Chargement du classement…]',
      'rank.error': '[Classement injoignable pour l\'instant.]',
      'rank.empty': '[Aucune incarnation classée pour l\'instant. Réussis le perso du jour pour ouvrir le classement.]',
      'rank.head': ['#', 'Incarnation', 'Record', 'Série', 'Réussis', 'Essais moyens'],
      'rank.join': '[Se connecter pour apparaître au classement]',
    },

    en: {
      'brand.channel': 'Star Stream · channel #MW-0107',
      'tab.daily': 'Daily character',
      'tab.endless': 'Endless',
      'tab.ranking': 'Leaderboard',
      'tab.account': 'Account',
      'nav.label': 'Game mode',
      'search.label': 'Character name',
      'search.placeholder': 'Name an incarnation…  (@ORV to list a manhwa)',
      'search.doneDaily': 'The next scenario starts at midnight UTC.',
      'search.doneEndless': 'Scenario cleared.',
      'giveUp': 'Give up',
      'legend.label': 'How to read the cells',
      'legend.ok': 'exact',
      'legend.partial': 'partial · chapter within 10',
      'legend.no': 'wrong',
      'legend.unknown': 'unknown',
      'legend.tip': '@ORV lists a manhwa',
      'quit': '[Quit]',
      'quit.title': 'Quit (Ctrl+Q)',
      'pool': ({ n, stories }) => `[${n} incarnations · ${stories} stories]`,

      'col.character': 'Character',
      'col.manhwa': 'Manhwa', 'col.gender': 'Gender', 'col.role': 'Role', 'col.species': 'Species',
      'col.affiliations': 'Affiliation', 'col.powers': 'Power', 'col.status': 'Status',
      'col.chapter': 'First appearance', 'col.hair': 'Hair',
      'cell.later': 'Appears later',
      'cell.earlier': 'Appears earlier',
      'grid.empty': 'No incarnation named yet.',

      'constellations': [
        'Reader of the Last Pages', 'Demon of a Thousand Masks', 'Prisoner of the Endless Tower',
        'Judge of Embers', 'Keeper of Forgotten Stories', 'Nameless Storyteller', 'Swordsman Who Counts the Stars',
      ],
      'react.win': 'Every constellation applauds.',
      'react.close': ['holds their breath.', 'leans toward the screen.', 'whispers that you are almost there.'],
      'react.story': ['recognizes this story.', 'nods slowly.'],
      'react.warm': ['is interested in your choice.', 'gestures for you to go on.'],
      'react.lukewarm': ['tilts their head, puzzled.', 'flips to another chapter.'],
      'react.cold': ['yawns.', 'looks away.', 'finds this choice bold.'],
      'feed.constellation': ({ who, text }) => ['[The constellation ', `“${who}”`, ` ${text}]`],
      'feed.streakAtStake': ({ n }) => `Your ${n}-${days.en(1)} streak is at stake. The scenario ends at midnight UTC.`,
      'feed.lost': 'The constellations are disappointed.',
      'feed.coins': ({ n }) => `${n} coins have been sponsored.`,
      'feed.record': ({ n }) => `New record: ${n} days in a row.`,
      'feed.streak': ({ n }) => `Streak: ${n} ${days.en(n)}.`,
      'feed.broken': 'The streak is broken.',

      'sc.titleDaily': '[Main Scenario — Character of the Day]',
      'sc.titleEndless': '[Sub Scenario — Unknown Incarnation]',
      'sc.won': '[The main scenario has been cleared.]',
      'sc.lost': '[Scenario failed.]',
      'sc.category': 'Category', 'sc.main': 'Main', 'sc.side': 'Sub',
      'sc.difficulty': 'Difficulty',
      'sc.goal': 'Clear condition',
      'sc.goalText': ({ n }) => `Identify the mystery character among ${n} incarnations.`,
      'sc.timeLimit': 'Time limit',
      'sc.untilMidnight': ({ time }) => `${time} (midnight UTC)`,
      'daily.loading': '[Connecting to the daily scenario…]',
      'daily.lockedTitle': '[Main Scenario — Account required]',
      'daily.lockedText': 'The daily character is played with a Discord account: one game a day, decided by the server, and your streak on the leaderboard. Endless mode stays free, with no account and offline.',
      'daily.offlineTitle': '[Star Stream unreachable]',
      'daily.offlineText': 'The daily character needs the server, which is not responding. Try again later, or play Endless mode in the meantime.',
      'daily.retry': '[Try again]',
      'daily.playEndless': '[Play Endless mode]',
      'daily.update': 'The server does not know this character: please update the game.',
      'daily.sendFailed': 'Guess not sent: the server is not responding. Try again.',
      'search.dailyGated': 'Daily character unavailable',
      'sc.none': 'None',
      'sc.reward': 'Reward', 'sc.coins': 'coins', 'sc.noReward': 'none',
      'sc.failure': 'Failure', 'sc.giveUp': 'Giving up',
      'sc.guesses': 'Guesses',
      'sc.next': 'Next scenario', 'sc.in': ({ time }) => `in ${time}`,
      'sc.streak': 'Streak',
      'sc.noStreak': 'none running',
      'sc.noStreakBest': ({ best }) => `none running · record ${best} ${days.en(best)}`,
      'sc.streakRun': ({ n, best }) => `${days.en(n)} in a row · record ${best}`,
      'sc.share': '[Share result]',
      'sc.imageCopied': '[Image copied.]',
      'sc.textCopied': '[Result copied.]',
      'sc.copyFailed': '[Copy failed.]',
      'sc.nextScenario': '[Next scenario]',
      'hint.blurry': ({ at }) => `[Hint: blurry silhouette. Sharper at ${at} guesses.]`,
      'hint.clear': '[Hint: silhouette almost sharp.]',
      'hint.none': '[No hint image for this scenario.]',
      'hint.locked': ({ n }) => `[Hint in ${n} guess${n > 1 ? 'es' : ''}.]`,
      'time': ({ h, m }) => `${h}h ${m}m`,

      'stats.played': 'Scenarios', 'stats.won': 'Cleared', 'stats.streak': 'Streak', 'stats.best': 'Record',
      'stats.avg': 'Avg. guesses', 'stats.coins': 'Coins',
      'filter.remove': 'remove from the game', 'filter.add': 'add to the game',

      'sugg.filter': 'Filter by manhwa',
      'sugg.count': ({ title, n }) => `${title} · ${n} character${s(n)}`,
      'sugg.noManhwa': 'No manhwa matches.',
      'sugg.noChar': 'No character matches.',
      'sugg.left': ({ n }) => `${n} characters`,

      'update.downloading': ({ v }) => `[Update${v} is downloading.]`,
      'update.ready': ({ v }) => `[Update${v} is ready. It will be installed when you close the app.]`,
      'update.restart': '[Restart now]',

      'acc.login': '[Log in]',
      'acc.loginTitle': 'Log in with Discord: synced streak and leaderboard',
      'acc.connecting': '[Logging in…]',
      'acc.me': 'My account',
      'acc.titleOut': '[Connecting to the Star Stream]',
      'acc.intro': 'Log in with Discord: the daily character is played on the server, '
        + 'your game follows you between the website and the app, and your streak joins the leaderboard, where your name and avatar are public. Without an account, Endless mode stays free.',
      'acc.loginDiscord': '[Log in with Discord]',
      'acc.cancel': '[Cancel]',
      'acc.connectingServer': 'Connecting to the server…',
      'acc.titleIn': '[Incarnation Profile]',
      'acc.sub': 'Logged in with Discord · streak synced between the website and the app',
      'acc.streak': 'Current streak', 'acc.best': 'Record', 'acc.won': 'Scenarios cleared',
      'acc.outOf': ({ n }) => `out of ${n}`, 'acc.avg': 'Avg. guesses', 'acc.last': 'Last scenario',
      'acc.lastValue': ({ n, date }) => `#${n} (${date})`, 'acc.never': 'none',
      'acc.days': ({ n }) => days.en(n),
      'acc.logout': '[Log out]',
      'acc.delete': '[Delete my account]',
      'acc.deleteConfirm': '[Confirm: delete everything]',
      'acc.note': 'Data kept on the server: your Discord ID, username and avatar, and for each daily character '
        + 'the date, the number of guesses and whether you cleared it. Nothing else is read from your Discord account. '
        + 'Deleting the account erases everything, permanently.',
      'acc.language': 'Language',
      'msg.loginWindow': 'Logging in through the Discord window… (Esc to close it)',
      'msg.loginRedirect': 'Connecting to Discord…',
      'msg.loginApp': ({ code }) => `Login code: ${code}. Check that the page that just opened shows the same one, log in, then come back here. (Tap [Logging in…] to reopen it.)`,
      'msg.sessionExpired': 'Session expired: please log in again.',
      'msg.offline': 'Server unreachable for now.',
      'msg.loggedOut': 'Logged out. Your streak stays on this device.',
      'msg.deleted': 'Account deleted: all your online data has been erased.',
      'msg.deleteFailed': 'Could not delete the account right now. Try again later.',
      'login.annule': 'Login cancelled.',
      'login.expire': 'The login request expired. Please try again.',
      'login.erreur': 'Discord could not confirm the login. Please try again.',

      'rank.title': '[Incarnation Leaderboard — Daily Character]',
      'rank.intro': 'Best streaks of cleared main scenarios. Every game is verified by the server.',
      'rank.loading': '[Loading the leaderboard…]',
      'rank.error': '[Leaderboard unreachable for now.]',
      'rank.empty': '[No incarnation ranked yet. Clear the daily character to open the leaderboard.]',
      'rank.head': ['#', 'Incarnation', 'Record', 'Streak', 'Cleared', 'Avg. guesses'],
      'rank.join': '[Log in to appear on the leaderboard]',
    },
  };

  // Valeurs des fiches : affichage anglais (la valeur française reste la clé de comparaison).
  const VALUES_EN = {
    // Genre, rôle, statut
    Homme: 'Male', Femme: 'Female',
    Protagoniste: 'Protagonist', Antagoniste: 'Antagonist', Allié: 'Ally', Neutre: 'Neutral',
    Vivant: 'Alive', Mort: 'Dead', Inconnu: 'Unknown',
    // Espèces
    Ange: 'Angel', Basilic: 'Basilisk', Cauchemar: 'Nightmare', Démon: 'Demon', Elfe: 'Elf',
    'Homme-bête': 'Beastfolk', Humain: 'Human', 'Mort-vivant': 'Undead', Nain: 'Dwarf',
    'Petit peuple': 'Little Folk', 'Peuple du ciel': 'Sky Folk', 'Sang-Vritra': 'Vritra Blood',
    // Pouvoirs
    Alchimie: 'Alchemy', Arc: 'Bow', 'Armes à feu': 'Firearms', 'Arts martiaux': 'Martial arts',
    Assassinat: 'Assassination', Aucun: 'None', Bêtes: 'Beasts', Contrôle: 'Control', Création: 'Creation',
    Diffusion: 'Broadcast', Défense: 'Defense', Eau: 'Water', Feu: 'Fire', Forge: 'Smithing', Foudre: 'Lightning',
    Glace: 'Ice', Invocation: 'Summoning', Lance: 'Spear', Lumière: 'Light', Magie: 'Magic', Narration: 'Storytelling',
    Prophétie: 'Prophecy', Soin: 'Healing', Soutien: 'Support', Stratégie: 'Strategy', Terre: 'Earth',
    Ténèbres: 'Darkness', Vent: 'Wind', Épée: 'Sword',
    // Cheveux
    Blanc: 'White', Bleu: 'Blue', Blond: 'Blond', Brun: 'Brown', Gris: 'Gray', Noir: 'Black', Rose: 'Pink',
    Roux: 'Red', Vert: 'Green',
    // Affiliations traduites en français dans les fiches
    '10 Maux': '10 Evils', 'Académie Xyrus': 'Xyrus Academy', 'Archidiocèse du Nord': 'Northern Archdiocese',
    'Chevaliers tueurs de dragons': 'Dragon Slayer Knights', 'Cinq Boss de Soara': 'Five Bosses of Soara',
    'Clan Indrath': 'Indrath Clan', 'Clan Leywin': 'Leywin Clan', 'Clan Thyestes': 'Thyestes Clan',
    'Clan de la Forêt sombre': 'Dark Forest Clan', 'Clan des Mers du Sud': 'Southern Seas Clan',
    'Clan du Ciel doré': 'Golden Sky Clan', 'Clan du Renard rouge': 'Red Fox Clan',
    'Clan du Roi Feu': 'Fire King Clan', 'Clan du Roi Tonnerre': 'Thunder King Clan',
    'Conseil de Dicathen': 'Council of Dicathen', 'Forteresse Gorgon': 'Gorgon Fortress',
    'Groupe Cheoldoo': 'Cheoldoo Group', 'Mercenaires de l\'Arbre d\'épines': 'Thorn Tree Mercenaries',
    'Royaume d\'Elenoir': 'Kingdom of Elenoir', 'Sans affiliation': 'No affiliation',
    'Sept Âmes Défuntes': 'Seven Deceased Souls', 'Survivants de la Tour': 'Tower Survivors',
  };
  // « Famille X » → « X Family »
  const valueEn = (v) => VALUES_EN[v] ?? (/^Famille /.test(v) ? `${v.slice(8)} Family` : v);

  function detect() {
    try {
      const saved = localStorage.getItem(KEY);
      if (LANGS.includes(saved)) return saved;
    } catch { /* ignoré */ }
    const prefs = navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
    for (const p of prefs) {
      const code = String(p).toLowerCase().slice(0, 2);
      if (LANGS.includes(code)) return code;
    }
    return 'en';
  }

  let lang = detect();
  document.documentElement.lang = lang;

  function t(key, params) {
    const v = STRINGS[lang][key] ?? STRINGS.fr[key];
    if (v === undefined) return key;
    return typeof v === 'function' ? v(params ?? {}) : v;
  }

  window.I18n = {
    LANGS,
    get lang() { return lang; },
    /** Change la langue et l'enregistre (la page se redessine ensuite). */
    setLang(next) {
      if (!LANGS.includes(next)) return;
      lang = next;
      document.documentElement.lang = lang;
      try { localStorage.setItem(KEY, lang); } catch { /* ignoré */ }
    },
    t,
    /** Clés présentes dans une langue et absentes de l'autre (tests). */
    missingKeys: () => LANGS.flatMap((l) => Object.keys(STRINGS.fr).concat(Object.keys(STRINGS.en))
      .filter((k, i, all) => all.indexOf(k) === i && !(k in STRINGS[l])).map((k) => `${l}:${k}`)),
    /** Valeur d'une fiche, dans la langue affichée. */
    value: (v) => (lang === 'en' && typeof v === 'string' ? valueEn(v) : v),
    /** Nombre à une décimale (virgule en français). */
    decimal: (x) => (lang === 'fr' ? x.toFixed(1).replace('.', ',') : x.toFixed(1)),
    integer: (x) => x.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US'),
    percent: (x) => (lang === 'fr' ? `${x} %` : `${x}%`),
    /** Date AAAA-MM-JJ lisible (04/11/2026 ou Nov 4, 2026). */
    date: (day) => {
      const [y, m, d] = day.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US',
        lang === 'fr' ? { timeZone: 'UTC' } : { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    },
  };
})();
