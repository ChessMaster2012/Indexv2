'use strict';
/**
 * Real-time arena simulation for the action Live Game modes: Zombie Siege, Gem Heist and Last Stand.
 * The server is authoritative. Players send movement/action input; questions feed the game
 * (ammo, dash charges, shields). step() runs at 20 Hz, snapshot() is sent at 10 Hz.
 *
 * v2: wave-based zombie siege (7 zombie types, boss waves, pickups, barrels, revive, dodge roll),
 * Gem Heist with walls, patrol drones, power-ups and Gem Rush events, and a phase-based Last Stand
 * (meteors, lasers, cross beams, shockwaves, hunter orbs, lava, dash with i-frames, power-up orbs).
 */
const W = 1200, H = 700, PR = 18, VAULT = { x: W / 2, y: H / 2, r: 90 };
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const r1 = n => Math.round(n * 10) / 10;
const ARENA_MODES = ['zombie', 'gems', 'elimination'];
const isArena = mode => ARENA_MODES.includes(mode);

/* ---------------- walls / obstacles ---------------- */
const OBST = {
  zombie: [[250, 140, 120, 38], [830, 520, 120, 38], [230, 500, 38, 120], [940, 110, 38, 120], [470, 250, 64, 64], [668, 390, 64, 64], [90, 330, 38, 90], [1070, 300, 38, 90]],
  gems: [[300, 190, 22, 150], [878, 360, 22, 150], [140, 520, 150, 22], [910, 160, 150, 22], [520, 60, 160, 22], [520, 618, 160, 22], [170, 320, 64, 64], [966, 316, 64, 64]],
  elimination: []
};
function pushOut(x, y, r, obs) {
  for (const o of obs) {
    const cx = clamp(x, o[0], o[0] + o[2]), cy = clamp(y, o[1], o[1] + o[3]);
    let dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 < 0.0001) { // centre inside the rect: push out by the shortest way
      const l = x - o[0], rr = o[0] + o[2] - x, t = y - o[1], b = o[1] + o[3] - y, m = Math.min(l, rr, t, b);
      if (m === l) x = o[0] - r; else if (m === rr) x = o[0] + o[2] + r; else if (m === t) y = o[1] - r; else y = o[1] + o[3] + r;
    } else { const d = Math.sqrt(d2); x = cx + dx / d * r; y = cy + dy / d * r; }
  }
  return [x, y];
}
const inWall = (x, y, r, obs) => obs.some(o => x > o[0] - r && x < o[0] + o[2] + r && y > o[1] - r && y < o[1] + o[3] + r);
function freeSpot(obs, r, tries, avoidVault) {
  let x, y, n = 0;
  do { x = rnd(60, W - 60); y = rnd(60, H - 60); n++; } while (n < (tries || 30) && (inWall(x, y, r, obs) || (avoidVault && Math.hypot(x - VAULT.x, y - VAULT.y) < VAULT.r + 40)));
  return [x, y];
}

function announce(A, text, sub) { A.an = [++A.anId, text, sub || '', A.t]; }
function fx(A, k, x, y, v) { if (A.fx.length < 60) A.fx.push([k, Math.round(x), Math.round(y), v == null ? 0 : Math.round(v)]); }

function placePlayer(room, p, near) {
  const A = room.arena, obs = A ? A.obs : [];
  let x = W / 2, y = H / 2;
  for (let i = 0; i < 12; i++) { const a = Math.random() * Math.PI * 2, d = rnd(40, 200); x = clamp((near ? near.x : W / 2) + Math.cos(a) * d, 30, W - 30); y = clamp((near ? near.y : H / 2) + Math.sin(a) * d, 30, H - 30); if (!inWall(x, y, PR, obs)) break; }
  if (room.mode === 'gems' && Math.hypot(x - VAULT.x, y - VAULT.y) < 30) x += 70;
  p.x = x; p.y = y;
  p.ang = 0; p.in = { mx: 0, my: 0, act: false, ab: false, at: 0 }; p.actPrev = false; p.abPrev = false; p.fireCd = 0; p.invuln = 0; p.down = false; p.stun = 0; p.dashT = 0; p.dx = 1; p.dy = 0; p.protect = 0; p.abCd = 0;
}
function initPlayer(room, p) {
  placePlayer(room, p);
  if (room.mode === 'zombie') Object.assign(p, { hp: 100, ammo: 10, kills: 0, respawnAt: 0, revives: 0, wpn: 0, wpnT: 0, cmb: 0, cmbT: 0, downAt: 0, reviveP: 0 });
  else if (room.mode === 'gems') Object.assign(p, { carry: 0, banked: 0, dc: 2, pu: -1, puT: 0 });
  else if (room.mode === 'elimination') Object.assign(p, { lives: 3, shield: 0, pu: -1, puT: 0, bonus: 0 });
}
function setup(room) {
  room.arena = { t: 0, id: 1, anId: 0, an: null, obs: OBST[room.mode] || [], zombies: [], bullets: [], gems: [], hazards: [], pk: [], bar: [], acid: [], drones: [],
    spawnAcc: 0, hazAcc: 0, sweepAcc: 0, gemAcc: 0, fx: [], step: 0, secMark: 0, snapN: 0, phase: -1, pkAcc: 0 };
  const A = room.arena;
  if (room.mode === 'zombie') {
    A.wave = { n: 0, st: 0, timer: 4.5, queue: [], total: 0, spawnT: 0, bossAlive: false };
    for (let i = 0; i < 5; i++) { const [x, y] = freeSpot(A.obs, 30, 40, false); if (Math.hypot(x - W / 2, y - H / 2) > 150) A.bar.push({ id: A.id++, x, y, hp: 3 }); }
    announce(A, 'GET READY', 'Wave 1 incoming');
  } else if (room.mode === 'gems') {
    const nd = 2 + Math.floor(room.players.size / 12);
    for (let i = 0; i < nd; i++) { const [x, y] = freeSpot(A.obs, 20, 40, true); A.drones.push({ id: A.id++, x, y, tx: x, ty: y, stun: 0, hunt: 0 }); }
    A.rushT = rnd(28, 40); A.rushWarn = 0;
    announce(A, 'HEIST START', 'Grab gems · bank them in the vault');
  } else announce(A, 'LAST STAND', 'Survive the storm');
  for (const p of room.players.values()) { initPlayer(room, p); p.score = 0; p.correctCount = 0; }
}
const alivePlayers = room => [...room.players.values()].filter(p => p.alive !== false && p.online !== false);

