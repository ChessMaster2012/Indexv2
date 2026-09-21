const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const QUESTION_MS = 20000;
const ROOM_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SESSION_COOKIE = 'index_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================== AI =======================================
// The AI runs on the Render server, not inside the user's browser. This is
// important for managed school computers because the browser only needs to
// make a normal same-origin POST request to /api/ai/chat.
let serverAiPipelinePromise = null;
const AI_MODEL = 'onnx-community/SmolLM-135M-Instruct-ONNX';

async function getServerAiPipeline() {
  if (!serverAiPipelinePromise) {
    serverAiPipelinePromise = import('@huggingface/transformers')
      .then(async ({ pipeline, env }) => {
        env.allowRemoteModels = true;
        env.allowLocalModels = false;
        env.useFSCache = true;
        console.log(`Loading server AI model: ${AI_MODEL}`);
        const generator = await pipeline('text-generation', AI_MODEL, {
          dtype: 'q4'
        });
        console.log('Server AI model loaded.');
        return generator;
      })
      .catch(err => {
        serverAiPipelinePromise = null;
        throw err;
      });
  }
  return serverAiPipelinePromise;
}

function messagesToPrompt(messages) {
  const parts = [];
  for (const m of messages) {
    const role = m.role === 'system' ? 'System' : m.role === 'assistant' ? 'Tutor' : 'Student';
    parts.push(`${role}: ${m.content}`);
  }
  parts.push('Tutor:');
  return parts.join('\n\n');
}

app.get('/api/ai/health', async (req, res) => {
  res.json({
    ok: true,
    model: AI_MODEL,
    loaded: !!serverAiPipelinePromise
  });
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!messages.length) return res.status(400).json({ error: 'No messages supplied.' });

    const safeMessages = messages.slice(-12).map(m => ({
      role: ['system', 'user', 'assistant'].includes(m?.role) ? m.role : 'user',
      content: String(m?.content ?? '').slice(0, 6000)
    }));

    const generator = await getServerAiPipeline();
    const prompt = messagesToPrompt(safeMessages);
    const output = await generator(prompt, {
      max_new_tokens: 350,
      do_sample: false,
      return_full_text: false
    });

    const generated = output?.[0]?.generated_text;
    const content = typeof generated === 'string' ? generated.trim() : '';
    if (!content) throw new Error('AI returned an empty result.');

    res.json({ content });
  } catch (err) {
    console.error('Server AI failed:', err?.stack || err);
    res.status(502).json({
      error: 'Server AI unavailable.',
      detail: String(err?.message || err).slice(0, 500)
    });
  }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

/* ============================== ACCOUNTS ============================== */
/**
 * Users are stored in a flat JSON file — no database needed, consistent with
 * the rest of this app's "runs anywhere with zero infra" philosophy. Fine for
 * a classroom-scale number of accounts. Sessions are kept in memory only, so
 * everyone just logs back in if the server restarts.
 *
 * User = {
 *   id, method: 'email'|'phone'|'google', identifier,
 *   passwordHash, salt,              // present for email/phone accounts only
 *   googleId, email,                  // present for google accounts
 *   firstName, lastName, school, grade,
 *   createdAt
 * }
 */
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
let users = new Map(); // key: `${method}:${identifier}` -> user
let usersById = new Map();

function loadUsers() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(USERS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      arr.forEach(u => { users.set(u.method + ':' + u.identifier, u); usersById.set(u.id, u); });
    }
  } catch (e) { console.error('Could not load users.json:', e.message); }
}
function saveUsers() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(Array.from(usersById.values()), null, 2));
  } catch (e) { console.error('Could not save users.json:', e.message); }
}
loadUsers();

const sessions = new Map(); // token -> { userId, createdAt }

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(check, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, method: u.method, email: u.email || (u.method === 'email' ? u.identifier : ''),
    firstName: u.firstName || '', lastName: u.lastName || '', school: u.school || '', grade: u.grade || '',
    name: [u.firstName, u.lastName].filter(Boolean).join(' ')
  };
}
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}
function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}; SameSite=Lax${secure}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}
app.use((req, res, next) => {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  const session = token && sessions.get(token);
  req.user = session ? usersById.get(session.userId) || null : null;
  req.sessionToken = token || null;
  next();
});

