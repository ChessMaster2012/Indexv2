/* Shop, Quests & More  +  Notes & Study Sets: two merged sidebar tabs with a small tab bar. */

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
    shop: { parent: 'rewards', tabs: [['rewards', 'Rewards', 'trophy'], ['quests', 'Quests', 'target']] },
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
    '#hub-tabs button.on{background:#ff7a4d;color:#1a0d07}';
  document.head.appendChild(css);
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
  function tickStrip() {
    var el = ensureStrip(); if (!el) return;
    var v = (typeof state !== 'undefined' && state.view) || '', g = groupOf(v);
    el.classList.toggle('on', !!g);
    var key = g + '|' + v;
    if (key !== lastKey) {
      lastKey = key;
      el.innerHTML = g ? GROUPS[g].tabs.map(function (t) {
        return '<button type="button" data-hub="' + t[0] + '" class="' + (t[0] === v ? 'on' : '') + '">' + ic(t[2], 16) + esc(t[1]) + '</button>';
      }).join('') : '';
    }
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      var d = b.dataset.view; if (!d) return;
      for (var k in GROUPS) if (d === GROUPS[k].parent && g === k) b.classList.add('active');
    });
  }

  /* the Index logo (top left) goes back to the dashboard */
  function goHome(e) {
    var b = e.target.closest && e.target.closest('.brand'); if (!b || !b.closest('.sidebar,#nav,aside,.side,body')) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); if (typeof switchView === 'function') switchView('dashboard');
  }
  document.addEventListener('click', goHome); document.addEventListener('keydown', goHome);
  var bs = document.createElement('style'); bs.textContent = '.brand{cursor:pointer}.brand:focus-visible{outline:2px solid #ff7a4d;outline-offset:4px;border-radius:8px}'; document.head.appendChild(bs);

  setInterval(tickStrip, 300);
})();