function movePlayers(room, dt, now) {
  const A = room.arena;
  for (const p of room.players.values()) {
    if (p.alive === false || p.down) continue;
    const inp = p.in; if (now - inp.at > 700) { inp.mx = 0; inp.my = 0; inp.act = false; inp.ab = false; }
    p.fireCd = Math.max(0, p.fireCd - dt); p.invuln = Math.max(0, p.invuln - dt); p.stun = Math.max(0, p.stun - dt); p.dashT = Math.max(0, p.dashT - dt); p.abCd = Math.max(0, (p.abCd || 0) - dt);
    if (p.puT > 0) { p.puT -= dt; if (p.puT <= 0) { p.pu = -1; p.puT = 0; } }
    if (p.wpnT > 0) { p.wpnT -= dt; if (p.wpnT <= 0) { p.wpn = 0; p.wpnT = 0; } }
    let mx = inp.mx, my = inp.my; const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.1) { p.dx = mx / Math.max(len, 1); p.dy = my / Math.max(len, 1); const hl = Math.hypot(p.dx, p.dy) || 1; p.dx /= hl; p.dy /= hl; p.ang = Math.atan2(p.dy, p.dx); }
    let speed = 215;
    if (room.mode === 'gems') { speed *= clamp(1 - (p.carry || 0) * 0.012, 0.7, 1); if (p.pu === 1) speed *= 1.4; }
    if (room.mode === 'elimination' && p.pu === 2) speed *= 1.35;
    if (p.stun > 0) speed = 0;
    // ability edge triggers
    const abEdge = inp.ab && !p.abPrev; p.abPrev = !!inp.ab;
    if (room.mode === 'zombie' && abEdge && p.abCd <= 0 && p.dashT <= 0 && p.stun <= 0) { p.dashT = 0.26; p.abCd = 2.6; p.invuln = Math.max(p.invuln, 0.34); fx(A, 12, p.x, p.y, 0); }
    if (room.mode === 'elimination' && (abEdge || (inp.act && !p.actPrev)) && p.abCd <= 0 && p.dashT <= 0) { p.dashT = 0.28; p.abCd = 3; p.invuln = Math.max(p.invuln, 0.36); fx(A, 12, p.x, p.y, 0); }
    if (room.mode === 'elimination') p.actPrev = !!inp.act;
    let vx, vy;
    if (p.dashT > 0) { const k = room.mode === 'zombie' ? 520 : 640; vx = p.dx * k; vy = p.dy * k; }
    else { vx = mx * speed; vy = my * speed; }
    let nx = clamp(p.x + vx * dt, PR, W - PR), ny = clamp(p.y + vy * dt, PR, H - PR);
    const o = pushOut(nx, ny, PR, A.obs); p.x = clamp(o[0], PR, W - PR); p.y = clamp(o[1], PR, H - PR);
  }
}

