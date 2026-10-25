'use strict';
/**
 * Server-authoritative rules for each Live Game mode (self-paced play).
 * Everyone answers their own question stream until the game clock runs out. A wrong answer locks the
 * player out for a short pause. Each mode keeps its own state on the player object; `score` is the
 * value used for ranking and rewards. `last` carries the latest result for client animations.
 */
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const STORM_PERIOD = 60000, STORM_LEN = 15000, DANGER_PERIOD = 45000;

const INTRO = {
  trivia: { title: 'Trivia Dash', tagline: 'Answer as many as you can before time runs out.', rules: ['Every correct answer scores — quick answers earn a bonus', 'A wrong answer freezes you for a moment', 'Climb the live podium'] },
  rocket: { title: 'Rocket Race', tagline: 'Fuel up. Reach the finish line first.', rules: ['Each correct answer fires your engines — answer fast for more thrust', 'Chain answers for TURBO boosts', 'A wrong answer stalls your engine and sets you back'] },
  tower: { title: 'Tower Climb', tagline: 'Build the tallest tower in the skyline.', rules: ['Each correct answer adds a floor — fast answers add a bonus floor', 'A 3-streak earns a shield that blocks one collapse', 'Storms hit at the end of every minute: wrong answers lose 2 floors!'] },
  gold: { title: 'Gold Rush', tagline: 'Dig. Gamble. Steal.', rules: ['Correct answers earn gold and a treasure chest', 'Open chests any time — jackpots, boosts, steals… or pirate raids', 'Most gold when the clock hits zero wins'] },
  streak: { title: 'Streak Surge', tagline: 'Don’t let the fire go out.', rules: ['Chain correct answers to raise your multiplier up to ×5', 'Hit 5 in a row for a Fireproof shield that saves one miss', 'A miss without a shield resets everything'] },
  elimination: { title: 'Last Stand', tagline: 'Be the last one standing.', rules: ['Every miss costs a life — at zero you’re out', 'Every 45 seconds the player in last place loses a life', 'Last player standing — or the most survivors when time ends — wins'] }
};

function trackLength(room) { return clamp(room.questions.length * 16, 60, 400); }
function elapsed(room) { return Date.now() - (room.startedAt || Date.now()); }
function stormNow(room) { return room.mode === 'tower' && room.status === 'running' && (elapsed(room) % STORM_PERIOD) >= (STORM_PERIOD - STORM_LEN); }
function streakMult(s) { return s >= 10 ? 5 : s >= 8 ? 4 : s >= 6 ? 3 : s >= 4 ? 2 : s >= 2 ? 1.5 : 1; }

