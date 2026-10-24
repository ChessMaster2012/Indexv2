'use strict';
/**
 * Server-authoritative rules for each Live Game mode. Every mode keeps its own state on the player
 * object and reports a compact `last` result so clients can animate it. `score` is always the value
 * used for ranking and rewards (distance, floors, gold, ... are converted into score here).
 */
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const INTRO = {
  trivia: { title: 'Trivia Dash', tagline: 'Speed wins the podium.', rules: ['Faster correct answers score more', 'The fastest correct answer each round earns a +100 Speed Demon bonus', 'Climb the live standings'] },
  rocket: { title: 'Rocket Race', tagline: 'Fuel up. Reach the finish line first.', rules: ['Correct answers fire your engines — faster means more thrust', 'Build a streak for TURBO boosts', 'A wrong answer stalls your engine and sets you back'] },
  tower: { title: 'Tower Climb', tagline: 'Build the tallest tower in the skyline.', rules: ['Each correct answer adds a floor — answer quickly for a bonus floor', 'A 3-streak earns a shield that blocks one collapse', 'Storm rounds hit every 4th question: wrong answers lose 2 floors!'] },
  gold: { title: 'Gold Rush', tagline: 'Dig. Gamble. Steal.', rules: ['Correct answers earn gold and a treasure chest', 'Chests hold jackpots, boosts… or pirate raids', 'Some chests let you steal gold from the leaders'] },
  streak: { title: 'Streak Surge', tagline: 'Don’t let the fire go out.', rules: ['Chain correct answers to raise your multiplier up to ×5', 'Hit 5 in a row for a Fireproof shield that saves one miss', 'One miss without a shield resets everything'] },
  elimination: { title: 'Last Stand', tagline: 'Be the last one standing.', rules: ['Every miss costs a life — at zero you’re out', 'If a round would knock out everyone left, nobody loses a life', 'The game ends the moment one survivor remains'] }
};

function trackLength(room) { return Math.max(40, room.questions.length * 16); }
function isStorm(room, index) { return room.mode === 'tower' && index % 4 === 3; }
function streakMult(s) { return s >= 10 ? 5 : s >= 8 ? 4 : s >= 6 ? 3 : s >= 4 ? 2 : s >= 2 ? 1.5 : 1; }

function initPlayer(room, p) {
  Object.assign(p, { dist: 0, floors: 0, shield: 0, best: 0, elimQ: -1, finishedQ: -1, last: null });
}
function meta(room) {
  return { trackLength: room.mode === 'rocket' ? trackLength(room) : undefined, storm: isStorm(room, room.currentQuestion) || undefined };
}
/** Applies one answer. Returns { points, msg }. `speed` is 0..1 (1 = instant). */
function applyAnswer(room, player, correct, speed, basePoints) {
  const qi = room.currentQuestion;
  let points = 0, msg = correct ? 'Correct!' : 'Missed';
  const wasStreak = player.streak || 0;
  const mode = room.mode;
  if (correct) { player.streak = wasStreak + 1; player.best = Math.max(player.best || 0, player.streak); }
  else if (mode !== 'streak' || !player.shield) player.streak = 0;

  if (mode === 'rocket') {
    if (correct) {
      const turbo = player.streak >= 3;
      const thrust = Math.round(8 + 10 * speed + Math.min(player.streak - 1, 5) * 2);
      player.dist += thrust;
      msg = (turbo ? '🔥 TURBO ' : '🚀 ') + '+' + thrust + ' km';
      if (player.finishedQ < 0 && player.dist >= trackLength(room)) { player.finishedQ = qi; player.finishOrder = (room.finishCount = (room.finishCount || 0) + 1); msg = '🏁 FINISHED #' + player.finishOrder; }
    } else {
      const loss = Math.min(player.dist, 4);
      player.dist -= loss; msg = '💨 Engine stall' + (loss ? ' −' + loss + ' km' : '');
    }
    const prev = player.score; player.score = Math.round(player.dist * 10) + (player.finishOrder ? Math.max(0, 6 - player.finishOrder) * 40 : 0);
    points = player.score - prev;
  } else if (mode === 'tower') {
    const storm = isStorm(room, qi);
    if (correct) {
      let add = 1 + (speed > 0.7 ? 1 : 0) + (storm ? 1 : 0);
      player.floors += add; msg = '🏗️ +' + add + ' floor' + (add > 1 ? 's' : '') + (storm ? ' (storm bonus)' : '');
      if (player.streak % 3 === 0 && !player.shield) { player.shield = 1; msg += ' · 🛡️ shield!'; }
    } else if (player.shield) { player.shield = 0; msg = '🛡️ Shield absorbed the collapse'; }
    else { const loss = Math.min(player.floors, storm ? 2 : 1); player.floors -= loss; msg = loss ? '💥 Collapse −' + loss + ' floor' + (loss > 1 ? 's' : '') : '💥 Foundation shaken'; }
    const prev = player.score; player.score = player.floors * 100 + player.correctCount * 5 + (correct ? 5 : 0);
    points = player.score - prev;
  } else if (mode === 'gold') {
    if (correct) { const earn = 50 + Math.round(100 * speed); player.gold += earn; player.chestsAvailable = (player.chestsAvailable || 0) + 1; msg = '💰 +' + earn + ' gold · 🎁 chest!'; }
    else msg = 'No gold';
    const prev = player.score; player.score = player.gold; points = player.score - prev;
  } else if (mode === 'streak') {
    const mult = streakMult(wasStreak);
    if (correct) {
      points = Math.round(basePoints * mult);
      msg = '🔥 ×' + mult + ' · +' + points;
      if (player.streak === 5 || player.streak === 10) { player.shield = 1; msg += ' · 🧯 Fireproof!'; }
      player.score += points;
    } else if (player.shield) { player.shield = 0; msg = '🧯 Fireproof saved your streak!'; }
    else msg = wasStreak >= 2 ? '💔 Streak lost (' + wasStreak + ')' : 'Missed';
  } else if (mode === 'elimination') {
    if (correct) { points = Math.round(basePoints / 10) + 100; player.score += points; msg = '🛡️ Survived · +' + points; }
    else msg = '💔 Wrong answer — you’ll lose a life';
  } else { // trivia
    points = basePoints;
    if (correct && !room.qFirstCorrect) { room.qFirstCorrect = player.id; points += 100; msg = '⚡ Speed Demon! +' + points; }
    else if (correct) msg = '+' + points;
    player.score += points;
  }
  player.last = { q: qi, correct, delta: points, msg };
  return { points, msg };
}