/* ---------------- Zombie Siege ---------------- */
// 0 walker, 1 runner, 2 brute, 3 spitter, 4 exploder, 5 boss
const ZT = [
  { hp: 2, sp: 52, r: 16, dmg: 12 }, { hp: 1, sp: 112, r: 14, dmg: 10 }, { hp: 9, sp: 42, r: 25, dmg: 22 },
  { hp: 2, sp: 60, r: 15, dmg: 8 }, { hp: 2, sp: 96, r: 16, dmg: 0 }, { hp: 70, sp: 56, r: 42, dmg: 30 }
];
const WPN = { 1: { cd: 0.08, t: 7 }, 2: { cd: 0.5, t: 9 } };
function waveQueue(n, P) {
  const cnt = Math.min(80, Math.round((9 + 4.6 * n) * (0.55 + 0.2 * P)));
  const q = [];
  for (let i = 0; i < cnt; i++) {
    const r = Math.random(); let t = 0;
    if (n >= 5 && r < 0.09) t = 4; else if (n >= 4 && r < 0.2) t = 3; else if (n >= 3 && r < 0.3) t = 2; else if (n >= 2 && r < 0.18 + Math.min(0.2, n * 0.02)) t = 1;
    q.push(t);
  }
  if (n % 4 === 0) q.unshift(5);
  return q;
}
function spawnPickup(A, x, y, kind, life) { if (A.pk.length < 14) A.pk.push({ id: A.id++, x, y, k: kind, life: life || 18 }); }
function dropLoot(A, x, y, boss) {
  if (boss) { for (let i = 0; i < 3; i++) spawnPickup(A, x + rnd(-50, 50), y + rnd(-40, 40), [0, 1, 3, 4, 2][Math.floor(Math.random() * 5)], 25); return; }
  if (Math.random() < 0.075) { const r = Math.random(); spawnPickup(A, x, y, r < 0.34 ? 0 : r < 0.54 ? 1 : r < 0.7 ? 2 : r < 0.86 ? 3 : r < 0.96 ? 4 : 5); }
}
function killZ(room, z, owner, now) {
  if (z.dead) return; z.dead = true; const A = room.arena; fx(A, 3, z.x, z.y, z.type);
  if (owner) {
    owner.kills = (owner.kills || 0) + (z.type === 5 ? 5 : 1); owner.score = owner.kills + 2 * (owner.revives || 0);
    owner.cmb = (owner.cmb || 0) + 1; owner.cmbT = 3; if (owner.cmb % 10 === 0) { owner.ammo = Math.min(60, owner.ammo + 4); fx(A, 2, owner.x, owner.y - 30, 0); room._events.push({ type: 'combo', text: '🔥 ' + owner.name + ' is on a ' + owner.cmb + '-kill combo!' }); }
    room.dirty = true;
  }
  if (z.type === 4) explode(room, z.x, z.y, 85, 22, 3, owner, now);
  if (z.type === 5) { announce(A, 'BOSS DOWN', (owner ? owner.name : 'The squad') + ' finished it'); room._events.push({ type: 'boss', text: '👑 The boss is dead!' }); }
  dropLoot(A, z.x, z.y, z.type === 5);
}
function hitZ(room, z, dmg, owner, now) { if (z.dead) return; z.hp -= dmg; z.flash = 0.12; if (z.hp <= 0) killZ(room, z, owner, now); }
function hitBar(room, b, dmg, owner, now) {
  if (b.dead) return; b.hp -= dmg; if (b.hp > 0) return; b.dead = true;
  explode(room, b.x, b.y, 100, 28, 6, owner, now);
}
function explode(room, x, y, r, dpl, dz, owner, now) {
  const A = room.arena; fx(A, 0, x, y, r);
  for (const z of A.zombies) if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 < (r + ZT[z.type].r) ** 2) hitZ(room, z, dz, owner, now);
  for (const b of A.bar) if (!b.dead && (b.x - x) ** 2 + (b.y - y) ** 2 < (r + 14) ** 2) hitBar(room, b, 99, owner, now);
  for (const p of room.players.values()) if (p.alive !== false && !p.down && (p.x - x) ** 2 + (p.y - y) ** 2 < (r + PR) ** 2) hurtP(room, p, dpl, now);
}
function hurtP(room, p, dmg, now) {
  if (p.down || p.invuln > 0 || p.alive === false) return;
  p.hp -= dmg; fx(room.arena, 2, p.x, p.y - 24, -dmg);
  if (p.hp <= 0) {
    p.hp = 0; p.down = true; p.downAt = now; p.reviveP = 0; p.in.act = false; p.cmb = 0; p.wpn = 0; room.dirty = true;
    const A = room.arena; const mates = alivePlayers(room).filter(q => q !== p && !q.down);
    p.respawnAt = now + (mates.length ? 9000 : 4000);
    room._events.push({ type: 'down', text: '🩸 ' + p.name + ' is down!' + (mates.length ? ' Teammates can revive them.' : '') });
    fx(A, 3, p.x, p.y, 9);
  }
}
function startWave(room, A, n) {
  const P = Math.max(1, alivePlayers(room).length), W_ = A.wave;
  W_.n = n; W_.st = 1; W_.queue = waveQueue(n, P); W_.total = W_.queue.length; W_.spawnT = 0;
  const boss = n % 4 === 0;
  announce(A, boss ? 'WAVE ' + n + ' — BOSS' : 'WAVE ' + n, boss ? 'A giant is coming. Focus fire!' : W_.total + ' zombies');
  if (boss) room._events.push({ type: 'boss', text: '👑 Boss wave ' + n + ' — focus fire!' });
}
function spawnEdge(A, type, boss) {
  const side = Math.floor(Math.random() * 4); let x, y; const m = boss ? 60 : 24;
  if (side === 0) { x = rnd(0, W); y = -m; } else if (side === 1) { x = rnd(0, W); y = H + m; } else if (side === 2) { x = -m; y = rnd(0, H); } else { x = W + m; y = rnd(0, H); }
  const T = ZT[type];
  A.zombies.push({ id: A.id++, x, y, type, hp: type === 5 ? T.hp + 28 * 0 : T.hp, mhp: T.hp, cd: 0, atk: rnd(2, 4), tel: 0, chg: 0, cx: 0, cy: 0, flash: 0, summon: 6 });
}
function nearestStanding(list, x, y) { let b = null, bd = Infinity; for (const p of list) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; b = p; } } return [b, Math.sqrt(bd)]; }

