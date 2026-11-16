/* Classrooms (student + teacher views) with the Tutor in a side panel. Talks to /api/classes (see classroom.js on the server). */
(function () {
  'use strict';
  var CR = { list: null, cur: null, tab: 'stream', aid: null, editing: null, tutor: { open: false, msgs: [], busy: false }, statOv: {}, showStats: (function () { try { return localStorage.getItem('cr-stats') !== '0'; } catch (e) { return true; } })(), err: '', busy: false, gradeSel: null };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function role() { try { return localStorage.getItem('index-role') === 'teacher' ? 'teacher' : 'student'; } catch (e) { return 'student'; } }
  function isT() { return role() === 'teacher'; }
  function api(path, method, body) {
    return fetch('/api' + path, { method: method || 'GET', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Something went wrong.'); e.status = r.status; throw e; } return d; }); });
  }
  function toast(m) { try { showRewardToast(m); } catch (e) { } }
  function fmtDue(ms) { if (!ms) return 'No due date'; var d = new Date(ms); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function rel(ms) { var d = ms - Date.now(), a = Math.abs(d), h = Math.round(a / 3600000), dd = Math.round(a / 86400000); var t = a < 3600000 ? Math.max(1, Math.round(a / 60000)) + ' min' : (h < 48 ? h + ' hr' : dd + ' days'); return d < 0 ? t + ' late' : 'in ' + t; }
  function ago(ms) { var a = Date.now() - ms; if (a < 60000) return 'just now'; if (a < 3600000) return Math.round(a / 60000) + ' min ago'; if (a < 86400000) return Math.round(a / 3600000) + ' hr ago'; return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function inputDt(ms) { if (!ms) return ''; var d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }

  /* ---------------- shell ---------------- */
  function ensureShell() {
    if (!$('#view-classroom')) {
      var anchor = $('#view-membership'); if (!anchor) return false;
      var sec = document.createElement('section'); sec.className = 'view'; sec.id = 'view-classroom'; sec.innerHTML = '<div id="cr-root" class="cr"></div>';
      anchor.parentNode.insertBefore(sec, anchor);
      sec.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && e.target.matches && e.target.matches('.cr-chat-in textarea')) { e.preventDefault(); var f = e.target.form; if (f && f.requestSubmit) f.requestSubmit(); } else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.cr-stu')) { e.preventDefault(); e.target.click(); } });
      sec.addEventListener('click', onClick); sec.addEventListener('submit', onSubmit); sec.addEventListener('change', onChange);
    }
    if (!$('.nav-btn[data-view="classroom"]')) {
      var dash = $('.nav-btn[data-view="dashboard"]'); if (!dash) return false;
      var b = document.createElement('button'); b.className = 'nav-btn'; b.setAttribute('data-view', 'classroom'); b.innerHTML = '<span></span><span id="cr-navlabel">Classroom</span>';
      dash.parentNode.insertBefore(b, dash.nextSibling);
    }
    var l = $('#cr-navlabel'); if (l) l.textContent = isT() ? 'Classroom' : 'My Classes';
    return true;
  }
  function applyRole() { ensureShell(); document.body.setAttribute('data-role', role()); if (state.view === 'classroom') render(); }

  /* ---------------- data ---------------- */
  function loadList() { return api('/classes').then(function (d) { CR.list = d; CR.err = ''; }).catch(function (e) { CR.err = e.message; }); }
  function loadClass(id) { return api('/classes/' + id).then(function (d) { CR.cur = d.class; CR.err = ''; }).catch(function (e) { CR.err = e.message; CR.cur = null; }); }
  function refresh() { var id = CR.cur && CR.cur.id; return (id ? loadClass(id) : Promise.resolve()).then(loadList).then(render); }

  /* ---------------- render ---------------- */
  function render() {
    var root = $('#cr-root'); if (!root) return;
    var main = CR.cur ? classHtml() : homeHtml();
    root.innerHTML = '<div class="cr-wrap"><div class="cr-main">' + (CR.err ? '<div class="cr-err">' + E(CR.err) + '</div>' : '') + main + '</div></div>' + tutorHtml() +
      '<button class="cr-dot' + (CR.tutor.open ? ' open' : '') + '" data-cr="tutor-toggle" aria-label="' + (CR.tutor.open ? 'Close' : 'Open') + ' the ' + (isT() ? 'teacher assistant' : 'tutor') + '" title="' + (isT() ? 'Teacher assistant' : 'Class Tutor') + '">' + (CR.tutor.open ? '✕' : '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M6 7.5A4.5 4.5 0 0 1 10.5 3h11A4.5 4.5 0 0 1 26 7.5v8A4.5 4.5 0 0 1 21.5 20H15l-5.2 4.6c-.7.6-1.8.1-1.8-.8V20.2A4.5 4.5 0 0 1 6 15.5z" fill="#fff"/><path d="M16 6.8l1.5 3.6 3.6 1.5-3.6 1.5L16 17l-1.5-3.6-3.6-1.5 3.6-1.5z" fill="#7c5cfc"/><path d="M23.6 17.4l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill="#ff5ca8"/></svg>') + '</button>' + (CR.editing ? editorHtml() : '');
    var log = $('.cr-chat-log'); if (log) log.scrollTop = log.scrollHeight;
  }
  function homeHtml() {
    var L = CR.list; if (!L) return '<div class="cr-loading">Loading your classes…</div>';
    if (isT()) {
      var cards = L.owned.map(function (k) {
        return '<article class="cr-card"><div class="cr-card-top"><h3>' + E(k.name) + '</h3><span class="cr-chip">' + E(k.subject || 'Class') + (k.section ? ' · ' + E(k.section) : '') + '</span></div>' +
          '<div class="cr-stats"><div><b>' + k.students + '</b><span>students</span></div><div><b>' + k.assignments + '</b><span>assignments</span></div><div><b>' + k.submissions + '</b><span>turned in</span></div></div>' +
          '<div class="cr-code" title="Students join with this code">Class code <b>' + E(k.code) + '</b> <button class="cr-mini" data-cr="copy" data-v="' + E(k.code) + '">Copy</button></div>' +
          '<button class="btn btn-primary" data-cr="open" data-id="' + k.id + '">Open class</button></article>';
      }).join('');
      return '<header class="cr-hero cr-hero-t"><div><div class="cr-eyebrow">TEACHER HUB</div><h2>Your classrooms</h2><p>Create a class, share the code, post assignments and quizzes that grade themselves, and use the Tutor on the side to plan and give feedback.</p></div>' +
        '<form class="cr-newclass" data-cr="newclass"><input name="name" placeholder="Class name (e.g. Period 3 Biology)" maxlength="80" required><div class="cr-crow"><input name="subject" placeholder="Subject" maxlength="60"><input name="section" placeholder="Period / section" maxlength="40"></div><button class="btn btn-primary" type="submit">＋ Create class</button></form></header>' +
        (cards ? '<div class="cr-grid">' + cards + '</div>' : '<div class="cr-empty"><div>🍎</div><h3>No classes yet</h3><p>Create your first class above. You will get a join code to give your students.</p></div>') +
        '<div class="cr-feat"><h4>What you can do here</h4><ul><li>📣 Post announcements to the class stream</li><li>📝 Assign written work with links, due dates and points</li><li>⚡ Make auto-graded quizzes, with AI to write the questions, or reuse your study sets</li><li>📊 Gradebook, class insights and CSV export</li><li>🤖 Tutor on the side for lesson ideas, rubrics and feedback drafts</li><li>🎮 Run a Live Game from the Live Game tab for a fun class review</li></ul></div>';
    }
    var j = L.joined.map(function (k) {
      return '<article class="cr-card"><div class="cr-card-top"><h3>' + E(k.name) + '</h3><span class="cr-chip">' + E(k.subject || 'Class') + '</span></div><div class="cr-sub">Teacher: ' + E(k.teacherName) + '</div>' +
        '<div class="cr-stats"><div><b>' + k.todo + '</b><span>to do</span></div><div class="' + (k.missing ? 'cr-bad' : '') + '"><b>' + k.missing + '</b><span>missing</span></div><div><b>' + (k.nextDue ? E(rel(k.nextDue)) : '—') + '</b><span>next due</span></div></div>' +
        '<button class="btn btn-primary" data-cr="open" data-id="' + k.id + '">Open class</button></article>';
    }).join('');
    return '<header class="cr-hero"><div><div class="cr-eyebrow">MY CLASSES</div><h2>Your classes</h2><p>Join your teacher\'s class with the code they gave you. Your assignments, grades and a Tutor that coaches (without just giving answers) all live here.</p></div>' +
      '<form class="cr-join" data-cr="join"><label>Class code</label><div class="cr-crow"><input name="code" placeholder="A1B2C3-K7P" maxlength="12" autocomplete="off" required><button class="btn btn-primary" type="submit">Join class</button></div></form></header>' +
      (j ? '<div class="cr-grid">' + j + '</div>' : '<div class="cr-empty"><div>🎒</div><h3>You haven\'t joined a class yet</h3><p>Ask your teacher for the class code, then enter it above.</p></div>') +
      '<div class="cr-note">Are you a teacher? <button class="cr-link" data-cr="be-teacher">Switch this account to Teacher</button></div>';
  }
  function tabsHtml() {
    var t = isT() ? [['stream', '📣 Stream'], ['work', '📝 Classwork'], ['people', '👥 People'], ['grades', '📊 Grades'], ['insights', '💡 Insights']] : [['stream', '📣 Stream'], ['work', '📝 Classwork'], ['grades', '📊 My grades']];
    return '<div class="cr-tabs" role="tablist">' + t.map(function (x) { return '<button class="' + (CR.tab === x[0] && !CR.aid ? 'on' : '') + '" data-cr="tab" data-t="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
  }
  function classHtml() {
    var k = CR.cur, t = k.role === 'teacher';
    var head = '<div class="cr-back"><button class="cr-link" data-cr="home">← All classes</button></div><header class="cr-chead"><div><h2>' + E(k.name) + '</h2><div class="cr-sub">' + E(k.subject || '') + (k.section ? ' · ' + E(k.section) : '') + (t ? '' : ' · Teacher: ' + E(k.teacherName)) + '</div></div>' +
      (t ? '<div class="cr-code big">Join code <b>' + E(k.code) + '</b> <button class="cr-mini" data-cr="copy" data-v="' + E(k.code) + '">Copy</button></div>' : '<button class="cr-mini danger" data-cr="leave">Leave class</button>') + '</header>';
    var body;
    if (CR.aid) body = assignmentHtml(k, t);
    else if (CR.tab === 'work') body = workHtml(k, t);
    else if (CR.tab === 'people' && t) body = peopleHtml(k);
    else if (CR.tab === 'grades') body = t ? gradesHtml(k) : myGradesHtml(k);
    else if (CR.tab === 'insights' && t) body = insightsHtml(k);
    else body = streamHtml(k, t);
    return head + tabsHtml() + '<div class="cr-body">' + body + '</div>';
  }
  /* ---- stream ---- */
  function streamHtml(k, t) {
    var post = t ? '<form class="cr-post" data-cr="post"><textarea name="text" rows="2" maxlength="2000" placeholder="Announce something to your class…" required></textarea><button class="btn btn-primary" type="submit">Post</button></form>' : '';
    var soon = k.assignments.filter(function (a) { return t ? true : (a.status === 'assigned' || a.status === 'missing'); }).sort(function (a, b) { return (a.due || 9e15) - (b.due || 9e15); }).slice(0, 4);
    var up = soon.length ? '<aside class="cr-up"><h4>' + (t ? 'Recent assignments' : 'Up next') + '</h4>' + soon.map(function (a) { return '<button data-cr="open-a" data-a="' + a.id + '"><b>' + E(a.title) + '</b><span class="' + (a.status === 'missing' ? 'cr-bad' : '') + '">' + (a.due ? E(fmtDue(a.due)) : 'No due date') + '</span></button>'; }).join('') + '</aside>' : '';
    var posts = k.posts.length ? k.posts.map(function (p) { return '<article class="cr-post-i"><div class="cr-post-h"><b>📣 Announcement</b><span>' + ago(p.at) + '</span>' + (t ? '<button class="cr-mini danger" data-cr="del-post" data-p="' + p.id + '">Delete</button>' : '') + '</div><p>' + E(p.text).replace(/\n/g, '<br>') + '</p></article>'; }).join('') : '<div class="cr-empty sm"><p>' + (t ? 'Nothing posted yet. Welcome your class!' : 'No announcements yet.') + '</p></div>';
    return '<div class="cr-streamgrid"><div>' + post + posts + '</div>' + up + '</div>';
  }
  /* ---- classwork ---- */
  function statusChip(a) {
    var m = { assigned: ['To do', 'todo'], missing: ['Missing', 'bad'], submitted: ['Turned in', 'ok'], graded: ['Graded', 'ok'] }[a.status] || ['', ''];
    return '<span class="cr-st ' + m[1] + '">' + m[0] + '</span>';
  }
  function workHtml(k, t) {
    var bar = t ? '<div class="cr-actions"><button class="btn btn-primary" data-cr="new-a">＋ New assignment</button></div>' : '';
    var list = k.assignments.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (!list.length) return bar + '<div class="cr-empty sm"><p>' + (t ? 'No assignments yet. Create a written task or an auto-graded quiz.' : 'Nothing assigned yet.') + '</p></div>';
    return bar + '<div class="cr-list">' + list.map(function (a) {
      var subs = t ? Object.keys(a.submissions || {}).length : 0;
      return '<button class="cr-item" data-cr="open-a" data-a="' + a.id + '"><span class="cr-ic">' + (a.type === 'quiz' ? '⚡' : '📝') + '</span><span class="cr-it"><b>' + E(a.title) + '</b><small>' + (a.type === 'quiz' ? 'Auto-graded quiz · ' + a.questions.length + ' questions · ' : 'Written task · ') + a.points + ' pts · ' + E(fmtDue(a.due)) + '</small></span>' +
        (t ? '<span class="cr-st ok">' + subs + '/' + k.students.length + ' turned in</span>' : statusChip(a) + (a.submission && a.submission.status === 'graded' ? '<span class="cr-score">' + a.submission.score + '/' + a.points + '</span>' : '')) + '</button>';
    }).join('') + '</div>';
  }
  function findA(k, id) { return k.assignments.filter(function (a) { return a.id === id; })[0]; }
  function linksHtml(a) { return a.links && a.links.length ? '<div class="cr-links">' + a.links.map(function (l) { return '<a href="' + E(l.url) + '" target="_blank" rel="noopener noreferrer">🔗 ' + E(l.label) + '</a>'; }).join('') + '</div>' : ''; }
  function assignmentHtml(k, t) {
    var a = findA(k, CR.aid); if (!a) { CR.aid = null; return workHtml(k, t); }
    var head = '<div class="cr-back"><button class="cr-link" data-cr="back-work">← Classwork</button></div><div class="cr-ahead"><div><h3>' + (a.type === 'quiz' ? '⚡ ' : '📝 ') + E(a.title) + '</h3><div class="cr-sub">' + a.points + ' points · Due ' + E(fmtDue(a.due)) + (a.due ? ' (' + rel(a.due) + ')' : '') + '</div></div>' +
      (t ? '<div><button class="cr-mini" data-cr="edit-a" data-a="' + a.id + '">Edit</button> <button class="cr-mini danger" data-cr="del-a" data-a="' + a.id + '">Delete</button></div>' : statusChip(a)) + '</div>' +
      (a.instructions ? '<div class="cr-instr">' + E(a.instructions).replace(/\n/g, '<br>') + '</div>' : '') + linksHtml(a);
    if (t) return head + teacherSubs(k, a);
    return head + studentWork(k, a);
  }
  function teacherSubs(k, a) {
    var rows = k.students.map(function (s) {
      var sub = (a.submissions || {})[s.id];
      var st = sub ? (sub.status === 'graded' ? 'Graded ' + sub.score + '/' + a.points : 'Needs grading') : (a.due && a.due < Date.now() ? 'Missing' : 'Not turned in');
      return '<tr><td class="cr-gbn">' + avHtml(s, 'sm') + ' ' + E(s.name) + '</td><td class="' + (sub ? (sub.late ? 'cr-warn' : 'cr-okc') : (st === 'Missing' ? 'cr-bad' : '')) + '">' + st + (sub && sub.late ? ' (late)' : '') + '</td><td>' + (sub ? '<button class="cr-mini" data-cr="grade-open" data-a="' + a.id + '" data-s="' + s.id + '">' + (a.type === 'quiz' ? 'View' : 'Review & grade') + '</button>' : '') + '</td></tr>';
    }).join('');
    var sel = CR.gradeSel && CR.gradeSel.a === a.id ? gradePanel(k, a, CR.gradeSel.s) : '';
    return '<table class="cr-table"><thead><tr><th>Student</th><th>Status</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="3">No students yet.</td></tr>') + '</tbody></table>' + sel;
  }
  function gradePanel(k, a, sid) {
    var sub = (a.submissions || {})[sid], s = k.students.filter(function (x) { return x.id === sid; })[0]; if (!sub || !s) return '';
    var body = '';
    if (a.type === 'quiz') {
      body = '<p><b>' + sub.correct + ' / ' + sub.total + '</b> correct</p>' + a.questions.map(function (q, i) { var ok = sub.answers[i] === q.correct; return '<div class="cr-qr ' + (ok ? 'ok' : 'no') + '"><b>' + (i + 1) + '. ' + E(q.q) + '</b><div>Answer: ' + E(sub.answers[i] >= 0 ? q.options[sub.answers[i]] : '(blank)') + (ok ? '' : ' · Correct: ' + E(q.options[q.correct])) + '</div></div>'; }).join('') + '<button class="cr-mini danger" data-cr="return-a" data-a="' + a.id + '" data-s="' + sid + '">Let them retake</button>';
    } else {
      body = '<div class="cr-sub">Turned in ' + ago(sub.submittedAt) + (sub.late ? ' · LATE' : '') + '</div><div class="cr-answer">' + E(sub.text || '(no text)').replace(/\n/g, '<br>') + '</div>' + (sub.link ? '<div class="cr-links"><a href="' + E(sub.link) + '" target="_blank" rel="noopener noreferrer">🔗 Student link</a></div>' : '') +
        '<form data-cr="grade" data-a="' + a.id + '" data-s="' + sid + '"><div class="cr-crow"><label>Score <input name="score" type="number" min="0" max="' + a.points + '" step="0.5" value="' + (sub.status === 'graded' ? sub.score : '') + '" required> / ' + a.points + '</label></div><textarea name="feedback" rows="3" maxlength="1500" placeholder="Feedback for ' + E(s.name) + '">' + E(sub.feedback || '') + '</textarea><div class="cr-crow"><button class="btn btn-primary" type="submit">Save grade</button><button type="button" class="cr-mini" data-cr="tutor-feedback" data-a="' + a.id + '" data-s="' + sid + '">🤖 Draft feedback with Tutor</button></div></form>';
    }
    return '<section class="cr-gradepanel"><h4>' + E(s.name) + '</h4>' + body + '</section>';
  }
  function studentWork(k, a) {
    var sub = a.submission;
    if (a.type === 'quiz') {
      if (sub) {
        return '<section class="cr-result"><div class="cr-bigx">' + sub.correct + ' / ' + sub.total + '</div><div>You scored <b>' + sub.score + ' / ' + a.points + '</b> (' + pct(sub.correct, sub.total) + '%)</div></section>' + a.questions.map(function (q, i) {
          var ok = sub.answers[i] === q.correct;
          return '<div class="cr-qr ' + (ok ? 'ok' : 'no') + '"><b>' + (i + 1) + '. ' + E(q.q) + '</b><div>Your answer: ' + E(sub.answers[i] >= 0 ? q.options[sub.answers[i]] : '(blank)') + '</div>' + (ok ? '' : '<div>Correct answer: <b>' + E(q.options[q.correct]) + '</b></div>') + (q.explanation ? '<small>' + E(q.explanation) + '</small>' : '') + '</div>';
        }).join('');
      }
      return '<form data-cr="quiz" data-a="' + a.id + '">' + a.questions.map(function (q, i) {
        return '<fieldset class="cr-q"><legend>' + (i + 1) + '. ' + E(q.q) + '</legend>' + q.options.map(function (o, j) { return '<label><input type="radio" name="q' + i + '" value="' + j + '"> <span>' + E(o) + '</span></label>'; }).join('') + '</fieldset>';
      }).join('') + '<div class="cr-warnnote">You get one attempt. Ask the Tutor on the right to explain ideas first, then take the quiz.</div><button class="btn btn-primary" type="submit">Turn in quiz</button></form>';
    }
    var done = sub ? '<section class="cr-result"><div>✅ Turned in ' + ago(sub.submittedAt) + (sub.late ? ' (late)' : '') + '</div>' + (sub.status === 'graded' ? '<div class="cr-bigx">' + sub.score + ' / ' + a.points + '</div>' + (sub.feedback ? '<div class="cr-fb"><b>Teacher feedback</b><br>' + E(sub.feedback).replace(/\n/g, '<br>') + '</div>' : '') : '<div class="cr-sub">Waiting for your teacher to grade it.</div>') + '</section>' : '';
    if (sub && sub.status === 'graded') return done + '<div class="cr-answer">' + E(sub.text).replace(/\n/g, '<br>') + '</div>';
    return done + '<form data-cr="turnin" data-a="' + a.id + '"><label class="cr-lab">Your work</label><textarea name="text" rows="9" maxlength="8000" placeholder="Type your answer here…">' + E(sub ? sub.text : '') + '</textarea><label class="cr-lab">Link (optional)</label><input name="link" placeholder="https://docs.google.com/…" value="' + E(sub && sub.link || '') + '"><button class="btn btn-primary" type="submit">' + (sub ? 'Resubmit' : 'Turn in') + '</button></form>';
  }
  /* ---- people / grades / insights ---- */
  function avHtml(st, size) {
    var art = '<span class="cr-av-fb">👤</span>';
    try {
      var ling = st.avatar && st.avatar.indexling ? cosmeticById(st.avatar.indexling) : null;
      var skin = st.avatar && st.avatar.skin && typeof skinById === 'function' ? skinById(st.avatar.skin) : null;
      if (ling) art = indexlingArtHtml(ling, true, skin, null);
    } catch (e) { }
    var fs = ''; try { fs = typeof indexlingFrameStyle === 'function' ? indexlingFrameStyle((st.avatar && st.avatar.frame) || 'default') : ''; } catch (e) { }
    return '<span class="cr-av ' + (size || '') + '" style="' + fs + '">' + art + '</span>';
  }
  function sstats(k, s) {
    var earned = 0, poss = 0, missing = 0, done = 0, review = 0;
    k.assignments.forEach(function (a) { var sub = (a.submissions || {})[s.id]; if (sub) { done++; if (sub.status === 'graded') { earned += sub.score; poss += a.points; } else review++; } else if (a.due && a.due < Date.now()) missing++; });
    return { avg: poss ? Math.round(earned / poss * 100) : null, missing: missing, done: done, review: review, total: k.assignments.length };
  }
  function peopleHtml(k) {
    var cards = k.students.map(function (s) {
      var st = sstats(k, s), tone = st.missing >= 2 || (st.avg != null && st.avg < 65) ? 'warn' : (st.avg != null && st.avg >= 90 ? 'star' : '');
      var open = (s.id in CR.statOv) ? CR.statOv[s.id] : CR.showStats;
      return '<article class="cr-stu ' + tone + (open ? ' cr-open' : ' cr-closed') + '" data-cr="stu" data-s="' + s.id + '" tabindex="0"><button class="cr-chev" data-cr="stu-stats" data-s="' + s.id + '" aria-expanded="' + (open ? 'true' : 'false') + '" aria-label="' + (open ? 'Hide' : 'Show') + ' stats for ' + E(s.name) + '" title="' + (open ? 'Hide' : 'Show') + ' stats"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' + avHtml(s) + '<b class="cr-sn">' + E(s.name) + '</b><span class="cr-lv">Lv ' + (s.level || 1) + ' · ' + (s.xp || 0).toLocaleString() + ' XP</span>' +
        '<div class="cr-sm"><div><b>' + (st.avg == null ? '–' : st.avg + '%') + '</b><small>avg</small></div><div class="' + (st.missing ? 'cr-bad' : '') + '"><b>' + st.missing + '</b><small>missing</small></div><div><b>' + st.done + '/' + st.total + '</b><small>done</small></div></div>' +
        (st.review ? '<span class="cr-st todo">' + st.review + ' to grade</span>' : '') + '</article>';
    }).join('');
    var sel = CR.stuSel ? studentPanel(k, CR.stuSel) : '';
    var tools = '<div class="cr-tools"><div class="cr-tool"><h5>🎲 Random student</h5><div id="cr-pick" class="cr-pickbox">?</div><button class="cr-mini" data-cr="pick">Pick one</button></div>' +
      '<div class="cr-tool"><h5>👥 Make groups</h5><div class="cr-crow"><select id="cr-gsize"><option value="2">Pairs</option><option value="3" selected>Groups of 3</option><option value="4">Groups of 4</option><option value="5">Groups of 5</option></select><button class="cr-mini" data-cr="groups">Shuffle</button></div></div></div><div id="cr-groups">' + (CR.groups || '') + '</div>';
    return '<div class="cr-people"><section class="cr-invite"><h4>Invite students</h4><p>Give your students this code. They choose <b>My Classes</b> and enter it.</p><div class="cr-codebig">' + E(k.code) + '</div><button class="btn btn-primary" data-cr="copy" data-v="' + E(k.code) + '">Copy code</button>' + (k.students.length ? tools : '') + '</section>' +
      '<section><div class="cr-sh"><h4>Students (' + k.students.length + ')</h4><button class="cr-switch' + (CR.showStats ? ' on' : '') + '" data-cr="toggle-stats" role="switch" aria-checked="' + (CR.showStats ? 'true' : 'false') + '"><span class="cr-knob"></span><span class="cr-swl">Show stats</span></button></div>' + (k.students.length ? '<div class="cr-stuscroll"><div class="cr-stugrid">' + cards + '</div></div>' : '<div class="cr-empty sm"><p>No students yet. Share the code to get started.</p></div>') + sel + '</section></div>' +
      '<div class="cr-actions"><button class="cr-mini danger" data-cr="del-class">Delete this class</button></div>';
  }
  function studentPanel(k, sid) {
    var s = k.students.filter(function (x) { return x.id === sid; })[0]; if (!s) return '';
    var st = sstats(k, s);
    var rows = k.assignments.map(function (a) { var sub = (a.submissions || {})[s.id]; var txt = sub ? (sub.status === 'graded' ? sub.score + ' / ' + a.points : 'Needs grading') : (a.due && a.due < Date.now() ? 'Missing' : 'Not turned in'); return '<tr><td><button class="cr-link" data-cr="open-a" data-a="' + a.id + '">' + E(a.title) + '</button></td><td class="' + (txt === 'Missing' ? 'cr-bad' : '') + '">' + txt + '</td></tr>'; }).join('');
    return '<section class="cr-gradepanel"><div class="cr-sp-h">' + avHtml(s, 'lg') + '<div><h4>' + E(s.name) + '</h4><div class="cr-sub">Level ' + (s.level || 1) + ' · joined ' + ago(s.joinedAt) + ' · average ' + (st.avg == null ? '–' : st.avg + '%') + '</div></div><button class="cr-mini" data-cr="stu-close">✕</button></div>' +
      '<table class="cr-table"><thead><tr><th>Assignment</th><th>Status</th></tr></thead><tbody>' + (rows || '<tr><td colspan="2">No assignments yet.</td></tr>') + '</tbody></table>' +
      '<div class="cr-crow" style="margin-top:10px"><button class="cr-mini" data-cr="tutor-stu" data-s="' + s.id + '">🤖 Ask Tutor how to support ' + E(s.name.split(' ')[0]) + '</button><button class="cr-mini danger" data-cr="remove" data-s="' + s.id + '">Remove from class</button></div></section>';
  }
  function stats(k) {
    var rows = k.students.map(function (s) {
      var earned = 0, poss = 0, missing = 0, done = 0;
      k.assignments.forEach(function (a) { var sub = (a.submissions || {})[s.id]; if (sub) { done++; if (sub.status === 'graded') { earned += sub.score; poss += a.points; } } else if (a.due && a.due < Date.now()) { missing++; poss += 0; } });
      return { s: s, avg: poss ? Math.round(earned / poss * 100) : null, missing: missing, done: done };
    });
    return rows;
  }
  function gradesHtml(k) {
    if (!k.assignments.length || !k.students.length) return '<div class="cr-empty sm"><p>Grades show up once you have students and assignments.</p></div>';
    var rows = stats(k);
    var head = '<tr><th>Student</th>' + k.assignments.map(function (a) { return '<th><button class="cr-link" data-cr="open-a" data-a="' + a.id + '">' + E(a.title.slice(0, 18)) + '</button><small>/' + a.points + '</small></th>'; }).join('') + '<th>Avg</th></tr>';
    var body = rows.map(function (r) {
      return '<tr><td class="cr-gbn">' + avHtml(r.s, 'sm') + ' ' + E(r.s.name) + '</td>' + k.assignments.map(function (a) { var sub = (a.submissions || {})[r.s.id]; return '<td class="' + (sub ? (sub.status === 'graded' ? '' : 'cr-warn') : (a.due && a.due < Date.now() ? 'cr-bad' : '')) + '">' + (sub ? (sub.status === 'graded' ? sub.score : '✎') : (a.due && a.due < Date.now() ? 'M' : '–')) + '</td>'; }).join('') + '<td><b>' + (r.avg == null ? '–' : r.avg + '%') + '</b></td></tr>';
    }).join('');
    return '<div class="cr-actions"><button class="btn btn-ghost" data-cr="csv">⬇ Export CSV</button><span class="cr-sub">M = missing · ✎ = needs grading</span></div><div class="cr-tablewrap"><table class="cr-table cr-gb"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }
  function myGradesHtml(k) {
    var earned = 0, poss = 0;
    var rows = k.assignments.map(function (a) { var s = a.submission; if (s && s.status === 'graded') { earned += s.score; poss += a.points; } return '<tr><td><button class="cr-link" data-cr="open-a" data-a="' + a.id + '">' + E(a.title) + '</button></td><td>' + statusChip(a) + '</td><td>' + (s && s.status === 'graded' ? s.score + ' / ' + a.points : '–') + '</td></tr>'; }).join('');
    return '<div class="cr-result"><div class="cr-bigx">' + (poss ? Math.round(earned / poss * 100) + '%' : '–') + '</div><div>Current class grade (graded work only)</div></div><table class="cr-table"><thead><tr><th>Assignment</th><th>Status</th><th>Score</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3">Nothing assigned yet.</td></tr>') + '</tbody></table>';
  }
  function insightsHtml(k) {
    if (!k.students.length || !k.assignments.length) return '<div class="cr-empty sm"><p>Insights appear once students turn work in.</p></div>';
    var rows = stats(k), graded = rows.filter(function (r) { return r.avg != null; });
    var classAvg = graded.length ? Math.round(graded.reduce(function (n, r) { return n + r.avg; }, 0) / graded.length) : null;
    var totalSubs = k.assignments.reduce(function (n, a) { return n + Object.keys(a.submissions || {}).length; }, 0);
    var comp = pct(totalSubs, k.students.length * k.assignments.length);
    var attn = rows.filter(function (r) { return r.missing >= 2 || (r.avg != null && r.avg < 65); });
    var per = k.assignments.map(function (a) { var n = Object.keys(a.submissions || {}).length; return '<div class="cr-bar2"><span>' + E(a.title) + '</span><div><i style="width:' + pct(n, k.students.length) + '%"></i></div><b>' + n + '/' + k.students.length + '</b></div>'; }).join('');
    var hard = [];
    k.assignments.filter(function (a) { return a.type === 'quiz'; }).forEach(function (a) {
      var subs = Object.keys(a.submissions || {}).map(function (x) { return a.submissions[x]; }); if (!subs.length) return;
      a.questions.forEach(function (q, i) { var c = subs.filter(function (s) { return s.answers && s.answers[i] === q.correct; }).length; hard.push({ q: q.q, a: a.title, p: pct(c, subs.length), n: subs.length }); });
    });
    hard.sort(function (x, y) { return x.p - y.p; });
    return '<div class="cr-kpis"><div><b>' + (classAvg == null ? '–' : classAvg + '%') + '</b><span>class average</span></div><div><b>' + comp + '%</b><span>work turned in</span></div><div><b>' + attn.length + '</b><span>need attention</span></div></div>' +
      '<section class="cr-ins"><h4>Turn-in rate by assignment</h4>' + per + '</section>' +
      '<section class="cr-ins"><h4>Students who may need help</h4>' + (attn.length ? attn.map(function (r) { return '<div class="cr-person">' + avHtml(r.s, 'sm') + '<span>' + E(r.s.name) + '</span><small>' + r.missing + ' missing · avg ' + (r.avg == null ? '–' : r.avg + '%') + '</small></div>'; }).join('') + '<button class="cr-mini" data-cr="tutor-attn">🤖 Ask Tutor for support ideas</button>' : '<p class="cr-sub">Everyone is on track. 🎉</p>') + '</section>' +
      '<section class="cr-ins"><h4>Hardest quiz questions</h4>' + (hard.length ? hard.slice(0, 5).map(function (h) { return '<div class="cr-hq"><b>' + h.p + '% correct</b> <span>' + E(h.q) + '</span><small>' + E(h.a) + ' · ' + h.n + ' students</small></div>'; }).join('') + '<button class="cr-mini" data-cr="tutor-reteach">🤖 Plan a reteach with Tutor</button>' : '<p class="cr-sub">Hardest questions show after students take a quiz.</p>') + '</section>';
  }

  /* ---------------- assignment editor ---------------- */
  function blankQ() { return { q: '', options: ['', '', '', ''], correct: 0, explanation: '' }; }
  function editorHtml() {
    var a = CR.editing, quiz = a.type === 'quiz';
    var sets = []; try { sets = (state.studySets || []).filter(function (s) { return s.type === 'quiz' && s.questions && s.questions.length; }); } catch (e) { }
    return '<div class="cr-modal" data-cr="modal-bg"><div class="cr-editor" role="dialog" aria-modal="true"><div class="cr-ed-h"><h3>' + (a.id ? 'Edit assignment' : 'New assignment') + '</h3><button class="cr-mini" data-cr="ed-close">✕</button></div><form data-cr="save-a">' +
      '<div class="cr-seg"><label class="' + (!quiz ? 'on' : '') + '"><input type="radio" name="type" value="task" ' + (!quiz ? 'checked' : '') + '> 📝 Written task</label><label class="' + (quiz ? 'on' : '') + '"><input type="radio" name="type" value="quiz" ' + (quiz ? 'checked' : '') + '> ⚡ Auto-graded quiz</label></div>' +
      '<label class="cr-lab">Title</label><input name="title" maxlength="120" required value="' + E(a.title) + '">' +
      '<label class="cr-lab">Instructions</label><textarea name="instructions" rows="5" maxlength="8000" placeholder="What should students do?">' + E(a.instructions) + '</textarea>' +
      '<div class="cr-crow"><button type="button" class="cr-mini" data-cr="ed-tutor">🤖 Draft with Tutor</button><label class="cr-mini cr-file">📄 Import a .txt/.md file<input type="file" accept=".txt,.md,.csv,text/plain" data-cr="ed-file" hidden></label></div>' +
      '<div class="cr-crow"><label class="cr-lab">Due<input name="due" type="datetime-local" value="' + inputDt(a.due) + '"></label><label class="cr-lab">Points<input name="points" type="number" min="0" max="1000" value="' + a.points + '"></label></div>' +
      '<label class="cr-lab">Links (optional)</label><div id="cr-links">' + (a.links.length ? a.links : [{ label: '', url: '' }]).map(linkRow).join('') + '</div><button type="button" class="cr-mini" data-cr="add-link">＋ Add link</button>' +
      (quiz ? '<div class="cr-qed"><h4>Quiz questions (' + a.questions.length + ')</h4><div class="cr-ai"><input id="cr-ai-topic" placeholder="Topic for AI questions, e.g. Photosynthesis" maxlength="120"><select id="cr-ai-n"><option>5</option><option selected>8</option><option>10</option><option>15</option></select><button type="button" class="btn btn-ghost" data-cr="ai-q">✨ Generate with AI</button></div>' +
        (sets.length ? '<div class="cr-ai"><select id="cr-set"><option value="">Import from one of my quiz study sets…</option>' + sets.map(function (s) { return '<option value="' + s.id + '">' + E(s.title || 'Quiz') + ' (' + s.questions.length + ')</option>'; }).join('') + '</select><button type="button" class="cr-mini" data-cr="import-set">Import</button></div>' : '') +
        a.questions.map(qRow).join('') + '<button type="button" class="cr-mini" data-cr="add-q">＋ Add question</button></div>' : '') +
      '<div class="cr-ed-err" id="cr-ed-err"></div><div class="cr-crow cr-end"><button type="button" class="btn btn-ghost" data-cr="ed-close">Cancel</button><button class="btn btn-primary" type="submit">' + (a.id ? 'Save changes' : 'Assign to class') + '</button></div></form></div></div>';
  }
  function linkRow(l) { return '<div class="cr-crow cr-link-row"><input class="cr-l-label" placeholder="Label" maxlength="80" value="' + E(l.label) + '"><input class="cr-l-url" placeholder="https://…" maxlength="500" value="' + E(l.url) + '"></div>'; }
  function qRow(q, i) {
    return '<div class="cr-qrow" data-i="' + i + '"><div class="cr-qh"><b>Q' + (i + 1) + '</b><button type="button" class="cr-mini danger" data-cr="del-q" data-i="' + i + '">Remove</button></div><input class="cr-q-q" placeholder="Question" maxlength="500" value="' + E(q.q) + '">' +
      q.options.map(function (o, j) { return '<label class="cr-opt"><input type="radio" name="cq' + i + '" class="cr-q-c" value="' + j + '" ' + (q.correct === j ? 'checked' : '') + '><input class="cr-q-o" placeholder="Option ' + 'ABCD'[j] + '" maxlength="200" value="' + E(o) + '"></label>'; }).join('') +
      '<input class="cr-q-e" placeholder="Explanation shown after the quiz (optional)" maxlength="500" value="' + E(q.explanation) + '"></div>';
  }
  function readEditor() {
    var f = $('.cr-editor form'); if (!f) return;
    var a = CR.editing;
    a.type = (f.querySelector('input[name=type]:checked') || {}).value || 'task';
    a.title = f.title.value; a.instructions = f.instructions.value; a.points = Number(f.points.value) || 0;
    a.due = f.due.value ? new Date(f.due.value).getTime() : 0;
    a.links = Array.prototype.map.call(f.querySelectorAll('.cr-link-row'), function (r) { return { label: r.querySelector('.cr-l-label').value, url: r.querySelector('.cr-l-url').value }; }).filter(function (l) { return l.url.trim(); });
    a.questions = Array.prototype.map.call(f.querySelectorAll('.cr-qrow'), function (r) {
      var c = r.querySelector('.cr-q-c:checked');
      return { q: r.querySelector('.cr-q-q').value, options: Array.prototype.map.call(r.querySelectorAll('.cr-q-o'), function (o) { return o.value; }), correct: c ? Number(c.value) : 0, explanation: r.querySelector('.cr-q-e').value };
    });
  }

  /* ---------------- Tutor side panel ---------------- */
  function tutorContext() {
    var k = CR.cur, t = isT(), a = k && CR.aid ? findA(k, CR.aid) : null;
    var s = 'You are the Index Class Tutor, shown beside a classroom page. ';
    if (t) {
      s += 'You are helping a TEACHER' + (k ? ' with their class "' + k.name + '"' + (k.subject ? ' (' + k.subject + ')' : '') + '.' : '.') + ' Help plan lessons, write clear assignment instructions, rubrics, quiz questions with answer keys, differentiate for different learners, and draft kind, specific feedback. Be concise and practical. Use short headings or bullet lists when drafting materials so the teacher can paste them.';
      if (k) s += ' The class has ' + k.students.length + ' students and ' + k.assignments.length + ' assignments.';
    } else {
      s += 'You are coaching a STUDENT' + (k ? ' in the class "' + k.name + '"' + (k.subject ? ' (' + k.subject + ')' : '') + '.' : '.') + ' Teach and guide: ask questions, give hints, explain concepts, give worked examples on DIFFERENT problems than the assignment. NEVER give the final answer to a graded assignment or quiz question, and never write the student\'s work for them; if they ask, explain why and offer a hint instead. Be warm and brief.';
    }
    if (a) {
      s += ' Current assignment: "' + a.title + '" (' + (a.type === 'quiz' ? 'quiz' : 'written task') + '). Instructions: ' + (a.instructions || 'none').slice(0, 1500);
      if (a.type === 'quiz' && !t) s += ' The quiz covers: ' + (a.topic || a.title) + '. Do not reveal or confirm answers to quiz questions.';
    }
    return s;
  }
  var CHIPS_T = [['Draft an assignment', 'Draft a clear assignment (title, instructions, and a short rubric) for my class on: '], ['Write quiz questions', 'Write 6 multiple-choice questions with answer key and one-line explanations on: '], ['Differentiate', 'Give me three ways to differentiate this lesson for struggling, on-level and advanced learners: '], ['Exit ticket', 'Write a 3-question exit ticket for today\'s lesson on: ']];
  var CHIPS_S = [['Explain this assignment', 'Explain in simple words what this assignment is asking me to do.'], ['Give me a hint', 'Give me a hint to get started, without giving the answer.'], ['Quiz me', 'Ask me one practice question on this topic (not from the assignment) and check my answer.'], ['Study plan', 'Help me make a short plan to finish my due work this week.']];
  function tutorHtml() {
    var T = CR.tutor, t = isT(), k = CR.cur, asg = k && CR.aid ? findA(k, CR.aid) : null;
    var chips = (t ? CHIPS_T : CHIPS_S).map(function (c) { return '<button data-cr="chip" data-v="' + E(c[1]) + '">' + c[0] + '</button>'; }).join('');
    var ctx = asg ? '📌 ' + asg.title : (k ? '🏫 ' + k.name : (t ? 'No class open' : 'All classes'));
    var msgs = T.msgs.map(function (m, i) {
      var body = m.role === 'assistant' ? (typeof formatTutorText === 'function' ? formatTutorText(m.text) : E(m.text).replace(/\n/g, '<br>')) : E(m.text).replace(/\n/g, '<br>');
      var acts = '';
      if (m.role === 'assistant' && m.text) {
        acts = '<div class="cr-macts"><button class="cr-mini" data-cr="copy-reply" data-i="' + i + '">Copy</button>' + (t && CR.editing ? '<button class="cr-mini" data-cr="use-reply" data-i="' + i + '">Use in assignment</button>' : '') + (t && k && !CR.editing ? '<button class="cr-mini" data-cr="post-reply" data-i="' + i + '">Post to stream</button>' : '') + '</div>';
      }
      return '<div class="cr-cmsg ' + m.role + '">' + (m.role === 'assistant' ? '<span class="cr-bot">✨</span>' : '') + '<div class="cr-bub"><div>' + (m.text ? body : '<span class="cr-dots"><i></i><i></i><i></i></span>') + '</div>' + acts + '</div></div>';
    }).join('');
    var hi = '<div class="cr-tutor-hi"><div class="cr-hi-ic">' + (t ? '🍎' : '🎒') + '</div><b>' + (t ? 'Your teaching assistant' : 'Your class tutor') + '</b><p>' + (t ? 'Plan lessons, write assignments, rubrics and quizzes, or draft feedback. Open an assignment and I will know what it is about.' : 'Ask me anything about your class. I will coach you with hints and explanations, not hand over answers.') + '</p></div>';
    return '<aside class="cr-tutor' + (T.open ? ' open' : '') + '"><div class="cr-tutor-h"><div><b>🤖 ' + (t ? 'Teaching assistant' : 'Class Tutor') + '</b><small>' + E(ctx) + '</small></div><div class="cr-th-b">' + (T.msgs.length ? '<button class="cr-mini" data-cr="new-chat" title="Start a new chat">New</button>' : '') + '<button class="cr-mini" data-cr="tutor-toggle" aria-label="Close tutor">✕</button></div></div>' +
      '<div class="cr-chat-log">' + (msgs || hi) + '</div>' +
      '<div class="cr-chips">' + chips + '</div><form class="cr-chat-in" data-cr="chat"><textarea name="m" rows="2" placeholder="' + (t ? 'Ask for lesson ideas, a rubric, feedback…' : 'Ask for help…') + '" maxlength="2000"></textarea><button class="btn btn-primary" type="submit"' + (T.busy ? ' disabled' : '') + '>Send</button></form></aside>';
  }
  function sendTutor(text) {
    var T = CR.tutor; text = String(text || '').trim(); if (!text || T.busy) return;
    T.msgs.push({ role: 'user', text: text }); var reply = { role: 'assistant', text: '' }; T.msgs.push(reply); T.busy = true; render();
    var hist = T.msgs.slice(0, -1).slice(-10).map(function (m) { return { role: m.role, content: m.text }; });
    runLocalAi(hist, { intent: 'tutor', classroom: { persona: isT() ? 'teacher' : 'student', text: tutorContext() }, onChunk: function (c) { reply.text += c; var el = $('.cr-cmsg.assistant:last-child > div'); if (el) { el.innerHTML = typeof formatTutorText === 'function' ? formatTutorText(reply.text) : E(reply.text); var log = $('.cr-chat-log'); if (log) log.scrollTop = log.scrollHeight; } } })
      .then(function (r) { var full = typeof r === 'string' ? r : (r && (r.text || r.content || r.reply)) || ''; if (full && !reply.text) reply.text = full; if (!reply.text) reply.text = 'Sorry, I could not answer that. Please try again.'; })
      .catch(function (e) { reply.text = '⚠️ ' + (e && e.message || 'The Tutor could not answer right now.'); })
      .then(function () { T.busy = false; render(); });
  }

  /* ---------------- events ---------------- */
  function guard(p) { return p.catch(function (e) { CR.err = e.message; render(); }); }
  function onClick(e) {
    var el = e.target.closest('[data-cr]'); if (!el) return; var a = el.getAttribute('data-cr');
    if (el.tagName === 'FORM' || el.tagName === 'INPUT' && el.type === 'file') return;
    if (a === 'modal-bg') { if (e.target === el) { CR.editing = null; render(); } return; }
    var id = el.getAttribute('data-id'), aid = el.getAttribute('data-a'), sid = el.getAttribute('data-s');
    var k = CR.cur;
    switch (a) {
      case 'open': CR.stuSel = null; CR.groups = ''; CR.tab = 'stream'; CR.aid = null; CR.gradeSel = null; guard(loadClass(id).then(render)); break;
      case 'home': CR.cur = null; CR.aid = null; guard(loadList().then(render)); break;
      case 'tab': CR.tab = el.getAttribute('data-t'); CR.aid = null; render(); break;
      case 'open-a': CR.aid = aid; CR.tab = 'work'; CR.gradeSel = null; render(); break;
      case 'back-work': CR.aid = null; CR.tab = 'work'; render(); break;
      case 'copy': try { navigator.clipboard.writeText(el.getAttribute('data-v')); toast('Copied ' + el.getAttribute('data-v')); } catch (x) { } break;
      case 'be-teacher': try { localStorage.setItem('index-role', 'teacher'); } catch (x) { } if (window.AccountExtras && AccountExtras.touchRole) AccountExtras.touchRole(); applyRole(); toast('Teacher tools turned on.'); break;
      case 'tutor-toggle': CR.tutor.open = !CR.tutor.open; render(); break;
      case 'chip': { var v = el.getAttribute('data-v'); var ta = $('.cr-chat-in textarea'); if (/: $/.test(v) && ta) { ta.value = v; ta.focus(); } else sendTutor(v); break; }
      case 'new-a': CR.editing = { type: 'task', title: '', instructions: '', due: 0, points: 100, links: [], questions: [] }; render(); break;
      case 'edit-a': { var x = findA(k, aid); CR.editing = JSON.parse(JSON.stringify({ id: x.id, type: x.type, title: x.title, instructions: x.instructions, due: x.due, points: x.points, links: x.links, questions: x.questions })); render(); break; }
      case 'dup-a': { var d = findA(k, aid); CR.editing = JSON.parse(JSON.stringify({ type: d.type, title: d.title + ' (copy)', instructions: d.instructions, due: 0, points: d.points, links: d.links, questions: d.questions })); render(); break; }
      case 'stu': CR.stuSel = el.getAttribute('data-s'); render(); { var pn = $('.cr-gradepanel'); if (pn) pn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } break;
      case 'stu-close': CR.stuSel = null; render(); break;
      case 'tutor-stu': { var q = k.students.filter(function (z) { return z.id === sid; })[0], qs = sstats(k, q); CR.tutor.open = true; sendTutor('Give me 4 practical, kind ways to support a student named ' + q.name.split(' ')[0] + ' in my class "' + k.name + '". Their current average is ' + (qs.avg == null ? 'not graded yet' : qs.avg + '%') + ', with ' + qs.missing + ' missing assignment(s) out of ' + qs.total + '.'); break; }
      case 'pick': { var box = $('#cr-pick'); if (!box || !k.students.length) break; var n = 0, iv = setInterval(function () { var st = k.students[Math.floor(Math.random() * k.students.length)]; box.innerHTML = avHtml(st, 'sm') + ' ' + E(st.name); n++; if (window.SFX) SFX.play('tick'); if (n > 14) { clearInterval(iv); box.classList.add('cr-cwon'); if (window.SFX) SFX.play('win'); } }, 80); box.classList.remove('cr-cwon'); break; }
      case 'groups': { var size = Number(($('#cr-gsize') || {}).value) || 3, arr = k.students.slice(); for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t2 = arr[i]; arr[i] = arr[j]; arr[j] = t2; } var gc = Math.max(1, Math.round(arr.length / size)), gs = []; for (var g = 0; g < gc; g++) gs.push([]); arr.forEach(function (st, ix) { gs[ix % gc].push(st); }); CR.groups = '<div class="cr-grp">' + gs.map(function (grp, gi) { return '<div><b>Group ' + (gi + 1) + '</b>' + grp.map(function (st) { return '<span>' + avHtml(st, 'sm') + E(st.name) + '</span>'; }).join('') + '</div>'; }).join('') + '</div>'; if (window.SFX) SFX.play('win'); render(); break; }
      case 'stu-stats': { var cur2 = (sid in CR.statOv) ? CR.statOv[sid] : CR.showStats; CR.statOv[sid] = !cur2; var sc = $('.cr-stuscroll'), top = sc ? sc.scrollTop : 0; render(); var sc2 = $('.cr-stuscroll'); if (sc2) sc2.scrollTop = top; break; }
      case 'toggle-stats': CR.statOv = {}; CR.showStats = !CR.showStats; try { localStorage.setItem('cr-stats', CR.showStats ? '1' : '0'); } catch (x) { } render(); break;
      case 'new-chat': CR.tutor.msgs = []; render(); break;
      case 'copy-reply': try { navigator.clipboard.writeText(CR.tutor.msgs[Number(el.getAttribute('data-i'))].text); toast('Copied to clipboard.'); } catch (x) { } break;
      case 'post-reply': { var rr = CR.tutor.msgs[Number(el.getAttribute('data-i'))]; if (k && rr) guard(api('/classes/' + k.id + '/posts', 'POST', { text: rr.text.replace(/\*\*/g, '').slice(0, 2000) }).then(function () { toast('Posted to the class stream.'); return refresh(); })); break; }
      case 'ed-close': CR.editing = null; render(); break;
      case 'add-link': readEditor(); CR.editing.links.push({ label: '', url: '' }); keepEditor(); break;
      case 'add-q': readEditor(); CR.editing.questions.push(blankQ()); keepEditor(); break;
      case 'del-q': readEditor(); CR.editing.questions.splice(Number(el.getAttribute('data-i')), 1); keepEditor(); break;
      case 'ed-tutor': { readEditor(); var ed = CR.editing; CR.tutor.open = true; sendTutor('Draft clear student-facing instructions for an assignment' + (ed.title ? ' titled "' + ed.title + '"' : '') + (ed.instructions ? '. Improve this draft: ' + ed.instructions : '. Ask me one quick question about the topic first if you need to.')); break; }
      case 'use-reply': { var m = CR.tutor.msgs[Number(el.getAttribute('data-i'))]; readEditor(); CR.editing.instructions = m.text.replace(/\*\*/g, ''); keepEditor(); break; }
      case 'ai-q': aiQuestions(el); break;
      case 'import-set': importSet(); break;
      case 'del-a': if (confirm('Delete this assignment and all submissions?')) guard(api('/classes/' + k.id + '/assignments/' + aid, 'DELETE').then(function () { CR.aid = null; return refresh(); })); break;
      case 'del-post': guard(api('/classes/' + k.id + '/posts/' + el.getAttribute('data-p'), 'DELETE').then(refresh)); break;
      case 'grade-open': CR.gradeSel = { a: aid, s: sid }; render(); break;
      case 'return-a': if (confirm('Delete this student\'s attempt so they can retake it?')) guard(api('/classes/' + k.id + '/assignments/' + aid + '/return', 'POST', { studentId: sid }).then(function () { CR.gradeSel = null; return refresh(); })); break;
      case 'remove': if (confirm('Remove this student from the class?')) guard(api('/classes/' + k.id + '/remove-student', 'POST', { studentId: sid }).then(refresh)); break;
      case 'del-class': if (confirm('Delete this class for everyone? This cannot be undone.')) guard(api('/classes/' + k.id, 'DELETE').then(function () { CR.cur = null; return loadList().then(render); })); break;
      case 'leave': if (confirm('Leave this class?')) guard(api('/classes/' + k.id + '/leave', 'POST').then(function () { CR.cur = null; return loadList().then(render); })); break;
      case 'csv': exportCsv(); break;
      case 'tutor-feedback': { var A = findA(k, aid), sub = A.submissions[sid], st = k.students.filter(function (z) { return z.id === sid; })[0]; CR.tutor.open = true; sendTutor('Draft short, kind, specific feedback (2-3 sentences, one strength, one next step) for ' + st.name + '\'s answer to "' + A.title + '":\n\n' + sub.text.slice(0, 2500)); break; }
      case 'tutor-attn': { CR.tutor.open = true; var r = stats(k).filter(function (q) { return q.missing >= 2 || (q.avg != null && q.avg < 65); }); sendTutor('In my class "' + k.name + '", ' + r.length + ' students are missing work or below 65%. Give me 5 practical, supportive strategies to re-engage them this week.'); break; }
      case 'tutor-reteach': { CR.tutor.open = true; sendTutor('Plan a 15-minute reteach for my class "' + k.name + '" on the concepts students struggled with most in my quiz. Include a mini-lesson outline and 3 check-for-understanding questions.'); break; }
    }
  }
  function keepEditor() { var ed = $('.cr-editor'); var top = ed ? ed.scrollTop : 0; render(); var e2 = $('.cr-editor'); if (e2) e2.scrollTop = top; }
  function onChange(e) {
    var el = e.target;
    if (el.matches && el.matches('.cr-editor input[name=type]')) { readEditor(); if (CR.editing.type === 'quiz' && !CR.editing.questions.length) CR.editing.questions = [blankQ()]; keepEditor(); }
    if (el.matches && el.matches('[data-cr=ed-file]')) {
      var f = el.files && el.files[0]; if (!f) return; if (f.size > 200000) { toast('That file is too large (max 200 KB).'); return; }
      var rd = new FileReader(); rd.onload = function () { readEditor(); CR.editing.instructions = String(rd.result || '').slice(0, 8000); if (!CR.editing.title) CR.editing.title = f.name.replace(/\.[^.]+$/, ''); keepEditor(); }; rd.readAsText(f);
    }
  }
  function onSubmit(e) {
    var f = e.target.closest('form[data-cr]'); if (!f) return; e.preventDefault(); var a = f.getAttribute('data-cr'), k = CR.cur;
    if (a === 'newclass') guard(api('/classes', 'POST', { name: f.name.value, subject: f.subject.value, section: f.section.value }).then(function () { return loadList().then(render); }).catch(function (er) { if (er.status === 403) { er.message = 'Only teacher accounts can create classes. Make sure you chose Teacher when you signed up, then sign out and back in.'; } throw er; }));
    else if (a === 'join') guard(api('/classes/join', 'POST', { code: f.code.value }).then(function (d) { toast('Joined ' + d.name + '!'); return loadList().then(render); }));
    else if (a === 'post') guard(api('/classes/' + k.id + '/posts', 'POST', { text: f.text.value }).then(refresh));
    else if (a === 'chat') { var ta = f.m; var v = ta.value; ta.value = ''; sendTutor(v); }
    else if (a === 'save-a') {
      readEditor(); var ed = CR.editing, err = $('#cr-ed-err'); var path = '/classes/' + k.id + '/assignments' + (ed.id ? '/' + ed.id : '');
      api(path, ed.id ? 'PUT' : 'POST', ed).then(function () { CR.editing = null; toast(ed.id ? 'Assignment updated.' : 'Assigned to your class!'); return refresh(); }).catch(function (er) { if (err) err.textContent = er.message; });
    } else if (a === 'grade') guard(api('/classes/' + k.id + '/assignments/' + f.getAttribute('data-a') + '/grade', 'POST', { studentId: f.getAttribute('data-s'), score: f.score.value, feedback: f.feedback.value }).then(function () { toast('Grade saved.'); return refresh(); }));
    else if (a === 'quiz') {
      var A = findA(k, f.getAttribute('data-a')), ans = A.questions.map(function (q, i) { var c = f.querySelector('input[name=q' + i + ']:checked'); return c ? Number(c.value) : -1; });
      if (ans.indexOf(-1) >= 0 && !confirm('Some questions are blank. Turn in anyway?')) return;
      guard(api('/classes/' + k.id + '/assignments/' + A.id + '/submit', 'POST', { answers: ans }).then(function (d) { toast('Quiz turned in: ' + d.submission.correct + '/' + d.submission.total); return refresh(); }));
    } else if (a === 'turnin') guard(api('/classes/' + k.id + '/assignments/' + f.getAttribute('data-a') + '/submit', 'POST', { text: f.text.value, link: f.link.value }).then(function () { toast('Turned in!'); return refresh(); }));
  }
  function aiQuestions(btn) {
    readEditor(); var topic = ($('#cr-ai-topic') || {}).value || CR.editing.title; var n = Number(($('#cr-ai-n') || {}).value) || 8;
    if (!topic.trim()) { $('#cr-ed-err').textContent = 'Type a topic first.'; return; }
    btn.disabled = true; btn.textContent = 'Generating…';
    fetch('/api/games/questions', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ course: CR.cur.subject || CR.cur.name, unit: topic, topic: topic, material: CR.editing.instructions.slice(0, 3000), count: n }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Could not generate questions.'); return d; }); })
      .then(function (d) { CR.editing.topic = topic; CR.editing.questions = CR.editing.questions.filter(function (q) { return q.q.trim(); }).concat(d.questions || []); if (!CR.editing.title) CR.editing.title = topic + ' quiz'; keepEditor(); })
      .catch(function (er) { var e2 = $('#cr-ed-err'); if (e2) e2.textContent = er.message; btn.disabled = false; btn.textContent = '✨ Generate with AI'; });
  }
  function importSet() {
    readEditor(); var id = ($('#cr-set') || {}).value; if (!id) return;
    var s = (state.studySets || []).filter(function (x) { return x.id === id; })[0]; if (!s) return;
    CR.editing.questions = CR.editing.questions.filter(function (q) { return q.q.trim(); }).concat(s.questions.map(function (q) { return { q: q.q, options: q.options.slice(0, 4), correct: q.correct, explanation: q.explanation || '' }; }));
    if (!CR.editing.title) CR.editing.title = s.title || 'Quiz'; keepEditor();
  }
  function exportCsv() {
    var k = CR.cur, rows = [['Student'].concat(k.assignments.map(function (a) { return a.title + ' (/' + a.points + ')'; }))];
    k.students.forEach(function (s) { rows.push([s.name].concat(k.assignments.map(function (a) { var sub = (a.submissions || {})[s.id]; return sub ? (sub.status === 'graded' ? sub.score : 'needs grading') : ''; }))); });
    var csv = rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); if (/^[=+\-@]/.test(c)) c = "'" + c; return '"' + c.replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = (k.name || 'class').replace(/[^\w]+/g, '-') + '-grades.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    if (!ensureShell()) return setTimeout(boot, 400);
    try { ACCOUNT_REQUIRED_VIEWS.add('classroom'); } catch (e) { }
    var orig = window.switchView;
    window.switchView = function (v) {
      var r = orig.apply(this, arguments);
      if (v === 'classroom' && state.view === 'classroom') { applyRole(); CR.cur = null; CR.aid = null; CR.editing = null; CR.list = null; render(); loadList().then(render); }
      return r;
    };
    document.body.setAttribute('data-role', role());
    setInterval(function () { var l = $('#cr-navlabel'); if (l) l.textContent = isT() ? 'Classroom' : 'My Classes'; if (document.body.getAttribute('data-role') !== role()) { document.body.setAttribute('data-role', role()); } }, 1500);
  }
  window.Classroom = { render: render, applyRole: applyRole };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