function initPlayer(room, p) {
  Object.assign(p, { dist: 0, floors: 0, shield: 0, best: 0, answered: 0, elimAt: 0, finished: false, finishOrder: 0, lockUntil: 0, last: null });
}
/** Applies one answer. `boost` is 1 (normal) or 2 (final-minute double). Returns { points, msg }. */
function applyAnswer(room, p, correct, speed, base, boost) {
  const mode = room.mode, wasStreak = p.streak || 0;
  let points = 0, msg = correct ? 'Correct!' : 'Missed';
  if (correct) { p.streak = wasStreak + 1; p.best = Math.max(p.best || 0, p.streak); }
  else if (mode !== 'streak' || !p.shield) p.streak = 0;

  if (mode === 'rocket') {
    if (correct) {
      const turbo = p.streak >= 3;
      const thrust = Math.round((8 + 10 * speed + Math.min(p.streak - 1, 5) * 2) * boost);
      p.dist += thrust; msg = (turbo ? '🔥 TURBO ' : '🚀 ') + '+' + thrust + ' km';
      if (!p.finished && p.dist >= trackLength(room)) { p.finished = true; p.finishOrder = (room.finishCount = (room.finishCount || 0) + 1); msg = '🏁 FINISHED #' + p.finishOrder; }
    } else { const loss = Math.min(p.dist, 4); p.dist -= loss; msg = '💨 Engine stall' + (loss ? ' −' + loss + ' km' : ''); }
    const prev = p.score; p.score = Math.round(Math.min(p.dist, trackLength(room)) * 10) + (p.finishOrder ? Math.max(0, 6 - p.finishOrder) * 60 : 0); points = p.score - prev;
  } else if (mode === 'tower') {
    const storm = stormNow(room);
    if (correct) {
      const add = 1 + (speed > 0.7 ? 1 : 0) + (storm ? 1 : 0) + (boost > 1 ? 1 : 0);
      p.floors += add; msg = '🏗️ +' + add + ' floor' + (add > 1 ? 's' : '') + (storm ? ' (storm bonus)' : '');
      if (p.streak % 3 === 0 && !p.shield) { p.shield = 1; msg += ' · 🛡️ shield!'; }
    } else if (p.shield) { p.shield = 0; msg = '🛡️ Shield absorbed the collapse'; }
    else { const loss = Math.min(p.floors, storm ? 2 : 1); p.floors -= loss; msg = loss ? '💥 Collapse −' + loss + ' floor' + (loss > 1 ? 's' : '') : '💥 Foundation shaken'; }
    const prev = p.score; p.score = p.floors * 100 + p.correctCount * 5; points = p.score - prev;
  } else if (mode === 'gold') {
    if (correct) { const earn = Math.round((40 + 80 * speed) * boost); p.gold += earn; p.chestsAvailable = (p.chestsAvailable || 0) + 1; msg = '💰 +' + earn + ' gold · 🎁 chest!'; }
    else msg = 'No gold';
    const prev = p.score; p.score = p.gold; points = p.score - prev;
  } else if (mode === 'streak') {
    const mult = streakMult(wasStreak);
    if (correct) {
      points = Math.round(base * mult * boost); msg = '🔥 ×' + mult + ' · +' + points;
      if (p.streak === 5 || p.streak === 10 || (p.streak > 10 && p.streak % 10 === 0)) { p.shield = 1; msg += ' · 🧯 Fireproof!'; }
      p.score += points;
    } else if (p.shield) { p.shield = 0; msg = '🧯 Fireproof saved your streak!'; }
    else msg = wasStreak >= 2 ? '💔 Streak lost (' + wasStreak + ')' : 'Missed';
  } else if (mode === 'elimination') {
    if (correct) { points = Math.round(base * boost); p.score += points; msg = '🛡️ Survived · +' + points; }
    else {
      p.lives = (p.lives || 1) - 1;
      if (p.lives <= 0) { p.alive = false; p.elimAt = Date.now(); msg = '💀 Eliminated'; } else msg = '💔 −1 life (' + p.lives + ' left)';
    }
  } else { // trivia
    if (correct) { points = Math.round(base * boost); msg = (speed > 0.7 ? '⚡ Quick! +' : '+') + points; p.score += points; }
  }
  p.last = { c: correct, d: points, msg, t: Date.now() };
  return { points, msg };
}
/** Opens a treasure chest (gold mode). Returns { type, delta, text, target? }. */
function openChest(room, player) {
  const rich = [...room.players.values()].filter(p => p.id !== player.id && p.gold > 20).sort((a, b) => b.gold - a.gold).slice(0, 3);
  const r = Math.random(); let res;
  if (r < 0.42) { const d = rand(40, 120); player.gold += d; res = { type: 'gold', delta: d, text: '+' + d + ' gold' }; }
  else if (r < 0.50) { const d = rand(180, 300); player.gold += d; res = { type: 'jackpot', delta: d, text: '💎 JACKPOT +' + d }; }
  else if (r < 0.60) { const d = clamp(Math.round(player.gold * 0.3), 30, 200); player.gold += d; res = { type: 'boost', delta: d, text: '📈 Gold boost +' + d }; }
  else if (r < 0.80 && rich.length) {
    const t = rich[rand(0, rich.length - 1)]; const take = Math.min(t.gold, clamp(Math.round(t.gold * 0.2) + 20, 30, 150));
    t.gold -= take; t.score = t.gold; player.gold += take; res = { type: 'steal', delta: take, target: t.name, targetId: t.id, text: '🏴‍☠️ Stole ' + take + ' from ' + t.name };
  } else if (r < 0.92 && player.gold > 0) { const d = Math.min(player.gold, rand(20, 80)); player.gold -= d; res = { type: 'raid', delta: -d, text: '☠️ Pirates raided −' + d }; }
  else { player.gold += 15; res = { type: 'dust', delta: 15, text: '✨ Gold dust +15' }; }
  player.score = player.gold; return res;
}
/** Called once a second. Returns events [{type,text}] and a list of players whose state changed. */
function onTick(room) {
  const events = [], changed = [];
  const el = elapsed(room);
  const storm = stormNow(room);
  if (room.mode === 'tower' && storm !== !!room.stormFlag) { room.stormFlag = storm; events.push({ type: 'storm', text: storm ? '⛈️ Storm incoming — wrong answers cost 2 floors!' : '🌤️ The storm has passed.' }); }
  if (room.mode === 'elimination') {
    const bucket = Math.floor(el / DANGER_PERIOD);
    if (bucket > (room.dangerBucket || 0)) {
      room.dangerBucket = bucket;
      const alive = [...room.players.values()].filter(p => p.alive !== false);
      if (alive.length > 1) {
        alive.sort((a, b) => a.score - b.score);
        if (alive[0].score < alive[1].score) {
          const v = alive[0]; v.lives = (v.lives || 1) - 1;
          if (v.lives <= 0) { v.alive = false; v.elimAt = Date.now(); events.push({ type: 'ko', text: '💀 ' + v.name + ' was eliminated from last place!' }); }
          else events.push({ type: 'danger', text: '⚠️ ' + v.name + ' lost a life in the danger zone (' + v.lives + ' left)' });
          changed.push(v);
        } else events.push({ type: 'mercy', text: '🕊️ Danger zone: tied for last — nobody loses a life.' });
      }
    }
  }
  return { events, changed, storm };
}
function compare(room) {
  if (room.mode === 'elimination') return (a, b) => ((b.alive !== false) - (a.alive !== false)) || (b.elimAt - a.elimAt) || (b.score - a.score);
  return (a, b) => b.score - a.score;
}
module.exports = { INTRO, initPlayer, applyAnswer, openChest, onTick, compare, trackLength, stormNow, STORM_PERIOD, STORM_LEN, DANGER_PERIOD };