/** Runs after the question closes: handles non-answers, elimination, and mode finales. Returns { events, finale }. */
function onReveal(room) {
  const qi = room.currentQuestion, events = [];
  let finale = false;
  const answered = p => room.answers.has(qi + ':' + p.id);
  for (const p of room.players.values()) {
    if (!answered(p)) { p.streak = (room.mode === 'streak' && p.shield) ? p.streak : 0; p.last = { q: qi, correct: null, delta: 0, msg: p.alive === false ? '👻 Spectating' : '⌛ No answer' }; }
  }
  if (room.mode === 'trivia' && room.qFirstCorrect) {
    const w = room.players.get(room.qFirstCorrect); if (w) events.push({ type: 'fast', text: '⚡ ' + w.name + ' was fastest!' });
  }
  if (room.mode === 'tower' && isStorm(room, qi)) events.push({ type: 'storm', text: '⛈️ Storm round!' });
  if (room.mode === 'elimination') {
    const alive = [...room.players.values()].filter(p => p.alive !== false);
    const misses = alive.filter(p => !(answered(p) && room.answers.get(qi + ':' + p.id).correct));
    const wouldWipe = misses.length > 0 && alive.every(p => (misses.includes(p) && (p.lives || 1) - 1 <= 0));
    if (wouldWipe && alive.length > 1) events.push({ type: 'mercy', text: '🕊️ Mercy! Everyone would have fallen, so nobody lost a life.' });
    else for (const p of misses) {
      p.lives = (p.lives || 1) - 1;
      if (p.lives <= 0) { p.alive = false; p.elimQ = qi; events.push({ type: 'ko', text: '💀 ' + p.name + ' is out!' }); if (p.last) p.last.msg = '💀 Eliminated'; }
      else if (p.last) p.last.msg = '💔 −1 life (' + p.lives + ' left)';
    }
    const left = [...room.players.values()].filter(p => p.alive !== false);
    if (room.players.size >= 2 && left.length <= 1) finale = true;
  }
  if (room.mode === 'rocket') {
    const done = [...room.players.values()].filter(p => p.finishedQ === qi);
    done.sort((a, b) => a.finishOrder - b.finishOrder).forEach(p => events.push({ type: 'finish', text: '🏁 ' + p.name + ' crossed the finish line (#' + p.finishOrder + ')' }));
  }
  return { events, finale };
}

/** Resolves a treasure chest. Returns { type, delta, text, target? }. */
function openChest(room, player) {
  const rich = [...room.players.values()].filter(p => p.id !== player.id && p.gold > 20).sort((a, b) => b.gold - a.gold).slice(0, 3);
  const r = Math.random();
  let res;
  if (r < 0.40) { const d = rand(40, 120); player.gold += d; res = { type: 'gold', delta: d, text: '+' + d + ' gold' }; }
  else if (r < 0.50) { const d = rand(180, 300); player.gold += d; res = { type: 'jackpot', delta: d, text: '💎 JACKPOT +' + d }; }
  else if (r < 0.60) { const d = clamp(Math.round(player.gold * 0.3), 30, 200); player.gold += d; res = { type: 'boost', delta: d, text: '📈 Gold boost +' + d }; }
  else if (r < 0.80 && rich.length) {
    const t = rich[rand(0, rich.length - 1)]; const take = Math.min(t.gold, clamp(Math.round(t.gold * 0.2) + 20, 30, 150));
    t.gold -= take; t.score = t.gold; player.gold += take;
    res = { type: 'steal', delta: take, target: t.name, text: '🏴‍☠️ Stole ' + take + ' from ' + t.name };
  } else if (r < 0.92 && player.gold > 0) { const d = Math.min(player.gold, rand(20, 80)); player.gold -= d; res = { type: 'raid', delta: -d, text: '☠️ Pirates raided −' + d }; }
  else { player.gold += 15; res = { type: 'dust', delta: 15, text: '✨ A little gold dust +15' }; }
  player.score = player.gold;
  return res;
}

/** Sort order used for rankings (live leaderboard + final results). */
function compare(room) {
  if (room.mode === 'elimination') return (a, b) => ((b.alive !== false) - (a.alive !== false)) || ((b.elimQ) - (a.elimQ)) || (b.score - a.score);
  if (room.mode === 'rocket') return (a, b) => (b.score - a.score);
  return (a, b) => b.score - a.score;
}
module.exports = { INTRO, initPlayer, meta, applyAnswer, onReveal, openChest, compare, trackLength };
