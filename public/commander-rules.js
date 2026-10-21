/* Troop Commander rules layer: troop stats, deployed-troops panel, wave speed.
 * Loaded after the main script. Everything is guarded so a failure here
 * leaves the game running on its previous behavior. */
(function () {
  'use strict';
  if (window.__cmdRules) return;
  window.__cmdRules = true;

  function game() { try { return typeof state !== 'undefined' && state && state.games ? state.games : null; } catch (e) { return null; } }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(m) { try { if (typeof showRewardToast === 'function') showRewardToast(m); } catch (e) { } }
  function save(g) { try { if (window.v6Save) window.v6Save(g); } catch (e) { } }
  function coinSvg(n) {
    return '<svg viewBox="0 0 24 24" width="' + (n || 14) + '" height="' + (n || 14) + '" aria-hidden="true"><circle cx="12" cy="12" r="9.1" fill="#f6c945" stroke="#8b5e14" stroke-width="1.7"/><circle cx="12" cy="12" r="6.3" fill="#ffdf72" stroke="#c48a16" stroke-width="1.1"/></svg>';
  }

  /* ---------- Troop stats (same for every account, no rarity) ---------- */
  var MAX_LEVEL = 10;
  function baseDef(id) {
    var list = window.COMMANDER_TROOPS_FINAL;
    if (!Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function stats(id, lvl) {
    var r = baseDef(id) || (window.COMMANDER_TROOPS_FINAL && window.COMMANDER_TROOPS_FINAL[0]) || { damage: 7, range: 125, rate: 700, cooldown: 7, power: 1, cost: 6, shot: '#9fe8ff' };
    var l = Math.max(1, Math.min(MAX_LEVEL, Number(lvl) || 1));
    var cost = Math.max(1, Number(r.cost) || 6);
    var dmgMult = 1.6 + cost * 0.12;            /* pricier troops hit much harder */
    return {
      damage: Math.max(1, Math.round((Number(r.damage) || 5) * dmgMult * (1 + (l - 1) * 0.25))),
      range: Math.round((Number(r.range) || 120) + (l - 1) * 7),
      rate: Math.max(300, Math.round((Number(r.rate) || 900) / (1 + (l - 1) * 0.06))),
      cooldown: Math.max(3, Math.round((Number(r.cooldown) || 8) / (1 + (l - 1) * 0.06))),
      power: (Number(r.power) || 1) * (1 + (l - 1) * 0.2),
      shot: r.shot || '#9fe8ff'
    };
  }
  window.richStats = stats;
  window.tdef = function (id) { return baseDef(id); };

  function upgradeCost(t) {
    var r = baseDef(t.id), c = Math.max(1, Number(r && r.cost) || 6);
    return Math.round(c * (0.8 + (Math.max(1, Number(t.level) || 1)) * 0.45));
  }
  function sellValue(t) {
    var r = baseDef(t.id), c = Math.max(1, Number(r && r.cost) || 6), spent = c;
    for (var l = 1; l < (Number(t.level) || 1); l++) spent += upgradeCost({ id: t.id, level: l });
    return Math.max(2, Math.floor(spent * 0.6));
  }
  var HEAL_COST = 10;

  /* ---------- Wave speed ---------- */
  var SPEEDS = [0.5, 1, 2];
  window.__cmdSpeed = 1;
  try { var sv = Number(localStorage.getItem('cmd-wave-speed')); if (SPEEDS.indexOf(sv) >= 0) window.__cmdSpeed = sv; } catch (e) { }
  function paintSpeed() {
    var cur = window.__cmdSpeed;
    document.querySelectorAll('[data-cmd-speed]').forEach(function (b) {
      var on = Number(b.getAttribute('data-cmd-speed')) === cur;
      if (b.classList.contains('active') !== on) b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-cmd-speed]') : null;
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var v = Number(b.getAttribute('data-cmd-speed'));
    if (SPEEDS.indexOf(v) < 0) return;
    window.__cmdSpeed = v;
    try { localStorage.setItem('cmd-wave-speed', String(v)); } catch (err) { }
    paintSpeed();
  }, true);

  /* ---------- Deployed troops panel ---------- */
  var actions = {
    upgrade: function (i) {
      var g = game(), t = g && g.towers && g.towers[i];
      if (!g || !t || g.questionGateOpen) return;
      var lvl = Math.max(1, Number(t.level) || 1);
      if (lvl >= MAX_LEVEL) return;
      var cost = upgradeCost(t);
      if (Number(g.waveCoins || 0) < cost) { toast('Need ' + cost + ' deployment coins to upgrade.'); return; }
      g.waveCoins = Number(g.waveCoins) - cost;
      t.level = lvl + 1;
      t.maxHp = Number(t.maxHp || 100) + 18;
      t.hp = t.maxHp;
      save(g); rerender(true);
    },
    heal: function (i) {
      var g = game(), t = g && g.towers && g.towers[i];
      if (!g || !t || g.questionGateOpen) return;
      var max = Number(t.maxHp || 100);
      if (Number(t.hp || 0) >= max) return;
      if (Number(g.waveCoins || 0) < HEAL_COST) { toast('Need ' + HEAL_COST + ' deployment coins to heal.'); return; }
      g.waveCoins = Number(g.waveCoins) - HEAL_COST;
      t.hp = Math.min(max, Number(t.hp || 0) + Math.max(20, max * 0.35));
      save(g); rerender(true);
    },
    sell: function (i) {
      var g = game(), t = g && g.towers && g.towers[i];
      if (!g || !t || g.questionGateOpen || g.running) { if (g && g.running) toast('You can only sell Indexlings between waves.'); return; }
      g.waveCoins = Number(g.waveCoins || 0) + sellValue(t);
      g.towers.splice(i, 1);
      g.selectedTowerIndex = -1;
      save(g); rerender(true);
      try { if (window.syncLayers) window.syncLayers(); } catch (e) { }
    },
    healall: function () {
      var g = game();
      if (!g || g.questionGateOpen) return;
      var hurt = (g.towers || []).filter(function (t) { return Number(t.hp || 0) < Number(t.maxHp || 100); });
      var cost = hurt.length * HEAL_COST;
      if (!hurt.length) return;
      if (Number(g.waveCoins || 0) < cost) { toast('Need ' + cost + ' deployment coins to heal everyone.'); return; }
      g.waveCoins = Number(g.waveCoins) - cost;
      hurt.forEach(function (t) { t.hp = Number(t.maxHp || 100); });
      save(g); rerender(true);
    }
  };

  function artFor(id) {
    try {
      var c = typeof cosmeticById === 'function' ? cosmeticById(id) : null;
      if (c && typeof indexlingArtHtml === 'function') {
        var a = indexlingArtHtml(c, true, typeof getEquippedSkinForIndexling === 'function' ? getEquippedSkinForIndexling(id) : null);
        if (a) return a;
      }
    } catch (e) { }
    return '<span style="font-size:26px">✦</span>';
  }

  function cardHtml(g, t, i) {
    var r = baseDef(t.id) || {};
    var lvl = Math.max(1, Math.min(MAX_LEVEL, Number(t.level) || 1));
    var st = stats(t.id, lvl), nx = lvl < MAX_LEVEL ? stats(t.id, lvl + 1) : null;
    var dps = Math.round(st.damage * 1000 / st.rate * 10) / 10;
    var hp = Math.max(0, Number(t.hp == null ? t.maxHp || 100 : t.hp)), max = Math.max(1, Number(t.maxHp || 100));
    var pct = Math.max(0, Math.min(100, hp / max * 100));
    var coins = Number(g.waveCoins || 0), locked = !!g.questionGateOpen;
    var uc = upgradeCost(t), canUp = !locked && lvl < MAX_LEVEL && coins >= uc;
    var canHeal = !locked && hp < max && coins >= HEAL_COST;
    var canSell = !locked && !g.running;
    var pips = '';
    for (var k = 1; k <= MAX_LEVEL; k++) pips += '<i class="' + (k <= lvl ? 'on' : '') + '"></i>';
    var role = (r.category || r.role || 'Indexling');
    var upLabel = lvl >= MAX_LEVEL ? 'MAX LEVEL' : 'Upgrade';
    var upExtra = lvl >= MAX_LEVEL ? '' : '<em>' + coinSvg(12) + uc + '</em>';
    var delta = nx ? '<small class="cmd-delta">+' + (nx.damage - st.damage) + ' dmg next level</small>' : '<small class="cmd-delta">Fully upgraded</small>';
    var cname = (typeof cosmeticById === 'function' && cosmeticById(t.id) || {}).name || r.name || 'Indexling';
    return '<div class="cmd-troop" data-cmd-i="' + i + '">' +
      '<div class="cmd-troop-head"><div class="cmd-troop-art">' + artFor(t.id) + '</div>' +
      '<div class="cmd-troop-id"><b>' + esc(cname) + '</b><span>' + esc(role) + '</span></div>' +
      '<div class="cmd-lvl"><small>LV</small><b>' + lvl + '</b></div></div>' +
      '<div class="cmd-pips" title="Level ' + lvl + ' of ' + MAX_LEVEL + '">' + pips + '</div>' +
      '<div class="cmd-hp' + (pct < 35 ? ' low' : '') + '"><i style="width:' + pct.toFixed(0) + '%"></i><em>' + Math.ceil(hp) + ' / ' + max + ' HP</em></div>' +
      '<div class="cmd-stats"><span><i>DMG</i><b>' + st.damage + '</b></span><span><i>RNG</i><b>' + st.range + '</b></span><span><i>DPS</i><b>' + dps + '</b></span></div>' +
      delta +
      '<div class="cmd-actions">' +
      '<button type="button" class="cmd-up" data-cmd-act="upgrade" ' + (canUp ? '' : 'disabled') + '><span>⬆ ' + upLabel + '</span>' + upExtra + '</button>' +
      '<button type="button" data-cmd-act="heal" ' + (canHeal ? '' : 'disabled') + '><span>♥ Heal</span><em>' + coinSvg(12) + HEAL_COST + '</em></button>' +
      '<button type="button" class="cmd-sell" data-cmd-act="sell" ' + (canSell ? '' : 'disabled') + '><span>Sell</span><em>+' + coinSvg(12) + sellValue(t) + '</em></button>' +
      '</div></div>';
  }

  function summaryHtml(g) {
    var ts = g.towers || [], dps = 0, hurt = 0;
    ts.forEach(function (t) { var s = stats(t.id, t.level); dps += s.damage * 1000 / s.rate; if (Number(t.hp == null ? t.maxHp : t.hp) < Number(t.maxHp || 100)) hurt++; });
    var canHealAll = !g.questionGateOpen && hurt > 0 && Number(g.waveCoins || 0) >= hurt * HEAL_COST;
    return '<div class="cmd-summary"><div><b>' + ts.length + '</b><span>Deployed</span></div><div><b>' + (Math.round(dps * 10) / 10) + '</b><span>Total DPS</span></div>' +
      '<button type="button" data-cmd-act="healall" ' + (canHealAll ? '' : 'disabled') + '>Heal all' + (hurt ? ' · ' + hurt * HEAL_COST : '') + '</button></div>';
  }

  var lastSig = '';
  function rerender(force) {
    var g = game();
    if (!g || g.active !== 'commander' || g.phase !== 'battle' || g.questionGateOpen) { lastSig = ''; return; }
    var box = document.querySelector('#games-stage .commander-auth-side-left .commander-auth-active');
    if (!box) { lastSig = ''; return; }
    var sig = (g.towers || []).map(function (t) { return [t.id, t.level, Math.ceil(Number(t.hp || 0)), t.maxHp].join(':'); }).join('|') +
      '#' + Math.floor(Number(g.waveCoins) || 0) + '#' + (g.running ? 1 : 0);
    if (!force && sig === lastSig && box.getAttribute('data-cmd') === '1') return;
    lastSig = sig;
    var list = g.towers || [];
    box.setAttribute('data-cmd', '1');
    box.classList.add('cmd-active');
    if (!list.length) {
      box.innerHTML = '<div class="cmd-empty"><div class="cmd-empty-icon">＋</div><b>No Indexlings deployed</b><span>Pick an Indexling from the arsenal, then click a free spot on the map. Deployed troops show up here with upgrade, heal and sell controls.</span></div>';
      return;
    }
    box.innerHTML = summaryHtml(g) + list.map(function (t, i) { return cardHtml(g, t, i); }).join('');
  }

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-cmd-act]') : null;
    if (!b || b.disabled) return;
    e.preventDefault(); e.stopPropagation();
    var act = b.getAttribute('data-cmd-act'), card = b.closest('[data-cmd-i]');
    var i = card ? Number(card.getAttribute('data-cmd-i')) : -1;
    if (actions[act]) actions[act](i);
  }, true);

  /* Hovering a deployed card highlights that Indexling on the map. */
  function flash(i, on) {
    var el = document.querySelector('.commander-pack-v4-unit[data-pack-v4-unit="' + i + '"]');
    if (el) el.classList.toggle('cmd-flash', on);
  }
  document.addEventListener('mouseover', function (e) {
    var c = e.target && e.target.closest ? e.target.closest('.cmd-troop') : null;
    if (c) flash(c.getAttribute('data-cmd-i'), true);
  });
  document.addEventListener('mouseout', function (e) {
    var c = e.target && e.target.closest ? e.target.closest('.cmd-troop') : null;
    if (c) flash(c.getAttribute('data-cmd-i'), false);
  });

  /* ---------- Coin rewards ----------
   * Older runtime layers adjust the gate reward after the fact (one subtracts
   * 10 on a wrong answer, another can re-set the balance). This outermost
   * wrapper makes the reward deterministic: +20 correct, +5 wrong. */
  var REWARD_CORRECT = 20, REWARD_WRONG = 5, WAVE_CLEAR_BONUS = 5;
  function rerenderGate(g) { try { if (window.__cmdRenderBattle) window.__cmdRenderBattle(g); } catch (e) { } }
  function wrapAnswer() {
    var inner = window.__commanderAnswerV6;
    if (typeof inner !== 'function' || inner.__cmdReward) return;
    var outer = function (i, e) {
      var g = game();
      var ok = !!(g && g.active === 'commander' && g.questionGateOpen && g.question && !g.questionFeedback);
      var before = ok ? Number(g.waveCoins || 0) : 0;
      var correct = ok && Number(i) === Number(g.question.correct);
      var r = inner.apply(this, arguments);
      g = game();
      if (ok && g && g.questionFeedback) {
        var reward = correct ? REWARD_CORRECT : REWARD_WRONG;
        g.waveCoins = before + reward;
        g.__cmdBanked = g.waveCoins;
        save(g);
        rerenderGate(g);
        toast('🪙 +' + reward + ' deployment coins');
      }
      return r;
    };
    outer.__cmdReward = true;
    window.__commanderAnswerV6 = outer;
  }
  function wrapEnter() {
    var inner = window.__commanderEnterBattlefieldV7;
    if (typeof inner !== 'function' || inner.__cmdBank) return;
    var outer = function (e) {
      var g = game();
      var banked = g && Number(g.__cmdBanked) || 0;
      var r = inner.apply(this, arguments);
      g = game();
      if (g && banked > 0 && Number(g.waveCoins || 0) < banked) { g.waveCoins = banked; save(g); }
      if (g) g.__cmdBanked = 0;
      return r;
    };
    outer.__cmdBank = true;
    window.__commanderEnterBattlefieldV7 = outer;
  }
  /* This file loads before the later runtime layers that also wrap these handlers,
   * so re-wrap until ours is the outermost one. */
  function ensureWrapped() { if (document.readyState !== "complete") return; wrapAnswer(); wrapEnter(); }

  /* +5 coins for every cleared wave (granted once, as the question gate opens). */
  var wasRunning = false;
  function watchWaveClear() {
    var g = game();
    if (!g || g.active !== 'commander') { wasRunning = false; return; }
    if (g.running) { wasRunning = true; return; }
    if (wasRunning && g.questionGateOpen && !g.finished && Number(g.base) > 0 && g.__cmdBonusWave !== g.wave) {
      g.__cmdBonusWave = g.wave;
      g.waveCoins = Number(g.waveCoins || 0) + WAVE_CLEAR_BONUS;
      g.__cmdBanked = Math.max(Number(g.__cmdBanked) || 0, 0);
      save(g);
      rerenderGate(g);
      toast('🪙 +' + WAVE_CLEAR_BONUS + ' coins for clearing wave ' + g.wave);
    }
    wasRunning = false;
  }

  setInterval(function () { try { ensureWrapped(); watchWaveClear(); rerender(false); paintSpeed(); } catch (e) { console.error('[Commander rules] panel update failed', e); } }, 200);
})();
