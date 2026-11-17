/* Classrooms: teachers create classes, students join with a code, teachers post assignments (written tasks or
   auto-graded quizzes) and announcements, students submit, teachers grade. Data lives on the accounts themselves
   (accountData.classroom), so it is durable wherever accounts are (Supabase in production, users.json locally):
     teacher: classroom.owned  = [full classroom with roster, assignments and every submission]
     student: classroom.joined = [{id, teacherId, code, name, ...}]  (a pointer; the class itself lives with the teacher)
   Every write goes through a per-account lock plus a fresh read so simultaneous submissions cannot overwrite each other. */
'use strict';
const crypto = require('crypto');
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LIM = { classes: 12, students: 80, assignments: 80, posts: 60, questions: 30, links: 5, text: 8000, title: 120 };

const Safety = require('./safety.js');
module.exports = function registerClassrooms(app, deps) {
  /* Everything typed into a class (names, posts, assignments, answers) is shown to other people, so screen it first. */
  app.use('/api/classes', (req, res, next) => {
    if ((req.method !== 'POST' && req.method !== 'PUT') || /\/join$/.test(req.path)) return next();
    const texts = [];
    (function walk(v, d) { if (d > 6) return; if (typeof v === 'string') texts.push(v); else if (Array.isArray(v)) v.forEach(x => walk(x, d + 1)); else if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], d + 1)); })(req.body, 0);
    const v = Safety.screen(texts.join(' \n '), { strict: false });
    if (!v.ok) return res.status(400).json({ error: v.message });
    next();
  });
  const { usersById, dbFindUserById, dbRowToUser, dbSaveUser, saveUsers, SUPABASE_ENABLED, supabaseRequest, supabaseTable, withLock } = deps;
  const S = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
  const newId = p => p + crypto.randomBytes(5).toString('hex');
  function cleanNum(v, lo, hi, d) { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }

  async function getUser(id) {
    if (!id) return null;
    if (!SUPABASE_ENABLED) return usersById.get(id) || null;
    const row = await dbFindUserById(id);
    return row ? dbRowToUser(row) : null;
  }
  function room(u) {
    const ad = (u.accountData && typeof u.accountData === 'object') ? u.accountData : (u.accountData = {});
    const c = ad.classroom && typeof ad.classroom === 'object' ? ad.classroom : (ad.classroom = {});
    if (!Array.isArray(c.owned)) c.owned = [];
    if (!Array.isArray(c.joined)) c.joined = [];
    return c;
  }
  async function save(u) { if (SUPABASE_ENABLED) await dbSaveUser(u); else saveUsers(); }
  /* run fn(classroomState, user) on a fresh copy of the account, under its lock, then save */
  function mutate(id, fn) {
    return withLock(id, async () => {
      const u = await getUser(id); if (!u) { const e = new Error('Account not found.'); e.status = 404; throw e; }
      const out = await fn(room(u), u);
      await save(u);
      return out;
    });
  }
  function read(id) { return withLock(id, async () => { const u = await getUser(id); return u ? { u, c: room(u) } : null; }); }
  function dn(u) {
    const ad = u.accountData || {}; const p = ad.profile || {};
    const n = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || S(p.name, 60) || u.username || 'Student';
    return S(n, 60);
  }
  const isTeacher = u => !!(u.accountData && u.accountData.role === 'teacher');
  function fail(res, status, msg) { return res.status(status).json({ error: msg }); }
  function need(req, res) { if (!req.user) { fail(res, 401, 'Sign in to use classrooms.'); return false; } return true; }
  const wrap = h => async (req, res) => {
    if (!need(req, res)) return;
    try { await h(req, res); }
    catch (e) { if (e && e.status) return fail(res, e.status, e.message); console.error('classroom error:', e && e.message); fail(res, 503, 'Classrooms are unavailable right now. Please try again.'); }
  };
  const bad = (m, s) => { const e = new Error(m); e.status = s || 400; return e; };

  /* ---------- helpers on a classroom ---------- */
  function mkCode(ownerId, c) {
    const pre = String(ownerId).slice(0, 6).toUpperCase();
    for (let t = 0; t < 30; t++) {
      let s = ''; for (let i = 0; i < 3; i++) s += CODE_ALPHA[crypto.randomInt(CODE_ALPHA.length)];
      const code = pre + '-' + s; if (!c.owned.some(k => k.code === code)) return code;
    }
    throw bad('Could not create a class code. Try again.', 500);
  }
  function cleanQuestions(arr) {
    return (Array.isArray(arr) ? arr : []).slice(0, LIM.questions).map(q => {
      const options = (Array.isArray(q && q.options) ? q.options : []).slice(0, 6).map(o => S(o, 200)).filter(Boolean);
      const correct = Math.floor(Number(q && q.correct));
      if (!q || !S(q.q, 500) || options.length < 2 || !(correct >= 0 && correct < options.length)) return null;
      return { q: S(q.q, 500), options, correct, explanation: S(q.explanation, 500) };
    }).filter(Boolean);
  }
  function cleanLinks(arr) {
    return (Array.isArray(arr) ? arr : []).slice(0, LIM.links).map(l => {
      const url = S(l && l.url, 500); if (!/^https?:\/\//i.test(url)) return null;
      return { label: S(l.label, 80) || url, url };
    }).filter(Boolean);
  }
  function cleanAssignment(b, old) {
    const type = b.type === 'quiz' ? 'quiz' : 'task';
    const a = Object.assign({}, old || {}, {
      title: S(b.title, LIM.title), instructions: S(b.instructions, LIM.text), type,
      due: Math.max(0, Math.floor(Number(b.due) || 0)), points: cleanNum(b.points, 0, 1000, 100),
      links: cleanLinks(b.links), topic: S(b.topic, 120),
      questions: type === 'quiz' ? cleanQuestions(b.questions) : [], updatedAt: Date.now()
    });
    if (!a.title) throw bad('Give the assignment a title.');
    if (type === 'quiz' && a.questions.length < 1) throw bad('A quiz needs at least one valid question.');
    return a;
  }
  function summaryOwned(k) {
    const subs = k.assignments.reduce((n, a) => n + Object.keys(a.submissions || {}).length, 0);
    return { id: k.id, name: k.name, subject: k.subject, section: k.section, code: k.code, students: k.students.length, assignments: k.assignments.length, submissions: subs, createdAt: k.createdAt, role: 'teacher' };
  }
  function studentAssignment(a, sid) {
    const sub = (a.submissions || {})[sid] || null;
    const out = { id: a.id, title: a.title, instructions: a.instructions, type: a.type, due: a.due, points: a.points, links: a.links, topic: a.topic, createdAt: a.createdAt, status: sub ? sub.status : (a.due && a.due < Date.now() ? 'missing' : 'assigned'), submission: sub };
    if (a.type === 'quiz') {
      const reveal = !!sub;
      out.questions = a.questions.map(q => reveal ? q : { q: q.q, options: q.options });
    }
    return out;
  }
  function myAttendance(k, sid) {
    const days = Object.keys(k.attendance || {}).sort(); const c = { p: 0, a: 0, l: 0, e: 0 }; const recent = [];
    days.forEach(d => { const m = k.attendance[d][sid]; if (m && c[m] != null) { c[m]++; recent.push({ d, m }); } });
    return { counts: c, recent: recent.slice(-10).reverse() };
  }
  function studentView(k, sid, teacherName) {
    return { id: k.id, name: k.name, subject: k.subject, section: k.section, code: '', teacherName, role: 'student', posts: k.posts.slice().reverse(), assignments: k.assignments.map(a => studentAssignment(a, sid)), students: k.students.length,
      resources: (k.resources || []).slice().reverse(), attendance: myAttendance(k, sid) };
  }
  function findOwned(c, id) { const k = c.owned.find(x => x.id === id); if (!k) throw bad('Class not found.', 404); return k; }

  /* ---------- routes ---------- */
  app.get('/api/classes', wrap(async (req, res) => {
    const me = await getUser(req.user.id); const c = room(me);
    const joined = [];
    for (const j of c.joined) {
      const t = await getUser(j.teacherId); if (!t) continue;
      const k = room(t).owned.find(x => x.id === j.id); if (!k) continue;
      if (!k.students.some(s => s.id === me.id)) continue;
      const av = k.assignments.map(a => studentAssignment(a, me.id));
      joined.push({ id: k.id, name: k.name, subject: k.subject, section: k.section, teacherName: dn(t), teacherId: t.id, role: 'student',
        todo: av.filter(a => a.status === 'assigned').length, missing: av.filter(a => a.status === 'missing').length, assignments: k.assignments.length,
        nextDue: Math.min.apply(null, av.filter(a => a.status === 'assigned' && a.due).map(a => a.due).concat([Infinity])) });
    }
    res.json({ teacher: isTeacher(me), owned: c.owned.map(summaryOwned), joined: joined.map(j => ({ ...j, nextDue: Number.isFinite(j.nextDue) ? j.nextDue : 0 })) });
  }));

  app.post('/api/classes', wrap(async (req, res) => {
    const name = S(req.body && req.body.name, 80); if (!name) return fail(res, 400, 'Give your class a name.');
    const out = await mutate(req.user.id, (c, u) => {
      if (!isTeacher(u)) throw bad('Only teacher accounts can create classes. Switch your account to Teacher first.', 403);
      if (c.owned.length >= LIM.classes) throw bad('You have reached the limit of ' + LIM.classes + ' classes.');
      const k = { id: newId('c'), name, subject: S(req.body.subject, 60), section: S(req.body.section, 40), code: mkCode(u.id, c), createdAt: Date.now(), students: [], posts: [], assignments: [] };
      c.owned.push(k); return summaryOwned(k);
    });
    res.json({ ok: true, class: out });
  }));

  app.post('/api/classes/join', wrap(async (req, res) => {
    const raw = S(req.body && req.body.code, 20).toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!/^[0-9A-F]{6}[A-Z2-9]{3}$/.test(raw)) return fail(res, 400, 'That class code does not look right. It looks like A1B2C3-K7P.');
    const code = raw.slice(0, 6) + '-' + raw.slice(6);
    let cands = [];
    if (SUPABASE_ENABLED) {
      const rows = await supabaseRequest(`${supabaseTable}?select=id&id=like.${raw.slice(0, 6).toLowerCase()}*&limit=20`);
      cands = (rows || []).map(r => r.id);
    } else cands = Array.from(usersById.keys()).filter(id => id.slice(0, 6).toUpperCase() === raw.slice(0, 6));
    let teacher = null, klass = null;
    for (const id of cands) { const r = await read(id); const k = r && r.c.owned.find(x => x.code === code); if (k) { teacher = r.u; klass = k; break; } }
    if (!klass) return fail(res, 404, 'No class found with that code. Check it with your teacher.');
    if (teacher.id === req.user.id) return fail(res, 400, 'You own this class.');
    const me = await getUser(req.user.id); const myName = dn(me);
    await mutate(teacher.id, c => {
      const k = findOwned(c, klass.id);
      if (k.students.some(s => s.id === me.id)) return;
      if (k.students.length >= LIM.students) throw bad('This class is full.');
      k.students.push({ id: me.id, name: myName, joinedAt: Date.now() });
    });
    await mutate(me.id, c => { if (!c.joined.some(j => j.id === klass.id)) c.joined.push({ id: klass.id, teacherId: teacher.id, name: klass.name, joinedAt: Date.now() }); });
    res.json({ ok: true, id: klass.id, name: klass.name });
  }));

  async function loadForViewer(req, id) {
    const me = await getUser(req.user.id); const c = room(me);
    const own = c.owned.find(x => x.id === id);
    if (own) return { teacher: true, k: own, me, tid: me.id, tname: dn(me) };
    const j = c.joined.find(x => x.id === id); if (!j) throw bad('Class not found.', 404);
    const t = await getUser(j.teacherId); const k = t && room(t).owned.find(x => x.id === id);
    if (!k || !k.students.some(s => s.id === me.id)) throw bad('You are no longer in this class.', 404);
    return { teacher: false, k, me, tid: t.id, tname: dn(t) };
  }
  /* Teacher roster extras: each student's equipped Indexling, frame and level (cached briefly so a busy page stays fast). */
  const avCache = new Map();
  async function avatarOf(id) {
    const hit = avCache.get(id); if (hit && Date.now() - hit.t < 45000) return hit.v;
    let v = { avatar: { indexling: '', skin: '', frame: 'default' }, level: 1, xp: 0 };
    try {
      const u = await getUser(id); const p = (u && u.accountData && u.accountData.progress) || {}; const eq = p.equipped || {};
      const xp = Math.max(0, Math.floor(Number(p.xp) || 0));
      v = { avatar: { indexling: S(eq.indexling, 80), skin: S(eq.indexlingSkin, 80), frame: S(eq.frame, 40) || 'default' }, level: Math.floor(xp / 100) + 1, xp };
    } catch (e) { }
    avCache.set(id, { t: Date.now(), v }); if (avCache.size > 500) avCache.clear();
    return v;
  }
  app.get('/api/classes/:id', wrap(async (req, res) => {
    const v = await loadForViewer(req, req.params.id);
    if (v.teacher) {
      const students = await Promise.all(v.k.students.map(async st => Object.assign({}, st, await avatarOf(st.id))));
      return res.json({ class: Object.assign({}, v.k, { role: 'teacher', students, posts: v.k.posts.slice().reverse() }) });
    }
    res.json({ class: studentView(v.k, v.me.id, v.tname) });
  }));

  function ownerOnly(handler) {
    return wrap(async (req, res) => {
      const out = await mutate(req.user.id, (c, u) => { if (!c.owned.some(x => x.id === req.params.id)) throw bad('Class not found.', 404); return handler(findOwned(c, req.params.id), req, c); });
      res.json(Object.assign({ ok: true }, out || {}));
    });
  }
  app.put('/api/classes/:id', ownerOnly((k, req) => { k.name = S(req.body.name, 80) || k.name; k.subject = S(req.body.subject, 60); k.section = S(req.body.section, 40); }));
  app.post('/api/classes/:id/posts', ownerOnly((k, req) => {
    const text = S(req.body.text, 2000); if (!text) throw bad('Write something to post.');
    k.posts.push({ id: newId('p'), text, at: Date.now() }); if (k.posts.length > LIM.posts) k.posts.splice(0, k.posts.length - LIM.posts);
  }));
  app.post('/api/classes/:id/posts/:pid/pin', ownerOnly((k, req) => {
    const p = k.posts.find(x => x.id === req.params.pid); if (!p) throw bad('Post not found.', 404);
    if (!p.pinned) k.posts.forEach(x => { x.pinned = false; }); p.pinned = !p.pinned;
  }));
  app.post('/api/classes/:id/resources', ownerOnly((k, req) => {
    k.resources = k.resources || []; if (k.resources.length >= 40) throw bad('This class has the maximum number of resources.');
    const title = S(req.body.title, 120); if (!title) throw bad('Give the resource a title.');
    let url = S(req.body.url, 500); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url; if (url && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) throw bad('That link does not look right.');
    const note = S(req.body.note, 600); if (!url && !note) throw bad('Add a link or a note.');
    k.resources.push({ id: newId('r'), title, url, note, section: S(req.body.section, 40) || 'General', at: Date.now() });
  }));
  app.delete('/api/classes/:id/resources/:rid', ownerOnly((k, req) => { k.resources = (k.resources || []).filter(r => r.id !== req.params.rid); }));
  app.post('/api/classes/:id/attendance', ownerOnly((k, req) => {
    const date = String(req.body.date || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('Pick a valid date.');
    const marks = req.body.marks && typeof req.body.marks === 'object' ? req.body.marks : {}; const ids = new Set(k.students.map(s => s.id)); const clean = {};
    Object.keys(marks).forEach(id => { if (ids.has(id) && ['p', 'a', 'l', 'e'].indexOf(marks[id]) >= 0) clean[id] = marks[id]; });
    k.attendance = k.attendance || {}; k.attendance[date] = clean;
    const keys = Object.keys(k.attendance).sort(); while (keys.length > 400) delete k.attendance[keys.shift()];
  }));
  app.delete('/api/classes/:id/posts/:pid', ownerOnly((k, req) => { k.posts = k.posts.filter(p => p.id !== req.params.pid); }));
  app.post('/api/classes/:id/assignments', ownerOnly((k, req) => {
    if (k.assignments.length >= LIM.assignments) throw bad('This class has the maximum number of assignments.');
    const a = cleanAssignment(req.body || {}); a.id = newId('a'); a.createdAt = Date.now(); a.submissions = {};
    k.assignments.push(a); return { assignmentId: a.id };
  }));
  app.put('/api/classes/:id/assignments/:aid', ownerOnly((k, req) => {
    const i = k.assignments.findIndex(a => a.id === req.params.aid); if (i < 0) throw bad('Assignment not found.', 404);
    const old = k.assignments[i]; const a = cleanAssignment(req.body || {}, old); a.id = old.id; a.submissions = old.submissions || {}; k.assignments[i] = a;
  }));
  app.delete('/api/classes/:id/assignments/:aid', ownerOnly((k, req) => { k.assignments = k.assignments.filter(a => a.id !== req.params.aid); }));
  app.post('/api/classes/:id/assignments/:aid/grade', ownerOnly((k, req) => {
    const a = k.assignments.find(x => x.id === req.params.aid); if (!a) throw bad('Assignment not found.', 404);
    const sid = S(req.body.studentId, 40); const sub = (a.submissions || {})[sid]; if (!sub) throw bad('That student has not turned this in.', 404);
    sub.score = cleanNum(req.body.score, 0, a.points || 1000, 0); sub.feedback = S(req.body.feedback, 1500); sub.status = 'graded'; sub.gradedAt = Date.now();
  }));
  app.post('/api/classes/:id/assignments/:aid/return', ownerOnly((k, req) => {
    const a = k.assignments.find(x => x.id === req.params.aid); if (!a) throw bad('Assignment not found.', 404);
    delete (a.submissions || {})[S(req.body.studentId, 40)];
  }));
  app.post('/api/classes/:id/remove-student', wrap(async (req, res) => {
    const sid = S(req.body && req.body.studentId, 40);
    await mutate(req.user.id, c => { const k = findOwned(c, req.params.id); k.students = k.students.filter(s => s.id !== sid); });
    try { await mutate(sid, c => { c.joined = c.joined.filter(j => j.id !== req.params.id); }); } catch (e) { }
    res.json({ ok: true });
  }));
  app.delete('/api/classes/:id', wrap(async (req, res) => {
    let studs = [];
    await mutate(req.user.id, c => { const k = findOwned(c, req.params.id); studs = k.students.map(s => s.id); c.owned = c.owned.filter(x => x.id !== k.id); });
    for (const sid of studs) { try { await mutate(sid, c => { c.joined = c.joined.filter(j => j.id !== req.params.id); }); } catch (e) { } }
    res.json({ ok: true });
  }));
  app.post('/api/classes/:id/leave', wrap(async (req, res) => {
    const me = await getUser(req.user.id); const j = room(me).joined.find(x => x.id === req.params.id);
    if (j) { try { await mutate(j.teacherId, c => { const k = c.owned.find(x => x.id === req.params.id); if (k) k.students = k.students.filter(s => s.id !== me.id); }); } catch (e) { } }
    await mutate(me.id, c => { c.joined = c.joined.filter(x => x.id !== req.params.id); });
    res.json({ ok: true });
  }));

  app.post('/api/classes/:id/assignments/:aid/submit', wrap(async (req, res) => {
    const me = await getUser(req.user.id); const j = room(me).joined.find(x => x.id === req.params.id);
    if (!j) return fail(res, 404, 'Class not found.');
    const out = await mutate(j.teacherId, c => {
      const k = findOwned(c, req.params.id); if (!k.students.some(s => s.id === me.id)) throw bad('You are not in this class.', 403);
      const a = k.assignments.find(x => x.id === req.params.aid); if (!a) throw bad('Assignment not found.', 404);
      a.submissions = a.submissions || {}; const prev = a.submissions[me.id];
      if (prev && (prev.status === 'graded' || a.type === 'quiz')) throw bad(a.type === 'quiz' ? 'You already took this quiz.' : 'This was already graded. Ask your teacher if you need to redo it.');
      const now = Date.now(), sub = { studentId: me.id, name: dn(me), submittedAt: now, late: !!(a.due && now > a.due), text: S(req.body.text, LIM.text), status: 'submitted' };
      if (a.type === 'quiz') {
        const ans = Array.isArray(req.body.answers) ? req.body.answers : [];
        sub.answers = a.questions.map((q, i) => { const v = Math.floor(Number(ans[i])); return v >= 0 && v < q.options.length ? v : -1; });
        sub.correct = a.questions.reduce((n, q, i) => n + (sub.answers[i] === q.correct ? 1 : 0), 0);
        sub.total = a.questions.length; sub.score = Math.round(sub.correct / sub.total * a.points * 10) / 10; sub.status = 'graded'; sub.gradedAt = now;
      } else if (!sub.text && !(req.body.link && /^https?:\/\//i.test(String(req.body.link)))) throw bad('Write your answer or add a link before turning it in.');
      if (req.body.link && /^https?:\/\//i.test(String(req.body.link))) sub.link = S(req.body.link, 500);
      a.submissions[me.id] = sub; return { submission: sub, questions: a.type === 'quiz' ? a.questions : undefined };
    });
    res.json(Object.assign({ ok: true }, out));
  }));
};