function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function normalizePhone(v) { return String(v || '').replace(/[^0-9+]/g, ''); }
function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidPhone(v) { return /^\+?[0-9]{7,15}$/.test(v); }

app.get('/api/auth/status', (req, res) => {
  res.json({ googleEnabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/auth/signup', (req, res) => {
  let { method, identifier, password } = req.body || {};
  if (!['email', 'phone'].includes(method)) return res.status(400).json({ error: 'Invalid sign-up method.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  identifier = method === 'email' ? normalizeEmail(identifier) : normalizePhone(identifier);
  if (method === 'email' && !isValidEmail(identifier)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (method === 'phone' && !isValidPhone(identifier)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  const key = method + ':' + identifier;
  if (users.has(key)) return res.status(409).json({ error: 'An account with that ' + method + ' already exists — try logging in instead.' });
  const { salt, hash } = hashPassword(password);
  const user = { id: crypto.randomBytes(12).toString('hex'), method, identifier, passwordHash: hash, salt, firstName: '', lastName: '', school: '', grade: '', createdAt: Date.now() };
  users.set(key, user); usersById.set(user.id, user); saveUsers();
  const token = createSession(user.id);
  setSessionCookie(res, token);
  res.json({ ok: true, user: publicUser(user), isNew: true });
});

app.post('/api/auth/login', (req, res) => {
  let { method, identifier, password } = req.body || {};
  if (!['email', 'phone'].includes(method)) return res.status(400).json({ error: 'Invalid sign-in method.' });
  identifier = method === 'email' ? normalizeEmail(identifier) : normalizePhone(identifier);
  const user = users.get(method + ':' + identifier);
  if (!user || !user.passwordHash || !verifyPassword(password || '', user.salt, user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect ' + method + ' or password.' });
  }
  const token = createSession(user.id);
  setSessionCookie(res, token);
  res.json({ ok: true, user: publicUser(user), isNew: !user.firstName });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.sessionToken) sessions.delete(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/auth/profile', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  const { firstName, lastName, school, grade } = req.body || {};
  req.user.firstName = String(firstName || '').slice(0, 60);
  req.user.lastName = String(lastName || '').slice(0, 60);
  req.user.school = String(school || '').slice(0, 120);
  req.user.grade = String(grade || '').slice(0, 20);
  saveUsers();
  res.json({ ok: true, user: publicUser(req.user) });
});

app.get('/api/auth/google/start', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(501).send('Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');
  res.redirect(url.toString());
});

app.get('/api/auth/google/callback', async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(501).send('Google sign-in is not configured on this server.');
  const { code } = req.query;
  if (!code) return res.redirect('/?authError=' + encodeURIComponent('Google sign-in was cancelled.'));
  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'Google did not return an access token.');
    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tokenData.access_token}` } });
    const profile = await profileRes.json();
    if (!profile.sub) throw new Error('Google did not return a profile.');
    const key = 'google:' + profile.sub;
    let user = users.get(key);
    let isNew = false;
    if (!user) {
      isNew = true;
      user = {
        id: crypto.randomBytes(12).toString('hex'), method: 'google', identifier: profile.sub, googleId: profile.sub,
        email: profile.email || '', firstName: profile.given_name || '', lastName: profile.family_name || '',
        school: '', grade: '', createdAt: Date.now()
      };
      users.set(key, user); usersById.set(user.id, user); saveUsers();
    }
    const token = createSession(user.id);
    setSessionCookie(res, token);
    res.redirect('/?welcome=1' + (isNew || !user.firstName ? '&complete=1' : ''));
  } catch (e) {
    res.redirect('/?authError=' + encodeURIComponent('Could not complete Google sign-in. Please try again.'));
  }
});

/* ============================== GAME ENGINE ============================== */
/**
 * rooms: Map<code, Room>
 * Room = {
 *   code, hostToken, hostName, mode, title, subjectId,
 *   questions: [{ q, options:[4], correct, explanation }],
 *   status: 'lobby' | 'question' | 'reveal' | 'ended',
 *   currentQuestion: number,
 *   questionStartedAt: number,
 *   questionDurationMs: number,
 *   players: Map<playerId, { id, name, score, correctCount, gold, chestsAvailable, online, socketId }>,
 *   answers: Map<`${qIndex}:${playerId}`, { idx, correct, points, ts }>,
 *   revealTimer: NodeJS.Timeout | null,
 *   createdAt: number
 * }
 */
const rooms = new Map();

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function sanitizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions
    .filter(q => q && typeof q.q === 'string' && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correct))
    .slice(0, 30)
    .map(q => ({
      q: String(q.q).slice(0, 400),
      options: q.options.map(o => String(o).slice(0, 200)),
      correct: Math.max(0, Math.min(3, q.correct)),
      explanation: q.explanation ? String(q.explanation).slice(0, 400) : ''
    }));
}
function publicPlayers(room) {
  return Array.from(room.players.values())
    .map(p => ({ id: p.id, name: p.name, score: p.score, correctCount: p.correctCount, gold: p.gold, online: p.online }))
    .sort((a, b) => b.score - a.score);
}
function questionForClients(room) {
  const q = room.questions[room.currentQuestion];
  return {
    index: room.currentQuestion,
    total: room.questions.length,
    q: q.q,
    options: q.options,
    mode: room.mode,
    questionDurationMs: room.questionDurationMs,
    startedAt: room.questionStartedAt
  };
}
function answeredCount(room) {
  let n = 0;
  for (const key of room.answers.keys()) if (key.startsWith(room.currentQuestion + ':')) n++;
  return n;
}
function clearRevealTimer(room) {
  if (room.revealTimer) { clearTimeout(room.revealTimer); room.revealTimer = null; }
}
function startQuestion(room, index) {
  clearRevealTimer(room);
  room.currentQuestion = index;
  room.status = 'question';
  room.questionStartedAt = Date.now();
  io.to(room.code).emit('room:question', questionForClients(room));
  io.to(room.code).emit('room:answered-count', { index, count: 0, total: room.players.size });
  room.revealTimer = setTimeout(() => revealQuestion(room), room.questionDurationMs + 300);
}
function revealQuestion(room) {
  if (room.status !== 'question') return;
  clearRevealTimer(room);
  room.status = 'reveal';
  const q = room.questions[room.currentQuestion];
  const counts = [0, 0, 0, 0];
  for (const [key, ans] of room.answers.entries()) {
    if (key.startsWith(room.currentQuestion + ':') && ans.idx >= 0 && ans.idx < 4) counts[ans.idx]++;
  }
  io.to(room.code).emit('room:reveal', {
    index: room.currentQuestion,
    correct: q.correct,
    explanation: q.explanation,
    counts,
    players: publicPlayers(room)
  });
}
function endRoom(room) {
  clearRevealTimer(room);
  room.status = 'ended';
  io.to(room.code).emit('room:ended', { players: publicPlayers(room) });
}
function requireHost(room, hostToken) {
  return room && room.hostToken === hostToken;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_MAX_AGE_MS) { clearRevealTimer(room); rooms.delete(code); }
  }
}, 30 * 60 * 1000);

io.on('connection', socket => {
  let joined = null; // { code, playerId, role }

  socket.on('host:create', (payload, cb) => {
    try {
      const { title, subjectId, mode, questions, hostName } = payload || {};
      const clean = sanitizeQuestions(questions);
      if (clean.length === 0) return cb && cb({ ok: false, error: 'No valid questions provided.' });
      const code = genRoomCode();
      const hostToken = genId();
      const room = {
        code, hostToken, hostName: (hostName || 'Host').slice(0, 40),
        mode: ['trivia', 'rocket', 'tower', 'gold'].includes(mode) ? mode : 'trivia',
        title: (title || 'Live Game').slice(0, 120),
        subjectId: subjectId || '',
        questions: clean,
        status: 'lobby',
        currentQuestion: 0,
        questionStartedAt: 0,
        questionDurationMs: QUESTION_MS,
        players: new Map(),
        answers: new Map(),
        revealTimer: null,
        createdAt: Date.now()
      };
      rooms.set(code, room);
      socket.join(code);
      joined = { code, playerId: null, role: 'host' };
      cb && cb({ ok: true, code, hostToken });
    } catch (e) {
      cb && cb({ ok: false, error: 'Could not create the room.' });
    }
  });

  socket.on('player:join', (payload, cb) => {
    const { code, name, playerId } = payload || {};
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb && cb({ ok: false, error: 'No game found with that code.' });
    if (room.status !== 'lobby') return cb && cb({ ok: false, error: 'That game has already started.' });
    const id = playerId || genId();
    const existing = room.players.get(id);
    if (existing) {
      existing.online = true; existing.socketId = socket.id; existing.name = (name || existing.name).slice(0, 40);
    } else {
      room.players.set(id, { id, name: (name || 'Player').slice(0, 40), score: 0, correctCount: 0, gold: 0, chestsAvailable: 0, online: true, socketId: socket.id });
    }
    socket.join(code.toUpperCase());
    joined = { code: room.code, playerId: id, role: 'player' };
    io.to(room.code).emit('room:roster', { players: publicPlayers(room), title: room.title, mode: room.mode, hostName: room.hostName });
    cb && cb({ ok: true, code: room.code, playerId: id, title: room.title, mode: room.mode, hostName: room.hostName });
  });

  socket.on('host:sync', (payload, cb) => {
    const { code, hostToken } = payload || {};
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken)) return cb && cb({ ok: false, error: 'Not authorized for that room.' });
    socket.join(room.code);
    joined = { code: room.code, playerId: null, role: 'host' };
    cb && cb({
      ok: true, code: room.code, title: room.title, mode: room.mode, status: room.status,
      players: publicPlayers(room),
      question: room.status === 'question' || room.status === 'reveal' ? questionForClients(room) : null
    });
  });

  socket.on('host:start', ({ code, hostToken } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken) || room.status !== 'lobby') return;
    startQuestion(room, 0);
  });

  socket.on('host:reveal', ({ code, hostToken } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken)) return;
    revealQuestion(room);
  });

  socket.on('host:next', ({ code, hostToken } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken) || room.status !== 'reveal') return;
    const next = room.currentQuestion + 1;
    if (next >= room.questions.length) endRoom(room);
    else startQuestion(room, next);
  });

  socket.on('host:end', ({ code, hostToken } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken)) return;
    endRoom(room);
  });

  socket.on('player:answer', ({ code, playerId, idx } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room || room.status !== 'question') return;
    const player = room.players.get(playerId);
    if (!player) return;
    const key = room.currentQuestion + ':' + playerId;
    if (room.answers.has(key)) return; // already answered
    const q = room.questions[room.currentQuestion];
    const elapsed = Date.now() - room.questionStartedAt;
    const correct = idx === q.correct;
    const points = correct ? Math.max(100, Math.round(1000 * (1 - Math.min(elapsed, room.questionDurationMs) / room.questionDurationMs))) : 0;
    room.answers.set(key, { idx, correct, points, ts: Date.now() });
    player.score += points;
    if (correct) {
      player.correctCount += 1;
      if (room.mode === 'gold') { player.gold += points; player.chestsAvailable += 1; }
    }
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) sock.emit('answer:ack', { index: room.currentQuestion, correct, points, myScore: player.score });
    io.to(room.code).emit('room:answered-count', {
      index: room.currentQuestion,
      count: answeredCount(room),
      total: room.players.size,
      players: publicPlayers(room)
    });
    if (answeredCount(room) >= room.players.size && room.players.size > 0) revealQuestion(room);
  });

  socket.on('player:openChest', ({ code, playerId } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room || room.mode !== 'gold') return;
    const player = room.players.get(playerId);
    if (!player || player.chestsAvailable <= 0) return;
    player.chestsAvailable -= 1;
    const bonus = 20 + Math.floor(Math.random() * 131); // 20-150 gold
    player.gold += bonus;
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) sock.emit('chest:result', { bonus, gold: player.gold });
    io.to(room.code).emit('room:roster', { players: publicPlayers(room) });
  });

  socket.on('disconnect', () => {
    if (!joined) return;
    const room = rooms.get(joined.code);
    if (!room) return;
    if (joined.role === 'player' && joined.playerId) {
      const p = room.players.get(joined.playerId);
      if (p) { p.online = false; io.to(room.code).emit('room:roster', { players: publicPlayers(room) }); }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Index study app listening on http://localhost:${PORT}`);
  console.log('AI runs locally in each browser with WebGPU (no server key required)');
});
