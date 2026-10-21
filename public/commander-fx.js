/* ==========================================================================
   Troop Commander — presentation layer (enemies, projectiles, impact FX, sound)
   --------------------------------------------------------------------------
   RENDER + AUDIO ONLY. This file never writes to game state: it reads
   state.games (enemies, projectiles, towers, base, running) and draws/plays
   what it sees. Damage, targeting, waves, economy and rewards are untouched.

   - Replaces the look of window.commanderDrawEnemyFinal and
     window.projectileDraw (the two draw hooks the battle loops already call).
   - Adds a click-through canvas on top of the battlefield for hit sparks,
     kill pops, damage numbers and screen feedback (pointer-events: none).
   - Adds synthesized WebAudio sound effects (no audio files) and a mute
     button, remembered in localStorage.

   To revert: remove the <script>/<link> tags for commander-fx.* from
   index.html. The v14 draw loop falls back to its original drawing whenever
   window.__cmdFx is not set.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__cmdFxLoaded) return;
  window.__cmdFxLoaded = true;
  window.__cmdFx = true;

  var TAU = Math.PI * 2;
  var stats = (window.__cmdFxStats = { shot: 0, hit: 0, kill: 0, place: 0, upgrade: 0, sell: 0, leak: 0, waveStart: 0, waveClear: 0, end: 0, heal: 0 });

  function game() { try { return typeof state !== 'undefined' && state && state.games ? state.games : null; } catch (e) { return null; } }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hash(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }

  /* ---- colour helpers ------------------------------------------------- */
  function rgb(c) {
    c = String(c || '#888888');
    if (c[0] === '#') { if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [parseInt(c.substr(1, 2), 16) || 0, parseInt(c.substr(3, 2), 16) || 0, parseInt(c.substr(5, 2), 16) || 0]; }
    var m = c.match(/(\d+)[ ,]+(\d+)[ ,]+(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [136, 136, 136];
  }
  function mix(c, d, t) { var a = rgb(c), b = rgb(d); return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')'; }
  function lighten(c, t) { return mix(c, '#ffffff', t); }
  function darken(c, t) { return mix(c, '#0a1020', t); }
  function alpha(c, a) { var r = rgb(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  function lin(ctx, x0, y0, x1, y1, c0, c1) { var g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function rad(ctx, x, y, r0, r1, stops) { var g = ctx.createRadialGradient(x, y, r0, x, y, r1); for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]); return g; }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

  /* ======================================================================
     1. ENEMIES
     ====================================================================== */
  var enemyMemory = new Map(); // id -> {face, lagHp, seen}
  var memTick = 0;
  function mem(e) {
    var m = enemyMemory.get(e.id);
    if (!m) { m = { face: 1, lagHp: e.hp, lastX: e.x, seen: 0 }; enemyMemory.set(e.id, m); }
    return m;
  }
  function isSlowed(e) {
    var su = Number(e.slowUntil) || 0; if (!su) return false;
    return su > Date.now() || (su < 1e9 && su > performance.now());
  }

  function eyes(ctx, s, dx, y, spread, size, look, color) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-spread, y, size, 0, TAU); ctx.arc(spread, y, size, 0, TAU); ctx.fill();
    ctx.fillStyle = color || '#1a2238';
    var px = look * size * .38;
    ctx.beginPath(); ctx.arc(-spread + px, y + size * .05, size * .56, 0, TAU); ctx.arc(spread + px, y + size * .05, size * .56, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(-spread + px - size * .18, y - size * .22, size * .2, 0, TAU); ctx.arc(spread + px - size * .18, y - size * .22, size * .2, 0, TAU); ctx.fill();
  }
  function gloss(ctx, rx, ry, w, h) { // soft top-left highlight
    ctx.save(); ctx.globalAlpha = .38; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(rx, ry, w, h, -.5, 0, TAU); ctx.fill(); ctx.restore();
  }

  /* each body is drawn facing +x at origin (feet on y = +0.7s), s = radius-ish */
  var BODY = {
    'leaf-leaper': function (c, s, t, o) {
      var k = o.hit ? 1 : 0, main = o.col, dark = darken(main, .45);
      var hop = Math.abs(Math.sin(t * 6.5 + o.ph));
      c.save(); c.translate(0, -hop * s * .35);
      // hind legs
      c.fillStyle = dark; c.beginPath(); c.ellipse(-s * .5, s * .5 + hop * s * .15, s * .2, s * .34, .5, 0, TAU); c.ellipse(s * .42, s * .52 + hop * s * .1, s * .17, s * .3, -.4, 0, TAU); c.fill();
      // leaf body
      c.fillStyle = lin(c, 0, -s * .8, 0, s * .6, lighten(main, .35), darken(main, .15));
      c.strokeStyle = dark; c.lineWidth = Math.max(1.5, s * .08);
      c.beginPath(); c.moveTo(-s * .8, s * .12); c.quadraticCurveTo(-s * .3, -s * .95, s * .15, -s * .72); c.quadraticCurveTo(s * .85, -s * .55, s * .8, s * .1); c.quadraticCurveTo(s * .4, s * .72, -s * .1, s * .6); c.quadraticCurveTo(-s * .55, s * .62, -s * .8, s * .12); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = alpha('#e9ffd8', .8); c.lineWidth = Math.max(1, s * .07); c.beginPath(); c.moveTo(-s * .55, s * .1); c.quadraticCurveTo(0, -s * .1, s * .62, -s * .18); c.stroke();
      gloss(c, -s * .1, -s * .45, s * .3, s * .14);
      eyes(c, s, 0, -s * .12, s * .3, s * .17, 1);
      c.restore();
    },
    'mireclaw': function (c, s, t, o) {
      var main = o.col, dark = darken(main, .5), snap = Math.sin(t * 5 + o.ph) * .25;
      // legs
      c.strokeStyle = dark; c.lineWidth = Math.max(2, s * .1); c.lineCap = 'round';
      for (var i = -1; i <= 1; i += 2) for (var j = 0; j < 3; j++) { var wob = Math.sin(t * 9 + j + o.ph) * s * .08; c.beginPath(); c.moveTo(i * s * .35, s * .2); c.lineTo(i * (s * .7 + j * s * .08), s * .45 + wob + j * s * .06); c.stroke(); }
      // claws
      [-1, 1].forEach(function (i) {
        c.save(); c.translate(i * s * .78, -s * .08); c.rotate(i * (.3 + snap));
        c.fillStyle = lin(c, 0, -s * .3, 0, s * .3, lighten(main, .25), dark); c.strokeStyle = dark; c.lineWidth = Math.max(1.3, s * .07);
        c.beginPath(); c.arc(0, 0, s * .26, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = '#fff3d0'; c.beginPath(); c.moveTo(i * s * .1, -s * .1); c.lineTo(i * s * .42, -s * .34); c.lineTo(i * s * .26, 0); c.lineTo(i * s * .4, s * .2); c.lineTo(i * s * .08, s * .1); c.closePath(); c.fill(); c.stroke();
        c.restore();
      });
      c.fillStyle = rad(c, -s * .15, -s * .25, s * .05, s * .8, [[0, lighten(main, .4)], [1, darken(main, .2)]]); c.strokeStyle = dark; c.lineWidth = Math.max(1.5, s * .08);
      c.beginPath(); c.ellipse(0, 0, s * .66, s * .56, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = alpha(dark, .35); for (var k = -1; k <= 1; k++) { c.beginPath(); c.arc(k * s * .26, s * .12, s * .07, 0, TAU); c.fill(); }
      gloss(c, -s * .2, -s * .3, s * .28, s * .12);
      eyes(c, s, 0, -s * .12, s * .22, s * .14, 1, '#2b1018');
    },
    'bramblebeast': function (c, s, t, o) {
      var main = o.col, dark = darken(main, .5), step = Math.sin(t * 4 + o.ph);
      c.fillStyle = dark; // legs
      c.beginPath(); c.roundRect ? c.roundRect(-s * .55, s * .2, s * .3, s * .55 + step * s * .06, s * .1) : c.rect(-s * .55, s * .2, s * .3, s * .55); c.roundRect ? c.roundRect(s * .22, s * .2, s * .3, s * .55 - step * s * .06, s * .1) : c.rect(s * .22, s * .2, s * .3, s * .55); c.fill();
      // thorns (back)
      c.fillStyle = lin(c, 0, -s, 0, 0, '#d6e8a0', '#6d8a3c'); c.strokeStyle = darken('#6d8a3c', .5); c.lineWidth = Math.max(1, s * .05);
      for (var i = 0; i < 6; i++) { var x = -s * .65 + i * s * .26; c.beginPath(); c.moveTo(x - s * .1, -s * .3); c.lineTo(x + s * .02, -s * (.78 + (i % 2) * .16)); c.lineTo(x + s * .14, -s * .3); c.closePath(); c.fill(); c.stroke(); }
      c.fillStyle = rad(c, -s * .2, -s * .3, s * .1, s * 1.1, [[0, lighten(main, .35)], [1, darken(main, .22)]]); c.strokeStyle = dark; c.lineWidth = Math.max(2, s * .08);
      rr(c, -s * .78, -s * .42, s * 1.56, s * 1.0, s * .38); c.fill(); c.stroke();
      c.fillStyle = alpha('#2a1a0e', .28); c.beginPath(); c.ellipse(s * .1, s * .24, s * .5, s * .22, 0, 0, TAU); c.fill();
      // tusks
      c.fillStyle = '#fff6dd'; c.strokeStyle = dark; c.lineWidth = Math.max(1, s * .04);
      [-1, 1].forEach(function (i) { c.beginPath(); c.moveTo(i * s * .26, s * .22); c.lineTo(i * s * .4, s * .5); c.lineTo(i * s * .12, s * .3); c.closePath(); c.fill(); c.stroke(); });
      gloss(c, -s * .3, -s * .22, s * .36, s * .14);
      eyes(c, s, 0, -s * .06, s * .27, s * .13, 1, '#2a0d0d');
      c.strokeStyle = dark; c.lineWidth = Math.max(2, s * .07); c.beginPath(); c.moveTo(-s * .45, -s * .25); c.lineTo(-s * .12, -s * .15); c.moveTo(s * .45, -s * .25); c.lineTo(s * .12, -s * .15); c.stroke();
    },
    'hexhound': function (c, s, t, o) {
      var main = o.col, dark = darken(main, .5), glow = .6 + .4 * Math.sin(t * 4 + o.ph);
      var run = Math.sin(t * 8 + o.ph);
      c.fillStyle = dark; for (var i = -1; i <= 1; i += 2) { c.beginPath(); c.ellipse(i * s * .36, s * .5 + run * i * s * .06, s * .13, s * .26, i * .2, 0, TAU); c.fill(); }
      // tail crystal
      c.fillStyle = lighten(main, .35); c.beginPath(); c.moveTo(-s * .55, -s * .05); c.lineTo(-s * .98, -s * .38); c.lineTo(-s * .72, s * .08); c.closePath(); c.fill();
      c.fillStyle = lin(c, 0, -s * .75, 0, s * .65, lighten(main, .4), darken(main, .25)); c.strokeStyle = dark; c.lineWidth = Math.max(2, s * .08);
      c.beginPath(); c.moveTo(-s * .62, s * .34); c.lineTo(-s * .5, -s * .35); c.lineTo(-s * .1, -s * .7); c.lineTo(s * .45, -s * .5); c.lineTo(s * .74, s * .08); c.lineTo(s * .3, s * .62); c.lineTo(-s * .3, s * .64); c.closePath(); c.fill(); c.stroke();
      // rune
      c.save(); c.shadowColor = '#d9c4ff'; c.shadowBlur = s * .5 * glow; c.strokeStyle = alpha('#f2e8ff', .9); c.lineWidth = Math.max(1.4, s * .07);
      c.beginPath(); c.moveTo(-s * .3, s * .1); c.lineTo(-s * .05, -s * .32); c.lineTo(s * .2, s * .1); c.lineTo(-s * .3, s * .1); c.stroke(); c.restore();
      // ears
      c.fillStyle = dark; c.beginPath(); c.moveTo(s * .12, -s * .55); c.lineTo(s * .22, -s * .98); c.lineTo(s * .42, -s * .5); c.closePath(); c.fill();
      gloss(c, -s * .15, -s * .38, s * .28, s * .11);
      eyes(c, s, 0, -s * .12, s * .2, s * .12, 1, '#3a1766');
    },
    'sky-mote': function (c, s, t, o) {
      var main = o.col, flap = Math.sin(t * 16 + o.ph);
      c.save(); c.globalAlpha = .85; c.fillStyle = lin(c, 0, -s, 0, s, '#ffffff', lighten(main, .3)); c.strokeStyle = alpha('#ffffff', .8); c.lineWidth = Math.max(1, s * .05);
      [-1, 1].forEach(function (i) { c.save(); c.scale(1, 1); c.beginPath(); c.moveTo(i * s * .14, -s * .02); c.quadraticCurveTo(i * s * 1.05, -s * (.75 + flap * .22), i * s * 1.0, s * .05); c.quadraticCurveTo(i * s * .75, s * .5, i * s * .14, s * .14); c.closePath(); c.fill(); c.stroke(); c.restore(); });
      c.restore();
      c.save(); c.shadowColor = main; c.shadowBlur = s * .9;
      c.fillStyle = rad(c, -s * .12, -s * .15, s * .04, s * .62, [[0, '#ffffff'], [.35, lighten(main, .35)], [1, darken(main, .1)]]);
      c.beginPath(); c.arc(0, 0, s * .52, 0, TAU); c.fill(); c.restore();
      eyes(c, s, 0, -s * .02, s * .16, s * .1, 1);
    },
    'shardback': function (c, s, t, o) {
      var main = o.col, dark = darken(main, .5), step = Math.sin(t * 7 + o.ph);
      c.strokeStyle = dark; c.lineWidth = Math.max(2, s * .09); c.lineCap = 'round';
      for (var i = 0; i < 3; i++) { var x = -s * .38 + i * s * .38, w = Math.sin(t * 9 + i * 2 + o.ph) * s * .09; c.beginPath(); c.moveTo(x, s * .3); c.lineTo(x + w, s * .62); c.stroke(); }
      // crystal spines
      for (var k = 0; k < 5; k++) { var xx = -s * .5 + k * s * .25, hh = s * (.62 + ((k * 7) % 3) * .14); c.fillStyle = lin(c, xx, -s * .3 - hh, xx, -s * .3, '#fff4cf', lighten(main, .15)); c.strokeStyle = darken(main, .4); c.lineWidth = Math.max(1, s * .05); c.beginPath(); c.moveTo(xx - s * .13, -s * .28); c.lineTo(xx + s * .02, -s * .28 - hh); c.lineTo(xx + s * .15, -s * .28); c.closePath(); c.fill(); c.stroke(); }
      c.fillStyle = rad(c, -s * .15, -s * .2, s * .05, s * .95, [[0, lighten(main, .38)], [1, darken(main, .25)]]); c.strokeStyle = dark; c.lineWidth = Math.max(2, s * .08);
      rr(c, -s * .66, -s * .34, s * 1.32, s * .88, s * .3); c.fill(); c.stroke();
      c.strokeStyle = alpha(dark, .35); c.lineWidth = Math.max(1, s * .05); c.beginPath(); c.moveTo(-s * .1, -s * .3); c.lineTo(-s * .1, s * .5); c.stroke();
      gloss(c, -s * .3, -s * .16, s * .28, s * .1);
      eyes(c, s, 0, s * .02, s * .24, s * .12, 1, '#2c2018');
    },
    'stonewarden': function (c, s, t, o) {
      var main = o.col, dark = darken(main, .5), step = Math.sin(t * 3.4 + o.ph);
      c.fillStyle = dark; c.beginPath(); rr(c, -s * .52, s * .22, s * .36, s * .52 + step * s * .05, s * .1); c.fill(); rr(c, s * .16, s * .22, s * .36, s * .52 - step * s * .05, s * .1); c.fill();
      // arms
      c.fillStyle = lin(c, 0, -s * .3, 0, s * .6, lighten(main, .15), dark); c.strokeStyle = dark; c.lineWidth = Math.max(2, s * .07);
      [-1, 1].forEach(function (i) { rr(c, i * s * .62 - s * .16, -s * .2, s * .32, s * .62, s * .14); c.fill(); c.stroke(); });
      // torso
      c.fillStyle = lin(c, -s * .4, -s * .6, s * .5, s * .5, lighten(main, .3), darken(main, .22)); c.lineWidth = Math.max(2, s * .08);
      c.beginPath(); c.moveTo(-s * .6, s * .3); c.lineTo(-s * .5, -s * .5); c.lineTo(s * .5, -s * .5); c.lineTo(s * .6, s * .3); c.lineTo(s * .35, s * .5); c.lineTo(-s * .35, s * .5); c.closePath(); c.fill(); c.stroke();
      // cracks + moss
      c.strokeStyle = alpha(dark, .55); c.lineWidth = Math.max(1, s * .045); c.beginPath(); c.moveTo(-s * .2, -s * .4); c.lineTo(-s * .05, -s * .1); c.lineTo(-s * .25, s * .2); c.moveTo(s * .3, -s * .2); c.lineTo(s * .15, s * .1); c.stroke();
      c.fillStyle = alpha('#6fbf62', .85); c.beginPath(); c.ellipse(s * .28, -s * .46, s * .26, s * .1, 0, 0, TAU); c.ellipse(-s * .36, s * .36, s * .16, s * .07, 0, 0, TAU); c.fill();
      // head slit eyes
      c.fillStyle = '#0e1620'; rr(c, -s * .3, -s * .34, s * .6, s * .22, s * .08); c.fill();
      c.save(); c.shadowColor = '#ffd36a'; c.shadowBlur = s * .4; c.fillStyle = '#ffe29a'; c.beginPath(); c.arc(-s * .13, -s * .23, s * .06, 0, TAU); c.arc(s * .13, -s * .23, s * .06, 0, TAU); c.fill(); c.restore();
      gloss(c, -s * .2, -s * .5, s * .3, s * .07);
    },
    'gloom-caster': function (c, s, t, o) {
      var main = o.col, dark = darken(main, .55), sway = Math.sin(t * 3 + o.ph);
      // robe
      c.fillStyle = lin(c, 0, -s * .8, 0, s * .8, lighten(main, .22), dark); c.strokeStyle = darken(main, .6); c.lineWidth = Math.max(2, s * .08);
      c.beginPath(); c.moveTo(-s * .36, -s * .5); c.quadraticCurveTo(0, -s * .95, s * .36, -s * .5); c.lineTo(s * .68, s * .62 + sway * s * .04); for (var i = 0; i < 4; i++) c.lineTo(s * (.68 - (i + .5) * .34), s * (.72 + (i % 2 ? .04 : -.04)) + sway * s * .04); c.lineTo(-s * .68, s * .62 - sway * s * .04); c.closePath(); c.fill(); c.stroke();
      // hood face
      c.fillStyle = '#120a1e'; c.beginPath(); c.ellipse(0, -s * .22, s * .3, s * .34, 0, 0, TAU); c.fill();
      c.save(); c.shadowColor = '#f0a8ff'; c.shadowBlur = s * .5; c.fillStyle = '#ffd8ff'; c.beginPath(); c.ellipse(-s * .12, -s * .24, s * .06, s * .09, 0, 0, TAU); c.ellipse(s * .12, -s * .24, s * .06, s * .09, 0, 0, TAU); c.fill(); c.restore();
      // floating orb
      var oy = -s * .08 + Math.sin(t * 4 + o.ph) * s * .1;
      c.save(); c.shadowColor = '#d58cff'; c.shadowBlur = s * .9; c.fillStyle = rad(c, s * .66, oy, 0, s * .22, [[0, '#fff'], [.45, '#e7b8ff'], [1, '#8a43c7']]); c.beginPath(); c.arc(s * .66, oy, s * .2, 0, TAU); c.fill(); c.restore();
      c.strokeStyle = alpha('#e7b8ff', .6); c.lineWidth = 1.5; c.beginPath(); c.arc(s * .66, oy, s * .3, t * 3, t * 3 + 2.2); c.stroke();
    }
  };
  var ALIAS = { runner: 'leaf-leaper', raider: 'mireclaw', brute: 'bramblebeast', elite: 'hexhound', flier: 'sky-mote', splitter: 'shardback', warden: 'stonewarden', caster: 'gloom-caster' };
  var BOSS = { bramblebeast: 1, hexhound: 1, stonewarden: 1, 'gloom-caster': 1 };

  function drawEnemy(ctx, e) {
    var s = Math.max(10, Number(e.size) || 18), t = performance.now() / 1000;
    var shape = e.shape || e.kind, key = BODY[shape] ? shape : (BODY[ALIAS[shape]] ? ALIAS[shape] : (BODY[ALIAS[e.kind]] ? ALIAS[e.kind] : null));
    var m = mem(e); m.seen = memTick;
    var dx = e.x - m.lastX; if (Math.abs(dx) > .15) m.face = dx > 0 ? 1 : -1; m.lastX = e.x;
    var hit = e.hit > 0, slowed = isSlowed(e), flying = key === 'sky-mote';
    var ph = hash(e.id) * TAU, base = e.color || '#d85c70';
    var col = hit ? lighten(base, .7) : (slowed ? mix(base, '#9fe8ff', .35) : base);
    var bob = flying ? Math.sin(t * 3 + ph) * s * .12 : Math.abs(Math.sin(t * 5 + ph)) * s * .05;
    var lift = flying ? s * .55 : 0;

    ctx.save();
    ctx.translate(e.x, e.y);
    // ground shadow (stays on the ground while flyers hover)
    ctx.fillStyle = 'rgba(8,16,24,' + (flying ? .2 : .3) + ')';
    ctx.beginPath(); ctx.ellipse(0, s * .72, s * (flying ? .5 : .85), s * (flying ? .11 : .2), 0, 0, TAU); ctx.fill();
    if (BOSS[key]) { // faint aura ring so heavy enemies read at a glance
      ctx.strokeStyle = alpha(base, .35); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, s * .72, s * 1.05, s * .3, 0, 0, TAU); ctx.stroke();
    }
    ctx.translate(0, -bob - lift);
    ctx.scale(m.face, 1);
    if (key) { BODY[key](ctx, s, t, { col: col, hit: hit, ph: ph }); }
    else { // unknown kind: still looks intentional
      ctx.fillStyle = rad(ctx, -s * .2, -s * .25, s * .05, s, [[0, lighten(col, .4)], [1, darken(col, .2)]]); ctx.strokeStyle = darken(col, .5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, s * .7, 0, TAU); ctx.fill(); ctx.stroke(); eyes(ctx, s, 0, -s * .1, s * .22, s * .13, 1);
    }
    ctx.restore();

    if (slowed) { // frost crystals orbiting a slowed enemy
      ctx.save(); ctx.translate(e.x, e.y - lift - bob); ctx.globalAlpha = .85;
      for (var i = 0; i < 3; i++) { var a = t * 2 + i * TAU / 3, px = Math.cos(a) * s * .85, py = Math.sin(a) * s * .45 - s * .1; ctx.fillStyle = '#e6fbff'; ctx.strokeStyle = '#7fdcff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + 3, py); ctx.lineTo(px, py + 4); ctx.lineTo(px - 3, py); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    drawHpBar(ctx, e, s, lift + bob, m);
  }

  function drawHpBar(ctx, e, s, up, m) {
    var max = Math.max(1, Number(e.maxHp) || 1), hp = clamp(Number(e.hp) || 0, 0, max), r = hp / max;
    m.lagHp += (hp - m.lagHp) * .12; if (m.lagHp < hp) m.lagHp = hp;
    var always = BOSS[BODY[e.shape] ? e.shape : ALIAS[e.kind]];
    if (r >= .999 && !always) return;
    var w = Math.max(28, s * 2.1), h = 6, x = e.x - w / 2, y = e.y - s - up - 16;
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,24,.8)'; rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; rr(ctx, x, y, Math.max(0, w * clamp(m.lagHp / max, 0, 1)), h, 3); ctx.fill();
    var c0 = r > .5 ? '#7cf0b0' : (r > .25 ? '#ffd166' : '#ff6b81'), c1 = r > .5 ? '#2fbf7d' : (r > .25 ? '#f0a020' : '#e0344f');
    if (r > 0) { ctx.fillStyle = lin(ctx, 0, y, 0, y + h, c0, c1); rr(ctx, x, y, Math.max(3, w * r), h, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(ctx, x + 1, y + 1, Math.max(0, w * r - 2), 1.6, 1); ctx.fill(); }
    ctx.restore();
  }

  /* ======================================================================
     2. PROJECTILES
     ====================================================================== */
  var trails = new WeakMap();
  function family(type) {
    type = String(type || 'basic').toLowerCase();
    if (/medic|heal/.test(type)) return 'heal';
    if (/coin/.test(type)) return 'coin';
    if (/flame|fire|dragon|ember|inferno/.test(type)) return 'fire';
    if (/frost|ice|snow|crystal/.test(type)) return 'ice';
    if (/poison|jelly|toxic|acid|alchemy|flask|bubble|kraken|slime/.test(type)) return 'goo';
    if (/rocket|cannon|choco|eclipse|blast|bomb|mecha|hammer|punch|quasar|arcade/.test(type)) return 'blast';
    if (/chain|circuit|arc|lightning|glitch|joystick|pixel/.test(type)) return 'arc';
    if (/star|note|sigil|score|void|supernova|comet|moon|nebula|sprinkle/.test(type)) return 'star';
    if (/sniper|ray|beam|lance|harpoon|spear|trident|thrust|stinger|pulse/.test(type)) return 'beam';
    if (/boomerang|lash|snare|whip|tentacle|racer|servo/.test(type)) return 'swirl';
    return 'orb';
  }
  var FAMILY_COLOR = { fire: '#ff7a1f', ice: '#4fd0ff', goo: '#45dd5a', blast: '#ffae2b', arc: '#a56bff', star: '#ffd23f', beam: '#36c4ff', swirl: '#ff6fb5', heal: '#3fe08f', coin: '#ffc533', orb: '#4db8ff' };

  function glow(ctx, x, y, r, color, a) { // additive sparkle on top of a normal-composite body
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 0; a *= .5;
    ctx.fillStyle = rad(ctx, x, y, 0, r, [[0, alpha('#ffffff', a)], [.25, alpha(color, a * .85)], [1, alpha(color, 0)]]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  function drawTrail(ctx, pts, color, width, aMax) {
    if (pts.length < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 1; i < pts.length; i++) {
      var f = i / (pts.length - 1);
      ctx.strokeStyle = alpha(color, aMax * f * f); ctx.lineWidth = Math.max(.8, width * f);
      ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
  }

  function drawProjectile(ctx, q, box, now) {
    var x = Number(q.x || 0) * box.width, y = Number(q.y || 0) * box.height;
    var type = q.attackType || q.type || 'basic', fam = family(type);
    var color = q.color && fam !== 'orb' ? q.color : (q.color || FAMILY_COLOR[fam]);
    if (fam === 'fire' || fam === 'ice' || fam === 'heal' || fam === 'coin') color = FAMILY_COLOR[fam];
    var px = Number(q.prevX != null ? q.prevX : q.x || 0) * box.width, py = Number(q.prevY != null ? q.prevY : q.y || 0) * box.height;
    var tr = trails.get(q); if (!tr) { tr = []; trails.set(q, tr); }
    var last = tr[tr.length - 1];
    if (!last || Math.hypot(last[0] - x, last[1] - y) > 1.5) { tr.push([x, y]); if (tr.length > 10) tr.shift(); }
    var ang = Math.atan2(y - py, x - px); if (!isFinite(ang) || (x === px && y === py)) ang = 0;
    var t = (now || performance.now()) / 1000, ph = (hash(String(q.tx || '') + fam) * TAU);
    ctx.save();
    ctx.shadowColor = 'rgba(8,16,34,.65)'; ctx.shadowBlur = 5;
    ctx.globalAlpha = clamp(Number(q.opacity == null ? 1 : q.opacity), .2, 1);

    switch (fam) {
      case 'beam':
        drawTrail(ctx, tr, color, 5, .75);
        ctx.translate(x, y); ctx.scale(1.3, 1.3); ctx.rotate(ang);
        ctx.fillStyle = lin(ctx, -20, 0, 8, 0, alpha(color, 0), '#ffffff'); rr(ctx, -20, -2.2, 28, 4.4, 2.2); ctx.fill();
        glow(ctx, 6, 0, 13, color, .9); break;
      case 'fire': {
        drawTrail(ctx, tr, '#ff7a2e', 9, .55);
        for (var i = 0; i < 5; i++) { var f = (t * 9 + i * .7 + ph) % 1; glow(ctx, x - Math.cos(ang) * f * 20 + Math.sin(i * 9 + t * 20) * 2.5, y - Math.sin(ang) * f * 20 - f * 6, 7 * (1 - f) + 2, f < .5 ? '#ffb347' : '#ff5a1f', .65 * (1 - f)); }
        ctx.translate(x, y); ctx.scale(1.3, 1.3); ctx.rotate(ang);
        ctx.fillStyle = lin(ctx, -12, 0, 12, 0, '#ff6a1f', '#fff3b0'); ctx.beginPath(); ctx.moveTo(13, 0); ctx.quadraticCurveTo(0, -9 - Math.sin(t * 30) * 1.5, -11, -2); ctx.quadraticCurveTo(-5, 0, -11, 3); ctx.quadraticCurveTo(0, 9 + Math.sin(t * 27) * 1.5, 13, 0); ctx.fill();
        glow(ctx, 2, 0, 14, '#ff9a45', .85); break;
      }
      case 'ice':
        drawTrail(ctx, tr, '#a8ecff', 5, .6);
        ctx.translate(x, y); ctx.scale(1.3, 1.3); ctx.rotate(t * 3 + ph);
        ctx.fillStyle = lin(ctx, -9, -9, 9, 9, '#ffffff', '#6fd8ff'); ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(5.5, 0); ctx.lineTo(0, 10); ctx.lineTo(-5.5, 0); ctx.closePath(); ctx.fill();
        ctx.rotate(Math.PI / 2); ctx.globalAlpha *= .55; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(3.5, 0); ctx.lineTo(0, 7); ctx.lineTo(-3.5, 0); ctx.closePath(); ctx.fill();
        ctx.rotate(-Math.PI / 2); glow(ctx, 0, 0, 14, '#8fe6ff', .65); break;
      case 'goo': {
        drawTrail(ctx, tr, color, 7, .5);
        var wob = 1 + Math.sin(t * 14 + ph) * .12;
        ctx.translate(x, y); ctx.scale(1.3, 1.3); ctx.rotate(ang);
        ctx.fillStyle = rad(ctx, -1.5, -2, 1, 8, [[0, '#ffffff'], [.4, lighten(color, .3)], [1, color]]); ctx.beginPath(); ctx.ellipse(0, 0, 7.5 * wob, 6.2 / wob, 0, 0, TAU); ctx.fill();
        for (var b = 0; b < 3; b++) { var a2 = t * 5 + b * 2.1 + ph; glow(ctx, Math.cos(a2) * 9, Math.sin(a2) * 7, 3.2, color, .7); }
        glow(ctx, 0, 0, 14, color, .45); break;
      }
      case 'blast': {
        drawTrail(ctx, tr, '#ffb04d', 7, .5);
        ctx.translate(x, y); ctx.scale(1.3, 1.3); ctx.rotate(ang);
        for (var k = 0; k < 4; k++) { var ff = (t * 12 + k * .25 + ph) % 1; glow(ctx, -9 - ff * 16, Math.sin(k * 5 + t * 18) * 2, 6 * (1 - ff) + 1.5, ff < .5 ? '#ffd27a' : '#ff6b3a', .7 * (1 - ff)); }
        ctx.fillStyle = lin(ctx, 0, -6, 0, 6, '#e8edf5', '#7b8798'); rr(ctx, -9, -4.2, 15, 8.4, 4); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(6, -4.2); ctx.quadraticCurveTo(13, 0, 6, 4.2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.65)'; rr(ctx, -7, -3.2, 11, 1.8, 1); ctx.fill();
        glow(ctx, 6, 0, 13, color, .6); break;
      }
      case 'arc': {
        ctx.strokeStyle = alpha(color, .9); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        var sx = x - Math.cos(ang) * 26, sy = y - Math.sin(ang) * 26;
        ctx.shadowColor = color; ctx.shadowBlur = 10;
        for (var pass = 0; pass < 2; pass++) { ctx.lineWidth = pass ? 1.1 : 3; ctx.strokeStyle = pass ? '#ffffff' : alpha(color, .8); ctx.beginPath(); ctx.moveTo(sx, sy); for (var n = 1; n <= 5; n++) { var u = n / 5, jx = (Math.sin(t * 60 + n * 3.1 + pass) * 4.5) * (n < 5 ? 1 : 0), jy = (Math.cos(t * 55 + n * 2.3) * 4.5) * (n < 5 ? 1 : 0); ctx.lineTo(sx + (x - sx) * u - Math.sin(ang) * jx, sy + (y - sy) * u + Math.cos(ang) * jy); } ctx.stroke(); }
        ctx.shadowBlur = 0; glow(ctx, x, y, 12, color, .85); break;
      }
      case 'star': {
        drawTrail(ctx, tr, color, 6, .55);
        ctx.translate(x, y); ctx.scale(1.3, 1.3); ctx.rotate(t * 4 + ph);
        ctx.fillStyle = lin(ctx, -9, -9, 9, 9, '#ffffff', color); ctx.beginPath();
        for (var p = 0; p < 10; p++) { var a3 = -Math.PI / 2 + p * Math.PI / 5, r3 = p % 2 ? 4 : 10; p ? ctx.lineTo(Math.cos(a3) * r3, Math.sin(a3) * r3) : ctx.moveTo(Math.cos(a3) * r3, Math.sin(a3) * r3); }
        ctx.closePath(); ctx.fill(); glow(ctx, 0, 0, 15, color, .6); break;
      }
      case 'swirl': {
        drawTrail(ctx, tr, color, 6, .5);
        ctx.translate(x, y); ctx.scale(1.3, 1.3); ctx.rotate(t * 10 + ph);
        ctx.strokeStyle = alpha(color, .95); ctx.lineWidth = 3.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, 8, -.2, 2.3); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 8, Math.PI - .2, Math.PI + 2.3); ctx.stroke();
        glow(ctx, 0, 0, 13, color, .6); break;
      }
      case 'heal': {
        drawTrail(ctx, tr, '#68efb0', 6, .6);
        ctx.translate(x, y); ctx.scale(1.3, 1.3);
        glow(ctx, 0, 0, 15, '#68efb0', .8);
        ctx.fillStyle = '#ffffff'; rr(ctx, -2, -6.5, 4, 13, 1.5); ctx.fill(); rr(ctx, -6.5, -2, 13, 4, 1.5); ctx.fill();
        for (var h = 0; h < 3; h++) { var a4 = t * 4 + h * 2.1; glow(ctx, Math.cos(a4) * 10, Math.sin(a4) * 10, 2.6, '#c5ffe0', .8); }
        break;
      }
      case 'coin': {
        drawTrail(ctx, tr, '#ffd35a', 5, .5);
        ctx.translate(x, y); ctx.scale(1.3, 1.3); var sq = Math.abs(Math.cos(t * 9 + ph)) * .8 + .2;
        ctx.fillStyle = lin(ctx, -6, -6, 6, 6, '#fff2a0', '#e0a21c'); ctx.strokeStyle = '#a9700e'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0, 6.5 * sq, 6.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
        glow(ctx, 0, 0, 12, '#ffd35a', .5); break;
      }
      default: {
        drawTrail(ctx, tr, color, 6, .6);
        ctx.translate(x, y); ctx.scale(1.3, 1.3);
        var pul = .9 + Math.sin(t * 18 + ph) * .1;
        ctx.fillStyle = rad(ctx, 0, 0, 0, 7 * pul, [[0, '#ffffff'], [.5, lighten(color, .35)], [1, color]]); ctx.beginPath(); ctx.arc(0, 0, 6 * pul, 0, TAU); ctx.fill();
        glow(ctx, 0, 0, 14, color, .6);
      }
    }
    ctx.restore();
  }

  /* ======================================================================
     3. HOOK INSTALLATION (the battle layers re-assign these; re-wrap).
     ====================================================================== */
  function install() {
    if (typeof window.commanderDrawEnemyFinal === 'function' && !window.commanderDrawEnemyFinal.__fx) {
      var ef = function (ctx, e) { try { drawEnemy(ctx, e); } catch (err) { /* never break the frame */ } };
      ef.__fx = true; window.commanderDrawEnemyFinal = ef;
      try { commanderDrawEnemyFinal = ef; } catch (e2) { /* const/closure binding: window hook is enough */ }
    }
    if (typeof window.projectileDraw === 'function' && !window.projectileDraw.__fx) {
      var pf = function (ctx, q, box, now) { try { drawProjectile(ctx, q, box, now); } catch (err) { } };
      pf.__fx = true; window.projectileDraw = pf;
    }
  }
  install(); setInterval(install, 300);

  /* ======================================================================
     4. AUDIO — synthesized, rate-limited, mutable
     ====================================================================== */
  var KEY = 'index-cmd-sfx';
  var muted = false; try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) { }
  var AC = null, master = null, noiseBuf = null, lastPlay = {}, unlocked = false;

  function ac() {
    if (AC) return AC;
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    try {
      AC = new C(); master = AC.createGain(); master.gain.value = .5;
      var comp = AC.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6;
      master.connect(comp); comp.connect(AC.destination);
      var len = AC.sampleRate * .6, b = AC.createBuffer(1, len, AC.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; noiseBuf = b;
    } catch (e) { AC = null; }
    return AC;
  }
  function unlock() { var c = ac(); if (c && c.state === 'suspended') c.resume(); unlocked = true; }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, unlock, { capture: true, passive: true }); });

  function tone(o) {
    var c = AC; if (!c) return; var t0 = c.currentTime + (o.delay || 0), dur = o.dur || .1;
    var osc = c.createOscillator(), g = c.createGain(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0); if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
    var v = (o.vol || .1);
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + Math.min(.012, dur * .3)); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    var out = g; if (o.lp) { var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); f.connect(g); } else osc.connect(g);
    g.connect(master); osc.start(t0); osc.stop(t0 + dur + .03);
  }
  function noise(o) {
    var c = AC; if (!c || !noiseBuf) return; var t0 = c.currentTime + (o.delay || 0), dur = o.dur || .08;
    var src = c.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = o.rate || 1;
    var f = c.createBiquadFilter(); f.type = o.ftype || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1800, t0); if (o.freq1) f.frequency.exponentialRampToValueAtTime(o.freq1, t0 + dur); f.Q.value = o.q || 1;
    var g = c.createGain(); g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(o.vol || .08, t0 + .008); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t0, Math.random() * .3); src.stop(t0 + dur + .03);
  }
  function can(name, gap) { var n = performance.now(); if (n - (lastPlay[name] || 0) < gap) return false; lastPlay[name] = n; return true; }
  function jit(f) { return f * (1 + (Math.random() - .5) * .12); }

  var SFX = {
    shot: function (fam) {
      if (!can('shot', 55)) return; var f = jit(1);
      switch (fam) {
        case 'beam': tone({ f0: 1500 * f, f1: 600, type: 'square', dur: .07, vol: .035, lp: 3500 }); break;
        case 'fire': noise({ dur: .14, freq: 900, freq1: 400, q: .7, vol: .07 }); tone({ f0: 180 * f, f1: 120, type: 'sawtooth', dur: .12, vol: .025, lp: 700 }); break;
        case 'ice': tone({ f0: 1900 * f, f1: 2600, type: 'sine', dur: .09, vol: .04 }); tone({ f0: 2850 * f, f1: 3200, type: 'sine', dur: .07, vol: .02, delay: .02 }); break;
        case 'goo': tone({ f0: 280 * f, f1: 560, type: 'sine', dur: .1, vol: .07 }); break;
        case 'blast': noise({ dur: .12, freq: 500, freq1: 160, q: .8, vol: .1 }); tone({ f0: 150 * f, f1: 55, type: 'sine', dur: .16, vol: .12 }); break;
        case 'arc': noise({ dur: .07, freq: 3200, q: 3, vol: .06 }); tone({ f0: 900 * f, f1: 300, type: 'sawtooth', dur: .06, vol: .02, lp: 2500 }); break;
        case 'star': var n = [880, 988, 1175, 1319][Math.floor(Math.random() * 4)]; tone({ f0: n, type: 'sine', dur: .16, vol: .05 }); tone({ f0: n * 2, type: 'sine', dur: .1, vol: .018 }); break;
        case 'swirl': tone({ f0: 420 * f, f1: 900, type: 'triangle', dur: .1, vol: .05 }); break;
        default: tone({ f0: 760 * f, f1: 380, type: 'triangle', dur: .07, vol: .05 });
      }
      stats.shot++;
    },
    heal: function () { if (!can('heal', 150)) return; tone({ f0: 660, type: 'sine', dur: .14, vol: .05 }); tone({ f0: 990, type: 'sine', dur: .2, vol: .045, delay: .07 }); stats.heal++; },
    hit: function () { if (!can('hit', 40)) return; noise({ dur: .035, freq: jit(1900), q: 1.2, vol: .045 }); stats.hit++; },
    kill: function () { if (!can('kill', 60)) return; tone({ f0: jit(560), f1: 170, type: 'sine', dur: .11, vol: .09 }); noise({ dur: .08, freq: 1400, freq1: 500, q: .8, vol: .06 }); tone({ f0: jit(980), f1: 1500, type: 'sine', dur: .09, vol: .03, delay: .03 }); stats.kill++; },
    place: function () { tone({ f0: 190, f1: 85, type: 'sine', dur: .14, vol: .14 }); tone({ f0: 660, type: 'sine', dur: .16, vol: .05, delay: .05 }); tone({ f0: 990, type: 'sine', dur: .22, vol: .045, delay: .11 }); stats.place++; },
    upgrade: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone({ f0: f, type: 'triangle', dur: .16, vol: .06, delay: i * .06 }); }); stats.upgrade++; },
    sell: function () { tone({ f0: 1568, type: 'sine', dur: .1, vol: .05 }); tone({ f0: 2093, type: 'sine', dur: .16, vol: .045, delay: .06 }); stats.sell++; },
    leak: function () { if (!can('leak', 250)) return; tone({ f0: 120, f1: 48, type: 'sawtooth', dur: .28, vol: .16, lp: 500 }); noise({ dur: .22, freq: 300, q: .6, vol: .1 }); stats.leak++; },
    waveStart: function () { tone({ f0: 196, f1: 392, type: 'sawtooth', dur: .5, vol: .05, lp: 1100 }); tone({ f0: 294, f1: 587, type: 'triangle', dur: .5, vol: .04, delay: .05 }); stats.waveStart++; },
    waveClear: function () { [523, 659, 784].forEach(function (f, i) { tone({ f0: f, type: 'triangle', dur: .22, vol: .07, delay: i * .09 }); }); tone({ f0: 1046, type: 'sine', dur: .5, vol: .06, delay: .27 }); stats.waveClear++; },
    win: function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone({ f0: f, type: 'triangle', dur: .3, vol: .07, delay: i * .1 }); }); stats.end++; },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone({ f0: f, type: 'sawtooth', dur: .4, vol: .05, delay: i * .18, lp: 900 }); }); stats.end++; }
  };
  function play(name, a) { if (muted) return; if (!ac()) return; if (AC.state === 'suspended') { AC.resume(); } try { SFX[name](a); } catch (e) { } }
  window.__cmdFxSfx = { play: play, isMuted: function () { return muted; } };

  /* ======================================================================
     5. IMPACT / FEEDBACK OVERLAY (read-only observer of state.games)
     ====================================================================== */
  var cvs = null, ctx2 = null, W = 0, H = 0, parts = [], texts = [], raf = 0, lastT = 0;
  var seenProj = new WeakSet(), liveProj = new Map(), prevEnemies = new Map(), prevBase = null, prevTowers = 0, prevLevels = 0, prevRunning = false, prevFinished = false, flash = 0, lastGameRef = null, projSeq = 0, projIds = new WeakMap();

  function ensureOverlay() {
    var main = document.getElementById('commander-auth-canvas'); if (!main) { if (cvs && cvs.parentNode) cvs.parentNode.removeChild(cvs); cvs = null; return false; }
    var host = main.parentElement; if (!host) return false;
    if (!cvs || cvs.parentNode !== host) {
      cvs = document.createElement('canvas'); cvs.id = 'cmd-fx-layer'; cvs.setAttribute('aria-hidden', 'true');
      cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:7;display:block;';
      host.insertBefore(cvs, main.nextSibling); ctx2 = cvs.getContext('2d');
    }
    var r = main.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1), w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
    if (cvs.width !== Math.floor(w * d) || cvs.height !== Math.floor(h * d)) { cvs.width = Math.floor(w * d); cvs.height = Math.floor(h * d); }
    ctx2.setTransform(d, 0, 0, d, 0, 0); W = w; H = h;
    if (!document.getElementById('cmd-fx-mute')) {
      var b = document.createElement('button'); b.id = 'cmd-fx-mute'; b.type = 'button';
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      b.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); unlock(); muted = !muted; try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch (x) { } paintMute(b); if (!muted) play('place'); });
      host.appendChild(b); paintMute(b);
    }
    return true;
  }
  function paintMute(b) { b.textContent = muted ? '🔇' : '🔊'; b.title = muted ? 'Turn battle sounds on' : 'Turn battle sounds off'; b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', muted ? 'true' : 'false'); }

  function spark(x, y, color, n, speed, life, size) {
    for (var i = 0; i < n && parts.length < 420; i++) { var a = Math.random() * TAU, v = speed * (.35 + Math.random() * .85); parts.push({ k: 's', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * .15, life: life * (.6 + Math.random() * .6), max: life, size: size * (.6 + Math.random() * .8), color: color }); }
  }
  function ring(x, y, color, r1, life, w) { if (parts.length < 420) parts.push({ k: 'r', x: x, y: y, life: life, max: life, r1: r1, color: color, w: w || 3 }); }
  function text(x, y, str, color, big) { if (texts.length > 26) texts.shift(); texts.push({ x: x + (Math.random() - .5) * 10, y: y, str: str, color: color || '#fff', life: .75, max: .75, big: big }); }

  function famOfProj(q) { return family(q.attackType || q.type || 'basic'); }
  function projColor(q) { var f = famOfProj(q); return (f === 'fire' || f === 'ice' || f === 'heal' || f === 'coin') ? FAMILY_COLOR[f] : (q.color || FAMILY_COLOR[f]); }

  function observe(g, dt) {
    if (lastGameRef !== g) { // new battle: reset memory without firing effects
      lastGameRef = g; prevEnemies.clear(); liveProj.clear(); parts.length = 0; texts.length = 0; prevBase = null; prevTowers = (g.towers || []).length; prevLevels = sumLevels(g); prevRunning = !!g.running; prevFinished = !!g.finished; enemyMemory.clear();
    }
    var ens = g.enemies || [], projs = g.projectiles || [], towers = g.towers || [];
    var base = Number(g.base); if (!isFinite(base)) base = 0;
    var leaked = prevBase != null && base < prevBase - .0001;

    // --- enemies: damage numbers, hit sparks, kills
    var cur = new Map();
    ens.forEach(function (e) {
      if (!e || e.id == null) return;
      var p = prevEnemies.get(e.id), px = e.x * W, py = e.y * H;
      cur.set(e.id, { hp: e.hp, x: e.x, y: e.y, size: e.size, color: e.color, kind: e.kind });
      if (p && e.hp < p.hp - .01 && e.hp > 0) {
        var dmg = p.hp - e.hp; spark(px, py - (e.size || 18) * .3, '#fff3c4', 5, 90, .32, 2.2);
        if (dmg >= 1) text(px, py - (e.size || 18) - 22, String(Math.round(dmg)), '#ffffff', dmg >= 20);
        play('hit');
      }
    });
    prevEnemies.forEach(function (p, id) {
      if (cur.has(id)) return;
      var px = p.x * W, py = p.y * H, s = p.size || 18;
      if (leaked) { spark(px, py, '#ff6b81', 8, 120, .45, 2.6); }
      else {
        var col = p.color || '#ffd166';
        ring(px, py, lighten(col, .3), s * 1.9, .42, 3); spark(px, py, col, 14, 190, .6, 3); spark(px, py, '#fff6c8', 6, 120, .4, 2);
        for (var i = 0; i < 3; i++) parts.push({ k: 'c', x: px, y: py - s * .4, vx: (Math.random() - .5) * 80, vy: -110 - Math.random() * 60, life: .7, max: .7, size: 4.5, color: '#ffd35a', g: 420 });
        play('kill');
      }
    });
    prevEnemies = cur;

    // --- projectiles: muzzle flash + sound on spawn, impact burst on removal
    var seenNow = new Set();
    projs.forEach(function (q) {
      if (!q) return;
      var id = projIds.get(q); if (!id) { id = ++projSeq; projIds.set(q, id); }
      seenNow.add(id);
      var fam = famOfProj(q), col = projColor(q);
      if (!seenProj.has(q)) {
        seenProj.add(q);
        if (fam === 'heal') play('heal'); else if (fam !== 'coin') play('shot', fam); else play('shot', 'star');
        var mx = q.x * W, my = q.y * H; glowBurst(mx, my, col);
      }
      liveProj.set(id, { x: q.x, y: q.y, col: col, fam: fam });
    });
    liveProj.forEach(function (v, id) {
      if (seenNow.has(id)) return;
      liveProj.delete(id);
      var x = v.x * W, y = v.y * H;
      if (v.fam === 'heal') { spark(x, y, '#68efb0', 6, 60, .5, 2.4); return; }
      ring(x, y, v.col, v.fam === 'blast' ? 34 : 20, .3, 2.5); spark(x, y, v.col, v.fam === 'blast' ? 12 : 6, v.fam === 'blast' ? 170 : 110, .4, 2.6);
    });

    // --- towers: place / upgrade / sell
    var lv = sumLevels(g);
    if (towers.length > prevTowers) { var t = towers[towers.length - 1]; if (t) { ring(t.x * W, t.y * H, '#7cf0b0', 46, .5, 3.5); ring(t.x * W, t.y * H, '#ffffff', 28, .35, 2); spark(t.x * W, t.y * H, '#bff7d8', 12, 120, .55, 2.6); } play('place'); }
    else if (towers.length < prevTowers) play('sell');
    else if (lv > prevLevels) { towers.forEach(function (t2) { if (t2) { ring(t2.x * W, t2.y * H, '#ffd35a', 40, .45, 3); } }); play('upgrade'); }
    prevTowers = towers.length; prevLevels = lv;

    // --- base damage, waves, end of run
    if (leaked) { flash = 1; play('leak'); }
    prevBase = base;
    var running = !!g.running, finished = !!g.finished;
    if (running && !prevRunning) play('waveStart');
    if (!running && prevRunning && !finished && base > 0) play('waveClear');
    if (finished && !prevFinished) play(base > 0 ? 'win' : 'lose');
    prevRunning = running; prevFinished = finished;
  }
  function sumLevels(g) { var s = 0; (g.towers || []).forEach(function (t) { s += Number(t && t.level) || 0; }); return s; }
  function glowBurst(x, y, col) { parts.push({ k: 'g', x: x, y: y, life: .14, max: .14, r1: 16, color: col }); }

  function render(dt) {
    ctx2.clearRect(0, 0, W, H);
    var gm = game(); if (gm && window.__cmdAmbient) { try { window.__cmdAmbient.draw(ctx2, W, H, gm.mapId, dt); } catch (e) { } }
    // particles
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      var f = p.life / p.max;
      if (p.k === 'r') { var r = p.r1 * (1 - f * f); ctx2.strokeStyle = alpha(p.color, f * .85); ctx2.lineWidth = p.w * f + .5; ctx2.beginPath(); ctx2.arc(p.x, p.y, Math.max(1, r), 0, TAU); ctx2.stroke(); }
      else if (p.k === 'g') { ctx2.globalCompositeOperation = 'lighter'; glow(ctx2, p.x, p.y, p.r1 * (1.4 - f * .4), p.color, f * .8); ctx2.globalCompositeOperation = 'source-over'; }
      else { p.vy += (p.g || 260) * dt; p.vx *= (1 - 2.2 * dt); p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.k === 'c') { ctx2.fillStyle = alpha(p.color, Math.min(1, f * 1.6)); ctx2.strokeStyle = alpha('#a9700e', f); ctx2.lineWidth = 1; ctx2.beginPath(); ctx2.ellipse(p.x, p.y, p.size * (Math.abs(Math.cos(p.life * 14)) * .7 + .3), p.size, 0, 0, TAU); ctx2.fill(); ctx2.stroke(); }
        else { ctx2.globalCompositeOperation = 'lighter'; ctx2.fillStyle = alpha(p.color, f); ctx2.beginPath(); ctx2.arc(p.x, p.y, p.size * (.4 + f * .6), 0, TAU); ctx2.fill(); ctx2.globalCompositeOperation = 'source-over'; } }
    }
    // damage numbers
    ctx2.textAlign = 'center'; ctx2.lineJoin = 'round';
    for (var j = texts.length - 1; j >= 0; j--) {
      var q = texts[j]; q.life -= dt; if (q.life <= 0) { texts.splice(j, 1); continue; }
      var a = q.life / q.max, rise = (1 - a) * 26, pop = a > .85 ? 1 + (a - .85) * 4 : 1;
      ctx2.font = '800 ' + Math.round((q.big ? 17 : 13) * pop) + 'px system-ui,-apple-system,Segoe UI,sans-serif';
      ctx2.globalAlpha = Math.min(1, a * 1.8); ctx2.lineWidth = 3.5; ctx2.strokeStyle = 'rgba(8,14,26,.85)'; ctx2.strokeText(q.str, q.x, q.y - rise);
      ctx2.fillStyle = q.big ? '#ffd166' : q.color; ctx2.fillText(q.str, q.x, q.y - rise); ctx2.globalAlpha = 1;
    }
    // base-hit vignette
    if (flash > 0) { flash = Math.max(0, flash - dt * 2.2); ctx2.fillStyle = rad(ctx2, W / 2, H / 2, Math.min(W, H) * .35, Math.max(W, H) * .75, [[0, 'rgba(255,60,90,0)'], [1, 'rgba(255,60,90,' + (flash * .38) + ')']]); ctx2.fillRect(0, 0, W, H); }
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(.05, (ts - lastT) / 1000 || .016); lastT = ts;
    var g = game();
    if (!g || g.active !== 'commander' || !ensureOverlay()) { if (cvs && !document.getElementById('commander-auth-canvas')) { cvs = null; } lastGameRef = null; return; }
    try { observe(g, dt); render(dt); } catch (e) { /* observer must never break the game */ }
    if ((++memTick & 127) === 0) { enemyMemory.forEach(function (m, id) { if (memTick - m.seen > 400) enemyMemory.delete(id); }); }
  }
  raf = requestAnimationFrame(frame);
})();
