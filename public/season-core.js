/* Monthly Battle Pass seasons. Shared by the browser (window.SeasonCore) and the server (require).
   One season per calendar month (America/New_York). Each season has a theme, a featured Indexling pack and a
   100-level reward track. Season progress = XP earned since the season started (progress.season.base is the
   total XP when the player first opened that season), so every XP source counts and no new XP plumbing is needed.
   progress.season = { id:'YYYY-MM', base:<total xp at season start>, claimed:[levels already paid out] } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeasonCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LEVELS = 100, XP_PER_LEVEL = 50;
  var DUP_BONUS = 40, FINALE_DUP_BONUS = 500;

  /* Indexling rosters per pack, ordered by rarity; the last one (Legendary) is the level-100 finale. */
  var PACKS = {
    candy:    ['ling-sugarbug', 'ling-gumdrop', 'ling-taffy', 'ling-choco', 'ling-jellybean', 'ling-caramel', 'ling-sprinkle', 'ling-lolliking'],
    medieval: ['ling-squire', 'ling-bard', 'ling-blacksmith', 'ling-knight', 'ling-alchemist', 'ling-dragonling', 'ling-royalmage', 'ling-crownling'],
    robo:     ['ling-botlet', 'ling-circuit', 'ling-servo', 'ling-drone', 'ling-mecha', 'ling-reactor', 'ling-cyber', 'ling-overclock'],
    ocean:    ['ling-guppy', 'ling-coral', 'ling-pearl', 'ling-diver', 'ling-kelp', 'ling-kraken', 'ling-abyssal', 'ling-tideking'],
    arcade:   ['ling-token', 'ling-joystick', 'ling-pixel', 'ling-glitch', 'ling-synth', 'ling-racer', 'ling-arcadeboss', 'ling-highscore'],
    cosmic:   ['ling-comet', 'ling-moonlet', 'ling-starling', 'ling-nebula', 'ling-eclipse', 'ling-quasar', 'ling-voidling', 'ling-supernova']
  };
  var PACK_NAMES = { candy: 'Candy Carnival', medieval: 'Medieval Keep', robo: 'Robo Works', ocean: 'Deep Sea', arcade: 'Arcade Afterdark', cosmic: 'Cosmic Odyssey' };

  /* index = month (0 = January) */
  var THEMES = [
    { name: 'Frostbite Frenzy',   icon: '❄️', pack: 'ocean',    c1: '#7dd3fc', c2: '#3b82f6', word: 'Frost',   tag: 'Ice-cold streaks and glacier-sized rewards.' },
    { name: 'Heartbeat Havoc',    icon: '💘', pack: 'candy',    c1: '#fb7185', c2: '#be185d', word: 'Heart',   tag: 'Study with heart. Sweet loot all month.' },
    { name: 'Lucky Circuit',      icon: '🍀', pack: 'robo',     c1: '#4ade80', c2: '#15803d', word: 'Lucky',   tag: 'Charge up your luck and your grades.' },
    { name: 'Rainmaker Rush',     icon: '🌧️', pack: 'arcade',   c1: '#60a5fa', c2: '#4338ca', word: 'Rain',    tag: 'April showers bring arcade powers.' },
    { name: 'Bloom & Boom',       icon: '🌸', pack: 'candy',    c1: '#f9a8d4', c2: '#a21caf', word: 'Bloom',   tag: 'Watch your knowledge blossom.' },
    { name: 'Solar Surge',        icon: '☀️', pack: 'robo',     c1: '#fbbf24', c2: '#ea580c', word: 'Solar',   tag: 'Max out before summer.' },
    { name: 'Starfall Summer',    icon: '🌠', pack: 'cosmic',   c1: '#a78bfa', c2: '#4c1d95', word: 'Star',    tag: 'Wish upon a streak.' },
    { name: 'Tidal Takeover',     icon: '🌊', pack: 'ocean',    c1: '#22d3ee', c2: '#0e7490', word: 'Tide',    tag: 'Dive deep into the sea of rewards.' },
    { name: "Scholar's Siege",    icon: '📚', pack: 'medieval', c1: '#fcd34d', c2: '#92400e', word: 'Scholar', tag: 'Back to the keep: knowledge is power.' },
    { name: 'Midnight Manor',     icon: '🎃', pack: 'arcade',   c1: '#fb923c', c2: '#6d28d9', word: 'Spooky',  tag: 'Spooky good loot after dark.' },
    { name: 'Harvest Quest',      icon: '🍂', pack: 'medieval', c1: '#f59e0b', c2: '#9a3412', word: 'Harvest', tag: 'Gather XP, reap rewards.' },
    { name: 'Snowglobe Showdown', icon: '⛄', pack: 'candy',    c1: '#bae6fd', c2: '#6366f1', word: 'Snow',    tag: 'Finish the year frosted and unstoppable.' }
  ];

  function nyParts(ms) {
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms || Date.now()));
    var a = f.split('-'); return { y: +a[0], m: +a[1], d: +a[2] };
  }
  function seasonId(ms) { var p = nyParts(ms); return p.y + '-' + (p.m < 10 ? '0' : '') + p.m; }
  function themeFor(id) { var m = parseInt(String(id).split('-')[1], 10); return THEMES[((m || 1) - 1 + 12) % 12]; }
  function daysLeft(ms) {
    var p = nyParts(ms), dim = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
    return dim - p.d + 1;
  }
  function nextId(id) { var a = String(id).split('-'), y = +a[0], m = +a[1] + 1; if (m > 12) { m = 1; y++; } return y + '-' + (m < 10 ? '0' : '') + m; }

  /* levels at which the featured pack's non-legendary Indexlings drop */
  function lingLevels(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(n === 1 ? 50 : Math.round(10 + i * (82 / (n - 1))));
    return out;
  }
  var NOUNS = ['Stash', 'Cache', 'Haul', 'Purse', 'Bundle', 'Trove', 'Hoard'];
  /* Reward for one level of a season. */
  function reward(level, id) {
    var th = themeFor(id), roster = PACKS[th.pack], finaleId = roster[roster.length - 1];
    var lv = lingLevels(roster.length - 1), at = lv.indexOf(level);
    var r = { level: level, coins: 20 + level, skinCrates: 0, packTokens: 0, indexling: '', finale: false, name: '' };
    if (level % 5 === 2) r.packTokens = 1;
    if (level % 5 === 3) r.skinCrates = 1;
    if (level % 10 === 0) r.skinCrates = 2;
    if (level % 25 === 0) r.packTokens += 2;
    if (at >= 0) r.indexling = roster[at];
    if (level === LEVELS) { r.finale = true; r.indexling = finaleId; r.coins = 1000; r.skinCrates = 5; r.packTokens = 3; }
    r.milestone = level % 10 === 0;
    r.name = r.finale ? th.name + ' Finale' : (level % 10 === 0 ? th.word + ' Chest' : th.word + ' ' + NOUNS[level % NOUNS.length]);
    return r;
  }
  function table(id) { var t = []; for (var l = 1; l <= LEVELS; l++) t.push(reward(l, id)); return t; }

  function totalXp(p) { return Math.max(0, Math.floor(Number(p && p.xp) || 0)); }
  /* Make sure progress.season belongs to the current month; a new month starts a fresh season at level 1. */
  function ensure(p, ms) {
    var id = seasonId(ms), s = p.season;
    if (!s || typeof s !== 'object' || !/^\d{4}-\d{2}$/.test(String(s.id || ''))) {
      p.season = { id: id, base: totalXp(p), claimed: [] };
    } else if (String(s.id) < id) {
      p.season = { id: id, base: totalXp(p), claimed: [] };
    } else {
      s.base = Math.max(0, Math.floor(Number(s.base) || 0));
      s.claimed = Array.isArray(s.claimed) ? s.claimed.filter(function (n) { return n >= 1 && n <= LEVELS; }) : [];
    }
    return p.season;
  }
  function levelOf(p, ms) {
    var s = ensure(p, ms), gained = Math.max(0, totalXp(p) - s.base);
    return Math.min(LEVELS, Math.floor(gained / XP_PER_LEVEL) + 1);
  }
  function progressInto(p, ms) {
    var s = ensure(p, ms), gained = Math.max(0, totalXp(p) - s.base), lvl = levelOf(p, ms);
    return lvl >= LEVELS ? XP_PER_LEVEL : gained % XP_PER_LEVEL;
  }
  /* Pay out every reached, unclaimed level. Mutates p. Returns the levels paid out. */
  function applyInPlace(p, ms) {
    var s = ensure(p, ms), lvl = levelOf(p, ms), done = [];
    if (!Array.isArray(p.unlockedCosmetics)) p.unlockedCosmetics = [];
    p.coins = Math.max(0, Number(p.coins) || 0);
    p.skinCrates = Math.max(0, Math.floor(Number(p.skinCrates) || 0));
    p.freePackTokens = Math.max(0, Math.floor(Number(p.freePackTokens) || 0));
    for (var l = 1; l <= lvl; l++) {
      if (s.claimed.indexOf(l) >= 0) continue;
      var r = reward(l, s.id);
      p.coins += r.coins; p.skinCrates += r.skinCrates; p.freePackTokens += r.packTokens;
      if (r.indexling) {
        if (p.unlockedCosmetics.indexOf(r.indexling) >= 0) p.coins += r.finale ? FINALE_DUP_BONUS : DUP_BONUS;
        else p.unlockedCosmetics.push(r.indexling);
      }
      s.claimed.push(l); done.push(l);
    }
    return done;
  }
  /* Cross-device merge used by the server: newer season wins; the same season keeps the earlier base and all claims. */
  function merge(a, b) {
    if (!a || typeof a !== 'object') return b || null;
    if (!b || typeof b !== 'object') return a;
    var ia = String(a.id || ''), ib = String(b.id || '');
    if (ia !== ib) return ia > ib ? a : b;
    var seen = {}, claimed = [];
    (a.claimed || []).concat(b.claimed || []).forEach(function (n) { n = +n; if (n >= 1 && n <= LEVELS && !seen[n]) { seen[n] = 1; claimed.push(n); } });
    return { id: ia, base: Math.min(Math.max(0, +a.base || 0), Math.max(0, +b.base || 0)), claimed: claimed.sort(function (x, y) { return x - y; }) };
  }
  function sanitize(s) {
    if (!s || typeof s !== 'object' || !/^\d{4}-\d{2}$/.test(String(s.id || ''))) return null;
    var seen = {}, claimed = [];
    (Array.isArray(s.claimed) ? s.claimed : []).forEach(function (n) { n = Math.floor(+n); if (n >= 1 && n <= LEVELS && !seen[n]) { seen[n] = 1; claimed.push(n); } });
    return { id: String(s.id), base: Math.max(0, Math.min(100000000, Math.floor(Number(s.base) || 0))), claimed: claimed.sort(function (x, y) { return x - y; }) };
  }

  return {
    LEVELS: LEVELS, XP_PER_LEVEL: XP_PER_LEVEL, THEMES: THEMES, PACKS: PACKS, PACK_NAMES: PACK_NAMES,
    seasonId: seasonId, nextId: nextId, themeFor: themeFor, daysLeft: daysLeft, reward: reward, table: table,
    ensure: ensure, level: levelOf, into: progressInto, apply: applyInPlace, merge: merge, sanitize: sanitize
  };
});
