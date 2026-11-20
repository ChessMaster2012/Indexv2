/* StudentVUE bridge for the Grade Calculator.
   - The student's StudentVUE password is only forwarded to their school's StudentVUE server for this one request.
     It is never stored, never logged, and never leaves the HTTPS request body.
   - Only *.edupoint.com hosts (plus hosts returned by Edupoint's own district lookup) can be contacted. */
'use strict';
const https = require('https');
const { XMLParser } = require('fast-xml-parser');

const LOOKUP_KEY = '5E4B7859-B805-474B-A833-FDB15D205D40';   // Edupoint's public district-search key
const KNOWN_HOSTS = new Map();                                 // host -> expiry, filled by district lookups
const TEST_HOSTS = new Set(String(process.env.SV_TEST_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean));
const arrays = new Set(['Course', 'Mark', 'AssignmentGradeCalc', 'Assignment', 'ReportPeriod', 'DistrictInfo']);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', isArray: n => arrays.has(n), parseAttributeValue: false, parseTagValue: false, processEntities: true });

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function hostOk(host) {
  host = String(host || '').toLowerCase();
  if (TEST_HOSTS.has(host)) return true;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.edupoint\.com$/.test(host)) return true;
  const exp = KNOWN_HOSTS.get(host); return !!(exp && exp > Date.now());
}
function normalizeBase(input) {
  let u; try { u = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input); } catch (e) { return null; }
  if (TEST_HOSTS.has(u.host)) return { host: u.host, protocol: u.protocol };
  if (u.protocol !== 'https:' || u.username || u.password || !hostOk(u.hostname) || (u.port && u.port !== '443')) return null;
  return { host: u.hostname, protocol: 'https:' };
}

function soap(base, path, handle, method, params, creds, timeoutMs) {
  const body = '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
    '<ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>' + esc(creds ? creds.user : 'EdupointDistrictInfo') + '</userID><password>' + esc(creds ? creds.pass : 'Edup01nt') + '</password>' +
    '<skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>' + handle + '</webServiceHandleName><methodName>' + method + '</methodName><paramStr>' + esc(params) + '</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>';
  return new Promise((resolve, reject) => {
    const mod = base.protocol === 'http:' ? require('http') : https;
    const req = mod.request({ host: base.host.split(':')[0], port: base.host.includes(':') ? Number(base.host.split(':')[1]) : undefined, path, method: 'POST', timeout: timeoutMs || 20000,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': Buffer.byteLength(body), SOAPAction: '"http://edupoint.com/webservices/ProcessWebServiceRequest"', 'User-Agent': 'Mozilla/5.0 (compatible; IndexGradeCalc/1.0)' } }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', c => { data += c; if (data.length > 6e6) req.destroy(new Error('Response too large')); });
      res.on('end', () => {
        const m = /<ProcessWebServiceRequestResult[^>]*>([\s\S]*?)<\/ProcessWebServiceRequestResult>/.exec(data);
        if (!m) return reject(Object.assign(new Error('StudentVUE returned an unexpected response.'), { code: 'BAD_RESPONSE' }));
        resolve(unesc(m[1]));
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('StudentVUE took too long to answer.'), { code: 'TIMEOUT' })));
    req.on('error', e => reject(e.code ? e : Object.assign(e, { code: 'NETWORK' })));
    req.end(body);
  });
}

