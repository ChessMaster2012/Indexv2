const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Readable } = require('stream');

const PORT = process.env.PORT || 3000;
const QUESTION_MS = 20000;
const MIN_QUESTION_MS = 5000;
const MAX_QUESTION_MS = 60000;
const ROOM_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
const SESSION_COOKIE = 'index_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Safety / conduct guardrails for a student-facing study tool.
const CONDUCT_PATTERNS = [
  /\b(?:porn|xxx|nudes?|sext(?:ing)?|rape|molest|groom(?:ing)?)\b/i,
  /\b(?:kill yourself|kys|go die|suicide)\b/i,
  /\b(?:fuck|fucker|shit|bitch|asshole|slut|whore)\b/i,
  /\b(?:nazi|kkk)\b/i
];
function normalizeNameForModeration(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z0-9]/g, '');
}
function containsConductViolation(text) {
  const raw = String(text || '');
  const normalized = normalizeNameForModeration(raw);
  return CONDUCT_PATTERNS.some(re => re.test(raw)) ||
    /(?:porn|xxx|nudes|sexting|rape|molest|grooming|kills?yourself|kys|godie|fuck|fucker|shit|bitch|asshole|slut|whore|nazi|kkk)/i.test(normalized);
}
function nameViolationReason(value) {
  const name = String(value || '').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 40);
  if (!name) return 'Please enter a name.';
  if (containsConductViolation(name)) return 'That name is not allowed. Please pick a different name.';
  return '';
}
function cleanDisplayName(value, fallback='Player') {
  const name = String(value || '').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 40);
  if (!name || containsConductViolation(name)) return fallback;
  return name;
}
function cleanRoomTitle(value) {
  const title = String(value || '').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 120);
  return containsConductViolation(title) ? 'Live Study Game' : (title || 'Live Study Game');
}
function aiContentIsAllowed(messages) {
  // The tutor can discuss sensitive subjects academically, but should not be used
  // to create harassment, sexual content, or instructions for harmful behavior.
  const userText = messages.filter(m => m && m.role === 'user').map(m => String(m.content || '')).join('\n');
  return !CONDUCT_PATTERNS.some(re => re.test(userText)) || /class|history|biology|health|civics|literature|science|safety|policy|academic/i.test(userText);
}
const aiRate = new Map();
function aiRateAllowed(ip) {
  const now = Date.now(), windowMs = 60_000, max = 60;
  const arr = (aiRate.get(ip) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { aiRate.set(ip, arr); return false; }
  arr.push(now); aiRate.set(ip, arr); return true;
}


// Local AI runtime/model proxy.
// The browser only contacts Index. Large model/runtime files are cached by the browser;
// text generation happens on the student's device, so there is no AI API meter or provider bill.
const LOCAL_AI_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
const LOCAL_AI_MODELS = {
  'onnx-community/Qwen2.5-0.5B-Instruct': new Set([
    'added_tokens.json','config.json','generation_config.json','merges.txt','quantize_config.json','special_tokens_map.json','tokenizer.json','tokenizer_config.json','vocab.json','onnx/model_q4f16.onnx'
  ]),
  'onnx-community/SmolLM2-360M-Instruct-ONNX': new Set([
    'added_tokens.json','config.json','generation_config.json','merges.txt','quantize_config.json','special_tokens_map.json','tokenizer.json','tokenizer_config.json','vocab.json','onnx/model_quantized.onnx','onnx/model_q4f16.onnx'
  ])
};

app.get('/api/ai/assets/:asset', async (req,res)=>{
  const asset=String(req.params.asset||'');
  if(!/^(?:transformers(?:\.web)?(?:\.min)?\.js|ort-wasm-[A-Za-z0-9._-]+\.(?:mjs|wasm))$/.test(asset)) return res.status(404).end();
  try{
    const r=await fetch(LOCAL_AI_CDN+asset,{headers:{accept:'*/*'}});
    if(!r.ok) return res.status(r.status).send('AI runtime asset unavailable.');
    res.setHeader('Content-Type',asset.endsWith('.wasm')?'application/wasm':'text/javascript');
    res.setHeader('Cache-Control','public,max-age=31536000,immutable');
    if(r.body) Readable.fromWeb(r.body).pipe(res); else res.end(Buffer.from(await r.arrayBuffer()));
  }catch(e){ console.error('AI runtime proxy:',e.message); res.status(502).send('AI runtime asset unavailable.'); }
});

app.get('/api/ai/model/*', async (req,res)=>{
  const parts=String(req.params[0]||'').split('/');
  if(parts.length<5) return res.status(404).end();
  const model=`${parts[0]}/${parts[1]}`;
  const revision=parts[3]; const file=parts.slice(4).join('/');
  if(parts[2]!=='resolve' || revision!=='main') return res.status(404).end();
  const allowed=LOCAL_AI_MODELS[model];
  if(!allowed || !allowed.has(file)) return res.status(404).end();
  const target=`https://huggingface.co/${model}/resolve/${revision}/${file}`;
  try{
    const r=await fetch(target,{headers:{accept:'*/*'}});
    if(!r.ok) return res.status(r.status).send('Local AI model file unavailable.');
    res.setHeader('Content-Type',r.headers.get('content-type')||'application/octet-stream');
    res.setHeader('Cache-Control','public,max-age=31536000,immutable');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    const len=r.headers.get('content-length'); if(len) res.setHeader('Content-Length',len);
    if(r.body) Readable.fromWeb(r.body).pipe(res); else res.end(Buffer.from(await r.arrayBuffer()));
  }catch(e){ console.error('AI model proxy:',e.message); res.status(502).send('Local AI model unavailable.'); }
});

// School-network-friendly AI proxy.
// The browser talks only to Index. When configured, the server uses the current
// Pollinations OpenAI-compatible API. Without a key, it makes a single best-effort
// legacy request as a compatibility fallback rather than retrying aggressively.
const AI_MODEL_CHAIN = [
  'google/gemini-3.8-flash',
  'deepseek/deepseek-v4-flash',
  'openai/gpt-5.4-nano'
];
function aiErrorMessage(status, body){
  const raw=String(body||'').slice(0,500);
  if(status===401) return 'Pollinations rejected the server key. Check POLLINATIONS_API_KEY on Render.';
  if(status===402) return 'Pollinations has no available Pollen for the configured account/key.';
  if(status===429) return 'The AI provider is busy right now. Please try again in a moment.';
  if(status>=500) return 'The AI provider had a temporary server error. Please try again.';
  return raw || `AI provider returned HTTP ${status}.`;
}
async function pollinationsChat(messages){
  const key=String(process.env.POLLINATIONS_API_KEY || '').trim();
  if(!key) return null;
  let lastErr=null;
  for(const model of AI_MODEL_CHAIN){
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(), 24000);
    try{
      const upstream=await fetch('https://gen.pollinations.ai/v1/chat/completions',{
        method:'POST',
        signal:controller.signal,
        headers:{'content-type':'application/json','authorization':`Bearer ${key}`,'accept':'application/json'},
        body:JSON.stringify({model,messages,temperature:0.2,max_tokens:900,stream:false})
      });
      const body=await upstream.text();
      if(upstream.ok){
        const data=JSON.parse(body); const content=data?.choices?.[0]?.message?.content;
        if(content && String(content).trim()) return String(content).trim();
        lastErr=new Error('Pollinations returned no text.');
      }else{
        lastErr=new Error(aiErrorMessage(upstream.status,body));
        if(![408,429,500,502,503,504].includes(upstream.status)) break;
      }
    }catch(e){ lastErr=e; } finally{ clearTimeout(timer); }
  }
  throw lastErr || new Error('Pollinations AI request failed.');
}
async function pollinationsLegacy(prompt){
  const url='https://text.pollinations.ai/'+encodeURIComponent(prompt)+'?model=openai';
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),18000);
  try{
    const r=await fetch(url,{signal:controller.signal,headers:{accept:'text/plain'}});
    const body=await r.text();
    if(!r.ok) throw new Error(aiErrorMessage(r.status,body));
    if(!body.trim()) throw new Error('The AI provider returned an empty response.');
    return body.trim();
  }finally{ clearTimeout(timer); }
}
app.get('/api/ai-status',(req,res)=>{
  res.json({enabled:true, localFirst:true, serverProvider:!!process.env.POLLINATIONS_API_KEY, legacyFallback:true});
});
app.post('/api/ai/chat', async (req,res)=>{
  try{
    const incoming=Array.isArray(req.body?.messages)?req.body.messages:[];
    const messages=incoming.filter(m=>m && ['system','user','assistant'].includes(m.role)).map(m=>({role:m.role,content:String(m.content||'').slice(0,7000)})).slice(-18);
    if(!messages.length) return res.status(400).json({error:'No messages supplied.'});
    if(!aiContentIsAllowed(messages)) return res.status(400).json({error:'I can help with academic or safety-focused questions, but not harmful, sexual, or harassing content.'});
    const tutorQuality=`You are a strong, careful school tutor for middle and high school students. Teach the reasoning and remember the conversation. Directly answer follow-up questions using previous turns. Be concise but specific.
ACADEMIC INTEGRITY: if the student says this is an active graded test, quiz, exam, or assessment, do not provide the direct answer; teach the concept or a similar example.
MATH/SCIENCE: use Unicode symbols such as √ × ÷ ± ≤ ≥ ≠ ≈ → ∑ π ° and never output LaTeX delimiters or raw commands.
NEVER invent sources, quotations, statistics, or citations.`;
    const systemIndex=messages.findIndex(m=>m.role==='system');
    if(systemIndex>=0) messages[systemIndex].content=`${tutorQuality}\n\n${messages[systemIndex].content}`; else messages.unshift({role:'system',content:tutorQuality});
    try{
      const content=await pollinationsChat(messages);
      if(content) return res.json({content,provider:'pollinations'});
    }catch(primary){
      console.warn('Current Pollinations API failed:',primary.message);
    }
    const prompt=messages.map(m=>`${m.role==='system'?'System':m.role==='assistant'?'Tutor':'Student'}: ${m.content}`).join('\n\n').slice(0,18000);
    const legacy=await pollinationsLegacy(`${prompt}\n\nTutor:`);
    return res.json({content:legacy,provider:'pollinations-legacy'});
  }catch(err){
    console.error('AI proxy failed:',err);
    res.status(502).json({error:String(err?.message||err||'AI provider request failed')});
  }
});

