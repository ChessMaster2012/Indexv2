'use strict';
/**
 * Question formats + the public "Library" of user-published question sets.
 * Formats: mc (2-4 choices), tf (true/false), type (type-in answer with accepted answers).
 * Everything stored here is user generated, so all text goes through the shared conduct filter,
 * links are rejected, and size / rate limits apply.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_Q = 50, MIN_Q = 3, MAX_PER_USER = 15;
const SUBJECTS = ['general','math','science','english','history','languages','cs','arts','other'];
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|gg|ly|co|me|xyz|ru)\b)/i;

function clean(s, max) { return String(s == null ? '' : s).replace(/[<>\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

function normalizeAnswer(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.\- ]/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function typedMatches(q, text) {
  const t = normalizeAnswer(text); if (!t) return false;
  return (q.answers || []).some(ans => {
    const a = normalizeAnswer(ans); if (!a) return false;
    if (a === t) return true;
    const na = Number(a), nt = Number(t);
    if (Number.isFinite(na) && Number.isFinite(nt) && a !== '' && t !== '') return na === nt;
    return a.length >= 6 && lev(a, t) <= 1; // forgive one typo on longer answers
  });
}

/** Normalizes one question; returns null if it's unusable. */
function normalizeQuestion(q) {
  if (!q || typeof q !== 'object') return null;
  const text = clean(q.q, 400); if (!text) return null;
  const explanation = clean(q.explanation, 400);
  const time = Number(q.time) ? Math.max(5, Math.min(120, Math.round(Number(q.time)))) : 0;
  const type = ['mc', 'tf', 'type'].includes(q.type) ? q.type : 'mc';
  if (type === 'tf') {
    const c = q.correct === true || q.correct === 0 || q.correct === 'true' ? 0 : (q.correct === false || q.correct === 1 || q.correct === 'false' ? 1 : -1);
    if (c < 0) return null;
    return { type, q: text, options: ['True', 'False'], correct: c, explanation, time };
  }
  if (type === 'type') {
    const answers = [...new Set((Array.isArray(q.answers) ? q.answers : []).map(a => clean(a, 100)).filter(Boolean))].slice(0, 6);
    if (!answers.length) return null;
    return { type, q: text, answers, explanation, time };
  }
  // multiple choice: 2-4 non-empty options, correct index must point at a kept option
  if (!Array.isArray(q.options) || !Number.isInteger(q.correct)) return null;
  const kept = [];
  let correct = -1;
  q.options.slice(0, 4).forEach((o, i) => {
    const label = clean(o, 200);
    if (!label) return;
    if (i === q.correct) correct = kept.length;
    kept.push(label);
  });
  if (kept.length < 2 || correct < 0) return null;
  return { type: 'mc', q: text, options: kept, correct, explanation, time };
}
function normalizeQuestions(list, max = 30) {
  return (Array.isArray(list) ? list : []).map(normalizeQuestion).filter(Boolean).slice(0, max);
}