function num(v) { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; }
/* Reads one field whether the data came from XML attributes ("@_Title") or from JSON ("Title"/"title"). */
const norm = k => String(k).replace(/^@_?/, '').toLowerCase();
function pick(o, name) {
  if (o == null || typeof o !== 'object') return undefined;
  const want = name.toLowerCase();
  for (const k of Object.keys(o)) if (norm(k) === want) return o[k];
  return undefined;
}
const asArr = v => v == null ? [] : Array.isArray(v) ? v : [v];
const S = (o, n) => { const v = pick(o, n); return v == null || typeof v === 'object' ? '' : String(v); };
function listOf(node, itemName) {   // <Courses><Course/></Courses>, {Courses:[..]} or a bare array
  if (Array.isArray(node)) return node;
  const inner = pick(node, itemName); return asArr(inner);
}
function buildGradebook(gb) {
  const rps = pick(pick(gb, 'ReportingPeriods'), 'ReportPeriod') || pick(gb, 'ReportingPeriods');
  const periods = asArr(rps).filter(p => p && typeof p === 'object').map(p => ({ index: Number(S(p, 'Index')), name: S(p, 'GradePeriod'), start: S(p, 'StartDate'), end: S(p, 'EndDate') }));
  const cp = pick(gb, 'ReportingPeriod'); const cur = cp && typeof cp === 'object' && !Array.isArray(cp) ? { name: S(cp, 'GradePeriod'), start: S(cp, 'StartDate'), end: S(cp, 'EndDate') } : null;
  const courses = listOf(pick(gb, 'Courses'), 'Course').map(c => {
    const mark = listOf(pick(c, 'Marks'), 'Mark')[0] || {};
    const cats = listOf(pick(mark, 'GradeCalculationSummary'), 'AssignmentGradeCalc').map(a => ({ name: S(a, 'Type'), weight: num(S(a, 'Weight')) || 0, points: num(S(a, 'Points')), possible: num(S(a, 'PointsPossible')) })).filter(a => a.name);
    const total = cats.find(c2 => /^total$/i.test(c2.name));
    const real = cats.filter(c2 => !/^total$/i.test(c2.name));
    const assignments = listOf(pick(mark, 'Assignments'), 'Assignment').map((a, i) => {
      const pts = S(a, 'Points'), score = S(a, 'Score'), notes = S(a, 'Notes');
      let earned = null, possible = null, m;
      if ((m = /^\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(pts))) { earned = parseFloat(m[1]); possible = parseFloat(m[2]); }
      else if ((m = /([\d.]+)\s*Points Possible/i.exec(pts))) { possible = parseFloat(m[1]); }
      else if ((m = /^\s*([\d.]+)\s*out of\s*([\d.]+)/i.exec(score))) { earned = parseFloat(m[1]); possible = parseFloat(m[2]); }
      const notCounted = /not for grading/i.test(score + ' ' + notes);
      return { id: S(a, 'GradebookID') || 'a' + i, name: S(a, 'Measure') || 'Assignment', category: S(a, 'Type'), date: S(a, 'Date'), due: S(a, 'DueDate'),
        earned, possible, status: score.slice(0, 40), excluded: notCounted, notes: notes.slice(0, 160) };
    });
    const rawTitle = S(c, 'Title');
    return {
      title: rawTitle.replace(/\s*\([A-Z0-9 ]{1,6}\)\s*$/, '').trim() || 'Class', rawTitle, period: S(c, 'Period'), room: S(c, 'Room'),
      teacher: S(c, 'Staff'), mark: S(mark, 'MarkName'), letter: S(mark, 'CalculatedScoreString'), percent: num(S(mark, 'CalculatedScoreRaw')),
      categories: real, weighted: real.length > 1 && real.some(r => r.weight > 0 && r.weight < 100), assignments, totalPoints: total ? { earned: total.points, possible: total.possible } : null
    };
  });
  return { periods, period: cur, courses };
}
function errOf(msg) {
  const e = new Error(msg || 'StudentVUE rejected the request.');
  e.code = /deprecated|download studentvue/i.test(e.message) ? 'DEPRECATED' : /invalid user|password|credential|unauthori[sz]ed|incorrect/i.test(e.message) ? 'BAD_LOGIN' : 'SV_ERROR'; return e;
}
function parseGradebook(text) {
  const t = String(text || '').trim(); let doc;
  if (t[0] === '{' || t[0] === '[') { try { doc = JSON.parse(t); } catch (e) { const x = new Error('StudentVUE sent a response Index could not read.'); x.code = 'BAD_RESPONSE'; throw x; } }
  else doc = parser.parse(t);
  const rt = pick(doc, 'RT_ERROR'); if (rt) throw errOf(S(rt, 'ERROR_MESSAGE') || (typeof rt === 'string' ? rt : ''));
  const gb = pick(doc, 'Gradebook') || doc;
  if (!listOf(pick(gb, 'Courses'), 'Course').length && !pick(gb, 'Courses')) { const e = new Error('No gradebook came back from StudentVUE.'); e.code = 'BAD_RESPONSE'; throw e; }
  return buildGradebook(gb);
}

