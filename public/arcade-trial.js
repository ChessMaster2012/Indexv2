/* Trial of the Ancients v2 — a real side-scrolling platformer with four zones, hazards, enemies,
   checkpoints, wall-jump, dash, fullscreen. Overrides the arcade Trial hooks from the main script.
   Saves into gameProgress.trial. */
(function(){
'use strict';
var H=1100, TAU=Math.PI*2, LIQ=H-110;
var GRAV=2300, JUMP=800, DASHV=780, DASHT=.17, DASHCD=.85;
var clamp=function(n,a,b){ return Math.max(a,Math.min(b,n)); }, lerp=function(a,b,t){ return a+(b-a)*t; };
function $(id){ return document.getElementById(id); }
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; }; }
function rgb(a,al){ return al==null?'rgb('+(a[0]|0)+','+(a[1]|0)+','+(a[2]|0)+')':'rgba('+(a[0]|0)+','+(a[1]|0)+','+(a[2]|0)+','+al+')'; }
function mix(a,b,t){ return [lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)]; }

/* ------------------------------ zones / themes ------------------------------ */
var ZONES=[
  {n:'The Overgrown Ruins',sky:[[104,180,232],[228,242,206]],far:[116,158,150],mid:[74,116,98],face:[122,132,112],dark:[70,80,66],top:[116,200,92],liq:[44,112,98],liqTop:[110,190,150],mote:'#fff7a8'},
  {n:'The Sunken Halls',sky:[[28,86,126],[112,196,198]],far:[40,96,118],mid:[28,72,94],face:[98,130,142],dark:[54,82,96],top:[96,204,192],liq:[26,116,168],liqTop:[120,210,240],mote:'#bff3ff'},
  {n:'The Molten Forge',sky:[[54,16,28],[226,104,48]],far:[112,40,40],mid:[84,28,32],face:[132,94,84],dark:[78,50,48],top:[236,124,60],liq:[255,96,24],liqTop:[255,206,80],mote:'#ffb04a'},
  {n:'The Sky Sanctum',sky:[[60,42,124],[252,196,172]],far:[124,94,176],mid:[94,72,144],face:[172,162,204],dark:[110,100,152],top:[255,224,124],liq:[210,190,250],liqTop:[255,255,255],mote:'#ffffff'}
];

