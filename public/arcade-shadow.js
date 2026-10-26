/* Shadow Arena Campaign v2 — animated tactical turn-based battles on a trapped grid.
   Overrides the arcade Shadow hooks from the main script. Floor progress persists in gameProgress.shadow (floor, wins, bestFloor, kills, runs). */
(function(){
'use strict';
var COLS=8, ROWS=6, CS=70, BX=(1000-COLS*CS)/2, BY=52, LW=1000, LH=562, TAU=Math.PI*2;
var clamp=function(n,a,b){ return Math.max(a,Math.min(b,n)); };
function $(id){ return document.getElementById(id); }
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; }; }
function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
var DIRS=[[1,0],[-1,0],[0,1],[0,-1]];

/* ------------------------------ abilities ------------------------------ */
var AB=[
  {id:'strike',key:'1',icon:'💥',name:'Strike',cost:1,desc:'Hit an adjacent enemy.'},
  {id:'lunge',key:'2',icon:'💨',name:'Lunge',cost:2,desc:'Dash up to 3 tiles in a line; hits the first enemy with +1 damage.'},
  {id:'bolt',key:'3',icon:'⚡',name:'Bolt',cost:2,desc:'Shoot an enemy up to 4 tiles away in a straight line.'},
  {id:'shock',key:'4',icon:'🌀',name:'Shockwave',cost:3,desc:'Hit all adjacent enemies and knock them back. Walls and traps hurt extra.'},
  {id:'guard',key:'5',icon:'🛡️',name:'Guard',cost:1,desc:'Gain 4 shield that absorbs damage.'},
  {id:'step',key:'6',icon:'🌑',name:'Shadow Step',cost:2,desc:'Teleport up to 3 tiles. Your next attack deals +2.'}
];
var ENEMY={
  shade:{name:'Shade Clone',hp:6,dmg:2,move:2,col:'#2a1844',glow:'#c070ff'},
  archer:{name:'Dusk Archer',hp:4,dmg:2,move:2,col:'#1d2a44',glow:'#5ac8ff'},
  brute:{name:'Hollow Brute',hp:14,dmg:5,move:1,col:'#3a2218',glow:'#ff8a3a'},
  wisp:{name:'Void Wisp',hp:3,dmg:2,move:1,col:'#183a3a',glow:'#5affd0'},
  boss:{name:'Your Shadow',hp:28,dmg:3,move:2,col:'#14081e',glow:'#ff4aa0'}
};

