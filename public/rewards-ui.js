/* Rewards tab presentation layer.
 * Re-skins the Rewards tabs (Battle Pass, Packs, Daily Wheel, Avatar, Inventory) and the
 * pack / skin-crate opening animations. It reads the same state and calls the same
 * data-action handlers as before: odds, costs, rolls, grants and saves are untouched,
 * and Indexling art always comes from indexlingArtHtml(). If this file fails to load or
 * throws, the original Rewards UI renders unchanged. */
(function () {
  'use strict';
  if (window.__rwUi) return;
  window.__rwUi = true;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function E(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function st() { try { return state; } catch (e) { return null; } }
  function coin(n) { try { return indexCoinIconSvg(n || 16); } catch (e) { return '🪙'; } }
  function ling(id) { try { return cosmeticById(id); } catch (e) { return null; } }
  function art(c, mini, skin) { try { return indexlingArtHtml(c, mini !== false, skin || null); } catch (e) { return '<span style="font-size:30px">' + E(c && c.icon || '✦') + '</span>'; } }

  /* ---------- inline icons ---------- */
  var IC = {
    bp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    packs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>',
    wheel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3v6.8M12 14.2V21M3 12h6.8M14.2 12H21M5.6 5.6l4.8 4.8M13.6 13.6l4.8 4.8M18.4 5.6l-4.8 4.8M10.4 13.6l-4.8 4.8"/></svg>',
    avatar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/></svg>',
    inv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8Z"/><path d="M9 8h6M6 14h12"/></svg>',
    crate: '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="rwcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf6a"/><stop offset="1" stop-color="#d9822b"/></linearGradient></defs><rect x="6" y="18" width="36" height="22" rx="4" fill="url(#rwcg)" stroke="#7a4310" stroke-width="2"/><path d="M6 24h36" stroke="#7a4310" stroke-width="2"/><rect x="6" y="10" width="36" height="12" rx="5" fill="#f6b247" stroke="#7a4310" stroke-width="2"/><rect x="20" y="22" width="8" height="9" rx="2" fill="#fff3c4" stroke="#7a4310" stroke-width="2"/></svg>',
    ticket: '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="rwtg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8bd3ff"/><stop offset="1" stop-color="#7c5cfc"/></linearGradient></defs><path d="M6 14h36v7a3 3 0 0 0 0 6v7H6v-7a3 3 0 0 0 0-6v-7Z" fill="url(#rwtg)" stroke="#2f2a7a" stroke-width="2" stroke-linejoin="round"/><path d="M30 14v20" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-dasharray="3 3"/><path d="m17 20 2.2 4.4 4.8.7-3.5 3.4.8 4.8L17 31l-4.3 2.3.8-4.8L10 25.1l4.8-.7L17 20Z" fill="#fff" fill-opacity=".92"/></svg>',
    coins: '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="rwcn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe07a"/><stop offset="1" stop-color="#e7a21f"/></linearGradient></defs><ellipse cx="24" cy="35" rx="15" ry="6" fill="url(#rwcn)" stroke="#8b5e14" stroke-width="2"/><path d="M9 35v-6c0 3.3 6.7 6 15 6s15-2.7 15-6v6" fill="#d9921c" stroke="#8b5e14" stroke-width="2"/><ellipse cx="24" cy="27" rx="15" ry="6" fill="url(#rwcn)" stroke="#8b5e14" stroke-width="2"/><path d="M9 27v-6c0 3.3 6.7 6 15 6s15-2.7 15-6v6" fill="#d9921c" stroke="#8b5e14" stroke-width="2"/><ellipse cx="24" cy="19" rx="15" ry="6" fill="url(#rwcn)" stroke="#8b5e14" stroke-width="2"/><text x="24" y="22" text-anchor="middle" font-size="9" font-weight="900" fill="#8b5e14">$</text></svg>',
    crown: '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="rwcr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a6"/><stop offset="1" stop-color="#f0a41c"/></linearGradient></defs><path d="M6 34 4 14l10 9 10-15 10 15 10-9-2 20H6Z" fill="url(#rwcr)" stroke="#8b5e14" stroke-width="2" stroke-linejoin="round"/><rect x="6" y="36" width="36" height="6" rx="2" fill="#f0a41c" stroke="#8b5e14" stroke-width="2"/><circle cx="24" cy="8" r="2.6" fill="#ff6a8e"/><circle cx="4" cy="14" r="2.2" fill="#6ad8ff"/><circle cx="44" cy="14" r="2.2" fill="#6ad8ff"/></svg>'
  };

  var TIERS = [
    { name: 'Rookie', from: 1, to: 10, c1: '#5be6b0', c2: '#2fa879' },
    { name: 'Scholar', from: 11, to: 20, c1: '#6cc6ff', c2: '#2f7fe0' },
    { name: 'Adept', from: 21, to: 30, c1: '#b79bff', c2: '#7a52e6' },
    { name: 'Master', from: 31, to: 40, c1: '#ff9bd0', c2: '#e0488f' },
    { name: 'Legend', from: 41, to: 50, c1: '#ffd56a', c2: '#f08a1c' }
  ];
  function tierOf(level) { return TIERS[Math.min(4, Math.floor((level - 1) / 10))]; }

  /* ---------- header + tabs ---------- */
  var TAB_DEFS = [
    ['battlepass', 'Battle Pass', IC.bp],
    ['packs', 'Packs', IC.packs],
    ['daily', 'Daily Wheel', IC.wheel],
    ['avatar', 'Avatar', IC.avatar],
    ['inventory', 'Inventory', IC.inv]
  ];
  function headerHtml(tab) {
    var s = st(), p = s.progress || {}, daily = {}, cap = 500, remaining = 0, pct = 0;
    try { daily = getDailyCoinState(); cap = DAILY_COIN_CAP; remaining = Math.max(0, cap - daily.earned); pct = Math.min(100, daily.earned / cap * 100); } catch (e) { }
    var tokens = Math.max(0, Number(p.freePackTokens) || 0), crates = Math.max(0, Number(p.skinCrates) || 0);
    var tabs = TAB_DEFS.map(function (t) {
      return '<button type="button" class="rw-tab' + (tab === t[0] ? ' active' : '') + '" data-action="reward-tab" data-tab="' + t[0] + '" onclick="setRewardsTab(\'' + t[0] + '\')" role="tab" aria-selected="' + (tab === t[0]) + '"><span class="rw-tab-ic">' + t[2] + '</span><span>' + t[1] + '</span></button>';
    }).join('');
    return '<header class="rw-head">' +
      '<div class="rw-head-copy"><div class="rw-eyebrow">INDEX REWARDS</div><h2>Learn. Level up. <span>Unlock.</span></h2>' +
      '<p>Every lesson, practice set, quiz and game pushes your XP forward. Live Games are the source of coins for cosmetic packs.</p></div>' +
      '<div class="rw-wallet">' +
      '<div class="rw-chip rw-chip-coin" title="Coins"><span class="rw-chip-ic">' + coin(26) + '</span><span><small>Coins</small><b>' + (p.coins || 0) + '</b></span></div>' +
      '<div class="rw-chip" title="Free pack tokens"><span class="rw-chip-ic rw-ic-ticket">' + IC.ticket + '</span><span><small>Free packs</small><b>' + tokens + '</b></span></div>' +
      '<div class="rw-chip" title="Skin crates"><span class="rw-chip-ic rw-ic-crate">' + IC.crate + '</span><span><small>Skin crates</small><b>' + crates + '</b></span></div>' +
      '</div></header>' +
      '<div class="rw-tabs" role="tablist" aria-label="Rewards sections">' + tabs + '</div>' +
      '<div class="rw-cap" title="Daily coin earning limit"><span class="rw-cap-l">Daily coin limit</span><div class="rw-cap-bar"><i style="width:' + pct.toFixed(0) + '%"></i></div><span class="rw-cap-r">' + (daily.earned || 0) + ' / ' + cap + ' · ' + remaining + ' left</span></div>';
  }

  /* ---------- Battle Pass ---------- */
  function rewardArt(r, owned) {
    if (r.finale) return '<div class="rw-art rw-art-crown">' + IC.crown + '</div>';
    if (r.indexling) { var c = ling(r.indexling); if (c) return '<div class="rw-art rw-art-ling">' + art(c, true) + '</div>'; }
    if (r.skinCrates && !r.packTokens && r.coins < 100 && r.level % 5 !== 0) return '<div class="rw-art">' + IC.crate + '</div>';
    if (r.level % 5 === 0) return '<div class="rw-art rw-art-chest">' + IC.crate + '</div>';
    if (r.packTokens) return '<div class="rw-art">' + IC.ticket + '</div>';
    return '<div class="rw-art">' + IC.coins + '</div>';
  }
  function chips(r) {
    var o = [];
    if (r.coins) o.push('<span class="rw-pill rw-pill-coin">' + coin(13) + r.coins + '</span>');
    if (r.skinCrates) o.push('<span class="rw-pill rw-pill-crate"><i>' + IC.crate + '</i>×' + r.skinCrates + '</span>');
    if (r.packTokens) o.push('<span class="rw-pill rw-pill-pack"><i>' + IC.ticket + '</i>×' + r.packTokens + '</span>');
    if (r.finale) o.push('<span class="rw-pill rw-pill-leg">Legendary Indexling</span>');
    else if (r.indexling) { var c = ling(r.indexling); o.push('<span class="rw-pill rw-pill-ling">' + E(c ? c.name : 'Indexling') + '</span>'); }
    return o.join('');
  }
  function lvlCard(r, lvl) {
    var reached = r.level <= lvl, cur = r.level === lvl, next = r.level === lvl + 1;
    var cls = 'rw-lvl' + (reached ? ' claimed' : ' locked') + (cur ? ' current' : '') + (next ? ' next' : '') + (r.level % 5 === 0 ? ' milestone' : '') + (r.finale ? ' finale' : '');
    var t = tierOf(r.level);
    return '<article class="' + cls + '" data-level="' + r.level + '" style="--t1:' + t.c1 + ';--t2:' + t.c2 + '">' +
      '<div class="rw-lvl-top"><span class="rw-lvl-num">LV ' + r.level + '</span>' + (reached ? '<span class="rw-lvl-ok" aria-label="Claimed">✓</span>' : (next ? '<span class="rw-lvl-flag">NEXT</span>' : '<span class="rw-lvl-lock" aria-label="Locked">🔒</span>')) + '</div>' +
      rewardArt(r) +
      '<div class="rw-lvl-name">' + E(r.name) + '</div>' +
      '<div class="rw-lvl-chips">' + chips(r) + '</div>' +
      (cur ? '<div class="rw-lvl-here">YOU ARE HERE</div>' : '') +
      '</article>';
  }
  function bpHtml() {
    var s = st(), p = s.progress || {}, lvl = battlePassLevel(), xp = p.xp || 0, into = lvl >= 50 ? 100 : xp % 100, crates = Math.max(0, Number(p.skinCrates) || 0);
    var cur = tierOf(lvl), nextR = BP_REWARDS[lvl] || null, fin = BP_REWARDS[49];
    var nextHtml = nextR ? '<div class="rw-next-card"><div class="rw-next-k">NEXT REWARD · LEVEL ' + nextR.level + '</div><div class="rw-next-body">' + rewardArt(nextR) + '<div><div class="rw-next-name">' + E(nextR.name) + '</div><div class="rw-lvl-chips">' + chips(nextR) + '</div></div></div></div>' : '<div class="rw-next-card"><div class="rw-next-k">PASS COMPLETE</div><div class="rw-next-name">Every reward claimed</div></div>';
    var done = lvl >= 50;
    var finHtml = '<div class="rw-fin-card' + (done ? ' done' : '') + '"><div class="rw-fin-glow"></div><div class="rw-fin-k">FINAL REWARD · LEVEL 50</div><div class="rw-fin-body"><div class="rw-art rw-art-crown">' + IC.crown + '</div><div><div class="rw-fin-name">' + E(fin.name) + '</div><div class="rw-lvl-chips">' + chips(fin) + '</div></div></div><div class="rw-fin-prog"><i style="width:' + Math.min(100, ((lvl - 1) * 100 + into) / 49 / 1).toFixed(1) + '%"></i></div><div class="rw-fin-sub">' + (done ? 'Unlocked — you finished the pass!' : (50 - lvl) + ' levels to go') + '</div></div>';
    var tiers = TIERS.map(function (t) {
      var items = BP_REWARDS.filter(function (r) { return r.level >= t.from && r.level <= t.to; });
      var got = items.filter(function (r) { return r.level <= lvl; }).length;
      return '<section class="rw-tier" style="--t1:' + t.c1 + ';--t2:' + t.c2 + '"><header class="rw-tier-h"><div><span class="rw-tier-n">' + t.name + ' tier</span><span class="rw-tier-r">Levels ' + t.from + '–' + t.to + '</span></div><div class="rw-tier-p"><i style="width:' + (got * 10) + '%"></i></div><span class="rw-tier-c">' + got + '/10</span></header><div class="rw-track">' + items.map(function (r) { return lvlCard(r, lvl); }).join('') + '</div></section>';
    }).join('');
    return '<div class="rw-bp">' +
      '<section class="rw-bp-hero" style="--t1:' + cur.c1 + ';--t2:' + cur.c2 + '">' +
      '<div class="rw-ring" style="--p:' + (lvl >= 50 ? 100 : into) + '"><div class="rw-ring-in"><small>LEVEL</small><b>' + lvl + '</b><span>of 50</span></div></div>' +
      '<div class="rw-bp-info"><div class="rw-eyebrow">INDEX BATTLE PASS · ' + cur.name.toUpperCase() + ' TIER</div><h3>' + (lvl >= 50 ? 'Pass complete!' : 'Level ' + lvl) + '</h3><div class="rw-xpbar"><i style="width:' + (lvl >= 50 ? 100 : into) + '%"></i></div><p>' + (lvl >= 50 ? 'You earned every reward.' : into + ' / 100 XP · ' + (100 - into) + ' XP to level ' + (lvl + 1)) + '</p></div>' +
      nextHtml + finHtml + '</section>' +
      '<section class="rw-crate-bar"><div class="rw-crate-ic">' + IC.crate + '</div><div><strong>Skin Crates</strong><span>Crates contain a random skin for a random Indexling.</span></div><div class="rw-crate-n">' + crates + '</div><button class="rw-btn rw-btn-gold" data-action="open-skin-crate" ' + (crates > 0 ? '' : 'disabled') + '>Open crate</button></section>' +
      tiers + '</div>';
  }

  /* ---------- Inventory ---------- */
  var RAR = ['Legendary', 'Epic', 'Rare', 'Common'];
  var PACK_LABEL = { candy: 'Candy Carnival', medieval: 'Medieval Keep', robo: 'Robo Works', ocean: 'Deep Sea', arcade: 'Arcade Afterdark', cosmic: 'Cosmic Odyssey' };
  var inv = window.__rwInv = window.__rwInv || { pack: 'all', rar: 'all', show: 'all' };
  function invHtml() {
    var s = st(), p = s.progress || {}, owned = p.unlockedCosmetics || [], eq = p.equipped || {};
    var all = REWARD_COSMETICS.filter(function (c) { return c.type === 'indexling'; });
    var skins = (p.unlockedSkins || []).map(function (e) { return typeof e === 'string' ? { skinId: e, indexlingId: 'ling-sugarbug' } : e; }).filter(function (r) { return r && skinById(r.skinId) && ling(r.indexlingId); });
    var list = all.filter(function (c) {
      var ok = owned.indexOf(c.id) >= 0;
      return (inv.pack === 'all' || c.pack === inv.pack) && (inv.rar === 'all' || c.rarity === inv.rar) && (inv.show === 'all' || (inv.show === 'owned') === ok);
    }).sort(function (a, b) { return (owned.indexOf(b.id) >= 0) - (owned.indexOf(a.id) >= 0) || RAR.indexOf(a.rarity) - RAR.indexOf(b.rarity) || a.name.localeCompare(b.name); });
    var stats = '<div class="rw-inv-stats">' +
      '<div><b>' + owned.length + '<em>/' + all.length + '</em></b><span>Indexlings</span></div>' +
      '<div><b>' + skins.length + '</b><span>Skins</span></div>' +
      '<div><b>' + (Number(p.skinCrates) || 0) + '</b><span>Skin crates</span></div>' +
      '<div><b>' + (Number(p.openedPacks) || 0) + '</b><span>Packs opened</span></div></div>';
    function chip(group, val, label) { return '<button type="button" class="rw-f' + (inv[group] === val ? ' on' : '') + '" data-rw-f="' + group + ':' + val + '">' + label + '</button>'; }
    var filters = '<div class="rw-filters">' +
      '<div class="rw-fgroup">' + chip('show', 'all', 'All') + chip('show', 'owned', 'Owned') + chip('show', 'locked', 'Locked') + '</div>' +
      '<div class="rw-fgroup">' + chip('rar', 'all', 'Any rarity') + RAR.map(function (r) { return chip('rar', r, r); }).join('') + '</div>' +
      '<div class="rw-fgroup">' + chip('pack', 'all', 'All packs') + PACK_ORDER.map(function (k) { return chip('pack', k, PACK_LABEL[k] || k); }).join('') + '</div></div>';
    var cards = list.map(function (c) {
      var ok = owned.indexOf(c.id) >= 0, isEq = eq.indexling === c.id, sk = ok && typeof getEquippedSkinForIndexling === 'function' ? getEquippedSkinForIndexling(c.id) : null;
      var rc = 'r-' + c.rarity.toLowerCase();
      if (!ok) return '<div class="rw-ic ' + rc + ' locked"><div class="rw-ic-art"><div class="indexling-mystery">?</div></div><div class="rw-ic-name">Locked</div><div class="rw-ic-sub">' + E(PACK_LABEL[c.pack] || c.pack) + '</div><span class="rw-gem">' + E(c.rarity) + '</span></div>';
      return '<div class="rw-ic ' + rc + (isEq ? ' equipped' : '') + '"><div class="rw-ic-art">' + art(c, true, sk) + '</div><div class="rw-ic-name">' + E(c.name) + '</div><div class="rw-ic-sub">' + E(PACK_LABEL[c.pack] || c.pack) + (sk ? ' · ' + (skinById(sk.id || sk) ? E((skinById(sk.id || sk) || {}).name || 'Skin') : 'Skin') : '') + '</div><span class="rw-gem">' + E(c.rarity) + '</span>' +
        '<button class="rw-btn ' + (isEq ? 'rw-btn-ghost' : 'rw-btn-blue') + ' rw-btn-sm" data-action="equip-cosmetic" data-id="' + c.id + '">' + (isEq ? '★ Equipped' : 'Equip') + '</button></div>';
    }).join('');
    var skinCards = skins.map(function (r) {
      var sk = skinById(r.skinId), l = ling(r.indexlingId), act = typeof getEquippedSkinId === 'function' && getEquippedSkinId(l.id) === sk.id;
      return '<div class="rw-skin ' + (act ? 'on' : '') + '"><div class="rw-skin-art">' + art(l, true, sk) + '</div><div class="rw-skin-t"><b>' + sk.icon + ' ' + E(sk.name) + '</b><span>' + E(l.name) + ' · ' + E(sk.rarity) + '</span></div>' +
        '<div class="rw-skin-a"><button class="rw-btn ' + (act ? 'rw-btn-ghost' : 'rw-btn-blue') + ' rw-btn-sm" data-action="equip-indexling-skin" data-indexling="' + l.id + '" data-skin="' + sk.id + '">' + (act ? '★ Equipped' : 'Equip skin') + '</button>' + (act ? '<button class="rw-btn rw-btn-ghost rw-btn-sm" data-action="unequip-indexling-skin" data-indexling="' + l.id + '">Remove</button>' : '') + '</div></div>';
    }).join('');
    return '<div class="rw-inv">' + stats + filters +
      '<div class="rw-inv-grid">' + (cards || '<div class="rw-empty">No Indexlings match these filters.</div>') + '</div>' +
      '<section class="rw-inv-skins"><h3>Skin collection</h3><p>Each skin belongs to the Indexling it was rolled for. Keep several and equip them independently.</p>' +
      (skinCards ? '<div class="rw-skin-grid">' + skinCards + '</div>' : '<div class="rw-empty">No skins yet — open a Skin Crate from the Battle Pass or quests.</div>') + '</section></div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-rw-f]') : null;
    if (!b) return;
    var kv = b.getAttribute('data-rw-f').split(':');
    inv[kv[0]] = kv[1];
    try { renderRewards(); } catch (err) { }
  });

  /* ---------- hook: wrap the original renderer ---------- */
  var bodies = { battlepass: bpHtml, inventory: invHtml };
  var extra = window.__rwBodies = bodies;   /* packs / daily registered by later sections */
  var orig = window.renderRewards;
  if (typeof orig !== 'function') return;
  window.renderRewards = function () {
    var r = orig.apply(this, arguments);
    try { enhance(); } catch (err) { console.error('[Rewards UI] falling back to original markup', err); }
    return r;
  };
  function enhance() {
    var s = st(), root = document.getElementById('rewards-stage');
    if (!s || !root || !s.account) return;
    var page = root.querySelector('.rewards-page'), main = root.querySelector('.rewards-main');
    if (!page || !main) return;
    var tab = s.rewardsTab || 'battlepass';
    var maker = extra[tab];
    var oldNodes = [].slice.call(main.children);
    var keep = '';
    if (!maker) {   /* avatar tab: keep the existing body, just re-skin it */
      var idx = oldNodes.findIndex(function (n) { return n.classList && n.classList.contains('daily-cap'); });
      keep = oldNodes.slice(idx + 1).map(function (n) { return n.outerHTML; }).join('');
    }
    var body = maker ? maker() : '<div class="rw-legacy">' + keep + '</div>';
    root.classList.add('rw');
    main.innerHTML = headerHtml(tab) + '<div class="rw-body rw-body-' + tab + '">' + body + '</div>';
    var rail = root.querySelector('.rewards-rail'); if (rail) rail.remove();
    try { if (window.__rwAfter) window.__rwAfter(tab, main); } catch (err) { }
  }
})();
