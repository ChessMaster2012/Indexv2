'use strict';
/**
 * Live Game engine (self-paced). Each player gets their own question stream and the whole game runs
 * on one clock. Correct answers advance immediately; wrong answers lock the player out for a short pause.
 */
const MODES = require('./livemodes');
const LIBRARY = require('./library');
const ROOM_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const MODE_LIST = ['trivia', 'rocket', 'tower', 'gold', 'streak', 'elimination'];

function attach({ io, rooms, cleanDisplayName, nameViolationReason, cleanRoomTitle, cappedDailyCoins }) {
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  function genRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code;
    do { code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); } while (rooms.has(code));
    return code;
  }
  const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const hostRoom = code => code + ':host';

  function sanitizeQuestions(questions, config) {
    let clean = LIBRARY.normalizeQuestions(questions, 50);
    if (config.shuffleQuestions) clean = shuffle(clean);
    return clean.slice(0, Math.max(1, Math.min(50, Number(config.questionCount) || clean.length)));
  }
  /** Compact player record sent to clients. */
  function pub(room, p) {
    return { id: p.id, name: p.name, score: p.score, correctCount: p.correctCount || 0, answered: p.answered || 0, gold: p.gold || 0, online: p.online, alive: p.alive !== false,
      streak: p.streak || 0, lives: p.lives, dist: p.dist || 0, floors: p.floors || 0, shield: p.shield || 0, best: p.best || 0, chests: p.chestsAvailable || 0,
      finish: p.finishOrder || 0, finished: !!p.finished, last: p.last || null };
  }
  const publicPlayers = room => Array.from(room.players.values()).sort(MODES.compare(room)).map(p => pub(room, p));
  const remainingMs = room => room.status === 'running' ? Math.max(0, room.endsAt - Date.now()) : (room.status === 'ended' ? 0 : room.durationMs);
  function meta(room) { return { trackLength: room.mode === 'rocket' ? MODES.trackLength(room) : undefined, durationMs: room.durationMs, pauseMs: room.config.wrongPauseMs, storm: MODES.stormNow(room) || undefined }; }

  /* ----- per-player question stream ----- */
  function buildOrder(room) { const idx = room.questions.map((_, i) => i); return room.config.shuffleQuestions ? shuffle(idx) : idx; }
  function nextQuestion(room, p) {
    if (!p.order || p.pos >= p.order.length) { p.order = buildOrder(room); p.pos = 0; p.cycle = (p.cycle || 0) + 1; }
    const qi = p.order[p.pos++];
    const q = room.questions[qi];
    let perm = null;
    if ((q.type || 'mc') === 'mc') { perm = q.options.map((_, i) => i); if (room.config.shuffleAnswers) perm = shuffle(perm); }
    p.cur = { seq: (p.cur ? p.cur.seq : 0) + 1, qi, perm, sentAt: Date.now(), answered: false };
    return { seq: p.cur.seq, n: (p.answered || 0) + 1, q: q.q, type: q.type || 'mc', options: perm ? perm.map(i => q.options[i]) : [], total: room.questions.length };
  }
  function sendQuestion(room, p) {
    if (room.status !== 'running' || !p.online || p.alive === false || p.finished) return;
    const sock = io.sockets.sockets.get(p.socketId);
    if (!p.cur || p.cur.answered) { const payload = nextQuestion(room, p); p.curPayload = payload; }
    if (sock) sock.emit('player:question', p.curPayload);
  }
  function sendMe(room, p, extra) {
    const sock = io.sockets.sockets.get(p.socketId);
    if (sock) sock.emit('player:state', Object.assign({ me: pub(room, p), storm: MODES.stormNow(room) }, extra || {}));
  }

  /* ----- lifecycle ----- */
  function startRunning(room) {
    room.status = 'running'; room.startedAt = Date.now(); room.endsAt = room.startedAt + room.durationMs; room.dangerBucket = 0; room.stormFlag = false;
    io.to(room.code).emit('room:started', { remainingMs: room.durationMs, meta: meta(room) });
    for (const p of room.players.values()) { p.cur = null; p.order = null; sendQuestion(room, p); }
    room.dirty = true;
    room.tickTimer = setInterval(() => tick(room), 1000);
  }
  function tick(room) {
    if (room.status !== 'running') { clearInterval(room.tickTimer); return; }
    const { events, changed, storm } = MODES.onTick(room);
    events.forEach(e => io.to(room.code).emit('room:event', e));
    changed.forEach(p => { sendMe(room, p, { out: p.alive === false }); });
    if (changed.length) room.dirty = true;
    const rem = remainingMs(room);
    io.to(room.code).emit('room:tick', { remainingMs: rem, storm });
    room.tickN = (room.tickN || 0) + 1;
    if (room.dirty) {
      room.dirty = false; room.boardDirty = true;
      io.to(hostRoom(room.code)).emit('room:state', { players: publicPlayers(room) });
    }
    if (room.boardDirty && room.tickN % 2 === 0) {
      room.boardDirty = false;
      const all = publicPlayers(room), ranks = {};
      all.forEach((p, i) => { ranks[p.id] = i + 1; });
      io.to(room.code).emit('room:board', { top: all.slice(0, 10), count: all.length, alive: all.filter(p => p.alive !== false).length, ranks });
    }
    if (room.mode === 'elimination' && room.players.size >= 2) {
      const alive = [...room.players.values()].filter(p => p.alive !== false);
      if (alive.length <= 1 && !room.finaleTimer) room.finaleTimer = setTimeout(() => endRoom(room), 3000);
    }
    if (room.mode === 'rocket' && room.players.size >= 1 && [...room.players.values()].every(p => p.finished)) endRoom(room);
    if (rem <= 0) endRoom(room);
  }
  function endRoom(room) {
    if (!room || room.status === 'ended') return;
    clearInterval(room.tickTimer); clearTimeout(room.finaleTimer); clearTimeout(room.introTimer);
    room.status = 'ended';
    const ranked = publicPlayers(room);
    for (const player of room.players.values()) {
      const placement = Math.max(1, ranked.findIndex(p => p.id === player.id) + 1);
      const placementBonus = placement === 1 ? 40 : placement === 2 ? 25 : placement === 3 ? 15 : 5;
      const xp = Math.min(150, 25 + Math.min(player.correctCount || 0, 25) * 3 + placementBonus);
      const requestedCoins = Math.min(120, 30 + Math.min(player.correctCount || 0, 25) * 4 + placementBonus);
      const coins = cappedDailyCoins(player.id, requestedCoins);
      const sock = io.sockets.sockets.get(player.socketId);
      if (sock) sock.emit('live:reward', { playerId: player.id, xp, coins, correctCount: player.correctCount || 0, placement });
    }
    io.to(room.code).emit('room:ended', { players: ranked, mode: room.mode });
  }
  const requireHost = (room, tok) => room && room.hostToken === tok;
  setInterval(() => { const now = Date.now(); for (const [code, room] of rooms.entries()) if (now - room.createdAt > ROOM_MAX_AGE_MS) { clearInterval(room.tickTimer); rooms.delete(code); } }, 30 * 60 * 1000);

  io.on('connection', socket => {
    let joined = null;
    socket.on('host:create', (payload, cb) => {
      try {
        const { title, subjectId, mode, questions, hostName, config: raw } = payload || {};
        const config = {
          questionCount: Math.max(1, Math.min(50, Number(raw?.questionCount) || 10)),
          durationMin: Math.max(1, Math.min(30, Number(raw?.durationMin) || 5)),
          wrongPauseMs: Math.max(1000, Math.min(5000, Math.round((Number(raw?.wrongPauseSec) || 2) * 1000))),
          shuffleQuestions: raw?.shuffleQuestions !== false,
          shuffleAnswers: raw?.shuffleAnswers === true,
          showLeaderboard: raw?.showLeaderboard !== false,
          maxPlayers: Math.max(2, Math.min(100, Number(raw?.maxPlayers) || 50)),
          pointsMode: ['speed', 'flat', 'finale'].includes(raw?.pointsMode) ? raw.pointsMode : 'speed',
          allowLateJoin: raw?.allowLateJoin === true,
          lives: Math.max(1, Math.min(3, Number(raw?.lives) || 1)),
          locked: false
        };
        const clean = sanitizeQuestions(questions, config);
        if (!clean.length) return cb && cb({ ok: false, error: 'No valid questions provided.' });
        config.questionCount = clean.length;
        const code = genRoomCode(), hostToken = genId();
        const room = { code, hostToken, hostName: cleanDisplayName(hostName, 'Host'), mode: MODE_LIST.includes(mode) ? mode : 'trivia', title: cleanRoomTitle(title), subjectId: subjectId || '',
          questions: clean, config, durationMs: config.durationMin * 60000, status: 'lobby', players: new Map(), createdAt: Date.now(), dirty: true };
        rooms.set(code, room);
        socket.join(code); socket.join(hostRoom(code));
        joined = { code, playerId: null, role: 'host' };
        cb && cb({ ok: true, code, hostToken, config, meta: meta(room) });
      } catch (e) { cb && cb({ ok: false, error: 'Could not create the room.' }); }
    });

    socket.on('player:join', (payload, cb) => {
      const { code, name, playerId } = payload || {};
      const nameError = nameViolationReason(name);
      if (nameError) return cb && cb({ ok: false, error: nameError, code: 'NAME_NOT_ALLOWED' });
      const safeName = cleanDisplayName(name, 'Player');
      const room = rooms.get((code || '').toUpperCase());
      if (!room) return cb && cb({ ok: false, error: 'No game found with that code.' });
      const existingId = playerId && room.players.has(playerId) ? playerId : null;
      if (room.status === 'ended' && !existingId) return cb && cb({ ok: false, error: 'That game has already ended.' });
      if (!existingId && room.config.locked) return cb && cb({ ok: false, error: 'The host has locked this game.' });
      if (!existingId && room.status !== 'lobby' && !room.config.allowLateJoin) return cb && cb({ ok: false, error: 'That game has already started.' });
      if (!existingId && [...room.players.values()].some(p => p.name.toLowerCase() === safeName.toLowerCase() && p.online)) return cb && cb({ ok: false, error: 'That name is taken in this game. Pick another.' });
      if (!existingId && room.players.size >= room.config.maxPlayers) return cb && cb({ ok: false, error: 'This game is full.' });
      const id = existingId || genId();
      let p = room.players.get(id);
      if (p) { p.online = true; p.socketId = socket.id; p.name = safeName; }
      else {
        p = { id, name: safeName, score: 0, correctCount: 0, gold: 0, chestsAvailable: 0, alive: true, lives: room.config.lives || 1, streak: 0, online: true, socketId: socket.id };
        MODES.initPlayer(room, p); room.players.set(id, p);
      }
      socket.join(room.code);
      joined = { code: room.code, playerId: id, role: 'player' };
      room.dirty = true;
      io.to(room.code).emit('room:roster', { players: publicPlayers(room), title: room.title, mode: room.mode, hostName: room.hostName, config: room.config });
      cb && cb({ ok: true, code: room.code, playerId: id, title: room.title, mode: room.mode, hostName: room.hostName, config: room.config, status: room.status, remainingMs: remainingMs(room), meta: meta(room), me: pub(room, p) });
      if (room.status === 'running') {
        if (!p.cur && !p.order) sendQuestion(room, p);
        else setTimeout(() => { if (p.lockUntil > Date.now()) setTimeout(() => sendQuestion(room, p), p.lockUntil - Date.now()); else if (p.curPayload && !p.cur.answered) { const s = io.sockets.sockets.get(p.socketId); if (s) s.emit('player:question', p.curPayload); } else sendQuestion(room, p); }, 150);
      }
    });

    socket.on('host:sync', (payload, cb) => {
      const { code, hostToken } = payload || {};
      const room = rooms.get((code || '').toUpperCase());
      if (!requireHost(room, hostToken)) return cb && cb({ ok: false, error: 'Not authorized for that room.' });
      socket.join(room.code); socket.join(hostRoom(room.code));
      joined = { code: room.code, playerId: null, role: 'host' };
      cb && cb({ ok: true, code: room.code, title: room.title, mode: room.mode, config: room.config, status: room.status, players: publicPlayers(room), remainingMs: remainingMs(room), meta: meta(room) });
    });

    socket.on('host:start', ({ code, hostToken } = {}) => {
      const room = rooms.get((code || '').toUpperCase());
      if (!requireHost(room, hostToken) || room.status !== 'lobby') return;
      room.status = 'intro';
      io.to(room.code).emit('room:intro', { mode: room.mode, ...MODES.INTRO[room.mode], durationMs: room.durationMs, meta: meta(room), ms: 4500 });
      room.introTimer = setTimeout(() => { if (room.status === 'intro') startRunning(room); }, 4500);
    });
    socket.on('host:lock', ({ code, hostToken, locked } = {}) => {
      const room = rooms.get((code || '').toUpperCase());
      if (!requireHost(room, hostToken)) return;
      room.config.locked = !!locked;
      io.to(room.code).emit('room:roster', { players: publicPlayers(room), config: room.config });
    });
    socket.on('host:kick', ({ code, hostToken, playerId } = {}) => {
      const room = rooms.get((code || '').toUpperCase());
      if (!requireHost(room, hostToken)) return;
      const p = room.players.get(playerId); if (!p) return;
      const sock = io.sockets.sockets.get(p.socketId);
      if (sock) { sock.emit('room:kicked'); sock.leave(room.code); }
      room.players.delete(playerId); room.dirty = true;
      io.to(room.code).emit('room:roster', { players: publicPlayers(room), config: room.config });
    });
    socket.on('host:end', ({ code, hostToken } = {}) => {
      const room = rooms.get((code || '').toUpperCase());
      if (!requireHost(room, hostToken)) return;
      endRoom(room);
    });

    socket.on('player:answer', ({ code, playerId, seq, idx, text } = {}) => {
      const room = rooms.get((code || '').toUpperCase());
      if (!room || room.status !== 'running') return;
      const p = room.players.get(playerId);
      if (!p || !p.cur || p.cur.answered || p.cur.seq !== seq) return;
      if (p.alive === false || p.finished) return;
      const now = Date.now();
      if (now < p.lockUntil || now > room.endsAt + 500) return;
      const q = room.questions[p.cur.qi];
      let correct;
      if (q.type === 'type') correct = LIBRARY.typedMatches(q, String(text == null ? '' : text).slice(0, 200));
      else { const shown = Number.isInteger(idx) ? idx : -1; const orig = p.cur.perm && shown >= 0 && shown < p.cur.perm.length ? p.cur.perm[shown] : -1; correct = orig === q.correct; }
      p.cur.answered = true; p.answered = (p.answered || 0) + 1;
      if (correct) p.correctCount = (p.correctCount || 0) + 1;
      const speed = Math.max(0, Math.min(1, 1 - (now - p.cur.sentAt) / 10000));
      const pm = room.config.pointsMode;
      const base = pm === 'flat' ? 150 : Math.round(100 + 100 * speed);
      const boost = pm === 'finale' && remainingMs(room) <= 60000 ? 2 : 1;
      const res = MODES.applyAnswer(room, p, correct, speed, base, boost);
      const lockMs = correct ? 0 : room.config.wrongPauseMs;
      p.lockUntil = correct ? 0 : now + lockMs;
      room.dirty = true;
      const out = p.alive === false;
      const correctAnswer = correct ? null : (q.type === 'type' ? q.answers[0] : q.options[q.correct]);
      const sock = io.sockets.sockets.get(p.socketId);
      if (sock) sock.emit('answer:result', { seq, correct, points: res.points, msg: res.msg, correctAnswer, explanation: correct ? '' : (q.explanation || ''), lockMs, out, finished: p.finished, me: pub(room, p), storm: MODES.stormNow(room) });
      if (out) io.to(room.code).emit('room:event', { type: 'ko', text: '💀 ' + p.name + ' is out!' });
      if (p.finished) io.to(room.code).emit('room:event', { type: 'finish', text: '🏁 ' + p.name + ' crossed the finish line (#' + p.finishOrder + ')' });
      if (!out && !p.finished) {
        if (correct) sendQuestion(room, p);
        else setTimeout(() => { if (room.status === 'running') sendQuestion(room, p); }, lockMs);
      }
    });

    socket.on('player:openChest', ({ code, playerId } = {}) => {
      const room = rooms.get((code || '').toUpperCase());
      if (!room || room.mode !== 'gold' || room.status !== 'running') return;
      const p = room.players.get(playerId);
      if (!p || !(p.chestsAvailable > 0)) return;
      p.chestsAvailable -= 1;
      const res = MODES.openChest(room, p);
      room.dirty = true;
      const sock = io.sockets.sockets.get(p.socketId);
      if (sock) sock.emit('chest:result', { ...res, bonus: res.delta, gold: p.gold, chests: p.chestsAvailable, me: pub(room, p) });
      if (res.type === 'steal') { const t = room.players.get(res.targetId); if (t) sendMe(room, t); io.to(room.code).emit('room:event', { type: 'steal', text: p.name + ': ' + res.text }); }
      if (res.type === 'jackpot') io.to(room.code).emit('room:event', { type: 'jackpot', text: p.name + ' hit a ' + res.text });
    });

    socket.on('disconnect', () => {
      if (!joined) return;
      const room = rooms.get(joined.code);
      if (!room) return;
      if (joined.role === 'player' && joined.playerId) {
        const p = room.players.get(joined.playerId);
        if (p) { p.online = false; room.dirty = true; io.to(room.code).emit('room:roster', { players: publicPlayers(room) }); }
      }
    });
  });
}
module.exports = { attach };
