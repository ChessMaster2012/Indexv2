(function(){
'use strict';
if(window.__indexCommanderPackArsenalV4)return;
window.__indexCommanderPackArsenalV4=true;

var PACK_META={
  candy:{label:'Candy Carnival',costBase:35},
  medieval:{label:'Medieval Keep',costBase:45},
  robo:{label:'Robo Works',costBase:55},
  ocean:{label:'Deep Sea',costBase:60},
  arcade:{label:'Arcade Afterdark',costBase:65},
  cosmic:{label:'Cosmic Odyssey',costBase:70}
};
var ROLE_SEQ=['Damage','Support','Splash','Control','Tank','Damage','Support','Splash'];
var ATTACK_PREFIX={
  candy:['Sugar Sting','Gumdrop Bounce','Taffy Whip','Choco Crush','Jelly Burst','Caramel Lash','Sprinkle Volley','Lolli Crown'],
  medieval:['Shield Bash','Bardic Inspire','Hammer Strike','Lance Charge','Alchemy Bomb','Dragon Flame','Arcane Volley','Royal Decree'],
  robo:['Pulse Shot','Circuit Surge','Servo Slam','Drone Beam','Mecha Burst','Reactor Blast','Cyber Pulse','Overclock Beam'],
  ocean:['Bubble Shot','Coral Spike','Pearl Burst','Diver Harpoon','Kelp Snare','Kraken Crush','Abyss Wave','Tide King Surge'],
  arcade:['Token Toss','Joystick Strike','Pixel Burst','Glitch Zap','Synth Wave','Racer Rush','Arcade Blast','Highscore Beam'],
  cosmic:['Comet Trail','Moon Ray','Star Burst','Nebula Wave','Eclipse Field','Quasar Beam','Void Collapse','Supernova Burst']
};

function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function cosmetics(){
  try{return Array.isArray(REWARD_COSMETICS)?REWARD_COSMETICS.filter(function(c){return c&&c.type==='indexling';}):[];}catch(e){return[];}
}
function getCos(id){try{return typeof cosmeticById==='function'?cosmeticById(id):null;}catch(e){return null;}}
function getSkin(id){try{return typeof getEquippedSkinForIndexling==='function'?getEquippedSkinForIndexling(id):null;}catch(e){return null;}}
function getArt(id,mini){
  var c=getCos(id);
  if(!c)return '<span style="font-size:30px">✦</span>';
  try{
    if(typeof indexlingArtHtml==='function'){
      var a=indexlingArtHtml(c,!!mini,getSkin(id));
      if(a)return a;
    }
  }catch(e){}
  return '<span style="font-size:30px">'+esc(c.icon||'✦')+'</span>';
}
function rarityMultiplier(r){
  return r==='Legendary'?1.6:r==='Epic'?1.35:r==='Rare'?1.18:1;
}
function buildDef(c,i){
  var pack=c.pack||'candy', group=cosmetics().filter(function(x){return x.pack===pack;});
  var idx=Math.max(0,group.findIndex(function(x){return x.id===c.id;}));
  var role=ROLE_SEQ[idx%ROLE_SEQ.length];
  var rarity=rarityMultiplier(c.rarity);
  var attack=((ATTACK_PREFIX[pack]||['Signature Strike'])[idx%((ATTACK_PREFIX[pack]||['Signature Strike']).length)])||'Signature Strike';
  var tier=c.rarity==='Legendary'?4:c.rarity==='Epic'?3:c.rarity==='Rare'?2:1;
  return {
    id:c.id,name:c.name,role:role+' Indexling',category:role,
    cost:5+(tier-1)*3+Math.min(2,idx%3),
    damage:Math.round((9+idx*2)*rarity),
    range:118+(idx%8)*16+(tier-1)*8,
    rate:Math.max(650,1220-(idx%6)*65-(tier-1)*40),
    cooldown:Math.max(4,8-(tier-1)*.5),
    power:Math.round((10+idx*2)*rarity),
    ability:attack,
    attackType:'basic',
    description:c.name+' uses '+attack+' as its signature attack.'
  };
}
function ensurePackDefs(){
  if(!Array.isArray(window.COMMANDER_TROOPS_FINAL)||!Array.isArray(window.REWARD_COSMETICS))return;
  var list=cosmetics();
  list.forEach(function(c,i){
    if(!COMMANDER_TROOPS_FINAL.some(function(t){return t.id===c.id;})){
      COMMANDER_TROOPS_FINAL.push(buildDef(c,i));
    }
  });
  try{
    var p=commanderFinalProfile();
    list.forEach(function(c){
      if(state&&state.progress&&Array.isArray(state.progress.unlockedCosmetics)&&state.progress.unlockedCosmetics.indexOf(c.id)>=0){
        p.owned[c.id]=true;
        if(!p.levels[c.id])p.levels[c.id]=1;
      }
    });
  }catch(e){}
}
function tdef(id){
  try{
    var t=COMMANDER_TROOPS_FINAL.find(function(x){return x.id===id;});
    if(t)return t;
  }catch(e){}
  var c=getCos(id);
  return c?buildDef(c,0):null;
}
function unlockedPackIds(){
  ensurePackDefs();
  var set={};
  try{
    (state.progress&&state.progress.unlockedCosmetics||[]).forEach(function(id){
      if(getCos(id))set[id]=true;
    });
    var eq=state.progress&&state.progress.equipped&&state.progress.equipped.indexling;
    if(eq&&getCos(eq))set[eq]=true;
    var p=commanderFinalProfile();
    Object.keys(p.owned||{}).forEach(function(id){if(p.owned[id]&&getCos(id))set[id]=true;});
  }catch(e){}
  if(!Object.keys(set).length)set['ling-sugarbug']=true;
  return cosmetics().filter(function(c){return set[c.id];});
}

function injectCss(){
  if(document.getElementById('commander-pack-v4-css'))return;
  var s=document.createElement('style');s.id='commander-pack-v4-css';
  s.textContent=`
    .commander-pack-v4{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:8px 0 10px}
    .commander-pack-v4-card{position:relative;min-height:150px;border:2px solid rgba(255,255,255,.10);border-radius:14px;background:linear-gradient(155deg,#172a40,#0f2033);color:#fff;padding:7px;text-align:left;cursor:pointer;transition:transform .12s,border-color .12s,box-shadow .12s}
    .commander-pack-v4-card:hover{transform:translateY(-2px);border-color:#73dcff;box-shadow:0 8px 20px rgba(0,0,0,.22)}
    .commander-pack-v4-card.selected{border-color:#ffd75d;box-shadow:0 0 0 2px rgba(255,215,93,.18),0 8px 20px rgba(0,0,0,.22)}
    .commander-pack-v4-card.unaffordable{opacity:.52!important;filter:saturate(.55)!important;cursor:not-allowed!important;border-color:rgba(255,255,255,.07)!important}.commander-pack-v4-card.unaffordable:hover{transform:none!important;box-shadow:none!important}
    .commander-pack-v4-art{height:70px;display:grid;place-items:center}
    .commander-pack-v4-art>div{width:67px!important;height:67px!important}
    .commander-pack-v4-art svg{width:67px!important;height:67px!important}
    .commander-pack-v4-name{font:950 10px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .commander-pack-v4-meta{font:800 7.5px system-ui;color:#a8c0d3;margin-top:2px}
    .commander-pack-v4-stats{font:700 7.2px/1.3 system-ui;color:#dcebf4;margin-top:4px}
    .commander-pack-v4-attack{font:900 7.2px/1.25 system-ui;color:#ffd867;margin-top:4px}
    .commander-pack-v4-cost{font:950 7.5px system-ui;color:#77e1b4;margin-top:4px}
    .commander-pack-v4-pill{display:inline-block;padding:2px 5px;border-radius:999px;background:rgba(255,255,255,.09);margin-right:3px}
    .commander-pack-v4-filter{display:flex;gap:5px;flex-wrap:wrap;margin:5px 0 4px}
    .commander-pack-v4-filter button{border:1px solid #36536c;background:#12263a;color:#b8d3e6;border-radius:999px;padding:4px 7px;font:900 7px system-ui;cursor:pointer}
    .commander-pack-v4-filter button.active{background:#2dbd8b;border-color:#5de2b5;color:#061a16}
    .commander-pack-v4-empty{padding:18px 8px;color:#9eb7cb;font:800 10px/1.4 system-ui;text-align:center}
    .commander-pack-v4-unit-layer{position:absolute;inset:0;z-index:20;pointer-events:none}
    .commander-pack-v4-unit{position:absolute;transform:translate(-50%,-50%);width:90px;height:100px;pointer-events:auto;cursor:pointer;display:grid;place-items:center;filter:drop-shadow(0 8px 10px rgba(0,0,0,.32))}
    .commander-pack-v4-unit-art{width:84px;height:84px;display:grid;place-items:center}
    .commander-pack-v4-unit-art svg{width:84px!important;height:84px!important}
    .commander-pack-v4-ring{position:absolute;width:156px;height:156px;border-radius:50%;border:3px solid #39db94;background:rgba(57,219,148,.09);opacity:0;transition:opacity .12s;pointer-events:none}
    .commander-pack-v4-unit:hover .commander-pack-v4-ring,.commander-pack-v4-unit.pinned .commander-pack-v4-ring{opacity:1}
    .commander-pack-v4-nameplate{position:absolute;top:78px;left:50%;transform:translateX(-50%);padding:4px 7px;border-radius:999px;background:rgba(5,15,26,.94);color:#fff;white-space:nowrap;font:950 8px system-ui;pointer-events:none}
    .commander-pack-v4-role{position:absolute;bottom:78px;left:50%;transform:translateX(-50%);padding:3px 6px;border-radius:999px;background:#fff;color:#14283b;white-space:nowrap;font:950 7px system-ui;pointer-events:none}
    .commander-pack-v4-tip{position:absolute;left:92%;top:-4px;width:220px;padding:11px;border-radius:13px;background:rgba(6,17,29,.98);border:1px solid #426b88;color:#fff;box-shadow:0 16px 34px rgba(0,0,0,.32);opacity:0;transform:translateX(8px);transition:.12s;pointer-events:none;z-index:80}
    .commander-pack-v4-unit:hover .commander-pack-v4-tip,.commander-pack-v4-unit.pinned .commander-pack-v4-tip{opacity:1}
    .commander-pack-v4-tip b{font:950 12px system-ui}
    .commander-pack-v4-tip .gold{color:#ffd867}
    .commander-pack-v4-tip .blue{color:#a9e5ff}
    .commander-pack-v4-ghost{position:absolute;transform:translate(-50%,-50%);width:90px;height:94px;z-index:25;pointer-events:none;display:grid;place-items:center}
    .commander-pack-v4-ghost-art{width:78px;height:78px;opacity:.68}
    .commander-pack-v4-ghost-art svg{width:78px!important;height:78px!important}
    .commander-pack-v4-ghost-ring{position:absolute;width:160px;height:160px;border-radius:50%;border:3px solid #38db94;background:rgba(56,219,148,.10)}
    .commander-pack-v4-ghost-ring.blocked{border-color:#ec5d6a;background:rgba(236,93,106,.11)}
    .commander-pack-v4-ghost-label{position:absolute;top:66px;white-space:nowrap;padding:4px 7px;border-radius:8px;background:rgba(5,15,26,.94);color:#cffff0;border:1px solid #38db94;font:950 8px system-ui}
    .commander-pack-v4-ghost-label.blocked{border-color:#ec5d6a;color:#ffdfe3}
    @media(max-width:1250px){.commander-pack-v4{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(s);
}

function actualRight(){
  var stage=document.getElementById('games-stage');
  return stage&&stage.querySelector('.commander-auth-battle .commander-auth-side-right');
}
function buildCard(c,g){
  var t=tdef(c.id)||buildDef(c,0);
  var level=1;
  try{level=Math.max(1,Number(commanderFinalProfile().levels[c.id])||1);}catch(e){}
  var mult=rarityMultiplier(c.rarity);
  var cost=Math.max(1,Number(t.cost)||1),unaffordable=!g.running&&Number(g.waveCoins||0)<cost;
  var damage=Math.max(1,Math.round((Number(t.damage)||8)*mult));
  var range=Math.round(Number(t.range)||120);
  var dps=Math.round((damage*1000/Math.max(400,Number(t.rate)||1200))*10)/10;
  return '<button type="button" class="commander-pack-v4-card '+(g.selectedTroop===c.id?'selected ':'')+(unaffordable?'unaffordable':'')+'" data-pack-v4-troop="'+esc(c.id)+'" '+(unaffordable?'disabled title="Need '+cost+' deployment coins"':'')+'>'+
    '<div class="commander-pack-v4-art">'+getArt(c.id,true)+'</div>'+
    '<div class="commander-pack-v4-name">'+esc(c.name)+' · Lv '+level+'</div>'+
    '<div class="commander-pack-v4-meta"><span class="commander-pack-v4-pill">'+esc(PACK_META[c.pack]?.label||c.pack||'Pack')+'</span><span class="commander-pack-v4-pill">'+esc(c.rarity)+'</span></div>'+
    '<div class="commander-pack-v4-stats">⚔ '+damage+' DMG · ◉ '+range+' RNG · '+dps+' DPS</div>'+
    '<div class="commander-pack-v4-attack">✦ '+esc(t.ability||c.name+' Signature')+'</div>'+
    '<div class="commander-pack-v4-cost">Deploy · '+cost+' 🪙</div>'+
    '</button>';
}
function selectCard(card,e){
  var gg=state.games,tid=card&&card.getAttribute('data-pack-v4-troop'),tt=tid?tdef(tid):null;
  if(gg&&tt&&Number(gg.waveCoins||0)<Math.max(1,Number(tt.cost)||1)){e.preventDefault();e.stopPropagation();return;}
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  var g=state.games;if(!g||g.running||g.questionGateOpen)return;
  var id=card.getAttribute('data-pack-v4-troop');
  if(!tdef(id))return;
  if(Number(g.waveCoins||0)<Math.max(1,Number(tdef(id).cost)||1))return;
  g.selectedTroop=g.selectedTroop===id?null:id;
  g.selectedTowerIndex=-1;g.hoverTowerIndex=-1;g.cursor=null;
  try{v6Save(g);}catch(err){}
  renderBattle(g);
  setTimeout(sync,0);
}
function renderRight(){
  ensurePackDefs();
  var right=actualRight(),g=typeof state!=='undefined'?state.games:null;
  if(!right||!g||g.active!=='commander'||g.phase!=='battle'||g.questionGateOpen)return;
  var list=unlockedPackIds();
  if(g.selectedTroop&&tdef(g.selectedTroop)&&Number(g.waveCoins||0)<Math.max(1,Number(tdef(g.selectedTroop).cost)||1))g.selectedTroop=null;
  var currentFilter=g.packV4Filter||'All';
  var filtered=list.filter(function(c){
    if(currentFilter==='All')return true;
    if(currentFilter==='Pack')return true;
    return String((tdef(c.id)||{}).category||'')===currentFilter;
  });
  var categories=['All','Damage','Support','Splash','Control','Tank'];
  var oldStart=right.querySelector('.commander-auth-start'),oldChange=right.querySelectorAll('.commander-auth-change');
  var tail='<button class="commander-auth-start" type="button" id="commander-pack-v4-start">▶ Start Wave</button><button class="commander-auth-change" type="button" id="commander-pack-v4-map">Change Map</button><button class="commander-auth-change" type="button" id="commander-pack-v4-topic">Change AP Topic</button>';
  var title='<div class="commander-auth-title">Indexling Arsenal</div>';
  var p;try{p=commanderFinalProfile();}catch(e){p={coins:0};}
  var round='<div class="commander-auth-budget">🪙 Deployment budget: <b>'+Math.floor(g.waveCoins||0)+'</b> · Persistent coins: <b>'+Math.floor(p.coins||0)+'</b></div><div class="commander-auth-round">Round '+Math.max(1,g.wave)+' · '+(g.running?'WAVE IN PROGRESS':'READY TO DEPLOY')+'</div>';
  var filters='<div class="commander-pack-v4-filter">'+categories.map(function(cat){return '<button type="button" class="'+(currentFilter===cat?'active':'')+'" data-pack-v4-filter="'+cat+'">'+cat+'</button>';}).join('')+'</div>';
  var cards=filtered.map(function(c){return buildCard(c,g);}).join('');
  right.innerHTML=title+round+filters+(cards?'<div class="commander-pack-v4">'+cards+'</div>':'<div class="commander-pack-v4-empty">No pack Indexlings are unlocked yet. Open a pack and return here to deploy them.</div>')+tail;
  right.querySelectorAll('[data-pack-v4-troop]').forEach(function(card){card.addEventListener('click',function(e){selectCard(card,e);},true);});
  right.querySelectorAll('[data-pack-v4-filter]').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();g.packV4Filter=b.getAttribute('data-pack-v4-filter');renderRight();},true);});
  var sb=right.querySelector('#commander-pack-v4-start');if(sb)sb.addEventListener('click',function(e){if(typeof window.__commanderStartWaveFinal==='function')window.__commanderStartWaveFinal(e);},true);
  var mb=right.querySelector('#commander-pack-v4-map');if(mb)mb.addEventListener('click',function(e){if(typeof window.__commanderChangeMapFinal==='function')window.__commanderChangeMapFinal(e);},true);
  var tb=right.querySelector('#commander-pack-v4-topic');if(tb)tb.addEventListener('click',function(e){if(typeof window.__commanderChangeTopicFinal==='function')window.__commanderChangeTopicFinal(e);},true);
}
function syncLayers(){
  ensurePackDefs();
  var world=document.querySelector('#games-stage .commander-auth-battle .commander-auth-world'),g=typeof state!=='undefined'?state.games:null;
  if(!world||!g||g.active!=='commander'||g.phase!=='battle'||g.questionGateOpen)return;
  injectCss();renderRight();
  var layer=world.querySelector('.commander-pack-v4-unit-layer');
  if(!layer){layer=document.createElement('div');layer.className='commander-pack-v4-unit-layer';world.appendChild(layer);}
  var key=(g.towers||[]).map(function(t){return[t.id,t.x,t.y,t.level,t.hp].join(':');}).join('|')+'#'+String(g.selectedTroop||'')+'#'+String(g.cursor?g.cursor.x+','+g.cursor.y+','+g.cursor.valid:'');
  if(layer.dataset.key===key)return;
  layer.dataset.key=key;
  var html='';
  (g.towers||[]).forEach(function(t,i){
    var c=getCos(t.id),td=tdef(t.id);if(!c||!td)return;
    var lvl=Math.max(1,Number(t.level)||1);
    var pinned=Number(g.selectedTowerIndex)===i;
    var st={damage:Math.max(1,Number(td.damage)||1),range:Math.max(1,Number(td.range)||100),rate:Math.max(400,Number(td.rate)||1200)};
    var dps=Math.round(st.damage*1000/st.rate*10)/10;
    html+='<div class="commander-pack-v4-unit '+(pinned?'pinned':'')+'" data-pack-v4-unit="'+i+'" style="left:'+(t.x*100)+'%;top:'+(t.y*100)+'%;">'+
      '<div class="commander-pack-v4-ring"></div>'+
      '<div class="commander-pack-v4-unit-art">'+getArt(t.id,false)+'</div>'+
      '<div class="commander-pack-v4-role">'+esc(td.category||td.role||'Indexling')+'</div>'+
      '<div class="commander-pack-v4-nameplate">'+esc(c.name)+' · Lv '+lvl+'</div>'+
      '<div class="commander-pack-v4-tip"><b>'+esc(c.name)+' · Lv '+lvl+'</b><br><span class="blue">'+esc(PACK_META[c.pack]?.label||c.pack||'Pack')+' · '+esc(c.rarity)+'</span><br>⚔ '+st.damage+' DMG · ◉ '+st.range+' RNG · '+dps+' DPS<br><span class="gold">♥ '+Math.ceil(Number(t.hp)||0)+' / '+Math.ceil(Number(t.maxHp)||100)+' HP</span><br><span class="gold">✦ '+esc(td.ability||c.name+' Signature')+'</span><br><span style="color:#a9bed0">Click to pin stats · hover for range</span></div>'+
    '</div>';
  });
  if(g.selectedTroop&&g.cursor&&!g.running){
    var pc=getCos(g.selectedTroop),pt=tdef(g.selectedTroop);
    if(pc&&pt){
      html+='<div class="commander-pack-v4-ghost" style="left:'+(g.cursor.x*100)+'%;top:'+(g.cursor.y*100)+'%;">'+
        '<div class="commander-pack-v4-ghost-ring '+(g.cursor.valid?'':'blocked')+'"></div>'+
        '<div class="commander-pack-v4-ghost-art">'+getArt(g.selectedTroop,false)+'</div>'+
        '<div class="commander-pack-v4-ghost-label '+(g.cursor.valid?'':'blocked')+'">'+(g.cursor.valid?'PLACE':'BLOCKED')+' · '+esc(pc.name)+'</div>'+
      '</div>';
    }
  }
  layer.innerHTML=html;
  layer.querySelectorAll('[data-pack-v4-unit]').forEach(function(unit){
    unit.addEventListener('click',function(e){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      var idx=Number(unit.getAttribute('data-pack-v4-unit')),gg=state.games;
      if(!gg||!gg.towers[idx])return;
      gg.selectedTowerIndex=gg.selectedTowerIndex===idx?-1:idx;
      gg.selectedTroop=null;gg.hoverTowerIndex=idx;gg.cursor=null;
      renderBattle(gg);setTimeout(syncLayers,0);
    },true);
  });
}
function patchPlacementGuard(){
  if(window.__packPlacementGuardV4)return;
  window.__packPlacementGuardV4=true;
  var original=window.__commanderSelectFinal;
  window.__commanderSelectFinal=function(id,e){
    if(getCos(id)){
      if(e){e.preventDefault();e.stopPropagation();}
      var g=state.games;if(!g||g.running||g.questionGateOpen)return false;
      ensurePackDefs();
      g.selectedTroop=g.selectedTroop===id?null:id;
      g.selectedTowerIndex=-1;g.hoverTowerIndex=-1;g.cursor=null;
      renderBattle(g);setTimeout(sync,0);return false;
    }
    return typeof original==='function'?original(id,e):false;
  };
}
function cooldownKey(q){return String(q&&q.q||'').trim();}

var QUESTION_SAFETY_BANK={
  biology:[
    ['Which molecule stores hereditary information in most cells?',['ATP','DNA','Glucose','Lipids'],1],
    ['Where does glycolysis occur?',['Nucleus','Cytoplasm','Mitochondrial matrix','Golgi apparatus'],1],
    ['What is the main function of ribosomes?',['Store DNA','Synthesize proteins','Digest lipids','Make ATP'],1],
    ['Which process moves water across a selectively permeable membrane?',['Diffusion','Osmosis','Translation','Transcription'],1],
    ['What happens during mitosis?',['Chromosome number is normally maintained','DNA is converted to RNA','Proteins are digested','ATP is destroyed'],0],
    ['Which organelle is the main site of aerobic cellular respiration?',['Lysosome','Mitochondrion','Ribosome','Vacuole'],1],
    ['What is the role of mRNA?',['Carry genetic instructions to ribosomes','Store ATP','Break down glucose','Build cell walls'],0],
    ['Natural selection changes populations primarily through differences in what?',['Traits affecting survival or reproduction','The age of cells','The number of organelles','The color of DNA'],0]
  ],
  usgov:[
    ['Federalist No. 10 focuses heavily on the problem of what?',['Factions','Judicial review','Term limits','The census'],0],
    ['Federalist No. 51 argues that government should be designed with what?',['Checks and balances','A single legislature','No elections','Direct rule by judges'],0],
    ['Which case established the principle of judicial review?',['Marbury v. Madison','McCulloch v. Maryland','Brown v. Board','Gibbons v. Ogden'],0],
    ['Which principle divides power between the national and state governments?',['Federalism','Separation of powers','Popular sovereignty','Due process'],0],
    ['Which branch has the constitutional power to declare war?',['The judiciary','Congress','The president alone','State governments'],1],
    ['What does the First Amendment protect?',['Freedom of speech','Quartering troops','Protection from searches in all cases','The right to a jury in every dispute'],0],
    ['The Necessary and Proper Clause is also called what?',['Elastic Clause','Supremacy Clause','Establishment Clause','Equal Protection Clause'],0],
    ['Why is an independent judiciary important in the constitutional system?',['It can interpret the law without direct political control','It writes all federal laws','It appoints all governors','It controls elections'],0]
  ],
  ushistory:[
    ['Which event is generally considered the first major military engagement of the American Revolution?',['Lexington and Concord','Yorktown','Gettysburg','Fort Sumter'],0],
    ['The Constitution replaced which earlier national framework?',['Articles of Confederation','Federalist Papers','Treaty of Paris','Mayflower Compact'],0],
    ['Which amendment ended slavery in the United States?',['10th','13th','14th','15th'],1],
    ['What was a major goal of Reconstruction?',['Reintegrating the former Confederate states and protecting rights','Ending westward expansion','Creating a national bank','Annexing Canada'],0],
    ['The Progressive Era is associated with efforts to address what?',['Industrial and political problems','The Cold War','Colonial independence in Asia','The Civil War'],0],
    ['Which development helped accelerate U.S. industrialization in the late 1800s?',['Railroad expansion','The Louisiana Purchase','The Articles of Confederation','The Monroe Doctrine'],0]
  ],
  worldhistory:[
    ['Where did the Industrial Revolution begin?',['Great Britain','China','Brazil','Russia'],0],
    ['What was a major effect of European imperialism in the 1800s?',['European control expanded across parts of Africa and Asia','Most empires disappeared immediately','Industrialization ended','All trade stopped'],0],
    ['World War I began after the assassination of whom?',['Archduke Franz Ferdinand','Winston Churchill','Woodrow Wilson','Otto von Bismarck'],0],
    ['The Cold War primarily involved rivalry between which two powers?',['United States and Soviet Union','Britain and France','China and Japan','Spain and Portugal'],0],
    ['Decolonization accelerated especially after which conflict?',['World War II','The Seven Years’ War','The Crimean War','The Napoleonic Wars'],0],
    ['The Enlightenment emphasized the use of what?',['Reason','Divine right','Feudal obligation','Hereditary privilege'],0]
  ],
  chemistry:[
    ['Atomic number is equal to the number of what in a neutral atom?',['Neutrons','Protons','Nucleons','Isotopes'],1],
    ['A solution with pH below 7 is generally what?',['Acidic','Basic','Neutral','Metallic'],0],
    ['What happens to most reaction rates as temperature increases?',['They increase','They decrease','They always become zero','They cannot change'],0],
    ['Molarity is defined as moles of solute per what?',['Liter of solution','Gram of solvent','Mole of solvent','Liter of solute'],0],
    ['Which particle has a negative charge?',['Proton','Neutron','Electron','Nucleus'],2],
    ['Oxidation is commonly defined as what?',['Loss of electrons','Gain of electrons','Gain of neutrons','Loss of protons'],0]
  ],
  physics1:[
    ['The slope of a position-time graph represents what?',['Velocity','Acceleration','Force','Momentum'],0],
    ['Newton’s second law is represented by which relationship?',['F=ma','p=mv','W=Fd','E=mc²'],0],
    ['What is kinetic energy associated with?',['Motion','Position only','Temperature only','Charge only'],0],
    ['Momentum is calculated as mass multiplied by what?',['Velocity','Acceleration','Force','Energy'],0],
    ['If net force on an object is zero, its acceleration is what?',['Zero','Maximum','Negative one','Undefined'],0],
    ['Work is done on an object when a force causes what?',['A displacement','A color change','A mass increase','A temperature decrease only'],0]
  ],
  calcab:[
    ['What is the derivative of x²?',['x','2x','x²','2'],1],
    ['A derivative represents what?',['Instantaneous rate of change','Total probability','Area only','A constant value'],0],
    ['What is the derivative of a constant?',['1','0','The constant itself','Undefined'],1],
    ['What does a definite integral commonly represent geometrically?',['Signed area','Slope only','A maximum only','A probability in every case'],0],
    ['Which rule is useful for differentiating a product of two functions?',['Product rule','Power set rule','Remainder rule','Distance rule'],0],
    ['What does the Fundamental Theorem of Calculus connect?',['Derivatives and integrals','Matrices and vectors','Probability and statistics','Angles and polygons'],0]
  ],
  statistics:[
    ['A confidence interval estimates what?',['A population parameter','Every individual value','A sample size','A histogram'],0],
    ['What measure describes the center of a data set by adding values and dividing by count?',['Mean','Range','Variance','Percentile'],0],
    ['A larger standard deviation generally indicates what?',['More spread in the data','A larger sample automatically','A smaller mean','No variation'],0],
    ['A p-value is used to evaluate what under a null model?',['How compatible the data are with the null hypothesis','The exact population size','The mean of every population','A graph’s color'],0],
    ['Correlation measures what?',['Strength and direction of a linear association','Causation automatically','Sample size','The median only'],0],
    ['What is the range of a data set?',['Maximum minus minimum','Mean minus median','Sum divided by count','Standard deviation squared'],0]
  ],
  psychology:[
    ['Classical conditioning is based on learning through what?',['Association','Random mutation','Economic growth','Plate tectonics'],0],
    ['Which neuron structure usually receives incoming signals?',['Dendrites','Axon','Myelin','Terminal buttons'],0],
    ['Which brain region is strongly associated with forming new explicit memories?',['Hippocampus','Medulla','Cerebellum only','Spinal cord'],0],
    ['Conformity generally refers to what?',['Changing behavior or beliefs to match a group','Forgetting information','Learning by trial only','Dreaming during sleep'],0],
    ['What is a neurotransmitter?',['A chemical messenger between neurons','A type of chromosome','A muscle fiber','A memory test'],0],
    ['Operant conditioning focuses on how behavior is affected by what?',['Consequences','DNA sequence only','Weather','Blood type'],0]
  ],
  macro:[
    ['GDP measures the market value of what?',['Final goods and services produced domestically','All household wealth','Only imports','Only government spending'],0],
    ['Inflation is a sustained increase in what?',['The general price level','Real output only','Employment only','Interest-free loans'],0],
    ['Fiscal policy mainly involves changes in what?',['Government spending and taxation','The money supply only','Reserve requirements only','Exchange rates only'],0],
    ['Monetary policy is primarily conducted by changing what?',['Interest rates and money conditions','Income tax brackets','Government purchases','Trade treaties'],0],
    ['Unemployment caused by workers moving between jobs is called what?',['Frictional unemployment','Structural unemployment','Cyclical unemployment','Seasonal inflation'],0],
    ['When aggregate demand rises faster than productive capacity, what can result?',['Demand-pull inflation','Deflation only','Lower prices in every case','A permanent recession'],0]
  ],
  micro:[
    ['The law of demand generally says quantity demanded falls when what rises?',['Price','Population','Quality','Advertising'],0],
    ['Opportunity cost is what?',['The value of the next best alternative forgone','The total money in a bank','A tax on firms','The price after a discount'],0],
    ['A perfectly competitive firm is generally a what in the market?',['Price taker','Price maker','Monopoly','Cartel'],0],
    ['Marginal cost is the change in total cost from producing what?',['One more unit','One fewer firm','One more dollar of revenue','One more consumer only'],0],
    ['A monopoly is characterized by what?',['A single seller with significant market power','Many identical sellers','No barriers to entry','Perfect competition'],0],
    ['A negative externality imposes a cost on whom?',['A third party not directly involved in the transaction','Only the seller','Only the buyer','Nobody'],0]
  ],
  englang:[
    ['A claim is best described as what?',['A position supported by reasoning and evidence','A citation format','A grammar rule','A decorative sentence'],0],
    ['What is an appeal to ethos based on?',['Credibility or character','Emotion only','Numerical calculation only','Chronology'],0],
    ['What is an appeal to pathos based on?',['Emotion','Credibility','Formal proof only','Grammar'],0],
    ['A counterclaim is what?',['A position that challenges the main claim','A source citation','A topic sentence only','A definition'],0],
    ['Evidence is used primarily to do what?',['Support a claim or line of reasoning','Replace all reasoning','Make a title longer','Remove context'],0],
    ['A rhetorical situation includes the speaker, audience, purpose, and what else?',['Context','Font size','Page number','Citation color'],0]
  ],
  spanishlang:[
    ['Which phrase means “I have been studying”?',['He estudiado','Estoy estudiando','He estado estudiando','Estudié'],2],
    ['Which tense commonly describes an ongoing action in the past?',['Imperfect','Preterite only','Future','Conditional only'],0],
    ['What is a common use of the subjunctive?',['Expressing doubt, emotion, wishes, or non-certain situations','Stating every completed fact','Naming months','Counting objects'],0],
    ['Which word means “although”?',['Aunque','Porque','Entonces','Mientras'],0],
    ['Which form means “we used to eat”?',['Comíamos','Comimos','Comeremos','Hemos comido'],0],
    ['What does “sin embargo” generally mean?',['However','Therefore','Usually','Never'],0]
  ]
};
function questionPoolForRun(g){
  var list=[],seen={};
  function add(arr){(arr||[]).forEach(function(q){var k=cooldownKey(q);if(k&&!seen[k]){seen[k]=1;list.push(q);}});}
  try{
    if(typeof window.commanderQuestionPoolForLesson==='function'){
      var info=window.commanderQuestionPoolForLesson(g);
      if(info){add(info.all);add(info.pool);}
    }
  }catch(e){}
  try{add(commanderQuestionPoolFinal(g));}catch(e){}
  add((QUESTION_SAFETY_BANK[g.subjectId]||QUESTION_SAFETY_BANK.biology).map(function(q){return{q:q[0],options:q[1],correct:q[2],explanation:'Review the AP concept tested by this question.'};}));
  return list;
}
function ensureQuestionCooldownState(g){
  if(!g)return;
  if(!g.commanderQuestionCooldowns||typeof g.commanderQuestionCooldowns!=='object')g.commanderQuestionCooldowns={};
  if(!Array.isArray(g.commanderQuestionHistory))g.commanderQuestionHistory=[];
}
function decayQuestionCooldowns(g){
  ensureQuestionCooldownState(g);
  Object.keys(g.commanderQuestionCooldowns).forEach(function(k){
    g.commanderQuestionCooldowns[k]=Math.max(0,Number(g.commanderQuestionCooldowns[k]||0)-1);
    if(!g.commanderQuestionCooldowns[k])delete g.commanderQuestionCooldowns[k];
  });
}
function chooseEligibleQuestion(g,excludeKey){
  ensureQuestionCooldownState(g);
  var pool=questionPoolForRun(g).filter(function(q){return q&&q.q&&cooldownKey(q)!==String(excludeKey||'');});
  var eligible=pool.filter(function(q){return !(g.commanderQuestionCooldowns[cooldownKey(q)]>0);});
  if(!eligible.length)eligible=pool;
  if(!eligible.length)return null;
  var q=eligible[Math.floor(Math.random()*eligible.length)];
  return {q:String(q.q),options:(q.options||[]).map(String).slice(0,4),correct:Math.max(0,Math.min(3,Number(q.correct)||0)),explanation:String(q.explanation||'')};
}
function enforceQuestionCooldown(g){
  if(!g||!g.questionGateOpen||!g.question)return;
  ensureQuestionCooldownState(g);
  var key=cooldownKey(g.question),remaining=Number(g.commanderQuestionCooldowns[key]||0);
  if(remaining>0){
    var replacement=chooseEligibleQuestion(g,key);
    if(replacement)g.question=replacement;
  }
}
function markQuestionCooldown(g,q,correct){
  ensureQuestionCooldownState(g);
  var key=cooldownKey(q);if(!key)return;
  g.commanderQuestionCooldowns[key]=correct?15:5;
  g.commanderQuestionHistory.push({key:key,correct:!!correct,at:Date.now()});
  if(g.commanderQuestionHistory.length>60)g.commanderQuestionHistory=g.commanderQuestionHistory.slice(-60);
}
function normalizeQuestionAfterTransition(g){
  if(!g||!g.questionGateOpen||g.questionFeedback)return;
  decayQuestionCooldowns(g);
  enforceQuestionCooldown(g);
  try{commanderSaveFinal(g);}catch(e){}
}
function ensureInitialDeploymentBudget(g){
  if(!g||g.phase!=='battle')return;
  if(!g.initialDeploymentBudgetGranted&&Number(g.wave||0)===0&&!g.running&&!g.finished){
    g.waveCoins=50;
    g.initialDeploymentBudgetGranted=true;
    try{commanderSaveFinal(g);}catch(e){}
  }
}
function wrapQuestionEconomy(){
  if(window.__indexCommanderQuestionEconomyV5)return;
  window.__indexCommanderQuestionEconomyV5=true;
  ensureQuestionCooldownState(state.games);
  var oldAnswer=window.__commanderAnswerFinal;
  if(typeof oldAnswer==='function'){
    window.__commanderAnswerFinal=function(i,e){
      var g=state.games,q=g&&g.question?{q:g.question.q,options:g.question.options,correct:g.question.correct,explanation:g.question.explanation}:null;
      var before=g?Number(g.waveCoins||0):0;
      var result=oldAnswer.apply(this,arguments);
      if(g&&q){
        var correct=Number(i)===Number(q.correct);
        markQuestionCooldown(g,q,correct);
        g.waveCoins=before+10;
        normalizeQuestionAfterTransition(g);
        if(!g.questionGateOpen)g.questionFeedback=null;
        if(typeof commanderSaveFinal==='function')commanderSaveFinal(g);
        if(typeof commanderRenderScreen==='function')commanderRenderScreen();
      }
      return result;
    };
  }
  var oldContinue=window.__commanderContinueFinal;
  if(typeof oldContinue==='function'){
    window.__commanderContinueFinal=function(e){
      var g=state.games;
      var result=oldContinue.apply(this,arguments);
      if(g)normalizeQuestionAfterTransition(g);
      return result;
    };
  }
}
function patchCommanderRunPersistence(){
  if(window.__indexCommanderRunPersistenceV5)return;
  window.__indexCommanderRunPersistenceV5=true;
  var oldSave=window.commanderSaveFinal;
  if(typeof oldSave==='function'){
    window.commanderSaveFinal=function(g){
      var gg=g||state.games,ret=oldSave.apply(this,arguments);
      try{
        if(gg&&gg.slotIndex!=null){
          var slot=commanderSlotsFinal()[gg.slotIndex];
          if(slot){
            slot.commanderQuestionCooldowns=Object.assign({},gg.commanderQuestionCooldowns||{});
            slot.commanderQuestionHistory=Array.isArray(gg.commanderQuestionHistory)?gg.commanderQuestionHistory.slice(-60):[];
            slot.initialDeploymentBudgetGranted=!!gg.initialDeploymentBudgetGranted;
            persistProgress();
          }
        }
      }catch(e){}
      return ret;
    };
  }
  var oldStart=window.commanderStartMapFinal;
  if(typeof oldStart==='function'){
    window.commanderStartMapFinal=function(mapId,slot,saveData){
      var ret=oldStart.apply(this,arguments),g=state.games;
      if(g&&g.active==='commander'){
        ensureQuestionCooldownState(g);
        var src=saveData&&typeof saveData==='object'?saveData:null;
        g.commanderQuestionCooldowns=src&&src.commanderQuestionCooldowns&&typeof src.commanderQuestionCooldowns==='object'?Object.assign({},src.commanderQuestionCooldowns):{};
        g.commanderQuestionHistory=src&&Array.isArray(src.commanderQuestionHistory)?src.commanderQuestionHistory.slice(-60):[];
        g.initialDeploymentBudgetGranted=!!(src&&src.initialDeploymentBudgetGranted);
        ensureInitialDeploymentBudget(g);
        try{commanderSaveFinal(g);}catch(e){}
      }
      return ret;
    };
  }
}
function patchTopicChange(){
  if(window.__indexCommanderTopicAutoResetV5)return;
  window.__indexCommanderTopicAutoResetV5=true;
  document.addEventListener('change',function(ev){
    var t=ev.target;
    if(!t||t.id!=='commander-subject-final')return;
    var g=state.games;
    if(!g||g.active!=='commander')return;
    var sub=subjectById(t.value)||SUBJECTS[0],units=Array.isArray(sub.units)?sub.units:[];
    g.subjectId=t.value;g.unit=units[0]||'';g.topic='';g.questionBank=[];g.lessonPathId='';g.lessonIndex=0;g.lessonTotal=0;g.lessonMastered={};g.mixedQuestionOrder=null;g.mixedQuestionCursor=0;g.commanderQuestionCooldowns={};g.commanderQuestionHistory=[];
    var topic=document.getElementById('commander-topic-final');if(topic)topic.value='';
    var unit=document.getElementById('commander-unit-final');if(unit){unit.innerHTML=units.map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>';}).join('');unit.value=g.unit;}
    try{g.question=null;g.questionFeedback=null;g.questionError='';g.questionLoading=true;}catch(e){}
    try{commanderSaveFinal(g);}catch(e){}
  },false);
}

function sync(){
  ensurePackDefs();patchPlacementGuard();wrapQuestionEconomy();patchTopicChange();patchCommanderRunPersistence();ensureInitialDeploymentBudget(state.games);
  var stage=document.getElementById('games-stage');
  if(!stage||!stage.querySelector('.commander-auth-battle'))return;
  syncLayers();
}
var timer=0;
var mo=new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(sync,25);});
function observe(){var st=document.getElementById('games-stage');if(st)mo.observe(st,{childList:true,subtree:true});sync();}
setTimeout(observe,0);
setTimeout(sync,120);
setInterval(sync,500);
})();