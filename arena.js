'use strict';
/**
 * Real-time arena simulation for the action Live Game modes: Zombie Siege, Gem Heist and Last Stand.
 * The server is authoritative. Players send movement/action input; questions feed the game
 * (ammo, dash charges, shields). step() runs at 20 Hz, snapshot() is sent at 10 Hz.
 */
const W = 1200, H = 700, PR = 18, VAULT = { x: W / 2, y: H / 2, r: 90 };
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const ARENA_MODES = ['zombie', 'gems', 'elimination'];
const isArena = mode => ARENA_MODES.includes(mode);

function placePlayer(room, p) {
  const a = Math.random() * Math.PI * 2, d = rnd(40, 200);
  p.x = clamp(W / 2 + Math.cos(a) * d, 30, W - 30); p.y = clamp(H / 2 + Math.sin(a) * d, 30, H - 30);
  p.ang = 0; p.in = { mx: 0, my: 0, act: false, at: 0 }; p.actPrev = false; p.fireCd = 0; p.invuln = 0; p.down = false; p.stun = 0; p.dashT = 0; p.dx = 1; p.dy = 0; p.protect = 0;
}
function initPlayer(room, p) {
  placePlayer(room, p);
  if (room.mode === 'zombie') Object.assign(p, { hp: 100, ammo: 8, kills: 0, respawnAt: 0 });
  else if (room.mode === 'gems') Object.assign(p, { carry: 0, banked: 0, dc: 1 });
  else if (room.mode === 'elimination') Object.assign(p, { lives: 3, shield: 0 });
}
function setup(room) {
  room.arena = { t: 0, id: 1, zombies: [], bullets: [], gems: [], hazards: [], spawnAcc: 0, hazAcc: 0, sweepAcc: 0, gemAcc: 0, fx: [], step: 0, secMark: 0 };
  for (const p of room.players.values()) { initPlayer(room, p); p.score = 0; p.correctCount = 0; }
}
const alivePlayers = room => [...room.players.values()].filter(p => p.alive !== false && p.online !== false);

function movePlayers(room, dt, now) {
  for (const p of room.players.values()) {
    if (p.alive === false || p.down) continue;
    const inp = p.in; if (now - inp.at > 700) { inp.mx = 0; inp.my = 0; inp.act = false; }
    p.fireCd = Math.max(0, p.fireCd - dt); p.invuln = Math.max(0, p.invuln - dt); p.stun = Math.max(0, p.stun - dt); p.dashT = Math.max(0, p.dashT - dt);
    let mx = inp.mx, my = inp.my; const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.1) { p.dx = mx / Math.max(len, 1); p.dy = my / Math.max(len, 1); const hl = Math.hypot(p.dx, p.dy) || 1; p.dx /= hl; p.dy /= hl; p.ang = Math.atan2(p.dy, p.dx); }
    let speed = 215;
    if (room.mode === 'gems') speed *= clamp(1 - (p.carry || 0) * 0.012, 0.7, 1);
    if (p.stun > 0) speed = 0;
    if (p.dashT > 0) { p.x += p.dx * 640 * dt; p.y += p.dy * 640 * dt; }
    else { p.x += mx * speed * dt; p.y += my * speed * dt; }
    p.x = clamp(p.x, PR, W - PR); p.y = clamp(p.y, PR, H - PR);
  }
}

