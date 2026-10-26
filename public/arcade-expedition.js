/* Expedition Dash v2 — a branching dungeon-crawl: torchlit node map with fog, d20 stat checks, story events,
   quick dice combat with telegraphed enemy intents, merchants, campfires, relics and consumables, boss at the end.
   Overrides the arcade Expedition hooks from the main script. Saves to gameProgress.expedition. */
(function(){
'use strict';
var LW=1000, LH=562, COLS=9, TAU=Math.PI*2;
var clamp=function(n,a,b){ return Math.max(a,Math.min(b,n)); };
function $(id){ return document.getElementById(id); }
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; }; }
function esc2(s){ return (typeof esc==='function')?esc(String(s==null?'':s)):String(s==null?'':s); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
var NT={monster:{icon:'⚔️',name:'Monster',col:'#ff7a7a'},elite:{icon:'💀',name:'Elite',col:'#ff4a8a'},event:{icon:'❓',name:'Mystery',col:'#9bb0ff'},treasure:{icon:'💰',name:'Treasure',col:'#ffd24a'},camp:{icon:'🔥',name:'Campfire',col:'#ffa24a'},shop:{icon:'🛒',name:'Merchant',col:'#7ae8c0'},trap:{icon:'⚠️',name:'Trap',col:'#ffb04a'},boss:{icon:'👑',name:'Boss',col:'#ff5aa0'},start:{icon:'🚪',name:'Entrance',col:'#aaa'}};

/* ------------------------------ sprite / sound ------------------------------ */
var spriteCache={};
function playerSprite(){
  var id='ling-sugarbug', skinId='';
  try{ id=(state.progress.equipped&&state.progress.equipped.indexling)||id; skinId=(typeof getEquippedSkinId==='function'&&getEquippedSkinId(id))||''; }catch(e){}
  var key=id+'|'+skinId; if(spriteCache.key===key&&spriteCache.img) return spriteCache;
  var img=new Image(); spriteCache={key:key,img:img,col:'#b07cff',url:''};
  try{
    var ling=cosmeticById(id)||cosmeticById('ling-sugarbug'), sk=skinId&&typeof skinById==='function'?skinById(skinId):null;
    spriteCache.col=(sk&&sk.main)||(ling&&ling.main)||'#b07cff';
    var html=typeof indexlingArtHtml==='function'?indexlingArtHtml(ling,true,sk||{}):arcadeCharacterHtml(), m=html.match(/<svg[\s\S]*<\/svg>/);
    if(m){ var vars={}; html.replace(/(--[\w-]+)\s*:\s*([^;"]+)/g,function(_,k,v){ vars[k]=v.trim(); return _; });
      var svg=m[0].replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g,function(_,k){ return vars[k]||'#b07cff'; }).replace(/<svg\b/,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"');
      spriteCache.url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); img.src=spriteCache.url; }
  }catch(e){}
  return spriteCache;
}
var AC=null, sfxT={};
function muted(){ try{ return localStorage.getItem('gx-mute')==='1'; }catch(e){ return false; } }
function sfx(kind){
  if(muted()) return; var now=performance.now(); if(sfxT[kind]&&now-sfxT[kind]<40) return; sfxT[kind]=now;
  try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume();
    var P={step:[200,300,.08,'triangle',.06],roll:[500,700,.05,'square',.04],good:[520,1040,.2,'triangle',.09],bad:[220,90,.25,'sawtooth',.09],hit:[200,70,.12,'square',.08],coin:[880,1320,.1,'sine',.08],heal:[500,1000,.25,'sine',.09],win:[520,1320,.6,'triangle',.14],lose:[200,40,.6,'sawtooth',.14],boss:[80,60,.5,'sawtooth',.14]}[kind]; if(!P) return;
    var o=AC.createOscillator(), gn=AC.createGain(), t=AC.currentTime; o.type=P[3]; o.frequency.setValueAtTime(P[0],t); o.frequency.exponentialRampToValueAtTime(Math.max(30,P[1]),t+P[2]); gn.gain.setValueAtTime(P[4],t); gn.gain.exponentialRampToValueAtTime(.0001,t+P[2]); o.connect(gn); gn.connect(AC.destination); o.start(t); o.stop(t+P[2]+.02); }catch(e){}
}

/* ------------------------------ content ------------------------------ */
var RELICS={
  coin:{icon:'🪙',name:'Lucky Coin',d:'+1 to all rolls'},boots:{icon:'🥾',name:'Iron Boots',d:'Take 1 less damage'},ember:{icon:'🔥',name:'Ember Charm',d:'Torch lasts: moves cost nothing every 3rd step'},
  fang:{icon:'🦷',name:'Vampire Fang',d:'Heal 1 HP when you hit'},seal:{icon:'📜',name:"Merchant's Seal",d:'25% off at shops'},banner:{icon:'🚩',name:"Hero's Banner",d:'+2 attack damage'},
  glass:{icon:'🔭',name:'Spyglass',d:'See every room ahead'},skin:{icon:'🛡️',name:'Thick Skin',d:'+4 max HP'}
};
var ITEMS={potion:{icon:'🧪',name:'Potion',d:'Heal 8 HP'},torch:{icon:'🕯️',name:'Torch',d:'+4 torch'},bomb:{icon:'💣',name:'Bomb',d:'Deal 8 damage in a fight'},smoke:{icon:'💨',name:'Smoke bomb',d:'Escape a fight'}};
var MON=[
  [{n:'Cave Rat',i:'🐀',hp:6,atk:2},{n:'Slime',i:'🟢',hp:8,atk:2},{n:'Skeleton',i:'💀',hp:9,atk:3}],
  [{n:'Goblin Raider',i:'👺',hp:12,atk:4},{n:'Bone Archer',i:'🏹',hp:10,atk:4},{n:'Cursed Armor',i:'🛡️',hp:16,atk:3}],
  [{n:'Wraith',i:'👻',hp:14,atk:5},{n:'Ogre',i:'👹',hp:22,atk:5},{n:'Gargoyle',i:'🗿',hp:18,atk:4}]
];
var ELITE=[{n:'Ogre Warlord',i:'👹',hp:30,atk:6},{n:'Lich Acolyte',i:'🧙',hp:26,atk:7},{n:'Crystal Golem',i:'💎',hp:34,atk:5}];
var BOSS={n:'The Warden',i:'🐲',hp:54,atk:7,boss:true};
var EVENTS=[
 {t:'Collapsed Bridge',i:'🌉',x:'A rope bridge sags over a deep chasm. The far side glitters with something shiny.',c:[
   {l:'Leap across',s:'speed',dc:12,w:{x:'You sail over and snatch a purse of coins!',fx:{gold:10}},f:{x:'You barely catch the ledge, scraping yourself badly.',fx:{hp:-3}}},
   {l:'Climb around',s:'power',dc:10,w:{x:'A tiring climb, but you find a hidden stash.',fx:{gold:6,torch:-1}},f:{x:'You slip and lose time.',fx:{hp:-2,torch:-1}}},
   {l:'Turn back',w:{x:'You wait for a different path. The torch burns a little lower.',fx:{torch:-1}}}]},
 {t:'Whispering Altar',i:'🗿',x:'A stone altar murmurs your name. A bowl on top is hungry for an offering.',c:[
   {l:'Pray for a boon',s:'luck',dc:12,w:{x:'The altar glows. A relic materializes!',fx:{relic:1}},f:{x:'The whispers turn to screams. Pain lances through you.',fx:{hp:-3}}},
   {l:'Offer 10 gold',need:{gold:10},w:{x:'The altar warms. Your wounds close.',fx:{gold:-10,hp:6}}},
   {l:'Walk away',w:{x:'You leave the whispers behind.',fx:{}}}]},
 {t:'Sleeping Ogre',i:'😴',x:'A huge ogre snores beside a pile of loot, a pouch dangling from its belt.',c:[
   {l:'Sneak past',s:'speed',dc:13,w:{x:'Silent as a shadow, you lift the pouch.',fx:{gold:16}},f:{x:'A twig snaps! The ogre wakes up roaring.',fx:{combat:'ogre'}}},
   {l:'Ambush it',s:'power',dc:11,w:{x:'You strike first, hard!',fx:{combat:'ogre',pre:6}},f:{x:'The ogre catches your blade in its fist.',fx:{combat:'ogre'}}},
   {l:'Tiptoe away',w:{x:'You slip back into the dark.',fx:{}}}]},
 {t:'Strange Mushrooms',i:'🍄',x:'A glowing patch of mushrooms pulses with soft light. They smell... delicious.',c:[
   {l:'Eat one',s:'luck',dc:10,w:{x:'Surprisingly tasty — you feel refreshed.',fx:{hp:6}},f:{x:'Your stomach lurches. Not a good choice.',fx:{hp:-4}}},
   {l:'Study and harvest',s:'wits',dc:8,w:{x:'You brew a safe potion from the caps.',fx:{item:'potion'}},f:{x:'They crumble to dust.',fx:{}}},
   {l:'Leave them',w:{x:'You move on.',fx:{}}}]},
 {t:'Riddle Door',i:'🚪',x:'A door carved with glowing runes asks: "What grows when fed, yet dies when watered?"',c:[
   {l:'Answer: "Fire"',s:'wits',dc:11,w:{x:'The door swings open on a hoard.',fx:{gold:18,item:'torch'}},f:{x:'A shock jolts you backward.',fx:{hp:-2}}},
   {l:'Force it open',s:'power',dc:14,w:{x:'The hinges snap. A few coins spill out.',fx:{gold:8}},f:{x:'The door doesn\'t budge. Your shoulder does.',fx:{hp:-3}}},
   {l:'Skip it',w:{x:'You leave the riddle unsolved.',fx:{}}}]},
 {t:'Wounded Adventurer',i:'🤕',x:'An explorer leans against the wall, clutching a bleeding leg. "Please... help."',c:[
   {l:'Share supplies',w:{x:'They thank you with a map and a potion.',fx:{torch:-1,item:'potion',gold:8}}},
   {l:'Rob them',s:'luck',dc:9,w:{x:'You take their coins. You feel a little worse about yourself.',fx:{gold:16}},f:{x:'They fight back, surprisingly well.',fx:{hp:-3}}},
   {l:'Walk on',w:{x:'You leave them to their fate.',fx:{}}}]},
 {t:'Glowing Pool',i:'🌊',x:'Luminous water fills a small cavern pool. The light dances on the ceiling.',c:[
   {l:'Drink deeply',s:'luck',dc:11,w:{x:'Strength flows through you!',fx:{maxHp:2,hp:2}},f:{x:'It burns going down.',fx:{hp:-3}}},
   {l:'Bottle some',s:'wits',dc:9,w:{x:'You capture the glow in a flask.',fx:{item:'potion'}},f:{x:'It fizzles into nothing.',fx:{}}},
   {l:'Dip your torch',w:{x:'The flame flares bright and steady.',fx:{torch:3}}}]},
 {t:'Spider Nest',i:'🕸️',x:'Thick webs hang from the ceiling. Something skitters in the dark.',c:[
   {l:'Burn the webs',need:{torch:2},w:{x:'The webs go up in a whoosh. A cocooned traveler had gold!',fx:{torch:-2,gold:12}}},
   {l:'Cut through',s:'power',dc:11,w:{x:'You hack a path and find coins stuck in the silk.',fx:{gold:8}},f:{x:'Giant fangs bite you!',fx:{hp:-3}}},
   {l:'Squeeze past',s:'speed',dc:12,w:{x:'You slip through unnoticed.',fx:{}},f:{x:'Sticky strands snag you.',fx:{hp:-2,torch:-1}}}]},
 {t:'Cursed Chest',i:'🧰',x:'An ornate chest hums with dark energy. The lock is shaped like a skull.',c:[
   {l:'Open it',s:'luck',dc:12,w:{x:'Treasure! The curse sleeps today.',fx:{gold:26}},f:{x:'The lid bites back.',fx:{hp:-4}}},
   {l:'Disarm the lock',s:'wits',dc:12,w:{x:'Click. Inside lies a relic.',fx:{relic:1}},f:{x:'The lock sparks and burns your fingers.',fx:{hp:-2}}},
   {l:'Leave it',w:{x:'Some things are better left alone.',fx:{}}}]},
 {t:'Ancient Library',i:'📚',x:'Dusty shelves tower around you. One scroll glows faintly.',c:[
   {l:'Read the scroll',s:'wits',dc:10,w:{x:'Knowledge floods your mind. (+1 Wits for the run)',fx:{wits:1}},f:{x:'The ink swirls and means nothing.',fx:{torch:-1}}},
   {l:'Burn pages for light',w:{x:'A bonfire of forgotten knowledge. Warm, at least.',fx:{torch:4}}},
   {l:'Move on',w:{x:'Quietly you leave.',fx:{}}}]},
 {t:'Falling Rocks',i:'🪨',x:'The ceiling rumbles. Dust rains down — the tunnel is about to collapse!',c:[
   {l:'Dive aside',s:'speed',dc:11,w:{x:'You roll clear as the rocks crash behind you.',fx:{}},f:{x:'A boulder clips you.',fx:{hp:-4}}},
   {l:'Shield with your pack',w:{x:'Your pack takes the worst of it.',fx:{hp:-2}}}]},
 {t:'Fairy Fountain',i:'⛲',x:'A tiny winged light circles a fountain. "Make a wish," it giggles.',c:[
   {l:'Make a wish',s:'luck',dc:13,w:{x:'A relic drops from the fountain with a sparkle!',fx:{relic:1}},f:{x:'The fairy giggles and flits away. Nothing happens.',fx:{}}},
   {l:'Drink the water',w:{x:'Cool and refreshing.',fx:{hp:4}}}]},
 {t:'Free Chest?',i:'🎁',x:'A chest sits in the middle of the room. A single, suspicious tooth is visible in the lock.',c:[
   {l:'Open it anyway',w:{x:'It\'s a MIMIC!',fx:{combat:'mimic'}}},
   {l:'Inspect it first',s:'wits',dc:9,w:{x:'You spot the trap and strike the mimic first!',fx:{combat:'mimic',pre:8}},f:{x:'It looks normal... until it bites.',fx:{combat:'mimic'}}},
   {l:'Back away slowly',w:{x:'It watches you go.',fx:{}}}]}
];
var TRAPS=[
 {t:'Pressure Plate',i:'🔻',x:'Click. The floor dips under your boot. Hidden darts line the wall.',c:[{l:'Leap clear',s:'speed',dc:11,w:{x:'Darts whistle harmlessly past.',fx:{}},f:{x:'A dart finds you.',fx:{hp:-3}}},{l:'Raise your shield',w:{x:'You block most of them.',fx:{hp:-1}}}]},
 {t:'Swinging Blade',i:'🪓',x:'A pendulum blade swings across the corridor, scything back and forth.',c:[{l:'Time it and run',s:'speed',dc:12,w:{x:'Perfect timing!',fx:{gold:6}},f:{x:'It nicks you on the way through.',fx:{hp:-3}}},{l:'Study the rhythm',s:'wits',dc:9,w:{x:'You walk through safely.',fx:{}},f:{x:'You miscount.',fx:{hp:-2,torch:-1}}}]},
 {t:'Poison Gas',i:'☁️',x:'A green hiss fills the corridor. Your eyes water.',c:[{l:'Hold your breath and run',s:'power',dc:10,w:{x:'You burst out gasping but fine.',fx:{}},f:{x:'You inhale a lungful.',fx:{hp:-4}}},{l:'Cover your face with cloth',w:{x:'You get through, a bit woozy.',fx:{hp:-2}}}]}
];

/* ------------------------------ map ------------------------------ */
function genMap(seed){
  var r=mulberry(seed), cols=[];
  for(var c=0;c<COLS;c++){ var n=c===0||c===COLS-1?1:3, nodes=[]; for(var j=0;j<n;j++){ nodes.push({id:c+'-'+j,c:c,j:j,type:'event',next:[],prev:[],vis:false,x:0,y:0}); } cols.push(nodes); }
  cols[0][0].type='start'; cols[COLS-1][0].type='boss';
  var rows=[150,281,412];
  cols.forEach(function(ns,c){ ns.forEach(function(n){ n.x=Math.round(90+c*(820/(COLS-1))+(c>0&&c<COLS-1?(r()-.5)*30:0)); n.y=ns.length===1?281:Math.round(rows[n.j]+(r()-.5)*40); }); });
  for(var c2=1;c2<COLS-1;c2++){ cols[c2].forEach(function(n){ var t=r();
    n.type=t<.34?'monster':t<.60?'event':t<.70?'treasure':t<.80?'trap':t<.88?'shop':'camp'; if(c2>=3&&r()<.22) n.type='elite'; }); }
  cols[1][(r()*3)|0].type='monster'; cols[2][(r()*3)|0].type='shop'; cols[3][(r()*3)|0].type='camp'; cols[5][(r()*3)|0].type='shop'; cols[COLS-2][(r()*3)|0].type='camp'; cols[COLS-2][(r()*3)|0].type='elite'; var any=cols[COLS-2].some(function(n){ return n.type==='camp'; }); if(!any) cols[COLS-2][0].type='camp';
  function link(a,b){ if(a.next.indexOf(b)<0){ a.next.push(b); b.prev.push(a); } }
  for(var c3=0;c3<COLS-1;c3++){ var A=cols[c3], B=cols[c3+1]; if(A.length===1){ B.forEach(function(b){ link(A[0],b); }); } else if(B.length===1){ A.forEach(function(a){ link(a,B[0]); }); } else { A.forEach(function(a){ link(a,B[a.j]); if(r()<.55&&a.j>0) link(a,B[a.j-1]); if(r()<.55&&a.j<2) link(a,B[a.j+1]); }); B.forEach(function(b){ if(!b.prev.length) link(A[b.j],b); }); } }
  return cols;
}

/* ------------------------------ state ------------------------------ */
window.arcadeExpeditionStart=function(){
  var s=arcadeCharacterStats(), seed=(Math.random()*1e9)|0, map=genMap(seed);
  var maxHp=10+s.vitality*2;
  var g={seed:seed,map:map,cur:map[0][0],s:s,hp:maxHp,maxHp:maxHp,torch:12,maxTorch:12,gold:10,relics:[],items:['potion'],mods:{power:Math.round(s.power),speed:Math.round(s.speed),luck:Math.round(s.luck),wits:Math.max(0,Math.floor((s.focus||100)/50))},
    dmg:3+Math.round(s.power),phase:'ready',busy:false,steps:0,kills:0,col:0,log:[],time:0,tok:{x:map[0][0].x,y:map[0][0].y},hover:null,parts:[],texts:[],shake:0,flash:0,enc:null,score:0,nextRelic:null,wasStart:true};
  map[0][0].vis=true; state.games={active:'expedition',keys:{},ex:g};
};
window.arcadeExpeditionChoose=function(){};
window.arcadeExpeditionHtml=function(){
  var g=state.games.ex; if(!g) return ''; setTimeout(mount,0); var ep=arcadeGameProgress().expedition||{};
  var stats='<span class="arcade-pill">🏆 Best <b>'+(ep.best||0)+'</b></span><span class="arcade-pill">🏁 Clears <b>'+(ep.clears||0)+'</b></span><span class="arcade-pill">🗺 Deepest <b>'+(ep.bestDepth||0)+'/'+COLS+'</b></span>';
  return arcadeFrame('Expedition Dash','Click a glowing room to advance · roll d20 + stat vs a difficulty · keep your torch lit · F fullscreen',stats,
    '<div class="gx-wrap ex-wrap" id="ex-wrap"><canvas id="ex-canvas" width="1000" height="562"></canvas><div class="gx-ov ex-ov" id="ex-ov"></div>'+
    '<div class="gx-tools"><button class="gx-mute" id="ex-mute" type="button" aria-label="Toggle sound">'+(muted()?'🔇':'🔊')+'</button><button class="gx-mute" id="ex-fs" type="button" aria-label="Fullscreen" title="Fullscreen (F)">⛶</button></div>'+
    '<div class="sh-bar" id="ex-bar"></div></div>');
};

/* ------------------------------ mount / input ------------------------------ */
var loopId=0;
function mount(){
  var g=state.games&&state.games.ex, cv=$('ex-canvas'); if(!g||!cv||state.games.active!=='expedition') return;
  g.cv=cv; g.ctx=cv.getContext('2d'); g.ov=$('ex-ov'); g.wrap=$('ex-wrap'); g.sp=playerSprite(); wire(g); fit(g); showOv(g); bar(g); cancelAnimationFrame(loopId); g.last=performance.now();
  (function frame(t){ var cur=state.games&&state.games.ex; if(cur!==g||!document.body.contains(cv)||state.games.active!=='expedition') return; var dt=Math.min(.05,(t-g.last)/1000); g.last=t; try{ update(g,dt); draw(g); }catch(e){ console.error(e); } loopId=requestAnimationFrame(frame); })(g.last);
}
function isFS(){ var st=$('games-stage'); return !!st&&(document.fullscreenElement===st||document.webkitFullscreenElement===st); }
function fit(g){
  var wrap=g.wrap; if(!wrap) return; var fs=isFS(), cssW=fs?window.innerWidth:wrap.clientWidth; if(!cssW) return; var cssH=fs?window.innerHeight:Math.round(cssW*LH/LW), dpr=Math.min(window.devicePixelRatio||1,1.5);
  g.cv.width=Math.round(cssW*dpr); g.cv.height=Math.round(cssH*dpr); g.cv.style.width=cssW+'px'; g.cv.style.height=cssH+'px'; g.dpr=dpr; g.fs=fs;
  if(fs){ g.sc=Math.min(cssW/LW,(cssH-84)/LH); g.ox=(cssW-LW*g.sc)/2; g.oy=Math.max(0,(cssH-84-LH*g.sc)/2); } else { g.sc=cssW/LW; g.ox=0; g.oy=0; }
  var b=$('ex-fs'); if(b) b.textContent=fs?'🗗':'⛶';
}
function toggleFS(){ var w=$('games-stage'); if(!w) return; try{ if(isFS()) (document.exitFullscreen||document.webkitExitFullscreen).call(document); else (w.requestFullscreen||w.webkitRequestFullscreen).call(w); }catch(e){} }
function nodeAt(g,e){ var r=g.cv.getBoundingClientRect(), lx=(e.clientX-r.left-g.ox)/g.sc, ly=(e.clientY-r.top-g.oy)/g.sc, best=null, bd=34; g.map.forEach(function(ns){ ns.forEach(function(n){ var d=Math.hypot(n.x-lx,n.y-ly); if(d<bd){ bd=d; best=n; } }); }); return best; }
function wire(g){
  var wrap=g.wrap; if(!wrap||wrap.__ex===g) return; wrap.__ex=g;
  g.cv.addEventListener('mousemove',function(e){ g.hover=nodeAt(g,e); g.cv.style.cursor=g.hover&&reachable(g,g.hover)?'pointer':'default'; });
  g.cv.addEventListener('mouseleave',function(){ g.hover=null; });
  g.cv.addEventListener('click',function(e){ var n=nodeAt(g,e); if(n) travel(g,n); });
  wrap.addEventListener('click',function(e){ var t=e.target; if(!t.closest) return;
    if(t.closest('#ex-fs,[data-ex-fs]')){ toggleFS(); return; }
    if(t.closest('#ex-mute')){ try{ localStorage.setItem('gx-mute',muted()?'0':'1'); }catch(er){} $('ex-mute').textContent=muted()?'🔇':'🔊'; return; }
    var x=t.closest('[data-ex]'); if(!x) return; handle(g,x.getAttribute('data-ex'),x.getAttribute('data-v'),x); });
  if(window.ResizeObserver){ new ResizeObserver(function(){ fit(g); }).observe(wrap); }
  g.api={travel:function(c,j){ return travel(g,g.map[c][j]); },handle:function(a,v){ return handle(g,a,v); }};
}
function onFS(){ var g=state.games&&state.games.ex; if(g) setTimeout(function(){ fit(g); },60); }
document.addEventListener('fullscreenchange',onFS); document.addEventListener('webkitfullscreenchange',onFS);
document.addEventListener('keydown',function(e){
  var gm=state.games; if(state.view!=='games'||!gm||gm.active!=='expedition'||!gm.ex) return; var g=gm.ex, k=e.key.toLowerCase();
  if(k==='f'){ toggleFS(); return; }
  if(g.phase==='ready'&&(k==='enter'||k===' ')){ handle(g,'start'); return; }
  if(g.enc&&'123456'.indexOf(k)>=0&&k!==''){ var btn=g.ov&&g.ov.querySelector('[data-key="'+k+'"]'); if(btn) btn.click(); }
},true);
function handle(g,a,v){
  if(g.busy&&a!=='noop') return;
  if(a==='start'){ g.phase='map'; showOv(g); bar(g); return; }
  if(a==='choice') return choose(g,+v);
  if(a==='act') return combatAct(g,v);
  if(a==='item') return useItem(g,v);
  if(a==='camp') return camp(g,v);
  if(a==='buy') return buy(g,v);
  if(a==='leave'){ closeEnc(g); return; }
  if(a==='continue'){ closeEnc(g); return; }
}
function reachable(g,n){ return g.phase==='map'&&!g.busy&&!g.enc&&g.cur.next.indexOf(n)>=0; }

/* ------------------------------ helpers ------------------------------ */
function addLog(g,t){ g.log.unshift(t); if(g.log.length>5) g.log.pop(); }
function floatText(g,x,y,t,c){ g.texts.push({x:x,y:y,t:t,c:c,l:1.2}); }
function parts(g,x,y,n,col,sp){ for(var i=0;i<n;i++){ var a=Math.random()*TAU, v=sp*(.3+Math.random()*.7); g.parts.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l:.5+Math.random()*.4,m:.9,c:col,r:2+Math.random()*3}); } }
function hasR(g,id){ return g.relics.indexOf(id)>=0; }
function modOf(g,stat){ return (g.mods[stat]||0)+(hasR(g,'coin')?1:0); }
function chance(g,stat,dc){ return clamp((21-(dc-modOf(g,stat)))/20,.05,.95); }
function dmgOut(g){ return g.dmg+(hasR(g,'banner')?2:0); }
function giveRelic(g){ var pool=Object.keys(RELICS).filter(function(k){ return !hasR(g,k); }); if(!pool.length) return null; var k=pool[(Math.random()*pool.length)|0]; g.relics.push(k); if(k==='skin'){ g.maxHp+=4; g.hp+=4; } if(k==='ember'){ g.torch=Math.min(g.maxTorch+3,g.torch+3); } return k; }
function fxSummary(g,fx){
  var out=[]; if(fx.hp){ g.hp=clamp(g.hp+fx.hp,0,g.maxHp); out.push((fx.hp>0?'+':'')+fx.hp+' ❤️'); parts(g,g.tok.x,g.tok.y,10,fx.hp>0?'#7dffa8':'#ff6a7a',150); g.flash=fx.hp<0?.25:0; }
  if(fx.maxHp){ g.maxHp+=fx.maxHp; out.push('+'+fx.maxHp+' max ❤️'); }
  if(fx.gold){ g.gold=Math.max(0,g.gold+fx.gold); out.push((fx.gold>0?'+':'')+fx.gold+' 🪙'); if(fx.gold>0) sfx('coin'); }
  if(fx.torch){ g.torch=clamp(g.torch+fx.torch,0,g.maxTorch+3); out.push((fx.torch>0?'+':'')+fx.torch+' 🕯️'); }
  if(fx.wits){ g.mods.wits+=fx.wits; out.push('+'+fx.wits+' Wits'); }
  if(fx.relic){ var k=giveRelic(g); if(k) out.push(RELICS[k].icon+' '+RELICS[k].name+'!'); else { g.gold+=15; out.push('+15 🪙'); } }
  if(fx.item){ if(g.items.length<3){ g.items.push(fx.item); out.push(ITEMS[fx.item].icon+' '+ITEMS[fx.item].name); } else { g.gold+=6; out.push('pack full · +6 🪙'); } }
  return out;
}
function dead(g){ if(g.hp<=0&&g.phase!=='over'&&g.phase!=='win'){ finish(g,false); return true; } return false; }