/* ------------------------------ sprite ------------------------------ */
var spriteCache={};
function playerSprite(){
  var id='ling-sugarbug', skinId='';
  try{ id=(state.progress.equipped&&state.progress.equipped.indexling)||id; skinId=(typeof getEquippedSkinId==='function'&&getEquippedSkinId(id))||''; }catch(e){}
  var key=id+'|'+skinId; if(spriteCache.key===key&&spriteCache.img) return spriteCache;
  var img=new Image(); spriteCache={key:key,img:img,col:'#b07cff'};
  try{
    var ling=cosmeticById(id)||cosmeticById('ling-sugarbug'), sk=skinId&&typeof skinById==='function'?skinById(skinId):null;
    spriteCache.col=(sk&&sk.main)||(ling&&ling.main)||'#b07cff';
    var html=typeof indexlingArtHtml==='function'?indexlingArtHtml(ling,true,sk||{}):arcadeCharacterHtml(), m=html.match(/<svg[\s\S]*<\/svg>/);
    if(m){ var vars={}; html.replace(/(--[\w-]+)\s*:\s*([^;"]+)/g,function(_,k,v){ vars[k]=v.trim(); return _; });
      var svg=m[0].replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g,function(_,k){ return vars[k]||'#b07cff'; }).replace(/<svg\b/,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"');
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); }
  }catch(e){}
  return spriteCache;
}
function shadeSprite(g){
  var sp=g.sp; if(g.shadeImg||!sp.img||!sp.img.complete||!sp.img.naturalWidth) return g.shadeImg;
  var o=document.createElement('canvas'); o.width=o.height=128; var x=o.getContext('2d'); x.drawImage(sp.img,0,0,128,128);
  x.globalCompositeOperation='source-atop'; x.fillStyle='rgba(18,8,34,.88)'; x.fillRect(0,0,128,128);
  x.globalCompositeOperation='source-over'; g.shadeImg=o; return o;
}

/* ------------------------------ sound ------------------------------ */
var AC=null, sfxT={};
function muted(){ try{ return localStorage.getItem('gx-mute')==='1'; }catch(e){ return false; } }
function sfx(kind){
  if(muted()) return; var now=performance.now(); if(sfxT[kind]&&now-sfxT[kind]<40) return; sfxT[kind]=now;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume();
    var P={hit:[200,70,.12,'square',.08],crit:[500,140,.2,'sawtooth',.1],move:[300,380,.06,'triangle',.05],bolt:[900,200,.16,'sawtooth',.07],shock:[90,420,.3,'sawtooth',.14],guard:[400,800,.15,'sine',.09],step:[800,200,.2,'sine',.08],hurt:[160,50,.25,'sawtooth',.14],die:[260,40,.35,'square',.1],heal:[500,1000,.25,'sine',.1],win:[520,1320,.6,'triangle',.14],lose:[200,40,.6,'sawtooth',.14],turn:[440,660,.12,'triangle',.07],spike:[700,100,.12,'square',.08],warn:[300,150,.15,'square',.06]}[kind]; if(!P) return;
    var o=AC.createOscillator(), gn=AC.createGain(), t=AC.currentTime; o.type=P[3]; o.frequency.setValueAtTime(P[0],t); o.frequency.exponentialRampToValueAtTime(Math.max(30,P[1]),t+P[2]);
    gn.gain.setValueAtTime(P[4],t); gn.gain.exponentialRampToValueAtTime(.0001,t+P[2]); o.connect(gn); gn.connect(AC.destination); o.start(t); o.stop(t+P[2]+.02);
  }catch(e){}
}

/* ------------------------------ map generation ------------------------------ */
function inb(x,y){ return x>=0&&x<COLS&&y>=0&&y<ROWS; }
function genMap(f,spawnsN){
  for(var attempt=0;attempt<60;attempt++){
    var r=mulberry(f*7919+13+attempt*101), t=[]; for(var y=0;y<ROWS;y++){ t.push([]); for(var x=0;x<COLS;x++) t[y].push(0); }
    function free(x,y){ return t[y][x]===0&&!(y===ROWS-1&&x>=2&&x<=5)&&y>0&&!(y===1&&x>=2&&x<=5); }
    function place(v,n){ var tries=0; while(n>0&&tries++<200){ var x=(r()*COLS)|0, y=(r()*ROWS)|0; if(free(x,y)){ t[y][x]=v; n--; } } }
    place(1,3+Math.min(6,Math.floor(f/2))); place(2,2+Math.min(4,Math.floor(f/3))); place(3,2);
    var spawns=[], tries=0; while(spawns.length<spawnsN&&tries++<200){ var sx=(r()*COLS)|0, sy=(r()*2)|0; if(t[sy][sx]===0&&!spawns.some(function(s){ return s.x===sx&&s.y===sy; })) spawns.push({x:sx,y:sy}); }
    if(spawns.length<spawnsN) continue;
    var seen={}, q=[{x:3,y:ROWS-1}]; seen['3,'+(ROWS-1)]=1; while(q.length){ var c=q.shift(); DIRS.forEach(function(d){ var nx=c.x+d[0], ny=c.y+d[1]; if(inb(nx,ny)&&t[ny][nx]!==1&&!seen[nx+','+ny]){ seen[nx+','+ny]=1; q.push({x:nx,y:ny}); } }); }
    if(spawns.every(function(s){ return seen[s.x+','+s.y]; })) return {t:t,spawns:spawns};
  }
  var t2=[]; for(var yy=0;yy<ROWS;yy++){ t2.push([]); for(var xx=0;xx<COLS;xx++) t2[yy].push(0); } return {t:t2,spawns:[{x:3,y:0},{x:4,y:0},{x:2,y:0},{x:5,y:0}].slice(0,spawnsN)};
}
function composition(f){
  var r=mulberry(f*31+7), list=[];
  if(f%5===0){ list.push('boss'); if(f>=10) list.push('shade'); if(f>=15) list.push('archer'); return list; }
  var n=Math.min(4,1+Math.floor((f-1)/2)), pool=['shade']; if(f>=2) pool.push('archer'); if(f>=3) pool.push('brute'); if(f>=4) pool.push('wisp');
  list.push(f===1?'shade':pool[(r()*pool.length)|0]); while(list.length<n) list.push(pool[(r()*pool.length)|0]);
  if(f>=2&&list.indexOf('shade')<0&&list.length>1) list[0]='shade';
  return list;
}

/* ------------------------------ state ------------------------------ */
var uidN=0;
window.arcadeShadowStart=function(){
  var gp=arcadeGameProgress(); gp.shadow=gp.shadow||{floor:1}; var f=Math.max(1,Number(gp.shadow.floor)||1), s=arcadeCharacterStats();
  var comp=composition(f), map=genMap(f,comp.length);
  var vet=Math.floor(f/4);
  var g={floor:f,t:map.t,phase:'ready',turn:1,busy:false,sel:'move',s:s,
    maxHp:10+s.vitality*2+Math.floor(f/3)*2, energyMax:3+(s.speed>=3?1:0), power:2+Math.max(0,Math.round(s.power))-1+vet, crit:.08+(s.luck||0)*.03,
    shield:0,empower:0,kills:0,log:[],fx:[],texts:[],parts:[],shake:0,flash:0,hover:null,time:0,banner:'',bannerT:0,dmgTaken:0,
    cdBar:'',enemies:[]};
  g.hp=g.maxHp; g.energy=g.energyMax;
  g.p={id:'p',type:'p',x:3,y:ROWS-1,vx:3,vy:ROWS-1,hp:g.hp,flash:0,bump:null};
  comp.forEach(function(type,i){ var D=ENEMY[type], sc=1+.09*(f-1), sp=map.spawns[i];
    var hp=Math.round(D.hp*sc*(type==='boss'?1+f*.04:1)); g.enemies.push({id:'e'+(++uidN),type:type,x:sp.x,y:sp.y,vx:sp.x,vy:sp.y,hp:hp,max:hp,dmg:D.dmg+Math.floor(f/4),mark:null,cd:0,age:0,flash:0,bump:null,dead:false,fade:0,spawn:1}); });
  state.games={active:'shadow',keys:{},sh:g};
  log(g,'Floor '+f+' — '+comp.length+' enemy'+(comp.length>1?'ies':'')+' ahead.');
};
function log(g,t){ g.log.unshift(t); if(g.log.length>6) g.log.pop(); }
window.arcadeShadowMove=function(){}; window.arcadeShadowAttack=function(){};
window.arcadeShadowHtml=function(){
  var g=state.games.sh; if(!g) return ''; setTimeout(mount,0);
  var sp=arcadeGameProgress().shadow||{};
  var stats='<span class="arcade-pill">🏛 Floor <b>'+g.floor+'</b></span><span class="arcade-pill">🏆 Best floor <b>'+(sp.bestFloor||Math.max(0,g.floor-1))+'</b></span><span class="arcade-pill">⚔️ Wins <b>'+(sp.wins||0)+'</b></span>';
  return arcadeFrame('Shadow Arena Campaign','Click tiles to move · 1–6 abilities · E end turn · F fullscreen',stats,
    '<div class="gx-wrap sh-wrap" id="sh-wrap"><canvas id="sh-canvas" width="1000" height="562"></canvas><div class="gx-ov" id="sh-ov"></div>'+
    '<div class="gx-tools"><button class="gx-mute" id="sh-mute" type="button" aria-label="Toggle sound">'+(muted()?'🔇':'🔊')+'</button><button class="gx-mute" id="sh-fs" type="button" aria-label="Fullscreen" title="Fullscreen (F)">⛶</button></div>'+
    '<div class="sh-bar" id="sh-bar">'+AB.map(function(a){ return '<button type="button" class="sh-ab" data-sh-ab="'+a.id+'" title="'+a.desc+'"><span class="sh-ai">'+a.icon+'</span><span class="sh-an">'+a.name+'</span><span class="sh-ac">⚡'+a.cost+'</span><kbd>'+a.key+'</kbd></button>'; }).join('')+'<button type="button" class="sh-ab sh-end" data-sh-end><span class="sh-ai">⏭</span><span class="sh-an">End turn</span><kbd>E</kbd></button></div></div>');
};

/* ------------------------------ mount / sizing / input ------------------------------ */
var loopId=0;
function mount(){
  var g=state.games&&state.games.sh, cv=$('sh-canvas'); if(!g||!cv||state.games.active!=='shadow') return;
  g.cv=cv; g.ctx=cv.getContext('2d'); g.ov=$('sh-ov'); g.wrap=$('sh-wrap'); g.sp=playerSprite(); g.cdBar='';
  wire(g); fit(g); overlay(g); cancelAnimationFrame(loopId); g.last=performance.now();
  (function frame(t){
    var cur=state.games&&state.games.sh; if(cur!==g||!document.body.contains(cv)||state.games.active!=='shadow') return;
    var dt=Math.min(.05,(t-g.last)/1000); g.last=t; try{ update(g,dt); draw(g); refreshBar(g); }catch(e){ console.error(e); }
    loopId=requestAnimationFrame(frame);
  })(g.last);
}
function isFS(){ var st=document.getElementById('games-stage'); return !!st&&(document.fullscreenElement===st||document.webkitFullscreenElement===st); }
function fit(g){
  var wrap=g.wrap; if(!wrap) return; var fs=isFS();
  var cssW=fs?window.innerWidth:wrap.clientWidth; if(!cssW) return; var cssH=fs?window.innerHeight:Math.round(cssW*LH/LW);
  var dpr=Math.min(window.devicePixelRatio||1,1.5); g.cv.width=Math.round(cssW*dpr); g.cv.height=Math.round(cssH*dpr); g.cv.style.width=cssW+'px'; g.cv.style.height=cssH+'px';
  g.dpr=dpr; g.fs=fs;
  if(fs){ g.sc=Math.min(cssW/LW,(cssH-84)/LH); g.ox=(cssW-LW*g.sc)/2; g.oy=Math.max(0,(cssH-84-LH*g.sc)/2); } else { g.sc=cssW/LW; g.ox=0; g.oy=0; }
  var b=$('sh-fs'); if(b) b.textContent=fs?'🗗':'⛶';
}
function toggleFS(g){ var w=document.getElementById('games-stage'); if(!w) return; try{ if(isFS()) (document.exitFullscreen||document.webkitExitFullscreen).call(document); else (w.requestFullscreen||w.webkitRequestFullscreen).call(w); }catch(e){} }
function tileAt(g,e){ var r=g.cv.getBoundingClientRect(), cx=(e.clientX-r.left), cy=(e.clientY-r.top); var lx=(cx-g.ox)/g.sc, ly=(cy-g.oy)/g.sc; var x=Math.floor((lx-BX)/CS), y=Math.floor((ly-BY)/CS); return inb(x,y)?{x:x,y:y}:null; }
function wire(g){
  var wrap=g.wrap; if(!wrap||wrap.__sh===g) return; wrap.__sh=g;
  g.cv.addEventListener('mousemove',function(e){ g.hover=tileAt(g,e); });
  g.cv.addEventListener('mouseleave',function(){ g.hover=null; });
  g.cv.addEventListener('click',function(e){ var t=tileAt(g,e); if(t) clickTile(g,t.x,t.y); });
  wrap.addEventListener('click',function(e){
    var t=e.target; if(!t.closest) return;
    var ab=t.closest('[data-sh-ab]'); if(ab){ pickAbility(g,ab.getAttribute('data-sh-ab')); return; }
    if(t.closest('[data-sh-end]')){ endTurn(g); return; }
    if(t.closest('[data-sh-start]')){ begin(g); return; }
    if(t.closest('#sh-fs,[data-sh-fs]')){ toggleFS(g); return; }
    if(t.closest('#sh-mute')){ try{ localStorage.setItem('gx-mute',muted()?'0':'1'); }catch(er){} $('sh-mute').textContent=muted()?'🔇':'🔊'; }
  });
  if(window.ResizeObserver){ new ResizeObserver(function(){ fit(g); }).observe(wrap); }
  g.api={pick:function(id){ return pickAbility(g,id); },click:function(x,y){ return clickTile(g,x,y); },end:function(){ return endTurn(g); }};
}
function onFS(){ var g=state.games&&state.games.sh; if(g) setTimeout(function(){ fit(g); },60); }
document.addEventListener('fullscreenchange',onFS); document.addEventListener('webkitfullscreenchange',onFS);
document.addEventListener('keydown',function(e){
  var gm=state.games; if(state.view!=='games'||!gm||gm.active!=='shadow'||!gm.sh) return; var g=gm.sh, k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k)>=0) e.preventDefault();
  if(k==='f'){ toggleFS(g); return; }
  if(g.phase==='ready'&&(k==='enter'||k===' ')){ begin(g); return; }
  if(g.phase!=='player'||g.busy) return;
  var a=AB.find(function(x){ return x.key===k; }); if(a){ pickAbility(g,a.id); return; }
  if(k==='e'||k==='enter'){ endTurn(g); return; }
  if(k==='escape'){ g.sel='move'; return; }
  var d={arrowup:[0,-1],w:[0,-1],arrowdown:[0,1],s:[0,1],arrowleft:[-1,0],a:[-1,0],arrowright:[1,0],d:[1,0]}[k]; if(d) clickTile(g,g.p.x+d[0],g.p.y+d[1],true);
},true);
function begin(g){ if(g.phase!=='ready') return; g.phase='player'; overlay(g); banner(g,'YOUR TURN'); sfx('turn'); }
function banner(g,t){ g.banner=t; g.bannerT=1.3; }

