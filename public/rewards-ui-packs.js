/* Rewards UI part 2: Packs tab, pack / skin-crate opening cinematics, Daily Wheel.
 * Presentation only. Pack odds, costs, contents, rolls, coin spending, server spin
 * and Indexling art are all still produced by the original functions. */
(function () {
  'use strict';
  if (window.__rwUi2 || !window.__rwBodies) return;
  window.__rwUi2 = true;

  function E(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function art(c, skin) { try { return indexlingArtHtml(c, true, skin || null); } catch (e) { return '<span>' + E(c && c.icon || '✦') + '</span>'; } }
  function coin(n) { try { return indexCoinIconSvg(n); } catch (e) { return '🪙'; } }

  /* ============ pack logos ============ */
  var THEME = {
    candy:    { a: '#ff8fc3', b: '#ff5fa2', c: '#ffe3f1', d: '#8a1f5a', tag: 'CANDY' },
    medieval: { a: '#d7a56d', b: '#9a6234', c: '#f6e2c4', d: '#4a2a10', tag: 'MEDIEVAL' },
    robo:     { a: '#7ff0e0', b: '#2aa7a0', c: '#dcfffb', d: '#0b4a49', tag: 'ROBO' },
    ocean:    { a: '#7fd8ff', b: '#2477d6', c: '#e0f6ff', d: '#0a2f66', tag: 'DEEP SEA' },
    arcade:   { a: '#b49cff', b: '#6a3fe0', c: '#ece4ff', d: '#25106b', tag: 'ARCADE' },
    cosmic:   { a: '#8c9cff', b: '#3a2fa8', c: '#e6e9ff', d: '#120c45', tag: 'COSMIC' }
  };
  var EMBLEM = {
    candy: '<circle cx="80" cy="104" r="34" fill="#fff" stroke="#8a1f5a" stroke-width="4"/><path d="M80 104m0 0a6 6 0 1 1 8 5a14 14 0 1 1-22-12a22 22 0 1 1 33 24" fill="none" stroke="#ff4f9a" stroke-width="6" stroke-linecap="round"/><path d="M80 138v34" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M80 138v34" stroke="#8a1f5a" stroke-width="2" stroke-linecap="round" opacity=".4"/><circle cx="52" cy="70" r="4" fill="#fff"/><circle cx="112" cy="76" r="3" fill="#ffe36a"/>',
    medieval: '<path d="M80 62 124 76v36c0 24-18 40-44 52-26-12-44-28-44-52V76l44-14Z" fill="#f6e2c4" stroke="#4a2a10" stroke-width="4" stroke-linejoin="round"/><path d="M58 142V98h6v-8h8v8h8v-8h8v8h8v-8h8v8h6v44Z" fill="#9a6234" stroke="#4a2a10" stroke-width="3" stroke-linejoin="round"/><path d="M74 142v-16a6 6 0 0 1 12 0v16Z" fill="#4a2a10"/><path d="M80 62v-20l16 6-16 6" fill="#ff5a4a" stroke="#4a2a10" stroke-width="3" stroke-linejoin="round"/>',
    robo: '<g transform="translate(80 108)"><path d="M-8-44h16l3 10 9 4 10-5 11 11-5 10 4 9 10 3v16l-10 3-4 9 5 10-11 11-10-5-9 4-3 10h-16l-3-10-9-4-10 5-11-11 5-10-4-9-10-3v-16l10-3 4-9-5-10 11-11 10 5 9-4Z" fill="#dcfffb" stroke="#0b4a49" stroke-width="4" stroke-linejoin="round"/><circle r="22" fill="#2aa7a0" stroke="#0b4a49" stroke-width="4"/><rect x="-12" y="-7" width="24" height="14" rx="4" fill="#0b4a49"/><circle cx="-5" cy="0" r="3" fill="#7ff0e0"/><circle cx="5" cy="0" r="3" fill="#7ff0e0"/></g>',
    ocean: '<path d="M30 118c14-18 28-18 42 0s28 18 42 0 24-14 36-4v34c-12-10-22-14-36 4s-28 18-42 0-28-18-42 0Z" fill="#e0f6ff" stroke="#0a2f66" stroke-width="4" stroke-linejoin="round"/><path d="M22 92c18-30 54-34 80-12l18-14v44l-18-14c-26 18-62 14-80-4Z" fill="#ffb347" stroke="#0a2f66" stroke-width="4" stroke-linejoin="round" transform="translate(6 -6) scale(.92)"/><circle cx="56" cy="76" r="4.5" fill="#0a2f66"/><circle cx="118" cy="70" r="5" fill="#fff" stroke="#0a2f66" stroke-width="2"/><circle cx="132" cy="54" r="3.5" fill="#fff" stroke="#0a2f66" stroke-width="2"/>',
    arcade: '<rect x="28" y="84" width="104" height="60" rx="26" fill="#ece4ff" stroke="#25106b" stroke-width="4"/><path d="M52 100v28M38 114h28" stroke="#25106b" stroke-width="9" stroke-linecap="round"/><circle cx="100" cy="106" r="7" fill="#ff4f7a" stroke="#25106b" stroke-width="3"/><circle cx="116" cy="122" r="7" fill="#4ff0c2" stroke="#25106b" stroke-width="3"/><rect x="72" y="106" width="16" height="6" rx="3" fill="#25106b"/><path d="M60 78l8-14h24l8 14" fill="none" stroke="#25106b" stroke-width="4" stroke-linejoin="round"/>',
    cosmic: '<circle cx="80" cy="108" r="32" fill="#8c9cff" stroke="#120c45" stroke-width="4"/><path d="M60 96c10-8 28-8 40 2M56 114c14-6 32-6 48 2" stroke="#e6e9ff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".75"/><ellipse cx="80" cy="110" rx="58" ry="14" fill="none" stroke="#ffd56a" stroke-width="6" transform="rotate(-18 80 110)"/><path d="M80 40l4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" fill="#fff"/><circle cx="36" cy="64" r="3" fill="#fff"/><circle cx="130" cy="150" r="3.5" fill="#ffd56a"/><circle cx="30" cy="150" r="2.5" fill="#fff"/>'
  };
  function packLogo(kind) {
    var k = THEME[kind] ? kind : 'candy', t = THEME[k], id = 'pl' + k;
    return '<svg class="rw-packsvg" viewBox="0 0 160 220" role="img" aria-label="' + t.tag + ' pack"><defs>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + t.a + '"/><stop offset="1" stop-color="' + t.b + '"/></linearGradient>' +
      '<linearGradient id="' + id + 's" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<clipPath id="' + id + 'c"><path d="M14 14h132v14l-6 4 6 4v4l-6 4 6 4v138l-6 4 6 4v6l-6 4 6 4v8H14v-8l6-4-6-4v-6l6-4-6-4V48l6-4-6-4v-4l6-4-6-4Z"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + 'c)"><rect width="160" height="220" fill="url(#' + id + 'g)"/>' +
      '<g opacity=".18" fill="' + t.c + '">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<circle cx="' + (20 + i * 26) + '" cy="' + (60 + (i % 2) * 90) + '" r="' + (10 + (i % 3) * 5) + '"/>'; }).join('') + '</g>' +
      '<rect y="30" width="160" height="22" fill="' + t.d + '" opacity=".85"/><text x="80" y="46" text-anchor="middle" font-family="Fredoka,Nunito,system-ui,sans-serif" font-weight="900" font-size="13" letter-spacing="3" fill="' + t.c + '">' + t.tag + '</text>' +
      EMBLEM[k] +
      '<rect y="176" width="160" height="22" fill="' + t.d + '" opacity=".85"/><text x="80" y="192" text-anchor="middle" font-family="Fredoka,Nunito,system-ui,sans-serif" font-weight="800" font-size="11" letter-spacing="2" fill="' + t.c + '">INDEXLING PACK</text>' +
      '<rect width="160" height="220" fill="url(#' + id + 's)"/></g>' +
      '<path d="M14 14h132v14l-6 4 6 4v4l-6 4 6 4v138l-6 4 6 4v6l-6 4 6 4v8H14v-8l6-4-6-4v-6l6-4-6-4V48l6-4-6-4v-4l6-4-6-4Z" fill="none" stroke="' + t.d + '" stroke-width="3" stroke-linejoin="round"/></svg>';
  }
  window.indexPackArt = function (c, kind) { return packLogo(String(kind || (c && c.id) || 'candy').toLowerCase()); };
  window.__rwPackLogo = packLogo;

  /* ============ Packs tab ============ */
  var RAR_ORDER = ['Common', 'Rare', 'Epic', 'Legendary'];
  function packsHtml() {
    var p = state.progress || {}, tokens = Math.max(0, Number(p.freePackTokens) || 0), owned = p.unlockedCosmetics || [];
    var cards = PACK_ORDER.map(function (kind) {
      var c = packConfig(kind), cont = packContents(kind), t = THEME[kind] || THEME.candy;
      var can = (tokens > 0 || (p.coins || 0) >= c.cost) && !state.rewardPackOpening;
      var have = cont.filter(function (x) { return owned.indexOf(x.id) >= 0; }).length;
      var btn = tokens > 0 ? 'Open free pack' : can ? 'Open pack' : 'Need ' + (c.cost - (p.coins || 0)) + ' more coins';
      var odds = RAR_ORDER.map(function (r) { return '<i class="o-' + r.toLowerCase() + '" style="flex:' + Math.max(.6, c.weights[r]) + '" title="' + r + ' ' + c.weights[r] + '%"></i>'; }).join('');
      return '<article class="rw-pack" data-pack="' + kind + '" style="--pa:' + t.a + ';--pb:' + t.b + ';--pd:' + t.d + '">' +
        '<div class="rw-pack-stage"><div class="rw-pack-glow"></div><div class="rw-pack-logo">' + packLogo(kind) + '</div></div>' +
        '<div class="rw-pack-info"><h4>' + E(c.name) + '</h4><div class="rw-pack-meta"><span class="rw-pill rw-pill-coin">' + coin(14) + c.cost + '</span><span class="rw-pill">' + have + '/' + cont.length + ' collected</span></div>' +
        '<div class="rw-pack-strip">' + cont.map(function (x) { var got = owned.indexOf(x.id) >= 0; return '<span class="rw-mini r-' + x.rarity.toLowerCase() + (got ? '' : ' dim') + '" title="' + E(x.name) + ' · ' + x.rarity + '">' + art(x) + '</span>'; }).join('') + '</div>' +
        '<div class="rw-odds">' + odds + '</div><div class="rw-odds-l"><span>Common ' + c.weights.Common + '%</span><span>Rare ' + c.weights.Rare + '%</span><span>Epic ' + c.weights.Epic + '%</span><span class="lg">Legendary ' + c.weights.Legendary + '%</span></div>' +
        '<button class="rw-btn ' + (can ? 'rw-btn-gold' : 'rw-btn-ghost') + '" data-action="open-pack" data-pack="' + kind + '" ' + (can ? '' : 'disabled') + '>' + btn + '</button></div></article>';
    }).join('');
    return '<div class="rw-packs"><section class="rw-packs-hero"><div><div class="rw-eyebrow">INDEXLING VAULT</div><h3>Pick a world. Crack a pack.</h3><p>Six collections of eight Indexlings each. Duplicates are fine — spend a free token and nothing is lost.</p></div>' +
      '<div class="rw-packs-tok"><span class="rw-chip-ic rw-ic-ticket">' + (window.__rwIcons ? '' : '') + '</span><b>' + tokens + '</b><small>free pack ' + (tokens === 1 ? 'token' : 'tokens') + '</small></div></section>' +
      '<div class="rw-pack-grid">' + cards + '</div></div>';
  }

  /* ============ Daily Wheel tab ============ */
  var WSH = ['#d6602a', '#d9971c', '#2fa879', '#2f7fe0', '#7a52e6', '#e0488f'];
  var WCOL = ['#ff9f6b', '#ffcc5c', '#7be0a8', '#6cc6ff', '#b79bff', '#ff8fc3'];
  function polar(r, deg) { var a = (deg - 90) * Math.PI / 180; return [(100 + r * Math.cos(a)).toFixed(2), (100 + r * Math.sin(a)).toFixed(2)]; }
  function wheelSvg() {
    var vals = DAILY_WHEEL_VALUES, n = vals.length, seg = 360 / n, out = '', defs = '';
    vals.forEach(function (v, i) {
      var a0 = i * seg, a1 = (i + 1) * seg, p0 = polar(93, a0), p1 = polar(93, a1), big = v >= 250, hi = v >= 75;
      var c1 = big ? '#fff3a0' : WCOL[i % WCOL.length], c2 = big ? '#f09a1a' : WSH[i % WSH.length];
      defs += '<radialGradient id="rwsg' + i + '" cx="100" cy="100" r="93" gradientUnits="userSpaceOnUse"><stop offset=".18" stop-color="' + c2 + '"/><stop offset="1" stop-color="' + c1 + '"/></radialGradient>';
      out += '<path d="M100 100L' + p0 + 'A93 93 0 0 1 ' + p1 + 'Z" fill="url(#rwsg' + i + ')"/>';
      var m = a0 + seg / 2, tp = polar(70, m), cp = polar(52, m);
      out += '<g transform="rotate(' + m + ' ' + tp[0] + ' ' + tp[1] + ')"><text x="' + tp[0] + '" y="' + tp[1] + '" text-anchor="middle" dominant-baseline="central" font-family="Fredoka,Nunito,system-ui,sans-serif" font-weight="900" font-size="' + (v >= 100 ? 14 : 16) + '" fill="#fff" stroke="#2a1f78" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round">' + v + '</text></g>';
      out += '<g transform="rotate(' + m + ' ' + cp[0] + ' ' + cp[1] + ')"><circle cx="' + cp[0] + '" cy="' + cp[1] + '" r="4.2" fill="' + (big ? '#fff' : '#ffd24a') + '" stroke="#8b5e14" stroke-width="1"/></g>';
    });
    var lines = '', pegs = '';
    for (var i = 0; i < n; i++) { var q = polar(93, i * seg), r2 = polar(30, i * seg); lines += '<line x1="' + r2[0] + '" y1="' + r2[1] + '" x2="' + q[0] + '" y2="' + q[1] + '" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/>'; pegs += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="2.6" fill="#fff6c8" stroke="#8b5e14" stroke-width=".8"/>'; }
    var bulbs = '';
    for (var j = 0; j < 30; j++) { var bp = polar(97, j * 12 + 6); bulbs += '<circle class="rw-bulb b' + (j % 2) + '" cx="' + bp[0] + '" cy="' + bp[1] + '" r="2.2"/>'; }
    return '<svg viewBox="0 0 200 200" class="rw-wsvg" aria-hidden="true"><defs>' + defs + '<radialGradient id="rwgloss" cx=".35" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<circle cx="100" cy="100" r="99.5" fill="#2a1f78"/>' + out + lines + '<circle cx="100" cy="100" r="93" fill="none" stroke="#2a1f78" stroke-width="2.5"/>' + pegs + bulbs +
      '<circle cx="100" cy="100" r="93" fill="url(#rwgloss)"/><circle cx="100" cy="100" r="99" fill="none" stroke="#ffd56a" stroke-width="1.6"/></svg>';
  }
  function dailyHtml() {
    var p = state.progress || {}, today = String(p.dailyWheelDate || '') === coinDayStr(), last = Number(p.dailyWheelReward) || 0;
    var vals = DAILY_WHEEL_VALUES, landed = '', li = vals.indexOf(last);
    if (today && li >= 0) { var rot = 360 * 3 + (360 - (li * 24 + 12)); landed = 'data-rotation="' + rot + '" style="transform:rotate(' + rot + 'deg)"'; }
    return '<div class="rw-daily"><section class="rw-wheel-stage"><div class="rw-wheel-rays"></div>' +
      '<div class="daily-wheel-wrap rw-wheel-wrap"><div class="rw-pointer"><svg viewBox="0 0 40 56"><path d="M20 54 4 18A18 18 0 1 1 36 18Z" fill="#ff4f6a" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="20" cy="17" r="6" fill="#fff"/></svg></div>' +
      '<div id="daily-wheel" class="daily-wheel rw-wheel" ' + landed + '>' + wheelSvg() + '</div><div class="rw-hub"><span>INDEX</span></div></div></section>' +
      '<section class="rw-wheel-side"><div class="rw-eyebrow">DAILY WHEEL</div><h3>Spin once a day.</h3>' +
      '<p>Fifteen coin prizes from 5 to a golden 500 jackpot. The server picks your prize the moment you spin — the wheel just lands on it.</p>' +
      '<div id="daily-wheel-result" class="daily-wheel-result rw-wres">' + (today ? 'Already spun today' + (last ? ' · +' + last + ' coins' : '') + '.' : 'Ready when you are.') + '</div>' +
      '<div id="daily-wheel-countdown" class="rw-wcount">Next spin countdown loading…</div>' +
      '<button class="rw-btn rw-btn-gold rw-btn-lg" data-action="daily-wheel-spin" ' + (today ? 'disabled' : '') + '>' + (today ? '✓ Come back tomorrow' : 'SPIN THE WHEEL') + '</button>' +
      '<div class="rw-ladder"><b>Prize ladder</b><div>' + vals.map(function (v) { return '<span class="' + (v >= 250 ? 'jp' : v >= 75 ? 'hi' : '') + '">' + coin(13) + v + '</span>'; }).join('') + '</div></div></section></div>';
  }

  window.__rwBodies.packs = packsHtml;
  window.__rwBodies.daily = dailyHtml;

  /* ============ opening cinematics ============ */
  var lastPack = null, lastSkin = null;
  var _roll = window.rollPack; if (typeof _roll === 'function') window.rollPack = function () { var r = _roll.apply(this, arguments); lastPack = { reward: r, kind: arguments[0] }; return r; };
  var _sroll = window.rollSkinPair; if (typeof _sroll === 'function') window.rollSkinPair = function () { var r = _sroll.apply(this, arguments); lastSkin = r; return r; };

  function sting(kind) {
    try {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      var ctx = window.__indexAudio || (window.__indexAudio = new C()); if (ctx.state === 'suspended') ctx.resume();
      var notes = kind === 'legendary' ? [262, 330, 392, 523, 659, 784, 1046, 1318] : [392, 523, 659];
      notes.forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * (kind === 'legendary' ? .09 : .08);
        o.type = kind === 'legendary' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'legendary' ? .06 : .05, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + (kind === 'legendary' ? .9 : .4));
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 1);
      });
    } catch (e) { }
  }
  function burst(host, n, gold) {
    var b = document.createElement('div'); b.className = 'rw-burst';
    var cols = gold ? ['#ffd24a', '#fff2a8', '#ff9f1c', '#fff'] : ['#6cc6ff', '#b79bff', '#ff8fc3', '#7be0a8', '#fff'];
    for (var i = 0; i < n; i++) {
      var s = document.createElement('i'), a = Math.random() * 360, d = 90 + Math.random() * (gold ? 340 : 220);
      s.style.cssText = '--dx:' + (Math.cos(a * Math.PI / 180) * d).toFixed(0) + 'px;--dy:' + (Math.sin(a * Math.PI / 180) * d).toFixed(0) + 'px;--c:' + cols[i % cols.length] + ';--s:' + (4 + Math.random() * 8).toFixed(1) + 'px;--dl:' + (Math.random() * .25).toFixed(2) + 's';
      b.appendChild(s);
    }
    host.appendChild(b); setTimeout(function () { b.remove(); }, 2600);
  }
  /* Reveal sequence. tier: common | rare | epic | legendary */
  function reveal(card, tier) {
    if (!card) return;
    ['common', 'rare', 'epic', 'legendary'].forEach(function (t) { card.classList.remove('rw-rev-' + t); });
    card.classList.add('rw-rev-' + tier);
    card.classList.add('rw-revealed');
    try { var sc = card.closest('.pack-modal,.skin-crate-modal'); if (sc) sc.scrollTop = 0; } catch (e) { }
    var old = card.querySelector('.rw-flash'); if (old) old.remove();
    var f = document.createElement('div'); f.className = 'rw-flash'; card.appendChild(f);
    burst(card, tier === 'legendary' ? 90 : tier === 'epic' ? 46 : tier === 'rare' ? 28 : 16, tier === 'legendary');
    sting(tier === 'legendary' ? 'legendary' : 'normal');
    if (tier === 'legendary') {
      var host = card.closest('.pack-modal,.skin-crate-modal') || card;
      host.classList.add('rw-legend-shake');
      var b = document.createElement('div'); b.className = 'rw-legend-banner'; b.innerHTML = '<span>LEGENDARY</span>'; card.appendChild(b);
      setTimeout(function () { host.classList.remove('rw-legend-shake'); b.remove(); }, 3200);
    }
  }
  function tierOf(r) { return String(r || 'common').toLowerCase(); }

  function dressPackModal(kind) {
    var modal = document.getElementById('pack-modal'); if (!modal) return null;
    var card = modal.querySelector('.pack-opening'); if (!card) return null;
    modal.classList.add('rw-cine');
    var t = THEME[kind] || THEME.candy;
    card.style.setProperty('--pa', t.a); card.style.setProperty('--pb', t.b); card.style.setProperty('--pd', t.d);
    var hero = card.querySelector('.pack-box-hero');
    if (hero) hero.innerHTML = '<div class="rw-hero-rays"></div><div class="rw-hero-pack">' + packLogo(kind) + '</div>';
    ['common', 'rare', 'epic', 'legendary'].forEach(function (x) { card.classList.remove('rw-rev-' + x); });
    card.classList.remove('rw-revealed');
    return card;
  }
  var _open = window.openRewardPack;
  if (typeof _open === 'function') {
    window.openRewardPack = function (kind) {
      var before = state.rewardPackOpening;
      lastPack = null;
      var r = _open.apply(this, arguments);
      if (!before && state.rewardPackOpening && lastPack) {
        var card = dressPackModal(kind), tier = tierOf(lastPack.reward.rarity);
        setTimeout(function () { if (card && document.getElementById('pack-modal') && !document.getElementById('pack-modal').classList.contains('hidden')) reveal(card, tier); }, 5560);
      }
      return r;
    };
  }
  var _sopen = window.openSkinCrate;
  if (typeof _sopen === 'function') {
    window.openSkinCrate = function () {
      var before = state.skinCrateOpening; lastSkin = null;
      var r = _sopen.apply(this, arguments);
      if (!before && state.skinCrateOpening && lastSkin) {
        var modal = document.getElementById('skin-crate-modal'), card = modal && modal.querySelector('.skin-crate-card');
        if (card) {
          modal.classList.add('rw-cine'); card.classList.remove('rw-revealed');
          var rar = tierOf(lastSkin.skin && lastSkin.skin.rarity), tier = rar === 'epic' ? 'legendary' : rar;
          setTimeout(function () { reveal(card, tier); }, 5910);
        }
      }
      return r;
    };
  }
  /* Preview hooks (no coins, no rolls, nothing saved) — used for QA and demos. */
  window.__rwPreviewPackReveal = function (kind, rarity) {
    var modal = document.getElementById('pack-modal'); if (!modal) return;
    var card = dressPackModal(kind || 'candy'); modal.classList.remove('hidden');
    var res = modal.querySelector('#pack-result');
    var c = packContents(kind || 'candy').filter(function (x) { return x.rarity === (rarity || 'Legendary'); })[0] || packContents(kind || 'candy')[0];
    if (res) res.innerHTML = '<div class="pack-result reveal"><div class="result-rarity">' + E(c.rarity) + '</div><div class="result-name">' + art(c) + ' <span>' + E(c.name) + '</span></div><div class="result-note">Preview only — nothing was added.</div><div style="margin-top:12px"><button class="btn btn-primary" data-action="close-pack-modal">Close preview</button></div></div>';
    reveal(card, tierOf(c.rarity));
  };

  /* Daily wheel: tick lights while spinning + burst on landing, via class observer (spin logic untouched). */
  var obs = new MutationObserver(function (list) {
    list.forEach(function (m) {
      var el = m.target;
      if (el.classList && el.classList.contains('rw-wheel-wrap') && m.oldValue && m.oldValue.indexOf('spinning') >= 0 && el.className.indexOf('spinning') < 0) {
        var stage = el.closest('.rw-wheel-stage'); if (stage) { burst(stage, 40, true); sting('normal'); }
      }
    });
  });
  document.addEventListener('DOMContentLoaded', function () { obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true }); });
  if (document.readyState !== 'loading') obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
})();