/* ------------------------------ travel / encounters ------------------------------ */
async function travel(g,n){
  if(!reachable(g,n)) return; g.busy=true; g.phase='move'; sfx('step');
  var from=g.cur; var t0=0; await new Promise(function(res){ var iv=setInterval(function(){ t0+=.06; var k=clamp(t0/.5,0,1), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2; g.tok.x=from.x+(n.x-from.x)*e; g.tok.y=from.y+(n.y-from.y)*e; if(k>=1){ clearInterval(iv); res(); } },30); });
  g.cur=n; n.vis=true; g.col=n.c; g.steps++;
  var free=hasR(g,'ember')&&g.steps%3===0; if(!free){ if(g.torch>0) g.torch--; else { g.hp-=1; floatText(g,n.x,n.y-30,'-1 ❤️ darkness','#ff6a7a'); g.flash=.3; } }
  addLog(g,'Moved to '+NT[n.type].name+'.'); g.busy=false; g.phase='map'; if(dead(g)) return; enter(g,n);
}
function enter(g,n){
  var T=n.type;
  if(T==='monster'||T==='elite'||T==='boss'){ var m=pickMon(g,T); startCombat(g,m); return; }
  if(T==='event'){ var ev=EVENTS[(Math.random()*EVENTS.length)|0]; openEvent(g,ev); return; }
  if(T==='trap'){ openEvent(g,TRAPS[(Math.random()*TRAPS.length)|0]); return; }
  if(T==='treasure'){ openTreasure(g); return; }
  if(T==='camp'){ openCamp(g); return; }
  if(T==='shop'){ openShop(g); return; }
  bar(g);
}
function pickMon(g,type){
  var c=g.cur.c, tier=c<=2?0:c<=4?1:2;
  var base=type==='boss'?BOSS:type==='elite'?ELITE[(Math.random()*ELITE.length)|0]:MON[tier][(Math.random()*3)|0], sc=1+.06*c;
  return {n:base.n,i:base.i,hp:Math.round(base.hp*(type==='boss'?1:sc)),max:Math.round(base.hp*(type==='boss'?1:sc)),atk:base.atk+(type==='boss'?0:Math.floor(c/3)),type:type,boss:!!base.boss,intent:null,guard:false};
}
function mimic(g){ return {n:'Mimic',i:'👾',hp:16,max:16,atk:5,type:'monster',intent:null}; }
function ogre(g){ return {n:'Ogre',i:'👹',hp:20,max:20,atk:5,type:'monster',intent:null}; }
function openEvent(g,ev){ g.enc={kind:'event',ev:ev,res:null}; showOv(g); bar(g); }
function choose(g,i){
  var e=g.enc; if(!e||e.kind!=='event'||e.res) return; var c=e.ev.c[i]; if(!c) return;
  if(c.need){ if(c.need.gold&&g.gold<c.need.gold) return; if(c.need.torch&&g.torch<c.need.torch) return; }
  if(!c.s){ resolveChoice(g,c,c.w,true,null); return; }
  var dc=c.dc, mod=modOf(g,c.s); g.busy=true; rollDice(g,mod,dc,function(res){ var ok=res.total>=dc||res.nat===20; if(res.nat===1) ok=false; g.busy=false; resolveChoice(g,c,ok?c.w:c.f,ok,res); });
}
function rollDice(g,mod,dc,cb){
  var res={nat:1+((Math.random()*20)|0),mod:mod,dc:dc}; res.total=res.nat+mod; var n=0, el=null;
  e_dice(g,{nat:'?',mod:mod,dc:dc,rolling:true}); var iv=setInterval(function(){ n++; sfx('roll'); e_dice(g,{nat:1+((Math.random()*20)|0),mod:mod,dc:dc,rolling:true}); if(n>=9){ clearInterval(iv); e_dice(g,{nat:res.nat,mod:mod,dc:dc,done:true,total:res.total}); setTimeout(function(){ cb(res); },650); } },70);
}
function e_dice(g,d){ g.dice=d; var el=g.ov&&g.ov.querySelector('#ex-dice'); if(!el){ var host=g.ov&&g.ov.querySelector('.ex-card'); if(host){ var dv=document.createElement('div'); dv.id='ex-dice'; dv.className='ex-dice'; host.appendChild(dv); el=dv; } } if(el) el.innerHTML=diceHtml(d); }
function diceHtml(d){ var ok=d.done&&(d.total>=d.dc||d.nat===20)&&d.nat!==1; return '<div class="ex-d20 '+(d.done?(ok?'ok':'bad'):'roll')+'">'+d.nat+'</div><div class="ex-dtxt">'+(d.done?(d.nat===20?'Natural 20! ':d.nat===1?'Critical fumble! ':'')+d.nat+(d.mod>=0?' + ':' − ')+Math.abs(d.mod)+' = <b>'+d.total+'</b> vs DC '+d.dc+' — <b>'+(ok?'SUCCESS':'FAILURE')+'</b>':'Rolling… d20 '+(d.mod>=0?'+':'−')+Math.abs(d.mod)+' vs DC '+d.dc)+'</div>'; }
function resolveChoice(g,c,out,ok,res){
  var e=g.enc; var fx=Object.assign({},out.fx||{}), combat=fx.combat, pre=fx.pre; delete fx.combat; delete fx.pre;
  var sum=fxSummary(g,fx); sfx(ok?'good':'bad'); addLog(g,out.x);
  e.res={text:out.x,sum:sum,ok:ok,combat:combat,pre:pre}; if(dead(g)) return;
  showOv(g); bar(g);
  if(res) { var d=g.dice; var el=g.ov.querySelector('.ex-card'); if(el&&d){ var dv=document.createElement('div'); dv.id='ex-dice'; dv.className='ex-dice'; dv.innerHTML=diceHtml(d); el.insertBefore(dv,el.querySelector('.ex-outcome')); } }
}
function closeEnc(g){
  var e=g.enc; g.enc=null; g.dice=null; if(dead(g)) return;
  if(e&&e.res&&e.res.combat){ var m=e.res.combat==='mimic'?mimic(g):ogre(g); if(e.res.pre) m.hp=Math.max(1,m.hp-e.res.pre); startCombat(g,m,true); return; }
  if(g.cur.type==='boss'&&e&&e.kind==='combat'&&e.won){ finish(g,true); return; }
  showOv(g); bar(g);
}
function openTreasure(g){
  var gold=10+((Math.random()*14)|0)+g.cur.c*2; var fx={gold:gold}; var roll=Math.random(); if(roll<.4) fx.item=['potion','torch','bomb','smoke'][(Math.random()*4)|0]; if(roll>.9) fx.relic=1;
  var sum=fxSummary(g,fx); sfx('coin'); addLog(g,'Opened a treasure chest.'); g.enc={kind:'treasure',res:{text:'You pry the chest open. Glittering loot spills out!',sum:sum,ok:true}}; showOv(g); bar(g);
}
function openCamp(g){ g.enc={kind:'camp'}; showOv(g); bar(g); }
function camp(g,v){
  var sum=[], txt=''; if(v==='rest'){ var h=Math.max(3,Math.round(g.maxHp*.4)); g.hp=Math.min(g.maxHp,g.hp+h); sum.push('+'+h+' ❤️'); txt='You rest by the fire and dream of treasure.'; sfx('heal'); }
  else if(v==='sharpen'){ g.dmg+=1; sum.push('+1 attack'); txt='You hone your weapon on a whetstone.'; sfx('good'); }
  else { g.torch=Math.min(g.maxTorch+3,g.torch+5); sum.push('+5 🕯️'); txt='You refuel your torch from the campfire.'; sfx('good'); }
  g.enc={kind:'camp',res:{text:txt,sum:sum,ok:true}}; addLog(g,txt); showOv(g); bar(g);
}
function priceOf(g,p){ return Math.round(p*(hasR(g,'seal')?.75:1)); }
var STOCK=[['potion',15],['torch',10],['bomb',20],['smoke',14],['heal',22],['relic',45]];
function openShop(g){ g.enc={kind:'shop'}; showOv(g); bar(g); }
function buy(g,k){
  var row=STOCK.find(function(r){ return r[0]===k; }); if(!row) return; var cost=priceOf(g,row[1]); if(g.gold<cost) return;
  if(k==='heal'){ if(g.hp>=g.maxHp) return; g.hp=Math.min(g.maxHp,g.hp+Math.round(g.maxHp*.5)); }
  else if(k==='relic'){ var r=giveRelic(g); if(!r) return; }
  else { if(g.items.length>=3) return; g.items.push(k); }
  g.gold-=cost; sfx('coin'); showOv(g); bar(g);
}

