/* Monthly Battle Pass seasons: 100 levels, a new theme and featured Indexling pack every month.
   Replaces the old fixed 50-level pass (rules live in season-core.js, which the server also uses).
   Loaded after rewards-ui.js; it swaps the pass logic and the Battle Pass tab body. */
(function () {
  'use strict';
  var SC = window.SeasonCore;
  if (!SC || typeof state === 'undefined') return;
  function E(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ling(id) { try { return cosmeticById(id); } catch (e) { return null; } }
  function art(c) { try { return indexlingArtHtml(c, true, null); } catch (e) { return '<span style="font-size:30px">' + E(c && c.icon || '✦') + '</span>'; } }
  function coin(n) { try { return indexCoinIconSvg(n); } catch (e) { return '🪙'; } }
  function P() { return state.progress; }

  /* --- logic overrides (the app calls these as globals) --- */
  window.battlePassLevel = function () { return SC.level(P()); };
  window.applyBattlePassRewards = function () {
    if (!state.progress) return;
    var before = JSON.stringify((state.progress.season || {}).claimed || []);
    SC.apply(state.progress);
    try { persistProgress(); } catch (e) { }
  };
  try { if (state.progress) SC.apply(state.progress); } catch (e) { }

  /* --- UI --- */
  function art2(r) {
    if (r.indexling) { var c = ling(r.indexling); if (c) return '<div class="rw-art rw-art-ling">' + art(c) + '</div>'; }
    if (r.milestone || r.skinCrates > 1) return '<div class="rw-art rw-art-chest"><span class="sp-emo">🧰</span></div>';
    if (r.skinCrates) return '<div class="rw-art"><span class="sp-emo">🧰</span></div>';
    if (r.packTokens) return '<div class="rw-art"><span class="sp-emo">🎟️</span></div>';
    return '<div class="rw-art">' + coin(30) + '</div>';
  }
  function chips(r) {
    var o = [];
    if (r.coins) o.push('<span class="rw-pill rw-pill-coin">' + coin(13) + r.coins + '</span>');
    if (r.skinCrates) o.push('<span class="rw-pill rw-pill-crate">🧰×' + r.skinCrates + '</span>');
    if (r.packTokens) o.push('<span class="rw-pill rw-pill-pack">🎟️×' + r.packTokens + '</span>');
    if (r.indexling) { var c = ling(r.indexling); o.push('<span class="rw-pill ' + (r.finale ? 'rw-pill-leg' : 'rw-pill-ling') + '">' + E(c ? c.name : 'Indexling') + '</span>'); }
    return o.join('');
  }
  function card(r, lvl) {
    var reached = r.level <= lvl, cur = r.level === lvl, next = r.level === lvl + 1;
    var cls = 'rw-lvl' + (reached ? ' claimed' : ' locked') + (cur ? ' current' : '') + (next ? ' next' : '') + (r.milestone ? ' milestone' : '') + (r.finale ? ' finale' : '');
    return '<article class="' + cls + '" data-level="' + r.level + '">' +
      '<div class="rw-lvl-top"><span class="rw-lvl-num">LV ' + r.level + '</span>' + (reached ? '<span class="rw-lvl-ok" aria-label="Claimed">✓</span>' : (next ? '<span class="rw-lvl-flag">NEXT</span>' : '<span class="rw-lvl-lock" aria-label="Locked">🔒</span>')) + '</div>' +
      art2(r) + '<div class="rw-lvl-name">' + E(r.name) + '</div><div class="rw-lvl-chips">' + chips(r) + '</div>' +
      (cur ? '<div class="rw-lvl-here">YOU ARE HERE</div>' : '') + '</article>';
  }
  function bpHtml() {
    var p = P(), sid = SC.seasonId(), th = SC.themeFor(sid), tab = SC.table(sid), lvl = SC.level(p), into = SC.into(p), done = lvl >= SC.LEVELS;
    var crates = Math.max(0, Number(p.skinCrates) || 0), days = SC.daysLeft();
    var nextR = done ? null : tab[lvl], fin = tab[SC.LEVELS - 1];
    var nth = SC.themeFor(SC.nextId(sid)), packName = SC.PACK_NAMES[th.pack];
    var nextHtml = nextR ? '<div class="rw-next-card"><div class="rw-next-k">NEXT REWARD · LEVEL ' + nextR.level + '</div><div class="rw-next-body">' + art2(nextR) + '<div><div class="rw-next-name">' + E(nextR.name) + '</div><div class="rw-lvl-chips">' + chips(nextR) + '</div></div></div></div>'
      : '<div class="rw-next-card"><div class="rw-next-k">SEASON COMPLETE</div><div class="rw-next-name">Every reward claimed. See you next month!</div></div>';
    var finHtml = '<div class="rw-fin-card' + (done ? ' done' : '') + '"><div class="rw-fin-glow"></div><div class="rw-fin-k">SEASON FINALE · LEVEL ' + SC.LEVELS + '</div><div class="rw-fin-body">' + art2(fin) + '<div><div class="rw-fin-name">' + E(fin.name) + '</div><div class="rw-lvl-chips">' + chips(fin) + '</div></div></div><div class="rw-fin-prog"><i style="width:' + Math.min(100, (lvl - 1) / (SC.LEVELS - 1) * 100) + '%"></i></div></div>';
    var tiers = '';
    for (var t = 0; t < 10; t++) {
      var from = t * 10 + 1, to = from + 9, items = tab.slice(from - 1, to), got = items.filter(function (r) { return r.level <= lvl; }).length;
      var open = (lvl >= from && lvl <= to) || (lvl > to ? false : (t === 0 && lvl < 1));
      tiers += '<section class="rw-tier sp-tier"><header class="rw-tier-h"><div><span class="rw-tier-n">Levels ' + from + '–' + to + '</span></div><div class="rw-tier-p"><i style="width:' + (got * 10) + '%"></i></div><span class="rw-tier-c">' + got + '/10</span></header><div class="rw-track">' + items.map(function (r) { return card(r, lvl); }).join('') + '</div></section>';
    }
    return '<div class="rw-bp sp-season" style="--t1:' + th.c1 + ';--t2:' + th.c2 + '">' +
      '<section class="sp-banner"><div class="sp-banner-ic">' + th.icon + '</div><div class="sp-banner-tx"><div class="sp-k">SEASON · ' + E(sid) + '</div><h3>' + E(th.name) + '</h3><p>' + E(th.tag) + ' Featured pack: <b>' + E(packName) + '</b>.</p></div>' +
      '<div class="sp-left"><b>' + days + '</b><span>day' + (days === 1 ? '' : 's') + ' left</span></div></section>' +
      '<section class="rw-bp-hero"><div class="rw-ring" style="--p:' + (done ? 100 : into / SC.XP_PER_LEVEL * 100) + '"><div class="rw-ring-in"><small>LEVEL</small><b>' + lvl + '</b><span>of ' + SC.LEVELS + '</span></div></div>' +
      '<div class="rw-bp-info"><div class="rw-eyebrow">INDEX BATTLE PASS · ' + E(th.name.toUpperCase()) + '</div><h3>' + (done ? 'Season complete!' : 'Level ' + lvl) + '</h3><div class="rw-xpbar"><i style="width:' + (done ? 100 : into / SC.XP_PER_LEVEL * 100) + '%"></i></div><p>' + (done ? 'You earned every reward this season.' : into + ' / ' + SC.XP_PER_LEVEL + ' XP · ' + (SC.XP_PER_LEVEL - into) + ' XP to level ' + (lvl + 1)) + '</p></div>' +
      nextHtml + finHtml + '</section>' +
      '<section class="rw-crate-bar"><div class="rw-crate-ic">🧰</div><div><strong>Skin Crates</strong><span>Crates contain a random skin for a random Indexling.</span></div><div class="rw-crate-n">' + crates + '</div><button class="rw-btn rw-btn-gold" data-action="open-skin-crate" ' + (crates > 0 ? '' : 'disabled') + '>Open crate</button></section>' +
      tiers +
      '<section class="sp-next"><span class="sp-next-ic">' + nth.icon + '</span><div><b>Next season: ' + E(nth.name) + '</b><span>Starts in ' + days + ' day' + (days === 1 ? '' : 's') + ' · features ' + E(SC.PACK_NAMES[nth.pack]) + '. A new pass starts at level 1; your XP total and profile level carry on.</span></div></section>' +
      '</div>';
  }
  function register() {
    if (window.__rwBodies) window.__rwBodies.battlepass = bpHtml;
    else setTimeout(register, 300);
  }
  register();
  /* a new month while the page is open: refresh the pass */
  setInterval(function () { try { var s = state.progress && state.progress.season; if (s && s.id !== SC.seasonId()) { SC.apply(state.progress); persistProgress(); if (state.view === 'rewards') renderRewards(); } } catch (e) { } }, 60000);
})();