/* ---------- StudentVUE's newer "mobile" API (what the phone app and Grade Melon use) ---------- */
function mobileCall(base, method, body, auth, timeoutMs) {
  const payload = JSON.stringify(body || {});
  return new Promise((resolve, reject) => {
    const mod = base.protocol === 'http:' ? require('http') : https;
    const req = mod.request({ host: base.host.split(':')[0], port: base.host.includes(':') ? Number(base.host.split(':')[1]) : undefined, path: '/api/v1/mobile/PXPWebServices/' + method, method: 'POST', timeout: timeoutMs || 25000,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', Authorization: auth, 'Content-Length': Buffer.byteLength(payload), 'User-Agent': 'Mozilla/5.0 (compatible; IndexGradeCalc/1.0)' } }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', c => { data += c; if (data.length > 6e6) req.destroy(new Error('Response too large')); });
      res.on('end', () => resolve({ status: res.statusCode, text: data, type: res.headers['content-type'] || '' }));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('StudentVUE took too long to answer.'), { code: 'TIMEOUT' })));
    req.on('error', e => reject(e.code ? e : Object.assign(e, { code: 'NETWORK' })));
    req.end(payload);
  });
}
function findToken(node, depth) {
  if (node == null || (depth || 0) > 6) return '';
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) { const v = node[k]; if (/token/i.test(k) && typeof v === 'string' && v.length > 16) return v; }
    for (const k of Object.keys(node)) { const r = findToken(node[k], (depth || 0) + 1); if (r) return r; }
  }
  return '';
}
function readBody(r) {
  const t = String(r.text || '').trim();
  if (t[0] === '{' || t[0] === '[') { try { return JSON.parse(t); } catch (e) { } }
  if (t[0] === '<') { try { return parser.parse(t); } catch (e) { } }
  return null;
}
async function mobileLogin(base, user, pass) {
  const r = await mobileCall(base, 'AttemptLogin', { userType: 'Student' }, 'Basic ' + Buffer.from(user + ':' + pass, 'utf8').toString('base64'));
  const doc = readBody(r);
  if (doc) { const rt = pick(doc, 'RT_ERROR'); if (rt) throw errOf(S(rt, 'ERROR_MESSAGE')); }
  const token = doc ? findToken(doc) : '';
  if (token) return { token, raw: r };
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('StudentVUE did not accept that Student ID or password.'), { code: 'BAD_LOGIN' });
  const msg = doc && (S(doc, 'message') || S(doc, 'error') || S(doc, 'errorMessage'));
  throw Object.assign(new Error(msg || 'StudentVUE did not return a sign-in token (status ' + r.status + ').'), { code: /password|credential|invalid|incorrect|unauthori/i.test(msg || '') ? 'BAD_LOGIN' : 'BAD_RESPONSE', raw: r });
}
async function mobileGradebook(base, user, pass, period) {
  const { token } = await mobileLogin(base, user, pass);
  const body = { childIntId: 0 }; if (period != null) body.ReportPeriod = period;
  const r = await mobileCall(base, 'Gradebook', body, 'Bearer ' + token);
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('StudentVUE ended the session. Try again.'), { code: 'BAD_LOGIN' });
  return parseGradebook(r.text);
}
function outline(v, depth) {   // structure only: keys and value kinds, no values
  depth = depth || 0;
  if (v == null) return 'null';
  if (Array.isArray(v)) return '[' + v.length + ' × ' + (v.length ? outline(v[0], depth + 1) : '') + ']';
  if (typeof v === 'object') { if (depth > 5) return '{…}'; return '{' + Object.keys(v).slice(0, 40).map(k => k + ':' + outline(v[k], depth + 1)).join(', ') + '}'; }
  return typeof v === 'string' ? 'str(' + v.length + ')' : typeof v;
}
async function mobileProbe(base, user, pass) {
  const out = [], redact = s => String(s).split(pass).join('***');
  const clip = (s, n) => redact(s).replace(/[A-Za-z0-9+\/=]{60,}/g, m => '<' + m.length + ' chars>').slice(0, n);
  try {
    const l = await mobileCall(base, 'AttemptLogin', { userType: 'Student' }, 'Basic ' + Buffer.from(user + ':' + pass, 'utf8').toString('base64'));
    const d = readBody(l);
    out.push('## AttemptLogin -> status ' + l.status + ' · ' + l.type + ' · ' + l.text.length + ' bytes', 'shape: ' + (d ? outline(d) : '(not JSON/XML)'), 'start: ' + clip(l.text, 600));
    const token = d ? findToken(d) : '';
    out.push('token found: ' + (token ? 'yes (' + token.length + ' chars)' : 'NO'));
    if (!token) return out.join('\n\n');
    for (const body of [{ childIntId: 0 }]) {
      const g = await mobileCall(base, 'Gradebook', body, 'Bearer ' + token);
      const gd = readBody(g);
      out.push('## Gradebook ' + JSON.stringify(body) + ' -> status ' + g.status + ' · ' + g.type + ' · ' + g.text.length + ' bytes', 'shape: ' + (gd ? outline(gd) : '(not JSON/XML)'), 'start: ' + clip(g.text, 2500));
      try { const p = parseGradebook(g.text); out.push('Index parsed: ' + p.courses.length + ' classes, ' + p.courses.map(c => c.title + ' (' + c.assignments.length + ' assignments, ' + (c.percent == null ? '?' : c.percent) + '%)').join(' | ')); }
      catch (e) { out.push('Index could not parse this yet: ' + e.message); }
    }
  } catch (e) { out.push('Request failed: ' + redact(e.message || e)); }
  return out.join('\n\n');
}