/* ------------------------------ sprite ------------------------------ */
var spriteCache={};
function playerSprite(){
  var id='ling-sugarbug', skinId='';
  try{ id=(state.progress.equipped&&state.progress.equipped.indexling)||id; skinId=(typeof getEquippedSkinId==='function'&&getEquippedSkinId(id))||''; }catch(e){}
  var key=id+'|'+skinId; if(spriteCache.key===key&&spriteCache.img) return spriteCache;
  var img=new Image(); spriteCache={key:key,img:img,col:'#b07cff',acc:'#fff'};
  try{
    var ling=cosmeticById(id)||cosmeticById('ling-sugarbug'), sk=skinId&&typeof skinById==='function'?skinById(skinId):null;
    spriteCache.col=(sk&&sk.main)||(ling&&ling.main)||'#b07cff'; spriteCache.acc=(sk&&sk.accent)||(ling&&ling.accent)||'#fff';
    var html=typeof indexlingArtHtml==='function'?indexlingArtHtml(ling,true,sk||{}):arcadeCharacterHtml(), m=html.match(/<svg[\s\S]*<\/svg>/);
    if(m){ var vars={}; html.replace(/(--[\w-]+)\s*:\s*([^;"]+)/g,function(_,k,v){ vars[k]=v.trim(); return _; });
      var svg=m[0].replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g,function(_,k){ return vars[k]||'#b07cff'; }).replace(/<svg\b/,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"');
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); }
  }catch(e){}
  return spriteCache;
}

/* ------------------------------ sound ------------------------------ */
var AC=null, sfxT={};
function muted(){ try{ return localStorage.getItem('gx-mute')==='1'; }catch(e){ return false; } }
function sfx(kind){
  if(muted()) return; var now=performance.now(); if(sfxT[kind]&&now-sfxT[kind]<50) return; sfxT[kind]=now;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume();
    var P={jump:[280,560,.12,'square',.05],land:[120,60,.06,'triangle',.06],coin:[880,1320,.1,'sine',.08],gem:[660,1500,.25,'triangle',.1],hurt:[200,60,.28,'sawtooth',.14],dash:[240,720,.12,'sawtooth',.06],stomp:[300,120,.12,'square',.09],spring:[200,900,.2,'sine',.1],cp:[440,880,.35,'triangle',.12],win:[520,1320,.6,'triangle',.14],crumble:[110,50,.2,'square',.05],dart:[700,400,.08,'square',.04],wall:[330,520,.1,'triangle',.06],tick:[900,900,.05,'square',.05]}[kind]; if(!P) return;
    var o=AC.createOscillator(), gn=AC.createGain(), t=AC.currentTime;
    o.type=P[3]; o.frequency.setValueAtTime(P[0],t); o.frequency.exponentialRampToValueAtTime(Math.max(30,P[1]),t+P[2]);
    gn.gain.setValueAtTime(P[4],t); gn.gain.exponentialRampToValueAtTime(.0001,t+P[2]); o.connect(gn); gn.connect(AC.destination); o.start(t); o.stop(t+P[2]+.02);
  }catch(e){}
}

/* ------------------------------ level ------------------------------ */
function buildLevel(){
  var L={solids:[],spikes:[],saws:[],pends:[],jets:[],turrets:[],walkers:[],bats:[],coins:[],gems:[],crystals:[],hearts:[],springs:[],cps:[],zoneX:[],signs:[],relic:null,end:0};
  var cx=0, gy=760;
  function G(len,dy){ gy+=(dy||0); var s={x:cx,y:gy,w:len,h:H-gy,k:'g'}; L.solids.push(s); cx+=len; return s; }
  function gap(w){ cx+=w; }
  function P(x,y,w){ var s={x:x,y:y,w:w,h:22,k:'p'}; L.solids.push(s); return s; }
  function C(x,y,w){ var s={x:x,y:y,w:w,h:22,k:'c',st:0,t:0,oy:y,fall:0}; L.solids.push(s); return s; }
  function M(x,y,w,x1,y1,spd,ph){ var s={x:x,y:y,w:w,h:22,k:'m',x0:x,y0:y,x1:x1,y1:y1,spd:spd,ph:ph||0,dx:0,dy:0}; L.solids.push(s); return s; }
  function spikes(x,y,w){ L.spikes.push({x:x,y:y,w:w}); }
  function saw(x,y,r,x1,y1,spd,ph){ L.saws.push({x0:x,y0:y,x1:x1,y1:y1,r:r,spd:spd,ph:ph||0,x:x,y:y,a:0}); }
  function pend(px,py,len,amp,spd,ph){ L.pends.push({px:px,py:py,len:len,amp:amp,spd:spd,ph:ph||0,x:px,y:py+len}); }
  function jet(x,y,per,on,off){ L.jets.push({x:x,y:y,per:per,on:on,off:off,fire:false,warn:false}); }
  function turret(x,y,dir,per,off){ L.turrets.push({x:x,y:y,dir:dir,per:per,off:off||0,cd:per*.5+(off||0)}); }
  function walker(x,y,x0,x1){ L.walkers.push({x:x,y:y,x0:x0,x1:x1,dir:1,alive:true,sq:0}); }
  function bat(x,y,amp,rng,ph){ L.bats.push({x:x,y:y,y0:y,x0:x,amp:amp,rng:rng,ph:ph||0,alive:true}); }
  function coin(x,y){ L.coins.push({x:x,y:y,got:false}); }
  function coinLine(x,y,n,dx,dy){ for(var i=0;i<n;i++) coin(x+i*dx,y+i*(dy||0)); }
  function coinArc(x,y,n,w,h){ for(var i=0;i<n;i++){ var t=n===1?.5:i/(n-1); coin(x+t*w,y-Math.sin(t*Math.PI)*h); } }
  function gem(x,y){ L.gems.push({x:x,y:y,got:false}); }
  function crystal(x,y){ L.crystals.push({x:x,y:y,got:false}); }
  function heart(x,y){ L.hearts.push({x:x,y:y,got:false}); }
  function spring(x,y,w){ L.springs.push({x:x,y:y,w:w||44,sq:0}); }
  function cp(x,y){ L.cps.push({x:x,y:y,on:false}); }
  function sign(x,y,t){ L.signs.push({x:x,y:y,t:t}); }
  function zone(){ L.zoneX.push(cx); }

  /* ===== ZONE 1 — Overgrown Ruins ===== */
  zone();
  var s=G(560); coinLine(s.x+200,gy-30,5,40); sign(s.x+90,gy,'MOVE ▶ / JUMP ⤒');
  gap(120); s=G(320); spikes(s.x+120,gy,70); coinArc(s.x+70,gy-40,7,200,90);
  s=G(280,-70); coinLine(s.x+60,gy-34,5,38);
  s=G(420,0); walker(s.x+210,gy,s.x+40,s.x+380); coinLine(s.x+60,gy-34,6,52);
  var px=cx; gap(90); P(cx,gy-50,110); coin(cx+55,gy-90); cx+=110+90; P(cx,gy-100,110); coin(cx+55,gy-140); cx+=110+90; P(cx,gy-50,110); coin(cx+55,gy-90); cx+=110+90;
  s=G(480,0); cp(s.x+70,gy); spring(s.x+200,gy,50); P(s.x+300,gy-220,170); gem(s.x+385,gy-265); coinLine(s.x+316,gy-250,4,40); walker(s.x+420,gy,s.x+360,s.x+470);
  sign(s.x+150,gy,'SPRING ⤴');
  gap(70); for(var i=0;i<4;i++){ C(cx,gy+(i%2?-30:0),100); cx+=100+70; } cx-=70;
  s=G(420,0); bat(s.x+210,gy-150,40,140); spikes(s.x+90,gy,50); spikes(s.x+280,gy,50); coinArc(s.x+40,gy-40,6,170,80); coinArc(s.x+240,gy-40,6,150,80);
  s=G(300,-60); heart(s.x+150,gy-50);

  /* ===== ZONE 2 — Sunken Halls ===== */
  zone();
  gap(150); s=G(300,0); turret(s.x+290,gy,-1,1.9); coinLine(s.x+30,gy-34,5,40); sign(s.x+10,gy,'DARTS! JUMP');
  gap(140); s=G(220,-60); coin(s.x+100,gy-50);
  M(cx+20,gy,110,cx+260,gy,90,0); coinLine(cx+60,gy-60,5,50,0); gap(380);
  s=G(300,0); spikes(s.x+60,gy,60); walker(s.x+190,gy,s.x+130,s.x+280); pend(s.x+160,gy-340,270,1.0,1.7,0); coinLine(s.x+40,gy-34,6,44);
  /* wall-jump shaft */
  s=G(240,0); sign(s.x+120,gy,'WALL JUMP ↓'); var topY=gy;
  gy+=250; var shaft=G(190,0); gy=topY; coinLine(shaft.x+50,gy+30,4,30,60); coin(shaft.x+95,gy+180); cx=shaft.x+shaft.w; gy=topY-0; var exit=G(320,0); /* exit ledge at original height */
  cp(exit.x+80,gy); heart(exit.x+250,gy-40);
  s=exit; turret(s.x+310,gy,-1,2.2,.6);
  gap(240); sign(cx-120,gy-60,'DASH ▶▶'); s=G(260,0); walker(s.x+130,gy,s.x+40,s.x+220); coinArc(s.x+10,gy-50,5,230,60);
  gap(110); P(cx,gy-60,100); cx+=100; gap(100); P(cx,gy-120,100); gem(cx+50,gy-165); cx+=100; gap(90); s=G(300,-70);
  bat(s.x+150,gy-140,50,120); bat(s.x+260,gy-200,30,100,1.5); coinLine(s.x+30,gy-34,6,44);

  /* ===== ZONE 3 — Molten Forge ===== */
  zone();
  gap(120); s=G(340,0); jet(s.x+120,gy,2.4,.9,0); jet(s.x+230,gy,2.4,.9,1.2); coinLine(s.x+40,gy-40,6,52);
  gap(120); s=G(300,0); saw(s.x+20,gy-24,24,s.x+270,gy-24,1.8,0); coinArc(s.x+30,gy-80,6,240,60);
  gap(130); M(cx,gy,110,cx,gy-110,70,0); M(cx+210,gy-110,110,cx+210,gy+20,70,1.5); gap(110+100+110+100);
  s=G(380,-40); walker(s.x+200,gy,s.x+40,s.x+340); pend(s.x+110,gy-330,280,.9,1.9,0); pend(s.x+280,gy-330,280,.9,1.9,2.2); turret(s.x+360,gy,-1,2.0,.2); coinLine(s.x+30,gy-34,7,46); crystal(s.x+190,gy-60);
  gap(130); for(i=0;i<5;i++){ C(cx,gy-i*0-(i%2?40:0),90); cx+=90+60; } cx-=60;
  s=G(240,0); cp(s.x+60,gy); heart(s.x+170,gy-40);
  gap(250); sign(cx-130,gy-70,'DASH ▶▶'); s=G(280,0); saw(s.x+140,gy-200,24,s.x+140,gy-30,1.5,0); coinArc(s.x+10,gy-60,5,250,70);
  gap(100); s=G(560,0); jet(s.x+110,gy,2.2,.8,0); jet(s.x+220,gy,2.2,.8,.8); jet(s.x+330,gy,2.2,.8,1.6); jet(s.x+440,gy,2.2,.8,.4); coinLine(s.x+60,gy-120,9,50);

  /* ===== ZONE 4 — Sky Sanctum ===== */
  zone();
  gap(110); s=G(220,0); cp(s.x+50,gy); coinLine(s.x+110,gy-34,3,40);
  M(cx+40,gy,110,cx+300,gy-40,90,0); gap(430);
  s=G(180,-40); cp(s.x+140,gy); spring(s.x+60,gy,50); P(s.x+170,gy-220,160); coinLine(s.x+190,gy-260,3,44); gem(s.x+250,gy-265);
  P(s.x+400,gy-220,120); bat(s.x+330,gy-340,40,180);
  /* sky climb */
  var cy2=gy-220; var cxx=s.x+520; M(cxx+60,cy2,110,cxx+60,cy2-170,80,0); M(cxx+260,cy2-170,110,cxx+260,cy2-340,80,1.6);
  C(cxx+470,cy2-340,100); C(cxx+630,cy2-340,100); C(cxx+790,cy2-340,100); bat(cxx+560,cy2-440,40,160,1);
  var fx=cxx+940; var fy=cy2-340; cx=fx; gy=fy; s=G(260,0); s.h=H-gy; cp(s.x+60,gy);
  gap(120); M(cx,gy,110,cx+140,gy,70,0); gap(300); s=G(240,0); spikes(s.x+60,gy,50); walker(s.x+170,gy,s.x+110,s.x+220);
  gap(150); C(cx,gy,100); cx+=170; C(cx,gy-20,100); cx+=170; C(cx,gy,100); cx+=170;
  s=G(560,0); heart(s.x+100,gy-40); coinLine(s.x+60,gy-34,8,46); L.relic={x:s.x+470,y:gy}; L.end=s.x+s.w;
  /* the world must be tall enough for the sky climb */
  L.coinsTotal=L.coins.length+L.gems.length*5;
  return L;
}

/* ------------------------------ game state ------------------------------ */
window.arcadeTrialStart=function(){
  clearGameTimers();
  var s=arcadeCharacterStats(), L=buildLevel(), sp=L.solids[0];
  var maxH=3+Math.floor((s.vitality||3)/3);
  var g={L:L,phase:'ready',t:0,time:0,limit:260,hearts:maxH,maxH:maxH,coins:0,gems:0,score:0,kills:0,deaths:0,
    run:290*(.92+.04*(s.speed||2)),
    p:{x:90,y:sp.y,vx:0,vy:0,face:1,ground:null,coy:0,jbuf:0,jcut:false,dashT:0,dashCd:0,airDash:false,inv:0,wall:0,wlock:0,sq:1,sqv:0,anim:0,hist:[],hT:0,wasG:true,spawn:{x:90,y:sp.y}},
    cam:{x:0,y:600},keys:{},btn:{},darts:[],parts:[],texts:[],ghosts:[],shake:0,flash:0,banner:'',bannerT:0,zone:-1,s:s,freeze:0,dead:false,mouse:0};
  state.games={active:'trial',keys:{},tr:g};
};
window.arcadeTrialFinish=function(){ var g=state.games&&state.games.tr; if(g&&g.phase!=='over'&&g.phase!=='win') end(g,false,'quit'); };
window.arcadeTrialLoop=function(){}; window.arcadeTrialJump=function(){}; window.arcadeTrialDash=function(){};

window.arcadeTrialHtml=function(){
  var g=state.games.tr; if(!g) return ''; setTimeout(mount,0);
  var tp=arcadeGameProgress().trial||{};
  var stats='<span class="arcade-pill">🏆 Best <b>'+(tp.best||0)+'</b></span><span class="arcade-pill">⏱ Best time <b>'+(tp.bestTime?tp.bestTime+'s':'—')+'</b></span><span class="arcade-pill">⭐ Stars <b>'+(tp.stars||0)+'/3</b></span>';
  return arcadeFrame('Trial of the Ancients','A/D or arrows run · W/Space jump (hold = higher) · Shift dash · slide on walls and jump off · F fullscreen',stats,
    '<div class="gx-wrap" id="tr-wrap"><canvas id="tr-canvas" width="1000" height="560"></canvas><div class="gx-ov" id="tr-ov"></div>'+
    '<div class="gx-tools"><button class="gx-mute" id="tr-mute" type="button" aria-label="Toggle sound">'+(muted()?'🔇':'🔊')+'</button><button class="gx-mute" id="tr-fs" type="button" aria-label="Fullscreen" title="Fullscreen (F)">⛶</button></div>'+
    '<div class="gx-touch"><div class="gx-btns left"><button data-tr="left" type="button">◀</button><button data-tr="right" type="button">▶</button></div><div class="gx-btns"><button data-tr="dash" type="button">💨</button><button data-tr="jump" type="button" class="big">⤒</button></div></div></div>');
};

/* ------------------------------ mount / sizing / input ------------------------------ */
var loopId=0;
function mount(){
  var g=state.games&&state.games.tr, cv=$('tr-canvas'); if(!g||!cv||state.games.active!=='trial') return;
  g.cv=cv; g.ctx=cv.getContext('2d'); g.ov=$('tr-ov'); g.wrap=$('tr-wrap'); g.sp=playerSprite(); g.pat={};
  wire(g); fit(g); overlay(g); cancelAnimationFrame(loopId); g.last=performance.now();
  (function frame(t){
    var cur=state.games&&state.games.tr; if(cur!==g||!document.body.contains(cv)||state.games.active!=='trial') return;
    var dt=Math.min(.05,(t-g.last)/1000); g.last=t;
    try{ if(g.phase==='play'){ var n=Math.ceil(dt/(1/120)); for(var i=0;i<n;i++) step(g,dt/n); } else { g.t+=dt; ambient(g,dt); } draw(g); }catch(e){ console.error(e); }
    loopId=requestAnimationFrame(frame);
  })(g.last);
}
function isFS(){ var st=document.getElementById('games-stage'); return !!st&&(document.fullscreenElement===st||document.webkitFullscreenElement===st); }
function fit(g){
  var wrap=g.wrap; if(!wrap) return; var fs=isFS();
  var cssW=fs?window.innerWidth:wrap.clientWidth, cssH=fs?window.innerHeight:Math.round(cssW*9/16); if(!cssW) return;
  var dpr=Math.min(window.devicePixelRatio||1,1.5); g.dpr=dpr;
  g.vh=cssH<300?420:cssH<450?500:620; g.vw=g.vh*cssW/cssH;
  g.cv.width=Math.round(cssW*dpr); g.cv.height=Math.round(cssH*dpr); g.cv.style.width=cssW+'px'; g.cv.style.height=cssH+'px'; g.fs=fs;
  var b=$('tr-fs'); if(b) b.textContent=fs?'🗗':'⛶';
}
function toggleFS(g){ var w=document.getElementById('games-stage'); if(!w) return; try{ if(isFS()) (document.exitFullscreen||document.webkitExitFullscreen).call(document); else (w.requestFullscreen||w.webkitRequestFullscreen).call(w); }catch(e){} }
function wire(g){
  var wrap=g.wrap; if(!wrap||wrap.__tr===g) return; wrap.__tr=g;
  wrap.addEventListener('click',function(e){
    var t=e.target.closest?e.target:null; if(!t) return;
    if(t.closest('[data-tr-start]')){ begin(g); return; }
    if(t.closest('[data-tr-resume]')){ togglePause(g); return; }
    if(t.closest('#tr-fs,[data-tr-fs]')){ toggleFS(g); return; }
    if(t.closest('#tr-mute')){ try{ localStorage.setItem('gx-mute',muted()?'0':'1'); }catch(er){} $('tr-mute').textContent=muted()?'🔇':'🔊'; }
  });
  if(window.ResizeObserver){ new ResizeObserver(function(){ fit(g); }).observe(wrap); }
  wrap.querySelectorAll('[data-tr]').forEach(function(b){
    var a=b.getAttribute('data-tr');
    b.addEventListener('pointerdown',function(e){ e.preventDefault(); if(g.phase==='ready') begin(g); if(a==='dash') dash(g); else if(a==='jump'){ g.btn.jump=true; g.p.jbuf=.13; } else g.btn[a]=true; });
    var up=function(){ if(a==='jump'){ g.btn.jump=false; } else if(a!=='dash') g.btn[a]=false; };
    b.addEventListener('pointerup',up); b.addEventListener('pointercancel',up); b.addEventListener('pointerleave',up);
  });
}
function onFS(){ var g=state.games&&state.games.tr; if(g) setTimeout(function(){ fit(g); },60); }
document.addEventListener('fullscreenchange',onFS); document.addEventListener('webkitfullscreenchange',onFS);
function keyDown(e){
  var gm=state.games; if(state.view!=='games'||!gm||gm.active!=='trial'||!gm.tr) return; var g=gm.tr, k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k)>=0) e.preventDefault();
  if(k==='f'){ toggleFS(g); return; }
  if(k==='p'||k==='escape'){ togglePause(g); return; }
  if(g.phase==='ready'&&(k===' '||k==='enter'||k==='arrowright'||k==='d')){ begin(g); }
  if(e.repeat) return; g.keys[k]=true;
  if(k===' '||k==='w'||k==='arrowup'||k==='z') g.p.jbuf=.13;
  if(k==='shift'||k==='x') dash(g);
}
function keyUp(e){ var gm=state.games; if(!gm||!gm.tr) return; gm.tr.keys[e.key.toLowerCase()]=false; }
document.addEventListener('keydown',keyDown,true); document.addEventListener('keyup',keyUp,true);
window.addEventListener('blur',function(){ var g=state.games&&state.games.tr; if(g&&g.phase==='play') togglePause(g); });
function begin(g){ if(g.phase!=='ready') return; g.phase='play'; g.last=performance.now(); overlay(g); banner(g,'ZONE 1 — '+ZONES[0].n); }
function togglePause(g){ if(g.phase==='play'){ g.phase='pause'; overlay(g); } else if(g.phase==='pause'){ g.phase='play'; g.last=performance.now(); overlay(g); } }
function banner(g,t){ g.banner=t; g.bannerT=2.6; }

