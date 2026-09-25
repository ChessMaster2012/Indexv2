/* Indexling Pack Refresh — 2026-09-24
   Adds genuinely different collectible designs, a Candy Pack, pack-aware inventory,
   and hides district personalization while signed out. Existing account/economy APIs remain intact.
*/
(function(){
  'use strict';

  const PACK_LINGS = {
    study: [
      ['ling-study-pencil','Pencily','✏️','pencil','#ffd166','#9a6d00','Common'],
      ['ling-study-notebook','Notey','📓','notebook','#8ecae6','#24607a','Common'],
      ['ling-study-bookmark','Bookmarko','🔖','bookmark','#ff9f8f','#9b4037','Common'],
      ['ling-study-ruler','Rulero','📏','ruler','#b8e986','#50752e','Rare'],
      ['ling-study-hourglass','Hourglint','⌛','hourglass','#cdb4ff','#694aa5','Rare'],
      ['ling-study-eraser','Eraso','🧽','eraser','#ffb4d8','#9a456f','Epic'],
      ['ling-study-atlas','Atlas','🗺️','atlas','#90dbf4','#276b7d','Epic'],
      ['ling-study-compass','Compassy','🧭','compass','#ffe08a','#8a651c','Legendary']
    ],
    focus: [
      ['ling-focus-mug','Mugsy','☕','mug','#c7a17a','#6b4730','Common'],
      ['ling-focus-lamp','Lumio','💡','lamp','#ffe27a','#9a7618','Common'],
      ['ling-focus-headphones','Sonora','🎧','headphones','#a8dadc','#31686b','Common'],
      ['ling-focus-cloud','Cloudie','☁️','cloud','#dbeafe','#58708f','Rare'],
      ['ling-focus-candle','Calmi','🕯️','candle','#ffd6a5','#925c25','Rare'],
      ['ling-focus-tea','Tealie','🫖','tea','#caffbf','#47733d','Epic'],
      ['ling-focus-moon','Moonlet','🌙','moon','#bde0fe','#435a86','Epic'],
      ['ling-focus-snowglobe','Snowglow','🔮','globe','#d9c2ff','#67448e','Legendary']
    ],
    mastery: [
      ['ling-mastery-trophy','Trophy','🏆','trophy','#ffd166','#8f6814','Common'],
      ['ling-mastery-medal','Medalie','🏅','medal','#f4a261','#8c4c1d','Common'],
      ['ling-mastery-puzzle','Puzzlo','🧩','puzzle','#90be6d','#45652f','Common'],
      ['ling-mastery-dice','Dexo','🎲','dice','#f28482','#8a3c3c','Rare'],
      ['ling-mastery-calculator','Calcubot','🧮','calculator','#bde0fe','#4d6680','Rare'],
      ['ling-mastery-target','Bullseye','🎯','target','#ffafcc','#913f62','Epic'],
      ['ling-mastery-crown','Cramown','👑','crown','#ffe066','#8a6515','Epic'],
      ['ling-mastery-medalstar','Masterstar','🌟','star','#ffd166','#8a6515','Legendary']
    ],
    scholar: [
      ['ling-scholar-glasses','Specs','👓','glasses','#c4b5fd','#58418f','Common'],
      ['ling-scholar-scroll','Scrollo','📜','scroll','#f3d5a5','#86613b','Common'],
      ['ling-scholar-quill','Featherby','🪶','feather','#d8b4fe','#70469a','Common'],
      ['ling-scholar-ink','Inky','🫙','ink','#94a3b8','#475569','Rare'],
      ['ling-scholar-library','Libby','🏛️','library','#fca5a5','#873b3b','Rare'],
      ['ling-scholar-globe','Globulus','🌐','globe','#93c5fd','#315d91','Epic'],
      ['ling-scholar-bookstack','Stacko','📚','books','#fde68a','#8a6419','Epic'],
      ['ling-scholar-lantern','Archivist','🏮','lantern','#fbbf24','#854d0e','Legendary']
    ],
    tech: [
      ['ling-tech-chip','Chipbit','💾','chip','#94a3b8','#475569','Common'],
      ['ling-tech-keyboard','Keybo','⌨️','keyboard','#cbd5e1','#475569','Common'],
      ['ling-tech-mouse','Mousio','🖱️','mouse','#bfdbfe','#41618c','Common'],
      ['ling-tech-robot','Robit','🤖','robot','#a7f3d0','#34745b','Rare'],
      ['ling-tech-code','Codex','</>','code','#86efac','#267043','Rare'],
      ['ling-tech-server','Serverly','🖥️','server','#c4b5fd','#5b4a93','Epic'],
      ['ling-tech-satellite','Satelli','🛰️','satellite','#bae6fd','#32637f','Epic'],
      ['ling-tech-core','Corebyte','⚡','core','#fef08a','#876b10','Legendary']
    ],
    legend: [
      ['ling-legend-star','Stellio','⭐','star','#fde68a','#8a6515','Common'],
      ['ling-legend-comet','Comet','☄️','comet','#f9a8d4','#913f63','Common'],
      ['ling-legend-crystal','Crystal','💎','crystal','#a5f3fc','#27717a','Common'],
      ['ling-legend-orb','Orbi','🔵','orb','#93c5fd','#315d91','Rare'],
      ['ling-legend-phoenix','Phoenix','🔥','phoenix','#fdba74','#934b19','Rare'],
      ['ling-legend-dragon','Draco','🐉','dragon','#86efac','#32704b','Epic'],
      ['ling-legend-unicorn','Uni','🦄','unicorn','#ddd6fe','#6951a1','Epic'],
      ['ling-legend-cosmic','Cosmica','🌌','cosmic','#c4b5fd','#57418d','Legendary']
    ],
    candy: [
      ['ling-candy-cane','Candy Cane','🍭','candy-cane','#ffffff','#d94b63','Common'],
      ['ling-candy-choco','Choco Chunk','🍫','chocolate','#8b5a3c','#4b2f20','Common'],
      ['ling-candy-wrapper','Wrapper','🍬','wrapper','#ff9fba','#a53f62','Common'],
      ['ling-candy-gummy','Gummy','🧸','gummy','#86efac','#32704b','Rare'],
      ['ling-candy-cupcake','Cupcake','🧁','cupcake','#fbcfe8','#93456e','Rare'],
      ['ling-candy-donut','Donut','🍩','donut','#f9c2d8','#8f4c65','Epic'],
      ['ling-candy-cookie','Cookie','🍪','cookie','#d6a66a','#7b4e24','Epic'],
      ['ling-candy-cake','Cakepop','🎂','cake','#fde68a','#946b15','Legendary']
    ]
  };

  const styleMap = {
    'candy-cane':'candy-cane','chocolate':'chocolate','wrapper':'wrapper','gummy':'gummy',
    'cupcake':'cupcake','donut':'donut','cookie':'cookie','cake':'cake',
    pencil:'pencil',notebook:'notebook',bookmark:'bookmark',ruler:'ruler',hourglass:'hourglass',
    eraser:'eraser',atlas:'atlas',compass:'compass',mug:'mug',lamp:'lamp',headphones:'headphones',
    cloud:'cloud',candle:'candle',tea:'tea',moon:'moon',globe:'globe',trophy:'trophy',medal:'medal',
    puzzle:'puzzle',dice:'dice',calculator:'calculator',target:'target',crown:'crown',star:'star',
    glasses:'glasses',scroll:'scroll',feather:'feather',ink:'ink',library:'library',books:'books',
    lantern:'lantern',chip:'chip',keyboard:'keyboard',mouse:'mouse',robot:'robot',code:'code',
    server:'server',satellite:'satellite',core:'core',comet:'comet',crystal:'crystal',orb:'orb',
    phoenix:'phoenix',dragon:'dragon',unicorn:'unicorn',cosmic:'cosmic'
  };

  const all = [];
  Object.entries(PACK_LINGS).forEach(([pack, list])=>{
    list.forEach(([id,name,icon,shape,main,dark,accent,rarity])=>{
      all.push({id,type:'indexling',name,icon,shape,style:styleMap[shape]||shape,mark:icon,main,dark,accent,rarity,pack});
    });
  });

  // REWARD_COSMETICS is intentionally the existing catalog used by the app.
  if(Array.isArray(window.REWARD_COSMETICS)) {
    const existingIds = new Set(window.REWARD_COSMETICS.map(x=>x.id));
    all.forEach(x=>{ if(!existingIds.has(x.id)) window.REWARD_COSMETICS.push(x); });
  }

  // PACK_DEFS and PACK_ORDER are the existing economy tables. Mutate, don't replace,
  // so the existing pack-opening/economy code continues to work.
  if(window.PACK_DEFS){
    Object.entries(PACK_LINGS).forEach(([pack,list])=>{
      window.PACK_DEFS[pack] = window.PACK_DEFS[pack] || {
        name: pack==='candy' ? 'Candy Carton' : pack[0].toUpperCase()+pack.slice(1)+' Collection',
        cost: pack==='candy' ? 20 : 25,
        icon: pack==='candy' ? '🍬' : '✦',
        accent: list[0][4],
        weights: window.SHARED_PACK_ODDS || {Common:66.9,Rare:24,Epic:9,Legendary:0.1},
        contents:[]
      };
      window.PACK_DEFS[pack].contents = list.map(x=>x[0]);
    });
  }
  if(Array.isArray(window.PACK_ORDER)){
    const desired=['study','focus','candy','mastery','scholar','tech','legend'];
    desired.forEach(k=>{ if(!window.PACK_ORDER.includes(k)) window.PACK_ORDER.splice(0,0,k); });
    window.PACK_ORDER.splice(0,window.PACK_ORDER.length,...desired);
  }

  const css = document.createElement('style');
  css.textContent = `
    .indexling-art.custom-ling{width:92px;height:92px;filter:drop-shadow(0 9px 9px rgba(20,25,40,.16));}
    .custom-ling .custom-ling-body{width:64px;height:64px;border-radius:20px;background:var(--ling-main);border:4px solid var(--ling-dark);display:grid;place-items:center;position:relative;box-shadow:inset 0 -9px 0 rgba(0,0,0,.09),inset 0 4px 0 rgba(255,255,255,.35);overflow:hidden;}
    .custom-ling .custom-ling-icon{font-size:34px;line-height:1;position:relative;z-index:2;text-shadow:0 2px 1px rgba(0,0,0,.12);}
    .custom-ling .custom-ling-eyes{position:absolute;left:50%;bottom:11px;transform:translateX(-50%);width:30px;height:8px;display:flex;justify-content:space-between;z-index:3;}
    .custom-ling .custom-ling-eyes i{width:6px;height:6px;border-radius:50%;background:#172033;display:block;}
    .custom-ling .custom-ling-mark{position:absolute;right:0;top:1px;min-width:25px;height:25px;border-radius:9px;background:var(--ling-accent);border:3px solid #fffdf8;display:grid;place-items:center;font-size:11px;font-weight:900;color:#172033;z-index:5;padding:0 3px;}
    .custom-ling.style-candy-cane .custom-ling-body{border-radius:28px 28px 18px 18px;transform:rotate(-3deg);}
    .custom-ling.style-chocolate .custom-ling-body{border-radius:10px;}
    .custom-ling.style-wrapper .custom-ling-body{border-radius:30px 10px 30px 10px;transform:rotate(4deg);}
    .custom-ling.style-gummy .custom-ling-body{border-radius:30px;filter:saturate(1.2);}
    .custom-ling.style-cupcake .custom-ling-body{border-radius:30px 30px 15px 15px;}
    .custom-ling.style-donut .custom-ling-body{border-radius:50%;}
    .custom-ling.style-cookie .custom-ling-body{border-radius:45%;}
    .custom-ling.style-cake .custom-ling-body{border-radius:14px 14px 24px 24px;}
    .custom-ling.style-pencil .custom-ling-body,.custom-ling.style-ruler .custom-ling-body{border-radius:10px;transform:rotate(-5deg);}
    .custom-ling.style-notebook .custom-ling-body,.custom-ling.style-books .custom-ling-body{border-radius:8px 16px 16px 8px;}
    .custom-ling.style-mug .custom-ling-body{border-radius:16px 16px 23px 23px;}
    .custom-ling.style-lamp .custom-ling-body{border-radius:24px 24px 12px 12px;}
    .custom-ling.style-cloud .custom-ling-body{border-radius:34px;}
    .custom-ling.style-moon .custom-ling-body{border-radius:50%;clip-path:polygon(0 0,100% 0,100% 100%,0 100%);}
    .custom-ling.style-trophy .custom-ling-body,.custom-ling.style-medal .custom-ling-body{border-radius:50%;}
    .custom-ling.style-puzzle .custom-ling-body{border-radius:14px 28px 14px 28px;}
    .custom-ling.style-target .custom-ling-body{border-radius:50%;border-width:5px;}
    .custom-ling.style-crown .custom-ling-body{border-radius:9px 9px 25px 25px;}
    .custom-ling.style-glasses .custom-ling-body{border-radius:50% 50% 18px 18px;}
    .custom-ling.style-scroll .custom-ling-body{border-radius:16px 8px 16px 8px;}
    .custom-ling.style-library .custom-ling-body{border-radius:8px;}
    .custom-ling.style-chip .custom-ling-body,.custom-ling.style-server .custom-ling-body{border-radius:9px;}
    .custom-ling.style-robot .custom-ling-body,.custom-ling.style-code .custom-ling-body{border-radius:12px;}
    .custom-ling.style-satellite .custom-ling-body{border-radius:50% 14px 50% 14px;}
    .custom-ling.style-crystal .custom-ling-body{border-radius:12px 28px 12px 28px;transform:rotate(7deg);}
    .custom-ling.style-phoenix .custom-ling-body,.custom-ling.style-dragon .custom-ling-body,.custom-ling.style-unicorn .custom-ling-body{border-radius:26px 26px 16px 16px;}
    .custom-ling.style-cosmic .custom-ling-body{border-radius:50%;box-shadow:inset 0 -10px 0 rgba(0,0,0,.13),0 0 0 5px rgba(196,181,253,.25);}
    .pack-section-heading{display:flex;align-items:center;gap:9px;margin:22px 0 10px;font-family:var(--font-display);font-size:16px;}
    .pack-section-heading .pack-dot{width:11px;height:11px;border-radius:4px;background:var(--pack-accent);}
    .inventory-pack-group{margin-bottom:20px;}
    .inventory-pack-group .panel{border-color:rgba(36,31,61,.09);}
  `;
  document.head.appendChild(css);

  window.indexlingArtHtml = function(c, mini){
    const main=esc(c?.main||'#9bb6d8'), dark=esc(c?.dark||'#526d8e'), accent=esc(c?.accent||'#e5eef9');
    if(!c?.style && !c?.pack) {
      const cls=mini?' indexling-mini':'';
      const horns=c?.shape==='horns'?'<span class="indexling-horns"></span>':'';
      return '<div class="indexling-art'+cls+'" style="--ling-main:'+main+';--ling-dark:'+dark+';--ling-accent:'+accent+';">'+horns+'<div class="indexling-body"><span class="indexling-mouth"></span></div><span class="indexling-mark">'+esc(c?.mark||c?.icon||'')+'</span></div>';
    }
    const size=mini?' indexling-mini':'';
    const style='style-'+esc(c.style||c.shape||'plain');
    return '<div class="indexling-art custom-ling '+style+size+'" style="--ling-main:'+main+';--ling-dark:'+dark+';--ling-accent:'+accent+';"><div class="custom-ling-body"><span class="custom-ling-icon">'+esc(c.icon||'')+'</span><span class="custom-ling-eyes"><i></i><i></i></span></div><span class="custom-ling-mark">'+esc(c.rarity==='Legendary'?'★':(c.icon||''))+'</span></div>';
  };

  function packForLing(id){
    const found=Object.entries(window.PACK_DEFS||{}).find(([k,p])=>Array.isArray(p.contents)&&p.contents.includes(id));
    return found ? found[0] : null;
  }

  function renderPackInventory(){
    const root=document.getElementById('rewards-stage');
    if(!root || state.rewardsTab!=='inventory') return;
    const unlocked=new Set(state.progress?.unlockedCosmetics||[]);
    const eq=state.progress?.equipped||{};
    const packs=Array.isArray(window.PACK_ORDER)?window.PACK_ORDER:[];
    const groups=packs.map(pack=>{
      const cfg=window.PACK_DEFS?.[pack];
      if(!cfg) return '';
      const items=(cfg.contents||[]).map(id=>cosmeticById(id)).filter(Boolean).filter(c=>unlocked.has(c.id));
      if(!items.length) return '';
      return '<div class="inventory-pack-group"><div class="pack-section-heading"><span class="pack-dot" style="--pack-accent:'+esc(cfg.accent||'#7c5cfc')+'"></span>'+esc(cfg.icon||'✦')+' '+esc(cfg.name)+'</div><div class="inventory-grid">'+items.map(c=>'<div class="inventory-item unlocked"><div class="inventory-art">'+indexlingArtHtml(c,true)+'</div><strong>'+esc(c.name)+'</strong><div class="reward-muted">'+esc(c.rarity)+' · Indexling</div>'+(eq.indexling===c.id?'<div class="reward-muted" style="margin-top:5px;font-weight:900;">Equipped</div>':'<button class="btn btn-primary btn-sm" style="margin-top:9px;" data-action="equip-cosmetic" data-id="'+esc(c.id)+'">Equip</button>')+'</div>').join('')+'</div></div>';
    }).join('');
    const nonLing=window.REWARD_COSMETICS.filter(c=>c.type!=='indexling'&&unlocked.has(c.id));
    const other=nonLing.length ? '<div class="inventory-pack-group"><div class="pack-section-heading"><span class="pack-dot" style="--pack-accent:#7c5cfc"></span>🎒 Other Cosmetics</div><div class="inventory-grid">'+nonLing.map(c=>'<div class="inventory-item unlocked"><div class="inventory-art" style="font-size:42px;">'+esc(c.icon||'✦')+'</div><strong>'+esc(c.name)+'</strong><div class="reward-muted">'+esc(c.rarity)+' · '+esc(c.type)+'</div>'+(eq[c.type]===c.id?'<div class="reward-muted" style="margin-top:5px;font-weight:900;">Equipped</div>':'<button class="btn btn-primary btn-sm" style="margin-top:9px;" data-action="equip-cosmetic" data-id="'+esc(c.id)+'">Equip</button>')+'</div>').join('')+'</div></div>' : '';
    const count=[...unlocked].filter(id=>cosmeticById(id)).length;
    root.innerHTML='<div class="reward-shell"><div><div class="inventory-summary"><div><h2>Inventory</h2><div class="inventory-count">'+count+' unlocked cosmetics</div></div><button class="btn btn-primary btn-sm" data-action="reward-tab" data-tab="packs">Open Packs</button></div>'+groups+other+'</div><div><div class="panel"><h3>Your collection</h3><p class="reward-muted">Indexlings are organized by the pack they came from.</p><button class="btn btn-ghost" style="width:100%;" data-action="reward-tab" data-tab="packs">🍬 Browse Packs</button></div></div></div>';
  }

  // Wrap the existing renderer so the custom inventory is applied only to the inventory tab.
  if(typeof window.renderRewards==='function'){
    const originalRenderRewards=window.renderRewards;
    window.renderRewards=function(){
      originalRenderRewards();
      if(state.rewardsTab==='inventory') renderPackInventory();
    };
  }

  // Hide jurisdiction personalization for signed-out users. The selected county remains
  // available to the setup/profile flow, but the main command-center copy is generic until login.
  function scrubSignedOutJurisdiction(){
    if(state && state.account) return;
    document.querySelectorAll('[data-jurisdiction],[data-county-display],#sidebar-badge,.sidebar-badge,.hero .lede').forEach(el=>{
      if(el && /Montgomery County|Public Schools|MCPS/i.test(el.textContent||'')){
        el.textContent=(el.classList.contains('lede')?'Your study command center — Personalized after you sign in.':'');
      }
    });
    document.querySelectorAll('body *').forEach(el=>{
      if(el.children.length===0 && /Montgomery County Public Schools|Montgomery County, Maryland/i.test(el.textContent||'')){
        if(!el.closest('.county-gate-card') && !el.closest('#site-gate')) el.textContent=el.textContent.replace(/Montgomery County Public Schools \(MCPS\)|Montgomery County, Maryland/g,'Your school district');
      }
    });
  }
  setTimeout(scrubSignedOutJurisdiction,250);
  setTimeout(scrubSignedOutJurisdiction,1200);
  setInterval(scrubSignedOutJurisdiction,2500);

  // Re-render the rewards screen once the new catalog is installed if it is currently visible.
  if(state?.view==='rewards') renderRewards();
})();