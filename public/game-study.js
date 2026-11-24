/* GameStudy: makes every arcade game a study session.
   1) pick(gameId): before a game starts, the player picks what to study (AI topic, a saved study set, or a note).
      Index builds a bank of multiple-choice questions for it (AI questions come from /api/games/questions).
   2) gate({title,count}): each game calls this at the start of every wave / level / floor / room. It shows a
      full-screen question card that cannot be skipped, and resolves with {correct,total,perfect}.
   Games are free to decide what a right/wrong result means (buffs, heart loss, ...).
   Public API (window.GameStudy):
     session            current session {gameId,source,title,course,unit,topic,bank[],asked,correct} or null
     pick(gameId)       Promise<session|null>   (null = cancelled)
     gate(opts)         Promise<{correct,total,perfect,streak}>   opts: {title,sub,count=3,label}
     take(n)            array of n questions {q,options,correct,explanation} (sync, refills in background)
     isOpen()           true while a question card is showing (games should be paused then)
     summary()          {asked,correct,pct,title}  and summaryHtml() for result screens
     end()              clears the session (called automatically when the game is exited)
*/
(function () {
  'use strict';
  var LSK = 'index-game-study-v1';
  var session = null, open = 0, keyHandler = null;
  var $ = function (id) { return document.getElementById(id); };
  function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------- question helpers ---------- */
  function normQ(q) {
    if (!q || typeof q !== 'object') return null;
    var text = String(q.q || q.question || '').trim(), opts = Array.isArray(q.options) ? q.options.map(function (o) { return String(o == null ? '' : o).trim(); }) : [];
    var c = Number(q.correct);
    if (!text || opts.length < 2 || opts.some(function (o) { return !o; }) || !(c >= 0 && c < opts.length)) return null;
    return { q: text, options: opts, correct: c, explanation: String(q.explanation || '').trim() };
  }
  function fromCards(cards) {
    var list = (cards || []).filter(function (c) { return c && c.front && c.back; });
    if (list.length < 4) return [];
    return list.map(function (c) {
      var others = shuffle(list.filter(function (x) { return x !== c && String(x.back) !== String(c.back); })).slice(0, 3).map(function (x) { return String(x.back); });
      if (others.length < 3) return null;
      var opts = shuffle([String(c.back)].concat(others));
      return { q: String(c.front), options: opts, correct: opts.indexOf(String(c.back)), explanation: '' };
    }).filter(Boolean);
  }
  function stemKey(q) { return String(q.q).toLowerCase().replace(/\s+/g, ' ').slice(0, 120); }

  /* In fullscreen only the fullscreen element (the game stage) is drawn, so cards must live inside it. */
  function host() { return document.fullscreenElement || document.webkitFullscreenElement || document.body; }
  function follow(el) {
    function mv() { var h = host(); if (el.isConnected && el.parentNode !== h) h.appendChild(el); }
    document.addEventListener('fullscreenchange', mv); document.addEventListener('webkitfullscreenchange', mv);
    var iv = setInterval(function () { if (!el.isConnected) { clearInterval(iv); document.removeEventListener('fullscreenchange', mv); document.removeEventListener('webkitfullscreenchange', mv); } }, 500);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function fetchBankOnce(body) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 50000), r, d;
    try {
      r = await fetch('/api/games/questions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      d = await r.json().catch(function () { return {}; });
    } catch (x) { var ne = new Error('The question service is slow right now.'); ne.retry = true; throw ne; } finally { clearTimeout(t); }
    if (!r.ok) { var e = new Error(d.error || 'The AI could not prepare questions right now.'); e.code = d.code; e.retry = r.status >= 500 || r.status === 429 && d.code !== 'NO_CREDITS'; e.status = r.status; throw e; }
    var qs = (d.questions || []).map(normQ).filter(Boolean);
    if (!qs.length) { var e2 = new Error('The AI did not return usable questions. Try again.'); e2.retry = true; throw e2; }
    return qs;
  }
  /* AI hiccups are common, so try up to 3 times (smaller banks are faster and more reliable on the retries). */
  async function fetchBank(body) {
    var want = body && body.count || 12, last;
    for (var i = 0; i < 3; i++) {
      try { return await fetchBankOnce(Object.assign({}, body, { count: i === 0 ? want : Math.max(5, Math.min(want, i === 1 ? 8 : 6)) })); }
      catch (e) { last = e; if (!e.retry || e.code === 'NO_CREDITS' || e.code === 'NO_AI' || e.status === 400) break; await sleep(900 * (i + 1)); }
    }
    throw last;
  }

  /* ---------- session / question supply ---------- */
  function topUp(s) {
    if (!s || s.topping || !s.refill) return;
    var unseen = s.bank.filter(function (q) { return !s.seen[stemKey(q)]; }).length;
    if (unseen > 3 || s.bank.length >= 80) return;
    s.topping = true;
    var exclude = s.bank.slice(-25).map(function (q) { return q.q; });
    fetchBank(Object.assign({}, s.refill, { count: 10, exclude: exclude })).then(function (qs) {
      var have = {}; s.bank.forEach(function (q) { have[stemKey(q)] = 1; });
      qs.forEach(function (q) { if (!have[stemKey(q)]) s.bank.push(q); });
    }).catch(function () { }).then(function () { s.topping = false; });
  }
  function take(n) {
    var s = session; if (!s || !s.bank.length) return [];
    var out = [];
    for (var i = 0; i < n; i++) {
      var pool = s.bank.filter(function (q) { return !s.seen[stemKey(q)]; });
      if (!pool.length) { s.seen = {}; pool = s.bank.slice(); }
      var q = pool[Math.floor(Math.random() * pool.length)];
      s.seen[stemKey(q)] = 1; out.push(q);
    }
    topUp(s);
    return out;
  }

  /* ---------- the question card ---------- */
  function css() {
    if ($('gs-css')) return;
    var l = document.createElement('link'); l.id = 'gs-css'; l.rel = 'stylesheet'; l.href = '/game-study.css?v=1'; document.head.appendChild(l);
  }
  function blockKeys(on) {
    if (on) { if (!blockKeys.h) { blockKeys.h = function (e) { if (!open && !$('gs-picker')) return; var t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) { e.stopPropagation(); return; } if (keyHandler && e.type === 'keydown') keyHandler(e); e.stopImmediatePropagation(); }; window.addEventListener('keydown', blockKeys.h, true); window.addEventListener('keyup', blockKeys.h, true); } }
  }
  /* opts.need = strict mode: the player must get `need` questions RIGHT to continue. A wrong answer locks the
     card for opts.cooldown ms (default 3000), then a fresh question replaces it. No XP in strict mode. */
  function gate(opts) {
    opts = opts || {}; css(); blockKeys(true);
    var need = Math.max(0, Math.min(8, opts.need || 0)), strict = need > 0;
    var cool = Math.max(0, opts.cooldown == null ? 3000 : opts.cooldown);
    var count = strict ? 1 : Math.max(1, Math.min(8, opts.count || 3));
    return new Promise(function (resolve) {
      var qs = take(count);
      if (!qs.length) { resolve({ correct: 0, total: 0, perfect: false, streak: 0, skipped: true }); return; }
      var i = 0, right = 0, wrong = 0, streak = 0, answered = false, locked = false, coolTimer = null;
      open++;
      var o = document.createElement('div'); o.id = 'gs-gate'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
      host().appendChild(o); follow(o);
      function finish() {
        clearInterval(coolTimer);
        open = Math.max(0, open - 1);
        o.classList.add('gs-out'); setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 180);
        if (keyHandler === onKey) keyHandler = null;
        if (session && !strict) { session.asked += qs.length; session.correct += right; }
        try { chip(); } catch (e) { }
        resolve({ correct: right, total: strict ? right + wrong : qs.length, perfect: strict ? wrong === 0 : right === qs.length, streak: streak });
      }
      function render() {
        var q = qs[i]; answered = false; locked = false;
        var top = strict ? 'Correct answers: ' + right + ' of ' + need : 'Question ' + (i + 1) + ' of ' + qs.length;
        var prog = strict ? right / need * 100 : i / qs.length * 100;
        var last = strict ? right >= need : i === qs.length - 1;
        o.innerHTML = '<div class="gs-card"><div class="gs-top"><span class="gs-tag">' + E(opts.label || 'STUDY CHECKPOINT') + '</span><span class="gs-count">' + top + '</span></div>' +
          '<h3 class="gs-title">' + E(opts.title || 'Answer to continue') + '</h3>' + (opts.sub ? '<p class="gs-sub">' + E(opts.sub) + '</p>' : '') +
          '<div class="gs-prog"><i style="width:' + prog + '%"></i></div>' +
          '<div class="gs-q">' + E(q.q) + '</div><div class="gs-opts">' + q.options.map(function (t, k) { return '<button type="button" class="gs-opt" data-k="' + k + '"><kbd>' + (k + 1) + '</kbd><span>' + E(t) + '</span></button>'; }).join('') + '</div>' +
          '<div class="gs-fb" aria-live="polite"></div><div class="gs-foot"><span class="gs-topic">' + E(session ? session.title : '') + '</span><button type="button" class="gs-next" disabled>' + (last ? 'Finish' : (strict ? 'Next question' : 'Next')) + '</button></div></div>';
        var first = o.querySelector('.gs-opt'); if (first) first.focus();
      }
      function nextStrict() { var more = take(1); if (!more.length) { finish(); return; } qs.push(more[0]); i = qs.length - 1; render(); }
      function chooseStrict(k) {
        if (answered || locked) return; var q = qs[i]; if (!(k >= 0 && k < q.options.length)) return;
        var ok = k === q.correct; if (session) { session.asked++; if (ok) session.correct++; }
        var fb = o.querySelector('.gs-fb'), btns = o.querySelectorAll('.gs-opt');
        btns.forEach(function (b) { b.disabled = true; });
        if (ok) {
          answered = true; right++; streak++;
          btns[k].classList.add('ok'); fb.className = 'gs-fb good';
          fb.innerHTML = '<b>✓ Correct!</b> ' + E(q.explanation || '');
          var nx = o.querySelector('.gs-next'); nx.disabled = false; nx.textContent = right >= need ? 'Deploy' : 'Next question'; nx.focus();
          var bar = o.querySelector('.gs-prog i'); if (bar) bar.style.width = (right / need * 100) + '%';
        } else {
          locked = true; wrong++; streak = 0; btns[k].classList.add('bad'); fb.className = 'gs-fb miss';
          var left = Math.ceil(cool / 1000), t0 = Date.now();
          function paint() { fb.innerHTML = '<b>✗ Not quite.</b> Take a breath. A new question unlocks in <b>' + Math.max(1, left) + '</b>…'; }
          paint();
          coolTimer = setInterval(function () {
            var rem = cool - (Date.now() - t0);
            if (rem <= 0) { clearInterval(coolTimer); nextStrict(); return; }
            var nl = Math.ceil(rem / 1000); if (nl !== left) { left = nl; paint(); }
          }, 100);
        }
      }
      function choose(k) {
        if (strict) { chooseStrict(k); return; }
        if (answered) return; var q = qs[i]; if (!(k >= 0 && k < q.options.length)) return; answered = true;
        var ok = k === q.correct; if (ok) { right++; streak++; } else streak = 0;
        o.querySelectorAll('.gs-opt').forEach(function (b, n) { b.disabled = true; if (n === q.correct) b.classList.add('ok'); else if (n === k) b.classList.add('bad'); });
        var fb = o.querySelector('.gs-fb'); fb.className = 'gs-fb ' + (ok ? 'good' : 'miss');
        fb.innerHTML = '<b>' + (ok ? '✓ Correct!' : '✗ Not quite.') + '</b> ' + (ok ? '' : 'The answer is <b>' + E(q.options[q.correct]) + '</b>. ') + E(q.explanation || '');
        try { if (ok && typeof addXP === 'function') addXP(2); } catch (e) { }
        var nx = o.querySelector('.gs-next'); nx.disabled = false; nx.focus();
      }
      function advance() {
        if (!answered) return;
        if (strict) { if (right >= need) finish(); else nextStrict(); return; }
        if (i >= qs.length - 1) finish(); else { i++; render(); }
      }
      function onKey(e) {
        if (!o.isConnected) return;
        if (e.key >= '1' && e.key <= '9') { choose(Number(e.key) - 1); e.preventDefault(); }
        else if (e.key === 'Enter' && answered) { advance(); e.preventDefault(); }
      }
      o.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.gs-opt'); if (b) { choose(Number(b.getAttribute('data-k'))); return; }
        if (e.target.closest && e.target.closest('.gs-next')) advance();
      });
      keyHandler = onKey;
      render();
    });
  }

  /* ---------- the topic picker ---------- */
  function sets() { try { return (state.studySets || []).filter(function (s) { return (s.type === 'quiz' && s.questions && s.questions.length >= 4) || (s.type === 'flashcards' && s.cards && s.cards.length >= 4); }); } catch (e) { return []; } }
  function notes() { try { return (state.notes || []).filter(function (n) { return n && String(n.content || '').trim().length >= 80; }); } catch (e) { return []; } }
  function subjects() { try { return SUBJECTS; } catch (e) { return []; } }
  function gameName(id) { try { var m = ARCADE_MODES.filter(function (x) { return x.id === id; })[0]; return m ? m.name : 'this game'; } catch (e) { return 'this game'; } }

  function pick(gameId) {
    css(); blockKeys(true);
    var prefs = jget(LSK, {}); var tab = prefs.tab || 'topic';
    if (tab === 'sets' && !sets().length) tab = 'topic'; if (tab === 'notes' && !notes().length) tab = 'topic';
    return new Promise(function (resolve) {
      var o = document.createElement('div'); o.id = 'gs-picker'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); host().appendChild(o); follow(o);
      var busy = false, err = '', state0 = { subjectId: prefs.subjectId || (subjects()[0] || {}).id, unit: prefs.unit || '', topic: prefs.topic || '', setId: prefs.setId || '', noteId: prefs.noteId || '' };
      function close(res) { o.remove(); resolve(res); }
      function subj() { return subjects().filter(function (s) { return s.id === state0.subjectId; })[0] || subjects()[0] || { units: [], name: '' }; }
      function render() {
        var S = subj(), units = S.units || []; if (units.indexOf(state0.unit) < 0) state0.unit = units[0] || '';
        var tabs = [['topic', '✨ AI topic'], ['sets', '📚 My study sets'], ['notes', '📝 My notes']].map(function (t) { return '<button type="button" class="gs-tab' + (tab === t[0] ? ' active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('');
        var body = '';
        if (tab === 'topic') {
          body = '<div class="gs-f"><label>AP course</label><select id="gs-subject">' + subjects().map(function (s) { return '<option value="' + E(s.id) + '"' + (s.id === state0.subjectId ? ' selected' : '') + '>' + E(s.name) + '</option>'; }).join('') + '</select></div>' +
            '<div class="gs-f"><label>Unit</label><select id="gs-unit">' + units.map(function (u) { return '<option' + (u === state0.unit ? ' selected' : '') + '>' + E(u) + '</option>'; }).join('') + '</select></div>' +
            '<div class="gs-f"><label>Specific topic <small>(optional)</small></label><input id="gs-topic" maxlength="120" placeholder="e.g. Federalist 10, natural selection, derivatives" value="' + E(state0.topic) + '"></div>' +
            '<p class="gs-note">Index writes fresh questions on this topic for every level, and keeps making new ones as you play.</p>';
        } else if (tab === 'sets') {
          var L = sets(); body = L.length ? '<div class="gs-list">' + L.map(function (s) { var n = s.type === 'quiz' ? s.questions.length + ' questions' : s.cards.length + ' cards'; return '<button type="button" class="gs-set' + (state0.setId === s.id ? ' sel' : '') + '" data-set="' + E(s.id) + '"><b>' + E(s.title) + '</b><span>' + n + '</span></button>'; }).join('') + '</div>' : '<p class="gs-note">You have no saved quizzes or flashcards (with at least 4 items) yet.</p>';
        } else {
          var N = notes(); body = N.length ? '<div class="gs-list">' + N.map(function (n) { return '<button type="button" class="gs-set' + (state0.noteId === n.id ? ' sel' : '') + '" data-note="' + E(n.id) + '"><b>' + E(n.title || 'Untitled note') + '</b><span>' + Math.round(String(n.content).length / 5) + ' words</span></button>'; }).join('') + '</div><p class="gs-note">Index turns the note you pick into questions, so you are tested on your own material.</p>' : '<p class="gs-note">Write a note in the Notes tab (at least a few sentences) and it will show up here.</p>';
        }
        o.innerHTML = '<div class="gs-card gs-pick"><button type="button" class="gs-x" data-x aria-label="Cancel">×</button><div class="gs-tag">STUDY TO PLAY</div><h3 class="gs-title">What are you studying?</h3>' +
          '<p class="gs-sub">' + E(gameName(gameId)) + ' asks you a question at the start of every level. Pick your material first.</p><div class="gs-tabs">' + tabs + '</div>' + body +
          (err ? '<div class="gs-err">' + E(err) + '</div>' : '') +
          '<div class="gs-foot"><span class="gs-topic">' + (tab === 'topic' ? 'Uses 1 AI credit' : (tab === 'notes' ? 'Uses 1 AI credit' : 'Free')) + '</span><button type="button" class="gs-go" data-go' + (busy ? ' disabled' : '') + '>' + (busy ? '<span class="gs-spin"></span> Preparing questions…' : 'Start game') + '</button></div></div>';
      }
      async function go() {
        if (busy) return; err = '';
        var s = { gameId: gameId, source: tab, bank: [], seen: {}, asked: 0, correct: 0, title: '', refill: null, topping: false };
        try {
          if (tab === 'topic') {
            var S = subj(), unit = ($('gs-unit') || {}).value || state0.unit, topic = (($('gs-topic') || {}).value || '').trim();
            state0.unit = unit; state0.topic = topic; busy = true; render();
            s.course = S.name; s.unit = unit; s.topic = topic; s.title = 'AP ' + S.name + ' · ' + unit + (topic ? ' · ' + topic : '');
            s.refill = { course: S.name, unit: unit, topic: topic }; s.bank = await fetchBank(Object.assign({ count: 14 }, s.refill));
          } else if (tab === 'sets') {
            var set = sets().filter(function (x) { return x.id === state0.setId; })[0]; if (!set) { err = 'Pick a set first.'; render(); return; }
            s.title = set.title; s.bank = (set.type === 'quiz' ? set.questions.map(normQ).filter(Boolean) : fromCards(set.cards));
            if (s.bank.length < 4) { err = 'That set needs at least 4 usable questions.'; render(); return; }
          } else {
            var note = notes().filter(function (x) { return x.id === state0.noteId; })[0]; if (!note) { err = 'Pick a note first.'; render(); return; }
            busy = true; render(); s.title = note.title || 'My note'; var material = String(note.content).slice(0, 7000);
            s.refill = { material: material, topic: s.title }; s.bank = await fetchBank(Object.assign({ count: 14 }, s.refill));
          }
        } catch (e) { busy = false; err = String(e && e.message || 'Could not prepare questions.'); if (e && e.code === 'NO_CREDITS') err += ' You can still play with a saved study set (it is free).'; render(); return; }
        jset(LSK, Object.assign({ tab: tab }, state0));
        busy = false; try { cashOut(); } catch (e) { } session = s; close(s);
      }
      o.addEventListener('click', function (e) {
        var t = e.target; if (!t.closest) return;
        if (t.closest('[data-x]')) { if (!busy) close(null); return; }
        var tb = t.closest('.gs-tab'); if (tb && !busy) { tab = tb.getAttribute('data-tab'); err = ''; render(); return; }
        var st = t.closest('[data-set]'); if (st && !busy) { state0.setId = st.getAttribute('data-set'); render(); return; }
        var nt = t.closest('[data-note]'); if (nt && !busy) { state0.noteId = nt.getAttribute('data-note'); render(); return; }
        if (t.closest('[data-go]')) go();
      });
      o.addEventListener('change', function (e) { if (e.target.id === 'gs-subject') { state0.subjectId = e.target.value; state0.unit = ''; render(); } else if (e.target.id === 'gs-unit') state0.unit = e.target.value; });
      o.addEventListener('input', function (e) { if (e.target.id === 'gs-topic') state0.topic = e.target.value; });
      render();
    });
  }


  /* ---------- coins: every correct answer in a run is worth 1 coin, paid out when the run ends ----------
     Rate 1 coin per correct answer, at most RUN_MAX per run (anti-farming). addCoins() enforces the 500/day cap, so once
     it is hit no more coins are paid. Nothing else in the arcade pays coins any more. */
  var COIN_PER_CORRECT = 1, RUN_MAX = 100;
  window.noCoin = function () { return 0; };
  function credit(c, a) { var s = session; if (!s) return; s.correct += c || 0; s.asked += a || 0; try { chip(); } catch (e) { } }
  function pending() { var s = session; if (!s) return 0; return Math.max(0, Math.min(RUN_MAX, Math.floor((s.correct || 0) * COIN_PER_CORRECT)) - (s.paid || 0)); }
  function leftToday() { try { return typeof dailyCoinsRemaining === 'function' ? dailyCoinsRemaining() : 500; } catch (e) { return 500; } }
  function cashOut() {
    var s = session; if (!s) return 0; var n = pending(); if (!n) return 0;
    var got = 0;
    try { if (typeof addCoins === 'function') got = addCoins(n, n + ' correct answer' + (n === 1 ? '' : 's')) || 0; } catch (e) { }
    s.paid = (s.paid || 0) + n; hideChip(); return got;
  }
  function chip() {
    var c = $('gs-coinchip');
    if (!session) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('div'); c.id = 'gs-coinchip'; c.setAttribute('aria-live', 'polite'); c.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:60;background:rgba(20,16,40,.92);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:8px 14px;font:700 13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);pointer-events:none'; document.body.appendChild(c); }
    var n = (session.correct || 0), left = leftToday();
    c.textContent = left <= 0 ? '🪙 Daily coin cap reached' : '✅ ' + n + ' correct · 🪙 ' + Math.min(RUN_MAX, n) + ' coins when you finish (' + left + ' left today)';
  }
  function hideChip() { var c = $('gs-coinchip'); if (c) c.remove(); }
  window.addEventListener('pagehide', function () { try { cashOut(); } catch (e) { } });
  function summary() { var s = session; if (!s) return { asked: 0, correct: 0, pct: 0, title: '' }; return { asked: s.asked, correct: s.correct, pct: s.asked ? Math.round(s.correct / s.asked * 100) : 0, title: s.title }; }
  function summaryHtml() {
    var m = summary(); if (!session || !m.asked) return '';
    return '<div class="gs-summary"><b>📚 Study score</b> ' + m.correct + ' / ' + m.asked + ' correct (' + m.pct + '%) · ' + E(m.title) + '<br>🪙 ' + Math.min(RUN_MAX, m.correct) + ' coins for your correct answers, paid when you leave (500 per day max)</div>';
  }
  function end() { try { cashOut(); } catch (e) { } session = null; hideChip(); var g = $('gs-gate'); if (g) { open = Math.max(0, open - 1); if (keyHandler) keyHandler = null; g.remove(); } }

  /* every game goes through arcadeStart: ask for the topic first (Troop Commander already has its own picker) */
  /* games that already ask study questions every level (the picker only runs for these) */
  var GATED = { commander: 1, expedition: 1, shadow: 1, rogue: 1, gauntlet: 1, trial: 1, rhythm: 1, chrono: 1, gold: 1, study: 1 };
  function install() {
    if (typeof window.arcadeStart !== 'function' || window.arcadeStart.__gs) return false;
    var orig = window.arcadeStart;
    var wrapped = function (id) {
      if (!GATED[id]) { end(); return orig.apply(this, arguments); }
      var self = this, args = arguments;
      pick(id).then(function (s) { if (s) orig.apply(self, args); });
    };
    wrapped.__gs = true; window.arcadeStart = wrapped;
    var oe = window.exitGame;
    if (typeof oe === 'function' && !oe.__gs) { var w2 = function () { end(); return oe.apply(this, arguments); }; w2.__gs = true; window.exitGame = w2; }
    return true;
  }
  if (!install()) { var tries = 0, iv = setInterval(function () { if (install() || ++tries > 40) clearInterval(iv); }, 250); }

  window.GameStudy = { credit: credit, cashOut: cashOut, pending: pending, pick: pick, gate: gate, take: take, isOpen: function () { return open > 0; }, summary: summary, summaryHtml: summaryHtml, end: end, get session() { return session; } };
})();