/* ------------------------------ combat ------------------------------ */
function startCombat(g,m,fromEvent){
  m.intent=pickIntent(g,m); g.enc={kind:'combat',m:m,log:['A '+m.n+' blocks your path!'],won:false,turn:1}; if(m.boss) sfx('boss'); showOv(g); bar(g);
}
function pickIntent(g,m){ var r=Math.random(); if(m.boss&&m.hp<=m.max/2) return r<.5?'heavy':'attack'; return r<.58?'attack':r<.8?'heavy':'defend'; }
async function combatAct(g,act){
  var e=g.enc; if(!e||e.kind!=='combat'||e.won||g.busy) return; var m=e.m; g.busy=true; var msgs=[], pdmg=0, guardMode=false;
  var el=g.ov.querySelector('.ex-fight');
  async function roll(stat,dc){ var mod=modOf(g,stat); var res={nat:1+((Math.random()*20)|0)}; res.total=res.nat+mod; res.ok=res.nat===20||(res.nat!==1&&res.total>=dc); res.crit=res.nat===20; return res; }
  if(act==='strike'){ var r=await roll('power',9); if(r.ok){ pdmg=dmgOut(g)*(r.crit?2:1); msgs.push('🎲'+r.nat+' — you strike for '+pdmg+(r.crit?' (CRIT!)':'')+'.'); } else msgs.push('🎲'+r.nat+' — your attack misses.'); }
  else if(act==='guard'){ guardMode=true; var r2=await roll('speed',12); if(r2.ok){ pdmg=Math.ceil(dmgOut(g)/2); msgs.push('🎲'+r2.nat+' — you brace and counter for '+pdmg+'.'); } else msgs.push('🎲'+r2.nat+' — you brace for impact.'); }
  else if(act==='gambit'){ var r3=await roll('luck',14); if(r3.ok){ pdmg=Math.round(dmgOut(g)*2.3); msgs.push('🎲'+r3.nat+' — GAMBIT! A devastating '+pdmg+' damage!'); } else { msgs.push('🎲'+r3.nat+' — the gambit backfires!'); g.hp-=2; floatText(g,g.tok.x,g.tok.y-30,'-2','#ff6a7a'); } }
  if(pdmg){ if(m.intent==='defend'&&act!=='gambit') pdmg=Math.ceil(pdmg/2); m.hp=Math.max(0,m.hp-pdmg); if(hasR(g,'fang')&&g.hp<g.maxHp) g.hp++; sfx('hit'); flashEl(el,'.ex-enemy'); }
  e.log=msgs.slice(); updFight(g);
  await sleep(550);
  if(m.hp<=0){ return winCombat(g); }
  /* enemy turn */
  var intent=m.intent, dmg=0, hit=true;
  if(intent==='attack'){ dmg=m.atk+(Math.random()<.5?1:0); }
  else if(intent==='heavy'){ dmg=Math.round(m.atk*1.7); hit=Math.random()<.6; }
  if(intent==='defend'){ e.log.push(m.n+' raises its guard.'); }
  else if(!hit){ e.log.push(m.n+' swings wildly and misses!'); }
  else { if(guardMode) dmg=Math.ceil(dmg*.3); if(hasR(g,'boots')) dmg=Math.max(0,dmg-1); dmg=Math.max(0,dmg); g.hp-=dmg; e.log.push(m.n+(intent==='heavy'?' smashes you':' hits you')+' for '+dmg+'.'); sfx('hit'); g.flash=.3; g.shake=.25; flashEl(el,'.ex-player'); }
  e.turn++; if(g.hp<=0){ updFight(g); g.busy=false; dead(g); return; }
  m.intent=pickIntent(g,m); updFight(g); g.busy=false; bar(g);
}
function flashEl(root,sel){ if(!root) return; var x=root.querySelector(sel); if(!x) return; x.classList.remove('hit'); void x.offsetWidth; x.classList.add('hit'); }
function winCombat(g){
  var e=g.enc, m=e.m; e.won=true; g.kills++; var loot=m.boss?60:m.type==='elite'?30+((Math.random()*10)|0):8+((Math.random()*8)|0)+g.cur.c; var fx={gold:loot}; if(m.type==='elite') fx.relic=1; else if(Math.random()<.3) fx.item=['potion','torch','bomb'][(Math.random()*3)|0];
  var sum=fxSummary(g,fx); sfx('win'); addLog(g,'Defeated '+m.n+'.'); e.log.push(m.n+' is defeated!'); e.res={text:m.boss?'The Warden crumbles — the treasure vault lies open!':'Victory!',sum:sum,ok:true}; g.busy=false; showOv(g); bar(g);
}
function useItem(g,k){
  var idx=g.items.indexOf(k); if(idx<0||g.busy) return; var e=g.enc, inFight=e&&e.kind==='combat'&&!e.won;
  if(k==='potion'){ if(g.hp>=g.maxHp) return; g.hp=Math.min(g.maxHp,g.hp+8); floatText(g,g.tok.x,g.tok.y-30,'+8','#7dffa8'); sfx('heal'); }
  else if(k==='torch'){ g.torch=Math.min(g.maxTorch+3,g.torch+4); sfx('good'); }
  else if(k==='bomb'){ if(!inFight) return; var m=e.m; m.hp=Math.max(0,m.hp-8); e.log=['💣 The bomb deals 8 damage!']; sfx('hit'); g.items.splice(idx,1); updFight(g); if(m.hp<=0) winCombat(g); bar(g); return; }
  else if(k==='smoke'){ if(!inFight) return; g.items.splice(idx,1); addLog(g,'Escaped in a puff of smoke.'); g.enc=null; sfx('good'); showOv(g); bar(g); return; }
  g.items.splice(idx,1); if(g.enc&&g.enc.kind==='combat') updFight(g); bar(g);
}
function finish(g,win){
  if(g.phase==='over'||g.phase==='win') return; g.phase=win?'win':'over'; g.enc=null; sfx(win?'win':'lose');
  var depth=g.cur.c+(win?1:0); g.score=g.gold+depth*20+g.relics.length*15+g.kills*5+(win?150:0)+Math.max(0,g.hp)*2; var gp=arcadeGameProgress(); gp.expedition=gp.expedition||{}; var s=gp.expedition;
  g.newBest=g.score>(Number(s.best)||0); s.best=Math.max(Number(s.best)||0,g.score); s.runs=(Number(s.runs)||0)+1; s.clears=(Number(s.clears)||0)+(win?1:0); s.bestDepth=Math.max(Number(s.bestDepth)||0,depth); s.kills=(Number(s.kills)||0)+g.kills;
  try{ persistProgress(); }catch(e){} if(win){ try{ celebrate(); }catch(e){} }
  setTimeout(function(){ if(state.games&&state.games.ex===g){ showOv(g); bar(g); } },win?700:900);
}

