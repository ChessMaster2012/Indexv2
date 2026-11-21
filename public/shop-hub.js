/* Shop, Quests & More  +  Notes & Study Sets: two merged sidebar tabs with a small tab bar, plus the Potion Market
   (one shared market for every player, restocks every hour, first come first served; luck potions change pack and crate odds). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ic(n, s) { try { return IX.icon(n, s || 16); } catch (e) { return ''; } }
  function toast(m) { try { showRewardToast(m); } catch (e) { } }
  function api(path, body) {
    return fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, credentials: 'same-origin', cache: 'no-store', body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._status = r.status; return d; }); });
  }

  /* ---------- merged tabs ---------- */
  var GROUPS = {
    shop: { parent: 'rewards', tabs: [['rewards', 'Rewards', 'trophy'], ['quests', 'Quests', 'target'], ['potions', 'Potion Market', 'flask-conical']] },
    notes: { parent: 'notes', tabs: [['notes', 'Notes', 'notebook-pen'], ['studysets', 'Study Sets', 'layers']] }
  };
  function groupOf(v) { for (var g in GROUPS) if (GROUPS[g].tabs.some(function (t) { return t[0] === v; })) return g; return ''; }

  var css = document.createElement('style');
  css.textContent =
    '.nav-btn[data-view="quests"],.nav-btn[data-view="studysets"]{display:none!important}' +
    '#hub-tabs{display:none;gap:6px;align-items:center;margin:0 0 18px;padding:5px;border:1px solid var(--rd-line,rgba(255,255,255,.12));border-radius:12px;background:var(--rd-surface,rgba(255,255,255,.03));width:fit-content;max-width:100%;overflow-x:auto}' +
    '#hub-tabs.on{display:flex}' +
    '#hub-tabs button{display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border-radius:9px;border:0;background:transparent;color:var(--rd-text-2,#aab);font:inherit;font-weight:600;font-size:14px;cursor:pointer;white-space:nowrap}' +
    '#hub-tabs button:hover{color:var(--rd-text,#fff)}' +
    '#hub-tabs button.on{background:#ff7a4d;color:#1a0d07}' +
    '#hub-tabs .hub-luck{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;background:rgba(60,196,143,.15);color:#3cc48f;font-weight:700;font-size:13px;white-space:nowrap}' +
    '#view-potions .pm-wrap{max-width:1040px}' +
    '#view-potions h2{font-size:24px;font-weight:600;margin:0 0 4px}' +
    '#view-potions .pm-sub{color:var(--rd-text-2,#aab);margin:0 0 16px;max-width:640px}' +
    '#view-potions .pm-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:0 0 18px}' +
    '#view-potions .pm-pill{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;border:1px solid var(--rd-line,rgba(255,255,255,.14));background:var(--rd-surface,rgba(255,255,255,.03));font-weight:600;font-size:14px}' +
    '#view-potions .pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}' +
    '#view-potions .pm-card{display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid var(--rd-line,rgba(255,255,255,.12));border-radius:14px;background:var(--rd-surface,rgba(255,255,255,.03));position:relative;overflow:hidden}' +
    '#view-potions .pm-card.out{opacity:.55}' +
    '#view-potions .pm-flask{width:62px;height:62px;border-radius:16px;display:grid;place-items:center;color:var(--pc);background:color-mix(in srgb,var(--pc) 16%,transparent);border:1px solid color-mix(in srgb,var(--pc) 45%,transparent)}' +
    '#view-potions .pm-name{font-weight:700;font-size:15.5px;line-height:1.25}' +
    '#view-potions .pm-rar{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--pc)}' +
    '#view-potions .pm-fx{font-size:13px;color:var(--rd-text-2,#aab)}' +
    '#view-potions .pm-stock{height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}' +
    '#view-potions .pm-stock i{display:block;height:100%;background:var(--pc);border-radius:99px;transition:width .4s}' +
    '#view-potions .pm-left{font-size:12.5px;color:var(--rd-text-2,#aab);display:flex;justify-content:space-between}' +
    '#view-potions .pm-buy{margin-top:2px;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border-radius:10px;border:0;background:#ff7a4d;color:#1a0d07;font:inherit;font-weight:800;cursor:pointer}' +
    '#view-potions .pm-buy[disabled]{background:rgba(255,255,255,.1);color:var(--rd-text-3,#889);cursor:not-allowed}' +
    '#view-potions h3{margin:26px 0 10px;font-size:17px}' +
    '#view-potions .pm-inv{display:flex;flex-wrap:wrap;gap:10px}' +
    '#view-potions .pm-own{display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--rd-line,rgba(255,255,255,.12));border-radius:12px;background:var(--rd-surface,rgba(255,255,255,.03))}' +
    '#view-potions .pm-own button{padding:7px 12px;border-radius:8px;border:1px solid #3cc48f;background:transparent;color:#3cc48f;font:inherit;font-weight:700;cursor:pointer}' +
    '#view-potions .pm-active{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid #3cc48f;border-radius:12px;background:rgba(60,196,143,.1);margin:0 0 18px;font-weight:600}' +
    '#view-potions .pm-msg{min-height:20px;font-size:13.5px;margin:0 0 10px}' +
    '#view-potions .pm-msg.bad{color:#ff8a7a}#view-potions .pm-msg.good{color:#3cc48f}';
  document.head.appendChild(css);

  var strip = null, lastKey = '';
  function ensureStrip() {
    var main = $('.main'); if (!main) return null;
    if (!strip || !strip.isConnected) {
      strip = document.createElement('div'); strip.id = 'hub-tabs';
      strip.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button[data-hub]'); if (!b) return; goTab(b.getAttribute('data-hub'));
      });
      var first = main.querySelector('.view'); main.insertBefore(strip, first || null);
    }
    return strip;
  }
  function goTab(v) {
    if (v === 'quests') { var q = $('.nav-btn[data-view="quests"]'); if (q) q.click(); return; }
    if (typeof switchView === 'function') switchView(v);
  }
  var LUCK = { common: 1.25, uncommon: 1.5, rare: 2, epic: 3, legendary: 5 };
  var NAMES = { common: 'Minor Luck Potion', uncommon: 'Lucky Draught', rare: 'Fortune Elixir', epic: 'Golden Tonic', legendary: 'Four-Leaf Brew' };
  var COLORS = { common: '#9aa7b4', uncommon: '#4fc98a', rare: '#5fa8e8', epic: '#b48cf2', legendary: '#f2b84b' };
  function setData(d) { d._skew = (d.now || Date.now()) - Date.now(); M.data = d; M.active = d.active || null; }
  var M = { data: null, active: null, loading: false, msg: '', msgKind: '' };

  function mm(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
  function tickStrip() {
    var el = ensureStrip(); if (!el) return;
    var v = (typeof state !== 'undefined' && state.view) || '', g = groupOf(v);
    el.classList.toggle('on', !!g);
    var luck = (M.active && M.active.until > Date.now()) ? M.active : null;
    var key = g + '|' + v + '|' + (luck ? luck.id + ':' + Math.ceil((luck.until - Date.now()) / 1000) : '');
    if (key !== lastKey) {
      lastKey = key;
      el.innerHTML = g ? GROUPS[g].tabs.map(function (t) {
        return '<button type="button" data-hub="' + t[0] + '" class="' + (t[0] === v ? 'on' : '') + '">' + ic(t[2], 16) + esc(t[1]) + '</button>';
      }).join('') + (g === 'shop' && luck ? '<span class="hub-luck">' + ic('clover', 15) + 'Luck ×' + LUCK[luck.id] + ' · ' + mm((luck.until - Date.now()) / 1000) + '</span>' : '') : '';
    }
    // keep the merged sidebar button lit while any of its tabs is open
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      var d = b.dataset.view; if (!d) return;
      for (var k in GROUPS) if (d === GROUPS[k].parent && g === k) b.classList.add('active');
    });
    if (v === 'potions' && !tickStrip.inPotions) { tickStrip.inPotions = true; openPotions(); }
    if (v !== 'potions') tickStrip.inPotions = false;
  }

  /* ---------- luck for pack / crate openings ---------- */
  window.PotionLuck = {
    mult: function () { var a = M.active; return (a && a.until > Date.now() && LUCK[a.id]) ? LUCK[a.id] : 1; },
    active: function () { return M.active; }
  };

  /* ---------- Potion Market view ---------- */
  function ensurePotionView() {
    var main = $('.main'); if (!main) return;
    if (!document.getElementById('view-potions')) {
      var sec = document.createElement('section'); sec.className = 'view'; sec.id = 'view-potions'; main.appendChild(sec);
      sec.addEventListener('click', onClick);
    }
  }
  function load(quiet) {
    if (typeof state === 'undefined' || !state.account) { M.data = null; renderPotions(); return Promise.resolve(); }
    if (M.loading) return Promise.resolve(); M.loading = true;
    return api('/api/potions/market').then(function (d) {
      M.loading = false;
      if (d && d.ok) { setData(d); }
      else if (!quiet) { M.msg = (d && d.error) || 'Could not load the market.'; M.msgKind = 'bad'; }
      renderPotions();
    }).catch(function () { M.loading = false; });
  }
  var pollT = null;
  function openPotions() {
    ensurePotionView(); renderPotions(); load();
    clearInterval(pollT);
    pollT = setInterval(function () {
      if (typeof state === 'undefined' || state.view !== 'potions') { clearInterval(pollT); return; }
      load(true);
    }, 8000);
  }
  function renderPotions() {
    var root = document.getElementById('view-potions'); if (!root) return;
    if (typeof state !== 'undefined' && !state.account) {
      root.innerHTML = '<div class="pm-wrap"><h2>Potion Market</h2><p class="pm-sub">Sign in to buy luck potions.</p><button class="btn btn-primary" id="pm-signin" type="button">Sign in</button></div>'; return;
    }
    var d = M.data;
    if (!d) { root.innerHTML = '<div class="pm-wrap"><h2>Potion Market</h2><p class="pm-sub">Loading the market…</p></div>'; return; }
    var left = (d.nextRestock - (Date.now() + (d._skew || 0))) / 1000;
    var coins = (typeof state !== 'undefined' && state.progress && state.progress.coins) || 0;
    var act = (M.active && M.active.until > Date.now()) ? M.active : null;
    var cards = d.potions.map(function (p) {
      var c = COLORS[p.id], pct = p.total ? Math.round(100 * p.left / p.total) : 0, out = p.left <= 0, capped = p.bought >= p.cap, poor = coins < p.price;
      var label = out ? 'Sold out' : capped ? 'Limit reached' : poor ? 'Not enough coins' : 'Buy';
      return '<div class="pm-card' + (out ? ' out' : '') + '" style="--pc:' + c + '"><div class="pm-flask">' + ic('flask-conical', 30) + '</div>' +
        '<div class="pm-rar">' + esc(p.rarity) + '</div><div class="pm-name">' + esc(p.name) + '</div>' +
        '<div class="pm-fx">Luck ×' + p.luck + ' on rare pack and crate drops for ' + p.mins + ' min</div>' +
        '<div class="pm-stock"><i style="width:' + pct + '%"></i></div><div class="pm-left"><span><b>' + p.left + '</b> of ' + p.total + ' left</span><span>You: ' + p.bought + '/' + p.cap + '</span></div>' +
        '<button class="pm-buy" type="button" data-buy="' + p.id + '"' + (out || capped || poor ? ' disabled' : '') + '>' + (out || capped || poor ? '' : (window.indexCoinIconSvg ? window.indexCoinIconSvg(16) : '')) + (out || capped || poor ? label : p.price.toLocaleString()) + '</button></div>';
    }).join('');
    var inv = Object.keys(d.inventory || {}).filter(function (k) { return d.inventory[k] > 0; });
    root.innerHTML = '<div class="pm-wrap"><h2>Potion Market</h2>' +
      '<p class="pm-sub">One market shared by every player on Index. Stock is limited and sold first come, first served, and it all resets at the top of every hour.</p>' +
      '<div class="pm-bar"><span class="pm-pill">' + ic('timer', 16) + 'Restocks in <b id="pm-clock">' + mm(left) + '</b></span><span class="pm-pill">Your coins: <b>' + Number(coins).toLocaleString() + '</b></span></div>' +
      (act ? '<div class="pm-active" style="color:' + COLORS[act.id] + '">' + ic('clover', 22) + '<span style="color:var(--rd-text,#fff)">' + esc(NAMES[act.id]) + ' is working: luck ×' + LUCK[act.id] + ' for <b id="pm-act">' + mm((act.until - Date.now()) / 1000) + '</b> more. Open packs and crates now.</span></div>' : '') +
      '<div class="pm-msg ' + esc(M.msgKind) + '" id="pm-msg">' + esc(M.msg) + '</div>' +
      '<div class="pm-grid">' + cards + '</div>' +
      '<h3>Your potions</h3>' + (inv.length ? '<div class="pm-inv">' + inv.map(function (k) {
        return '<div class="pm-own" style="--pc:' + COLORS[k] + '"><span style="color:' + COLORS[k] + '">' + ic('flask-conical', 22) + '</span><span><b>' + esc(NAMES[k]) + '</b> × ' + d.inventory[k] + '</span><button type="button" data-use="' + k + '">Drink</button></div>';
      }).join('') + '</div>' : '<p class="pm-sub">You do not have any potions yet.</p>') + '</div>';
  }
  setInterval(function () {   // live clocks without redrawing the whole page
    var d = M.data, c = document.getElementById('pm-clock');
    if (d && c) { var left = (d.nextRestock - (Date.now() + (d._skew || 0))) / 1000; c.textContent = mm(left); if (left <= 0 && !M.loading) load(true); }
    var a = document.getElementById('pm-act'); if (a && M.active) a.textContent = mm((M.active.until - Date.now()) / 1000);
    if (M.active && M.active.until <= Date.now()) { M.active = null; if (typeof state !== 'undefined' && state.view === 'potions') renderPotions(); }
  }, 1000);

  function say(m, kind) { M.msg = m; M.msgKind = kind || ''; var el = document.getElementById('pm-msg'); if (el) { el.textContent = m; el.className = 'pm-msg ' + (kind || ''); } }
  var busy = false;
  function onClick(e) {
    var t = e.target;
    if (t.closest && t.closest('#pm-signin')) { try { openSignin(); } catch (x) { } return; }
    var b = t.closest && t.closest('[data-buy]'), u = t.closest && t.closest('[data-use]');
    if (b && !b.disabled) buy(b.getAttribute('data-buy'));
    else if (u) use(u.getAttribute('data-use'));
  }
  function buy(id) {
    if (busy) return; busy = true; say('Buying…');
    var pre = (typeof syncAccountStateNow === 'function') ? Promise.resolve(syncAccountStateNow()).catch(function () { }) : Promise.resolve();
    pre.then(function () { return api('/api/potions/buy', { id: id }); }).then(function (d) {
      busy = false;
      if (d && d.ok) {
        setData(d);
        try { state.progress.coins = d.coins; state.progress.grantEpoch = d.epoch; updateCoinDisplays(); persistProgress(); } catch (x) { }
        say('You bought a ' + NAMES[id] + '.', 'good'); renderPotions();
      } else {
        if (d && d.market) { setData(d.market); }
        say((d && d.error) || 'Could not buy that.', 'bad'); renderPotions();
      }
    }).catch(function () { busy = false; say('Network problem. Nothing was charged.', 'bad'); });
  }
  function use(id) {
    if (busy) return; busy = true; say('Drinking…');
    api('/api/potions/use', { id: id }).then(function (d) {
      busy = false;
      if (d && d.ok) { setData(d); say('Luck potion active. Go open some packs!', 'good'); }
      else say((d && d.error) || 'Could not use that.', 'bad');
      renderPotions();
    }).catch(function () { busy = false; say('Network problem. Try again.', 'bad'); });
  }

  /* keep luck known even before the market is opened */
  var started = false;
  setInterval(function () {
    if (!started && typeof state !== 'undefined' && state.account) { started = true; load(true); }
    if (started && (typeof state === 'undefined' || !state.account)) { started = false; M.data = null; M.active = null; }
  }, 3000);
  setInterval(function () { if (started && !document.hidden) load(true); }, 180000);

  ensurePotionView();
  setInterval(tickStrip, 300);
})();
