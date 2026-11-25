/* Indexling accessories: head bands, arm bands, glasses, scarves, capes ... collected from Skin Crates, one set per Indexling.
   They REPLACE the old colour skins: an Indexling always keeps its default look and is "decked out" with up to one accessory per slot.
   An accessory is a small SVG snippet on the 100x100 Indexling canvas (body = rounded square x21-79 / y25-82, hands at (17,66) and (83,66)).
   Ids are dash-free and <= 7 chars so a full outfit (5 slots joined with "-") fits the 40-char live-game id limit.
   The whole system keeps the old "skin" plumbing: an equipped "skin id" is now either one accessory id or an outfit "id-id-id" (slot order).
   window.LING_ACCS = { list, SLOTS, byId(id) -> accessory|outfit|null, parts(id), layers(skinObj) -> {back,front}, toggle(currentId, accId) -> newId, has(currentId, accId) } */
(function () {
  'use strict';
  var INK = '#172033';
  var SLOTS = [
    { id: 'head', name: 'Head', icon: '🎽' },
    { id: 'face', name: 'Face', icon: '🕶️' },
    { id: 'neck', name: 'Neck', icon: '🧣' },
    { id: 'arm', name: 'Arms', icon: '💪' },
    { id: 'back', name: 'Back', icon: '🦸' }
  ];
  function band(c, c2) { return '<path d="M21 41Q50 30 79 41L79 47Q50 36 21 47Z" fill="' + c + '" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/><path d="M26 39.5Q50 31.5 74 39.5" fill="none" stroke="' + (c2 || '#fff') + '" stroke-width="1.6" opacity=".6" stroke-linecap="round"/>'; }
  function tails(c) { return '<path d="M78 43l9 5-3 4 6 3-10 0z" fill="' + c + '" stroke="' + INK + '" stroke-width="1.4" stroke-linejoin="round"/>'; }
  function armBands(c, c2) {
    function one(x) { return '<rect x="' + (x - 7.5) + '" y="63.2" width="15" height="4.6" rx="2.2" fill="' + c + '" stroke="' + INK + '" stroke-width="1.3"/><rect x="' + (x - 7.5) + '" y="63.9" width="15" height="1.2" fill="' + (c2 || '#fff') + '" opacity=".55"/>'; }
    return one(17) + one(83);
  }
  function lens(x, fill) { return '<rect x="' + x + '" y="45" width="18" height="10.5" rx="4.5" fill="' + fill + '" stroke="' + INK + '" stroke-width="1.6"/>'; }
  var LIST = [
    /* ---- head ---- */
    { id: 'hdred', slot: 'head', name: 'Red Headband', icon: '🔴', rarity: 'Common', svg: band('#e5384f') + tails('#e5384f') },
    { id: 'hdblue', slot: 'head', name: 'Blue Headband', icon: '🔵', rarity: 'Common', svg: band('#3d7cf0') + tails('#3d7cf0') },
    { id: 'hdgreen', slot: 'head', name: 'Green Headband', icon: '🟢', rarity: 'Common', svg: band('#2fbf71') + tails('#2fbf71') },
    { id: 'hdbow', slot: 'head', name: 'Pink Bow', icon: '🎀', rarity: 'Common', svg: '<path d="M50 31l-13-8v14zM50 31l13-8v14z" fill="#ff7aa8" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/><circle cx="50" cy="31" r="3.6" fill="#ff4f8b" stroke="' + INK + '" stroke-width="1.4"/>' },
    { id: 'hdninja', slot: 'head', name: 'Ninja Band', icon: '🥷', rarity: 'Rare', svg: band('#232a3b', '#8a93ad') + '<path d="M44 36.5h12v6H44z" fill="#9aa3bd" stroke="' + INK + '" stroke-width="1.2" rx="1"/><path d="M78 43l10 6-4 3 7 3-12-1z" fill="#232a3b" stroke="' + INK + '" stroke-width="1.3" stroke-linejoin="round"/>' },
    { id: 'hdgold', slot: 'head', name: 'Gold Headband', icon: '🥇', rarity: 'Rare', svg: band('#f2c640', '#fff6bd') + '<circle cx="50" cy="38.6" r="3.4" fill="#ff5a6e" stroke="' + INK + '" stroke-width="1.2"/>' },
    { id: 'hdphone', slot: 'head', name: 'Headphones', icon: '🎧', rarity: 'Rare', svg: '<path d="M22 52Q20 24 50 23Q80 24 78 52" fill="none" stroke="#2a3148" stroke-width="4.2" stroke-linecap="round"/><rect x="15" y="46" width="9" height="15" rx="4.2" fill="#ff6b6b" stroke="' + INK + '" stroke-width="1.5"/><rect x="76" y="46" width="9" height="15" rx="4.2" fill="#ff6b6b" stroke="' + INK + '" stroke-width="1.5"/>' },
    { id: 'hdhalo', slot: 'head', name: 'Halo', icon: '😇', rarity: 'Epic', svg: '<ellipse cx="50" cy="17" rx="17" ry="5" fill="none" stroke="#ffe36b" stroke-width="4"/><ellipse cx="50" cy="17" rx="17" ry="5" fill="none" stroke="#fff7c4" stroke-width="1.4" opacity=".8"/>' },
    { id: 'hdflame', slot: 'head', name: 'Flame Band', icon: '🔥', rarity: 'Epic', svg: band('#ff6a1f', '#ffd34d') + '<path d="M26 40q-3-6 0-10 1 4 4 5-1-5 3-8 0 5 4 6-2-6 2-9 1 6 5 7z" fill="#ffb02e" stroke="#e5421f" stroke-width="1" stroke-linejoin="round"/>' },
    /* ---- face ---- */
    { id: 'fcshade', slot: 'face', name: 'Sunglasses', icon: '🕶️', rarity: 'Common', svg: lens(28, '#1b2033') + lens(54, '#1b2033') + '<path d="M46 50h8" stroke="' + INK + '" stroke-width="2"/><path d="M31 47.5l6 0M57 47.5l6 0" stroke="#fff" stroke-width="1.6" opacity=".55" stroke-linecap="round"/>' },
    { id: 'fcround', slot: 'face', name: 'Round Glasses', icon: '👓', rarity: 'Common', svg: '<circle cx="37" cy="50.5" r="8.4" fill="#cfe8ff" fill-opacity=".35" stroke="#7a4b1e" stroke-width="2.2"/><circle cx="63" cy="50.5" r="8.4" fill="#cfe8ff" fill-opacity=".35" stroke="#7a4b1e" stroke-width="2.2"/><path d="M45.4 50h9.2" stroke="#7a4b1e" stroke-width="2.2"/>' },
    { id: 'fcstach', slot: 'face', name: 'Moustache', icon: '👨', rarity: 'Common', svg: '<path d="M50 59q-5-5-12-2-4 2-6 6 6 0 11-2 4-1 7 0 3-1 7 0 5 2 11 2-2-4-6-6-7-3-12 2z" fill="#4a2b14" stroke="' + INK + '" stroke-width="1.2" stroke-linejoin="round"/>' },
    { id: 'fcpatch', slot: 'face', name: 'Pirate Patch', icon: '🏴‍☠️', rarity: 'Rare', svg: '<path d="M22 38L64 56" stroke="#241a14" stroke-width="2.2"/><ellipse cx="63" cy="50.5" rx="9" ry="8" fill="#241a14" stroke="' + INK + '" stroke-width="1.4"/><circle cx="60.5" cy="48" r="1.6" fill="#fff" opacity=".4"/>' },
    { id: 'fcmask', slot: 'face', name: 'Hero Mask', icon: '🦸', rarity: 'Rare', svg: '<path fill-rule="evenodd" d="M23 45Q50 38 77 45L77 57Q64 53 50 57Q36 53 23 57ZM30 50.5a7 6 0 1 0 14 0a7 6 0 1 0-14 0ZM56 50.5a7 6 0 1 0 14 0a7 6 0 1 0-14 0Z" fill="#3b4cca" stroke="' + INK + '" stroke-width="1.5" stroke-linejoin="round"/>' },
    { id: 'fcvisor', slot: 'face', name: 'Neon Visor', icon: '🥽', rarity: 'Epic', svg: '<rect x="24" y="44.5" width="52" height="12" rx="6" fill="#52f2ff" fill-opacity=".5" stroke="#1b2033" stroke-width="1.8"/><path d="M29 48h20" stroke="#fff" stroke-width="2" opacity=".8" stroke-linecap="round"/><rect x="24" y="44.5" width="52" height="12" rx="6" fill="none" stroke="#9ffcff" stroke-width=".8" opacity=".9"/>' },
    /* ---- neck ---- */
    { id: 'nkscarf', slot: 'neck', name: 'Red Scarf', icon: '🧣', rarity: 'Common', svg: '<path d="M22 72Q50 84 78 72L78 79Q50 91 22 79Z" fill="#e5384f" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/><path d="M64 80l3 12 8-2-3-11z" fill="#e5384f" stroke="' + INK + '" stroke-width="1.5" stroke-linejoin="round"/><path d="M30 76q20 7 40 0" stroke="#fff" stroke-width="1.3" opacity=".4" fill="none"/>' },
    { id: 'nkbow', slot: 'neck', name: 'Bow Tie', icon: '🎩', rarity: 'Common', svg: '<path d="M50 77l-11-6v12zM50 77l11-6v12z" fill="#8b5cf6" stroke="' + INK + '" stroke-width="1.5" stroke-linejoin="round"/><rect x="47" y="73.5" width="6" height="7" rx="2" fill="#6d3fe0" stroke="' + INK + '" stroke-width="1.2"/>' },
    { id: 'nkbell', slot: 'neck', name: 'Bell Collar', icon: '🔔', rarity: 'Common', svg: '<path d="M25 72Q50 80 75 72" fill="none" stroke="#e5384f" stroke-width="3.4" stroke-linecap="round"/><circle cx="50" cy="79.6" r="3.8" fill="#ffd34d" stroke="' + INK + '" stroke-width="1.3"/><path d="M48.2 79.6h3.6" stroke="' + INK + '" stroke-width="1"/>' },
    { id: 'nkchain', slot: 'neck', name: 'Gold Chain', icon: '⛓️', rarity: 'Rare', svg: '<path d="M26 70Q50 90 74 70" fill="none" stroke="#f2c640" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 1.6"/><path d="M50 80.5l4 4-4 4-4-4z" fill="#ffd34d" stroke="' + INK + '" stroke-width="1.3" stroke-linejoin="round"/>' },
    { id: 'nkmedal', slot: 'neck', name: 'Champion Medal', icon: '🏅', rarity: 'Rare', svg: '<path d="M38 68l12 12 12-12" fill="none" stroke="#3d7cf0" stroke-width="3.6" stroke-linejoin="round"/><circle cx="50" cy="83" r="6" fill="#ffd34d" stroke="' + INK + '" stroke-width="1.5"/><path d="M50 79.6l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="#fff6bd" stroke="none"/>' },
    /* ---- arms ---- */
    { id: 'amred', slot: 'arm', name: 'Red Arm Bands', icon: '🔴', rarity: 'Common', svg: armBands('#e5384f') },
    { id: 'amblue', slot: 'arm', name: 'Blue Arm Bands', icon: '🔵', rarity: 'Common', svg: armBands('#3d7cf0') },
    { id: 'amgreen', slot: 'arm', name: 'Green Arm Bands', icon: '🟢', rarity: 'Common', svg: armBands('#2fbf71') },
    { id: 'amgold', slot: 'arm', name: 'Gold Arm Bands', icon: '🥇', rarity: 'Rare', svg: armBands('#f2c640', '#fff6bd') },
    { id: 'amwatch', slot: 'arm', name: 'Smart Watch', icon: '⌚', rarity: 'Rare', svg: '<rect x="9.5" y="62.6" width="15" height="6" rx="2.6" fill="#2a3148" stroke="' + INK + '" stroke-width="1.3"/><rect x="12.5" y="63.4" width="9" height="4.4" rx="1.6" fill="#52f2ff" opacity=".9"/><rect x="75.5" y="63.2" width="15" height="4.6" rx="2.2" fill="#2a3148" stroke="' + INK + '" stroke-width="1.3"/>' },
    { id: 'amspike', slot: 'arm', name: 'Spiked Bracers', icon: '🛡️', rarity: 'Rare', svg: armBands('#6b7488', '#d5dbea') + '<path d="M11 63l2-4 2 4M16 63l2-4 2 4M21 63l2-4 2 4M77 63l2-4 2 4M82 63l2-4 2 4M87 63l2-4 2 4" fill="#d5dbea" stroke="' + INK + '" stroke-width="1" stroke-linejoin="round"/>' },
    { id: 'amneon', slot: 'arm', name: 'Neon Wristbands', icon: '✨', rarity: 'Epic', svg: armBands('#8a5cff', '#52f2ff') + '<rect x="9.5" y="63.2" width="15" height="4.6" rx="2.2" fill="none" stroke="#52f2ff" stroke-width="1" opacity=".9"/><rect x="75.5" y="63.2" width="15" height="4.6" rx="2.2" fill="none" stroke="#52f2ff" stroke-width="1" opacity=".9"/>' },
    /* ---- back (drawn behind the body) ---- */
    { id: 'bkcape', slot: 'back', name: 'Hero Cape', icon: '🦸', rarity: 'Rare', layer: 'back', svg: '<path d="M27 30L8 88Q50 98 92 88L73 30Z" fill="#e5384f" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/><path d="M27 34L14 84M73 34L86 84" stroke="#ff8a9a" stroke-width="1.6" opacity=".6"/>' },
    { id: 'bkpack', slot: 'back', name: 'Study Backpack', icon: '🎒', rarity: 'Common', layer: 'back', svg: '<rect x="11" y="36" width="12" height="38" rx="5" fill="#3d7cf0" stroke="' + INK + '" stroke-width="1.8"/><rect x="77" y="36" width="12" height="38" rx="5" fill="#3d7cf0" stroke="' + INK + '" stroke-width="1.8"/><path d="M14 50h6M80 50h6" stroke="#bcd3ff" stroke-width="1.6" stroke-linecap="round"/>' },
    { id: 'bkwings', slot: 'back', name: 'Angel Wings', icon: '🪽', rarity: 'Epic', layer: 'back', svg: '<path d="M25 46Q4 30 5 54Q6 70 24 66Q12 70 20 78Q26 80 28 72Z" fill="#e4efff" stroke="' + INK + '" stroke-width="1.8" stroke-linejoin="round"/><path d="M75 46Q96 30 95 54Q94 70 76 66Q88 70 80 78Q74 80 72 72Z" fill="#e4efff" stroke="' + INK + '" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 48Q10 58 18 62M88 48Q90 58 82 62" stroke="#cfe8ff" stroke-width="1.4" fill="none" opacity=".9"/>' },
    { id: 'bkjet', slot: 'back', name: 'Jetpack', icon: '🚀', rarity: 'Epic', layer: 'back', svg: '<rect x="10" y="34" width="11" height="34" rx="5" fill="#9aa3bd" stroke="' + INK + '" stroke-width="1.8"/><rect x="79" y="34" width="11" height="34" rx="5" fill="#9aa3bd" stroke="' + INK + '" stroke-width="1.8"/><path d="M12 70l3.5 12 3.5-12zM81 70l3.5 12 3.5-12z" fill="#ff8a2e" stroke="#ffd34d" stroke-width="1.2" stroke-linejoin="round"/>' }
  ];
  var MAP = {}; LIST.forEach(function (a) { MAP[a.id] = a; });
  var ORDER = {}; SLOTS.forEach(function (s, i) { ORDER[s.id] = i; });
  var RANKS = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };
  var cache = {};

  function parts(id) {
    var out = [], seen = {};
    String(id || '').split('-').forEach(function (p) { var a = MAP[p]; if (a && !seen[a.slot]) { seen[a.slot] = 1; out.push(a); } });
    return out;
  }
  function validId(id) { id = String(id || ''); if (!id) return false; var ps = id.split('-'); return ps.every(function (p) { return !!MAP[p]; }); }
  function join(list) { return list.slice().sort(function (a, b) { return ORDER[a.slot] - ORDER[b.slot]; }).map(function (a) { return a.id; }).join('-'); }
  function byId(id) {
    id = String(id || ''); if (!id) return null; if (MAP[id]) return MAP[id]; if (cache[id]) return cache[id];
    if (!validId(id)) return null;
    var ps = parts(id); if (!ps.length) return null;
    var top = ps.reduce(function (m, a) { return RANKS[a.rarity] > RANKS[m] ? a.rarity : m; }, 'Common');
    return (cache[id] = { id: join(ps), name: ps.map(function (a) { return a.name; }).join(' + '), icon: ps[0].icon, rarity: top, outfit: true, parts: ps });
  }
  function has(currentId, accId) { return parts(currentId).some(function (a) { return a.id === accId; }); }
  /* toggle one accessory: same slot is replaced, equipping the one already worn takes it off */
  function toggle(currentId, accId) {
    var a = MAP[accId]; if (!a) return String(currentId || '');
    var ps = parts(currentId), had = ps.some(function (x) { return x.id === a.id; });
    ps = ps.filter(function (x) { return x.slot !== a.slot; });
    if (!had) ps.push(a);
    return join(ps);
  }
  function layers(sk) {
    var o = { back: '', front: '' }; if (!sk) return o;
    var ps = sk.parts || (MAP[sk.id] ? [MAP[sk.id]] : []);
    ps.slice().sort(function (a, b) { return ORDER[a.slot] - ORDER[b.slot]; }).forEach(function (a) {
      if (a.layer === 'back') o.back += '<g class="ling-acc ling-acc-' + a.id + '" pointer-events="none">' + a.svg + '</g>';
      else o.front += '<g class="ling-acc ling-acc-' + a.id + '" pointer-events="none">' + a.svg + '</g>';
    });
    return o;
  }
  window.LING_ACCS = { list: LIST, SLOTS: SLOTS, byId: byId, parts: parts, layers: layers, toggle: toggle, has: has, validId: validId, join: join, MAX_ID: 40 };
})();