/* ------------------------------ overlays ------------------------------ */
function overlay(g){
  var o=g.ov; if(!o) return; var h='';
  if(g.phase==='ready'){
    var cards=g.enemies.map(function(e){ var D=ENEMY[e.type]; return '<span class="sh-pre" style="--c:'+D.glow+'"><b>'+D.name+'</b><i>'+e.hp+' HP</i></span>'; }).join('');
    h='<div class="gx-card wide"><h2>🏛 Floor '+g.floor+(g.floor%5===0?' — BOSS':'')+'</h2><p>Defeat every shadow. Spend <b>'+g.energyMax+' ⚡ energy</b> a turn on moving and abilities, then end your turn.</p><div class="sh-pres">'+cards+'</div><ul class="gx-keys"><li><kbd>Click</kbd> a glowing tile to move or use the selected ability</li><li><kbd>1–6</kbd> pick an ability · <kbd>E</kbd> end turn · <kbd>F</kbd> fullscreen</li><li>Red tiles are where enemies can hit you next. Spikes ⚠ hurt, green glyphs heal.</li></ul><p class="gx-stats">'+g.maxHp+' HP · attack power '+g.power+' · crit '+Math.round(g.crit*100)+'%</p><div class="gx-endbtns"><button class="btn btn-primary btn-lg" data-sh-start>Begin floor</button><button class="btn btn-ghost" data-sh-fs type="button">⛶ Fullscreen</button></div></div>';
  } else if(g.phase==='win'||g.phase==='over'){
    var sp=arcadeGameProgress().shadow||{};
    h='<div class="gx-card"><h2>'+(g.phase==='win'?'🏆 Floor '+g.floor+' cleared!':'💀 Defeated')+'</h2><div class="gx-res" style="grid-template-columns:repeat(3,1fr)"><div><b>'+g.turn+'</b><span>Turns</span></div><div><b>'+g.kills+'</b><span>Kills</span></div><div><b>'+Math.max(0,g.hp)+'</b><span>HP left</span></div></div><p class="gx-fine">'+(g.phase==='win'?'Progress saved — next up: floor '+(g.floor+1)+'.':'This floor remains uncleared. Try a different approach!')+'</p><div class="gx-endbtns"><button class="btn btn-primary btn-lg" data-action="arcade-shadow-next">'+(g.phase==='win'?'Next floor':'Retry floor')+'</button><button class="btn btn-ghost" data-action="arcade-hub">← All games</button></div></div>';
  }
  o.innerHTML=h; o.style.display=h?'flex':'none';
}
function refreshBar(g){
  var bar=$('sh-bar'); if(!bar) return; var key=[g.phase,g.busy,g.energy,g.sel,g.shield].join('|'); if(key===g.cdBar) return; g.cdBar=key;
  bar.querySelectorAll('[data-sh-ab]').forEach(function(b){ var a=AB.find(function(x){ return x.id===b.getAttribute('data-sh-ab'); }); b.classList.toggle('sel',g.sel===a.id&&g.phase==='player'); b.disabled=!(g.phase==='player'&&!g.busy&&g.energy>=a.cost); });
  var en=bar.querySelector('[data-sh-end]'); if(en) en.disabled=!(g.phase==='player'&&!g.busy);
}

/* ------------------------------ helpers ------------------------------ */
function unitAt(g,x,y){ if(g.p.x===x&&g.p.y===y) return g.p; for(var i=0;i<g.enemies.length;i++){ var e=g.enemies[i]; if(!e.dead&&e.x===x&&e.y===y) return e; } return null; }
function blocked(g,x,y){ return !inb(x,y)||g.t[y][x]===1; }
function emptyTile(g,x,y){ return inb(x,y)&&g.t[y][x]!==1&&!unitAt(g,x,y); }
function dist(a,b){ return Math.abs(a.x-b.x)+Math.abs(a.y-b.y); }
function bfs(g,from,maxD,through){
  var D={}, prev={}, q=[{x:from.x,y:from.y,d:0}]; D[from.x+','+from.y]=0;
  while(q.length){ var c=q.shift(); if(c.d>=maxD) continue; DIRS.forEach(function(d){ var nx=c.x+d[0], ny=c.y+d[1], k=nx+','+ny; if(!emptyTile(g,nx,ny)||D[k]!=null) return; D[k]=c.d+1; prev[k]=c.x+','+c.y; q.push({x:nx,y:ny,d:c.d+1}); }); }
  return {D:D,prev:prev};
}
function pathTo(prev,from,x,y){ var out=[], k=x+','+y, fk=from.x+','+from.y; while(k!==fk){ var p=k.split(','); out.unshift({x:+p[0],y:+p[1]}); k=prev[k]; if(!k) break; } return out; }
function lineTargets(g,from,maxR,includeUnit){
  var out=[]; DIRS.forEach(function(d){ for(var i=1;i<=maxR;i++){ var x=from.x+d[0]*i, y=from.y+d[1]*i; if(blocked(g,x,y)) break; var u=unitAt(g,x,y); if(u){ out.push({x:x,y:y,u:u,d:d,i:i}); break; } if(!includeUnit) out.push({x:x,y:y,u:null,d:d,i:i}); } }); return out;
}
function floatText(g,x,y,t,c){ g.texts.push({x:x,y:y,t:t,c:c,l:1.1}); }
function parts(g,x,y,n,col,sp){ for(var i=0;i<n;i++){ var a=Math.random()*TAU, v=sp*(.3+Math.random()*.7); g.parts.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l:.5+Math.random()*.4,m:.9,c:col,r:2+Math.random()*3}); } }
function cx(x){ return BX+x*CS+CS/2; } function cy(y){ return BY+y*CS+CS/2; }

