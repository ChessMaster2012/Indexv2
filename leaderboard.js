/* Per-game leaderboards. One best (monotonic) score per player per game.
   Stored in data/leaderboard.json and mirrored to the index_library table (rows id 'lb:<game>', data.lb=1) so they survive redeploys. */
'use strict';
const fs = require('fs'), path = require('path');
/* label = what the number means; cap = highest plausible value (anything above is rejected) */
const GAMES = {
  study:      { name: 'Study Mode',            label: 'points',        cap: 5e6 },
  commander:  { name: 'Troop Commander',       label: 'best wave',     cap: 60 },
  gauntlet:   { name: 'Character Gauntlet',    label: 'score',         cap: 5e7 },
  expedition: { name: 'Expedition Dash',       label: 'score',         cap: 5e6 },
  trial:      { name: 'Trial of the Ancients', label: 'score',         cap: 5e6 },
  shadow:     { name: 'Shadow Arena',          label: 'matches won',   cap: 2000 },
  gold:       { name: 'Gold Rush Mines',       label: 'lifetime gold', cap: 1e15 },
  rogue:      { name: "Rogue's Sanctuary",     label: 'best floor',    cap: 400 },
  chrono:     { name: 'Chrono Hex Puzzle',     label: 'best score',    cap: 5e7 },
  rhythm:     { name: 'Rhythm Reflector',      label: 'best score',    cap: 5e7 }
};
function init({ app, dataDir, supabase, isBanned, nameOf, badgeOf }) {
  const FILE = path.join(dataDir, 'leaderboard.json'), TABLE = 'index_library';
  const board = {}; Object.keys(GAMES).forEach(g => board[g] = {});
  const lastSubmit = new Map(); let dirty = new Set(), timer = null;
  function saveFile() { try { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(board)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('leaderboard: file save failed:', e.message); } }
  async function flush() {
    timer = null; const games = Array.from(dirty); dirty = new Set(); saveFile();
    if (!supabase || !supabase.enabled) return;
    try { await supabase.request(`${TABLE}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(games.map(g => ({ id: 'lb:' + g, data: { lb: 1, e: board[g] }, updated_at: new Date().toISOString() }))) }); }
    catch (e) { console.error('leaderboard: supabase mirror failed:', e.message); games.forEach(g => dirty.add(g)); }
  }
  function mark(g) { dirty.add(g); if (!timer) timer = setTimeout(flush, 4000); }
  (async function load() {
    try { if (fs.existsSync(FILE)) { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); Object.keys(GAMES).forEach(g => { if (j[g] && typeof j[g] === 'object') board[g] = j[g]; }); } } catch (e) { console.error('leaderboard: file load failed:', e.message); }
    if (supabase && supabase.enabled) {
      try {
        const rows = await supabase.request(`${TABLE}?select=id,data&id=like.lb:*&limit=50`);
        (rows || []).forEach(r => { const g = String(r.id || '').slice(3); if (GAMES[g] && r.data && r.data.e) Object.keys(r.data.e).forEach(uid => { const cur = board[g][uid], inc = r.data.e[uid]; if (!cur || inc.s > cur.s) board[g][uid] = inc; }); });
      } catch (e) { console.error('leaderboard: supabase load skipped:', e.message); }
    }
  })();
  const entriesFor = g => Object.keys(board[g]).map(uid => ({ uid, e: board[g][uid] })).filter(x => !x.e.hide && !(isBanned && isBanned(x.uid))).sort((a, b) => b.e.s - a.e.s || a.e.t - b.e.t);
  function view(g, me) {
    const all = entriesFor(g), top = all.slice(0, 25).map((x, i) => ({ rank: i + 1, name: x.e.n, badge: x.e.b || '', score: x.e.s, me: me && x.uid === me.id }));
    let mine = null; if (me) { const i = all.findIndex(x => x.uid === me.id); const own = board[g][me.id]; mine = own ? { rank: i >= 0 ? i + 1 : null, score: own.s, hidden: !!own.hide } : null; }
    return { game: g, name: GAMES[g].name, label: GAMES[g].label, total: all.length, top, mine };
  }
  app.get('/api/leaderboard', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in to see leaderboards.' });
    const out = {}; Object.keys(GAMES).forEach(g => { const v = view(g, req.user); out[g] = { name: v.name, label: v.label, total: v.total, leader: v.top[0] || null, mine: v.mine }; });
    res.json({ ok: true, games: out });
  });
  app.get('/api/leaderboard/:game', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in to see leaderboards.' });
    if (!GAMES[req.params.game]) return res.status(404).json({ error: 'Unknown game.' });
    res.json(Object.assign({ ok: true }, view(req.params.game, req.user)));
  });
  /* body: { scores: {game: number}, show: boolean } - scores only ever go up */
  app.post('/api/leaderboard/submit', (req, res) => {
    const u = req.user; if (!u) return res.status(401).json({ error: 'Sign in first.' });
    if (isBanned && isBanned(u.id)) return res.status(403).json({ error: 'Suspended.' });
    const now = Date.now(); if (now - (lastSubmit.get(u.id) || 0) < 3000) return res.status(429).json({ error: 'Slow down.' }); lastSubmit.set(u.id, now);
    const sc = req.body && req.body.scores && typeof req.body.scores === 'object' ? req.body.scores : {}, show = req.body ? req.body.show !== false : true, name = String(nameOf(u) || 'Student').slice(0, 24), badge = String((badgeOf && badgeOf(u)) || '');
    let changed = 0;
    Object.keys(GAMES).forEach(g => {
      const own = board[g][u.id]; let s = Math.floor(Number(sc[g]));
      if (own && (own.hide === !show) && own.n === name && (own.b || '') === badge && !(Number.isFinite(s) && s > own.s && s <= GAMES[g].cap)) return;
      if (!Number.isFinite(s) || s <= 0 || s > GAMES[g].cap) { if (own && (own.hide !== !show || own.n !== name || (own.b || '') !== badge)) { own.hide = !show; own.n = name; own.b = badge; mark(g); changed++; } return; }
      if (own && s <= own.s) { if (own.hide !== !show || own.n !== name || (own.b || '') !== badge) { own.hide = !show; own.n = name; own.b = badge; mark(g); changed++; } return; }
      board[g][u.id] = { n: name, s, t: now, hide: !show, b: badge }; mark(g); changed++;
    });
    res.json({ ok: true, changed });
  });
  return { GAMES };
}
module.exports = { init, GAMES };