function stepZombie(room, dt, now) {
  const A = room.arena, W_ = A.wave, living = alivePlayers(room), standing = living.filter(p => !p.down);
  const P = Math.max(1, living.length);
  // wave director
  if (W_.st === 0) {
    W_.timer -= dt; if (W_.timer <= 0) startWave(room, A, W_.n + 1);
  } else {
    W_.spawnT -= dt;
    const interval = clamp(0.95 - W_.n * 0.04, 0.22, 0.95) / (0.6 + 0.16 * P);
    if (W_.queue.length && W_.spawnT <= 0 && A.zombies.length < 62) {
      W_.spawnT = interval; const t = W_.queue.shift();
      if (t === 5) { spawnEdge(A, 5, true); A.zombies[A.zombies.length - 1].hp = A.zombies[A.zombies.length - 1].mhp = 60 + 22 * P + W_.n * 4; }
      else spawnEdge(A, t);
    }
    if (!W_.queue.length && !A.zombies.some(z => !z.dead)) {
      W_.st = 0; W_.timer = 7;
      announce(A, 'WAVE ' + W_.n + ' CLEARED', 'Supplies dropped · downed allies revived');
      for (const p of living) { if (p.down) { p.down = false; p.hp = 50; p.invuln = 2; p.reviveP = 0; } else p.hp = Math.min(100, p.hp + 25); p.ammo = Math.min(60, p.ammo + 5); }
      for (let i = 0; i < 3; i++) { const [x, y] = freeSpot(A.obs, 20, 30, false); spawnPickup(A, x, y, [0, 1, 3, 2, 4][Math.floor(Math.random() * 5)], 22); }
      room._events.push({ type: 'wave', text: '🌊 Wave ' + W_.n + ' cleared!' });
      for (const p of living) { p.score = (p.kills || 0) + 2 * (p.revives || 0) + 3 * W_.n * 0; }
      room.dirty = true;
    }
  }
  // players: respawn / revive / fire / pickups
  for (const p of living) {
    p.cmbT = Math.max(0, (p.cmbT || 0) - dt); if (p.cmbT <= 0) p.cmb = 0;
    if (p.down) {
      const mate = standing.find(q => !q.down && Math.hypot(q.x - p.x, q.y - p.y) < 58);
      if (mate) { p.reviveP += dt / 2; if (p.reviveP >= 1) { p.down = false; p.hp = 55; p.invuln = 2.2; p.reviveP = 0; mate.revives = (mate.revives || 0) + 1; mate.score = (mate.kills || 0) + 2 * mate.revives; fx(A, 5, p.x, p.y, 0); room._events.push({ type: 'revive', text: '💚 ' + mate.name + ' revived ' + p.name + '!' }); room.dirty = true; } }
      else p.reviveP = Math.max(0, p.reviveP - dt * 0.5);
      if (p.down && now >= p.respawnAt) { placePlayer(room, p); p.hp = 60; p.invuln = 2.5; p.down = false; }
      continue;
    }
    for (let i = A.pk.length - 1; i >= 0; i--) {
      const k = A.pk[i]; if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 > (PR + 16) ** 2) continue;
      A.pk.splice(i, 1); fx(A, 4, k.x, k.y, k.k);
      if (k.k === 0) p.ammo = Math.min(60, p.ammo + 12); else if (k.k === 1) p.hp = Math.min(100, p.hp + 45);
      else if (k.k === 2) { p.wpn = 1; p.wpnT = WPN[1].t; } else if (k.k === 3) { p.wpn = 2; p.wpnT = WPN[2].t; }
      else if (k.k === 4) p.invuln = Math.max(p.invuln, 6);
      else if (k.k === 5) { announce(A, '☢ NUKE', p.name + ' cleared the field'); fx(A, 1, p.x, p.y, 0); for (const z of A.zombies) hitZ(room, z, z.type === 5 ? 20 : 99, p, now); }
    }
    if (p.in.act && p.ammo > 0 && p.fireCd <= 0 && p.dashT <= 0) {
      let best = null, bd = 560 * 560;
      for (const z of A.zombies) { if (z.dead) continue; const d = (z.x - p.x) ** 2 + (z.y - p.y) ** 2; if (d < bd) { bd = d; best = z; } }
      if (best) p.ang = Math.atan2(best.y - p.y, best.x - p.x);
      const w = WPN[p.wpn] || { cd: 0.17 }; p.ammo--; p.fireCd = w.cd;
      const pel = p.wpn === 2 ? 5 : 1;
      for (let i = 0; i < pel; i++) {
        const a = p.ang + (pel > 1 ? (i - 2) * 0.13 + rnd(-0.03, 0.03) : 0), sp = p.wpn === 2 ? 640 : 700;
        if (A.bullets.length < 160) A.bullets.push({ x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: p.wpn === 2 ? 0.42 : 0.7, o: p.id, k: 0 });
      }
    }
  }
  // zombies
  const spd = 1 + Math.min(0.45, (A.wave.n - 1) * 0.03);
  for (const z of A.zombies) {
    if (z.dead) continue; const T = ZT[z.type];
    z.cd = Math.max(0, z.cd - dt); z.flash = Math.max(0, z.flash - dt);
    const [tg, d] = nearestStanding(standing, z.x, z.y);
    if (!tg) continue;
    const dx = tg.x - z.x, dy = tg.y - z.y, dd = d || 1; let ux = dx / dd, uy = dy / dd, sp = T.sp * spd;
    if (z.type === 3) { // spitter: keep range, spit acid
      if (dd < 220) { ux = -ux; uy = -uy; sp *= 0.9; } else if (dd < 320) sp = 0;
      z.atk -= dt; if (z.atk <= 0 && dd < 480) { z.atk = rnd(2.2, 3.2); const a = Math.atan2(dy, dx); A.bullets.push({ x: z.x, y: z.y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, life: dd / 250, o: 0, k: 1, tx: tg.x, ty: tg.y }); }
    } else if (z.type === 5) {
      if (z.chg > 0) { z.chg -= dt; z.x += z.cx * 430 * dt; z.y += z.cy * 430 * dt; sp = 0; }
      else if (z.tel > 0) { z.tel -= dt; sp = 0; if (z.tel <= 0) { z.chg = 0.6; z.cx = ux; z.cy = uy; } }
      else { z.atk -= dt; if (z.atk <= 0 && dd > 120) { z.atk = rnd(4.5, 6); z.tel = 0.9; } }
      z.summon -= dt; if (z.summon <= 0) { z.summon = 8; for (let i = 0; i < 3; i++) if (A.zombies.length < 70) { A.zombies.push({ id: A.id++, x: z.x + rnd(-40, 40), y: z.y + rnd(-40, 40), type: 0, hp: 2, mhp: 2, cd: 0, atk: 0, tel: 0, chg: 0, cx: 0, cy: 0, flash: 0, summon: 0 }); } fx(A, 12, z.x, z.y, 1); }
    }
    z.x += ux * sp * dt; z.y += uy * sp * dt;
    // contact
    if (dd < PR + T.r - 4) {
      if (z.type === 4) { killZ(room, z, null, now); continue; }
      if (z.cd <= 0 && T.dmg) { hurtP(room, tg, T.dmg, now); z.cd = z.type === 5 ? 1 : 0.7; }
    }
    if (z.type === 5 && z.chg > 0) for (const p of standing) if (!p.down && (p.x - z.x) ** 2 + (p.y - z.y) ** 2 < (T.r + PR) ** 2 && z.cd <= 0) { hurtP(room, p, 35, now); z.cd = 0.5; }
  }
  // separation + walls
  const zs = A.zombies;
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i]; if (a.dead) continue;
    for (let j = i + 1; j < zs.length; j++) {
      const b = zs[j]; if (b.dead) continue; const mr = ZT[a.type].r + ZT[b.type].r - 6, dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > mr || Math.abs(dy) > mr) continue; const d2 = dx * dx + dy * dy; if (d2 >= mr * mr || d2 < 0.01) continue;
      const d = Math.sqrt(d2), push = (mr - d) * 0.5; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push;
    }
    if (a.x > 0 && a.x < W && a.y > 0 && a.y < H) { const o = pushOut(a.x, a.y, ZT[a.type].r * 0.8, A.obs); a.x = o[0]; a.y = o[1]; }
  }
  // bullets
  const kept = [];
  for (const b of A.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.k === 1) {
      if (b.life <= 0) { A.acid.push({ x: b.tx, y: b.ty, r: 44, life: 4.5, t: 0 }); continue; }
      let h = false; for (const p of standing) if (!p.down && (p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (PR + 6) ** 2) { hurtP(room, p, 12, now); A.acid.push({ x: b.x, y: b.y, r: 36, life: 3, t: 0 }); h = true; break; }
      if (!h) kept.push(b); continue;
    }
    if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) continue;
    if (A.obs.some(o => b.x > o[0] && b.x < o[0] + o[2] && b.y > o[1] && b.y < o[1] + o[3])) { fx(A, 13, b.x, b.y, 0); continue; }
    const owner = room.players.get(b.o); let hit = false;
    for (const z of A.zombies) { if (z.dead) continue; if ((z.x - b.x) ** 2 + (z.y - b.y) ** 2 < (ZT[z.type].r + 6) ** 2) { hitZ(room, z, 1, owner, now); if (z.type === 2 || z.type === 5) fx(A, 2, z.x, z.y - 20, 1); hit = true; break; } }
    if (!hit) for (const br of A.bar) { if (!br.dead && (br.x - b.x) ** 2 + (br.y - b.y) ** 2 < 20 * 20) { hitBar(room, br, 1, owner, now); hit = true; break; } }
    if (!hit) kept.push(b);
  }
  A.bullets = kept; A.zombies = A.zombies.filter(z => !z.dead); A.bar = A.bar.filter(b => !b.dead);
  // acid puddles
  for (const a of A.acid) { a.life -= dt; a.t += dt; if (a.t >= 0.5) { a.t = 0; for (const p of standing) if (!p.down && Math.hypot(p.x - a.x, p.y - a.y) < a.r + PR * 0.4) hurtP(room, p, 5, now); } }
  A.acid = A.acid.filter(a => a.life > 0);
  // pickups expire + barrels replenish
  for (const k of A.pk) k.life -= dt; A.pk = A.pk.filter(k => k.life > 0);
  A.pkAcc += dt; if (A.pkAcc > 14) { A.pkAcc = 0; if (A.bar.length < 5) { const [x, y] = freeSpot(A.obs, 30, 40, false); if (Math.hypot(x - W / 2, y - H / 2) > 120) A.bar.push({ id: A.id++, x, y, hp: 3 }); } }
}