/* ------------------------------ player actions ------------------------------ */
function pickAbility(g,id){
  if(g.phase!=='player'||g.busy) return; var a=AB.find(function(x){ return x.id===id; }); if(!a) return;
  if(g.energy<a.cost){ floatText(g,cx(g.p.x),cy(g.p.y)-40,'Not enough ⚡','#ff9a9a'); return; }
  if(id==='shock'){ doShock(g); return; } if(id==='guard'){ doGuard(g); return; }
  g.sel=g.sel===id?'move':id;
}
function clickTile(g,x,y,fromKey){
  if(g.phase!=='player'||g.busy||!inb(x,y)) return;
  var sel=g.sel;
  if(sel==='move'){
    var r=bfs(g,g.p,g.energy), k=x+','+y; if(r.D[k]==null||r.D[k]===0){ if(fromKey) return; var u=unitAt(g,x,y); if(u&&u!==g.p&&dist(g.p,u)===1&&g.energy>=1){ doStrike(g,u); } return; }
    doMove(g,pathTo(r.prev,g.p,x,y)); return;
  }
  if(sel==='strike'){ var u2=unitAt(g,x,y); if(u2&&u2!==g.p&&dist(g.p,u2)===1) doStrike(g,u2); return; }
  if(sel==='bolt'){ var T=lineTargets(g,g.p,4,true).find(function(t){ return t.x===x&&t.y===y&&t.u&&t.u!==g.p; }); if(T) doBolt(g,T.u,T); return; }
  if(sel==='lunge'){ var L=lungeTargets(g).find(function(t){ return t.x===x&&t.y===y; }); if(L) doLunge(g,L); return; }
  if(sel==='step'){ if(emptyTile(g,x,y)&&dist(g.p,{x:x,y:y})<=3&&dist(g.p,{x:x,y:y})>0) doStep(g,x,y); return; }
}
function lungeTargets(g){
  var out=[]; DIRS.forEach(function(d){ for(var i=1;i<=3;i++){ var x=g.p.x+d[0]*i, y=g.p.y+d[1]*i; if(blocked(g,x,y)) break; var u=unitAt(g,x,y); if(u){ if(i>1||true) out.push({x:x,y:y,u:u,d:d,i:i,hit:true}); break; } out.push({x:x,y:y,u:null,d:d,i:i}); } }); return out;
}
function dmgRoll(g,base){ var d=base+g.empower, crit=Math.random()<g.crit; if(g.empower) g.empower=0; if(crit) d=Math.round(d*1.8); return {d:d,crit:crit}; }
async function act(g,fn){ if(g.busy) return; g.busy=true; try{ await fn(); }catch(e){ console.error(e); } g.busy=false; if(g.phase==='player'){ if(!alive(g).length){ await winFloor(g); } else if(g.energy<=0){ await sleep(250); await endTurn(g,true); } } }
function alive(g){ return g.enemies.filter(function(e){ return !e.dead; }); }
async function doMove(g,path){ if(!path.length) return; await act(g,async function(){ for(var i=0;i<path.length;i++){ var s=path[i]; g.p.x=s.x; g.p.y=s.y; g.energy--; sfx('move'); await sleep(130); tileEffect(g,g.p,true); if(g.p.hp<=0) break; } g.sel='move'; checkPlayerDead(g); }); }
function tileEffect(g,u,isP){
  var t=g.t[u.y][u.x];
  if(t===2){ sfx('spike'); hurtUnit(g,u,2,{src:'spike'}); }
  else if(t===3&&isP){ g.t[u.y][u.x]=0; g.hp=Math.min(g.maxHp,g.hp+3); g.p.hp=g.hp; sfx('heal'); floatText(g,cx(u.x),cy(u.y)-34,'+3 ❤️','#7dffa8'); parts(g,cx(u.x),cy(u.y),14,'#7dffa8',140); log(g,'A healing glyph restores 3 HP.'); }
}
async function doStrike(g,t){ await act(g,async function(){ g.energy-=1; var r=dmgRoll(g,g.power); bumpTo(g.p,t); sfx(r.crit?'crit':'hit'); await sleep(110); hitEnemy(g,t,r.d,r.crit); log(g,'Strike hits '+ENEMY[t.type].name+' for '+r.d+(r.crit?' (crit!)':'')+'.'); await sleep(200); g.sel='move'; }); }
async function doLunge(g,L){ await act(g,async function(){ g.energy-=2; var tx=L.x, ty=L.y; if(L.u){ tx=L.x-L.d[0]; ty=L.y-L.d[1]; }
  sfx('step'); for(var k=0;k<3;k++) g.parts.push({x:cx(g.p.x),y:cy(g.p.y),vx:0,vy:0,l:.3,m:.3,c:'rgba(180,140,255,.6)',r:26-k*6});
  g.p.x=tx; g.p.y=ty; await sleep(160); tileEffect(g,g.p,true);
  if(L.u&&!L.u.dead){ var r=dmgRoll(g,g.power+1); bumpTo(g.p,L.u); await sleep(80); hitEnemy(g,L.u,r.d,r.crit); log(g,'Lunge hits '+ENEMY[L.u.type].name+' for '+r.d+'.'); sfx(r.crit?'crit':'hit'); }
  await sleep(200); g.sel='move'; checkPlayerDead(g); }); }
async function doBolt(g,t,T){ await act(g,async function(){ g.energy-=2; sfx('bolt'); var fx={k:'bolt',x1:cx(g.p.x),y1:cy(g.p.y),x2:cx(t.x),y2:cy(t.y),l:.25,m:.25}; g.fx.push(fx); await sleep(180); var r=dmgRoll(g,g.power); hitEnemy(g,t,r.d,r.crit); log(g,'Bolt hits '+ENEMY[t.type].name+' for '+r.d+'.'); await sleep(240); g.sel='move'; }); }
async function doShock(g){ await act(g,async function(){ g.energy-=3; sfx('shock'); g.fx.push({k:'ring',x:cx(g.p.x),y:cy(g.p.y),l:.5,m:.5}); g.shake=.3; await sleep(200);
  var tg=DIRS.map(function(d){ var u=unitAt(g,g.p.x+d[0],g.p.y+d[1]); return u&&u!==g.p?{u:u,d:d}:null; }).filter(Boolean);
  for(var i=0;i<tg.length;i++){ var e=tg[i].u, d=tg[i].d; var r=dmgRoll(g,Math.max(1,g.power-1)); hitEnemy(g,e,r.d,r.crit); if(e.dead) continue; var nx=e.x+d[0], ny=e.y+d[1];
    if(blocked(g,nx,ny)||unitAt(g,nx,ny)){ var o=unitAt(g,nx,ny); sfx('hit'); hitEnemy(g,e,2,false); if(o&&o!==g.p) hitEnemy(g,o,2,false); floatText(g,cx(e.x),cy(e.y)-50,'SLAM!','#ffd24a'); }
    else { e.x=nx; e.y=ny; await sleep(120); tileEffect(g,e,false); if(e.hp<=0&&!e.dead) killEnemy(g,e); } }
  log(g,'Shockwave hits '+tg.length+' enem'+(tg.length===1?'y':'ies')+'.'); await sleep(280); g.sel='move'; }); }
async function doGuard(g){ await act(g,async function(){ g.energy-=1; g.shield=Math.min(10,g.shield+4); sfx('guard'); g.fx.push({k:'ring',x:cx(g.p.x),y:cy(g.p.y),l:.4,m:.4,c:'#6ad0ff'}); floatText(g,cx(g.p.x),cy(g.p.y)-40,'+4 🛡️','#7ad4ff'); log(g,'You raise a shield.'); await sleep(260); g.sel='move'; }); }
async function doStep(g,x,y){ await act(g,async function(){ g.energy-=2; sfx('step'); parts(g,cx(g.p.x),cy(g.p.y),16,'#b07cff',160); g.p.x=x; g.p.y=y; g.p.vx=x; g.p.vy=y; parts(g,cx(x),cy(y),16,'#b07cff',160); g.empower=2; floatText(g,cx(x),cy(y)-40,'Empowered +2','#c9a0ff'); log(g,'Shadow Step — your next attack is empowered.'); await sleep(220); tileEffect(g,g.p,true); g.sel='move'; checkPlayerDead(g); }); }
function bumpTo(u,t){ u.bump={dx:Math.sign(t.x-u.x),dy:Math.sign(t.y-u.y),t:.18,m:.18}; }
function hitEnemy(g,e,d,crit){ if(e.dead) return; e.hp-=d; e.flash=.25; g.shake=Math.max(g.shake,crit?.3:.15); floatText(g,cx(e.x),cy(e.y)-34,(crit?'💥 ':'-')+d,crit?'#ffd24a':'#fff'); parts(g,cx(e.x),cy(e.y),crit?16:8,ENEMY[e.type].glow,170); sfx(crit?'crit':'hit'); if(e.hp<=0) killEnemy(g,e); }
function killEnemy(g,e){ if(e.dead) return; e.dead=true; e.fade=.5; g.kills++; sfx('die'); parts(g,cx(e.x),cy(e.y),26,ENEMY[e.type].glow,220); log(g,ENEMY[e.type].name+' is destroyed.'); }
function hurtUnit(g,u,d,o){ if(u===g.p){ var ab=Math.min(g.shield,d); g.shield-=ab; var rest=d-ab; if(ab) floatText(g,cx(u.x)+16,cy(u.y)-40,'🛡️'+ab,'#7ad4ff'); if(rest>0){ g.hp-=rest; g.p.hp=g.hp; g.dmgTaken+=rest; g.p.flash=.3; g.flash=.3; g.shake=.3; sfx('hurt'); floatText(g,cx(u.x),cy(u.y)-34,'-'+rest,'#ff6a7a'); parts(g,cx(u.x),cy(u.y),12,'#ff6a7a',170); } } else hitEnemy(g,u,d,false); }
function checkPlayerDead(g){ if(g.hp<=0&&g.phase!=='over'&&g.phase!=='win') loseFloor(g); }