function publicOrigin(req){
  if(PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const proto=String(req.headers['x-forwarded-proto']||req.protocol||'https').split(',')[0].trim();
  const host=String(req.headers['x-forwarded-host']||req.get('host')||'').split(',')[0].trim();
  return `${proto}://${host}`;
}
function googleRedirectUri(req){ return `${publicOrigin(req)}/api/auth/google/callback`; }


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
 *   firstName, lastName,              // optional display name
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
      arr.forEach(u => {
        delete u.school; delete u.grade;
        users.set(u.method + ':' + u.identifier, u); usersById.set(u.id, u);
      });
      saveUsers();
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
    firstName: u.firstName || '', lastName: u.lastName || '',
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
function findUserByEmail(email) {
  const target = normalizeEmail(email);
  if (!target) return null;
  for (const u of usersById.values()) {
    const uemail = normalizeEmail(u.email || (u.method === 'email' ? u.identifier : ''));
    if (uemail && uemail === target) return u;
  }
  return null;
}
function normalizePhone(v) { return String(v || '').replace(/[^0-9+]/g, ''); }
function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidPhone(v) { return /^\+?[0-9]{7,15}$/.test(v); }

app.get('/api/auth/status', (req, res) => {
  res.json({ googleEnabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) });
});

app.get('/api/auth/google/redirect-uri', (req, res) => {
  res.json({ enabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET), redirectUri: googleRedirectUri(req) });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/auth/signup', (req, res) => {
  let { method, identifier, password } = req.body || {};
  if (method !== 'email') return res.status(400).json({ error: 'Only email sign-up is supported.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  identifier = normalizeEmail(identifier);
  if (!isValidEmail(identifier)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const key = method + ':' + identifier;
  if (users.has(key)) return res.status(409).json({ error: 'An account with that ' + method + ' already exists — try logging in instead.' });
  const { salt, hash } = hashPassword(password);
  const user = { id: crypto.randomBytes(12).toString('hex'), method, identifier, passwordHash: hash, salt, firstName: '', lastName: '', createdAt: Date.now() };
  users.set(key, user); usersById.set(user.id, user); saveUsers();
  const token = createSession(user.id);
  setSessionCookie(res, token);
  res.json({ ok: true, user: publicUser(user), isNew: true });
});

app.post('/api/auth/login', (req, res) => {
  let { method, identifier, password } = req.body || {};
  if (method !== 'email') return res.status(400).json({ error: 'Only email sign-in is supported.' });
  identifier = normalizeEmail(identifier);
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
  const displayName = String(req.body?.displayName || '').trim().slice(0, 60);
  if (containsConductViolation(displayName)) return res.status(400).json({ error: 'That name is not allowed. Please pick a different name.' });
  req.user.firstName = displayName;
  req.user.lastName = '';
  delete req.user.school;
  delete req.user.grade;
  saveUsers();
  res.json({ ok: true, user: publicUser(req.user) });
});

app.post('/api/auth/delete', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  const user = req.user;
  users.delete(user.method + ':' + user.identifier);
  usersById.delete(user.id);
  if (req.sessionToken) sessions.delete(req.sessionToken);
  saveUsers();
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/google/start', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(501).send('Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  const redirectUri = googleRedirectUri(req);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email');
  url.searchParams.set('prompt', 'select_account');
  res.redirect(url.toString());
});

app.get('/api/auth/google/callback', async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(501).send('Google sign-in is not configured on this server.');
  const { code } = req.query;
  if (!code) return res.redirect('/?authError=' + encodeURIComponent('Google sign-in was cancelled.'));
  try {
    const redirectUri = googleRedirectUri(req);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) throw new Error(tokenData.error_description || tokenData.error || 'Google did not return an access token.');
    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tokenData.access_token}` } });
    const profile = await profileRes.json();
    if (!profile.sub) throw new Error('Google did not return a profile.');
    const key = 'google:' + profile.sub;
    let user = users.get(key);
    let isNew = false;

    // Reuse an existing email account when the Google email matches. This prevents
    // duplicate accounts and makes Google sign-in keep the same profile across devices.
    if (!user && profile.email) user = findUserByEmail(profile.email);

    if (!user) {
      isNew = true;
      user = {
        id: crypto.randomBytes(12).toString('hex'), method: 'google', identifier: profile.sub, googleId: profile.sub,
        email: profile.email || '', firstName: '', lastName: '', createdAt: Date.now()
      };
      usersById.set(user.id, user);
    }

    user.googleId = profile.sub;
    if (profile.email) user.email = profile.email;
    if (!user.firstName && profile.given_name) user.firstName = cleanDisplayName(profile.given_name, '');
    if (!user.firstName && profile.name) user.firstName = cleanDisplayName(profile.name, '');
    users.set(key, user);
    if (user.method === 'email') users.set('email:' + normalizeEmail(user.identifier), user);
    usersById.set(user.id, user);
    saveUsers();

    const token = createSession(user.id);
    setSessionCookie(res, token);
    res.redirect('/?welcome=1' + (isNew || !user.firstName ? '&complete=1' : ''));
  } catch (e) {
    console.error('Google OAuth callback failed:', e);
    res.redirect('/?authError=' + encodeURIComponent('Google sign-in could not be completed. Check the Google redirect URI in your Google Cloud OAuth client and try again.'));
  }
});


// Google Drive note import. Drive tokens live only in memory and are never written to users.json.
const driveOauthStates = new Map();
const driveConnections = new Map();
const DRIVE_SESSION_COOKIE = 'index_drive_session';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
function getDriveSessionId(req, res) {
  const cookies = parseCookies(req);
  let id = cookies[DRIVE_SESSION_COOKIE];
  if (!id || !/^[a-f0-9]{32}$/.test(id)) {
    id = crypto.randomBytes(16).toString('hex');
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${DRIVE_SESSION_COOKIE}=${id}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax${secure}`);
  }
  return id;
}
function driveConfigured() { return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET); }
function cleanDriveName(name) { return String(name || 'Imported note').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 120) || 'Imported note'; }
function driveRedirectUri(req) { return `${req.protocol}://${req.get('host')}/api/drive/callback`; }