/* ---------------- Gem Heist ---------------- */
function gemScatter(A, p, lose) {
  let n = 0; while (lose > 0 && n < 14) { const c = Math.min(lose, 3); A.gems.push({ id: A.id++, x: clamp(p.x + rnd(-70, 70), 40, W - 40), y: clamp(p.y + rnd(-70, 70), 40, H - 40), v: c }); lose -= c; n++; }
}
function stepGems(room, dt, now) {
  const A = room.arena, living = alivePlayers(room);
  const left = room.endsAt - now, mult = left < 45000 ? 2 : 1;
  if (mult === 2 && !A.final) { A.final = true; announce(A, 'FINAL PUSH', 'Banked gems count DOUBLE!'); room._events.push({ type: 'final', text: '🔥 Final 45 seconds — banking is DOUBLE!' }); }
  // gems
  const target = Math.min(44, 14 + 2 * living.length);
  A.gemAcc += dt;
  while (A.gemAcc >= 0.35) {
    A.gemAcc -= 0.35; if (A.gems.length >= target) continue;
    let x, y, tries = 0; do { [x, y] = freeSpot(A.obs, 14, 1, true); tries++; } while (tries < 8 && inWall(x, y, 14, A.obs));
    const r = Math.random(); A.gems.push({ id: A.id++, x, y, v: r < 0.06 ? 8 : r < 0.24 ? 3 : 1 });
  }
  // Gem Rush
  if (A.rushWarn > 0) { A.rushWarn -= dt; if (A.rushWarn <= 0) { for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2, d = 140 + (i % 3) * 55; const x = clamp(VAULT.x + Math.cos(a) * d, 40, W - 40), y = clamp(VAULT.y + Math.sin(a) * d * 0.8, 40, H - 40); if (!inWall(x, y, 12, A.obs)) A.gems.push({ id: A.id++, x, y, v: i % 6 === 0 ? 3 : 1 }); } fx(A, 14, VAULT.x, VAULT.y, 0); } }
  else { A.rushT -= dt; if (A.rushT <= 0) { A.rushT = rnd(38, 52); A.rushWarn = 3; announce(A, 'GEM RUSH', 'A shower of gems is about to drop at the vault!'); room._events.push({ type: 'rush', text: '💎 GEM RUSH incoming!' }); } }
  // power-ups
  A.pkAcc += dt; if (A.pkAcc > 8 && A.pk.length < 3) { A.pkAcc = 0; const [x, y] = freeSpot(A.obs, 20, 30, true); A.pk.push({ id: A.id++, x, y, k: Math.floor(Math.random() * 4), life: 22 }); }
  for (const k of A.pk) k.life -= dt; A.pk = A.pk.filter(k => k.life > 0);
  // drones
  for (const d of A.drones) {
    d.stun = Math.max(0, d.stun - dt); if (d.stun > 0) continue;
    let tgt = null, bd = 380 * 380;
    for (const p of living) { if (p.down || p.carry < 4 || p.protect > now || p.invuln > 0) continue; if (Math.hypot(p.x - VAULT.x, p.y - VAULT.y) < VAULT.r) continue; const q = (p.x - d.x) ** 2 + (p.y - d.y) ** 2; if (q < bd) { bd = q; tgt = p; } }
    d.hunt = tgt ? 1 : 0;
    let tx, ty, sp;
    if (tgt) { tx = tgt.x; ty = tgt.y; sp = 150; } else { if (Math.hypot(d.tx - d.x, d.ty - d.y) < 24 || Math.random() < 0.004) { const s = freeSpot(A.obs, 24, 20, true); d.tx = s[0]; d.ty = s[1]; } tx = d.tx; ty = d.ty; sp = 85; }
    const dx = tx - d.x, dy = ty - d.y, dd = Math.hypot(dx, dy) || 1; d.x += dx / dd * sp * dt; d.y += dy / dd * sp * dt;
    const o = pushOut(d.x, d.y, 18, A.obs); d.x = o[0]; d.y = o[1];
    for (const p of living) {
      if (p.down || p.protect > now || p.invuln > 0 || p.carry <= 0) continue;
      if (Math.hypot(p.x - d.x, p.y - d.y) < PR + 18 && Math.hypot(p.x - VAULT.x, p.y - VAULT.y) >= VAULT.r) {
        const lose = Math.max(1, Math.ceil(p.carry * 0.4)); p.carry -= lose; gemScatter(A, p, lose); p.stun = 0.45; p.protect = now + 2200; d.stun = 1.3; fx(A, 8, p.x, p.y, lose);
        room._events.push({ type: 'drone', text: '🤖 A drone zapped ' + p.name + ' for ' + lose + ' gems!' }); room.dirty = true;
      }
    }
  }
  for (const p of living) {
    if (p.down) continue;
    // dash (edge triggered): act or ability button
    const dashEdge = (p.in.act && !p.actPrev) || (p.in.ab && !p.abPrev2);
    p.abPrev2 = !!p.in.ab;
    if (dashEdge && p.dc > 0 && p.dashT <= 0 && p.stun <= 0) { p.dc--; p.dashT = 0.28; fx(A, 12, p.x, p.y, 0); }
    p.actPrev = !!p.in.act;
    // magnet
    if (p.pu === 0) for (const g of A.gems) { const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy); if (d < 230 && d > 1) { const s = (1 - d / 230) * 360 + 80; g.x += dx / d * s * dt; g.y += dy / d * s * dt; } }
    for (let i = A.gems.length - 1; i >= 0; i--) {
      const g = A.gems[i];
      if ((g.x - p.x) ** 2 + (g.y - p.y) ** 2 < (PR + 14) ** 2 && p.carry < 30) { p.carry = Math.min(30, p.carry + g.v); A.gems.splice(i, 1); fx(A, 4, g.x, g.y, 9); }
    }
    for (let i = A.pk.length - 1; i >= 0; i--) {
      const k = A.pk[i]; if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 > (PR + 18) ** 2) continue;
      A.pk.splice(i, 1); fx(A, 4, k.x, k.y, k.k);
      if (k.k === 3) { fx(A, 0, p.x, p.y, 150); for (const q of living) if (q !== p && !q.down && Math.hypot(q.x - p.x, q.y - p.y) < 160 && Math.hypot(q.x - VAULT.x, q.y - VAULT.y) >= VAULT.r) { const lose = Math.ceil(q.carry * 0.35); if (lose > 0) { q.carry -= lose; gemScatter(A, q, lose); } q.stun = 0.9; } room._events.push({ type: 'bomb', text: '💣 ' + p.name + ' set off a shock bomb!' }); }
      else { p.pu = k.k; p.puT = k.k === 0 ? 8 : k.k === 1 ? 7 : 9; if (k.k === 2) p.protect = now + 9000; }
    }
    const inVault = Math.hypot(p.x - VAULT.x, p.y - VAULT.y) < VAULT.r;
    if (inVault && p.carry > 0) {
      const add = p.carry * mult; p.banked += add; if (p.carry >= 10) room._events.push({ type: 'bank', text: '💎 ' + p.name + ' banked ' + add + ' gems!' });
      fx(A, 7, p.x, p.y, add); p.carry = 0; p.score = p.banked; room.dirty = true;
    }
    // tackle while dashing
    if (p.dashT > 0) {
      for (const q of living) {
        if (q === p || q.down || q.protect > now || q.carry <= 0) continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) < PR * 2 && Math.hypot(q.x - VAULT.x, q.y - VAULT.y) >= VAULT.r) {
          const steal = Math.max(1, Math.ceil(q.carry * 0.5)); q.carry -= steal; p.carry = Math.min(30, p.carry + steal);
          q.stun = 0.7; q.protect = now + 1500; fx(A, 8, q.x, q.y, steal); room._events.push({ type: 'steal', text: '💨 ' + p.name + ' tackled ' + q.name + ' for ' + steal + ' gems!' }); room.dirty = true;
        }
      }
    }
  }
}