/* ------------------------------ enemy AI ------------------------------ */
async function endTurn(g,auto){
  if(g.phase!=='player'||(g.busy&&!auto)) return; g.busy=true; g.phase='enemy'; g.sel='move'; banner(g,'ENEMY TURN'); sfx('warn'); await sleep(450);
  var list=alive(g);
  for(var i=0;i<list.length;i++){ var e=list[i]; if(e.dead||g.phase!=='enemy') continue; e.age++; try{ await enemyAct(g,e); }catch(er){ console.error(er); } if(g.hp<=0){ loseFloor(g); g.busy=false; return; } await sleep(150); }
  if(g.phase!=='enemy'){ g.busy=false; return; }
  g.turn++; g.energy=g.energyMax; g.phase='player'; g.busy=false; banner(g,'YOUR TURN'); sfx('turn'); log(g,'— Turn '+g.turn+' —');
  if(!alive(g).length) await winFloor(g);
}
function meleeStep(g,e,moves){
  var r=bfs(g,e,moves), best=null, bd=1e9; Object.keys(r.D).forEach(function(k){ var p=k.split(','), t={x:+p[0],y:+p[1]}; var dd=dist(t,g.p); if(dd<bd||(dd===bd&&r.D[k]<r.D[best.x+','+best.y])){ bd=dd; best={x:t.x,y:t.y}; } });
  return best;
}
async function moveEnemy(g,e,to){ if(!to||(to.x===e.x&&to.y===e.y)) return; e.x=to.x; e.y=to.y; sfx('move'); await sleep(200); tileEffect(g,e,false); if(e.hp<=0&&!e.dead) killEnemy(g,e); }
async function enemyHit(g,e,target,dmg){ bumpTo(e,target); await sleep(130); sfx('hit'); hurtUnit(g,g.p,dmg,{}); log(g,ENEMY[e.type].name+' hits you for '+dmg+'.'); await sleep(240); }
function aligned(g,e,maxR){ var T=lineTargets(g,e,maxR,true).find(function(t){ return t.u===g.p; }); return T; }
async function enemyAct(g,e){
  var p=g.p;
  if(e.type==='brute'){
    if(e.mark){ g.fx.push({k:'ring',x:cx(e.mark.x),y:cy(e.mark.y),l:.4,m:.4,c:'#ff8a3a'}); sfx('shock'); g.shake=.3; await sleep(260);
      e.mark.tiles.forEach(function(t){ var u=unitAt(g,t.x,t.y); if(u){ if(u===g.p) hurtUnit(g,g.p,e.dmg,{}); else if(u!==e) hitEnemy(g,u,e.dmg,false); } parts(g,cx(t.x),cy(t.y),8,'#ff8a3a',150); }); log(g,'Hollow Brute smashes down!'); e.mark=null; await sleep(300); return; }
    if(dist(e,p)<=2){ var c=p, tiles=[{x:c.x,y:c.y}]; DIRS.forEach(function(d){ var nx=c.x+d[0], ny=c.y+d[1]; if(inb(nx,ny)&&g.t[ny][nx]!==1) tiles.push({x:nx,y:ny}); }); e.mark={x:c.x,y:c.y,tiles:tiles}; sfx('warn'); log(g,'Hollow Brute raises its fist — move!'); await sleep(350); return; }
    await moveEnemy(g,e,meleeStep(g,e,1)); return;
  }
  if(e.type==='archer'){
    var T=aligned(g,e,4); if(dist(e,p)===1){ var r=bfs(g,e,e.type==='archer'?2:1), best=null, bs=-1; Object.keys(r.D).forEach(function(k){ var q=k.split(','), t={x:+q[0],y:+q[1]}; var sc=dist(t,p)*3+(r.D[k]>0?1:0); if(sc>bs){ bs=sc; best=t; } }); await moveEnemy(g,e,best); T=aligned(g,e,4); }
    else if(!T){ var r2=bfs(g,e,2), cand=null, cb=1e9; Object.keys(r2.D).forEach(function(k){ var q=k.split(','), t={x:+q[0],y:+q[1]}; var save=e.x, sy=e.y; e.x=t.x; e.y=t.y; var al=aligned(g,e,4); e.x=save; e.y=sy; var dd=dist(t,p); if(al&&dd>=2){ var sc=r2.D[k]*10+Math.abs(dd-3); if(sc<cb){ cb=sc; cand=t; } } }); if(cand) await moveEnemy(g,e,cand); else await moveEnemy(g,e,meleeStep(g,e,2)); T=aligned(g,e,4); }
    if(T&&!e.dead){ sfx('bolt'); g.fx.push({k:'bolt',x1:cx(e.x),y1:cy(e.y),x2:cx(p.x),y2:cy(p.y),l:.25,m:.25,c:'#5ac8ff'}); bumpTo(e,p); await sleep(200); hurtUnit(g,p,e.dmg,{}); log(g,'Dusk Archer shoots you for '+e.dmg+'.'); await sleep(250); }
    return;
  }
  if(e.type==='wisp'){
    if(e.cd>0){ e.cd--; var rr=bfs(g,e,1), ks=Object.keys(rr.D).filter(function(k){ return rr.D[k]===1; }); if(ks.length){ var q2=ks[(Math.random()*ks.length)|0].split(','); await moveEnemy(g,e,{x:+q2[0],y:+q2[1]}); } return; }
    var adj=[]; DIRS.forEach(function(d){ var nx=p.x+d[0], ny=p.y+d[1]; if(emptyTile(g,nx,ny)&&g.t[ny][nx]!==2) adj.push({x:nx,y:ny}); });
    if(dist(e,p)>1&&adj.length){ var a=adj[(Math.random()*adj.length)|0]; parts(g,cx(e.x),cy(e.y),12,'#5affd0',150); e.x=a.x; e.y=a.y; e.vx=a.x; e.vy=a.y; sfx('step'); parts(g,cx(a.x),cy(a.y),12,'#5affd0',150); await sleep(250); }
    if(dist(e,p)===1){ await enemyHit(g,e,p,e.dmg); e.cd=1; } return;
  }
  /* shade clone & boss */
  if(e.type==='boss'){
    if(e.age%3===0){ var spots=[]; DIRS.forEach(function(d){ var nx=e.x+d[0], ny=e.y+d[1]; if(emptyTile(g,nx,ny)&&g.t[ny][nx]!==2) spots.push({x:nx,y:ny}); });
      if(spots.length&&alive(g).length<5){ var s=spots[(Math.random()*spots.length)|0], D=ENEMY.shade, hp=Math.round(D.hp*(1+.09*(g.floor-1))); g.enemies.push({id:'e'+(++uidN),type:'shade',x:s.x,y:s.y,vx:s.x,vy:s.y,hp:hp,max:hp,dmg:D.dmg+Math.floor(g.floor/4),mark:null,cd:0,age:0,flash:0,bump:null,dead:false,fade:0,spawn:1}); parts(g,cx(s.x),cy(s.y),20,'#ff4aa0',180); sfx('step'); log(g,'Your Shadow summons a clone!'); await sleep(450); return; } }
    var T2=dist(e,p)>2&&aligned(g,e,4); if(T2){ sfx('bolt'); g.fx.push({k:'bolt',x1:cx(e.x),y1:cy(e.y),x2:cx(p.x),y2:cy(p.y),l:.25,m:.25,c:'#ff4aa0'}); await sleep(200); hurtUnit(g,p,e.dmg,{}); log(g,'Your Shadow fires a bolt for '+e.dmg+'.'); await sleep(260); return; }
  }
  if(dist(e,p)>1) await moveEnemy(g,e,meleeStep(g,e,ENEMY[e.type].move)); if(!e.dead&&dist(e,p)===1) await enemyHit(g,e,p,e.dmg);
}
async function winFloor(g){
  if(g.phase==='win'||g.phase==='over') return; g.phase='win'; await sleep(500); sfx('win'); try{ celebrate(); }catch(e){}
  var gp=arcadeGameProgress(); gp.shadow=gp.shadow||{floor:1}; gp.shadow.floor=Math.max(Number(gp.shadow.floor)||1,g.floor+1); gp.shadow.wins=(Number(gp.shadow.wins)||0)+1; gp.shadow.bestFloor=Math.max(Number(gp.shadow.bestFloor)||0,g.floor); gp.shadow.kills=(Number(gp.shadow.kills)||0)+g.kills; gp.shadow.runs=(Number(gp.shadow.runs)||0)+1;
  try{ persistProgress(); }catch(e){} g.busy=false; overlay(g);
}
function loseFloor(g){
  if(g.phase==='over'||g.phase==='win') return; g.phase='over'; sfx('lose'); var gp=arcadeGameProgress(); gp.shadow=gp.shadow||{floor:1}; gp.shadow.kills=(Number(gp.shadow.kills)||0)+g.kills; gp.shadow.runs=(Number(gp.shadow.runs)||0)+1; try{ persistProgress(); }catch(e){}
  setTimeout(function(){ if(state.games&&state.games.sh===g){ g.busy=false; overlay(g); } },700);
}