app.get('/api/drive/status', (req, res) => {
  const id = getDriveSessionId(req, res);
  const conn = driveConnections.get(id);
  res.json({ configured: driveConfigured(), connected: !!conn?.accessToken });
});

app.get('/api/drive/start', (req, res) => {
  if (!driveConfigured()) return res.status(501).send('Google Drive import is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Render.');
  const driveSessionId = getDriveSessionId(req, res);
  const state = crypto.randomBytes(24).toString('hex');
  driveOauthStates.set(state, { driveSessionId, createdAt: Date.now() });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', driveRedirectUri(req));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', DRIVE_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.get('/api/drive/callback', async (req, res) => {
  if (!driveConfigured()) return res.status(501).send('Google Drive import is not configured on this server.');
  const { code, state, error } = req.query;
  const saved = state && driveOauthStates.get(String(state));
  if (state) driveOauthStates.delete(String(state));
  if (error || !saved || Date.now() - saved.createdAt > 10 * 60 * 1000) {
    return res.redirect('/?driveError=' + encodeURIComponent(error ? 'Google Drive connection was cancelled.' : 'Google Drive connection expired.'));
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: driveRedirectUri(req), grant_type: 'authorization_code' })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'Google did not return an access token.');
    driveConnections.set(saved.driveSessionId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || '',
      expiresAt: Date.now() + (Number(tokenData.expires_in) || 3600) * 1000 - 60_000
    });
    res.redirect('/?driveConnected=1');
  } catch (e) {
    res.redirect('/?driveError=' + encodeURIComponent('Could not connect Google Drive. Please try again.'));
  }
});