/* ---------------- Last Stand ---------------- */
function hurt(room, p, now) {
  if (p.alive === false || p.invuln > 0) return;
  const A = room.arena;
  if (p.shield > 0) { p.shield--; p.invuln = 1; fx(A, 5, p.x, p.y, 1); return; }
  p.lives--; p.invuln = 1.6; room.dirty = true; fx(A, 2, p.x, p.y - 24, -1);
  if (p.lives <= 0) { p.lives = 0; p.alive = false; p.elimAt = now; p.in.mx = p.in.my = 0; fx(A, 3, p.x, p.y, 9); room._events.push({ type: 'ko', text: '💀 ' + p.name + ' was eliminated!' }); }
}
const PHASES = [['METEOR SHOWER', 'Watch the red circles'], ['LASER GRID', 'Beams sweep the arena'], ['SHOCKWAVES', 'Dash through the rings!'], ['HUNTER ORBS', 'They follow you — keep moving'], ['APOCALYPSE', 'Everything at once']];
function mk(A, k, a, b, r, w, extra) { A.hazards.push(Object.assign({ id: A.id++, k, a, b, r, w, w0: w, boom: 0, hit: null }, extra || {})); }
function stepDodge(room, dt, now) {
  const A = room.arena, prog = clamp(t(room) / room.durationMs, 0, 1), living = alivePlayers(room), alive = living.filter(p => p.alive !== false);
  const ph = Math.min(4, Math.floor(prog * 5));
  if (ph !== A.phase) { A.phase = ph; announce(A, PHASES[ph][0], PHASES[ph][1]); room._events.push({ type: 'phase', text: '⚠️ ' + PHASES[ph][0] }); }
  const aimAt = () => alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
  // meteors
  const interval = clamp(1.25 - prog * 0.8, 0.3, 1.25);
  A.hazAcc += dt;
  while (A.hazAcc >= interval) {
    A.hazAcc -= interval;
    const count = 1 + Math.floor(living.length / 8);
    for (let i = 0; i < count; i++) {
      let x = rnd(60, W - 60), y = rnd(60, H - 60);
      if (alive.length && Math.random() < 0.65) { const tg = aimAt(); x = clamp(tg.x + rnd(-45, 45), 40, W - 40); y = clamp(tg.y + rnd(-45, 45), 40, H - 40); }
      const w = 1.3 - prog * 0.4; mk(A, 0, x, y, 62 + prog * 20, w);
    }
  }
  // special attacks on a timer, unlocked by phase
  A.sweepAcc += dt; const si = clamp(6.5 - prog * 3.2, 2.6, 6.5);
  if (ph >= 1 && A.sweepAcc >= si) {
    A.sweepAcc = 0; const r = Math.random(), pick = ph >= 2 ? r : r * 0.6;
    if (pick < 0.35) { const v = Math.random() < 0.5; mk(A, 1, v ? 1 : 0, v ? rnd(60, W - 60) : rnd(60, H - 60), 46, 1.7); }
    else if (pick < 0.6) { const tg = aimAt(); const x = tg ? clamp(tg.x, 80, W - 80) : W / 2, y = tg ? clamp(tg.y, 80, H - 80) : H / 2; mk(A, 3, x, y, 44, 1.9); }
    else if (pick < 0.8 && ph >= 2) { mk(A, 2, rnd(250, W - 250), rnd(180, H - 180), 10, 0.01, { boom: 3.2, sp: 250 + prog * 80 }); }
    else if (ph >= 3) { const tg = aimAt(); const side = Math.floor(Math.random() * 4); const x = side === 0 ? 0 : side === 1 ? W : rnd(0, W), y = side === 2 ? 0 : side === 3 ? H : rnd(0, H); mk(A, 4, x, y, 16, 0.01, { boom: 8, life: 8, tg: tg ? tg.id : null, sp: 95 + prog * 50 }); }
    else { const v = Math.random() < 0.5; mk(A, 1, v ? 1 : 0, v ? rnd(60, W - 60) : rnd(60, H - 60), 46, 1.6); }
  }
  A.lavaAcc = (A.lavaAcc || 0) + dt;
  if (ph >= 3 && A.lavaAcc > 11 - prog * 4) { A.lavaAcc = 0; const tg = aimAt(); mk(A, 5, tg ? clamp(tg.x + rnd(-80, 80), 80, W - 80) : W / 2, tg ? clamp(tg.y + rnd(-80, 80), 80, H - 80) : H / 2, 85, 1.6, { boom: 7 }); }
  A.rowAcc = (A.rowAcc || 0) + dt;
  if (ph >= 1 && A.rowAcc > 12 - prog * 4) { // debris row: a wave of small meteors sweeping across
    A.rowAcc = 0; const v = Math.random() < 0.5, n = 9, base = v ? rnd(60, 120) : rnd(60, 100); const rev = Math.random() < 0.5;
    for (let i = 0; i < n; i++) { const f = (rev ? n - 1 - i : i) / (n - 1); const x = v ? 70 + f * (W - 140) : base + (i % 2) * 20, y = v ? base + (i % 2) * 20 + 40 : 60 + f * (H - 120); mk(A, 0, v ? x : W / 2 + (i % 2 ? 160 : -160), v ? y + 120 * (i % 3) : y, 44, 0.9 + i * 0.12); }
  }
  // power-up orbs
  A.pkAcc += dt; if (A.pkAcc > 8 && A.pk.length < 2) { A.pkAcc = 0; const r = Math.random(); A.pk.push({ id: A.id++, x: rnd(100, W - 100), y: rnd(100, H - 100), k: r < 0.4 ? 0 : r < 0.65 ? 1 : 2, life: 14 }); }
  for (const k of A.pk) k.life -= dt; A.pk = A.pk.filter(k => k.life > 0);
  for (const p of alive) {
    for (let i = A.pk.length - 1; i >= 0; i--) {
      const k = A.pk[i]; if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 > (PR + 18) ** 2) continue;
      A.pk.splice(i, 1); fx(A, 4, k.x, k.y, k.k); p.bonus = (p.bonus || 0) + 2;
      if (k.k === 0) p.shield = Math.min(2, (p.shield || 0) + 1); else if (k.k === 1) { if (p.lives < 3) p.lives++; else p.shield = Math.min(2, (p.shield || 0) + 1); } else { p.pu = 2; p.puT = 5; }
    }
  }
  // hazards
  for (const h of A.hazards) {
    if (h.k === 2) { // shockwave ring
      h.r += h.sp * dt; h.boom -= dt;
      for (const p of alive) { if (h.hit && h.hit[p.id]) continue; if (Math.abs(Math.hypot(p.x - h.a, p.y - h.b) - h.r) < 15 + PR * 0.5) { (h.hit = h.hit || {})[p.id] = 1; hurt(room, p, now); } }
      continue;
    }
    if (h.k === 4) { // hunter orb
      h.boom -= dt; let tg = alive.find(p => p.id === h.tg); if (!tg || tg.alive === false) { tg = alive[Math.floor(Math.random() * alive.length)]; h.tg = tg ? tg.id : null; }
      if (tg) { const dx = tg.x - h.a, dy = tg.y - h.b, d = Math.hypot(dx, dy) || 1; h.a += dx / d * h.sp * dt; h.b += dy / d * h.sp * dt; }
      for (const p of alive) if (Math.hypot(p.x - h.a, p.y - h.b) < 16 + PR * 0.6) { hurt(room, p, now); if (p.invuln > 0.5) { h.boom = 0; fx(A, 9, h.a, h.b, 40); break; } }
      continue;
    }
    if (h.k === 5) { // lava patch
      if (h.w > 0) { h.w -= dt; continue; }
      h.boom -= dt; for (const p of alive) if (Math.hypot(p.x - h.a, p.y - h.b) < h.r + PR * 0.3) hurt(room, p, now);
      continue;
    }
    if (h.w > 0) {
      h.w -= dt;
      if (h.w <= 0) {
        h.boom = 0.45; fx(A, 9, h.a, h.b, h.k === 0 ? h.r : 0);
        for (const p of alive) {
          let hit;
          if (h.k === 0) hit = Math.hypot(p.x - h.a, p.y - h.b) < h.r + PR * 0.6;
          else if (h.k === 1) hit = h.a === 1 ? Math.abs(p.x - h.b) < h.r / 2 + PR * 0.6 : Math.abs(p.y - h.b) < h.r / 2 + PR * 0.6;
          else hit = Math.abs(p.x - h.a) < h.r / 2 + PR * 0.6 || Math.abs(p.y - h.b) < h.r / 2 + PR * 0.6;
          if (hit) hurt(room, p, now);
        }
      }
    } else h.boom -= dt;
  }
  A.hazards = A.hazards.filter(h => (h.k === 2 ? h.boom > 0 && h.r < 1500 : h.k === 4 || h.k === 5 ? h.boom > 0 || h.w > 0 : (h.w > 0 || h.boom > 0)));
  const sec = Math.floor(t(room) / 1000);
  if (sec !== A.secMark) { A.secMark = sec; for (const p of room.players.values()) { if (p.alive !== false) p.score = sec + (p.correctCount || 0) * 3 + (p.bonus || 0); } room.dirty = true; }
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
    const add = Math.round((6 + (speed > 0.7 ? 2 : 0)) * boost); p.ammo = Math.min(60, (p.ammo || 0) + add);
    let msg = '🔫 +' + add + ' ammo';
    if (A && !p.down && p.streak > 0 && p.streak % 3 === 0 && p.hp < 100) { p.hp = Math.min(100, p.hp + 20); msg += ' · ❤️ +20'; }
    if (A && p.streak > 0 && p.streak % 5 === 0) {
      const now = Date.now(); let n = 0; for (const z of A.zombies) { if (!z.dead) { const before = z.hp; hitZ(room, z, z.type === 5 ? 12 : 8, p, now); if (z.dead || z.hp < before) n++; } }
      fx(A, 1, p.x, p.y, 0); A.zombies = A.zombies.filter(z => !z.dead); room.dirty = true;
      msg += ' · 💥 AIRSTRIKE (' + n + ' hit)'; if (n > 0) (room._pending = room._pending || []).push({ type: 'air', text: '💥 ' + p.name + ' called an airstrike — ' + n + ' zombies!' });
    }
    return msg;
  }
  if (room.mode === 'gems') {
    if (!correct) return '💨 No dash charge';
    const add = 2 + (speed > 0.7 ? 1 : 0); p.dc = Math.min(6, (p.dc || 0) + add * (boost > 1 ? 2 : 1)); let msg = '💨 +' + add + ' dash charges';
    if (p.streak > 0 && p.streak % 4 === 0) { p.pu = 1; p.puT = 6; msg += ' · ⚡ speed boost'; }
    return msg;
  }
  if (!correct) return '🛡️ No shield';
  p.shield = Math.min(2, (p.shield || 0) + 1); let msg = '🛡️ Shield +1';
  if (p.streak > 0 && p.streak % 3 === 0 && p.lives < 3) { p.lives++; msg += ' · ❤️ +1 life'; }
  return msg;
}