/* ------------------------------ overlays ------------------------------ */
function overlay(g){
  var o=g.ov; if(!o) return; var h='';
  if(g.phase==='ready'){
    var tp=arcadeGameProgress().trial||{};
    h='<div class="gx-card"><h2>🏃 Trial of the Ancients</h2><p>Cross four ancient zones, dodge traps, stomp guardians and claim the relic before time runs out.</p><ul class="gx-keys"><li><kbd>A/D</kbd> or <kbd>←/→</kbd> run</li><li><kbd>W</kbd> / <kbd>Space</kbd> jump — hold for height</li><li><kbd>Shift</kbd> dash (also crosses wide gaps)</li><li>Slide on walls, then jump to leap off them</li><li>Stomp enemies · collect 🪙 and 💎 · ⏳ adds time · altars are checkpoints</li><li><kbd>F</kbd> fullscreen · <kbd>P</kbd> pause</li></ul><p class="gx-stats">'+g.maxH+' hearts (Vitality) · run speed (Speed '+g.s.speed.toFixed(1)+') · '+g.limit+'s on the clock'+(tp.bestTime?' · best '+tp.bestTime+'s':'')+'</p><div class="gx-endbtns"><button class="btn btn-primary btn-lg" data-tr-start>Start trial</button><button class="btn btn-ghost" data-tr-fs type="button">⛶ Fullscreen</button></div></div>';
  } else if(g.phase==='pause'){
    h='<div class="gx-card"><h2>⏸ Paused</h2><div class="gx-endbtns"><button class="btn btn-primary btn-lg" data-tr-resume>Resume</button><button class="btn btn-ghost" data-tr-fs type="button">⛶ Fullscreen</button><button class="btn btn-ghost" data-action="arcade-hub">← All games</button></div></div>';
  } else if(g.phase==='win'||g.phase==='over'){
    var tp2=arcadeGameProgress().trial||{}, st=''; for(var i=0;i<3;i++) st+=(i<g.stars?'★':'☆');
    h='<div class="gx-card wide"><h2>'+(g.phase==='win'?'🏆 Relic claimed!':(g.why==='hearts'?'💀 Out of hearts':'⌛ Time expired'))+'</h2>'+(g.phase==='win'?'<div style="font-size:42px;color:#ffd24a;letter-spacing:6px">'+st+'</div>':'')+'<div class="gx-res"><div><b>'+g.score+'</b><span>Score</span></div><div><b>'+Math.round(g.time)+'s</b><span>Time</span></div><div><b>'+g.coins+'/'+g.L.coinsTotal+'</b><span>Coins</span></div><div><b>'+g.kills+'</b><span>Stomps</span></div></div>'+(g.newBest?'<p class="gx-newbest">⭐ New personal best!</p>':'<p class="gx-fine">Personal best: '+(tp2.best||0)+'</p>')+'<p class="gx-fine">Reached '+ZONES[Math.max(0,g.zone)].n+'</p><div class="gx-endbtns"><button class="btn btn-primary btn-lg" data-action="arcade-trial-replay">Play again</button><button class="btn btn-ghost" data-action="arcade-hub">← All games</button></div></div>';
  }
  o.innerHTML=h; o.style.display=h?'flex':'none';
}
function end(g,win,why){
  if(g.phase==='win'||g.phase==='over') return; g.phase=win?'win':'over'; g.why=why;
  if(win){ g.score+=Math.round(Math.max(0,g.limit-g.time))*5+g.hearts*100; var left=g.limit-g.time; g.stars=1+(left>=90?1:0)+(g.coins>=g.L.coinsTotal*.75?1:0); sfx('win'); try{ celebrate(); }catch(e){} }
  var gp=arcadeGameProgress(); gp.trial=gp.trial||{best:0};
  g.newBest=g.score>(Number(gp.trial.best)||0);
  gp.trial.best=Math.max(Number(gp.trial.best)||0,g.score);
  if(win){ gp.trial.bestTime=gp.trial.bestTime?Math.min(Number(gp.trial.bestTime),Math.round(g.time)):Math.round(g.time); gp.trial.stars=Math.max(Number(gp.trial.stars)||0,g.stars); gp.trial.wins=(Number(gp.trial.wins)||0)+1; }
  gp.trial.runs=(Number(gp.trial.runs)||0)+1; gp.trial.coins=(Number(gp.trial.coins)||0)+g.coins; gp.trial.bestZone=Math.max(Number(gp.trial.bestZone)||0,g.zone+1);
  try{ persistProgress(); }catch(e){}
  setTimeout(function(){ if(state.games&&state.games.tr===g) overlay(g); },win?900:600);
}

