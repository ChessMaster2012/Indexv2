/* Reads text out of almost any uploaded file. Local parsers first (PDF, Word, PowerPoint, Excel, OpenDocument, EPUB, RTF, HTML, ZIP, any plain-text or code file);
   photos, scanned PDFs and audio go to the AI vision reader that server.js passes in. Returns { text } or { error, code }. */
'use strict';
const MAX_ENTRY = 4 * 1024 * 1024;
const IMG = /^(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/, AUD = /^(mp3|wav|m4a|aac|ogg|oga|flac|aiff?)$/, VID = /^(mp4|mov|webm|m4v|mpeg|mpg)$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', pdf: 'application/pdf', mp3: 'audio/mp3', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', aif: 'audio/aiff', aiff: 'audio/aiff', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4', mpeg: 'video/mpeg', mpg: 'video/mpeg' };
const tidy = t => String(t || '').replace(/\r/g, '').replace(/[ \t]+$/gm, '').replace(/([^\s])[ ]{2,}(?=[^\s])/g, '$1 ').replace(/\n{3,}/g, '\n\n').trim();
const unent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n) || 32)).replace(/&amp;/g, '&');
const stripHtml = h => unent(String(h).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|article)>/gi, '\n').replace(/<[^>]+>/g, ' '));
function looksText(buf) {
  const n = Math.min(buf.length, 8192); if (!n) return false; let bad = 0;
  for (let i = 0; i < n; i++) { const c = buf[i]; if (c === 0) return false; if (c < 9 || (c > 13 && c < 32)) bad++; }
  return bad / n < 0.02;
}
function rtfText(s) { return s.replace(/\\par[d]?/g, '\n').replace(/\\'([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\{\\\*[^{}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, ''); }
function strings(buf) { /* last resort for legacy .doc/.ppt/.xls: printable runs */
  const out = [], a = buf.toString('latin1').match(/[\x20-\x7e]{8,}/g) || [], u = buf.toString('utf16le').match(/[\x20-\x7e -ɏ]{8,}/g) || [];
  return a.concat(u).filter(x => /[a-z]{3}/i.test(x) && !/^[\w+/=]{40,}$/.test(x)).join('\n');
}
async function zipText(buf, name, ext) {
  const JSZip = require('jszip'); const zip = await JSZip.loadAsync(buf), files = Object.keys(zip.files).filter(f => !zip.files[f].dir);
  const read = async f => { const e = zip.files[f]; const b = await e.async('nodebuffer'); return b.length > MAX_ENTRY ? '' : b.toString('utf8'); };
  const num = f => Number((f.match(/(\d+)\.xml$/) || [0, 0])[1]);
  if (ext === 'pptx' || ext === 'ppsx' || ext === 'potx') {
    const slides = files.filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => num(a) - num(b)), out = [];
    for (const f of slides) { const x = await read(f); out.push('Slide ' + num(f) + ':\n' + (x.match(/<a:t>[^<]*<\/a:t>/g) || []).map(t => unent(t.replace(/<\/?a:t>/g, ''))).join(' ')); }
    for (const f of files.filter(f => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f)).sort((a, b) => num(a) - num(b))) { const t = ((await read(f)).match(/<a:t>[^<]*<\/a:t>/g) || []).map(t => unent(t.replace(/<\/?a:t>/g, ''))).join(' '); if (t.trim().length > 3) out.push('Speaker notes ' + num(f) + ': ' + t); }
    return out.join('\n\n');
  }
  if (ext === 'xlsx' || ext === 'xlsm') {
    const ss = files.includes('xl/sharedStrings.xml') ? ((await read('xl/sharedStrings.xml')).match(/<si>[\s\S]*?<\/si>/g) || []).map(si => unent((si.match(/<t[^>]*>[^<]*<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))) : [];
    let names = []; if (files.includes('xl/workbook.xml')) names = ((await read('xl/workbook.xml')).match(/<sheet [^>]*name="[^"]*"/g) || []).map(s => unent(s.match(/name="([^"]*)"/)[1]));
    const out = [];
    for (const f of files.filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort((a, b) => num(a) - num(b))) {
      const x = await read(f), rows = (x.match(/<row[\s\S]*?<\/row>/g) || []).map(r => (r.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).map(c => { const v = (c.match(/<v>([^<]*)<\/v>/) || [])[1]; const t = (c.match(/ t="(\w+)"/) || [])[1]; if (v == null) { const is = c.match(/<t[^>]*>([^<]*)<\/t>/); return is ? unent(is[1]) : ''; } return t === 's' ? (ss[Number(v)] || '') : unent(v); }).join('\t')).filter(r => r.trim());
      out.push('Sheet ' + (names[num(f) - 1] || num(f)) + ':\n' + rows.join('\n'));
    }
    return out.join('\n\n');
  }
  if (/^(odt|odp|ods|odg)$/.test(ext)) return stripHtml((await read('content.xml')).replace(/<\/text:(p|h)>/g, '\n').replace(/<\/table:table-row>/g, '\n').replace(/<\/table:table-cell>/g, '\t'));
  if (ext === 'epub') { const out = []; for (const f of files.filter(f => /\.(x?html?)$/i.test(f)).sort().slice(0, 80)) out.push(stripHtml(await read(f))); return out.join('\n\n'); }
  if (ext === 'docx' || ext === 'dotx') return null; /* handled by mammoth */
  /* any other ZIP: read the text-like files inside */
  const out = []; let used = 0;
  for (const f of files.sort().slice(0, 200)) {
    if (/(^|\/)(__MACOSX|\.git|node_modules)\//.test(f) || /\/\./.test('/' + f)) continue;
    const e = (f.split('.').pop() || '').toLowerCase(); let t = '';
    if (/^(txt|md|markdown|csv|tsv|json|xml|html?|rtf|tex|py|js|java|c|cpp|cs|rb|go|rs|sql|yml|yaml|ini|log)$/.test(e)) { const b = await zip.files[f].async('nodebuffer'); if (b.length < MAX_ENTRY && looksText(b)) t = /^html?$/.test(e) ? stripHtml(b.toString('utf8')) : e === 'rtf' ? rtfText(b.toString('utf8')) : b.toString('utf8'); }
    else if (/^(docx|pptx|xlsx|odt)$/.test(e)) { const b = await zip.files[f].async('nodebuffer'); if (b.length < MAX_ENTRY) { const r = await readFile(b, f, {}); if (r.text) t = r.text; } }
    t = tidy(t); if (t) { out.push('=== ' + f + ' ===\n' + t); used += t.length; if (used > 60000) break; }
  }
  return out.join('\n\n');
}
async function readFile(buf, name, opts) {
  opts = opts || {}; const ext = (String(name || '').split('.').pop() || '').toLowerCase(), vision = opts.vision;
  const sig = buf.slice(0, 8).toString('latin1'), isZip = sig.startsWith('PK'), isPdf = sig.startsWith('%PDF');
  const ask = async (mime, kind) => {
    if (!vision) return { error: 'Photos, scans and audio need the AI reader, which is not available right now. Try a PDF or Word file instead.', code: 503 };
    try { const t = await vision(buf, mime, kind); return t && t.trim().length > 2 ? { text: tidy(t) } : { error: kind === 'audio' ? 'I could not hear any speech in that recording.' : 'I could not find any readable text in that picture.', code: 422 }; }
    catch (e) { return { error: 'The AI reader is busy. Try again in a minute.', code: 503 }; }
  };
  try {
    if (isPdf || ext === 'pdf') {
      let t = ''; try { t = tidy((await require('pdf-parse/lib/pdf-parse.js')(buf)).text); } catch (e) { }
      if (t.length >= 40) return { text: t };
      const r = await ask('application/pdf', 'scan'); return r.text ? r : (t ? { text: t } : r);
    }
    if (IMG.test(ext) || /^(\x89PNG|\xff\xd8\xff|GIF8)/.test(sig)) return ask(MIME[ext] || (sig.startsWith('\x89PNG') ? 'image/png' : sig.startsWith('GIF8') ? 'image/gif' : 'image/jpeg'), 'image');
    if (AUD.test(ext)) return ask(MIME[ext], 'audio');
    if (VID.test(ext)) { if (buf.length > 6 * 1024 * 1024) return { error: 'That video is too large to listen to. Upload the audio or a transcript instead.', code: 413 }; return ask(MIME[ext], 'audio'); }
    if (ext === 'docx' || ext === 'dotx') return { text: tidy((await require('mammoth').extractRawText({ buffer: buf })).value) };
    if (isZip || /^(pptx|ppsx|xlsx|xlsm|odt|odp|ods|odg|epub|zip)$/.test(ext)) { const t = await zipText(buf, name, ext); if (t != null) return tidy(t) ? { text: tidy(t) } : { error: 'I could not find any text in that file.', code: 422 }; }
    if (/^(doc|ppt|xls)$/.test(ext) || buf.slice(0, 4).toString('hex') === 'd0cf11e0') { const t = tidy(strings(buf)); return t.length > 40 ? { text: t } : { error: 'That older Office file could not be read. Save it as .docx, .pptx or .xlsx and try again.', code: 422 }; }
    if (/^(html?|xhtml|svg)$/.test(ext)) return { text: tidy(stripHtml(buf.toString('utf8'))) };
    if (ext === 'rtf' || sig.startsWith('{\\rtf')) return { text: tidy(rtfText(buf.toString('utf8'))) };
    if (looksText(buf)) { let t = buf.toString('utf8'); if (/^(html?|xml)$/.test(ext)) t = stripHtml(t); return t.trim() ? { text: tidy(t) } : { error: 'That file is empty.', code: 422 }; }
    if (buf[0] === 0xff && buf[1] === 0xfe) return { text: tidy(buf.toString('utf16le')) };
    return { error: 'I cannot read that kind of file yet. Try a PDF, Word, PowerPoint, Excel, text file, photo or recording.', code: 415 };
  } catch (e) { return { error: 'Could not read that file.', code: 400 }; }
}
module.exports = { readFile };
