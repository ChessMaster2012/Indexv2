'use strict';
/**
 * Server-authoritative rules for each Live Game mode (self-paced play).
 * Everyone answers their own question stream until the game clock runs out. A wrong answer locks the
 * player out for a short pause. Each mode keeps its own state on the player object; `score` is the
 * value used for ranking and rewards. `last` carries the latest result for client animations.
 */
const ARENA = require('./arena');
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const STORM_PERIOD = 60000, STORM_LEN = 15000, DANGER_PERIOD = 45000;

const INTRO = {
  trivia: { title: 'Trivia Dash', tagline: 'Answer as many as you can before time runs out.', rules: ['Every correct answer scores — quick answers earn a bonus', 'A wrong answer freezes you for a moment', 'Climb the live podium'] },
  rocket: { title: 'Rocket Race', tagline: 'Fuel up. Reach the finish line first.', rules: ['Each correct answer fires your engines — answer fast for more thrust', 'Chain answers for TURBO boosts', 'A wrong answer stalls your engine and sets you back'] },
  tower: { title: 'Tower Climb', tagline: 'Build the tallest tower in the skyline.', rules: ['Each correct answer adds a floor — fast answers add a bonus floor', 'A 3-streak earns a shield that blocks one collapse', 'Storms hit at the end of every minute: wrong answers lose 2 floors!'] },
  zombie: { title: 'Zombie Siege', tagline: 'Hold the line. Answer for ammo. Rack up kills.', rules: ['Survive wave after wave — runners, brutes, acid spitters, exploders and a BOSS every 4th wave', 'Hold FIRE (auto-aims), ROLL to dodge, and grab ammo, rapid-fire, shotgun, shield and nuke drops. Shoot red barrels to blow up crowds', 'Correct answers load ammo; every 5th in a row calls an airstrike. Stand next to a downed teammate to revive them — most kills wins'] },
  gems: { title: 'Gem Heist', tagline: 'Grab gems. Bank them. Don’t get tackled.', rules: ['Pick up gems and bank them in the center vault — but patrol drones zap anyone carrying a lot', 'Correct answers earn dash charges: dash into a rival to steal half of what they carry', 'Grab magnet, speed, shield and bomb power-ups, catch the Gem Rush, and bank double in the final 45 seconds'] },
  elimination: { title: 'Last Stand', tagline: 'Dodge everything. Be the last one standing.', rules: ['Five phases of chaos: meteors, laser grids, shockwave rings, hunter orbs and lava — watch the warnings!', 'Dash (SPACE / SHIFT) gives a moment of invincibility. Grab shield, heart and speed orbs', 'Correct answers earn shields, and every 3rd in a row restores a heart. Last survivor wins'] }
};

function trackLength(room) { return clamp(room.questions.length * 16, 60, 400); }
function elapsed(room) { return Date.now() - (room.startedAt || Date.now()); }
function stormNow(room) { return room.mode === 'tower' && room.status === 'running' && (elapsed(room) % STORM_PERIOD) >= (STORM_PERIOD - STORM_LEN); }
function streakMult(s) { return s >= 10 ? 5 : s >= 8 ? 4 : s >= 6 ? 3 : s >= 4 ? 2 : s >= 2 ? 1.5 : 1; }

function initPlayer(room, p) {
  Object.assign(p, { dist: 0, floors: 0, shield: 0, best: 0, answered: 0, elimAt: 0, finished: false, finishOrder: 0, lockUntil: 0, last: null });
  if (ARENA.isArena(room.mode)) ARENA.initPlayer(room, p);
}
/** Applies one answer. `boost` is 1 (normal) or 2 (final-minute double). Returns { points, msg }. */
function applyAnswer(room, p, correct, speed, base, boost) {
  const mode = room.mode, wasStreak = p.streak || 0;
  let points = 0, msg = correct ? 'Correct!' : 'Missed';
  if (correct) { p.streak = wasStreak + 1; p.best = Math.max(p.best || 0, p.streak); }
  else p.streak = 0;

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
  } else if (ARENA.isArena(mode)) {
    msg = ARENA.onAnswer(room, p, correct, speed, boost);
    if (mode === 'elimination') { const sec = Math.floor((Date.now() - room.startedAt) / 1000); p.score = (p.alive === false ? Math.floor(((p.elimAt || Date.now()) - room.startedAt) / 1000) : sec) + p.correctCount * 3; }
  } else { // trivia
    if (correct) { points = Math.round(base * boost); msg = (speed > 0.7 ? '⚡ Quick! +' : '+') + points; p.score += points; }
  }
  p.last = { c: correct, d: points, msg, t: Date.now() };
  return { points, msg };
}
/** Called once a second. Returns events [{type,text}] and a list of players whose state changed. */
function onTick(room) {
  const events = [], changed = [];
  const el = elapsed(room);
  const storm = stormNow(room);
  if (room.mode === 'tower' && storm !== !!room.stormFlag) { room.stormFlag = storm; events.push({ type: 'storm', text: storm ? '⛈️ Storm incoming — wrong answers cost 2 floors!' : '🌤️ The storm has passed.' }); }
  return { events, changed, storm };
}
function compare(room) {
  if (room.mode === 'elimination') return (a, b) => ((b.alive !== false) - (a.alive !== false)) || (b.elimAt - a.elimAt) || (b.score - a.score);
  if (room.mode === 'zombie') return (a, b) => (b.score - a.score) || ((b.correctCount || 0) - (a.correctCount || 0));
  if (room.mode === 'gems') return (a, b) => (b.score - a.score) || ((b.carry || 0) - (a.carry || 0)) || ((b.correctCount || 0) - (a.correctCount || 0));
  return (a, b) => b.score - a.score;
}
module.exports = { INTRO, initPlayer, applyAnswer, onTick, compare, trackLength, stormNow, STORM_PERIOD, STORM_LEN, DANGER_PERIOD };