/* ---------------- Zombie Siege ---------------- */
const ZT = [{ hp: 1, sp: 50, r: 16, dmg: 12 }, { hp: 1, sp: 105, r: 14, dmg: 10 }, { hp: 4, sp: 42, r: 25, dmg: 20 }];
function stepZombie(room, dt, now) {
  const A = room.arena, t = A.t, living = alivePlayers(room), standing = living.filter(p => !p.down);
  // spawn
  const n = Math.max(1, living.length);
  const interval = clamp(1.5 - t * 0.0055, 0.32, 1.5) / (0.5 + 0.2 * n);
  const cap = Math.min(90, 28 + 3 * n);
  A.spawnAcc += dt;
  while (A.spawnAcc >= interval) {
    A.spawnAcc -= interval;
    if (A.zombies.length >= cap) continue;
    const r = Math.random(); const type = (t > 85 && r < 0.12) ? 2 : (t > 35 && r < 0.3) ? 1 : 0;
    const side = Math.floor(Math.random() * 4); let x, y;
    if (side === 0) { x = rnd(0, W); y = -20; } else if (side === 1) { x = rnd(0, W); y = H + 20; } else if (side === 2) { x = -20; y = rnd(0, H); } else { x = W + 20; y = rnd(0, H); }
    A.zombies.push({ id: A.id++, x, y, type, hp: ZT[type].hp, cd: 0 });
  }
  // players: respawn + fire
  for (const p of living) {
    if (p.down && now >= p.respawnAt) { p.down = false; p.hp = 100; p.invuln = 2; placePlayer(room, Object.assign(p, {})); p.down = false; p.hp = 100; p.invuln = 2; }
    if (p.down) continue;
    if (p.in.act && p.ammo > 0 && p.fireCd <= 0) {
      let best = null, bd = 520 * 520;
      for (const z of A.zombies) { const d = (z.x - p.x) ** 2 + (z.y - p.y) ** 2; if (d < bd) { bd = d; best = z; } }
      if (best) p.ang = Math.atan2(best.y - p.y, best.x - p.x);
      p.ammo--; p.fireCd = 0.17;
      if (A.bullets.length < 120) A.bullets.push({ x: p.x + Math.cos(p.ang) * 22, y: p.y + Math.sin(p.ang) * 22, vx: Math.cos(p.ang) * 680, vy: Math.sin(p.ang) * 680, life: 0.68, o: p.id });
    }
  }
  // zombies move + bite
  const spd = 1 + Math.min(0.4, t / 400);
  for (const z of A.zombies) {
    const T = ZT[z.type]; let tg = null, bd = Infinity;
    for (const p of standing) { const d = (p.x - z.x) ** 2 + (p.y - z.y) ** 2; if (d < bd) { bd = d; tg = p; } }
    z.cd = Math.max(0, z.cd - dt);
    if (!tg) continue;
    const dx = tg.x - z.x, dy = tg.y - z.y, d = Math.sqrt(bd) || 1;
    if (d > PR + T.r - 4) { z.x += dx / d * T.sp * spd * dt; z.y += dy / d * T.sp * spd * dt; }
    else if (z.cd <= 0 && tg.invuln <= 0) {
      tg.hp -= T.dmg; z.cd = 0.7;
      if (tg.hp <= 0) { tg.hp = 0; tg.down = true; tg.respawnAt = now + 4000; tg.in.act = false; room.dirty = true; }
    }
  }
  // bullets
  const kept = [];
  for (const b of A.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) continue;
    let hit = false;
    for (const z of A.zombies) {
      if (z.hp <= 0) continue; const T = ZT[z.type];
      if ((z.x - b.x) ** 2 + (z.y - b.y) ** 2 < (T.r + 6) ** 2) {
        z.hp--; hit = true;
        if (z.hp <= 0) { const o = room.players.get(b.o); if (o) { o.kills = (o.kills || 0) + 1; o.score = o.kills; room.dirty = true; } }
        break;
      }
    }
    if (!hit) kept.push(b);
  }
  A.bullets = kept; A.zombies = A.zombies.filter(z => z.hp > 0);
}