/* ------------------------------ physics ------------------------------ */
var PW=13, PH=40;
function hit(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by; }
function circRect(cx,cy,r,rx,ry,rw,rh){ var nx=clamp(cx,rx,rx+rw), ny=clamp(cy,ry,ry+rh); return (cx-nx)*(cx-nx)+(cy-ny)*(cy-ny)<r*r; }
function solidAlive(s){ return !(s.k==='c'&&s.st===2); }
function dash(g){
  var p=g.p; if(g.phase!=='play'||p.dashCd>0||p.airDash) return;
  var d=(g.keys['d']||g.keys['arrowright']||g.btn.right?1:0)-(g.keys['a']||g.keys['arrowleft']||g.btn.left?1:0); if(d) p.face=d;
  p.dashT=DASHT; p.dashCd=DASHCD; if(!p.ground) p.airDash=true; p.vy=0; sfx('dash');
}
function hurt(g,src){
  var p=g.p; if(p.inv>0||p.dashT>0||g.phase!=='play') return;
  g.hearts--; p.inv=1.6; g.shake=.35; g.flash=.35; sfx('hurt'); g.deaths++;
  spawnParts(g,p.x,p.y-20,14,'#ff5a6a',220);
  floatText(g,p.x,p.y-60,'-1 ❤️','#ff7a8a');
  if(g.hearts<=0){ end(g,false,'hearts'); return; }
  if(src==='enemy'){ p.vy=-440; p.vx=-p.face*220; }
  else { var h=p.hist.length?p.hist[0]:p.spawn; p.x=h.x; p.y=h.y; p.vx=0; p.vy=0; p.dashT=0; g.freeze=.25; g.cam.x=p.x-g.vw*.4; }
}
function step(g,dt){
  var L=g.L, p=g.p; g.t+=dt; g.time+=dt;
  if(g.time>=g.limit){ g.time=g.limit; end(g,false,'time'); return; }
  if(g.freeze>0){ g.freeze-=dt; return; }
  if(g.bannerT>0) g.bannerT-=dt; if(g.shake>0) g.shake-=dt; if(g.flash>0) g.flash-=dt;
  if(Math.floor(g.limit-g.time)<=10&&Math.floor(g.limit-g.time)!==g._tk){ g._tk=Math.floor(g.limit-g.time); sfx('tick'); }
  /* movers */
  L.solids.forEach(function(s){
    if(s.k==='m'){ var k=(Math.sin(g.t*s.spd/60+s.ph)+1)/2, nx=lerp(s.x0,s.x1,k), ny=lerp(s.y0,s.y1,k); s.dx=nx-s.x; s.dy=ny-s.y; s.x=nx; s.y=ny; }
    else if(s.k==='c'){
      if(s.st===0&&p.ground===s){ s.st=1; s.t=.55; sfx('crumble'); }
      else if(s.st===1){ s.t-=dt; if(s.t<=0){ s.st=2; s.t=3; s.fall=0; if(p.ground===s) p.ground=null; spawnParts(g,s.x+s.w/2,s.y,10,'#9a8a70',160); } }
      else if(s.st===2){ s.t-=dt; s.fall+=dt*500; if(s.t<=0){ s.st=0; s.fall=0; } }
    }
  });
  if(p.ground&&p.ground.k==='m'){ p.x+=p.ground.dx; p.y=p.ground.y; }
  /* input */
  var K=g.keys, dir=((K['d']||K['arrowright']||g.btn.right)?1:0)-((K['a']||K['arrowleft']||g.btn.left)?1:0);
  var jh=K[' ']||K['w']||K['arrowup']||K['z']||g.btn.jump;
  if(p.inv>0) p.inv-=dt; if(p.dashCd>0) p.dashCd-=dt; if(p.wlock>0) p.wlock-=dt; if(p.jbuf>0) p.jbuf-=dt; if(p.coy>0) p.coy-=dt;
  /* dash */
  if(p.dashT>0){
    p.dashT-=dt; p.vx=p.face*DASHV; p.vy=0; g.ghosts.push({x:p.x,y:p.y,f:p.face,a:.5});
  } else {
    if(p.wlock<=0){
      var tv=dir*g.run, ac=p.ground?(dir?2800:3200):(dir?1700:700);
      if(p.vx<tv) p.vx=Math.min(tv,p.vx+ac*dt); else if(p.vx>tv) p.vx=Math.max(tv,p.vx-ac*dt);
      if(dir) p.face=dir;
    }
    p.vy=Math.min(900,p.vy+GRAV*dt);
    if(p.wall&&!p.ground&&p.vy>0&&dir===p.wall) p.vy=Math.min(p.vy,140);
  }
  if(p.ground){ p.coy=.1; p.airDash=false; }
  /* jump */
  if(p.jbuf>0){
    if(p.coy>0){ p.vy=-JUMP; p.coy=0; p.jbuf=0; p.ground=null; p.jcut=false; p.sqv=-.25; sfx('jump'); spawnParts(g,p.x,p.y,5,'#d8d0b8',90); }
    else if(p.wall&&!p.ground){ p.vy=-JUMP*.97; p.vx=-p.wall*340; p.face=-p.wall; p.wlock=.17; p.jbuf=0; p.jcut=false; p.airDash=false; sfx('wall'); spawnParts(g,p.x+p.wall*PW,p.y-20,6,'#d8d0b8',100); }
  }
  if(!jh&&p.vy<-260&&!p.jcut&&p.dashT<=0){ p.vy*=.55; p.jcut=true; }
  /* X move */
  var prevY=p.y; p.x+=p.vx*dt;
  for(var i=0;i<L.solids.length;i++){ var s=L.solids[i]; if(s.k!=='g') continue; if(hit(p.x-PW,p.y-PH,PW*2,PH,s.x,s.y,s.w,s.h)){ if(p.vx>0||(p.vx===0&&p.x<s.x+s.w/2)) p.x=s.x-PW; else p.x=s.x+s.w+PW; p.vx=0; } }
  if(p.x<PW) p.x=PW; if(p.x>L.end+30) p.x=L.end+30;
  /* Y move */
  var wasG=!!p.ground; p.ground=null; p.y+=p.vy*dt;
  for(i=0;i<L.solids.length;i++){
    s=L.solids[i]; if(!solidAlive(s)) continue; var fy=s.k==='c'&&s.st===2?s.y+s.fall:s.y;
    if(!(p.x+PW>s.x&&p.x-PW<s.x+s.w)) continue;
    if(s.k==='g'){
      if(hit(p.x-PW,p.y-PH,PW*2,PH,s.x,s.y,s.w,s.h)){ if(p.vy>=0&&prevY<=s.y+10){ p.y=s.y; p.vy=0; p.ground=s; } else if(p.vy<0){ p.y=s.y+s.h+PH; p.vy=0; } }
    } else if(p.vy>=0&&p.y>=s.y&&prevY<=s.y+8+Math.abs(s.dy||0)+(s.k==='m'?6:0)&&p.y<=s.y+s.h+20){ p.y=s.y; p.vy=0; p.ground=s; }
  }
  if(p.ground&&!wasG){ p.sqv=.3; sfx('land'); spawnParts(g,p.x,p.y,4,'#d8d0b8',70); }
  /* wall contact */
  p.wall=0; if(!p.ground){ for(i=0;i<L.solids.length;i++){ s=L.solids[i]; if(s.k!=='g') continue;
    if(hit(p.x+PW,p.y-PH+6,3,PH-12,s.x,s.y,s.w,s.h)) p.wall=1; else if(hit(p.x-PW-3,p.y-PH+6,3,PH-12,s.x,s.y,s.w,s.h)) p.wall=-1; } }
  if(p.wall&&!p.ground&&p.vy>0&&Math.random()<.3) spawnParts(g,p.x+p.wall*PW,p.y-30,1,'#d8d0b8',40);
  /* safe-spot history */
  if(p.ground&&p.ground.k==='g'){ p.hT-=dt; if(p.hT<=0){ p.hT=.15; p.hist.push({x:p.x,y:p.y}); if(p.hist.length>6) p.hist.shift(); } }
  p.anim+=dt*(Math.abs(p.vx)/60); p.sqv-=p.sqv*Math.min(1,dt*12); p.sq=1+p.sqv*.6;
  if(p.y>H+80) hurt(g,'pit');
  /* hazards */
  var bx=p.x-PW+3, by=p.y-PH+4, bw=PW*2-6, bh=PH-6;
  L.spikes.forEach(function(sp){ if(hit(bx,by,bw,bh,sp.x+4,sp.y-20,sp.w-8,20)) hurt(g,'spike'); });
  L.saws.forEach(function(sw){ var k=(Math.sin(g.t*sw.spd+sw.ph)+1)/2; sw.x=lerp(sw.x0,sw.x1,k); sw.y=lerp(sw.y0,sw.y1,k); sw.a+=dt*10; if(circRect(sw.x,sw.y,sw.r-3,bx,by,bw,bh)) hurt(g,'saw'); });
  L.pends.forEach(function(pd){ var a=pd.amp*Math.sin(g.t*pd.spd+pd.ph); pd.a=a; pd.x=pd.px+Math.sin(a)*pd.len; pd.y=pd.py+Math.cos(a)*pd.len; if(circRect(pd.x,pd.y,24,bx,by,bw,bh)) hurt(g,'pend'); });
  L.jets.forEach(function(j){ var ph=((g.t+j.off)%j.per); j.fire=ph<j.on; j.warn=!j.fire&&ph>j.per-.55; if(j.fire&&hit(bx,by,bw,bh,j.x-17,j.y-150,34,150)) hurt(g,'fire'); if(j.fire&&Math.random()<.5) spawnParts(g,j.x+(Math.random()-.5)*20,j.y-Math.random()*120,1,'#ffb04a',60); });
  L.turrets.forEach(function(t){ t.cd-=dt; if(t.cd<=0){ t.cd=t.per; g.darts.push({x:t.x+t.dir*20,y:t.y-24,vx:t.dir*380}); sfx('dart'); } });
  for(i=g.darts.length-1;i>=0;i--){ var d=g.darts[i]; d.x+=d.vx*dt; var dead=Math.abs(d.x-p.x)>1400;
    L.solids.forEach(function(s2){ if(s2.k==='g'&&hit(d.x-8,d.y-3,16,6,s2.x,s2.y,s2.w,s2.h)) dead=true; });
    if(hit(bx,by,bw,bh,d.x-8,d.y-3,16,6)){ hurt(g,'enemy'); dead=true; }
    if(dead){ g.darts.splice(i,1); } }
  /* enemies */
  function stomp(e,ex,ey,w,h){ if(p.vy>80&&p.y-8<ey+h*.5&&p.dashT<=0){ e.alive=false; g.kills++; g.score+=50; p.vy=-640; p.jcut=true; p.airDash=false; sfx('stomp'); spawnParts(g,ex,ey,12,'#9be06a',200); floatText(g,ex,ey-30,'+50','#fff'); return true; } return false; }
  L.walkers.forEach(function(w){ if(!w.alive) return; w.x+=w.dir*55*dt; if(w.x<w.x0){ w.x=w.x0; w.dir=1; } if(w.x>w.x1){ w.x=w.x1; w.dir=-1; } w.sq=Math.sin(g.t*8+w.x)*.1;
    if(hit(bx,by,bw,bh,w.x-16,w.y-26,32,26)){ if(!stomp(w,w.x,w.y-26,32,26)) hurt(g,'enemy'); else if(p.dashT>0){} } });
  L.bats.forEach(function(b){ if(!b.alive) return; b.x=b.x0+Math.sin(g.t*1.3+b.ph)*b.rng; b.y=b.y0+Math.sin(g.t*2.6+b.ph)*b.amp;
    if(hit(bx,by,bw,bh,b.x-16,b.y-12,32,24)){ if(!stomp(b,b.x,b.y-12,32,24)) hurt(g,'enemy'); } });
  /* pickups */
  L.coins.forEach(function(c){ if(!c.got&&Math.abs(c.x-p.x)<28&&Math.abs(c.y-(p.y-20))<34){ c.got=true; g.coins++; g.score+=10; sfx('coin'); spawnParts(g,c.x,c.y,4,'#ffd24a',90); } });
  L.gems.forEach(function(c){ if(!c.got&&Math.abs(c.x-p.x)<32&&Math.abs(c.y-(p.y-20))<38){ c.got=true; g.coins+=5; g.gems++; g.score+=50; sfx('gem'); spawnParts(g,c.x,c.y,14,'#7ae8ff',200); floatText(g,c.x,c.y-20,'+50 💎','#7ae8ff'); } });
  L.crystals.forEach(function(c){ if(!c.got&&Math.abs(c.x-p.x)<32&&Math.abs(c.y-(p.y-20))<38){ c.got=true; g.limit+=10; g.score+=25; sfx('gem'); spawnParts(g,c.x,c.y,12,'#ffe08a',180); floatText(g,c.x,c.y-20,'+10s ⏳','#ffe08a'); } });
  L.hearts.forEach(function(c){ if(!c.got&&g.hearts<g.maxH&&Math.abs(c.x-p.x)<32&&Math.abs(c.y-(p.y-20))<38){ c.got=true; g.hearts++; sfx('gem'); spawnParts(g,c.x,c.y,10,'#ff6a8a',150); floatText(g,c.x,c.y-20,'+1 ❤️','#ff9aaa'); } });
  L.springs.forEach(function(sp){ if(sp.sq>0) sp.sq-=dt*4; if(p.vy>=0&&hit(bx,by,bw,bh,sp.x,sp.y-18,sp.w,18)){ p.vy=-1100; p.jcut=true; p.airDash=false; p.ground=null; sp.sq=1; sfx('spring'); spawnParts(g,sp.x+sp.w/2,sp.y-10,8,'#ffd24a',160); } });
  L.cps.forEach(function(c){ if(!c.on&&Math.abs(p.x-c.x)<40&&Math.abs(p.y-c.y)<80){ c.on=true; p.spawn={x:c.x,y:c.y}; p.hist=[{x:c.x,y:c.y}]; g.score+=100; if(g.hearts<g.maxH) g.hearts++; sfx('cp'); spawnParts(g,c.x,c.y-50,18,'#6ae8ff',200); banner(g,'✦ CHECKPOINT ✦'); floatText(g,c.x,c.y-110,'+100','#6ae8ff'); } });
  /* zone */
  var zi=0; for(i=0;i<L.zoneX.length;i++) if(p.x>=L.zoneX[i]) zi=i;
  if(zi!==g.zone){ if(g.zone>=0) banner(g,'ZONE '+(zi+1)+' — '+ZONES[zi].n); g.zone=zi; }
  /* relic */
  var r=L.relic; if(r&&Math.abs(p.x-r.x)<40&&Math.abs(p.y-r.y)<90){ end(g,true); }
  /* camera */
  var tx=p.x-g.vw*(.4)+p.face*60, ty=p.y-g.vh*.62; var kx=1-Math.pow(.0009,dt), ky=1-Math.pow(.004,dt);
  g.cam.x+=(tx-g.cam.x)*kx; g.cam.y+=(ty-g.cam.y)*ky; g.cam.x=clamp(g.cam.x,0,Math.max(0,L.end+120-g.vw)); g.cam.y=clamp(g.cam.y,-420,H-g.vh+60);
  ambient(g,dt);
}
function spawnParts(g,x,y,n,col,sp){ for(var i=0;i<n;i++){ var a=Math.random()*TAU, v=sp*(.3+Math.random()*.7); g.parts.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-sp*.3,l:.5+Math.random()*.4,m:.9,c:col,r:2+Math.random()*3}); } if(g.parts.length>260) g.parts.splice(0,g.parts.length-260); }
function floatText(g,x,y,t,c){ g.texts.push({x:x,y:y,t:t,c:c,l:1}); }
function ambient(g,dt){
  for(var i=g.parts.length-1;i>=0;i--){ var q=g.parts[i]; q.l-=dt; if(q.l<=0){ g.parts.splice(i,1); continue; } q.vy+=600*dt; q.x+=q.vx*dt; q.y+=q.vy*dt; }
  for(i=g.texts.length-1;i>=0;i--){ var t=g.texts[i]; t.l-=dt; t.y-=40*dt; if(t.l<=0) g.texts.splice(i,1); }
  for(i=g.ghosts.length-1;i>=0;i--){ g.ghosts[i].a-=dt*3; if(g.ghosts[i].a<=0) g.ghosts.splice(i,1); }
}