/* ------------------------------ overlays (DOM) ------------------------------ */
function chip(g,c){ var out=''; if(c.s){ var p=Math.round(chance(g,c.s,c.dc)*100); out+='<span class="ex-chip s-'+c.s+'">'+({power:'💪 Power',speed:'⚡ Speed',luck:'🍀 Luck',wits:'🧠 Wits'}[c.s])+' · '+p+'%</span>'; } if(c.need){ out+='<span class="ex-chip need">'+(c.need.gold?c.need.gold+' 🪙':'')+(c.need.torch?c.need.torch+' 🕯️':'')+'</span>'; } return out; }
function showOv(g){
  var o=g.ov; if(!o) return; var h='', e=g.enc;
  if(g.phase==='ready'){
    h='<div class="gx-card wide"><h2>🗺️ Expedition Dash</h2><p>Descend through a branching dungeon of <b>'+COLS+'</b> rooms and defeat <b>The Warden</b> in the final chamber.</p><ul class="gx-keys"><li>🎲 <b>Stat checks:</b> roll a d20 + your stat against a difficulty. Choices show your odds.</li><li>🕯️ <b>Torch:</b> every move burns it. In the dark you bleed HP — rest at 🔥 campfires.</li><li>⚔️ <b>Combat:</b> enemies telegraph their next move — Guard vs heavy hits, Strike when they defend not.</li><li>💰 Shops, relics and consumables help. <kbd>F</kbd> fullscreen · <kbd>1–3</kbd> pick a choice</li></ul><p class="gx-stats">❤️ '+g.maxHp+' · 💪 '+g.mods.power+' · ⚡ '+g.mods.speed+' · 🍀 '+g.mods.luck+' · 🧠 '+g.mods.wits+'</p><div class="gx-endbtns"><button class="btn btn-primary btn-lg" data-ex="start">Enter the dungeon</button><button class="btn btn-ghost" data-ex-fs type="button">⛶ Fullscreen</button></div></div>';
  } else if(g.phase==='win'||g.phase==='over'){
    var ep=arcadeGameProgress().expedition||{};
    h='<div class="gx-card wide"><h2>'+(g.phase==='win'?'🏆 Dungeon conquered!':'💀 Your expedition ends')+'</h2><div class="gx-res"><div><b>'+g.score+'</b><span>Score</span></div><div><b>'+(g.cur.c+(g.phase==='win'?1:0))+'/'+COLS+'</b><span>Depth</span></div><div><b>'+g.kills+'</b><span>Foes slain</span></div><div><b>'+g.gold+'🪙</b><span>Gold</span></div></div>'+(g.newBest?'<p class="gx-newbest">⭐ New personal best!</p>':'<p class="gx-fine">Personal best: '+(ep.best||0)+'</p>')+'<div class="ex-relics">'+g.relics.map(function(k){ return '<span title="'+RELICS[k].name+' — '+RELICS[k].d+'">'+RELICS[k].icon+'</span>'; }).join('')+'</div><div class="gx-endbtns"><button class="btn btn-primary btn-lg" data-action="arcade-exp-replay">New expedition</button><button class="btn btn-ghost" data-action="arcade-hub">← All games</button></div></div>';
  } else if(e){
    if(e.kind==='event'){
      h='<div class="gx-card wide ex-card"><div class="ex-icon">'+e.ev.i+'</div><h2>'+esc2(e.ev.t)+'</h2><p>'+esc2(e.ev.x)+'</p>'+(e.res?outcome(g,e.res):'<div class="ex-choices">'+e.ev.c.map(function(c,i){ var dis=c.need&&((c.need.gold&&g.gold<c.need.gold)||(c.need.torch&&g.torch<c.need.torch)); return '<button type="button" class="ex-choice" data-ex="choice" data-v="'+i+'" data-key="'+(i+1)+'" '+(dis?'disabled':'')+'><kbd>'+(i+1)+'</kbd><span>'+esc2(c.l)+'</span>'+chip(g,c)+'</button>'; }).join('')+'</div>')+'</div>';
    } else if(e.kind==='treasure'){ h='<div class="gx-card ex-card"><div class="ex-icon">💰</div><h2>Treasure Room</h2>'+outcome(g,e.res)+'</div>'; }
    else if(e.kind==='camp'){ h='<div class="gx-card wide ex-card"><div class="ex-icon">🔥</div><h2>Campfire</h2>'+(e.res?outcome(g,e.res):'<p>A crackling fire in the dark. Safe, for a moment. Choose one:</p><div class="ex-choices"><button type="button" class="ex-choice" data-ex="camp" data-v="rest" data-key="1"><kbd>1</kbd><span>Rest</span><span class="ex-chip">+'+Math.max(3,Math.round(g.maxHp*.4))+' ❤️</span></button><button type="button" class="ex-choice" data-ex="camp" data-v="sharpen" data-key="2"><kbd>2</kbd><span>Sharpen weapon</span><span class="ex-chip">+1 attack</span></button><button type="button" class="ex-choice" data-ex="camp" data-v="torch" data-key="3"><kbd>3</kbd><span>Refuel torch</span><span class="ex-chip">+5 🕯️</span></button></div>')+'</div>'; }
    else if(e.kind==='shop'){ h='<div class="gx-card wide ex-card"><div class="ex-icon">🛒</div><h2>Wandering Merchant</h2><p>"Fresh from the surface! Everything priced to move." <b>'+g.gold+' 🪙</b></p><div class="ex-shop">'+STOCK.map(function(r){ var k=r[0], cost=priceOf(g,r[1]), name,desc,icon; if(k==='heal'){ name='Healing Salve'; desc='Heal 50% of max HP'; icon='💖'; } else if(k==='relic'){ name='Mystery Relic'; desc='A random relic'; icon='🎁'; } else { name=ITEMS[k].name; desc=ITEMS[k].d; icon=ITEMS[k].icon; } var dis=g.gold<cost||(k==='heal'&&g.hp>=g.maxHp)||(k!=='heal'&&k!=='relic'&&g.items.length>=3)||(k==='relic'&&g.relics.length>=Object.keys(RELICS).length); return '<button type="button" class="ex-item" data-ex="buy" data-v="'+k+'" '+(dis?'disabled':'')+'><span class="ex-ii">'+icon+'</span><b>'+name+'</b><small>'+desc+'</small><em>'+cost+' 🪙</em></button>'; }).join('')+'</div><div class="gx-endbtns"><button class="btn btn-primary" data-ex="leave">Leave shop</button></div></div>'; }
    else if(e.kind==='combat'){ h=fightHtml(g); }
  }
  o.innerHTML=h; o.style.display=h?'flex':'none'; o.classList.toggle('clear',!h);
}
function outcome(g,r){ return '<div class="ex-outcome '+(r.ok?'good':'bad')+'"><p>'+esc2(r.text)+'</p><div class="ex-sum">'+r.sum.map(function(s){ return '<span>'+s+'</span>'; }).join('')+'</div><button class="btn btn-primary" data-ex="continue">Continue ▸</button></div>'; }
function fightHtml(g){
  var e=g.enc, m=e.m, ic={attack:'⚔️ Attack',heavy:'💥 Heavy blow',defend:'🛡️ Defending'}[m.intent]||'';
  return '<div class="gx-card wide ex-card ex-fight"><div class="ex-fields"><div class="ex-fighter ex-player"><div class="ex-port" id="ex-port"></div><b>You</b><div class="ex-hp"><i style="width:'+(clamp(g.hp/g.maxHp,0,1)*100)+'%"></i></div><small>'+Math.max(0,g.hp)+' / '+g.maxHp+' ❤️</small></div><div class="ex-vs">VS</div><div class="ex-fighter ex-enemy"><div class="ex-em">'+m.i+'</div><b>'+esc2(m.n)+'</b><div class="ex-hp en"><i style="width:'+(clamp(m.hp/m.max,0,1)*100)+'%"></i></div><small>'+Math.max(0,m.hp)+' / '+m.max+'</small>'+(e.won?'':'<div class="ex-intent '+m.intent+'">Next: '+ic+'</div>')+'</div></div>'+
    '<div class="ex-flog">'+e.log.map(function(l){ return '<div>'+esc2(l)+'</div>'; }).join('')+'</div>'+
    (e.won?outcome(g,e.res):'<div class="ex-acts"><button type="button" class="ex-act" data-ex="act" data-v="strike" data-key="1"><kbd>1</kbd><b>⚔️ Strike</b><small>💪 Power · '+Math.round(chance(g,'power',9)*100)+'% · '+dmgOut(g)+' dmg</small></button><button type="button" class="ex-act" data-ex="act" data-v="guard" data-key="2"><kbd>2</kbd><b>🛡️ Guard</b><small>⚡ Speed · −70% damage, counter</small></button><button type="button" class="ex-act" data-ex="act" data-v="gambit" data-key="3"><kbd>3</kbd><b>🎲 Gambit</b><small>🍀 Luck · '+Math.round(chance(g,'luck',14)*100)+'% · 2.3× dmg</small></button></div>')+'</div>';
}
function updFight(g){ if(!g.ov) return; var e=g.enc; if(!e||e.kind!=='combat'){ return; } var keepLog=e.log; showOv(g); fillPort(g); }
function fillPort(g){ var p=g.ov&&g.ov.querySelector('#ex-port'); if(p){ p.style.backgroundImage=g.sp.url?'url("'+g.sp.url+'")':''; } }
function bar(g){
  var b=$('ex-bar'); if(!b) return; var h='';
  g.items.forEach(function(k){ var it=ITEMS[k], inFight=g.enc&&g.enc.kind==='combat'&&!g.enc.won, dis=(k==='bomb'||k==='smoke')&&!inFight||(k==='potion'&&g.hp>=g.maxHp)||g.busy; h+='<button type="button" class="sh-ab" data-ex="item" data-v="'+k+'" title="'+it.d+'" '+(dis?'disabled':'')+'><span class="sh-ai">'+it.icon+'</span><span class="sh-an">'+it.name+'</span></button>'; });
  for(var i=g.items.length;i<3;i++) h+='<span class="sh-ab" style="opacity:.3"><span class="sh-ai">▫️</span><span class="sh-an">Empty</span></span>';
  h+='<span class="ex-relicbar">'+g.relics.map(function(k){ return '<span title="'+RELICS[k].name+' — '+RELICS[k].d+'">'+RELICS[k].icon+'</span>'; }).join('')+'</span>'; b.innerHTML=h;
}