/* ---------------- Gem Heist ---------------- */
function stepGems(room, dt, now) {
  const A = room.arena, living = alivePlayers(room);
  const target = Math.min(44, 14 + 2 * living.length);
  A.gemAcc += dt;
  while (A.gemAcc >= 0.35) {
    A.gemAcc -= 0.35;
    if (A.gems.length >= target) continue;
    let x, y, tries = 0; do { x = rnd(50, W - 50); y = rnd(50, H - 50); tries++; } while (Math.hypot(x - VAULT.x, y - VAULT.y) < VAULT.r + 50 && tries < 10);
    const r = Math.random(); A.gems.push({ id: A.id++, x, y, v: r < 0.06 ? 8 : r < 0.24 ? 3 : 1 });
  }
  for (const p of living) {
    if (p.down) continue;
    // dash (edge triggered)
    if (p.in.act && !p.actPrev && p.dc > 0 && p.dashT <= 0 && p.stun <= 0) { p.dc--; p.dashT = 0.28; }
    p.actPrev = !!p.in.act;
    // collect
    for (let i = A.gems.length - 1; i >= 0; i--) {
      const g = A.gems[i];
      if ((g.x - p.x) ** 2 + (g.y - p.y) ** 2 < (PR + 14) ** 2 && p.carry < 30) { p.carry = Math.min(30, p.carry + g.v); A.gems.splice(i, 1); }
    }
    const inVault = Math.hypot(p.x - VAULT.x, p.y - VAULT.y) < VAULT.r;
    if (inVault && p.carry > 0) {
      p.banked += p.carry; if (p.carry >= 10) room._events.push({ type: 'bank', text: '💎 ' + p.name + ' banked ' + p.carry + ' gems!' });
      p.carry = 0; p.score = p.banked; room.dirty = true;
    }
    // tackle while dashing
    if (p.dashT > 0) {
      for (const q of living) {
        if (q === p || q.down || q.protect > now || q.carry <= 0) continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) < PR * 2 && Math.hypot(q.x - VAULT.x, q.y - VAULT.y) >= VAULT.r) {
          const steal = Math.max(1, Math.ceil(q.carry * 0.5)); q.carry -= steal; p.carry = Math.min(30, p.carry + steal);
          q.stun = 0.7; q.protect = now + 1500; room._events.push({ type: 'steal', text: '💨 ' + p.name + ' tackled ' + q.name + ' for ' + steal + ' gems!' }); room.dirty = true;
        }
      }
    }
  }
}

/* ---------------- Last Stand (meteors + sweepers) ---------------- */
function hurt(room, p, now) {
  if (p.alive === false || p.invuln > 0) return;
  if (p.shield > 0) { p.shield--; p.invuln = 1; return; }
  p.lives--; p.invuln = 1.6; room.dirty = true;
  if (p.lives <= 0) { p.lives = 0; p.alive = false; p.elimAt = now; p.in.mx = p.in.my = 0; room._events.push({ type: 'ko', text: '💀 ' + p.name + ' was eliminated!' }); }
}
function stepDodge(room, dt, now) {
  const A = room.arena, prog = clamp(t(room) / room.durationMs, 0, 1), living = alivePlayers(room);
  const interval = clamp(1.25 - prog * 0.95, 0.28, 1.25);
  A.hazAcc += dt;
  while (A.hazAcc >= interval) {
    A.hazAcc -= interval;
    const count = 1 + Math.floor(living.length / 8);
    for (let i = 0; i < count; i++) {
      let x = rnd(60, W - 60), y = rnd(60, H - 60);
      if (living.length && Math.random() < 0.65) { const tg = living[Math.floor(Math.random() * living.length)]; x = clamp(tg.x + rnd(-45, 45), 40, W - 40); y = clamp(tg.y + rnd(-45, 45), 40, H - 40); }
      A.hazards.push({ id: A.id++, k: 0, a: x, b: y, r: 62 + prog * 20, w: 1.3 - prog * 0.35, w0: 1.3 - prog * 0.35, boom: 0 });
    }
  }
  if (prog > 0.2) {
    A.sweepAcc += dt; const si = clamp(7 - prog * 4, 3, 7);
    if (A.sweepAcc >= si) { A.sweepAcc = 0; const v = Math.random() < 0.5; A.hazards.push({ id: A.id++, k: 1, a: v ? 1 : 0, b: v ? rnd(60, W - 60) : rnd(60, H - 60), r: 46, w: 1.8, w0: 1.8, boom: 0 }); }
  }
  for (const h of A.hazards) {
    if (h.w > 0) { h.w -= dt; if (h.w <= 0) { h.boom = 0.45; for (const p of living) { if (p.alive === false) continue; const hit = h.k === 0 ? Math.hypot(p.x - h.a, p.y - h.b) < h.r + PR * 0.6 : (h.a === 1 ? Math.abs(p.x - h.b) < h.r / 2 + PR * 0.6 : Math.abs(p.y - h.b) < h.r / 2 + PR * 0.6); if (hit) hurt(room, p, now); } } }
    else h.boom -= dt;
  }
  A.hazards = A.hazards.filter(h => h.w > 0 || h.boom > 0);
  const sec = Math.floor(t(room) / 1000);
  if (sec !== A.secMark) { A.secMark = sec; for (const p of room.players.values()) { if (p.alive !== false) p.score = sec + (p.correctCount || 0) * 3; } room.dirty = true; }
}
const t = room => Date.now() - room.startedAt;

