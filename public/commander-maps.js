/* ==========================================================================
   Troop Commander — themed map renderer (presentation only)
   --------------------------------------------------------------------------
   Draws each map's terrain from the SAME data the game already uses
   (route, rocks, detail lines), so what you see lines up exactly with what
   blocks placement:
     route  -> the enemy road
     rocks  -> blocking props (trees, mesas, crystals, pillars, furnaces)
     detail -> streams / ravines / crevasses / walls / lava channels
   Nothing here changes game state or rules. Exposes:
     window.__cmdTerrain(map, w, h, dpr)   -> cached terrain canvas
     window.__cmdAmbient.draw(...)          -> animated ambience (used by commander-fx.js)
   v14's draw loop falls back to its original terrain if this file is absent.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__cmdMapsLoaded) return;
  window.__cmdMapsLoaded = true;
  var TAU = Math.PI * 2;

  /* ---- tiny helpers ---------------------------------------------------- */
  function hashStr(s) { var h = 1779033703; s = String(s); for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
  function rngFor(seed) { var a = hashStr(seed); return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function rgb(c) { c = String(c || '#888'); if (c[0] === '#') { if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [parseInt(c.substr(1, 2), 16) || 0, parseInt(c.substr(3, 2), 16) || 0, parseInt(c.substr(5, 2), 16) || 0]; } var m = c.match(/(\d+)[ ,]+(\d+)[ ,]+(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [136, 136, 136]; }
  function mix(a, b, t) { var p = rgb(a), q = rgb(b); return 'rgb(' + Math.round(p[0] + (q[0] - p[0]) * t) + ',' + Math.round(p[1] + (q[1] - p[1]) * t) + ',' + Math.round(p[2] + (q[2] - p[2]) * t) + ')'; }
  function lt(c, t) { return mix(c, '#ffffff', t); }
  function dk(c, t) { return mix(c, '#0a0e18', t); }
  function al(c, a) { var r = rgb(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  function lin(x, x0, y0, x1, y1, stops) { var g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function rad(x, cx, cy, r0, r1, stops) { var g = x.createRadialGradient(cx, cy, r0, cx, cy, r1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function rrect(x, a, b, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(a, b, w, h, r); else x.rect(a, b, w, h); }
  function blob(x, cx, cy, r, color, a) { x.fillStyle = rad(x, cx, cy, 0, r, [[0, al(color, a)], [1, al(color, 0)]]); x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }
  function poly(x, pts) { x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); }

  /* ======================================================================
     TERRAIN
     ====================================================================== */
  var META = {}; // map id -> {glints:[[x,y]...]} in normalised coords, for ambience

  function build(m, w, h, dpr) {
    dpr = dpr || 1;
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.floor(w * dpr)); c.height = Math.max(1, Math.floor(h * dpr));
    var x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    var k = w / 985, R = rngFor('cmd-' + m.id), rnd = function (a, b) { return a + R() * (b - a); };
    var theme = THEMES[m.id] || THEMES.garden;
    var route = (m.route || []).map(function (p) { return [p[0] * w, p[1] * h]; });
    var details = (m.detail || []).map(function (l) { return l.map(function (p) { return [p[0] * w, p[1] * h]; }); });
    var rocks = (m.rocks || []).map(function (o) { return { x: o[0] * w, y: o[1] * h, r: Math.max(10, o[2] * w) }; });

    function segDist(px, py, a, b) { var vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy, t = L ? ((px - a[0]) * vx + (py - a[1]) * vy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (a[0] + vx * t), py - (a[1] + vy * t)); }
    function dLine(px, py, pts) { var d = 1e9; for (var i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, py, pts[i], pts[i + 1])); return d; }
    function free(px, py, m1) { // far from road, detail lines and big props
      m1 = m1 || 0; if (dLine(px, py, route) < 38 * k + m1) return false;
      for (var i = 0; i < details.length; i++) if (dLine(px, py, details[i]) < 20 * k + m1) return false;
      for (var j = 0; j < rocks.length; j++) if (Math.hypot(px - rocks[j].x, py - rocks[j].y) < rocks[j].r * 1.25 + m1) return false;
      return px > 6 && py > 6 && px < w - 6 && py < h - 6;
    }
    function scatter(n, margin, fn) { for (var i = 0, tries = 0; i < n && tries < n * 6; tries++) { var px = rnd(0, w), py = rnd(0, h); if (free(px, py, margin)) { fn(px, py, i); i++; } } }
    function strokeLine(pts, width, style, cap) { x.save(); x.lineCap = cap || 'round'; x.lineJoin = 'round'; x.strokeStyle = style; x.lineWidth = width; poly(x, pts); x.stroke(); x.restore(); }
    var ctxo = { x: x, w: w, h: h, k: k, R: R, rnd: rnd, route: route, details: details, rocks: rocks, free: free, scatter: scatter, strokeLine: strokeLine, m: m, dLine: dLine };

    // 1) ground
    theme.ground(ctxo);
    // 2) detail lines (streams / ravines / walls / lava)
    details.forEach(function (line, i) { theme.detail(ctxo, line, i); });
    // 3) fine ground decor that must sit under the road
    theme.decor(ctxo);
    // 4) road
    drawRoad(ctxo, theme.road);
    // 5) endpoints
    var st = route[0], en = route[route.length - 1];
    if (st) drawPortal(ctxo, st[0], st[1], theme.accent || m.accent || '#7cf0b0');
    if (en) drawBase(ctxo, en[0], en[1], theme.accent || m.accent || '#ff8fa0');
    // 6) blocking props (sorted so lower ones overlap higher ones)
    rocks.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (o, i) { theme.prop(ctxo, o, rocks.indexOf(o)); });
    // 7) light + vignette
    var g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, 'rgba(255,248,220,.10)'); g.addColorStop(.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(8,16,40,.16)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = rad(x, w / 2, h / 2, Math.min(w, h) * .42, Math.max(w, h) * .78, [[0, 'rgba(0,0,0,0)'], [1, theme.vignette || 'rgba(6,14,30,.34)']]); x.fillRect(0, 0, w, h);
    // glints for ambience (normalised)
    META[m.id] = { glints: [] };
    details.forEach(function (l) { for (var i = 0; i < l.length - 1; i++) { var n = Math.max(1, Math.round(Math.hypot(l[i + 1][0] - l[i][0], l[i + 1][1] - l[i][1]) / (70 * k))); for (var j = 0; j < n; j++) { var t = (j + .5) / n; META[m.id].glints.push([(l[i][0] + (l[i + 1][0] - l[i][0]) * t) / w, (l[i][1] + (l[i + 1][1] - l[i][1]) * t) / h]); } } });
    return c;
  }

  /* ---- road ------------------------------------------------------------ */
  function drawRoad(o, s) {
    var x = o.x, k = o.k, pts = o.route; if (pts.length < 2) return;
    o.strokeLine(pts.map(function (p) { return [p[0], p[1] + 3 * k]; }), 70 * k, 'rgba(0,0,0,.2)');
    o.strokeLine(pts, 62 * k, s.edge);
    o.strokeLine(pts, 54 * k, s.rim);
    o.strokeLine(pts, 47 * k, s.base);
    o.strokeLine(pts, 30 * k, al(s.center, .42));
    // wheel ruts
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      [-9, 9].forEach(function (off) { x.save(); x.strokeStyle = s.rut; x.lineWidth = 3 * k; x.lineCap = 'round'; x.beginPath(); x.moveTo(a[0] + nx * off * k, a[1] + ny * off * k); x.lineTo(b[0] + nx * off * k, b[1] + ny * off * k); x.stroke(); x.restore(); });
      // texture: pebbles / flecks along this segment
      var n = Math.round(L / (5 * k));
      for (var j = 0; j < n; j++) {
        var t = o.R(), lat = (o.R() - .5) * 40 * k, px = a[0] + dx * t + nx * lat, py = a[1] + dy * t + ny * lat, r = (.8 + o.R() * 2.1) * k;
        x.fillStyle = o.R() > .5 ? al(s.fleckA, .35 + o.R() * .3) : al(s.fleckB, .3 + o.R() * .3);
        x.beginPath(); x.ellipse(px, py, r * 1.3, r, o.R() * 3, 0, TAU); x.fill();
      }
      // faint direction chevrons
      var step = 130 * k, cn = Math.floor(L / step);
      for (var q = 0; q < cn; q++) { var tt = (q + .5) / cn, cx = a[0] + dx * tt, cy = a[1] + dy * tt, ang = Math.atan2(dy, dx); x.save(); x.translate(cx, cy); x.rotate(ang); x.strokeStyle = al(s.chev, .22); x.lineWidth = 2.4 * k; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(-5 * k, -6 * k); x.lineTo(3 * k, 0); x.lineTo(-5 * k, 6 * k); x.stroke(); x.restore(); }
    }
    // soft edge highlight so the road reads as raised
    o.strokeLine(pts.map(function (p) { return [p[0], p[1] - 1.5 * k]; }), 47 * k, 'rgba(255,255,255,.0)');
  }

  /* ---- spawn portal + base gate --------------------------------------- */
  function drawPortal(o, cx, cy, accent) {
    var x = o.x, k = o.k;
    x.save(); x.translate(Math.max(cx + 4 * k, 36 * k), cy);
    blob(x, 0, 0, 52 * k, accent, .45);
    x.fillStyle = 'rgba(6,12,24,.35)'; x.beginPath(); x.ellipse(0, 20 * k, 30 * k, 9 * k, 0, 0, TAU); x.fill();
    x.fillStyle = lin(x, 0, -30 * k, 0, 30 * k, [[0, dk(accent, .55)], [1, dk(accent, .8)]]); x.beginPath(); x.ellipse(0, 0, 26 * k, 31 * k, 0, 0, TAU); x.fill();
    x.fillStyle = rad(x, 0, 0, 1, 24 * k, [[0, '#ffffff'], [.35, lt(accent, .35)], [1, al(accent, .25)]]); x.beginPath(); x.ellipse(0, 0, 20 * k, 25 * k, 0, 0, TAU); x.fill();
    x.strokeStyle = lt(accent, .55); x.lineWidth = 3 * k; x.beginPath(); x.ellipse(0, 0, 25 * k, 30 * k, 0, 0, TAU); x.stroke();
    x.strokeStyle = al('#ffffff', .75); x.lineWidth = 1.6 * k; for (var i = 0; i < 3; i++) { x.beginPath(); x.ellipse(0, 0, (6 + i * 5) * k, (9 + i * 6) * k, i * .6, i, i + 3.4); x.stroke(); }
    for (var r = 0; r < 8; r++) { var a = r * TAU / 8; x.fillStyle = lt(accent, .6); x.beginPath(); x.arc(Math.cos(a) * 30 * k, Math.sin(a) * 36 * k, 2.2 * k, 0, TAU); x.fill(); }
    x.restore();
  }
  function drawBase(o, cx, cy, accent) {
    var x = o.x, k = o.k;
    x.save(); x.translate(Math.min(cx - 6 * k, o.w - 46 * k), cy);
    x.fillStyle = 'rgba(6,12,24,.32)'; x.beginPath(); x.ellipse(2 * k, 30 * k, 40 * k, 10 * k, 0, 0, TAU); x.fill();
    blob(x, 0, 0, 62 * k, '#ff6b81', .22);
    // towers
    [-28, 28].forEach(function (dx) {
      x.fillStyle = lin(x, dx * k - 11 * k, 0, dx * k + 11 * k, 0, [[0, '#cfd6e6'], [1, '#8d97ae']]); x.strokeStyle = '#4b556e'; x.lineWidth = 1.6 * k; rrect(x, dx * k - 11 * k, -30 * k, 22 * k, 56 * k, 3 * k); x.fill(); x.stroke();
      x.fillStyle = '#aab3c9'; for (var i = 0; i < 3; i++) { x.fillRect(dx * k - 11 * k + i * 8 * k, -36 * k, 6 * k, 8 * k); }
      x.fillStyle = '#26324a'; rrect(x, dx * k - 3 * k, -14 * k, 6 * k, 12 * k, 3 * k); x.fill();
    });
    // keep
    x.fillStyle = lin(x, 0, -24 * k, 0, 26 * k, [[0, '#e3e8f3'], [1, '#9aa4bb']]); x.strokeStyle = '#4b556e'; x.lineWidth = 1.8 * k; rrect(x, -20 * k, -22 * k, 40 * k, 48 * k, 4 * k); x.fill(); x.stroke();
    x.fillStyle = '#26324a'; x.beginPath(); x.moveTo(-9 * k, 26 * k); x.lineTo(-9 * k, 6 * k); x.arc(0, 6 * k, 9 * k, Math.PI, 0); x.lineTo(9 * k, 26 * k); x.closePath(); x.fill();
    x.fillStyle = '#ffd58a'; x.beginPath(); x.arc(0, 8 * k, 4 * k, 0, TAU); x.fill();
    // banner
    x.fillStyle = '#e04462'; x.beginPath(); x.moveTo(-3 * k, -48 * k); x.lineTo(20 * k, -42 * k); x.lineTo(-3 * k, -36 * k); x.closePath(); x.fill(); x.strokeStyle = '#4b556e'; x.lineWidth = 2 * k; x.beginPath(); x.moveTo(-3 * k, -26 * k); x.lineTo(-3 * k, -50 * k); x.stroke();
    // label
    x.fillStyle = 'rgba(8,14,28,.82)'; rrect(x, -20 * k, 33 * k, 40 * k, 13 * k, 6 * k); x.fill(); x.fillStyle = '#ffd0d8'; x.font = '800 ' + Math.max(8, 9 * k) + 'px system-ui,sans-serif'; x.textAlign = 'center'; x.fillText('BASE', 0, 43 * k);
    x.restore();
  }

  /* ---- generic prop helpers ------------------------------------------- */
  function shadow(o, cx, cy, rx, ry) { var x = o.x; x.fillStyle = 'rgba(8,16,24,.26)'; x.beginPath(); x.ellipse(cx + rx * .12, cy + ry * .35, rx, ry, 0, 0, TAU); x.fill(); }
  function leaf(x, cx, cy, r, c0, c1) { x.fillStyle = lin(x, cx - r, cy - r, cx + r, cy + r, [[0, c0], [1, c1]]); x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }

  /* ======================================================================
     THEMES
     ====================================================================== */
  var THEMES = {};

  /* ---- GARDEN ---------------------------------------------------------- */
  THEMES.garden = {
    accent: '#8af5c0', vignette: 'rgba(10,36,30,.34)',
    road: { edge: '#6f5a3c', rim: '#c9ad7d', base: '#b99a6b', center: '#d9c196', rut: 'rgba(110,80,46,.28)', fleckA: '#e8d5ac', fleckB: '#7d6540', chev: '#fff6dc' },
    ground: function (o) {
      var x = o.x, w = o.w, h = o.h, k = o.k;
      x.fillStyle = lin(x, 0, 0, w, h, [[0, '#7bbd6f'], [.5, '#66a95d'], [1, '#549650']]); x.fillRect(0, 0, w, h);
      for (var i = 0; i < 260; i++) blob(x, o.rnd(0, w), o.rnd(0, h), o.rnd(30, 95) * k, o.R() > .5 ? '#a4dc82' : '#3f8645', o.rnd(.08, .17));
      x.save(); x.globalAlpha = .05; x.fillStyle = '#fff'; for (var s = -h; s < w; s += 46 * k) { x.beginPath(); x.moveTo(s, 0); x.lineTo(s + 22 * k, 0); x.lineTo(s + 22 * k + h, h); x.lineTo(s + h, h); x.closePath(); x.fill(); } x.restore();
    },
    detail: function (o, line) { // stream
      var k = o.k, x = o.x;
      o.strokeLine(line, 34 * k, 'rgba(40,78,52,.55)'); o.strokeLine(line, 28 * k, '#7a6a4c');
      o.strokeLine(line, 23 * k, '#3f9fc6'); o.strokeLine(line, 15 * k, '#62c6e6'); o.strokeLine(line, 6 * k, 'rgba(210,246,255,.55)');
      x.save(); x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.6 * k; x.setLineDash([10 * k, 22 * k]); x.lineCap = 'round'; poly(x, line); x.stroke(); x.restore();
      for (var i = 0; i < line.length - 1; i++) { var n = Math.round(Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]) / (60 * k)); for (var j = 0; j < n; j++) { var t = (j + .5) / n, px = line[i][0] + (line[i + 1][0] - line[i][0]) * t, py = line[i][1] + (line[i + 1][1] - line[i][1]) * t + (o.R() - .5) * 8 * k; leaf(x, px, py, 4.5 * k, '#8fdc7a', '#3f9a52'); x.fillStyle = '#ffd6e6'; x.beginPath(); x.arc(px + 1 * k, py - 1 * k, 1.4 * k, 0, TAU); x.fill(); } }
    },
    decor: function (o) {
      var x = o.x, k = o.k;
      o.scatter(1100, 4 * k, function (px, py) { x.strokeStyle = o.R() > .5 ? 'rgba(32,96,52,.55)' : 'rgba(176,230,128,.45)'; x.lineWidth = 1.2 * k; x.lineCap = 'round'; var hh = (3 + o.R() * 5) * k; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 1.5 * k, py - hh * .6, px + (o.R() - .5) * 4 * k, py - hh); x.moveTo(px + 2 * k, py); x.lineTo(px + 3.5 * k, py - hh * .7); x.stroke(); });
      var cols = ['#ffffff', '#fff2a8', '#ffb3d1', '#c9b6ff'];
      o.scatter(70, 6 * k, function (px, py) { var cx = px, cy = py, c = cols[Math.floor(o.R() * cols.length)]; for (var i = 0; i < 4; i++) { var fx = cx + (o.R() - .5) * 14 * k, fy = cy + (o.R() - .5) * 10 * k; x.fillStyle = c; x.beginPath(); x.arc(fx, fy, 2.1 * k, 0, TAU); x.fill(); x.fillStyle = '#f4c542'; x.beginPath(); x.arc(fx, fy, .8 * k, 0, TAU); x.fill(); } });
    },
    prop: function (o, r, i) {
      var x = o.x, k = o.k, t = i % 4;
      if (t === 1) { // bush with berries
        shadow(o, r.x, r.y + r.r * .5, r.r * 1.05, r.r * .42);
        [[-.45, .05, .6], [.4, .02, .62], [0, -.25, .72], [-.1, .2, .55]].forEach(function (b, n) { leaf(x, r.x + b[0] * r.r, r.y + b[1] * r.r, b[2] * r.r, n % 2 ? '#74c76a' : '#8fd97a', '#2f7d45'); });
        for (var q = 0; q < 7; q++) { x.fillStyle = '#e8486a'; x.beginPath(); x.arc(r.x + (o.R() - .5) * r.r * 1.3, r.y + (o.R() - .5) * r.r * .9, 2.2 * k, 0, TAU); x.fill(); }
      } else if (t === 3) { // mossy boulder
        shadow(o, r.x, r.y + r.r * .55, r.r * 1.1, r.r * .4);
        x.fillStyle = lin(x, r.x - r.r, r.y - r.r, r.x + r.r, r.y + r.r, [[0, '#b7c0c4'], [1, '#6c777e']]); x.strokeStyle = '#46515a'; x.lineWidth = 1.6 * k; x.beginPath(); x.moveTo(r.x - r.r, r.y + r.r * .35); x.quadraticCurveTo(r.x - r.r * .9, r.y - r.r * .8, r.x - r.r * .1, r.y - r.r * .85); x.quadraticCurveTo(r.x + r.r, r.y - r.r * .8, r.x + r.r * .95, r.y + r.r * .3); x.quadraticCurveTo(r.x, r.y + r.r * .75, r.x - r.r, r.y + r.r * .35); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = '#6dbf5e'; x.beginPath(); x.ellipse(r.x - r.r * .1, r.y - r.r * .6, r.r * .75, r.r * .28, -.1, 0, TAU); x.fill();
      } else { // tree
        var s = r.r * 1.15; shadow(o, r.x, r.y + s * .78, s * 1.0, s * .36);
        x.fillStyle = lin(x, r.x - 5 * k, 0, r.x + 5 * k, 0, [[0, '#8a5a35'], [1, '#5a371f']]); rrect(x, r.x - 5 * k, r.y + s * .1, 10 * k, s * .8, 3 * k); x.fill();
        [[0, .05, 1], [-.55, .0, .62], [.55, .02, .62], [0, -.5, .72], [-.3, -.3, .5], [.32, -.32, .5]].forEach(function (b, n) { leaf(x, r.x + b[0] * s, r.y + b[1] * s - s * .1, b[2] * s * .78, n < 3 ? '#4f9f4f' : '#8bd86f', n < 3 ? '#27663a' : '#3f9a4d'); });
        x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.ellipse(r.x - s * .28, r.y - s * .55, s * .26, s * .12, -.5, 0, TAU); x.fill();
      }
    }
  };

  /* ---- CANYON ---------------------------------------------------------- */
  THEMES.canyon = {
    accent: '#9fe8ff', vignette: 'rgba(60,24,6,.36)',
    road: { edge: '#6a4a30', rim: '#9a7650', base: '#8a6644', center: '#b58d63', rut: 'rgba(60,36,20,.3)', fleckA: '#c9a47a', fleckB: '#5a3f28', chev: '#ffe9c4' },
    ground: function (o) {
      var x = o.x, w = o.w, h = o.h, k = o.k;
      x.fillStyle = lin(x, 0, 0, 0, h, [[0, '#e2a550'], [.55, '#d18a37'], [1, '#b9722a']]); x.fillRect(0, 0, w, h);
      for (var i = 0; i < 200; i++) blob(x, o.rnd(0, w), o.rnd(0, h), o.rnd(30, 100) * k, o.R() > .5 ? '#f3c27a' : '#9a5a22', o.rnd(.08, .18));
      x.save(); for (var d = 0; d < 26; d++) { var cx = o.rnd(0, w), cy = o.rnd(0, h), rr = o.rnd(50, 140) * k; x.strokeStyle = 'rgba(255,230,170,.16)'; x.lineWidth = 2 * k; x.beginPath(); x.arc(cx, cy, rr, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); x.strokeStyle = 'rgba(120,64,20,.12)'; x.beginPath(); x.arc(cx, cy + 4 * k, rr, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); } x.restore();
    },
    detail: function (o, line) { // ravine
      var k = o.k, x = o.x;
      o.strokeLine(line, 36 * k, 'rgba(255,225,165,.55)'); o.strokeLine(line, 30 * k, '#7b4a28'); o.strokeLine(line, 24 * k, '#4d2c18'); o.strokeLine(line, 12 * k, '#2a170d');
      x.save(); x.strokeStyle = 'rgba(255,236,190,.5)'; x.lineWidth = 1.8 * k; x.lineCap = 'round'; x.setLineDash([2 * k, 7 * k]); poly(x, line); x.stroke(); x.restore();
    },
    decor: function (o) {
      var x = o.x, k = o.k;
      o.scatter(520, 3 * k, function (px, py) { var r = (1 + o.R() * 2.5) * k; x.fillStyle = o.R() > .5 ? 'rgba(255,226,170,.5)' : 'rgba(110,62,28,.45)'; x.beginPath(); x.ellipse(px, py, r * 1.4, r, o.R() * 3, 0, TAU); x.fill(); });
      o.scatter(36, 8 * k, function (px, py) { x.strokeStyle = 'rgba(96,52,20,.42)'; x.lineWidth = 1.5 * k; x.lineJoin = 'round'; x.beginPath(); x.moveTo(px, py); var cx = px, cy = py; for (var i = 0; i < 4; i++) { cx += (o.R() - .3) * 14 * k; cy += (o.R() - .5) * 10 * k; x.lineTo(cx, cy); } x.stroke(); });
      o.scatter(26, 6 * k, function (px, py) { x.strokeStyle = 'rgba(150,130,60,.7)'; x.lineWidth = 1.2 * k; for (var i = 0; i < 5; i++) { x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + (i - 2) * 3 * k, py - 5 * k, px + (i - 2) * 5 * k, py - 9 * k); x.stroke(); } });
    },
    prop: function (o, r, i) {
      var x = o.x, k = o.k;
      if (i % 3 === 1) { // cactus
        var s = r.r; shadow(o, r.x, r.y + s * .8, s * .8, s * .3);
        function limb(a, b, c2, d, wd) { x.strokeStyle = '#2f7a42'; x.lineWidth = wd; x.lineCap = 'round'; x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke(); x.strokeStyle = '#6cc26a'; x.lineWidth = wd * .35; x.beginPath(); x.moveTo(a - wd * .18, b); x.lineTo(c2 - wd * .18, d); x.stroke(); }
        limb(r.x, r.y + s * .8, r.x, r.y - s * .8, 13 * k); limb(r.x, r.y + s * .15, r.x - s * .6, r.y + s * .15, 9 * k); limb(r.x - s * .6, r.y + s * .15, r.x - s * .6, r.y - s * .35, 9 * k); limb(r.x, r.y - s * .05, r.x + s * .55, r.y - s * .05, 9 * k); limb(r.x + s * .55, r.y - s * .05, r.x + s * .55, r.y - s * .55, 9 * k);
        x.fillStyle = '#ff8fb3'; x.beginPath(); x.arc(r.x, r.y - s * .82, 3 * k, 0, TAU); x.fill();
      } else { // sandstone mesa
        var s2 = r.r * 1.1; shadow(o, r.x, r.y + s2 * .7, s2 * 1.15, s2 * .4);
        var bands = ['#e0a56a', '#c98250', '#b5693f', '#9c5634'];
        for (var b = 0; b < 4; b++) { var yy = r.y + s2 * .5 - b * s2 * .36, ww = s2 * (1.0 - b * .12); x.fillStyle = lin(x, r.x - ww, 0, r.x + ww, 0, [[0, lt(bands[b], .12)], [1, dk(bands[b], .18)]]); rrect(x, r.x - ww, yy - s2 * .36, ww * 2, s2 * .38, 5 * k); x.fill(); x.strokeStyle = 'rgba(70,32,14,.35)'; x.lineWidth = 1.2 * k; x.stroke(); }
        x.fillStyle = 'rgba(255,240,200,.35)'; x.beginPath(); x.ellipse(r.x - s2 * .3, r.y - s2 * .85, s2 * .3, s2 * .09, 0, 0, TAU); x.fill();
      }
    }
  };

  /* ---- GLACIER --------------------------------------------------------- */
  THEMES.glacier = {
    accent: '#bdf3ff', vignette: 'rgba(8,30,58,.34)',
    road: { edge: '#53606c', rim: '#8c9aa6', base: '#7c8a97', center: '#b1c0cc', rut: 'rgba(40,54,68,.3)', fleckA: '#d8e6ef', fleckB: '#4a5864', chev: '#eaf7ff' },
    ground: function (o) {
      var x = o.x, w = o.w, h = o.h, k = o.k;
      x.fillStyle = lin(x, 0, 0, w, h, [[0, '#b6e2ef'], [.5, '#9ad0e2'], [1, '#7fbbd6']]); x.fillRect(0, 0, w, h);
      for (var i = 0; i < 220; i++) blob(x, o.rnd(0, w), o.rnd(0, h), o.rnd(30, 110) * k, o.R() > .45 ? '#ffffff' : '#5aa1c8', o.rnd(.1, .22));
      for (var c = 0; c < 22; c++) { var cx = o.rnd(0, w), cy = o.rnd(0, h); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.4 * k; x.lineJoin = 'round'; x.beginPath(); x.moveTo(cx, cy); for (var j = 0; j < 6; j++) { cx += (o.R() - .5) * 40 * k; cy += (o.R() - .5) * 28 * k; x.lineTo(cx, cy); } x.stroke(); x.strokeStyle = 'rgba(40,100,150,.16)'; x.translate(0, 2 * k); x.stroke(); x.translate(0, -2 * k); }
    },
    detail: function (o, line) { // crevasse
      var k = o.k, x = o.x;
      o.strokeLine(line, 36 * k, 'rgba(255,255,255,.6)'); o.strokeLine(line, 30 * k, '#cfeaf6'); o.strokeLine(line, 24 * k, '#2d6fa8'); o.strokeLine(line, 14 * k, '#123a73'); o.strokeLine(line, 5 * k, '#0a1f48');
      x.save(); x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.5 * k; x.setLineDash([4 * k, 12 * k]); x.lineCap = 'round'; poly(x, line.map(function (p) { return [p[0], p[1] - 11 * k]; })); x.stroke(); x.restore();
    },
    decor: function (o) {
      var x = o.x, k = o.k;
      o.scatter(380, 3 * k, function (px, py) { var r = (1 + o.R() * 1.8) * k; x.fillStyle = 'rgba(255,255,255,' + (.35 + o.R() * .4) + ')'; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill(); });
      o.scatter(60, 6 * k, function (px, py) { x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 1.2 * k; var s = (2.5 + o.R() * 3) * k; x.beginPath(); x.moveTo(px - s, py); x.lineTo(px + s, py); x.moveTo(px, py - s); x.lineTo(px, py + s); x.stroke(); });
      o.scatter(24, 10 * k, function (px, py) { x.fillStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.ellipse(px, py, 14 * k, 5 * k, 0, 0, TAU); x.fill(); x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(px + 4 * k, py - 3 * k, 8 * k, 3 * k, 0, 0, TAU); x.fill(); });
    },
    prop: function (o, r, i) {
      var x = o.x, k = o.k, t = i % 3;
      if (t === 1) { // snowy pine
        var s = r.r * 1.2; shadow(o, r.x, r.y + s * .8, s * .9, s * .32);
        x.fillStyle = '#6b4a30'; x.fillRect(r.x - 3 * k, r.y + s * .5, 6 * k, s * .4);
        for (var l = 0; l < 3; l++) { var ly = r.y + s * .5 - l * s * .5, lw = s * (.95 - l * .22); x.fillStyle = lin(x, 0, ly - s * .5, 0, ly, [[0, '#4a9a6a'], [1, '#1f5e49']]); x.beginPath(); x.moveTo(r.x, ly - s * .62); x.lineTo(r.x + lw, ly); x.lineTo(r.x - lw, ly); x.closePath(); x.fill(); x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath(); x.moveTo(r.x, ly - s * .62); x.lineTo(r.x + lw * .62, ly - s * .22); x.quadraticCurveTo(r.x, ly - s * .3, r.x - lw * .62, ly - s * .22); x.closePath(); x.fill(); }
      } else if (t === 2) { // snowy boulder
        shadow(o, r.x, r.y + r.r * .55, r.r * 1.1, r.r * .4);
        x.fillStyle = lin(x, r.x - r.r, r.y - r.r, r.x + r.r, r.y + r.r, [[0, '#9fb0bd'], [1, '#56677a']]); x.strokeStyle = '#3b4a5c'; x.lineWidth = 1.6 * k; x.beginPath(); x.moveTo(r.x - r.r, r.y + r.r * .35); x.quadraticCurveTo(r.x - r.r * .9, r.y - r.r * .8, r.x - r.r * .1, r.y - r.r * .85); x.quadraticCurveTo(r.x + r.r, r.y - r.r * .8, r.x + r.r * .95, r.y + r.r * .3); x.quadraticCurveTo(r.x, r.y + r.r * .75, r.x - r.r, r.y + r.r * .35); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(r.x - r.r * .05, r.y - r.r * .58, r.r * .8, r.r * .3, -.1, 0, TAU); x.fill();
      } else { // crystal cluster
        var s2 = r.r * 1.15; shadow(o, r.x, r.y + s2 * .62, s2 * .95, s2 * .3); blob(x, r.x, r.y, s2 * 1.3, '#9fe8ff', .3);
        [[-.5, .2, .42, .95], [.5, .25, .4, .85], [0, 0, .55, 1.25], [-.2, .35, .3, .7], [.25, .4, .28, .6]].forEach(function (c, n) {
          var bx = r.x + c[0] * s2, by = r.y + c[1] * s2 + s2 * .3, bw = c[2] * s2 * .55, bh = c[3] * s2;
          x.fillStyle = lin(x, bx - bw, by - bh, bx + bw, by, [[0, '#f2fcff'], [.5, '#8fdcf5'], [1, '#3f93d0']]); x.strokeStyle = 'rgba(30,90,150,.6)'; x.lineWidth = 1.4 * k;
          x.beginPath(); x.moveTo(bx, by - bh); x.lineTo(bx + bw, by - bh * .72); x.lineTo(bx + bw * .9, by); x.lineTo(bx - bw * .9, by); x.lineTo(bx - bw, by - bh * .72); x.closePath(); x.fill(); x.stroke();
          x.strokeStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.moveTo(bx - bw * .2, by - bh * .9); x.lineTo(bx - bw * .45, by - bh * .2); x.stroke();
        });
      }
    }
  };

  /* ---- SANCTUARY ------------------------------------------------------- */
  THEMES.sanctuary = {
    accent: '#a4f5ae', vignette: 'rgba(6,24,18,.4)',
    road: { edge: '#33363c', rim: '#585c63', base: '#6e727a', center: '#8d9199', rut: 'rgba(30,32,38,.32)', fleckA: '#a9adb4', fleckB: '#40444b', chev: '#dfe6ee' },
    ground: function (o) {
      var x = o.x, w = o.w, h = o.h, k = o.k;
      x.fillStyle = lin(x, 0, 0, w, h, [[0, '#6f9b6e'], [.5, '#5b8761'], [1, '#476f52']]); x.fillRect(0, 0, w, h);
      var T = 64 * k; for (var gy = 0; gy < h; gy += T) for (var gx = 0; gx < w; gx += T) { var sh = o.R(); x.fillStyle = sh > .5 ? 'rgba(255,255,255,' + (.02 + sh * .05) + ')' : 'rgba(0,0,0,' + (.02 + (1 - sh) * .06) + ')'; x.fillRect(gx + 1, gy + 1, T - 2, T - 2); x.strokeStyle = 'rgba(20,40,28,.22)'; x.lineWidth = 1.2 * k; x.strokeRect(gx + .5, gy + .5, T, T); }
      for (var i = 0; i < 200; i++) blob(x, o.rnd(0, w), o.rnd(0, h), o.rnd(24, 80) * k, o.R() > .4 ? '#7fcf72' : '#26502f', o.rnd(.1, .22));
    },
    detail: function (o, line) { // low ruined wall
      var k = o.k, x = o.x;
      o.strokeLine(line.map(function (p) { return [p[0] + 2 * k, p[1] + 5 * k]; }), 24 * k, 'rgba(8,20,16,.3)');
      o.strokeLine(line, 22 * k, '#4e5259'); o.strokeLine(line, 18 * k, '#80858d'); o.strokeLine(line, 9 * k, '#a5aab2');
      for (var i = 0; i < line.length - 1; i++) { var a = line[i], b = line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / (15 * k)), ang = Math.atan2(b[1] - a[1], b[0] - a[0]); for (var j = 0; j < n; j++) { var t = (j + .5) / n, px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t; x.save(); x.translate(px, py); x.rotate(ang); x.strokeStyle = 'rgba(40,44,52,.55)'; x.lineWidth = 1.2 * k; x.strokeRect(-6.5 * k, -9 * k, 13 * k, 18 * k); x.strokeStyle = 'rgba(255,255,255,.22)'; x.beginPath(); x.moveTo(-6 * k, -8 * k); x.lineTo(6 * k, -8 * k); x.stroke(); if (o.R() > .7) { x.fillStyle = 'rgba(110,200,100,.75)'; x.beginPath(); x.ellipse((o.R() - .5) * 8 * k, -8 * k, 5 * k, 2.4 * k, 0, 0, TAU); x.fill(); } x.restore(); } }
    },
    decor: function (o) {
      var x = o.x, k = o.k;
      o.scatter(700, 3 * k, function (px, py) { x.strokeStyle = o.R() > .5 ? 'rgba(30,90,50,.5)' : 'rgba(160,230,140,.4)'; x.lineWidth = 1.1 * k; x.lineCap = 'round'; var hh = (3 + o.R() * 4) * k; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 2 * k, py - hh * .6, px + (o.R() - .5) * 4 * k, py - hh); x.stroke(); });
      o.scatter(34, 8 * k, function (px, py) { x.strokeStyle = 'rgba(20,34,28,.45)'; x.lineWidth = 1.4 * k; x.lineJoin = 'round'; x.beginPath(); x.moveTo(px, py); var cx = px, cy = py; for (var i = 0; i < 4; i++) { cx += (o.R() - .4) * 14 * k; cy += (o.R() - .5) * 12 * k; x.lineTo(cx, cy); } x.stroke(); });
      o.scatter(40, 6 * k, function (px, py) { x.fillStyle = o.R() > .5 ? '#c5f4b8' : '#9ee8ff'; x.shadowColor = x.fillStyle; x.shadowBlur = 6 * k; x.beginPath(); x.arc(px, py, 1.7 * k, 0, TAU); x.fill(); x.shadowBlur = 0; });
    },
    prop: function (o, r, i) {
      var x = o.x, k = o.k, t = i % 3;
      if (t === 1) { // rubble + overgrown stump with mushrooms
        shadow(o, r.x, r.y + r.r * .55, r.r * 1.1, r.r * .38);
        [[-.45, .15, .45], [.4, .2, .4], [0, -.15, .55], [-.1, .35, .32]].forEach(function (b, n) { x.fillStyle = lin(x, 0, r.y - r.r, 0, r.y + r.r, [[0, n % 2 ? '#b4b8c0' : '#9ea3ab'], [1, '#5d626b']]); x.strokeStyle = '#3d4249'; x.lineWidth = 1.4 * k; x.beginPath(); x.moveTo(r.x + (b[0] - b[2]) * r.r, r.y + (b[1] + b[2] * .6) * r.r); x.lineTo(r.x + (b[0] - b[2] * .7) * r.r, r.y + (b[1] - b[2]) * r.r); x.lineTo(r.x + (b[0] + b[2] * .8) * r.r, r.y + (b[1] - b[2] * .8) * r.r); x.lineTo(r.x + (b[0] + b[2]) * r.r, r.y + (b[1] + b[2] * .6) * r.r); x.closePath(); x.fill(); x.stroke(); });
        x.fillStyle = '#6fc45f'; x.beginPath(); x.ellipse(r.x, r.y - r.r * .3, r.r * .6, r.r * .18, 0, 0, TAU); x.fill();
      } else if (t === 2) { // brazier with green flame
        shadow(o, r.x, r.y + r.r * .6, r.r * .85, r.r * .3); blob(x, r.x, r.y - r.r * .3, r.r * 1.5, '#8cffb0', .3);
        x.fillStyle = lin(x, r.x - r.r * .5, 0, r.x + r.r * .5, 0, [[0, '#c6cad2'], [1, '#6a6f78']]); x.strokeStyle = '#3d4249'; x.lineWidth = 1.5 * k; rrect(x, r.x - r.r * .22, r.y, r.r * .44, r.r * .7, 3 * k); x.fill(); x.stroke(); rrect(x, r.x - r.r * .55, r.y - r.r * .25, r.r * 1.1, r.r * .3, 5 * k); x.fill(); x.stroke();
        x.fillStyle = lin(x, 0, r.y - r.r * .9, 0, r.y - r.r * .2, [[0, '#eafff0'], [.5, '#7dff9f'], [1, '#27b861']]); x.beginPath(); x.moveTo(r.x, r.y - r.r * .95); x.quadraticCurveTo(r.x + r.r * .5, r.y - r.r * .5, r.x + r.r * .3, r.y - r.r * .25); x.lineTo(r.x - r.r * .3, r.y - r.r * .25); x.quadraticCurveTo(r.x - r.r * .5, r.y - r.r * .5, r.x, r.y - r.r * .95); x.fill();
      } else { // broken pillar
        var s = r.r; shadow(o, r.x, r.y + s * .75, s * .95, s * .34);
        x.fillStyle = lin(x, r.x - s * .7, 0, r.x + s * .7, 0, [[0, '#d7dbe3'], [1, '#8a909b']]); x.strokeStyle = '#4b5059'; x.lineWidth = 1.6 * k;
        rrect(x, r.x - s * .72, r.y + s * .5, s * 1.44, s * .32, 3 * k); x.fill(); x.stroke();
        for (var d = 0; d < 3; d++) { rrect(x, r.x - s * .5, r.y + s * .5 - (d + 1) * s * .42, s, s * .4, 2 * k); x.fill(); x.stroke(); }
        x.fillStyle = '#8a909b'; x.beginPath(); x.moveTo(r.x - s * .5, r.y - s * .76); x.lineTo(r.x - s * .15, r.y - s * 1.02); x.lineTo(r.x + s * .1, r.y - s * .78); x.lineTo(r.x + s * .5, r.y - s * .9); x.lineTo(r.x + s * .5, r.y - s * .72); x.closePath(); x.fill(); x.stroke();
        x.strokeStyle = 'rgba(40,44,52,.6)'; x.beginPath(); x.moveTo(r.x - s * .1, r.y - s * .7); x.lineTo(r.x + s * .05, r.y - s * .2); x.lineTo(r.x - s * .08, r.y + s * .2); x.stroke();
        x.fillStyle = '#6fc45f'; x.beginPath(); x.ellipse(r.x - s * .3, r.y + s * .5, s * .35, s * .1, 0, 0, TAU); x.fill();
      }
    }
  };

  /* ---- FOUNDRY --------------------------------------------------------- */
  THEMES.foundry = {
    accent: '#ffb061', vignette: 'rgba(10,4,6,.5)',
    road: { edge: '#1b1a20', rim: '#3a3944', base: '#4b4a56', center: '#6a6978', rut: 'rgba(18,16,22,.4)', fleckA: '#8a8997', fleckB: '#25242c', chev: '#ffb061' },
    ground: function (o) {
      var x = o.x, w = o.w, h = o.h, k = o.k;
      x.fillStyle = lin(x, 0, 0, 0, h, [[0, '#4b3f48'], [1, '#2f272f']]); x.fillRect(0, 0, w, h);
      var T = 56 * k; for (var gy = 0; gy < h; gy += T) for (var gx = 0; gx < w; gx += T) { var sh = o.R(); x.fillStyle = 'rgba(255,255,255,' + (.015 + sh * .05) + ')'; x.fillRect(gx + 1, gy + 1, T - 2, T - 2); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1.4 * k; x.strokeRect(gx + .5, gy + .5, T, T); x.fillStyle = 'rgba(160,150,170,.45)'; [[5, 5], [T - 5, 5], [5, T - 5], [T - 5, T - 5]].forEach(function (p) { x.beginPath(); x.arc(gx + p[0] * k, gy + p[1] * k, 1.3 * k, 0, TAU); x.fill(); }); }
      for (var i = 0; i < 160; i++) blob(x, o.rnd(0, w), o.rnd(0, h), o.rnd(30, 100) * k, o.R() > .5 ? '#000000' : '#6a5560', o.rnd(.1, .22));
      x.fillStyle = rad(x, w * .5, h * 1.05, h * .1, h * .95, [[0, 'rgba(255,110,40,.22)'], [1, 'rgba(255,110,40,0)']]); x.fillRect(0, 0, w, h);
    },
    detail: function (o, line) { // lava channel
      var k = o.k, x = o.x;
      o.strokeLine(line, 34 * k, 'rgba(10,6,8,.6)'); o.strokeLine(line, 28 * k, '#2a1c1c');
      x.save(); x.shadowColor = '#ff7a2a'; x.shadowBlur = 22 * k; o.strokeLine(line, 20 * k, '#d2381a'); x.restore();
      o.strokeLine(line, 14 * k, '#ff7a1f'); o.strokeLine(line, 7 * k, '#ffd36a'); o.strokeLine(line, 2.4 * k, '#fff6c8');
      x.save(); x.strokeStyle = 'rgba(30,16,16,.8)'; x.lineWidth = 2 * k; x.setLineDash([6 * k, 30 * k]); x.lineCap = 'round'; poly(x, line); x.stroke(); x.restore();
    },
    decor: function (o) {
      var x = o.x, k = o.k;
      o.scatter(60, 6 * k, function (px, py) { x.fillStyle = 'rgba(0,0,0,.4)'; rrect(x, px - 9 * k, py - 5 * k, 18 * k, 10 * k, 2 * k); x.fill(); x.strokeStyle = 'rgba(200,190,210,.28)'; x.lineWidth = 1 * k; for (var i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(px + i * 3.4 * k, py - 4 * k); x.lineTo(px + i * 3.4 * k, py + 4 * k); x.stroke(); } });
      o.scatter(26, 10 * k, function (px, py) { x.save(); x.translate(px, py); x.rotate(-.5); for (var i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#f2b53b' : '#241c20'; x.fillRect(i * 8 * k, 0, 8 * k, 6 * k); } x.restore(); });
      o.scatter(300, 3 * k, function (px, py) { x.fillStyle = 'rgba(0,0,0,.28)'; x.beginPath(); x.arc(px, py, (1 + o.R() * 2) * k, 0, TAU); x.fill(); });
    },
    prop: function (o, r, i) {
      var x = o.x, k = o.k, t = i % 3, s = r.r;
      if (t === 1) { // barrel stack
        shadow(o, r.x, r.y + s * .65, s * 1.0, s * .34);
        [[-.45, .25], [.45, .25], [0, -.25]].forEach(function (b, n) { var bx = r.x + b[0] * s, by = r.y + b[1] * s, bw = s * .46, bh = s * .62; x.fillStyle = lin(x, bx - bw, 0, bx + bw, 0, [[0, n === 2 ? '#c4553a' : '#9b6a3a'], [.5, n === 2 ? '#e0734e' : '#c28a52'], [1, n === 2 ? '#8a3a28' : '#6b4524']]); x.strokeStyle = '#1f1618'; x.lineWidth = 1.6 * k; rrect(x, bx - bw, by - bh, bw * 2, bh * 1.7, 6 * k); x.fill(); x.stroke(); x.strokeStyle = 'rgba(20,12,14,.7)'; x.lineWidth = 2 * k; [-.3, .35].forEach(function (yy) { x.beginPath(); x.moveTo(bx - bw, by + bh * yy); x.lineTo(bx + bw, by + bh * yy); x.stroke(); }); });
        x.fillStyle = '#ffd24a'; x.beginPath(); x.moveTo(r.x - 3 * k, r.y - s * .4); x.lineTo(r.x + 3 * k, r.y - s * .4); x.lineTo(r.x, r.y - s * .2); x.closePath(); x.fill();
      } else if (t === 2) { // cog machine
        shadow(o, r.x, r.y + s * .7, s * 1.05, s * .36);
        x.fillStyle = lin(x, 0, r.y - s, 0, r.y + s * .6, [[0, '#6a6978'], [1, '#34333d']]); x.strokeStyle = '#17161c'; x.lineWidth = 1.8 * k; rrect(x, r.x - s * .9, r.y - s * .2, s * 1.8, s * .9, 6 * k); x.fill(); x.stroke();
        x.save(); x.translate(r.x, r.y - s * .3); for (var tIdx = 0; tIdx < 10; tIdx++) { x.rotate(TAU / 10); x.fillStyle = '#9a98a8'; x.fillRect(-s * .1, -s * .74, s * .2, s * .2); } x.fillStyle = lin(x, -s * .6, -s * .6, s * .6, s * .6, [[0, '#c3c1d0'], [1, '#6f6d7d']]); x.beginPath(); x.arc(0, 0, s * .6, 0, TAU); x.fill(); x.strokeStyle = '#2b2a33'; x.lineWidth = 1.6 * k; x.stroke(); x.fillStyle = '#2b2a33'; x.beginPath(); x.arc(0, 0, s * .2, 0, TAU); x.fill(); x.restore();
        x.fillStyle = '#ff8a3a'; x.beginPath(); x.arc(r.x + s * .65, r.y + s * .35, 2.4 * k, 0, TAU); x.fill();
      } else { // furnace
        shadow(o, r.x, r.y + s * .75, s * 1.1, s * .38); blob(x, r.x, r.y + s * .2, s * 1.6, '#ff7a2a', .32);
        x.fillStyle = lin(x, r.x - s, 0, r.x + s, 0, [[0, '#5b5a68'], [.5, '#85849a'], [1, '#3e3d4a']]); x.strokeStyle = '#17161c'; x.lineWidth = 1.8 * k; rrect(x, r.x - s * .8, r.y - s * .3, s * 1.6, s * 1.05, 7 * k); x.fill(); x.stroke();
        x.fillStyle = lin(x, 0, r.y - s * 1.1, 0, r.y - s * .3, [[0, '#4a4958'], [1, '#2c2b36']]); rrect(x, r.x - s * .25, r.y - s * 1.1, s * .5, s * .85, 3 * k); x.fill(); x.stroke();
        x.save(); x.shadowColor = '#ff8a3a'; x.shadowBlur = 16 * k; x.fillStyle = lin(x, 0, r.y - s * .1, 0, r.y + s * .5, [[0, '#ffe08a'], [.5, '#ff8a2a'], [1, '#c8341a']]); x.beginPath(); x.moveTo(r.x - s * .42, r.y + s * .5); x.lineTo(r.x - s * .42, r.y + s * .05); x.arc(r.x, r.y + s * .05, s * .42, Math.PI, 0); x.lineTo(r.x + s * .42, r.y + s * .5); x.closePath(); x.fill(); x.restore();
        x.strokeStyle = '#17161c'; x.lineWidth = 2 * k; [-.2, .2].forEach(function (dx) { x.beginPath(); x.moveTo(r.x + dx * s, r.y - s * .05); x.lineTo(r.x + dx * s, r.y + s * .5); x.stroke(); });
        x.fillStyle = 'rgba(40,38,46,.55)'; x.beginPath(); x.ellipse(r.x + s * .1, r.y - s * 1.25, s * .3, s * .14, 0, 0, TAU); x.fill();
      }
    }
  };

  /* ======================================================================
     CACHE + HOOK
     ====================================================================== */
  window.__cmdTerrain = function (m, w, h, dpr) { try { return build(m, w, h, dpr); } catch (e) { try { console.error('[Commander maps] terrain failed, using original', e); } catch (_) { } return null; } };

  /* ======================================================================
     AMBIENCE (animated, drawn by commander-fx.js on its click-through layer)
     ====================================================================== */
  var AMB = { id: null, p: [], t: 0 };
  function ambInit(id, W, H) {
    var R = rngFor('amb-' + id), n = { garden: 22, canyon: 26, glacier: 70, sanctuary: 34, foundry: 46 }[id] || 20; AMB.id = id; AMB.p = [];
    for (var i = 0; i < n; i++) AMB.p.push({ x: R() * W, y: R() * H, v: .5 + R() * 1, s: .6 + R() * 1.2, ph: R() * TAU, r: R() });
  }
  window.__cmdAmbient = {
    draw: function (ctx, W, H, id, dt) {
      if (!id) return; if (AMB.id !== id || !AMB.p.length) ambInit(id, W, H);
      AMB.t += dt; var t = AMB.t, P = AMB.p, k = W / 985, meta = META[id];
      ctx.save();
      for (var i = 0; i < P.length; i++) {
        var p = P[i];
        switch (id) {
          case 'garden': // drifting petals + pollen
            p.x += (12 + p.v * 10) * dt; p.y += (4 + Math.sin(t * .8 + p.ph) * 6) * dt; if (p.x > W + 10) { p.x = -10; p.y = Math.random() * H; }
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * .9 + p.ph); ctx.fillStyle = p.r > .66 ? 'rgba(255,196,220,.8)' : (p.r > .33 ? 'rgba(255,255,255,.75)' : 'rgba(255,238,150,.8)'); ctx.beginPath(); ctx.ellipse(0, 0, 3.2 * k * p.s, 1.7 * k * p.s, 0, 0, TAU); ctx.fill(); ctx.restore(); break;
          case 'canyon': // wind-blown dust streaks
            p.x += (60 + p.v * 50) * dt; p.y += Math.sin(t + p.ph) * 4 * dt; if (p.x > W + 60) { p.x = -60; p.y = Math.random() * H; }
            ctx.strokeStyle = 'rgba(255,232,180,' + (.14 + p.r * .14) + ')'; ctx.lineWidth = (1 + p.s) * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - (24 + p.r * 30) * k, p.y - 2 * k); ctx.stroke(); break;
          case 'glacier': // snowfall
            p.y += (22 + p.v * 26) * dt; p.x += Math.sin(t * .7 + p.ph) * 14 * dt - 4 * dt; if (p.y > H + 6) { p.y = -6; p.x = Math.random() * W; }
            ctx.fillStyle = 'rgba(255,255,255,' + (.55 + p.r * .4) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, (1.1 + p.s * .9) * k, 0, TAU); ctx.fill(); break;
          case 'sanctuary': // glowing spores
            p.y -= (6 + p.v * 8) * dt; p.x += Math.sin(t * .6 + p.ph) * 8 * dt; if (p.y < -8) { p.y = H + 8; p.x = Math.random() * W; }
            var tw = .45 + .45 * Math.sin(t * 2 + p.ph); ctx.fillStyle = (p.r > .5 ? 'rgba(190,255,200,' : 'rgba(160,230,255,') + tw + ')'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8 * k; ctx.beginPath(); ctx.arc(p.x, p.y, (1.3 + p.s) * k, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; break;
          case 'foundry': // rising embers
            p.y -= (22 + p.v * 34) * dt; p.x += Math.sin(t * 1.4 + p.ph) * 14 * dt; if (p.y < -8) { p.y = H + 8; p.x = Math.random() * W; }
            var fl = .5 + .5 * Math.sin(t * 9 + p.ph); ctx.fillStyle = 'rgba(255,' + Math.round(120 + fl * 90) + ',40,' + (.5 + fl * .4) + ')'; ctx.shadowColor = '#ff7a2a'; ctx.shadowBlur = 8 * k; ctx.beginPath(); ctx.arc(p.x, p.y, (1 + p.s * .8) * k, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; break;
        }
      }
      // water / ice / lava glints along the map's detail lines
      if (meta && meta.glints.length) {
        var gl = meta.glints;
        for (var j = 0; j < gl.length; j++) {
          var ph = j * 1.7, a = Math.sin(t * 1.6 + ph); if (a < .55) continue; var gx = gl[j][0] * W + Math.sin(ph) * 6 * k, gy = gl[j][1] * H + Math.cos(ph * 1.3) * 5 * k, aa = (a - .55) / .45;
          if (id === 'foundry') { ctx.fillStyle = 'rgba(255,214,120,' + aa * .55 + ')'; ctx.beginPath(); ctx.arc(gx, gy, 5 * k * aa + 1, 0, TAU); ctx.fill(); }
          else if (id === 'canyon' || id === 'sanctuary') continue;
          else { ctx.strokeStyle = 'rgba(255,255,255,' + aa * .85 + ')'; ctx.lineWidth = 1.5 * k; var s = 4 * k * aa + 1; ctx.beginPath(); ctx.moveTo(gx - s, gy); ctx.lineTo(gx + s, gy); ctx.moveTo(gx, gy - s); ctx.lineTo(gx, gy + s); ctx.stroke(); }
        }
      }
      ctx.restore();
    }
  };

  /* ======================================================================
     MAP-SELECT THUMBNAILS (same renderer, small)
     ====================================================================== */
  var thumbCache = {};
  function thumbFor(m) {
    if (thumbCache[m.id]) return thumbCache[m.id];
    var c = build(m, 440, 344, 1); thumbCache[m.id] = c.toDataURL('image/jpeg', .88); return thumbCache[m.id];
  }
  function upgradeThumbs() {
    try {
      var cards = document.querySelectorAll('.commander-map-card-final-v3[data-map]'); if (!cards.length || !Array.isArray(window.COMMANDER_MAPS_FINAL)) return;
      cards.forEach(function (card) {
        var art = card.querySelector('.commander-map-art-final-v3'); if (!art || art.getAttribute('data-cfx')) return;
        var m = window.COMMANDER_MAPS_FINAL.find(function (v) { return v.id === card.getAttribute('data-map'); }); if (!m) return;
        art.setAttribute('data-cfx', '1'); art.style.backgroundImage = 'url(' + thumbFor(m) + ')'; art.style.backgroundSize = 'cover'; art.style.backgroundPosition = 'center';
        var svg = art.querySelector('svg'); if (svg) svg.style.display = 'none';
      });
    } catch (e) { }
  }
  setInterval(upgradeThumbs, 400);
})();
