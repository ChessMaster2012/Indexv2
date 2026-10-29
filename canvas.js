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

function init({ app, dataDir, publicBaseUrl, supabase }) {
  const FILE = path.join(dataDir, 'canvas.json');
  const KEYFILE = path.join(dataDir, 'canvas.key');
  let store = {};
  try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (e) { store = {}; }
  const oauthStates = new Map();
  const syncCache = new Map();

  /* ---------- encryption ---------- */
  function secretKey() {
    // Prefer a secret that survives restarts: an explicit one, else the (stable, server-only) Supabase key.
    const stable = process.env.CANVAS_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (stable) return crypto.createHash('sha256').update('index-canvas-v1:' + String(stable)).digest();
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

  /* ---------- durable storage ----------
     Records live in memory + a local file, and (when Supabase is configured) in the existing accounts table as a
     row with id "canvas:<userId>", so a Render restart / 15-minute idle spin-down never disconnects a student.
     The token inside is AES-GCM encrypted. The connection lasts until Canvas itself rejects the token. */
  const remoteOn = () => !!(supabase && supabase.enabled);
  const rid = uid => encodeURIComponent('canvas:' + uid);
  async function getRec(uid) {
    if (store[uid]) return store[uid];
    if (!remoteOn()) return null;
    try {
      const rows = await supabase.request('index_accounts?select=account_data_blob&id=eq.' + rid(uid) + '&limit=1');
      const blob = Array.isArray(rows) && rows[0] && rows[0].account_data_blob;
      if (!blob) return null;
      const rec = JSON.parse(Buffer.from(String(blob), 'base64').toString('utf8'));
      if (rec && rec.host && rec.enc) { store[uid] = rec; return rec; }
    } catch (e) { console.error('Canvas record load failed:', e.message); }
    return null;
  }
  async function putRec(uid, rec) {
    store[uid] = rec; save();
    if (!remoteOn()) return;
    try {
      await supabase.request('index_accounts', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: 'canvas:' + uid, method: 'canvas', first_name: '', last_name: '', account_data_blob: Buffer.from(JSON.stringify(rec), 'utf8').toString('base64'), updated_at: new Date().toISOString() }) });
    } catch (e) { console.error('Canvas record save failed:', e.message); }
  }
  async function delRec(uid) {
    delete store[uid]; syncCache.delete(uid); save();
    if (!remoteOn()) return;
    try { await supabase.request('index_accounts?id=eq.' + rid(uid), { method: 'DELETE' }); } catch (e) { console.error('Canvas record delete failed:', e.message); }
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
  function authErr(message) { const e = httpErr(401, message); e.canvasAuth = true; return e; }

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
    const rec = await getRec(userId); if (!rec) throw httpErr(404, 'Canvas is not connected.');
    if (rec.kind === 'oauth' && rec.refresh && (force || (rec.expiresAt && Date.now() > rec.expiresAt - 60000))) {
      const k = oauthKey(rec.host);
      if (k) {
        const r = await cfetch(rec.host, '/login/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', client_id: k.id, client_secret: k.secret, refresh_token: dec(rec.refresh) }).toString() });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.access_token) { rec.enc = enc(j.access_token); rec.expiresAt = Date.now() + (Number(j.expires_in) || 3600) * 1000; await putRec(userId, rec); }
        else throw authErr('Canvas needs you to sign in again.');
      }
    }
    return dec(rec.enc);
  }
  /** GET with auto-refresh on 401 and Link-header pagination. */
  async function getJson(userId, pathQuery, pages) {
    const rec = await getRec(userId); let token = await accessToken(userId, false); const out = []; let next = pathQuery, n = 0;
    while (next && n < (pages || 1)) {
      let r = await cfetch(rec.host, next, { token });
      if (r.status === 401 && rec.kind === 'oauth') { token = await accessToken(userId, true); r = await cfetch(rec.host, next, { token }); }
      if (r.status === 401) throw authErr('Canvas rejected the saved sign-in. Please reconnect.');
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

  app.get('/api/canvas/status', needUser, async (req, res) => {
    const host = cleanHost(req.query.host);
    res.json({ ok: true, oauthConfigured: oauthAnywhere(), oauthForHost: host ? !!oauthKey(host) : undefined, connection: publicRec(await getRec(req.user.id)) });
  });

  async function connect(userId, host, kind, tokens) {
    const me = await (async () => {
      const r = await cfetch(host, '/api/v1/users/self/profile', { token: tokens.access });
      if (r.status === 401) throw httpErr(401, 'Canvas did not accept that. Check the address and token.');
      if (!r.ok) throw httpErr(400, 'That does not look like a Canvas site (HTTP ' + r.status + ').');
      return r.json();
    })();
    await putRec(userId, { host, kind, enc: enc(tokens.access), refresh: tokens.refresh ? enc(tokens.refresh) : '', expiresAt: tokens.expiresAt || 0, name: String(me.name || me.short_name || '').slice(0, 80), canvasUserId: me.id, connectedAt: Date.now(), lastSync: 0 });
    syncCache.delete(userId);
  }

  app.post('/api/canvas/token', needUser, async (req, res) => {
    try {
      const host = cleanHost(req.body && req.body.host); const token = String((req.body && req.body.token) || '').trim();
      if (!host) return res.status(400).json({ ok: false, error: 'Enter your school\'s Canvas address, like myschool.instructure.com.' });
      if (!/^[A-Za-z0-9~_.\-]{16,300}$/.test(token)) return res.status(400).json({ ok: false, error: 'That does not look like a Canvas access token.' });
      await connect(req.user.id, host, 'token', { access: token });
      res.json({ ok: true, connection: publicRec(await getRec(req.user.id)) });
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
    const rec = await getRec(req.user.id);
    if (rec && rec.kind === 'oauth') { try { await cfetch(rec.host, '/login/oauth2/token', { method: 'DELETE', token: dec(rec.enc), timeout: 6000 }); } catch (e) { /* best effort */ } }
    await delRec(req.user.id);
    res.json({ ok: true });
  });

  /* ---------- sync: classes + assignments ---------- */
  async function mapLimit(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = { error: e }; } } }));
    return out;
  }
  app.get('/api/canvas/sync', needUser, async (req, res) => {
    const uid = req.user.id, rec = await getRec(uid);
    if (!rec) return res.status(404).json({ ok: false, error: 'Canvas is not connected.' });
    const cached = syncCache.get(uid);
    if (cached && Date.now() - cached.at < (req.query.force ? 15000 : SYNC_TTL_MS)) return res.json(Object.assign({ ok: true, cached: true }, cached.data));
    try {
      const rawCourses = await getJson(uid, '/api/v1/courses?enrollment_state=active&enrollment_type=student&include[]=term&include[]=total_scores&include[]=teachers&per_page=50', 2);
      // Only the classes on the student's own Canvas dashboard (not old/finished ones)
      let pool = rawCourses.filter(c => c && c.id && !c.access_restricted_by_date);
      let ids = null;
      try {
        const cards = await getJson(uid, '/api/v1/dashboard/dashboard_cards', 1);
        const set = new Set(cards.map(x => String(x && (x.id || String(x.assetString || '').replace('course_', ''))).trim()).filter(Boolean));
        if (set.size) ids = set;
      } catch (e) { if (e.canvasAuth) throw e; }
      if (!ids) {
        try {
          const fav = await getJson(uid, '/api/v1/users/self/favorites/courses', 1);
          const set = new Set(fav.map(x => String(x && x.id)).filter(Boolean));
          if (set.size) ids = set;
        } catch (e) { if (e.canvasAuth) throw e; }
      }
      let picked = ids ? pool.filter(c => ids.has(String(c.id))) : [];
      if (!picked.length) { // no dashboard info: keep only courses whose dates haven't ended
        const now = Date.now();
        picked = pool.filter(c => { const ends = [c.end_at, c.term && c.term.end_at].filter(Boolean).map(Date.parse).filter(Number.isFinite); return !ends.length || ends.every(t => t > now - 7 * 864e5); });
      }
      const courses = picked.slice(0, MAX_COURSES).map(normCourse);
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
      if (e.canvasAuth) { await delRec(uid); } // Canvas says the token is dead (expired/revoked): drop it so the student reconnects
      console.error('Canvas sync error:', e.message); fail(res, e);
    }
  });

  /* ---------- one assignment in full (for "Study this") ---------- */
  const FILE_MAX = 8 * 1024 * 1024;
  async function downloadPublic(url, depth) {
    const u = new URL(url); if (u.protocol !== 'https:') throw new Error('not https');
    await assertPublic(u.hostname);
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { if ((depth || 0) >= 3) throw new Error('redirects'); return downloadPublic(new URL(r.headers.get('location'), u).toString(), (depth || 0) + 1); }
    if (!r.ok) throw new Error('status ' + r.status);
    if (Number(r.headers.get('content-length') || 0) > FILE_MAX) throw new Error('too big');
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > FILE_MAX) throw new Error('too big');
    return buf;
  }
  async function fileText(uid, host, fileId) {
    const meta = await getJson(uid, `/api/v1/files/${fileId}`, 1);
    const name = String(meta.display_name || meta.filename || 'file').slice(0, 120), ext = (name.split('.').pop() || '').toLowerCase(), size = Number(meta.size || 0);
    if (!meta.url || size > FILE_MAX) return { name, text: '', why: 'too large' };
    const buf = await downloadPublic(meta.url);
    let text = '';
    if (ext === 'pdf') text = ((await require('pdf-parse/lib/pdf-parse.js')(buf)).text || '');
    else if (ext === 'docx') text = ((await require('mammoth').extractRawText({ buffer: buf })).value || '');
    else if (['txt', 'md', 'csv', 'rtf'].includes(ext)) text = buf.toString('utf8');
    else if (['html', 'htm'].includes(ext)) text = strip(buf.toString('utf8'));
    else return { name, text: '', why: 'unsupported type (.' + ext + ')' };
    text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    return { name, text: text.slice(0, 5000), why: text ? '' : 'no readable text (scanned image?)' };
  }
  app.get('/api/canvas/assignment', needUser, async (req, res) => {
    const cid = String(req.query.cid || ''), id = String(req.query.id || ''), uid = req.user.id;
    if (!/^\d{1,20}$/.test(cid) || !/^\d{1,20}$/.test(id)) return res.status(400).json({ ok: false, error: 'Bad assignment.' });
    try {
      const rec = await getRec(uid); if (!rec) return res.status(404).json({ ok: false, error: 'Canvas is not connected.' });
      const a = await getJson(uid, `/api/v1/courses/${cid}/assignments/${id}`, 1);
      if (!a || Array.isArray(a)) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
      const html = String(a.description || '');
      const rubric = (Array.isArray(a.rubric) ? a.rubric : []).slice(0, 12).map(r => ({ name: String(r.description || '').slice(0, 120), detail: strip(r.long_description).slice(0, 300), points: r.points }));
      // attached files + linked Canvas pages inside the instructions
      const fileIds = [...new Set([...html.matchAll(/\/files\/(\d{1,20})/g)].map(m => m[1]))].slice(0, 3);
      const pageSlugs = [...new Set([...html.matchAll(/\/courses\/(\d{1,20})\/pages\/([A-Za-z0-9_\-%.]{1,120})/g)].map(m => m[1] + '/' + m[2]))].slice(0, 2);
      const sources = [], unread = [];
      for (const fid of fileIds) {
        try { const f = await fileText(uid, rec.host, fid); if (f.text) sources.push({ kind: 'file', name: f.name, text: f.text }); else unread.push(f.name + (f.why ? ' (' + f.why + ')' : '')); }
        catch (e) { if (e.canvasAuth) throw e; unread.push('a linked file'); }
      }
      for (const pg of pageSlugs) {
        try { const [pc, slug] = pg.split('/'); const p = await getJson(uid, `/api/v1/courses/${pc}/pages/${slug}`, 1); const t = strip(p && p.body).slice(0, 3500); if (t) sources.push({ kind: 'page', name: String(p.title || 'Page').slice(0, 120), text: t }); }
        catch (e) { if (e.canvasAuth) throw e; unread.push('a linked page'); }
      }
      const external = [...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map(m => m[1]).filter(u => { try { return new URL(u).hostname !== rec.host; } catch (e) { return false; } }).length;
      if (external) unread.push(external + ' outside link' + (external === 1 ? '' : 's') + ' (Google Docs, websites…)');
      let text = strip(html).slice(0, 4000);
      res.json({ ok: true, name: String(a.name || '').slice(0, 160), text, sources: sources.map(x => ({ kind: x.kind, name: x.name, text: x.text })), unread: unread.slice(0, 6), rubric, points: a.points_possible, types: (a.submission_types || []).slice(0, 4) });
    } catch (e) { if (e.canvasAuth) await delRec(req.user.id); console.error('Canvas assignment error:', e.message); fail(res, e); }
  });

  return { forgetUser(id) { delRec(id).catch(() => {}); } };
}
module.exports = { init };