function step(room, dt) {
  const A = room.arena; if (!A) return; const now = Date.now(); A.t += dt; A.step++;
  room._events = [];
  movePlayers(room, dt, now);
  if (room.mode === 'zombie') stepZombie(room, dt, now); else if (room.mode === 'gems') stepGems(room, dt, now); else stepDodge(room, dt, now);
  return room._events;
}

/** Applies the effect of a correct/wrong answer. Returns the message shown to the player. */
function onAnswer(room, p, correct, speed, boost) {
  const A = room.arena;
  if (room.mode === 'zombie') {
    if (!correct) return '🔫 No ammo this time';
    const add = Math.round((6 + (speed > 0.7 ? 2 : 0)) * boost); p.ammo = Math.min(40, (p.ammo || 0) + add);
    let msg = '🔫 +' + add + ' ammo';
    if (A && p.streak > 0 && p.streak % 5 === 0) {
      let n = 0; for (const z of A.zombies) { if (z.hp > 0) { z.hp = 0; n++; } }
      A.zombies = A.zombies.filter(z => z.hp > 0); p.kills = (p.kills || 0) + n; p.score = p.kills; room.dirty = true; A.fx.push([0, Math.round(p.x), Math.round(p.y)]);
      msg += ' · 💥 AIRSTRIKE (' + n + ' kills)'; (room._pending = room._pending || []).push({ type: 'air', text: '💥 ' + p.name + ' called an airstrike — ' + n + ' zombies!' });
    }
    return msg;
  }
  if (room.mode === 'gems') {
    if (!correct) return '💨 No dash charge';
    const add = 2 + (speed > 0.7 ? 1 : 0); p.dc = Math.min(6, (p.dc || 0) + add * (boost > 1 ? 2 : 1)); return '💨 +' + add + ' dash charges';
  }
  if (!correct) return '🛡️ No shield';
  p.shield = Math.min(2, (p.shield || 0) + 1); let msg = '🛡️ Shield +1';
  if (p.streak > 0 && p.streak % 3 === 0 && p.lives < 3) { p.lives++; msg += ' · ❤️ +1 life'; }
  return msg;
}

function snapshot(room) {
  const A = room.arena; if (!A) return null; const r = Math.round;
  const pl = []; for (const p of room.players.values()) {
    let fl = (p.down ? 1 : 0) | (p.invuln > 0 ? 2 : 0) | ((p.dashT > 0 || p.stun > 0) ? 4 : 0) | (p.alive === false ? 8 : 0);
    let a, b, c;
    if (room.mode === 'zombie') { a = p.hp; b = p.ammo; c = p.kills; } else if (room.mode === 'gems') { a = p.carry; b = p.dc; c = p.banked; } else { a = p.lives; b = p.shield; c = 0; }
    pl.push([p.n, r(p.x), r(p.y), r(p.ang * 100) / 100, a, b, fl, c]);
  }
  const s = { t: r(A.t * 10) / 10, p: pl };
  if (room.mode === 'zombie') { s.z = A.zombies.map(z => [z.id, r(z.x), r(z.y), z.type, z.hp]); s.b = A.bullets.map(b => [r(b.x), r(b.y)]); }
  else if (room.mode === 'gems') s.g = A.gems.map(g => [g.id, r(g.x), r(g.y), g.v]);
  else s.h = A.hazards.map(h => [h.id, h.k, r(h.a), r(h.b), r(h.r), h.w > 0 ? 0 : 1, h.w > 0 ? r((1 - h.w / h.w0) * 100) / 100 : r(clamp(h.boom / 0.45, 0, 1) * 100) / 100]);
  if (A.fx.length) { s.fx = A.fx; A.fx = []; }
  return s;
}
module.exports = { W, H, VAULT, isArena, ARENA_MODES, setup, step, snapshot, onAnswer, initPlayer, placePlayer };