/* ------------------------------ draw ------------------------------ */
function update(g,dt){
  g.time+=dt; if(g.shake>0) g.shake-=dt; if(g.flash>0) g.flash-=dt;
  for(var i=g.parts.length-1;i>=0;i--){ var q=g.parts[i]; q.l-=dt; if(q.l<=0){ g.parts.splice(i,1); continue; } q.x+=q.vx*dt; q.y+=q.vy*dt; q.vy+=260*dt; }
  for(i=g.texts.length-1;i>=0;i--){ var t=g.texts[i]; t.l-=dt; t.y-=30*dt; if(t.l<=0) g.texts.splice(i,1); }
  if(g.ov&&g.enc&&g.enc.kind==='combat'&&!g.ov.__ported){ }
  var p=g.ov&&g.ov.querySelector('#ex-port'); if(p&&!p.style.backgroundImage&&g.sp.url) fillPort(g);
}
function rr(c,x,y,w,h,r){ r=Math.min(r,w/2,h/2); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function draw(g){
  var c=g.ctx; if(!c) return; var sc=g.sc*g.dpr; c.setTransform(1,0,0,1,0,0); c.fillStyle='#05030a'; c.fillRect(0,0,g.cv.width,g.cv.height); c.setTransform(sc,0,0,sc,g.ox*g.dpr,g.oy*g.dpr);
  var t=g.time, sx=g.shake>0?(Math.random()-.5)*8*g.shake:0, sy=g.shake>0?(Math.random()-.5)*8*g.shake:0;
  var bg=c.createLinearGradient(0,0,0,LH); bg.addColorStop(0,'#150d24'); bg.addColorStop(1,'#07040f'); c.fillStyle=bg; c.fillRect(0,0,LW,LH);
  c.save(); c.translate(sx,sy);
  /* cave silhouette */
  c.fillStyle='#0c0718'; for(var i=0;i<22;i++){ var x=i*50; c.beginPath(); c.moveTo(x-20,0); c.lineTo(x+25,40+((i*37)%50)); c.lineTo(x+70,0); c.fill(); c.beginPath(); c.moveTo(x-10,LH); c.lineTo(x+30,LH-30-((i*53)%40)); c.lineTo(x+80,LH); c.fill(); }
  /* edges */
  var spy=hasR(g,'glass');
  g.map.forEach(function(ns){ ns.forEach(function(n){ n.next.forEach(function(m){ var seen=n.vis||g.cur===n||spy||n.c<=g.cur.c+1; if(!seen) return; var live=g.cur===n&&g.phase==='map'&&!g.enc, trav=n.vis&&m.vis;
    c.strokeStyle=trav?'rgba(255,210,120,.65)':live?'rgba(255,230,160,.8)':'rgba(140,110,200,.3)'; c.lineWidth=trav||live?4:2.5; c.setLineDash(trav?[]:[10,8]); c.lineDashOffset=-t*20; c.beginPath(); c.moveTo(n.x,n.y); c.lineTo(m.x,m.y); c.stroke(); c.setLineDash([]); }); }); });
  /* nodes */
  g.map.forEach(function(ns){ ns.forEach(function(n){
    var known=n.vis||g.cur===n||spy||n.c<=g.cur.c+1, T=NT[n.type], reach=reachable(g,n), hov=g.hover===n, R=reach?(26+Math.sin(t*5)*2.5):22; if(hov&&reach) R+=4;
    if(reach){ var gl=c.createRadialGradient(n.x,n.y,0,n.x,n.y,60); gl.addColorStop(0,'rgba(255,220,120,.4)'); gl.addColorStop(1,'rgba(255,220,120,0)'); c.fillStyle=gl; c.fillRect(n.x-60,n.y-60,120,120); }
    c.fillStyle=n.vis?'rgba(60,45,95,.9)':known?'#241a40':'#15102a'; c.strokeStyle=n.vis?'#6a5cb0':known?(reach?'#ffd878':T.col):'#3a2f60'; c.lineWidth=reach?4:3; c.beginPath(); c.arc(n.x,n.y,R,0,TAU); c.fill(); c.stroke();
    c.textAlign='center'; c.textBaseline='middle'; c.font=(n.type==='boss'?30:22)+'px Inter,sans-serif'; c.globalAlpha=n.vis&&g.cur!==n?.45:1; c.fillText(known?T.icon:'❔',n.x,n.y+1); c.globalAlpha=1;
    if(hov&&known){ c.font='800 13px Inter,sans-serif'; c.fillStyle='#fff'; c.lineWidth=4; c.strokeStyle='rgba(0,0,0,.8)'; c.strokeText(T.name,n.x,n.y-R-12); c.fillText(T.name,n.x,n.y-R-12); }
  }); });
  /* torchlight */
  var lr=Math.max(120,60+g.torch*26), fog=c.createRadialGradient(g.tok.x,g.tok.y,lr*.25,g.tok.x,g.tok.y,lr*1.9); fog.addColorStop(0,'rgba(5,3,10,0)'); fog.addColorStop(1,'rgba(5,3,10,'+(g.torch>0?.74:.9)+')'); c.fillStyle=fog; c.fillRect(0,0,LW,LH);
  var warm=c.createRadialGradient(g.tok.x,g.tok.y,0,g.tok.x,g.tok.y,lr*.9); warm.addColorStop(0,'rgba(255,170,60,'+(.18+.04*Math.sin(t*9))+')'); warm.addColorStop(1,'rgba(255,170,60,0)'); c.fillStyle=warm; c.fillRect(g.tok.x-lr,g.tok.y-lr,lr*2,lr*2);
  /* token */
  var sp=g.sp, bob=Math.sin(t*3)*3; c.fillStyle='rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(g.tok.x,g.tok.y+20,18,6,0,0,TAU); c.fill();
  if(sp.img&&sp.img.complete&&sp.img.naturalWidth) c.drawImage(sp.img,g.tok.x-26,g.tok.y-44+bob,52,52); else { c.fillStyle=sp.col; c.beginPath(); rr(c,g.tok.x-14,g.tok.y-34,28,36,9); c.fill(); }
  g.parts.forEach(function(q){ c.globalAlpha=clamp(q.l/q.m,0,1); c.fillStyle=q.c; c.fillRect(q.x-q.r/2,q.y-q.r/2,q.r,q.r); }); c.globalAlpha=1;
  g.texts.forEach(function(x){ c.globalAlpha=clamp(x.l*2,0,1); c.textAlign='center'; c.font='900 20px Inter,sans-serif'; c.lineWidth=5; c.strokeStyle='rgba(0,0,0,.75)'; c.strokeText(x.t,x.x,x.y); c.fillStyle=x.c; c.fillText(x.t,x.x,x.y); }); c.globalAlpha=1;
  c.restore();
  if(g.flash>0){ c.fillStyle='rgba(255,40,70,'+g.flash*.5+')'; c.fillRect(0,0,LW,LH); }
  hud(g,c);
}
function hud(g,c){
  c.setTransform(g.sc*g.dpr,0,0,g.sc*g.dpr,g.ox*g.dpr,g.oy*g.dpr); c.textBaseline='alphabetic';
  function T(s,x,y,sz,col,al){ c.textAlign=al||'left'; c.font='900 '+sz+'px Inter,sans-serif'; c.lineWidth=4; c.strokeStyle='rgba(0,0,0,.75)'; c.strokeText(s,x,y); c.fillStyle=col||'#fff'; c.fillText(s,x,y); }
  c.fillStyle='rgba(0,0,0,.5)'; c.beginPath(); rr(c,10,10,260,62,12); c.fill();
  c.fillStyle='rgba(0,0,0,.6)'; c.fillRect(20,20,160,12); c.fillStyle=g.hp/g.maxHp>.3?'#6bff9a':'#ff5a6a'; c.fillRect(20,20,160*clamp(g.hp/g.maxHp,0,1),12); T('❤ '+Math.max(0,g.hp)+'/'+g.maxHp,24,31,11,'#fff');
  var fl=''; for(var i=0;i<Math.min(g.torch,15);i++) fl+='🕯'; T(g.torch>0?'🕯️ '+g.torch:'🕯️ DARK!',20,56,15,g.torch>3?'#ffd878':'#ff7a6a'); T('🪙 '+g.gold,100,56,15,'#ffe08a');
  T('⚔ '+dmgOut(g),190,56,14,'#ffb0b0');
  T('Depth '+(g.cur.c)+'/'+(COLS-1),LW-110,30,16,'#e0d0ff','right'); T('Room '+g.steps,LW-110,50,12,'#a898d8','right');
  if(g.phase==='map'&&!g.enc) T('Choose your next room — click a glowing node',LW/2,LH-16,15,'#ffe9a8','center');
  var ly=94; g.log.slice(0,4).forEach(function(l,i){ c.globalAlpha=1-i*.22; T(l,16,ly,12,'#d8ccf5'); ly+=16; }); c.globalAlpha=1;
}
})();
