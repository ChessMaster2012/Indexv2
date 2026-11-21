/* Shop, Quests & More  +  Notes & Study Sets: two merged sidebar tabs with a small tab bar, plus the Potion Market
   (one shared market for every player, restocks every hour, first come first served; luck potions change pack and crate odds). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ic(n, s) { try { return IX.icon(n, s || 16); } catch (e) { return ''; } }
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

  var RC = { Common: '#9aa7b4', Uncommon: '#4fc98a', Rare: '#5fa8e8', Epic: '#b48cf2', Legendary: '#f2b84b', Mythic: '#ff6fb5' };
  var RANK = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5 };

  var css = document.createElement('style');
  css.textContent =
    '.nav-btn[data-view="quests"],.nav-btn[data-view="studysets"]{display:none!important}' +
    '#hub-tabs{display:none;gap:6px;align-items:center;margin:0 0 18px;padding:5px;border:1px solid var(--rd-line,rgba(255,255,255,.12));border-radius:12px;background:var(--rd-surface,rgba(255,255,255,.03));width:fit-content;max-width:100%;overflow-x:auto}' +
    '#hub-tabs.on{display:flex}' +
    '#hub-tabs button{display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border-radius:9px;border:0;background:transparent;color:var(--rd-text-2,#aab);font:inherit;font-weight:600;font-size:14px;cursor:pointer;white-space:nowrap}' +
    '#hub-tabs button:hover{color:var(--rd-text,#fff)}' +
    '#hub-tabs button.on{background:#ff7a4d;color:#1a0d07}' +
    '#hub-tabs .hub-luck{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;background:rgba(60,196,143,.15);color:#3cc48f;font-weight:700;font-size:13px;white-space:nowrap}' +
    /* potion market */
    '#view-potions{overflow-x:hidden}' +
    '#view-potions .pm-wrap{max-width:1180px}' +
    '#view-potions h2{font-size:26px;font-weight:600;margin:0 0 4px}' +
    '#view-potions .pm-sub{color:var(--rd-text-2,#aab);margin:0 0 16px;max-width:660px}' +
    '#view-potions .pm-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 16px}' +
    '#view-potions .pm-pill{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;border:1px solid var(--rd-line,rgba(255,255,255,.14));background:var(--rd-surface,rgba(255,255,255,.03));font-weight:600;font-size:14px}' +
    '#view-potions .pm-chip{cursor:pointer;font:inherit;color:var(--rd-text-2,#aab)}#view-potions .pm-chip.on{background:#ff7a4d;border-color:#ff7a4d;color:#1a0d07}' +
    '#view-potions .pm-feature{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:12px;margin:0 0 16px;font-weight:700;border:1px solid var(--fc);background:color-mix(in srgb,var(--fc) 14%,transparent);color:var(--fc);animation:pmGlow 2.4s ease-in-out infinite}' +
    '@keyframes pmGlow{50%{box-shadow:0 0 22px color-mix(in srgb,var(--fc) 45%,transparent)}}' +
    '#view-potions .pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:16px}' +
    '#view-potions .pm-card{position:relative;display:flex;flex-direction:column;gap:9px;padding:0 0 14px;border:1px solid color-mix(in srgb,var(--pc) 40%,var(--rd-line,rgba(255,255,255,.12)));border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb,var(--pc) 9%,transparent),transparent 55%),var(--rd-surface,rgba(255,255,255,.03));overflow:hidden;transition:transform .2s,box-shadow .2s}' +
    '#view-potions .pm-card:hover{transform:translateY(-3px);box-shadow:0 10px 30px color-mix(in srgb,var(--pc) 22%,transparent)}' +
    '#view-potions .pm-card.rar-Legendary,#view-potions .pm-card.rar-Mythic{box-shadow:0 0 26px color-mix(in srgb,var(--pc) 26%,transparent)}' +
    '#view-potions .pm-card.off{opacity:.62}' +
    '#view-potions .pm-card.off .pm-art svg{filter:grayscale(1) brightness(.42) blur(.4px)}' +
    '#view-potions .pm-top{display:flex;justify-content:space-between;align-items:center;padding:10px 12px 0;gap:6px}' +
    '#view-potions .pm-rarity{font-size:11px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;padding:4px 10px;border-radius:999px;color:#14100c;background:var(--pc)}' +
    '#view-potions .pm-card.rar-Mythic .pm-rarity{background:linear-gradient(90deg,#ff6fb5,#ffd36b,#6ee7ff,#b48cf2,#ff6fb5);background-size:200% 100%;animation:pmShift 3s linear infinite}' +
    '@keyframes pmShift{to{background-position:200% 0}}' +
    '#view-potions .pm-leftb{font-size:12px;font-weight:800;padding:4px 9px;border-radius:8px;background:rgba(0,0,0,.35);color:#fff;white-space:nowrap}' +
    '#view-potions .pm-leftb.low{color:#ffb36b}#view-potions .pm-leftb.none{color:#ff8a7a}' +
    '#view-potions .pm-art{position:relative;height:150px;display:grid;place-items:center}' +
    '#view-potions .pm-art:before{content:"";position:absolute;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--pc) 38%,transparent),transparent 68%);filter:blur(2px)}' +
    '#view-potions .pm-art svg{position:relative;width:112px;height:134px;overflow:visible;animation:pmBob 3.4s ease-in-out infinite}' +
    '#view-potions .pm-card:nth-child(2n) .pm-art svg{animation-delay:-1.2s}#view-potions .pm-card:nth-child(3n) .pm-art svg{animation-delay:-2.3s}' +
    '@keyframes pmBob{50%{transform:translateY(-7px) rotate(1.5deg)}}' +
    '#view-potions .pm-card.rar-Mythic .pm-art svg{animation:pmBob 3.4s ease-in-out infinite,pmHue 5s linear infinite}' +
    '@keyframes pmHue{to{filter:hue-rotate(360deg)}}' +
    '#view-potions .pm-bub{animation:pmRise 2.6s ease-in infinite;transform-box:fill-box}' +
    '@keyframes pmRise{0%{transform:translateY(0);opacity:0}15%{opacity:.9}100%{transform:translateY(-34px);opacity:0}}' +
    '#view-potions .pm-spark{animation:pmTw 1.8s ease-in-out infinite;transform-box:fill-box;transform-origin:center}' +
    '@keyframes pmTw{0%,100%{transform:scale(.2);opacity:0}50%{transform:scale(1);opacity:1}}' +
    '#view-potions .pm-wave{animation:pmWave 3s ease-in-out infinite alternate}' +
    '@keyframes pmWave{to{transform:translateX(-14px)}}' +
    '#view-potions .pm-body{padding:0 14px;display:flex;flex-direction:column;gap:8px}' +
    '#view-potions .pm-name{font-weight:800;font-size:16px;line-height:1.2}' +
    '#view-potions .pm-fx{display:flex;flex-wrap:wrap;gap:5px}' +
    '#view-potions .pm-fx span{font-size:12px;font-weight:700;padding:4px 8px;border-radius:7px;background:rgba(255,255,255,.07);color:var(--rd-text,#fff)}' +
    '#view-potions .pm-fx span.dim{opacity:.4}#view-potions .pm-fx span.up{background:color-mix(in srgb,var(--pc) 22%,transparent);color:var(--pc)}' +
    '#view-potions .pm-stock{height:9px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}' +
    '#view-potions .pm-stock i{display:block;height:100%;background:var(--pc);border-radius:99px;transition:width .4s}' +
    '#view-potions .pm-left{font-size:13px;color:var(--rd-text-2,#aab);display:flex;justify-content:space-between}' +
    '#view-potions .pm-left b{color:var(--rd-text,#fff);font-size:15px}' +
    '#view-potions .pm-chance{font-size:12px;color:var(--rd-text-3,#889)}' +
    '#view-potions .pm-buy{margin-top:2px;display:flex;align-items:center;justify-content:center;gap:7px;padding:11px;border-radius:11px;border:0;background:#ff7a4d;color:#1a0d07;font:inherit;font-weight:800;cursor:pointer}' +
    '#view-potions .pm-buy[disabled]{background:rgba(255,255,255,.1);color:var(--rd-text-3,#889);cursor:not-allowed}' +
    '#view-potions .pm-ghost{padding:0 14px;font-size:13px;color:var(--rd-text-2,#aab);text-align:center;min-height:62px;display:flex;flex-direction:column;justify-content:center;gap:3px}' +
    '#view-potions h3{margin:28px 0 10px;font-size:18px}' +
    '#view-potions .pm-inv{display:flex;flex-wrap:wrap;gap:10px}' +
    '#view-potions .pm-own{display:flex;align-items:center;gap:12px;padding:8px 14px 8px 8px;border:1px solid color-mix(in srgb,var(--pc) 40%,var(--rd-line,rgba(255,255,255,.12)));border-radius:14px;background:var(--rd-surface,rgba(255,255,255,.03))}' +
    '#view-potions .pm-own svg{width:46px;height:55px;flex:none}' +
    '#view-potions .pm-own button{padding:8px 14px;border-radius:9px;border:1px solid #3cc48f;background:transparent;color:#3cc48f;font:inherit;font-weight:800;cursor:pointer}' +
    '#view-potions .pm-active{display:flex;align-items:center;gap:14px;padding:12px 16px;border:1px solid #3cc48f;border-radius:14px;background:rgba(60,196,143,.1);margin:0 0 16px}' +
    '#view-potions .pm-active svg{width:46px;height:55px;flex:none}' +
    '#view-potions .pm-msg{min-height:20px;font-size:13.5px;margin:0 0 10px}' +
    '#view-potions .pm-msg.bad{color:#ff8a7a}#view-potions .pm-msg.good{color:#3cc48f}' +
    '@media(max-width:560px){#view-potions .pm-grid{grid-template-columns:1fr 1fr;gap:10px}#view-potions .pm-art{height:128px}#view-potions .pm-art svg{width:92px;height:110px}#view-potions .pm-name{font-size:14.5px}}';
  document.head.appendChild(css);

  /* ---------- potion art: every bottle is drawn, not an icon ---------- */
  var BODY = {
    round: 'M40 30 L40 44 C20 52 14 68 14 82 C14 104 30 114 50 114 C70 114 86 104 86 82 C86 68 80 52 60 44 L60 30 Z',
    tall: 'M38 26 L38 104 C38 112 42 116 50 116 C58 116 62 112 62 104 L62 26 Z',
    tri: 'M42 30 L42 52 L16 100 C13 106 17 114 24 114 L76 114 C83 114 87 106 84 100 L58 52 L58 30 Z',
    gourd: 'M42 30 L42 40 C30 44 28 54 34 60 C16 68 12 88 22 102 C30 114 70 114 78 102 C88 88 84 68 66 60 C72 54 70 44 58 40 L58 30 Z',
    diamond: 'M42 30 L42 44 L18 72 L50 116 L82 72 L58 44 L58 30 Z',
    orb: 'M42 30 L42 40 C22 46 12 62 12 76 C12 98 28 116 50 116 C72 116 88 98 88 76 C88 62 78 46 58 40 L58 30 Z'
  };
  var ART = {
    clover: { s: 'round', a: '#7ee08f', b: '#2f9e5a', lv: .5, e: 'clover' },
    charm: { s: 'tall', a: '#8fe9d9', b: '#2a9d9a', lv: .68, e: 'star' },
    pebble: { s: 'tri', a: '#c3cfe0', b: '#6f829c', lv: .55, e: 'drop' },
    dew: { s: 'gourd', a: '#9be0ff', b: '#3a8fd0', lv: .6, e: 'drop' },
    lucky: { s: 'round', a: '#cdf56f', b: '#5fb832', lv: .72, e: 'clover' },
    packrat: { s: 'tri', a: '#ffc96e', b: '#e07a2b', lv: .68, e: 'coin' },
    crusher: { s: 'tall', a: '#ffa07f', b: '#d6452f', lv: .72, e: 'bolt' },
    fortune: { s: 'round', a: '#86bfff', b: '#2f63d6', lv: .8, e: 'star' },
    moonlit: { s: 'gourd', a: '#e0d9ff', b: '#7a6ad8', lv: .75, e: 'moon' },
    prospector: { s: 'diamond', a: '#ffd983', b: '#c9831e', lv: .7, e: 'coin' },
    golden: { s: 'gourd', a: '#ffe58f', b: '#e0a21a', lv: .86, e: 'star', glitter: 1 },
    stormglass: { s: 'tri', a: '#cfaeff', b: '#6a35d8', lv: .78, e: 'bolt', glitter: 1 },
    fourleaf: { s: 'round', a: '#a4f89a', b: '#1f9e4a', lv: .88, e: 'clover', glitter: 1 },
    dragon: { s: 'diamond', a: '#ff9560', b: '#c1121f', lv: .86, e: 'flame', glitter: 1 },
    starlight: { s: 'orb', a: '#9ee7ff', b: '#a35bff', lv: .92, e: 'star', glitter: 2 }
  };
  function emblem(kind, col) {
    var f = 'fill="' + col + '"';
    switch (kind) {
      case 'clover': return '<g ' + f + '><circle cx="46" cy="84" r="5"/><circle cx="54" cy="84" r="5"/><circle cx="46" cy="92" r="5"/><circle cx="54" cy="92" r="5"/></g>';
      case 'star': return '<polygon ' + f + ' points="50,76 53,85 62,85 55,91 58,100 50,94 42,100 45,91 38,85 47,85"/>';
      case 'drop': return '<path ' + f + ' d="M50 76 C57 86 60 91 60 95 C60 101 55 104 50 104 C45 104 40 101 40 95 C40 91 43 86 50 76 Z"/>';
      case 'coin': return '<circle ' + f + ' cx="50" cy="90" r="11"/><circle cx="50" cy="90" r="7" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.6"/>';
      case 'bolt': return '<polygon ' + f + ' points="54,74 41,93 49,93 46,108 60,87 52,87"/>';
      case 'moon': return '<path ' + f + ' d="M56 76 C45 78 40 88 44 97 C48 106 60 106 64 100 C54 102 48 92 56 76 Z"/>';
      case 'flame': return '<path ' + f + ' d="M50 74 C53 82 61 86 60 96 C59 105 41 106 40 96 C40 91 44 88 45 83 C48 86 49 87 50 74 Z"/>';
    }
    return '';
  }
  var artN = 0;
  function bottle(id, rarity, opts) {
    var A = ART[id] || ART.clover, n = ++artN, g = 'pg' + n, cp = 'pc' + n, rc = RC[rarity] || '#9aa7b4', body = BODY[A.s];
    var top = 116 - A.lv * 78, W = (opts && opts.small) ? 0 : 1, parts = [];
    parts.push('<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + A.a + '"/><stop offset="1" stop-color="' + A.b + '"/></linearGradient>' +
      '<clipPath id="' + cp + '"><path d="' + body + '"/></clipPath></defs>');
    parts.push('<g clip-path="url(#' + cp + ')"><rect x="0" y="' + top + '" width="100" height="120" fill="url(#' + g + ')"/>');
    if (A.s === 'orb') {   // swirling galaxy for the Mythic bottle
      parts.push('<ellipse cx="50" cy="84" rx="34" ry="12" fill="rgba(255,255,255,.28)" transform="rotate(-24 50 84)"/><ellipse cx="50" cy="86" rx="22" ry="7" fill="rgba(0,0,0,.25)" transform="rotate(30 50 86)"/>');
    }
    if (W) {
      parts.push('<path class="pm-wave" d="M-20 ' + top + ' q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v8 h-140 z" fill="' + A.a + '" opacity=".75"/>');
      [[34, 0, 3], [52, .8, 2.4], [64, 1.6, 3.2], [44, 2.1, 2]].forEach(function (b) {
        parts.push('<circle class="pm-bub" cx="' + b[0] + '" cy="' + (108 - b[2] * 2) + '" r="' + b[2] + '" fill="rgba(255,255,255,.7)" style="animation-delay:-' + b[1] + 's"/>');
      });
    }
    parts.push('</g>');
    parts.push('<path d="' + body + '" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.62)" stroke-width="2.2" stroke-linejoin="round"/>');
    parts.push('<path d="M30 70 C28 82 30 94 36 104" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3.2" stroke-linecap="round"/>');
    parts.push(emblem(A.e, 'rgba(255,255,255,.92)'));
    // neck ring + cork (or a crown for the Mythic bottle)
    if (A.s === 'orb') parts.push('<rect x="39" y="27" width="22" height="5" rx="2" fill="#f2b84b"/><polygon points="38,27 42,14 47,22 50,10 53,22 58,14 62,27" fill="#ffd36b" stroke="#c79a1f" stroke-width="1"/>');
    else parts.push('<rect x="39" y="27" width="22" height="5" rx="2" fill="' + rc + '"/><rect x="41" y="14" width="18" height="14" rx="4" fill="#b98a55"/><rect x="41" y="14" width="18" height="4" rx="2" fill="rgba(255,255,255,.22)"/>');
    if (W && A.glitter) {
      var pts = [[14, 40], [86, 52], [22, 96], [80, 100], [50, 8], [92, 82], [8, 70]].slice(0, A.glitter === 2 ? 7 : 4);
      pts.forEach(function (p, i) {
        parts.push('<polygon class="pm-spark" points="' + p[0] + ',' + (p[1] - 6) + ' ' + (p[0] + 2) + ',' + (p[1] - 2) + ' ' + (p[0] + 6) + ',' + p[1] + ' ' + (p[0] + 2) + ',' + (p[1] + 2) + ' ' + p[0] + ',' + (p[1] + 6) + ' ' + (p[0] - 2) + ',' + (p[1] + 2) + ' ' + (p[0] - 6) + ',' + p[1] + ' ' + (p[0] - 2) + ',' + (p[1] - 2) + '" fill="' + (A.glitter === 2 ? '#fff' : rc) + '" style="animation-delay:-' + (i * .45) + 's"/>');
      });
    }
    return '<svg viewBox="0 0 100 120" role="img" aria-label="' + esc(id) + ' potion">' + parts.join('') + '</svg>';
  }

  /* ---------- tab strip ---------- */
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
  var M = { data: null, active: null, loading: false, msg: '', msgKind: '', filter: 'all' };
  function setData(d) { d._skew = (d.now || Date.now()) - Date.now(); M.data = d; M.active = d.active || null; }
  function mm(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
  function fx(n) { return '×' + (Math.round(n * 100) / 100); }
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
      }).join('') + (g === 'shop' && luck ? '<span class="hub-luck">' + ic('clover', 15) + 'Luck: packs ' + fx(luck.pack) + ', crates ' + fx(luck.crate) + ' · ' + mm((luck.until - Date.now()) / 1000) + '</span>' : '') : '';
    }
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      var d = b.dataset.view; if (!d) return;
      for (var k in GROUPS) if (d === GROUPS[k].parent && g === k) b.classList.add('active');
    });
    if (v === 'potions' && !tickStrip.inPotions) { tickStrip.inPotions = true; openPotions(); }
    if (v !== 'potions') tickStrip.inPotions = false;
  }

  /* luck for pack / crate openings (read by rollPack and the skin crate roll in index.html) */
  window.PotionLuck = {
    mult: function (kind) {
      var a = M.active; if (!a || a.until <= Date.now()) return 1;
      var v = kind === 'crate' ? a.crate : kind === 'pack' ? a.pack : Math.max(a.pack || 1, a.crate || 1);
      return Math.min(8, Math.max(1, Number(v) || 1));
    },
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
      if (d && d.ok) setData(d);
      else if (!quiet) { M.msg = (d && d.error) || 'Could not load the market.'; M.msgKind = 'bad'; }
      if (typeof state !== 'undefined' && state.view === 'potions') renderPotions();
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
  function card(p, coins) {
    var c = RC[p.rarity], out = p.stocked && p.left <= 0, capped = p.bought >= p.cap, poor = coins < p.price, off = !p.stocked;
    var pct = p.total ? Math.round(100 * p.left / p.total) : 0, low = p.stocked && p.left > 0 && p.left <= Math.max(1, Math.ceil(p.total * .25));
    var chance = p.chance >= 1 ? 'Always in stock' : 'In stock about ' + Math.round(p.chance * 100) + '% of hours';
    var fxh = '<div class="pm-fx"><span class="' + (p.pack > 1 ? 'up' : 'dim') + '">Packs ' + (p.pack > 1 ? fx(p.pack) : '—') + '</span><span class="' + (p.crate > 1 ? 'up' : 'dim') + '">Crates ' + (p.crate > 1 ? fx(p.crate) : '—') + '</span><span>' + p.mins + ' min</span></div>';
    var badge = off ? '<span class="pm-leftb none">Not stocked</span>' : '<span class="pm-leftb ' + (p.left <= 0 ? 'none' : low ? 'low' : '') + '">' + (p.left <= 0 ? 'Sold out' : p.left + ' left') + '</span>';
    var btn = '', mid = '';
    if (off) mid = '<div class="pm-ghost"><b>Not in the market this hour</b><span>' + esc(chance) + '. Check back at the top of the hour.</span></div>';
    else {
      mid = '<div class="pm-body"><div class="pm-stock"><i style="width:' + pct + '%"></i></div><div class="pm-left"><span><b>' + p.left + '</b> of ' + p.total + ' left</span><span>You: ' + p.bought + '/' + p.cap + '</span></div></div>';
      var dis = out || capped || poor, label = out ? 'Sold out' : capped ? 'Limit reached' : poor ? 'Not enough coins' : '';
      btn = '<div class="pm-body"><button class="pm-buy" type="button" data-buy="' + p.id + '"' + (dis ? ' disabled' : '') + '>' + (dis ? label : (window.indexCoinIconSvg ? window.indexCoinIconSvg(16) : '') + p.price.toLocaleString()) + '</button></div>';
    }
    return '<div class="pm-card rar-' + p.rarity + (off ? ' off' : '') + '" style="--pc:' + c + '">' +
      '<div class="pm-top"><span class="pm-rarity">' + p.rarity + '</span>' + badge + '</div>' +
      '<div class="pm-art">' + bottle(p.id, p.rarity) + '</div>' +
      '<div class="pm-body"><div class="pm-name">' + esc(p.name) + '</div>' + fxh + (off ? '' : '<div class="pm-chance">' + esc(chance) + '</div>') + '</div>' + mid + btn + '</div>';
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
    var list = d.potions.slice().sort(function (a, b) { return (b.stocked - a.stocked) || (RANK[b.rarity] - RANK[a.rarity]); });
    var nStock = d.potions.filter(function (p) { return p.stocked; }).length;
    if (M.filter === 'stock') list = list.filter(function (p) { return p.stocked; });
    var rare = d.potions.filter(function (p) { return p.stocked && p.left > 0 && RANK[p.rarity] >= 3; }).sort(function (a, b) { return RANK[b.rarity] - RANK[a.rarity]; })[0];
    var inv = Object.keys(d.inventory || {}).filter(function (k) { return d.inventory[k] > 0; });
    var byId = {}; d.potions.forEach(function (p) { byId[p.id] = p; });
    root.innerHTML = '<div class="pm-wrap"><h2>Potion Market</h2>' +
      '<p class="pm-sub">One market shared by every player on Index. Stock is limited and sold first come, first served. It all resets at the top of every hour, and the rarest potions only show up in some hours.</p>' +
      '<div class="pm-bar"><span class="pm-pill">' + ic('timer', 16) + 'Restocks in <b id="pm-clock">' + mm(left) + '</b></span><span class="pm-pill">Your coins: <b>' + Number(coins).toLocaleString() + '</b></span>' +
      '<span class="pm-pill">' + nStock + ' of ' + d.potions.length + ' potions in stock</span>' +
      '<button class="pm-pill pm-chip' + (M.filter === 'all' ? ' on' : '') + '" type="button" data-filter="all">All potions</button><button class="pm-pill pm-chip' + (M.filter === 'stock' ? ' on' : '') + '" type="button" data-filter="stock">In stock only</button></div>' +
      (rare ? '<div class="pm-feature" style="--fc:' + RC[rare.rarity] + '">' + ic('sparkles', 20) + '<span>' + rare.rarity + ' potion in stock this hour: ' + esc(rare.name) + ' (' + rare.left + ' left)</span></div>' : '') +
      (act ? '<div class="pm-active">' + bottle(act.id, act.rarity, { small: 1 }) + '<span><b>' + esc(act.name) + '</b> is working: packs ' + fx(act.pack) + ', crates ' + fx(act.crate) + ' for <b id="pm-act">' + mm((act.until - Date.now()) / 1000) + '</b> more. Open packs and crates now.</span></div>' : '') +
      '<div class="pm-msg ' + esc(M.msgKind) + '" id="pm-msg">' + esc(M.msg) + '</div>' +
      '<div class="pm-grid">' + list.map(function (p) { return card(p, coins); }).join('') + '</div>' +
      '<h3>Your potions</h3>' + (inv.length ? '<div class="pm-inv">' + inv.map(function (k) {
        var p = byId[k] || { rarity: 'Common', name: k };
        return '<div class="pm-own" style="--pc:' + RC[p.rarity] + '">' + bottle(k, p.rarity, { small: 1 }) + '<span><b>' + esc(p.name) + '</b><br><span style="color:var(--rd-text-2,#aab);font-size:13px">× ' + d.inventory[k] + ' · ' + esc(p.rarity) + '</span></span><button type="button" data-use="' + k + '">Drink</button></div>';
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
  function nameOf(id) { var p = M.data && M.data.potions.filter(function (x) { return x.id === id; })[0]; return p ? p.name : 'potion'; }
  function onClick(e) {
    var t = e.target;
    if (t.closest && t.closest('#pm-signin')) { try { openSignin(); } catch (x) { } return; }
    var f = t.closest && t.closest('[data-filter]'); if (f) { M.filter = f.getAttribute('data-filter'); renderPotions(); return; }
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
        say('You bought ' + nameOf(id) + '.', 'good'); renderPotions();
      } else {
        if (d && d.market) setData(d.market);
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