async function getDriveAccessToken(req, res) {
  const id = getDriveSessionId(req, res);
  const conn = driveConnections.get(id);
  if (!conn?.accessToken) return null;
  if (Date.now() < conn.expiresAt) return conn.accessToken;
  if (!conn.refreshToken) return null;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: conn.refreshToken, grant_type: 'refresh_token' })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return null;
  conn.accessToken = tokenData.access_token;
  conn.expiresAt = Date.now() + (Number(tokenData.expires_in) || 3600) * 1000 - 60_000;
  return conn.accessToken;
}

app.get('/api/drive/files', async (req, res) => {
  try {
    const token = await getDriveAccessToken(req, res);
    if (!token) return res.status(401).json({ error: 'Connect Google Drive first.' });
    const q = "trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'text/markdown' or mimeType = 'text/csv' or mimeType = 'application/json')";
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q);
    url.searchParams.set('pageSize', '50');
    url.searchParams.set('orderBy', 'modifiedTime desc');
    url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,size)');
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Google Drive request failed.');
    res.json({ files: Array.isArray(data.files) ? data.files : [] });
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e || 'Could not load Google Drive files.') });
  }
});

app.get('/api/drive/import/:fileId', async (req, res) => {
  try {
    const token = await getDriveAccessToken(req, res);
    if (!token) return res.status(401).json({ error: 'Connect Google Drive first.' });
    const fileId = String(req.params.fileId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!fileId) return res.status(400).json({ error: 'Invalid Google Drive file.' });
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`, { headers: { authorization: `Bearer ${token}` } });
    const meta = await metaRes.json();
    if (!metaRes.ok) throw new Error(meta.error?.message || 'Could not read the Google Drive file.');
    let text = '';
    if (meta.mimeType === 'application/vnd.google-apps.document') {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`, { headers: { authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('Could not export this Google Doc as text.');
      text = await r.text();
    } else if (/^text\//i.test(meta.mimeType || '') || ['application/json','text/markdown','text/csv'].includes(meta.mimeType)) {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('Could not download this file.');
      text = await r.text();
    } else {
      return res.status(415).json({ error: 'That Google Drive file type cannot be imported as text. Use a Google Doc or text/Markdown/CSV file.' });
    }
    text = String(text || '').replace(/\u0000/g, '').trim().slice(0, 120000);
    if (!text) return res.status(400).json({ error: 'That file is empty.' });
    res.json({ title: cleanDriveName(meta.name).replace(/\.[^.]+$/, ''), content: text, source: 'Google Drive' });
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e || 'Could not import the Google Drive file.') });
  }
});

