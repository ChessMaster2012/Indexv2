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
  if (doc.RT_ERROR) { const e = new Error(doc.RT_ERROR['@_ERROR_MESSAGE'] || 'StudentVUE rejected the request.'); e.code = /invalid user|password|credential/i.test(e.message) ? 'BAD_LOGIN' : 'SV_ERROR'; throw e; }
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

function mount(app, opts) {
  const need = opts.requireUser;
  const hits = new Map();   // per-account throttle so a wrong password can never lock someone out by hammering
  function throttle(req, res) {
    const key = req.user ? req.user.id : req.ip, now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < 60000);
    if (list.length >= 6) { res.status(429).json({ error: 'Slow down: wait a minute before trying StudentVUE again.' }); return false; }
    list.push(now); hits.set(key, list); return true;
  }
  const fail = (res, e) => {
    const map = { BAD_LOGIN: [401, 'StudentVUE did not accept that Student ID or password.'], TIMEOUT: [504, 'StudentVUE took too long to answer. Try again.'], NETWORK: [502, 'Could not reach that StudentVUE site. Check the address.'], BAD_RESPONSE: [502, e && e.message || 'Unexpected answer from StudentVUE.'], SV_ERROR: [502, e && e.message || 'StudentVUE refused the request.'] };
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
module.exports = { mount, parseGradebook, normalizeBase };
