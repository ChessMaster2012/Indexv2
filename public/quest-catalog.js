/* Quest catalog — single source of truth, loaded by BOTH the browser and server.js
 * (server: require('./public/quest-catalog.js')). Rewards are always granted by the server. */
(function (root) {
  'use strict';
  function q(id, category, icon, title, desc, metric, goal, r) {
    r = r || {};
    return { id: id, category: category, icon: icon, title: title, desc: desc, metric: metric, goal: goal,
      xp: r.xp || 0, coins: r.coins || 0, packTokens: r.packTokens || 0, skinCrates: r.skinCrates || 0 };
  }
  var CATEGORIES = [
    { id: 'Daily', icon: '🌅', blurb: 'Quick wins that refresh every day.', pick: 2 },
    { id: 'Study', icon: '📚', blurb: 'Learn something, anything.', pick: 3 },
    { id: 'Tutor', icon: '💬', blurb: 'Put the AI Tutor to work.', pick: 1 },
    { id: 'Games', icon: '🎮', blurb: 'Play, defend, compete.', pick: 2 },
    { id: 'Collection', icon: '📦', blurb: 'Grow your Indexling collection.', pick: 1 },
    { id: 'Milestone', icon: '🏆', blurb: 'Big goals with big rewards.', pick: 2 }
  ];
  var DAILY = [
    q('login', 'Daily', '🌅', 'Daily Check-In', 'Sign in to Index today.', 'login', 1, { xp: 25, coins: 20 }),
    q('wheel', 'Daily', '🎡', 'Wheel of Fortune', 'Spin the Daily Wheel today.', 'wheel', 1, { xp: 30, coins: 15 }),
    q('coins', 'Daily', '🪙', 'Coin Collector', 'Earn 100 coins today.', 'coins', 100, { xp: 60, coins: 25 }),

    q('set', 'Study', '🗂️', 'Build Your Deck', 'Create 1 study set today.', 'sets', 1, { xp: 75, coins: 10 }),
    q('notes', 'Study', '📝', 'Note Taker', 'Save 1 note today.', 'notes', 1, { xp: 60, coins: 10 }),
    q('notes3', 'Study', '🖊️', 'Scribe', 'Save 3 notes today.', 'notes', 3, { xp: 110, coins: 25 }),
    q('lessons', 'Study', '🎓', 'Topic Explorer', 'Finish 2 topic lessons today.', 'lessons', 2, { xp: 100 }),
    q('lessons2', 'Study', '📚', 'Topic Master', 'Finish 4 topic lessons today.', 'lessons', 4, { xp: 125, coins: 25 }),
    q('lessons6', 'Study', '🏅', 'Course Crusher', 'Finish 6 topic lessons today.', 'lessons', 6, { xp: 200, coins: 40, packTokens: 1, skinCrates: 1 }),
    q('cards10', 'Study', '🃏', 'Card Sharp', 'Review 10 flashcards today.', 'cards', 10, { xp: 60, coins: 10 }),
    q('cards25', 'Study', '♠️', 'Flashcard Fanatic', 'Review 25 flashcards today.', 'cards', 25, { xp: 120, coins: 25 }),
    q('quiz1', 'Study', '❓', 'Quiz Time', 'Finish 1 quiz today.', 'quizzes', 1, { xp: 80, coins: 15 }),
    q('quiz3', 'Study', '🧩', 'Quiz Streak', 'Finish 3 quizzes today.', 'quizzes', 3, { xp: 150, coins: 30, packTokens: 1 }),
    q('perfect', 'Study', '💯', 'Flawless', 'Get a perfect score on a quiz today.', 'perfect', 1, { xp: 150, coins: 40, skinCrates: 1 }),

    q('ai', 'Tutor', '💬', 'Ask the Tutor', 'Ask the AI Tutor 3 times today.', 'ai', 3, { xp: 50 }),
    q('ai2', 'Tutor', '🧠', 'Tutor Marathon', 'Ask the AI Tutor 6 times today.', 'ai', 6, { xp: 75, coins: 20 }),
    q('ai10', 'Tutor', '🔥', 'Tutor Endurance', 'Ask the AI Tutor 10 times today.', 'ai', 10, { xp: 150, coins: 35, packTokens: 1 }),
    q('ai15', 'Tutor', '🌟', 'Tutor Legend', 'Ask the AI Tutor 15 times today.', 'ai', 15, { xp: 200, coins: 50, packTokens: 1, skinCrates: 1 }),

    q('games1', 'Games', '🕹️', 'Arcade Rookie', 'Start 1 game in the Games tab today.', 'games', 1, { xp: 60, coins: 15 }),
    q('games3', 'Games', '👾', 'Game Night', 'Start 3 games in the Games tab today.', 'games', 3, { xp: 110, coins: 30 }),
    q('waves5', 'Games', '🛡️', 'Wave Breaker', 'Fight 5 Commander waves today.', 'waves', 5, { xp: 90, coins: 20 }),
    q('waves10', 'Games', '⚔️', 'Warlord', 'Fight 10 Commander waves today.', 'waves', 10, { xp: 160, coins: 40, packTokens: 1 }),
    q('live', 'Games', '⚡', 'Live Challenger', 'Play 1 Live Game today.', 'liveGames', 1, { xp: 100, coins: 15 }),
    q('live3', 'Games', '🏁', 'Live Regular', 'Play 3 Live Games today.', 'liveGames', 3, { xp: 220, coins: 45, packTokens: 1, skinCrates: 1 }),

    q('packs1', 'Collection', '🎁', 'Crack a Pack', 'Open 1 Indexling pack today.', 'packs', 1, { xp: 50, coins: 10 }),
    q('packs2', 'Collection', '📦', 'Pack Collector', 'Open 2 Indexling packs today.', 'packs', 2, { xp: 100, coins: 25, packTokens: 1, skinCrates: 1 }),
    q('packs4', 'Collection', '🛍️', 'Pack Hoarder', 'Open 4 Indexling packs today.', 'packs', 4, { xp: 180, coins: 50, packTokens: 1, skinCrates: 2 }),
    q('crate1', 'Collection', '🧰', 'Skin Hunter', 'Open 1 Skin Crate today.', 'crates', 1, { xp: 70, coins: 20 }),

    q('xp', 'Milestone', '⚡', 'Momentum', 'Earn 100 XP today.', 'xp', 100, { xp: 75, coins: 15 }),
    q('xp2', 'Milestone', '🚀', 'XP Rush', 'Earn 250 XP today.', 'xp', 250, { xp: 150, coins: 30, packTokens: 1, skinCrates: 1 }),
    q('xp3', 'Milestone', '☄️', 'XP Storm', 'Earn 500 XP today.', 'xp', 500, { xp: 250, coins: 60, packTokens: 2, skinCrates: 1 }),
    q('coins2', 'Milestone', '💰', 'Treasure Run', 'Earn 300 coins today.', 'coins', 300, { xp: 120, coins: 0, packTokens: 1 }),
    q('streak3', 'Milestone', '🔥', 'Streak Keeper', 'Be active 3 days in a row.', 'streak', 3, { xp: 100, coins: 30 }),
    q('streak7', 'Milestone', '🌋', 'Week Warrior', 'Be active 7 days in a row.', 'streak', 7, { xp: 200, coins: 60, packTokens: 1, skinCrates: 1 })
  ];
  var CHEST = [
    { id: 'bronze', name: 'Bronze Chest', icon: '🥉', need: 3, xp: 50, coins: 30, packTokens: 0, skinCrates: 0 },
    { id: 'silver', name: 'Silver Chest', icon: '🥈', need: 6, xp: 100, coins: 60, packTokens: 1, skinCrates: 0 },
    { id: 'gold', name: 'Gold Chest', icon: '🥇', need: 9, xp: 150, coins: 100, packTokens: 1, skinCrates: 1 },
    { id: 'diamond', name: 'Diamond Chest', icon: '💎', need: 11, xp: 300, coins: 200, packTokens: 2, skinCrates: 2 }
  ];
  function a(id, icon, title, desc, metric, goal, r) {
    r = r || {};
    return { id: id, icon: icon, title: title, desc: desc, metric: metric, goal: goal,
      xp: r.xp || 0, coins: r.coins || 0, packTokens: r.packTokens || 0, skinCrates: r.skinCrates || 0 };
  }
  /* Lifetime achievements. Metric values are computed from the account's own saved progress. */
  var ACHIEVEMENTS = [
    a('les10', '📘', 'First Chapter', 'Finish 10 topic lessons.', 'lessons', 10, { xp: 100, coins: 50 }),
    a('les25', '📗', 'Bookworm', 'Finish 25 topic lessons.', 'lessons', 25, { xp: 200, coins: 100, packTokens: 1 }),
    a('les50', '📙', 'Scholar', 'Finish 50 topic lessons.', 'lessons', 50, { xp: 400, coins: 200, packTokens: 2, skinCrates: 1 }),
    a('les100', '🎓', 'Professor', 'Finish 100 topic lessons.', 'lessons', 100, { xp: 800, coins: 400, packTokens: 3, skinCrates: 3 }),
    a('lvl10', '🥉', 'Rising Star', 'Reach Battle Pass level 10.', 'level', 10, { coins: 75, packTokens: 1 }),
    a('lvl25', '🥈', 'Halfway Hero', 'Reach Battle Pass level 25.', 'level', 25, { coins: 150, packTokens: 2, skinCrates: 1 }),
    a('lvl40', '🥇', 'Elite Learner', 'Reach Battle Pass level 40.', 'level', 40, { coins: 250, packTokens: 2, skinCrates: 2 }),
    a('lvl50', '👑', 'Index Legend', 'Reach Battle Pass level 50.', 'level', 50, { coins: 500, packTokens: 5, skinCrates: 5 }),
    a('col10', '🧸', 'Collector', 'Own 10 Indexlings.', 'collection', 10, { coins: 80, packTokens: 1 }),
    a('col25', '🎎', 'Curator', 'Own 25 Indexlings.', 'collection', 25, { coins: 200, packTokens: 2, skinCrates: 1 }),
    a('col40', '🏛️', 'Museum Owner', 'Own 40 Indexlings.', 'collection', 40, { coins: 400, packTokens: 3, skinCrates: 2 }),
    a('col48', '🌈', 'Complete Set', 'Own all 48 Indexlings.', 'collection', 48, { coins: 1000, packTokens: 5, skinCrates: 5 }),
    a('skin5', '✨', 'Fashionista', 'Own 5 skins.', 'skins', 5, { coins: 100, skinCrates: 1 }),
    a('skin15', '🪩', 'Wardrobe Wizard', 'Own 15 skins.', 'skins', 15, { coins: 300, packTokens: 2, skinCrates: 2 }),
    a('pack10', '🎁', 'Pack Opener', 'Open 10 packs.', 'packs', 10, { coins: 100, packTokens: 1 }),
    a('pack50', '📦', 'Pack Addict', 'Open 50 packs.', 'packs', 50, { coins: 300, packTokens: 3, skinCrates: 2 }),
    a('pack100', '🏭', 'Pack Factory', 'Open 100 packs.', 'packs', 100, { coins: 600, packTokens: 5, skinCrates: 4 }),
    a('live5', '⚡', 'Live Wire', 'Play 5 Live Games.', 'liveGames', 5, { coins: 100, packTokens: 1 }),
    a('live25', '🎤', 'Show Stopper', 'Play 25 Live Games.', 'liveGames', 25, { coins: 400, packTokens: 3, skinCrates: 2 }),
    a('days7', '📅', 'Regular', 'Be active on 7 different days.', 'activeDays', 7, { coins: 100, packTokens: 1 }),
    a('days30', '🗓️', 'Dedicated', 'Be active on 30 different days.', 'activeDays', 30, { coins: 400, packTokens: 3, skinCrates: 2 })
  ];

  function hashSeed(s) { var h = 0; for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h; }
  /* Deterministic daily board: same quests for every device on the same ET day. */
  function board(day) {
    var seed = hashSeed(String(day)), out = [];
    function rnd(n) { seed = (seed * 1664525 + 1013904223) | 0; return Math.abs(seed) % n; }
    CATEGORIES.forEach(function (cat) {
      var pool = DAILY.filter(function (x) { return x.category === cat.id; });
      for (var i = pool.length - 1; i > 0; i--) { var j = rnd(i + 1), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      var metrics = {}, n = 0;
      pool.forEach(function (x) { if (n < cat.pick && !metrics[x.metric]) { metrics[x.metric] = 1; out.push(x); n++; } });
    });
    return out;
  }
  var api = { CATEGORIES: CATEGORIES, DAILY: DAILY, CHEST: CHEST, ACHIEVEMENTS: ACHIEVEMENTS, board: board,
    byId: function (id) { for (var i = 0; i < DAILY.length; i++) if (DAILY[i].id === id) return DAILY[i]; return null; },
    chestById: function (id) { for (var i = 0; i < CHEST.length; i++) if (CHEST[i].id === id) return CHEST[i]; return null; },
    achById: function (id) { for (var i = 0; i < ACHIEVEMENTS.length; i++) if (ACHIEVEMENTS[i].id === id) return ACHIEVEMENTS[i]; return null; },
    rewardText: function (r) {
      var p = [];
      if (r.xp) p.push('+' + r.xp + ' XP');
      if (r.coins) p.push('+' + r.coins + ' coins');
      if (r.packTokens) p.push('+' + r.packTokens + ' free pack' + (r.packTokens === 1 ? '' : 's'));
      if (r.skinCrates) p.push('+' + r.skinCrates + ' skin crate' + (r.skinCrates === 1 ? '' : 's'));
      return p.join(' · ');
    } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QUEST_CATALOG = api;
})(typeof window !== 'undefined' ? window : this);