function snapshot(room) {
  const A = room.arena; if (!A) return null; const r = Math.round;
  const pl = []; const mode = room.mode;
  for (const p of room.players.values()) {
    const shielded = (mode === 'gems' && p.protect > Date.now()) || (mode === 'elimination' && p.shield > 0);
    const fl = (p.down ? 1 : 0) | (p.invuln > 0 ? 2 : 0) | ((p.dashT > 0) ? 4 : 0) | (p.alive === false ? 8 : 0) | (p.stun > 0 ? 16 : 0) | (shielded ? 32 : 0);
    let a, b, c, cd = 0, x1 = 0, x2 = 0;
    if (mode === 'zombie') { a = p.hp; b = p.ammo; c = p.kills; cd = r(clamp((p.abCd || 0) / 2.6, 0, 1) * 100); x1 = p.wpn || 0; x2 = p.cmb || 0; if (p.down) cd = r(clamp(p.reviveP || 0, 0, 1) * 100); }
    else if (mode === 'gems') { a = p.carry; b = p.dc; c = p.banked; x1 = p.pu + 1; x2 = r(p.puT || 0); }
    else { a = p.lives; b = p.shield; c = p.bonus || 0; cd = r(clamp((p.abCd || 0) / 3, 0, 1) * 100); x1 = p.pu + 1; x2 = r(p.puT || 0); }
    pl.push([p.n, r(p.x), r(p.y), r(p.ang * 100) / 100, a, b, fl, c, cd, x1, x2]);
  }
  const s = { t: r1(A.t), p: pl };
  if (A.snapN++ % 20 === 0) s.ob = A.obs;
  if (A.an && A.t - A.an[3] < 4.5) s.an = [A.an[0], A.an[1], A.an[2]];
  if (A.fx.length) { s.fx = A.fx; A.fx = []; }
  if (mode === 'zombie') {
    s.z = A.zombies.map(z => [z.id, r(z.x), r(z.y), z.type, z.hp, z.mhp, (z.tel > 0 ? 1 : 0) | (z.chg > 0 ? 2 : 0) | (z.flash > 0 ? 4 : 0)]);
    s.b = A.bullets.map(b => [r(b.x), r(b.y), b.k, r(b.vx), r(b.vy)]);
    s.pk = A.pk.map(k => [k.id, r(k.x), r(k.y), k.k, r1(k.life)]);
    s.br = A.bar.map(b => [b.id, r(b.x), r(b.y), b.hp]);
    s.ac = A.acid.map(a => [r(a.x), r(a.y), r(a.r), r1(a.life)]);
    s.w = [A.wave.n, A.wave.st, A.wave.st ? A.wave.queue.length + A.zombies.length : r(Math.max(0, A.wave.timer)), A.wave.total];
  } else if (mode === 'gems') {
    s.g = A.gems.map(g => [g.id, r(g.x), r(g.y), g.v]);
    s.pk = A.pk.map(k => [k.id, r(k.x), r(k.y), k.k, r1(k.life)]);
    s.d = A.drones.map(d => [d.id, r(d.x), r(d.y), d.stun > 0 ? 2 : d.hunt]);
    s.ev = [A.rushWarn > 0 ? r1(A.rushWarn) : 0, (room.endsAt - Date.now()) < 45000 ? 2 : 1];
  } else {
    s.h = A.hazards.map(h => {
      const base = [h.id, h.k, r(h.a), r(h.b), r(h.r)];
      if (h.k === 2) return base.concat([1, r(clamp(h.boom / 3.2, 0, 1) * 100) / 100]);
      if (h.k === 4) return base.concat([1, r(clamp(h.boom / 8, 0, 1) * 100) / 100]);
      if (h.k === 5) return base.concat([h.w > 0 ? 0 : 1, h.w > 0 ? r((1 - h.w / h.w0) * 100) / 100 : r(clamp(h.boom / 7, 0, 1) * 100) / 100]);
      return base.concat([h.w > 0 ? 0 : 1, h.w > 0 ? r((1 - h.w / h.w0) * 100) / 100 : r(clamp(h.boom / 0.45, 0, 1) * 100) / 100]);
    });
    s.pk = A.pk.map(k => [k.id, r(k.x), r(k.y), k.k, r1(k.life)]);
    s.ph = [A.phase, PHASES[Math.max(0, A.phase)][0]];
  }
  return s;
}
module.exports = { W, H, VAULT, isArena, ARENA_MODES, setup, step, snapshot, onAnswer, initPlayer, placePlayer };