/* ---------- owner-only diagnostic: walks the StudentVUE *website* login and reports what it sees ---------- */
function httpReq(base, method, path, headers, body, jar) {
  return new Promise((resolve, reject) => {
    const mod = base.protocol === 'http:' ? require('http') : https;
    const h = Object.assign({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' }, headers || {});
    if (jar && Object.keys(jar).length) h.Cookie = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (body) h['Content-Length'] = Buffer.byteLength(body);
    const req = mod.request({ host: base.host.split(':')[0], port: base.host.includes(':') ? Number(base.host.split(':')[1]) : undefined, path, method, headers: h, timeout: 20000 }, res => {
      (res.headers['set-cookie'] || []).forEach(c => { const m = /^([^=]+)=([^;]*)/.exec(c); if (m && jar) jar[m[1]] = m[2]; });
      let data = ''; res.setEncoding('utf8'); res.on('data', c => { if (data.length < 1.5e6) data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    if (body) req.write(body); req.end();
  });
}
function formOf(html) {
  const inputs = []; let m; const rx = /<input\b([^>]*)>/gi;
  while ((m = rx.exec(html))) {
    const a = m[1], g = n => { const r = new RegExp('\\b' + n + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(a); return r ? (r[2] != null ? r[2] : r[3]) : ''; };
    if (g('name')) inputs.push({ name: g('name'), type: (g('type') || 'text').toLowerCase(), value: g('value') });
  }
  const act = /<form\b[^>]*action\s*=\s*("([^"]*)"|'([^']*)')/i.exec(html);
  return { inputs, action: act ? (act[2] != null ? act[2] : act[3]) : '' };
}
const textOf = h => String(h).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function describe(label, r) {
  const b = r.body || '', t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(b);
  const scripts = [...b.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/gi)].map(x => x[1]).slice(0, 25);
  const apis = [...new Set([...b.matchAll(/["'(]((?:\/)?(?:api|Service|service)\/[A-Za-z0-9_\/\.\-?=&]{3,90})/g)].map(x => x[1]))].slice(0, 30);
  const actions = [...new Set([...b.matchAll(/action\s*[:=]\s*["']([A-Za-z0-9_.\-]+)["']/g)].map(x => x[1]))].slice(0, 20);
  return ['## ' + label, 'status ' + r.status + (r.headers.location ? ' -> ' + r.headers.location : '') + ' · ' + (r.headers['content-type'] || '') + ' · ' + b.length + ' bytes', 'title: ' + (t ? textOf(t[1]).slice(0, 120) : '-'),
    scripts.length ? 'scripts: ' + scripts.join(' , ') : '', apis.length ? 'api-like paths: ' + apis.join(' , ') : '', actions.length ? 'action names: ' + actions.join(' , ') : '', 'text: ' + textOf(b).slice(0, 700)].filter(Boolean).join('\n');
}
async function probe(base, user, pass) {
  const out = [], jar = {};
  const follow = async (method, path, body, ct) => {
    let r, hops = 0;
    for (; hops < 6; hops++) {
      r = await httpReq(base, method, path, ct ? { 'Content-Type': ct, Referer: base.protocol + '//' + base.host + '/' } : {}, body, jar);
      if (r.status >= 300 && r.status < 400 && r.headers.location) { out.push('   redirect ' + r.status + ' -> ' + r.headers.location); let loc = r.headers.location; try { const u = new URL(loc, base.protocol + '//' + base.host); path = u.pathname + u.search; } catch (e) { break; } method = 'GET'; body = null; ct = null; continue; }
      break;
    }
    return { r, path };
  };
  let login;
  for (const lp of ['/PXP2_Login_Student.aspx?regenerateSessionId=True', '/PXP2_Login.aspx']) {
    const g = await follow('GET', lp); out.push(describe('GET ' + lp, g.r)); if (g.r.status === 200 && /<form/i.test(g.r.body)) { login = { page: g.path, html: g.r.body }; break; }
  }
  if (!login) {
    // The page is script-driven (no plain <form>): list its inputs, inline config and the login script's request code.
    const g = await follow('GET', '/PXP2_Login_Student.aspx?regenerateSessionId=True'); const html = g.r.body || '';
    out.push('No plain <form>. Inputs on page: ' + [...html.matchAll(/<(input|button|select)\b([^>]*)>/gi)].map(m => m[1] + '{' + (/\bid\s*=\s*["']([^"']+)/i.exec(m[2]) || [])[1] + '|' + (/\bname\s*=\s*["']([^"']+)/i.exec(m[2]) || [])[1] + '|' + (/\btype\s*=\s*["']([^"']+)/i.exec(m[2]) || [])[1] + '}').join(' , '));
    const inl = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim()).filter(x => x.length > 20);
    inl.slice(0, 6).forEach((x, i) => out.push('inline script ' + (i + 1) + ' (' + x.length + ' chars): ' + x.replace(/\s+/g, ' ').slice(0, 900)));
    out.push('links/data attrs: ' + [...new Set([...html.matchAll(/(?:href|data-[a-z-]+)\s*=\s*["']([^"']{3,120})["']/gi)].map(m => m[1]))].filter(x => /login|google|sso|auth|api/i.test(x)).slice(0, 20).join(' , '));
    const bodyAt = html.search(/<body/i), raw = html.slice(bodyAt < 0 ? 0 : bodyAt).replace(/<script[\s\S]*?<\/script>/gi, '<script/>').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/\s+/g, ' ');
    out.push('## page markup (scripts removed), ' + raw.length + ' chars:\n' + raw.slice(0, 7000));
    out.push('response cookies: ' + Object.keys(jar).join(' , ') + ' · server: ' + (g.r.headers.server || '-') + ' · noscript/iframes: ' + ([...html.matchAll(/<(noscript|iframe)\b[^>]*>/gi)].map(m => m[0].slice(0, 120)).join(' ') || 'none'));
    for (const sp of ['/js/PXP/PXP2_Login.js', '/js/PXP/PXP2_Login.js?x=' + Date.now()].slice(0, 1)) {
      try {
        const sr = await follow('GET', sp); const js = sr.r.body || ''; out.push('## ' + sp + ' status ' + sr.r.status + ' · ' + js.length + ' bytes');
        const lines = js.split(/\r?\n/), hit = [];
        lines.forEach((l, i) => { if (/ajax|\.post\(|\.get\(|url\s*:|fetch\(|XMLHttp|Login|password|__Request|location|api\//i.test(l)) hit.push(i + ': ' + l.trim().slice(0, 220)); });
        out.push(hit.slice(0, 120).join('\n') || js.slice(0, 1500));
      } catch (e) { out.push(sp + ' failed: ' + e.message); }
    }
    for (const bp of [...html.matchAll(/(\/api\/v1\/bundle\/[^"']+pxp\.bundle\.js[^"']*)/g)].map(m => m[1]).slice(0, 1)) {
      try {
        const br = await follow('GET', bp), js = br.r.body || ''; out.push('## pxp bundle ' + br.r.status + ' · ' + js.length + ' bytes');
        const found = new Set(); for (const m of js.matchAll(/["'`]([^"'`\s]{0,80}(?:[Ll]ogin|[Ss]ign[Ii]n|[Aa]uth)[^"'`\s]{0,80})["'`]/g)) { if (/\/|\.aspx|api|Service/i.test(m[1])) found.add(m[1]); if (found.size > 60) break; }
        out.push('login-related strings: ' + [...found].join(' , '));
      } catch (e) { out.push('bundle failed: ' + e.message); }
    }
    return out.join('\n\n');
  }
  const f = formOf(login.html);
  out.push('login form action: ' + (f.action || '(none)') + '\ninputs: ' + f.inputs.map(i => i.name + '[' + i.type + (i.type === 'hidden' ? ',' + (i.value || '').length + 'ch' : '') + ']').join(' , '));
  const fields = new URLSearchParams();
  f.inputs.forEach(i => {
    if (/user|login(?!.*btn)|studentid/i.test(i.name) && /text/.test(i.type)) fields.set(i.name, user);
    else if (/pass/i.test(i.name) || i.type === 'password') fields.set(i.name, pass);
    else if (i.type === 'hidden') fields.set(i.name, i.value);
    else if (i.type === 'submit' && !fields.has('__sub')) { fields.set(i.name, i.value || 'Login'); fields.set('__sub', '1'); }
  });
  fields.delete('__sub');
  out.push('posting fields: ' + [...fields.keys()].join(' , '));
  const act = f.action && !/^https?:/i.test(f.action) ? new URL(f.action, base.protocol + '//' + base.host + login.page.split('?')[0]).pathname : login.page;
  const p = await follow('POST', act, fields.toString(), 'application/x-www-form-urlencoded');
  out.push(describe('after login POST (' + act + ')', p.r)); out.push('cookies: ' + Object.keys(jar).join(' , '));
  for (const gp of ['/PXP2_Gradebook.aspx?AGU=0', '/Home_PXP2.aspx']) {
    try { const g = await follow('GET', gp); out.push(describe('GET ' + gp, g.r)); } catch (e) { out.push('GET ' + gp + ' failed: ' + e.message); }
  }
  return out.join('\n\n').replace(new RegExp(pass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '***');
}

function mount(app, opts) {
  const need = opts.requireUser;
  const hits = new Map();   // per-account throttle so a wrong password can never lock someone out by hammering
  function throttle(req, res) {
    const key = req.user ? req.user.id : req.ip, now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < 60000);
    if (list.length >= 6) { res.status(429).json({ error: 'Slow down: wait a minute before trying StudentVUE again.' }); return false; }
    list.push(now); hits.set(key, list); return true;
  }
  const fail = (res, e) => {
    const map = { DEPRECATED: [503, 'StudentVUE has switched off the connection that tools like this use (error D5518), so importing is not possible right now. You can still build your classes by hand below.'], BAD_LOGIN: [401, 'StudentVUE did not accept that Student ID or password.'], TIMEOUT: [504, 'StudentVUE took too long to answer. Try again.'], NETWORK: [502, 'Could not reach that StudentVUE site. Check the address.'], BAD_RESPONSE: [502, e && e.message || 'Unexpected answer from StudentVUE.'], SV_ERROR: [502, e && e.message || 'StudentVUE refused the request.'] };
    const [status, msg] = map[e && e.code] || [502, 'Could not read your StudentVUE grades.'];
    res.status(status).json({ error: msg, code: e && e.code || 'ERR' });
  };

  app.post('/api/studentvue/districts', need, async (req, res) => {
    if (!throttle(req, res)) return;
    const zip = String((req.body && req.body.zip) || '').replace(/[^0-9]/g, '').slice(0, 5);
    if (zip.length !== 5) return res.status(400).json({ error: 'Enter a 5-digit ZIP code.' });
    try {
      const xml = await soap({ host: 'support.edupoint.com', protocol: 'https:' }, '/Service/HDInfoCommunication.asmx', 'HDInfoServices', 'GetMatchingDistrictList',
        '<Parms><Key>' + LOOKUP_KEY + '</Key><MatchToDistrictZipCode>' + zip + '</MatchToDistrictZipCode></Parms>', null, 15000);
      const d = parser.parse(xml), list = ((d.DistrictLists && d.DistrictLists.DistrictInfo) || []).map(x => ({ name: x['@_Name'], url: String(x['@_PvueURL'] || '').replace(/\/+$/, '') })).filter(x => x.name && /^https:\/\//.test(x.url));
      list.forEach(x => { try { KNOWN_HOSTS.set(new URL(x.url).hostname.toLowerCase(), Date.now() + 3600e3); } catch (e) { } });
      res.json({ ok: true, districts: list.slice(0, 12) });
    } catch (e) { fail(res, e); }
  });

  app.post('/api/studentvue/gradebook', need, async (req, res) => {
    if (!throttle(req, res)) return;
    const b = req.body || {};
    const base = normalizeBase(String(b.url || ''));
    if (!base) return res.status(400).json({ error: 'That does not look like a StudentVUE address (it should end in .edupoint.com).' });
    const user = String(b.username || '').trim().slice(0, 80), pass = String(b.password || '').slice(0, 200);
    if (!user || !pass) return res.status(400).json({ error: 'Enter your Student ID and StudentVUE password.' });
    const period = Number.isInteger(Number(b.period)) && b.period !== '' && b.period != null ? Math.max(0, Math.min(20, Number(b.period))) : null;
    try {
      const data = TEST_HOSTS.has(base.host) && !process.env.SV_TEST_MOBILE
        ? parseGradebook(await soap(base, '/Service/PXPCommunication.asmx', 'PXPWebServices', 'Gradebook', '<Parms>' + (period != null ? '<ReportPeriod>' + period + '</ReportPeriod>' : '') + '</Parms>', { user, pass }))
        : await mobileGradebook(base, user, pass, period);
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, fetchedAt: Date.now(), district: base.host, ...data });
    } catch (e) { fail(res, e); }
  });
}
module.exports = { mount, parseGradebook, normalizeBase, probe, mobileProbe };