/* ------------------------------ update / draw ------------------------------ */
function update(g,dt){
  g.time+=dt; if(g.shake>0) g.shake-=dt; if(g.flash>0) g.flash-=dt; if(g.bannerT>0) g.bannerT-=dt;
  var k=Math.min(1,dt*16);
  [g.p].concat(g.enemies).forEach(function(u){ u.vx+=(u.x-u.vx)*k; u.vy+=(u.y-u.vy)*k; if(u.flash>0) u.flash-=dt; if(u.bump){ u.bump.t-=dt; if(u.bump.t<=0) u.bump=null; } if(u.dead&&u.fade>0) u.fade-=dt; if(u.spawn>0) u.spawn=Math.max(0,u.spawn-dt*3); });
  for(var i=g.parts.length-1;i>=0;i--){ var q=g.parts[i]; q.l-=dt; if(q.l<=0){ g.parts.splice(i,1); continue; } q.x+=q.vx*dt; q.y+=q.vy*dt; q.vy+=300*dt; }
  for(i=g.texts.length-1;i>=0;i--){ var t=g.texts[i]; t.l-=dt; t.y-=34*dt; if(t.l<=0) g.texts.splice(i,1); }
  for(i=g.fx.length-1;i>=0;i--){ g.fx[i].l-=dt; if(g.fx[i].l<=0) g.fx.splice(i,1); }
  g.enemies=g.enemies.filter(function(e){ return !(e.dead&&e.fade<=0); });
}
function dangerSet(g){
  var D={}; function add(x,y,t){ if(inb(x,y)) D[x+','+y]=t||1; }
  g.enemies.forEach(function(e){ if(e.dead) return;
    if(e.type==='brute'){ if(e.mark) e.mark.tiles.forEach(function(t){ add(t.x,t.y,2); }); }
    else if(e.type==='archer'||(e.type==='boss'&&false)){ lineTargets(g,e,4,false).forEach(function(t){ add(t.x,t.y); }); lineTargets(g,e,4,true).forEach(function(t){ if(t.u===g.p) add(t.x,t.y); }); }
    else if(e.type!=='wisp'){ DIRS.forEach(function(d){ var nx=e.x+d[0], ny=e.y+d[1]; if(inb(nx,ny)&&g.t[ny][nx]!==1) add(nx,ny); }); }
  }); return D;
}
function rr(c,x,y,w,h,r){ r=Math.min(r,w/2,h/2); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function draw(g){
  var c=g.ctx; if(!c) return; var sc=g.sc*g.dpr; c.setTransform(1,0,0,1,0,0); c.fillStyle='#07040f'; c.fillRect(0,0,g.cv.width,g.cv.height);
  c.setTransform(sc,0,0,sc,g.ox*g.dpr,g.oy*g.dpr);
  var t=g.time, sx=g.shake>0?(Math.random()-.5)*8*g.shake:0, sy=g.shake>0?(Math.random()-.5)*8*g.shake:0;
  /* backdrop */
  var bg=c.createRadialGradient(LW/2,LH*.45,60,LW/2,LH*.45,LW*.65); bg.addColorStop(0,'#2a1650'); bg.addColorStop(.6,'#120a26'); bg.addColorStop(1,'#07040f'); c.fillStyle=bg; c.fillRect(0,0,LW,LH);
  for(var i=0;i<26;i++){ c.fillStyle='rgba(190,150,255,'+(.12+.12*Math.sin(t+i))+')'; c.fillRect((i*97+t*8)%LW,(i*53)%LH+Math.sin(t*.7+i)*6,2,2); }
  c.save(); c.translate(sx,sy);
  /* board frame */
  c.fillStyle='rgba(120,80,220,.18)'; c.beginPath(); rr(c,BX-14,BY-14,COLS*CS+28,ROWS*CS+28,18); c.fill(); c.strokeStyle='#5a3fb0'; c.lineWidth=3; c.beginPath(); rr(c,BX-10,BY-10,COLS*CS+20,ROWS*CS+20,14); c.stroke();
  var danger=g.phase==='player'||g.phase==='ready'?dangerSet(g):{}, reach=null, targets={};
  if(g.phase==='player'&&!g.busy){
    if(g.sel==='move'){ reach=bfs(g,g.p,g.energy).D; }
    else if(g.sel==='strike'){ DIRS.forEach(function(d){ var u=unitAt(g,g.p.x+d[0],g.p.y+d[1]); if(u&&u!==g.p) targets[(g.p.x+d[0])+','+(g.p.y+d[1])]='atk'; }); }
    else if(g.sel==='bolt'){ lineTargets(g,g.p,4,false).forEach(function(q){ targets[q.x+','+q.y]='line'; }); lineTargets(g,g.p,4,true).forEach(function(q){ if(q.u&&q.u!==g.p) targets[q.x+','+q.y]='atk'; }); }
    else if(g.sel==='lunge'){ lungeTargets(g).forEach(function(q){ targets[q.x+','+q.y]=q.u?'atk':'move'; }); }
    else if(g.sel==='step'){ for(var yy=0;yy<ROWS;yy++) for(var xx=0;xx<COLS;xx++){ var dd=Math.abs(xx-g.p.x)+Math.abs(yy-g.p.y); if(dd>0&&dd<=3&&emptyTile(g,xx,yy)) targets[xx+','+yy]='move'; } }
  }
  /* tiles */
  for(var y=0;y<ROWS;y++) for(var x=0;x<COLS;x++){
    var X=BX+x*CS, Y=BY+y*CS, ty=g.t[y][x], chk=(x+y)%2;
    var tg=c.createLinearGradient(X,Y,X,Y+CS); tg.addColorStop(0,chk?'#2c2150':'#352862'); tg.addColorStop(1,chk?'#241a42':'#2c2152'); c.fillStyle=tg; c.fillRect(X+1,Y+1,CS-2,CS-2);
    c.strokeStyle='rgba(160,120,255,.18)'; c.lineWidth=1.5; c.strokeRect(X+3.5,Y+3.5,CS-7,CS-7);
    if(((x*5+y*3)%7)===0){ c.strokeStyle='rgba(160,120,255,.25)'; c.beginPath(); c.arc(X+CS/2,Y+CS/2,CS*.28,0,TAU); c.stroke(); }
    var k=x+','+y;
    if(danger[k]){ var al=.18+.1*Math.sin(t*6); c.fillStyle=(danger[k]===2?'rgba(255,120,40,':'rgba(255,60,80,')+al+')'; c.fillRect(X+1,Y+1,CS-2,CS-2); c.strokeStyle='rgba(255,90,100,.55)'; c.lineWidth=2; c.strokeRect(X+4,Y+4,CS-8,CS-8); }
    if(reach&&reach[k]>0){ c.fillStyle='rgba(90,220,255,'+(.16+.08*Math.sin(t*5))+')'; c.fillRect(X+1,Y+1,CS-2,CS-2); c.strokeStyle='rgba(120,230,255,.6)'; c.lineWidth=2; c.strokeRect(X+5,Y+5,CS-10,CS-10); c.fillStyle='rgba(180,240,255,.9)'; c.font='800 12px Inter,sans-serif'; c.textAlign='center'; c.fillText(String(reach[k]),X+CS/2,Y+CS-10); }
    if(targets[k]){ var tt=targets[k]; c.fillStyle=tt==='atk'?'rgba(255,70,90,.32)':tt==='move'?'rgba(150,120,255,.3)':'rgba(255,200,90,.14)'; c.fillRect(X+1,Y+1,CS-2,CS-2); c.strokeStyle=tt==='atk'?'#ff5a6a':tt==='move'?'#b090ff':'rgba(255,210,120,.5)'; c.lineWidth=tt==='line'?1.5:2.5; c.strokeRect(X+4,Y+4,CS-8,CS-8); }
    if(ty===1){ /* pillar */
      c.fillStyle='rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(X+CS/2+4,Y+CS-12,26,9,0,0,TAU); c.fill();
      var pg=c.createLinearGradient(X,Y,X+CS,Y); pg.addColorStop(0,'#5c4e86'); pg.addColorStop(.5,'#7d6cae'); pg.addColorStop(1,'#463a6c'); c.fillStyle=pg; c.beginPath(); rr(c,X+14,Y+8,CS-28,CS-18,6); c.fill(); c.fillStyle='#8f7fc2'; c.beginPath(); rr(c,X+10,Y+4,CS-20,12,5); c.fill(); c.fillStyle='rgba(255,255,255,.18)'; c.fillRect(X+18,Y+16,5,CS-34);
    } else if(ty===2){ c.fillStyle='rgba(0,0,0,.35)'; c.fillRect(X+8,Y+8,CS-16,CS-16); c.fillStyle='#cfd3e6'; for(var sx2=0;sx2<3;sx2++) for(var sy2=0;sy2<3;sy2++){ var bx=X+14+sx2*21, by=Y+16+sy2*19; c.beginPath(); c.moveTo(bx-6,by+8); c.lineTo(bx,by-8); c.lineTo(bx+6,by+8); c.fill(); } }
    else if(ty===3){ var gl=c.createRadialGradient(X+CS/2,Y+CS/2,0,X+CS/2,Y+CS/2,CS*.5); gl.addColorStop(0,'rgba(120,255,170,'+(.55+.2*Math.sin(t*3))+')'); gl.addColorStop(1,'rgba(120,255,170,0)'); c.fillStyle=gl; c.fillRect(X,Y,CS,CS); c.strokeStyle='#7dffa8'; c.lineWidth=2.5; c.beginPath(); c.arc(X+CS/2,Y+CS/2,17,0,TAU); c.stroke(); c.beginPath(); c.moveTo(X+CS/2,Y+CS/2-9); c.lineTo(X+CS/2,Y+CS/2+9); c.moveTo(X+CS/2-9,Y+CS/2); c.lineTo(X+CS/2+9,Y+CS/2); c.stroke(); }
  }
  /* hover */
  if(g.hover&&g.phase==='player'&&!g.busy){ var hx=BX+g.hover.x*CS, hy=BY+g.hover.y*CS; c.strokeStyle='rgba(255,255,255,.8)'; c.lineWidth=2.5; c.strokeRect(hx+2,hy+2,CS-4,CS-4);
    if(g.sel==='move'&&reach&&reach[g.hover.x+','+g.hover.y]>0){ var pr=bfs(g,g.p,g.energy); var path=pathTo(pr.prev,g.p,g.hover.x,g.hover.y); c.strokeStyle='rgba(180,240,255,.8)'; c.lineWidth=4; c.setLineDash([8,6]); c.beginPath(); c.moveTo(cx(g.p.x),cy(g.p.y)); path.forEach(function(s){ c.lineTo(cx(s.x),cy(s.y)); }); c.stroke(); c.setLineDash([]); } }
  /* units sorted by y */
  var us=g.enemies.concat([g.p]).sort(function(a,b){ return a.vy-b.vy; });
  us.forEach(function(u){ drawUnit(g,c,u,t); });
  /* fx */
  g.fx.forEach(function(f){ var a=f.l/f.m; if(f.k==='ring'){ c.strokeStyle=(f.c||'#c9a0ff'); c.globalAlpha=a; c.lineWidth=5; c.beginPath(); c.arc(f.x,f.y,(1-a)*CS*1.6+10,0,TAU); c.stroke(); c.globalAlpha=1; } else if(f.k==='bolt'){ c.globalAlpha=a; c.strokeStyle=f.c||'#ffe58a'; c.lineWidth=6; c.shadowColor=f.c||'#ffe58a'; c.shadowBlur=18; c.beginPath(); c.moveTo(f.x1,f.y1); var n=6; for(var j=1;j<n;j++){ c.lineTo(f.x1+(f.x2-f.x1)*j/n+(Math.random()-.5)*10,f.y1+(f.y2-f.y1)*j/n+(Math.random()-.5)*10); } c.lineTo(f.x2,f.y2); c.stroke(); c.shadowBlur=0; c.globalAlpha=1; } });
  g.parts.forEach(function(q){ c.globalAlpha=clamp(q.l/q.m,0,1); c.fillStyle=q.c; if(q.r>10){ c.beginPath(); c.arc(q.x,q.y,q.r,0,TAU); c.fill(); } else c.fillRect(q.x-q.r/2,q.y-q.r/2,q.r,q.r); }); c.globalAlpha=1;
  g.texts.forEach(function(tx){ c.globalAlpha=clamp(tx.l*2,0,1); c.textAlign='center'; c.font='900 22px Inter,sans-serif'; c.lineWidth=5; c.strokeStyle='rgba(0,0,0,.75)'; c.strokeText(tx.t,tx.x,tx.y); c.fillStyle=tx.c; c.fillText(tx.t,tx.x,tx.y); }); c.globalAlpha=1;
  c.restore();
  if(g.flash>0){ c.fillStyle='rgba(255,40,70,'+g.flash*.5+')'; c.fillRect(0,0,LW,LH); }
  hud(g,c);
}
function drawUnit(g,c,u,t){
  var isP=u===g.p, D=isP?null:ENEMY[u.type], X=BX+u.vx*CS+CS/2, Y=BY+u.vy*CS+CS/2;
  if(u.bump){ var k=Math.sin((1-u.bump.t/u.bump.m)*Math.PI); X+=u.bump.dx*k*18; Y+=u.bump.dy*k*18; }
  var al=u.dead?clamp(u.fade/.5,0,1):1, sp=u.spawn||0; c.globalAlpha=al*(1-sp*.8);
  var big=u.type==='boss'?1.35:u.type==='brute'?1.2:1, bob=Math.sin(t*3+(u.x||0)*2)*2.5;
  c.fillStyle='rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(X,Y+24,22*big,8*big,0,0,TAU); c.fill();
  if(!isP){ var gl=c.createRadialGradient(X,Y,0,X,Y,46*big); gl.addColorStop(0,D.glow+'55'); gl.addColorStop(1,'rgba(0,0,0,0)'); c.fillStyle=gl; c.fillRect(X-50*big,Y-50*big,100*big,100*big); }
  else { var gl2=c.createRadialGradient(X,Y,0,X,Y,44); gl2.addColorStop(0,(g.sp.col||'#b07cff')+'55'); gl2.addColorStop(1,'rgba(0,0,0,0)'); c.fillStyle=gl2; c.fillRect(X-48,Y-48,96,96); }
  var size=58*big;
  if(isP||u.type==='shade'||u.type==='boss'){
    var img=isP?g.sp.img:shadeSprite(g); var ok=img&&(isP?(img.complete&&img.naturalWidth):true);
    if(ok){ if(u.flash>0&&!isP) c.globalAlpha*=.6+.4*Math.sin(t*60); c.drawImage(img,X-size/2,Y-size+22+bob,size,size); if(!isP){ c.fillStyle=D.glow; c.shadowColor=D.glow; c.shadowBlur=10; c.beginPath(); c.arc(X-7*big,Y-size*.45+22+bob,2.8*big,0,TAU); c.arc(X+7*big,Y-size*.45+22+bob,2.8*big,0,TAU); c.fill(); c.shadowBlur=0; } }
    else { c.fillStyle=isP?(g.sp.col||'#b07cff'):D.col; c.beginPath(); rr(c,X-20,Y-22,40,44,12); c.fill(); }
    if(u.type==='boss'){ c.fillStyle='#ffd24a'; c.beginPath(); c.moveTo(X-16,Y-size+24+bob); c.lineTo(X-16,Y-size+10+bob); c.lineTo(X-8,Y-size+18+bob); c.lineTo(X,Y-size+6+bob); c.lineTo(X+8,Y-size+18+bob); c.lineTo(X+16,Y-size+10+bob); c.lineTo(X+16,Y-size+24+bob); c.fill(); }
  } else if(u.type==='archer'){ c.fillStyle=D.col; c.beginPath(); c.moveTo(X,Y-30+bob); c.lineTo(X+19,Y+22); c.lineTo(X-19,Y+22); c.fill(); c.fillStyle='#0a1020'; c.beginPath(); c.arc(X,Y-14+bob,11,0,TAU); c.fill(); c.fillStyle=D.glow; c.fillRect(X-6,Y-16+bob,4,3); c.fillRect(X+2,Y-16+bob,4,3); c.strokeStyle='#8a6a3a'; c.lineWidth=3; c.beginPath(); c.arc(X+20,Y+2+bob,17,-1.2,1.2); c.stroke(); c.strokeStyle='rgba(255,255,255,.5)'; c.lineWidth=1; c.beginPath(); c.moveTo(X+20+Math.cos(-1.2)*17,Y+2+bob+Math.sin(-1.2)*17); c.lineTo(X+20+Math.cos(1.2)*17,Y+2+bob+Math.sin(1.2)*17); c.stroke(); }
  else if(u.type==='brute'){ c.fillStyle=D.col; c.beginPath(); rr(c,X-27,Y-26+bob,54,50,14); c.fill(); c.fillStyle='#5a3626'; c.beginPath(); rr(c,X-34,Y-14+bob,16,26,7); c.fill(); c.beginPath(); rr(c,X+18,Y-14+bob,16,26,7); c.fill(); c.fillStyle='#220f08'; c.fillRect(X-15,Y-14+bob,30,8); c.fillStyle=D.glow; c.fillRect(X-10,Y-12+bob,6,4); c.fillRect(X+4,Y-12+bob,6,4); c.fillStyle='#cfc2b0'; c.beginPath(); c.moveTo(X-22,Y-24+bob); c.lineTo(X-28,Y-38+bob); c.lineTo(X-14,Y-26+bob); c.fill(); c.beginPath(); c.moveTo(X+22,Y-24+bob); c.lineTo(X+28,Y-38+bob); c.lineTo(X+14,Y-26+bob); c.fill(); }
  else if(u.type==='wisp'){ var wb=Math.sin(t*4+u.x)*5; var wg=c.createRadialGradient(X,Y-4+wb,0,X,Y-4+wb,24); wg.addColorStop(0,'#eafffa'); wg.addColorStop(.4,D.glow); wg.addColorStop(1,'rgba(90,255,208,0)'); c.fillStyle=wg; c.beginPath(); c.arc(X,Y-4+wb,24,0,TAU); c.fill(); c.fillStyle='#0a2a2a'; c.fillRect(X-6,Y-8+wb,3,5); c.fillRect(X+3,Y-8+wb,3,5); }
  c.globalAlpha=al;
  /* hp bar */
  if(!u.dead){ var hp=isP?g.hp:u.hp, mx=isP?g.maxHp:u.max, bw=44*big, by=Y-size*.9+22+bob-8*(big>1?1:0); if(!isP&&u.type==='wisp') by=Y-34; if(u.type==='archer') by=Y-42; if(u.type==='brute') by=Y-46;
    c.fillStyle='rgba(0,0,0,.65)'; c.fillRect(X-bw/2-1,by-1,bw+2,7); c.fillStyle=isP?'#6bff9a':'#ff5a7a'; c.fillRect(X-bw/2,by,bw*clamp(hp/mx,0,1),5);
    if(isP&&g.shield>0){ c.fillStyle='#7ad4ff'; c.fillRect(X-bw/2,by-4,bw*clamp(g.shield/10,0,1),3); c.font='13px Inter,sans-serif'; c.textAlign='left'; c.fillText('🛡️'+g.shield,X+bw/2+4,by+5); }
    if(isP&&g.empower){ c.fillStyle='#c9a0ff'; c.font='800 11px Inter,sans-serif'; c.textAlign='center'; c.fillText('+'+g.empower,X,by-8); }
    if(!isP){ var ic=intent(g,u); if(ic){ c.font='18px Inter,sans-serif'; c.textAlign='center'; c.fillText(ic,X,by-8+Math.sin(t*4)*2); } }
  }
  c.globalAlpha=1;
}
function intent(g,e){
  if(e.dead||g.phase==='ready') return ''; var p=g.p;
  if(e.type==='brute') return e.mark?'💥':(dist(e,p)<=2?'🔨':'👣');
  if(e.type==='archer') return aligned(g,e,4)?'🎯':'🏹';
  if(e.type==='wisp') return e.cd>0?'💤':'✨';
  if(e.type==='boss') return e.age%3===2?'🌀':'👑';
  return dist(e,p)===1?'⚔️':'👣';
}
function hud(g,c){
  c.setTransform(g.sc*g.dpr,0,0,g.sc*g.dpr,g.ox*g.dpr,g.oy*g.dpr); c.textBaseline='alphabetic';
  function T(s,x,y,sz,col,al){ c.textAlign=al||'left'; c.font='900 '+sz+'px Inter,sans-serif'; c.lineWidth=4; c.strokeStyle='rgba(0,0,0,.7)'; c.strokeText(s,x,y); c.fillStyle=col||'#fff'; c.fillText(s,x,y); }
  T('FLOOR '+g.floor+(g.floor%5===0?' · BOSS':''),16,28,20,'#e0d0ff'); T('Turn '+g.turn,16,48,13,'#a898d8');
  /* hp + energy */
  var hx=16, hy=LH-40; c.fillStyle='rgba(0,0,0,.55)'; c.beginPath(); rr(c,hx-6,hy-22,170,50,10); c.fill();
  c.fillStyle='rgba(0,0,0,.6)'; c.fillRect(hx,hy-14,150,12); c.fillStyle='#6bff9a'; c.fillRect(hx,hy-14,150*clamp(g.hp/g.maxHp,0,1),12); T('❤ '+Math.max(0,g.hp)+'/'+g.maxHp,hx+4,hy-4,11,'#fff');
  for(var i=0;i<g.energyMax;i++){ c.fillStyle=i<g.energy?'#ffd24a':'rgba(255,255,255,.18)'; c.beginPath(); c.arc(hx+10+i*26,hy+14,9,0,TAU); c.fill(); if(i<g.energy){ c.fillStyle='#7a5200'; c.font='900 12px Inter,sans-serif'; c.textAlign='center'; c.fillText('⚡',hx+10+i*26,hy+18); } }
  /* log */
  var ly=84; c.textAlign='left'; g.log.slice(0,5).forEach(function(l,i){ c.globalAlpha=1-i*.17; c.font='600 12px Inter,sans-serif'; c.fillStyle='#d8ccf5'; wrap(c,l,16,ly,160,15); ly+=(Math.ceil(c.measureText(l).width/150)+0)*15+6; }); c.globalAlpha=1;
  /* enemy list */
  var ex=LW-186, ey=60; g.enemies.forEach(function(e){ if(e.dead) return; var D=ENEMY[e.type]; c.fillStyle='rgba(20,10,40,.7)'; c.beginPath(); rr(c,ex,ey,172,46,10); c.fill(); c.strokeStyle=D.glow; c.lineWidth=1.5; c.beginPath(); rr(c,ex,ey,172,46,10); c.stroke(); T(D.name,ex+10,ey+17,12,'#fff'); c.fillStyle='rgba(0,0,0,.6)'; c.fillRect(ex+10,ey+25,120,8); c.fillStyle='#ff5a7a'; c.fillRect(ex+10,ey+25,120*clamp(e.hp/e.max,0,1),8); T(e.hp+'',ex+136,ey+33,12,'#fff'); c.font='16px Inter,sans-serif'; c.textAlign='right'; c.fillText(intent(g,e),ex+164,ey+20); ey+=52; });
  /* banner */
  if(g.bannerT>0){ var a=clamp(Math.min(g.bannerT,1.3-g.bannerT)*4,0,1); c.globalAlpha=a; T(g.banner,LW/2,BY+ROWS*CS/2,44,g.banner==='YOUR TURN'?'#9be8ff':'#ff7a8a','center'); c.globalAlpha=1; }
  /* selected hint */
  if(g.phase==='player'&&!g.busy){ var ab=AB.find(function(a2){ return a2.id===g.sel; }); T(ab?ab.icon+' '+ab.name+' — '+ab.desc:'Move: click a highlighted tile (Esc to reset)',LW/2,LH-12,13,'#d8ccf5','center'); }
}
function wrap(c,text,x,y,w,lh){ var words=text.split(' '), line='', yy=y; words.forEach(function(wd){ var tst=line+wd+' '; if(c.measureText(tst).width>w&&line){ c.fillText(line,x,yy); line=wd+' '; yy+=lh; } else line=tst; }); c.fillText(line,x,yy); }
})();
