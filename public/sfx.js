/* App-wide sound effects, synthesized with the Web Audio API (no audio files). One mute switch for the whole app:
   it shares the "gx-mute" setting with the arcade games. Sounds only play after the person interacts with the page. */
(function () {
  'use strict';
  var KEY = 'gx-mute', VKEY = 'index-sfx-vol';
  var ctx = null, last = {}, vol = 0.5;
  function muted() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  try { var v = parseFloat(localStorage.getItem(VKEY)); if (v >= 0 && v <= 1) vol = v; } catch (e) { }
  function ac() {
    if (!ctx) { try { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(function () { });
    return ctx;
  }
  /* one synth note: freq, start offset, duration, wave type, peak gain, optional slide-to frequency */
  function note(c, f, at, dur, type, g, to) {
    var t = c.currentTime + at, o = c.createOscillator(), gn = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    var peak = Math.max(0.0002, g * vol * 0.35);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(peak, t + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  var SOUNDS = {
    click:   function (c) { note(c, 620, 0, 0.07, 'triangle', 0.9, 380); },
    press:   function (c) { note(c, 760, 0, 0.08, 'triangle', 1, 460); note(c, 1140, 0.02, 0.06, 'sine', 0.35); },
    soft:    function (c) { note(c, 360, 0, 0.07, 'sine', 0.8, 260); },
    tick:    function (c) { note(c, 1250, 0, 0.035, 'square', 0.35); },
    nav:     function (c) { note(c, 420, 0, 0.09, 'sine', 0.8, 640); note(c, 640, 0.05, 0.09, 'sine', 0.6, 820); },
    open:    function (c) { note(c, 360, 0, 0.12, 'sine', 0.8, 720); note(c, 540, 0.05, 0.12, 'triangle', 0.4, 900); },
    close:   function (c) { note(c, 620, 0, 0.1, 'sine', 0.7, 300); },
    toast:   function (c) { note(c, 880, 0, 0.12, 'sine', 0.8); note(c, 1320, 0.09, 0.2, 'sine', 0.7); },
    success: function (c) { [523, 659, 784, 1047].forEach(function (f, i) { note(c, f, i * 0.07, 0.18, 'triangle', 0.8); }); },
    win:     function (c) { [523, 659, 784, 1047, 1319].forEach(function (f, i) { note(c, f, i * 0.08, 0.22, 'triangle', 0.9); }); note(c, 262, 0, 0.5, 'sine', 0.5); },
    error:   function (c) { note(c, 190, 0, 0.18, 'sawtooth', 0.55, 130); note(c, 160, 0.12, 0.2, 'sawtooth', 0.5, 110); },
    send:    function (c) { note(c, 500, 0, 0.1, 'sine', 0.7, 900); },
    receive: function (c) { note(c, 740, 0, 0.09, 'sine', 0.6); note(c, 988, 0.08, 0.12, 'sine', 0.5); },
    coin:    function (c) { note(c, 988, 0, 0.07, 'square', 0.4); note(c, 1319, 0.07, 0.22, 'square', 0.4); },
    level:   function (c) { [392, 523, 659, 784, 1047].forEach(function (f, i) { note(c, f, i * 0.09, 0.25, 'triangle', 0.9); }); }
  };
  function play(name) {
    if (muted()) return; var fn = SOUNDS[name]; if (!fn) return;
    var now = Date.now(); if (last[name] && now - last[name] < 45) return; last[name] = now;
    var c = ac(); if (!c) return; try { fn(c); } catch (e) { }
  }
  function setMuted(m) { try { localStorage.setItem(KEY, m ? '1' : '0'); } catch (e) { } paintToggle(); if (!m) play('success'); }
  window.SFX = { play: play, muted: muted, setMuted: setMuted, volume: function (v) { if (v == null) return vol; vol = Math.max(0, Math.min(1, v)); try { localStorage.setItem(VKEY, String(vol)); } catch (e) { } } };

  /* ----- global wiring ----- */
  var CLICKABLE = 'button, a[href], [role="button"], summary, label.cr-seg, .nav-btn, .cr-card, .cr-item, .cr-stu, .mp-card, select';
  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest && e.target.closest(CLICKABLE); if (!el || el.disabled || el.closest('[data-nosfx]') || el.id === 'sfx-toggle') return;
    if (el.matches('input,select,textarea')) return;
    var cls = el.className && el.className.toString ? el.className.toString() : '';
    if (el.matches('.nav-btn, .cr-tabs button') ) play('nav');
    else if (/danger|btn-danger/.test(cls)) play('soft');
    else if (/btn-primary|btn-dark/.test(cls) || el.matches('[type=submit]')) play('press');
    else if (el.matches('summary, select')) play('tick');
    else play('click');
  }, true);
  document.addEventListener('change', function (e) { var t = e.target; if (t && t.matches && t.matches('input[type=checkbox],input[type=radio]')) play('tick'); }, true);
  /* modals and dialogs opening */
  try {
    new MutationObserver(function (list) {
      list.forEach(function (m) { m.addedNodes && m.addedNodes.forEach(function (n) { if (n.nodeType === 1 && (n.matches('.overlay,.modal,.cr-modal,[role=dialog]') || (n.querySelector && n.querySelector('[role=dialog]')))) play('open'); }); });
    }).observe(document.body, { childList: true });
  } catch (e) { }
  /* existing app events: toasts and celebrations */
  function wrap(name, fn) { var orig = window[name]; if (typeof orig !== 'function' || orig.__sfx) return; var w = function () { try { fn.apply(null, arguments); } catch (e) { } return orig.apply(this, arguments); }; w.__sfx = 1; window[name] = w; }
  function wire() {
    wrap('showRewardToast', function (t) { var s = String(t || ''); play(/level|unlock|new reward|pack|crate|legend/i.test(s) ? 'level' : /coin|\+\d/.test(s) ? 'coin' : /fail|error|could not|couldn't|wrong|limit/i.test(s) ? 'error' : 'toast'); });
    wrap('celebrate', function () { play('win'); });
  }
  wire(); setTimeout(wire, 1500); setTimeout(wire, 4000);
  /* a mute switch at the bottom of the sidebar */
  function paintToggle() { var b = document.getElementById('sfx-toggle'); if (b) { b.textContent = (muted() ? '🔇 Sounds off' : '🔊 Sounds on'); b.setAttribute('aria-pressed', muted() ? 'true' : 'false'); } }
  function mount() {
    var foot = document.getElementById('sidebar-foot'); if (!foot) return setTimeout(mount, 500);
    if (document.getElementById('sfx-toggle')) return;
    var b = document.createElement('button'); b.id = 'sfx-toggle'; b.type = 'button'; b.className = 'sfx-toggle'; b.title = 'Turn app sounds on or off';
    b.addEventListener('click', function () { setMuted(!muted()); }); foot.parentNode.insertBefore(b, foot); paintToggle();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