function init({ app, dataDir, containsConductViolation, supabase, express }) {
  const FILE = path.join(dataDir, 'library.json');
  const TABLE = 'index_library';
  const sets = new Map();
  const reports = new Map(); // id -> Set(reporter key)
  const publishLog = new Map(); // userId -> [timestamps]
  const reportLog = new Map(); // ip -> [timestamps]
  const playLog = new Map(); // ip:id -> ts

  function persistFile() {
    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(Array.from(sets.values())));
      fs.renameSync(tmp, FILE);
    } catch (e) { console.error('library: file save failed:', e.message); }
  }
  async function mirror(set, remove) {
    if (!supabase || !supabase.enabled) return;
    try {
      if (remove) await supabase.request(`${TABLE}?id=eq.${encodeURIComponent(set.id)}`, { method: 'DELETE' });
      else await supabase.request(`${TABLE}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ id: set.id, data: set, updated_at: new Date().toISOString() }]) });
    } catch (e) { console.error('library: supabase mirror failed (table index_library missing? see SUPABASE-SETUP.sql):', e.message); }
  }
  async function load() {
    try { if (fs.existsSync(FILE)) JSON.parse(fs.readFileSync(FILE, 'utf8')).forEach(s => s && s.id && sets.set(s.id, s)); }
    catch (e) { console.error('library: file load failed:', e.message); }
    if (supabase && supabase.enabled) {
      try {
        const rows = await supabase.request(`${TABLE}?select=id,data&limit=5000`);
        (rows || []).forEach(r => { if (r && r.data && r.data.id) sets.set(r.id, r.data); });
        console.log('library: loaded', sets.size, 'published sets');
      } catch (e) { console.error('library: supabase load skipped:', e.message); }
    }
  }
  load();

  function throttle(map, key, limit, windowMs) {
    const now = Date.now();
    const arr = (map.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= limit) { map.set(key, arr); return false; }
    arr.push(now); map.set(key, arr); return true;
  }
  const brief = (s, me) => ({
    id: s.id, title: s.title, description: s.description, subject: s.subject, tags: s.tags,
    author: s.authorName, count: s.questions.length, formats: [...new Set(s.questions.map(q => q.type))],
    plays: s.plays || 0, createdAt: s.createdAt, mine: !!(me && s.authorId === me.id)
  });
  const visible = s => !s.hidden;
  const bad = txt => containsConductViolation(txt) || URL_RE.test(String(txt));
  const authorOf = u => clean(u.username || u.firstName || 'Student', 24) || 'Student';

  app.get('/api/library', (req, res) => {
    const q = clean(req.query.q, 60).toLowerCase();
    const subject = SUBJECTS.includes(req.query.subject) ? req.query.subject : '';
    const mine = req.query.mine === '1' && req.user;
    let list = Array.from(sets.values()).filter(s => mine ? s.authorId === req.user.id : visible(s));
    if (subject) list = list.filter(s => s.subject === subject);
    if (q) list = list.filter(s => (s.title + ' ' + s.description + ' ' + s.tags.join(' ') + ' ' + s.authorName).toLowerCase().includes(q));
    list.sort(req.query.sort === 'popular' ? (a, b) => (b.plays || 0) - (a.plays || 0) || b.createdAt - a.createdAt : (a, b) => b.createdAt - a.createdAt);
    res.json({ ok: true, total: list.length, sets: list.slice(0, 60).map(s => brief(s, req.user)) });
  });
  app.get('/api/library/:id', (req, res) => {
    const s = sets.get(req.params.id);
    if (!s || (!visible(s) && !(req.user && req.user.id === s.authorId))) return res.status(404).json({ ok: false, error: 'That set is not available.' });
    res.json({ ok: true, set: { ...brief(s, req.user), questions: s.questions } });
  });
  app.post('/api/library', express.json({ limit: '300kb' }), (req, res) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Sign in to publish a set.' });
    const b = req.body || {};
    const title = clean(b.title, 80), description = clean(b.description, 240);
    const subject = SUBJECTS.includes(b.subject) ? b.subject : 'general';
    const tags = [...new Set((Array.isArray(b.tags) ? b.tags : []).map(t => clean(t, 20).toLowerCase()).filter(Boolean))].slice(0, 5);
    if (title.length < 3) return res.status(400).json({ ok: false, error: 'Give your set a title (at least 3 characters).' });
    const questions = normalizeQuestions(b.questions, MAX_Q);
    if (questions.length < MIN_Q) return res.status(400).json({ ok: false, error: `A published set needs at least ${MIN_Q} valid questions.` });
    const texts = [title, description, ...tags, ...questions.flatMap(q => [q.q, q.explanation, ...(q.options || []), ...(q.answers || [])])];
    if (texts.some(bad)) return res.status(400).json({ ok: false, error: 'Your set contains language or links that aren\'t allowed on Index. Please remove them and try again.' });
    const mineCount = Array.from(sets.values()).filter(s => s.authorId === req.user.id).length;
    if (mineCount >= MAX_PER_USER) return res.status(400).json({ ok: false, error: `You can have up to ${MAX_PER_USER} published sets. Unpublish one first.` });
    if (!throttle(publishLog, req.user.id, 5, 3600000)) return res.status(429).json({ ok: false, error: 'You\'re publishing too quickly. Try again in a bit.' });
    const set = { id: crypto.randomBytes(6).toString('hex'), title, description, subject, tags, questions, authorId: req.user.id, authorName: authorOf(req.user), createdAt: Date.now(), plays: 0, hidden: false };
    sets.set(set.id, set); persistFile(); mirror(set);
    res.json({ ok: true, id: set.id, set: brief(set, req.user) });
  });
  app.delete('/api/library/:id', (req, res) => {
    const s = sets.get(req.params.id);
    if (!req.user) return res.status(401).json({ ok: false, error: 'Sign in first.' });
    if (!s || s.authorId !== req.user.id) return res.status(404).json({ ok: false, error: 'Set not found.' });
    sets.delete(s.id); persistFile(); mirror(s, true);
    res.json({ ok: true });
  });
  app.post('/api/library/:id/report', express.json({ limit: '2kb' }), (req, res) => {
    const s = sets.get(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Set not found.' });
    const who = req.user ? 'u:' + req.user.id : 'ip:' + (req.ip || '');
    if (!throttle(reportLog, req.ip || 'x', 10, 3600000)) return res.status(429).json({ ok: false, error: 'Too many reports.' });
    const set = reports.get(s.id) || new Set(); set.add(who); reports.set(s.id, set);
    if (set.size >= 3 && !s.hidden) { s.hidden = true; persistFile(); mirror(s); console.warn('library: auto-hid reported set', s.id); }
    res.json({ ok: true });
  });
  app.post('/api/library/:id/play', (req, res) => {
    const s = sets.get(req.params.id);
    if (!s) return res.json({ ok: false });
    if (throttle(playLog, (req.ip || '') + ':' + s.id, 1, 600000)) { s.plays = (s.plays || 0) + 1; persistFile(); }
    res.json({ ok: true });
  });
}

module.exports = { init, normalizeQuestion, normalizeQuestions, typedMatches, SUBJECTS };