/* ------------------------------ rendering ------------------------------ */
var ridge=null, midp=null;
function initBG(){ var r=mulberry(77); ridge=[]; for(var i=0;i<64;i++) ridge.push(.35+r()*.65); midp=[]; for(i=0;i<40;i++) midp.push({o:i*130+r()*50,h:.5+r()*.5,w:30+r()*40,k:r()}); }
function zoneBlend(g,x){
  var zx=g.L.zoneX, i=0; for(var k=0;k<zx.length;k++) if(x>=zx[k]) i=k;
  var nxt=zx[i+1], zi=i, zj=i, t=0, B=420;
  if(nxt!=null&&x>nxt-B){ zj=i+1; t=(x-(nxt-B))/B*.5; } else if(i>0&&x<zx[i]+B){ zj=i-1; t=.5-(x-zx[i])/B*.5; }
  return {a:ZONES[zi],b:ZONES[zj],t:clamp(t,0,.5),i:zi};
}
function bc(zb,key){ return mix(zb.a[key],zb.b[key],zb.t); }
function stonePat(g,c,zi){
  if(g.pat[zi]) return g.pat[zi]; var Z=ZONES[zi], o=document.createElement('canvas'); o.width=o.height=64; var x=o.getContext('2d');
  x.fillStyle=rgb(Z.face); x.fillRect(0,0,64,64); x.strokeStyle=rgb(Z.dark); x.lineWidth=2;
  for(var r=0;r<4;r++){ var yy=r*16; x.beginPath(); x.moveTo(0,yy); x.lineTo(64,yy); x.stroke(); var off=r%2?16:0; for(var c2=0;c2<4;c2++){ x.beginPath(); x.moveTo(off+c2*32,yy); x.lineTo(off+c2*32,yy+16); x.stroke(); } }
  var rr=mulberry(zi+3); for(var i=0;i<26;i++){ x.fillStyle=rgb(rr()>.5?Z.dark:Z.face,.35); x.fillRect((rr()*64)|0,(rr()*64)|0,3,3); }
  g.pat[zi]=c.createPattern(o,'repeat'); return g.pat[zi];
}
function draw(g){
  var c=g.ctx; if(!c) return; if(!ridge) initBG();
  var sc=g.cv.width/g.vw, vw=g.vw, vh=g.vh, L=g.L, p=g.p, cam=g.cam;
  var sx=g.shake>0?(Math.random()-.5)*10*g.shake:0, sy=g.shake>0?(Math.random()-.5)*10*g.shake:0;
  c.setTransform(sc,0,0,sc,0,0);
  var zb=zoneBlend(g,cam.x+vw*.5), t=g.t;
  /* sky */
  var gr=c.createLinearGradient(0,0,0,vh); gr.addColorStop(0,rgb(mix(zb.a.sky[0],zb.b.sky[0],zb.t))); gr.addColorStop(1,rgb(mix(zb.a.sky[1],zb.b.sky[1],zb.t))); c.fillStyle=gr; c.fillRect(0,0,vw,vh);
  var far=bc(zb,'far'), mid=bc(zb,'mid'), mote=zb.a.mote;
  /* sun / glow */
  var sg=c.createRadialGradient(vw*.72,vh*.28,0,vw*.72,vh*.28,vh*.55); sg.addColorStop(0,'rgba(255,250,220,.55)'); sg.addColorStop(1,'rgba(255,250,220,0)'); c.fillStyle=sg; c.fillRect(0,0,vw,vh);
  /* far ridge */
  var par=-cam.y*.08; c.fillStyle=rgb(far); c.beginPath(); c.moveTo(0,vh);
  var o0=-(cam.x*.15%3840); for(var x=-60;x<=vw+60;x+=60){ var ix=Math.floor((x-o0)/60); var h=ridge[((ix%64)+64)%64]; c.lineTo(x,vh*.78-h*vh*.42+par); } c.lineTo(vw,vh); c.fill();
  /* mid layer */
  c.fillStyle=rgb(mid); var mo=cam.x*.38, span=40*130;
  midp.forEach(function(m){ var xx=((m.o-mo)%span+span)%span-130; if(xx>vw+80) return; var hh=m.h*vh*.5, base=vh*.9+par*1.6;
    if(zb.i===3||(zb.b===ZONES[3]&&zb.t>.2)){ c.beginPath(); c.ellipse(xx,base-hh*.9,m.w*1.5,14,0,0,TAU); c.fill(); c.beginPath(); c.moveTo(xx-m.w*1.2,base-hh*.9); c.lineTo(xx+m.w*1.2,base-hh*.9); c.lineTo(xx,base-hh*.9+m.w); c.fill(); }
    else if(zb.i===2){ c.beginPath(); c.moveTo(xx-m.w*.7,base); c.lineTo(xx-m.w*.2,base-hh); c.lineTo(xx+m.w*.2,base-hh*.8); c.lineTo(xx+m.w*.7,base); c.fill(); }
    else { c.fillRect(xx-m.w*.4,base-hh,m.w*.8,hh); c.fillRect(xx-m.w*.65,base-hh-8,m.w*1.3,10); if(m.k>.55){ c.beginPath(); c.arc(xx+m.w*1.8,base-hh+14,m.w*1.8,Math.PI,0); c.lineWidth=0; c.fill(); } } });
  /* motes */
  c.fillStyle=mote; for(var i=0;i<34;i++){ var mx=((i*173.3-cam.x*(.25+(i%3)*.12)+t*(8+i%5*3))%(vw+40)+vw+40)%(vw+40)-20, my=(i*97.1%vh)+Math.sin(t*.8+i)*14; c.globalAlpha=.25+.35*Math.abs(Math.sin(t+i)); c.fillRect(mx,my,2.4,2.4); } c.globalAlpha=1;
  /* world */
  c.save(); c.translate(-cam.x+sx,-cam.y+sy);
  var camL=cam.x-40, camR=cam.x+vw+40, camT=cam.y-40, camB=cam.y+vh+40;
  /* liquid (behind ground) */
  var lq=bc(zb,'liq'), lt=bc(zb,'liqTop'); var lg=c.createLinearGradient(0,LIQ-30,0,H+40); lg.addColorStop(0,rgb(lt,.9)); lg.addColorStop(.3,rgb(lq,.95)); lg.addColorStop(1,rgb(mix(lq,[0,0,0],.6)));
  c.fillStyle=lg; c.beginPath(); c.moveTo(camL,H+60); for(x=camL;x<=camR;x+=20) c.lineTo(x,LIQ+Math.sin(x*.03+t*2)*5+Math.sin(x*.011+t)*4); c.lineTo(camR,H+60); c.fill();
  if(zb.i===2||zb.t>0&&zb.b===ZONES[2]){ var lgl=c.createRadialGradient(cam.x+vw/2,LIQ,0,cam.x+vw/2,LIQ,vw*.7); lgl.addColorStop(0,'rgba(255,120,30,.28)'); lgl.addColorStop(1,'rgba(255,120,30,0)'); c.fillStyle=lgl; c.fillRect(camL,LIQ-300,vw+80,420); }
  /* solids */
  L.solids.forEach(function(s){
    if(s.x>camR||s.x+s.w<camL) return; var zi=zoneBlend(g,s.x+s.w/2).i, Z=ZONES[zi];
    if(s.k==='g'){ if(s.y>camB) return; var bot=Math.min(s.y+s.h,camB+20);
      c.fillStyle=stonePat(g,c,zi); c.fillRect(s.x,s.y,s.w,bot-s.y);
      var dg=c.createLinearGradient(0,s.y,0,s.y+360); dg.addColorStop(0,'rgba(0,0,0,0)'); dg.addColorStop(1,'rgba(0,0,12,.65)'); c.fillStyle=dg; c.fillRect(s.x,s.y,s.w,bot-s.y);
      c.fillStyle=rgb(Z.top); c.fillRect(s.x,s.y,s.w,9); c.fillStyle='rgba(255,255,255,.25)'; c.fillRect(s.x,s.y,s.w,2);
      c.fillStyle=rgb(Z.top); for(var gx=s.x+4;gx<s.x+s.w-4;gx+=13){ var hh=4+((gx*7)%5); c.beginPath(); c.moveTo(gx,s.y+1); c.lineTo(gx+3,s.y-hh); c.lineTo(gx+6,s.y+1); c.fill(); }
      c.fillStyle='rgba(0,0,0,.18)'; c.fillRect(s.x,s.y+9,s.w,5);
    } else {
      var yy=s.y; if(s.k==='c'){ if(s.st===2) yy=s.y+s.fall; if(s.st===1) yy+=Math.sin(g.t*60)*1.5; if(yy>camB) return; }
      var al=s.k==='c'&&s.st===2?clamp(s.t/3*2,0,1):1; c.globalAlpha=s.k==='c'&&s.st===2?.5*al:1;
      c.fillStyle=s.k==='c'?rgb(mix(Z.face,[150,110,70],.5)):stonePat(g,c,zi); c.beginPath(); rr(c,s.x,yy,s.w,s.h,7); c.fill();
      c.fillStyle='rgba(0,0,0,.28)'; c.fillRect(s.x+3,yy+s.h-8,s.w-6,8);
      c.fillStyle=s.k==='m'?'#7ad4ff':rgb(Z.top); c.beginPath(); rr(c,s.x,yy,s.w,8,4); c.fill();
      if(s.k==='c'){ c.strokeStyle='rgba(40,25,10,.6)'; c.lineWidth=2; c.beginPath(); c.moveTo(s.x+s.w*.3,yy); c.lineTo(s.x+s.w*.4,yy+s.h); c.moveTo(s.x+s.w*.7,yy); c.lineTo(s.x+s.w*.62,yy+s.h); c.stroke(); }
      if(s.k==='m'){ c.fillStyle='rgba(122,212,255,.4)'; c.fillRect(s.x+6,yy+s.h,s.w-12,4+Math.sin(g.t*8)*2); }
      c.globalAlpha=1; }
  });
  /* signs */
  c.font='800 13px Inter,sans-serif'; c.textAlign='center'; L.signs.forEach(function(sg2){ if(sg2.x<camL||sg2.x>camR) return; c.fillStyle='rgba(20,14,40,.65)'; var w=c.measureText(sg2.t).width+18; c.beginPath(); rr(c,sg2.x-w/2,sg2.y-70,w,24,8); c.fill(); c.fillStyle='#fff'; c.fillText(sg2.t,sg2.x,sg2.y-53); c.fillStyle='#6b4a2a'; c.fillRect(sg2.x-2,sg2.y-46,4,46); });
  /* checkpoints */
  L.cps.forEach(function(k){ if(k.x<camL||k.x>camR) return; c.fillStyle='#9aa0b8'; c.fillRect(k.x-9,k.y-40,18,40); c.fillStyle='#7c829c'; c.fillRect(k.x-14,k.y-8,28,8); c.fillRect(k.x-12,k.y-46,24,8);
    var col=k.on?'#6ae8ff':'#6a6a80'; var fg=c.createRadialGradient(k.x,k.y-62,0,k.x,k.y-62,k.on?38:14); fg.addColorStop(0,k.on?'rgba(106,232,255,.8)':'rgba(120,120,140,.4)'); fg.addColorStop(1,'rgba(106,232,255,0)'); c.fillStyle=fg; c.fillRect(k.x-40,k.y-100,80,80);
    c.fillStyle=col; c.beginPath(); c.moveTo(k.x,k.y-80+(k.on?Math.sin(g.t*8)*3:0)); c.quadraticCurveTo(k.x+11,k.y-62,k.x,k.y-50); c.quadraticCurveTo(k.x-11,k.y-62,k.x,k.y-80); c.fill(); });
  /* springs */
  L.springs.forEach(function(sp){ if(sp.x<camL||sp.x>camR) return; var sq=Math.max(0,sp.sq); c.fillStyle='#caa44a'; c.fillRect(sp.x+6,sp.y-10+sq*6,sp.w-12,10-sq*6); c.strokeStyle='#8a6a1a'; c.lineWidth=3; c.beginPath(); for(var z=0;z<4;z++){ c.moveTo(sp.x+10,sp.y-2-z*3); c.lineTo(sp.x+sp.w-10,sp.y-4-z*3); } c.stroke(); c.fillStyle='#e8504a'; c.beginPath(); rr(c,sp.x,sp.y-16-(1-sq)*4,sp.w,9,4); c.fill(); });
  /* spikes */
  L.spikes.forEach(function(sp){ if(sp.x>camR||sp.x+sp.w<camL) return; c.fillStyle='#cfd5e2'; var n=Math.max(2,Math.round(sp.w/16)), w=sp.w/n; for(var z=0;z<n;z++){ c.beginPath(); c.moveTo(sp.x+z*w,sp.y); c.lineTo(sp.x+z*w+w/2,sp.y-22); c.lineTo(sp.x+(z+1)*w,sp.y); c.fill(); } c.fillStyle='rgba(0,0,0,.3)'; c.fillRect(sp.x,sp.y-3,sp.w,3); });
  /* jets */
  L.jets.forEach(function(j){ if(j.x<camL||j.x>camR) return; c.fillStyle='#4a3a38'; c.fillRect(j.x-18,j.y-8,36,8); c.fillStyle=j.warn?'#ff8a3a':'#2a1c1a'; c.fillRect(j.x-8,j.y-11,16,4);
    if(j.warn){ c.fillStyle='rgba(255,140,40,'+(.4+.4*Math.sin(g.t*40))+')'; c.fillRect(j.x-6,j.y-26,12,16); }
    if(j.fire){ var fg2=c.createLinearGradient(0,j.y,0,j.y-150); fg2.addColorStop(0,'rgba(255,240,160,.95)'); fg2.addColorStop(.35,'rgba(255,140,40,.9)'); fg2.addColorStop(1,'rgba(255,60,20,0)'); c.fillStyle=fg2; c.beginPath(); c.moveTo(j.x-16,j.y-8); c.quadraticCurveTo(j.x-20+Math.sin(g.t*30)*5,j.y-90,j.x,j.y-150); c.quadraticCurveTo(j.x+20+Math.cos(g.t*28)*5,j.y-90,j.x+16,j.y-8); c.fill(); } });
  /* turrets */
  L.turrets.forEach(function(tu){ if(tu.x<camL||tu.x>camR) return; c.fillStyle='#5a5470'; c.fillRect(tu.x-14,tu.y-48,28,48); c.fillStyle='#3a3550'; c.fillRect(tu.x-18,tu.y-10,36,10); c.fillStyle=tu.cd<.35?'#ff5a4a':'#f2c14a'; c.beginPath(); c.arc(tu.x+tu.dir*4,tu.y-24,7,0,TAU); c.fill(); c.fillStyle='#2a2540'; c.fillRect(tu.dir>0?tu.x+8:tu.x-22,tu.y-28,14,8); });
  g.darts.forEach(function(d){ c.fillStyle='#ffd24a'; c.beginPath(); c.moveTo(d.x+Math.sign(d.vx)*10,d.y); c.lineTo(d.x-Math.sign(d.vx)*8,d.y-4); c.lineTo(d.x-Math.sign(d.vx)*8,d.y+4); c.fill(); c.fillStyle='rgba(255,210,74,.3)'; c.fillRect(d.x-Math.sign(d.vx)*28,d.y-1.5,20,3); });
  /* pendulums */
  L.pends.forEach(function(pd){ if(pd.px<camL-300||pd.px>camR+300) return; c.strokeStyle='#8a8aa0'; c.lineWidth=4; c.beginPath(); c.moveTo(pd.px,pd.py); c.lineTo(pd.x,pd.y); c.stroke(); c.fillStyle='#4a4a62'; c.beginPath(); c.arc(pd.px,pd.py,9,0,TAU); c.fill();
    c.save(); c.translate(pd.x,pd.y); c.rotate(g.t*3); c.fillStyle='#c8ccd8'; for(var z=0;z<8;z++){ c.rotate(TAU/8); c.beginPath(); c.moveTo(-6,-18); c.lineTo(0,-32); c.lineTo(6,-18); c.fill(); } c.fillStyle='#7a7e92'; c.beginPath(); c.arc(0,0,20,0,TAU); c.fill(); c.fillStyle='#4a4c60'; c.beginPath(); c.arc(0,0,8,0,TAU); c.fill(); c.restore(); });
  /* saws */
  L.saws.forEach(function(sw){ if(sw.x<camL-60||sw.x>camR+60) return; c.strokeStyle='rgba(0,0,0,.35)'; c.lineWidth=3; c.beginPath(); c.moveTo(sw.x0,sw.y0); c.lineTo(sw.x1,sw.y1); c.stroke();
    c.save(); c.translate(sw.x,sw.y); c.rotate(sw.a); c.fillStyle='#d6dae6'; c.beginPath(); for(var z=0;z<14;z++){ var a1=z/14*TAU, a2=(z+.5)/14*TAU; c.lineTo(Math.cos(a1)*sw.r,Math.sin(a1)*sw.r); c.lineTo(Math.cos(a2)*(sw.r+8),Math.sin(a2)*(sw.r+8)); } c.fill(); c.fillStyle='#8a8ea4'; c.beginPath(); c.arc(0,0,sw.r*.55,0,TAU); c.fill(); c.fillStyle='#4a4c60'; c.beginPath(); c.arc(0,0,5,0,TAU); c.fill(); c.restore(); });
  /* pickups */
  L.coins.forEach(function(k){ if(k.got||k.x<camL||k.x>camR) return; var sx2=Math.abs(Math.cos(g.t*4+k.x*.05)); c.fillStyle='#ffd24a'; c.beginPath(); c.ellipse(k.x,k.y+Math.sin(g.t*3+k.x)*2,8*Math.max(.25,sx2),9,0,0,TAU); c.fill(); c.strokeStyle='#c78a10'; c.lineWidth=1.5; c.stroke(); });
  c.textAlign='center'; c.font='26px Inter,sans-serif';
  L.gems.forEach(function(k){ if(k.got||k.x<camL||k.x>camR) return; var gl=c.createRadialGradient(k.x,k.y,0,k.x,k.y,26); gl.addColorStop(0,'rgba(122,232,255,.6)'); gl.addColorStop(1,'rgba(122,232,255,0)'); c.fillStyle=gl; c.fillRect(k.x-26,k.y-26,52,52); c.fillText('💎',k.x,k.y+9+Math.sin(g.t*3+k.x)*3); });
  L.crystals.forEach(function(k){ if(k.got||k.x<camL||k.x>camR) return; c.fillText('⏳',k.x,k.y+9+Math.sin(g.t*3)*3); });
  L.hearts.forEach(function(k){ if(k.got||k.x<camL||k.x>camR) return; c.fillText('❤️',k.x,k.y+9+Math.sin(g.t*3)*3); });
  /* relic */
  var rl=L.relic; if(rl){ var rg=c.createRadialGradient(rl.x,rl.y-60,0,rl.x,rl.y-60,150); rg.addColorStop(0,'rgba(255,230,120,.7)'); rg.addColorStop(1,'rgba(255,230,120,0)'); c.fillStyle=rg; c.fillRect(rl.x-150,rl.y-210,300,300);
    c.save(); c.translate(rl.x,rl.y-60); c.globalAlpha=.25; for(i=0;i<8;i++){ c.rotate(TAU/8+g.t*.1); c.fillStyle='#ffe58a'; c.beginPath(); c.moveTo(0,0); c.lineTo(-14,-140); c.lineTo(14,-140); c.fill(); } c.restore(); c.globalAlpha=1;
    c.fillStyle='#b9b2d6'; c.fillRect(rl.x-26,rl.y-18,52,18); c.fillRect(rl.x-18,rl.y-34,36,16); c.font='54px Inter,sans-serif'; c.fillText('🏆',rl.x,rl.y-40+Math.sin(g.t*2.4)*6); }
  /* enemies */
  L.walkers.forEach(function(w){ if(!w.alive||w.x<camL||w.x>camR) return; var sq=w.sq; c.fillStyle='#7ccf5a'; c.beginPath(); c.ellipse(w.x,w.y-13,17*(1+sq),14*(1-sq),0,Math.PI,TAU); c.lineTo(w.x+17,w.y); c.lineTo(w.x-17,w.y); c.fill(); c.fillStyle='rgba(0,0,0,.2)'; c.fillRect(w.x-17,w.y-4,34,4); c.fillStyle='#fff'; c.beginPath(); c.arc(w.x-6,w.y-14,5,0,TAU); c.arc(w.x+6,w.y-14,5,0,TAU); c.fill(); c.fillStyle='#222'; c.beginPath(); c.arc(w.x-6+w.dir*2,w.y-14,2.4,0,TAU); c.arc(w.x+6+w.dir*2,w.y-14,2.4,0,TAU); c.fill(); });
  L.bats.forEach(function(b){ if(!b.alive||b.x<camL||b.x>camR) return; var fl=Math.sin(g.t*18+b.ph)*.7; c.fillStyle='#4a3a6a'; c.beginPath(); c.ellipse(b.x,b.y,9,10,0,0,TAU); c.fill(); c.beginPath(); c.moveTo(b.x-6,b.y-2); c.quadraticCurveTo(b.x-24,b.y-14*fl-8,b.x-30,b.y+4); c.lineTo(b.x-6,b.y+6); c.fill(); c.beginPath(); c.moveTo(b.x+6,b.y-2); c.quadraticCurveTo(b.x+24,b.y-14*fl-8,b.x+30,b.y+4); c.lineTo(b.x+6,b.y+6); c.fill(); c.fillStyle='#ff5a6a'; c.fillRect(b.x-5,b.y-3,3,3); c.fillRect(b.x+2,b.y-3,3,3); });
  /* dash ghosts */
  g.ghosts.forEach(function(gh){ c.globalAlpha=Math.max(0,gh.a)*.5; drawPlayer(g,c,gh.x,gh.y,gh.f,1,true); }); c.globalAlpha=1;
  /* player */
  if(!(p.inv>0&&Math.floor(g.t*18)%2===0)) drawPlayer(g,c,p.x,p.y,p.face,p.sq,false);
  /* particles */
  g.parts.forEach(function(q){ c.globalAlpha=clamp(q.l/q.m,0,1); c.fillStyle=q.c; c.fillRect(q.x-q.r/2,q.y-q.r/2,q.r,q.r); }); c.globalAlpha=1;
  /* foreground liquid line & mist */
  c.fillStyle=rgb(lt,.35); c.beginPath(); c.moveTo(camL,H+60); for(x=camL;x<=camR;x+=20) c.lineTo(x,LIQ+4+Math.sin(x*.04-t*2.4)*4); c.lineTo(camR,H+60); c.fill();
  g.texts.forEach(function(tx){ c.globalAlpha=clamp(tx.l*2,0,1); c.font='900 18px Inter,sans-serif'; c.lineWidth=4; c.strokeStyle='rgba(0,0,0,.7)'; c.strokeText(tx.t,tx.x,tx.y); c.fillStyle=tx.c; c.fillText(tx.t,tx.x,tx.y); }); c.globalAlpha=1;
  c.restore();
  /* vignette + flash */
  var vg=c.createRadialGradient(vw/2,vh/2,vh*.4,vw/2,vh/2,vh*.95); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,10,.5)'); c.fillStyle=vg; c.fillRect(0,0,vw,vh);
  if(g.flash>0){ c.fillStyle='rgba(255,40,60,'+g.flash*.7+')'; c.fillRect(0,0,vw,vh); }
  hud(g,c);
}
function rr(c,x,y,w,h,r){ r=Math.min(r,w/2,h/2); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function drawPlayer(g,c,x,y,face,sq,ghost){
  var p=g.p, sp=g.sp, sz=56, run=!ghost&&p.ground&&Math.abs(p.vx)>40, bob=run?Math.abs(Math.sin(p.anim*1.6))*4:0;
  var sy=sq, sxs=2-sq; if(!ghost&&p.wall&&!p.ground){ sy=1.05; }
  c.save(); c.translate(x,y-bob); c.fillStyle='rgba(0,0,0,.25)'; if(!ghost&&p.ground){ c.beginPath(); c.ellipse(0,0,15,4,0,0,TAU); c.fill(); }
  c.scale(face*sxs,sy); if(!ghost&&!p.ground) c.rotate(clamp(p.vy/2600,-.25,.25)*face*0+0);
  if(!ghost) { var gl=c.createRadialGradient(0,-26,0,0,-26,38); gl.addColorStop(0,(sp.col||'#b07cff')+'66'); gl.addColorStop(1,'rgba(0,0,0,0)'); c.fillStyle=gl; c.fillRect(-40,-66,80,80); }
  if(sp.img&&sp.img.complete&&sp.img.naturalWidth) c.drawImage(sp.img,-sz/2,-sz+2,sz,sz); else { c.fillStyle=sp.col||'#b07cff'; c.beginPath(); rr(c,-14,-40,28,38,10); c.fill(); }
  c.restore();
}
function hud(g,c){
  var vw=g.vw, vh=g.vh, sc=clamp(vh/620,.7,1), L=g.L;
  c.textBaseline='alphabetic'; c.lineJoin='round';
  function T(s,x,y,sz,col,al){ c.textAlign=al||'left'; c.font='900 '+(sz*sc)+'px Inter,sans-serif'; c.lineWidth=4*sc; c.strokeStyle='rgba(0,0,0,.7)'; c.strokeText(s,x,y); c.fillStyle=col||'#fff'; c.fillText(s,x,y); }
  var s=''; for(var i=0;i<g.maxH;i++) s+=i<g.hearts?'❤️':'🖤'; T(s,14,32*sc,22);
  var left=Math.max(0,g.limit-g.time), mm=Math.floor(left/60), ss=Math.floor(left%60);
  T('⏱ '+mm+':'+(ss<10?'0':'')+ss,vw/2,32*sc,26,left<20?(Math.floor(g.t*4)%2?'#ff5a5a':'#fff'):'#fff','center');
  T('🪙 '+g.coins+'   ⭐ '+g.score,vw-104*sc,32*sc,20,'#ffe08a','right');
  /* progress bar */
  var bw=Math.min(420,vw*.45), bx=vw/2-bw/2, by=46*sc; c.fillStyle='rgba(0,0,0,.45)'; c.fillRect(bx,by,bw,7*sc); var pr=clamp(g.p.x/L.end,0,1); c.fillStyle='#ffd24a'; c.fillRect(bx,by,bw*pr,7*sc);
  L.zoneX.forEach(function(zx){ c.fillStyle='rgba(255,255,255,.6)'; c.fillRect(bx+bw*zx/L.end-1,by-2,2,11*sc); }); L.cps.forEach(function(k){ c.fillStyle=k.on?'#6ae8ff':'#888'; c.fillRect(bx+bw*k.x/L.end-2,by-4,4,15*sc); });
  c.font=(14*sc)+'px Inter,sans-serif'; c.textAlign='center'; c.fillStyle='#fff'; c.fillText('🏃',bx+bw*pr,by-5*sc); c.fillText('🏆',bx+bw,by-5*sc);
  /* dash */
  var p=g.p, dr=clamp(1-p.dashCd/DASHCD,0,1); c.fillStyle='rgba(0,0,0,.45)'; c.fillRect(14,46*sc,70*sc,8*sc); c.fillStyle=dr>=1?'#7ad4ff':'#4a6a8a'; c.fillRect(14,46*sc,70*sc*dr,8*sc); T('DASH',14,70*sc,11,dr>=1?'#7ad4ff':'#889',null);
  if(g.bannerT>0){ var al=clamp(Math.min(g.bannerT,2.6-g.bannerT)*3,0,1); c.globalAlpha=al; T(g.banner,vw/2,vh*.3,38,'#fff','center'); c.globalAlpha=1; }
}
})();