app.post('/api/drive/disconnect', (req, res) => {
  const id = getDriveSessionId(req, res);
  driveConnections.delete(id);
  res.json({ ok: true });
});

setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of driveOauthStates) if (value.createdAt < cutoff) driveOauthStates.delete(key);
}, 10 * 60 * 1000);

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
 *   config: { questionCount, shuffleQuestions, shuffleAnswers, showLeaderboard, autoAdvance, maxPlayers },
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
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sanitizeQuestions(questions, config = {}) {
  if (!Array.isArray(questions)) return [];
  let clean = questions
    .filter(q => q && typeof q.q === 'string' && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correct))
    .slice(0, 30)
    .map(q => ({
      q: String(q.q).slice(0, 400),
      options: q.options.map(o => String(o).slice(0, 200)),
      correct: Math.max(0, Math.min(3, q.correct)),
      explanation: q.explanation ? String(q.explanation).slice(0, 400) : ''
    }));
  if (config.shuffleQuestions) clean = shuffleArray(clean);
  const count = Math.max(1, Math.min(30, Number(config.questionCount) || clean.length));
  clean = clean.slice(0, count);
  if (config.shuffleAnswers) {
    clean = clean.map(q => {
      const pairs = q.options.map((label, idx) => ({ label, correct: idx === q.correct }));
      const shuffled = shuffleArray(pairs);
      return { ...q, options: shuffled.map(x => x.label), correct: shuffled.findIndex(x => x.correct) };
    });
  }
  return clean;
}
function publicPlayers(room) {
  return Array.from(room.players.values())
    .map(p => ({ id: p.id, name: p.name, score: p.score, correctCount: p.correctCount, gold: p.gold, online: p.online, alive: p.alive !== false, streak: p.streak || 0 }))
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
  if (room.nextTimer) { clearTimeout(room.nextTimer); room.nextTimer = null; }
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
  if (room.config.autoAdvance) {
    room.nextTimer = setTimeout(() => {
      room.nextTimer = null;
      const next = room.currentQuestion + 1;
      if (next >= room.questions.length) endRoom(room);
      else startQuestion(room, next);
    }, 3000);
  }
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
      const { title, subjectId, mode, questions, hostName, config: rawConfig } = payload || {};
      const config = {
        questionCount: Math.max(1, Math.min(30, Number(rawConfig?.questionCount) || 10)),
        timePerQuestion: Math.max(5, Math.min(60, Number(rawConfig?.timePerQuestion) || 20)),
        shuffleQuestions: rawConfig?.shuffleQuestions !== false,
        shuffleAnswers: rawConfig?.shuffleAnswers === true,
        showLeaderboard: rawConfig?.showLeaderboard !== false,
        autoAdvance: rawConfig?.autoAdvance === true,
        maxPlayers: Math.max(2, Math.min(100, Number(rawConfig?.maxPlayers) || 50))
      };
      const clean = sanitizeQuestions(questions, config);
      if (clean.length === 0) return cb && cb({ ok: false, error: 'No valid questions provided.' });
      config.questionCount = clean.length;
      const code = genRoomCode();
      const hostToken = genId();
      const room = {
        code, hostToken, hostName: cleanDisplayName(hostName, 'Host'),
        mode: ['trivia', 'rocket', 'tower', 'gold', 'streak', 'elimination'].includes(mode) ? mode : 'trivia',
        title: cleanRoomTitle(title),
        subjectId: subjectId || '',
        questions: clean,
        config,
        status: 'lobby',
        currentQuestion: 0,
        questionStartedAt: 0,
        questionDurationMs: config.timePerQuestion * 1000,
        players: new Map(),
        answers: new Map(),
        revealTimer: null,
        nextTimer: null,
        createdAt: Date.now()
      };
      rooms.set(code, room);
      socket.join(code);
      joined = { code, playerId: null, role: 'host' };
      cb && cb({ ok: true, code, hostToken, config });
    } catch (e) {
      cb && cb({ ok: false, error: 'Could not create the room.' });
    }
  });

  socket.on('player:join', (payload, cb) => {
    const { code, name, playerId } = payload || {};
    const nameError = nameViolationReason(name);
    if (nameError) return cb && cb({ ok: false, error: nameError, code: 'NAME_NOT_ALLOWED' });
    const safeName = cleanDisplayName(name, 'Player');
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb && cb({ ok: false, error: 'No game found with that code.' });
    if (room.status !== 'lobby') return cb && cb({ ok: false, error: 'That game has already started.' });
    const existingId = playerId && room.players.has(playerId) ? playerId : null;
    if (!existingId && room.players.size >= room.config.maxPlayers) return cb && cb({ ok: false, error: 'This game is full.' });
    const id = existingId || genId();
    const existing = room.players.get(id);
    if (existing) {
      existing.online = true; existing.socketId = socket.id; existing.name = safeName;
    } else {
      room.players.set(id, { id, name: safeName, score: 0, correctCount: 0, gold: 0, chestsAvailable: 0, alive: true, streak: 0, online: true, socketId: socket.id });
    }
    socket.join(code.toUpperCase());
    joined = { code: room.code, playerId: id, role: 'player' };
    io.to(room.code).emit('room:roster', { players: publicPlayers(room), title: room.title, mode: room.mode, hostName: room.hostName, config: room.config });
    cb && cb({ ok: true, code: room.code, playerId: id, title: room.title, mode: room.mode, hostName: room.hostName, config: room.config });
  });

  socket.on('host:sync', (payload, cb) => {
    const { code, hostToken } = payload || {};
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken)) return cb && cb({ ok: false, error: 'Not authorized for that room.' });
    socket.join(room.code);
    joined = { code: room.code, playerId: null, role: 'host' };
    cb && cb({
      ok: true, code: room.code, title: room.title, mode: room.mode, config: room.config, status: room.status,
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
    if (room.mode === 'elimination' && player.alive === false) return;
    const key = room.currentQuestion + ':' + playerId;
    if (room.answers.has(key)) return; // already answered
    const q = room.questions[room.currentQuestion];
    const elapsed = Date.now() - room.questionStartedAt;
    const correct = idx === q.correct;
    let points = correct ? Math.max(100, Math.round(1000 * (1 - Math.min(elapsed, room.questionDurationMs) / room.questionDurationMs))) : 0;
    if (room.mode === 'streak') {
      points = correct ? Math.round(points * (1 + Math.min(player.streak || 0, 8) * 0.15)) : 0;
      player.streak = correct ? (player.streak || 0) + 1 : 0;
    } else if (correct) {
      player.streak = (player.streak || 0) + 1;
    } else {
      player.streak = 0;
    }
    if (room.mode === 'elimination' && !correct) player.alive = false;
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
  console.log('AI requests are proxied server-side for school-browser compatibility.');
});
