'use strict';
/**
 * Canvas LMS integration (read-only).
 *  - "Sign in with Canvas": OAuth2 authorization-code flow against the student's own school Canvas. The student types
 *    their password on their school's Canvas page, never in Index. Needs a Developer Key (client id/secret) created by a
 *    Canvas admin: CANVAS_CLIENT_ID / CANVAS_CLIENT_SECRET (any host) and/or CANVAS_OAUTH_KEYS='{"school.instructure.com":{"id":"..","secret":".."}}'.
 *  - Personal access token fallback: the student pastes a token generated in Canvas > Account > Settings.
 * Tokens are encrypted at rest (AES-256-GCM) and never sent back to the browser. Only GET endpoints are used.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');

const UA = 'IndexStudyApp-Canvas/1.0';
const SYNC_TTL_MS = 4 * 60 * 1000;
const MAX_COURSES = 40;
const MAX_PAGES = 4;

function init({ app, dataDir, publicBaseUrl }) {
  const FILE = path.join(dataDir, 'canvas.json');
  const KEYFILE = path.join(dataDir, 'canvas.key');
  let store = {};
  try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (e) { store = {}; }
  const oauthStates = new Map();
  const syncCache = new Map();

  /* ---------- encryption ---------- */
  function secretKey() {
    if (process.env.CANVAS_TOKEN_SECRET) return crypto.createHash('sha256').update(String(process.env.CANVAS_TOKEN_SECRET)).digest();
    try { return Buffer.from(fs.readFileSync(KEYFILE, 'utf8').trim(), 'hex'); } catch (e) { /* create below */ }
    const k = crypto.randomBytes(32);
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(KEYFILE, k.toString('hex'), { mode: 0o600 }); } catch (er) { /* in-memory only */ }
    return k;
  }
  const KEY = secretKey();
  function enc(text) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return iv.toString('base64') + '.' + c.getAuthTag().toString('base64') + '.' + data.toString('base64');
  }
  function dec(s) {
    try {
      const [iv, tag, data] = String(s).split('.').map(x => Buffer.from(x, 'base64'));
      const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv); d.setAuthTag(tag);
      return Buffer.concat([d.update(data), d.final()]).toString('utf8');
    } catch (e) { return ''; }
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { fs.mkdirSync(dataDir, { recursive: true }); const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 }); fs.renameSync(tmp, FILE); } catch (e) { console.error('Canvas store save failed:', e.message); }
    }, 200);
  }

  /* ---------- host safety (no SSRF) ---------- */
  function cleanHost(input) {
    let h = String(input || '').trim().toLowerCase();
    h = h.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].split('#')[0];
    if (h.includes('@') || h.includes(':')) return '';
    if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h)) return '';
    if (net.isIP(h) || h === 'localhost' || /\.(local|internal|localhost|lan|home|corp)$/.test(h)) return '';
    return h;
  }
  function privateIp(ip) {
    if (net.isIPv4(ip)) {
      const [a, b] = ip.split('.').map(Number);
      return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
    }
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
  }
  async function assertPublic(host) {
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some(a => privateIp(a.address))) throw httpErr(400, 'That address is not a public Canvas site.');
  }
  function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }

  /* ---------- Canvas HTTP ---------- */
  async function cfetch(host, pathQuery, opts = {}) {
    await assertPublic(host);
    const url = pathQuery.startsWith('https://') ? pathQuery : 'https://' + host + pathQuery;
    if (new URL(url).hostname !== host) throw httpErr(400, 'Unexpected Canvas redirect.');
    const res = await fetch(url, {
      method: opts.method || 'GET', redirect: 'error', signal: AbortSignal.timeout(opts.timeout || 15000),
      headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, opts.token ? { Authorization: 'Bearer ' + opts.token } : {}, opts.headers || {}),
      body: opts.body
    });
    return res;
  }
  function oauthKey(host) {
    try { const map = JSON.parse(process.env.CANVAS_OAUTH_KEYS || '{}'); if (map[host] && map[host].id && map[host].secret) return map[host]; } catch (e) { /* ignore */ }
    if (process.env.CANVAS_CLIENT_ID && process.env.CANVAS_CLIENT_SECRET) return { id: process.env.CANVAS_CLIENT_ID, secret: process.env.CANVAS_CLIENT_SECRET };
    return null;
  }
  const oauthAnywhere = () => { try { return !!(process.env.CANVAS_CLIENT_ID || Object.keys(JSON.parse(process.env.CANVAS_OAUTH_KEYS || '{}')).length); } catch (e) { return !!process.env.CANVAS_CLIENT_ID; } };
  const redirectUri = req => `${publicBaseUrl || `${req.protocol}://${req.get('host')}`}/api/canvas/oauth/callback`;

  async function accessToken(userId, force) {
    const rec = store[userId]; if (!rec) throw httpErr(404, 'Canvas is not connected.');
    if (rec.kind === 'oauth' && rec.refresh && (force || (rec.expiresAt && Date.now() > rec.expiresAt - 60000))) {
      const k = oauthKey(rec.host);
      if (k) {
        const r = await cfetch(rec.host, '/login/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', client_id: k.id, client_secret: k.secret, refresh_token: dec(rec.refresh) }).toString() });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.access_token) { rec.enc = enc(j.access_token); rec.expiresAt = Date.now() + (Number(j.expires_in) || 3600) * 1000; save(); }
        else throw httpErr(401, 'Canvas needs you to sign in again.');
      }
    }
    return dec(rec.enc);
  }
  /** GET with auto-refresh on 401 and Link-header pagination. */
  async function getJson(userId, pathQuery, pages) {
    const rec = store[userId]; let token = await accessToken(userId, false); const out = []; let next = pathQuery, n = 0;
    while (next && n < (pages || 1)) {
      let r = await cfetch(rec.host, next, { token });
      if (r.status === 401 && rec.kind === 'oauth') { token = await accessToken(userId, true); r = await cfetch(rec.host, next, { token }); }
      if (r.status === 401) throw httpErr(401, 'Canvas rejected the saved sign-in. Please reconnect.');
      if (r.status === 429 || r.status === 403 && /rate/i.test(r.headers.get('x-rate-limit-remaining') || '')) throw httpErr(429, 'Canvas is rate limiting requests. Try again in a minute.');
      if (!r.ok) throw httpErr(502, 'Canvas returned an error (' + r.status + ').');
      const j = await r.json(); if (Array.isArray(j)) out.push(...j); else return j;
      const link = r.headers.get('link') || ''; const m = link.split(',').map(s => s.trim()).find(s => /rel="next"/.test(s)); next = m ? (m.match(/<([^>]+)>/) || [])[1] : null; n++;
    }
    return out;
  }

  /* ---------- normalizers ---------- */
  const strip = html => String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const safeUrl = (u, host) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === host ? x.toString() : ''; } catch (e) { return ''; } };
  function normCourse(c) {
    const e = (c.enrollments || []).find(x => x.type === 'student' || x.role === 'StudentEnrollment') || (c.enrollments || [])[0] || {};
    return { id: c.id, name: String(c.name || c.course_code || 'Course').slice(0, 120), code: String(c.course_code || '').slice(0, 60), term: c.term && c.term.name ? String(c.term.name).slice(0, 60) : '',
      score: typeof e.computed_current_score === 'number' ? e.computed_current_score : null, grade: e.computed_current_grade || null,
      teacher: ((c.teachers || [])[0] || {}).display_name || '' };
  }
  function normAssignment(a, course, host) {
    const s = a.submission || {}; const submitted = !!s.submitted_at || ['submitted', 'graded', 'pending_review'].includes(s.workflow_state);
    return { id: a.id, cid: course.id, course: course.name, name: String(a.name || 'Assignment').slice(0, 160), due: a.due_at || null, points: typeof a.points_possible === 'number' ? a.points_possible : null,
      types: (a.submission_types || []).slice(0, 4), submitted, graded: s.workflow_state === 'graded' || (typeof s.score === 'number' && s.graded_at != null), score: typeof s.score === 'number' ? s.score : null,
      late: !!s.late, missing: !!s.missing, excused: !!s.excused, locked: !!a.locked_for_user, url: safeUrl(a.html_url, host), desc: strip(a.description).slice(0, 700) };
  }

  /* ---------- middleware ---------- */
  const needUser = (req, res, next) => req.user ? next() : res.status(401).json({ ok: false, error: 'Sign in to Index first.' });
  const fail = (res, e) => res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : 'Canvas request failed.' });
  const publicRec = r => r ? { host: r.host, kind: r.kind, name: r.name || '', connectedAt: r.connectedAt, lastSync: r.lastSync || 0 } : null;

  app.get('/api/canvas/status', needUser, (req, res) => {
    const host = cleanHost(req.query.host);
    res.json({ ok: true, oauthConfigured: oauthAnywhere(), oauthForHost: host ? !!oauthKey(host) : undefined, connection: publicRec(store[req.user.id]) });
  });

  async function connect(userId, host, kind, tokens) {
    const me = await (async () => {
      const r = await cfetch(host, '/api/v1/users/self/profile', { token: tokens.access });
      if (r.status === 401) throw httpErr(401, 'Canvas did not accept that. Check the address and token.');
      if (!r.ok) throw httpErr(400, 'That does not look like a Canvas site (HTTP ' + r.status + ').');
      return r.json();
    })();
    store[userId] = { host, kind, enc: enc(tokens.access), refresh: tokens.refresh ? enc(tokens.refresh) : '', expiresAt: tokens.expiresAt || 0, name: String(me.name || me.short_name || '').slice(0, 80), canvasUserId: me.id, connectedAt: Date.now(), lastSync: 0 };
    syncCache.delete(userId); save();
  }

  app.post('/api/canvas/token', needUser, async (req, res) => {
    try {
      const host = cleanHost(req.body && req.body.host); const token = String((req.body && req.body.token) || '').trim();
      if (!host) return res.status(400).json({ ok: false, error: 'Enter your school\'s Canvas address, like myschool.instructure.com.' });
      if (!/^[A-Za-z0-9~_.\-]{16,300}$/.test(token)) return res.status(400).json({ ok: false, error: 'That does not look like a Canvas access token.' });
      await connect(req.user.id, host, 'token', { access: token });
      res.json({ ok: true, connection: publicRec(store[req.user.id]) });
    } catch (e) { fail(res, e); }
  });

  app.get('/api/canvas/oauth/start', needUser, async (req, res) => {
    try {
      const host = cleanHost(req.query.host); if (!host) return res.redirect('/?canvasError=' + encodeURIComponent('Enter your school\'s Canvas address first.'));
      const k = oauthKey(host); if (!k) return res.redirect('/?canvasError=' + encodeURIComponent('Sign in with Canvas is not enabled for that school yet. Use an access token instead.'));
      await assertPublic(host);
      const state = crypto.randomBytes(24).toString('hex'); oauthStates.set(state, { userId: req.user.id, host, at: Date.now() });
      const u = new URL('https://' + host + '/login/oauth2/auth');
      u.searchParams.set('client_id', k.id); u.searchParams.set('response_type', 'code'); u.searchParams.set('redirect_uri', redirectUri(req)); u.searchParams.set('state', state);
      if (process.env.CANVAS_USE_SCOPES === '1') u.searchParams.set('scope', ['url:GET|/api/v1/users/self/profile', 'url:GET|/api/v1/courses', 'url:GET|/api/v1/courses/:course_id/assignments', 'url:GET|/api/v1/announcements'].join(' '));
      res.redirect(u.toString());
    } catch (e) { res.redirect('/?canvasError=' + encodeURIComponent(e.status ? e.message : 'Could not reach that Canvas site.')); }
  });
  app.get('/api/canvas/oauth/callback', async (req, res) => {
    const st = oauthStates.get(String(req.query.state || '')); oauthStates.delete(String(req.query.state || ''));
    if (!st || Date.now() - st.at > 10 * 60 * 1000) return res.redirect('/?canvasError=' + encodeURIComponent('The Canvas sign-in expired. Please try again.'));
    if (req.query.error || !req.query.code) return res.redirect('/?canvasError=' + encodeURIComponent('Canvas sign-in was cancelled.'));
    try {
      const k = oauthKey(st.host);
      const r = await cfetch(st.host, '/login/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: k.id, client_secret: k.secret, redirect_uri: redirectUri(req), code: String(req.query.code) }).toString() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) throw httpErr(400, 'Canvas did not complete the sign-in.');
      await connect(st.userId, st.host, 'oauth', { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
      res.redirect('/?canvas=connected');
    } catch (e) { console.error('Canvas OAuth error:', e.message); res.redirect('/?canvasError=' + encodeURIComponent(e.status ? e.message : 'Canvas sign-in failed.')); }
  });

  app.post('/api/canvas/disconnect', needUser, async (req, res) => {
    const rec = store[req.user.id];
    if (rec && rec.kind === 'oauth') { try { await cfetch(rec.host, '/login/oauth2/token', { method: 'DELETE', token: dec(rec.enc), timeout: 6000 }); } catch (e) { /* best effort */ } }
    delete store[req.user.id]; syncCache.delete(req.user.id); save();
    res.json({ ok: true });
  });

  /* ---------- sync: classes + assignments ---------- */
  async function mapLimit(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = { error: e }; } } }));
    return out;
  }
  app.get('/api/canvas/sync', needUser, async (req, res) => {
    const uid = req.user.id, rec = store[uid];
    if (!rec) return res.status(404).json({ ok: false, error: 'Canvas is not connected.' });
    const cached = syncCache.get(uid);
    if (cached && Date.now() - cached.at < (req.query.force ? 15000 : SYNC_TTL_MS)) return res.json(Object.assign({ ok: true, cached: true }, cached.data));
    try {
      const rawCourses = await getJson(uid, '/api/v1/courses?enrollment_state=active&enrollment_type=student&include[]=term&include[]=total_scores&include[]=teachers&per_page=50', 2);
      const courses = rawCourses.filter(c => c && c.id && !c.access_restricted_by_date).slice(0, MAX_COURSES).map(normCourse);
      const results = await mapLimit(courses, 4, async c => {
        const list = await getJson(uid, `/api/v1/courses/${encodeURIComponent(c.id)}/assignments?include[]=submission&order_by=due_at&per_page=100`, MAX_PAGES);
        return list.filter(a => a && a.published !== false).map(a => normAssignment(a, c, rec.host));
      });
      const assignments = [], warnings = [];
      results.forEach((r, i) => { if (Array.isArray(r)) assignments.push(...r); else warnings.push(courses[i].name); });
      let announcements = [];
      try {
        const codes = courses.slice(0, 10).map(c => 'context_codes[]=course_' + c.id).join('&');
        const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
        const an = await getJson(uid, `/api/v1/announcements?${codes}&start_date=${since}&active_only=true&per_page=20`, 1);
        announcements = an.slice(0, 12).map(a => ({ title: String(a.title || '').slice(0, 140), course: (courses.find(c => 'course_' + c.id === a.context_code) || {}).name || '', at: a.posted_at || a.created_at || null, text: strip(a.message).slice(0, 400), url: safeUrl(a.html_url, rec.host) }));
      } catch (e) { /* announcements are optional */ }
      const data = { host: rec.host, name: rec.name, courses, assignments, announcements, partial: warnings, syncedAt: Date.now() };
      syncCache.set(uid, { at: Date.now(), data }); rec.lastSync = Date.now(); save();
      res.json(Object.assign({ ok: true }, data));
    } catch (e) {
      if (e.status === 401) { /* token no longer valid */ }
      console.error('Canvas sync error:', e.message); fail(res, e);
    }
  });

  return { forgetUser(id) { if (store[id]) { delete store[id]; syncCache.delete(id); save(); } } };
}
module.exports = { init };
