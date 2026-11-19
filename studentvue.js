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
function parseGradebook(xml) {
  const doc = parser.parse(xml);
  if (doc.RT_ERROR) { const e = new Error(doc.RT_ERROR['@_ERROR_MESSAGE'] || 'StudentVUE rejected the request.'); e.code = /deprecated|download studentvue/i.test(e.message) ? 'DEPRECATED' : /invalid user|password|credential/i.test(e.message) ? 'BAD_LOGIN' : 'SV_ERROR'; throw e; }
  const gb = doc.Gradebook; if (!gb) { const e = new Error('No gradebook came back from StudentVUE.'); e.code = 'BAD_RESPONSE'; throw e; }
  const periods = ((gb.ReportingPeriods && gb.ReportingPeriods.ReportPeriod) || []).map(p => ({ index: Number(p['@_Index']), name: p['@_GradePeriod'] || '', start: p['@_StartDate'] || '', end: p['@_EndDate'] || '' }));
  const cur = gb.ReportingPeriod ? { name: gb.ReportingPeriod['@_GradePeriod'] || '', start: gb.ReportingPeriod['@_StartDate'] || '', end: gb.ReportingPeriod['@_EndDate'] || '' } : null;
  const courses = ((gb.Courses && gb.Courses.Course) || []).map(c => {
    const mark = (c.Marks && c.Marks.Mark && c.Marks.Mark[0]) || {};
    const cats = ((mark.GradeCalculationSummary && mark.GradeCalculationSummary.AssignmentGradeCalc) || []).map(a => ({
      name: a['@_Type'] || '', weight: num(a['@_Weight']) || 0, points: num(a['@_Points']), possible: num(a['@_PointsPossible'])
    })).filter(a => a.name);
    const total = cats.find(c2 => /^total$/i.test(c2.name));
    const real = cats.filter(c2 => !/^total$/i.test(c2.name));
    const assignments = ((mark.Assignments && mark.Assignments.Assignment) || []).map((a, i) => {
      const pts = String(a['@_Points'] || ''), score = String(a['@_Score'] || ''), notes = String(a['@_Notes'] || '');
      let earned = null, possible = null, m;
      if ((m = /^\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(pts))) { earned = parseFloat(m[1]); possible = parseFloat(m[2]); }
      else if ((m = /([\d.]+)\s*Points Possible/i.exec(pts))) { possible = parseFloat(m[1]); }
      else if ((m = /^\s*([\d.]+)\s*out of\s*([\d.]+)/i.exec(score))) { earned = parseFloat(m[1]); possible = parseFloat(m[2]); }
      const notCounted = /not for grading/i.test(score + ' ' + notes);
      return { id: String(a['@_GradebookID'] || 'a' + i), name: a['@_Measure'] || 'Assignment', category: a['@_Type'] || '', date: a['@_Date'] || '', due: a['@_DueDate'] || '',
        earned, possible, status: score.slice(0, 40), excluded: notCounted, notes: notes.slice(0, 160) };
    });
    return {
      title: String(c['@_Title'] || 'Class').replace(/\s*\([A-Z0-9 ]{1,6}\)\s*$/, '').trim() || 'Class', rawTitle: c['@_Title'] || '', period: c['@_Period'] || '', room: c['@_Room'] || '',
      teacher: c['@_Staff'] || '', mark: mark['@_MarkName'] || '', letter: mark['@_CalculatedScoreString'] || '', percent: num(mark['@_CalculatedScoreRaw']),
      categories: real, weighted: real.length > 1 && real.some(r => r.weight > 0 && r.weight < 100), assignments, totalPoints: total ? { earned: total.points, possible: total.possible } : null
    };
  });
  return { periods, period: cur, courses };
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
      const xml = await soap(base, '/Service/PXPCommunication.asmx', 'PXPWebServices', 'Gradebook', '<Parms>' + (period != null ? '<ReportPeriod>' + period + '</ReportPeriod>' : '') + '</Parms>', { user, pass });
      const data = parseGradebook(xml);
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, fetchedAt: Date.now(), district: base.host, ...data });
    } catch (e) { fail(res, e); }
  });
}
module.exports = { mount, parseGradebook, normalizeBase, probe };
