/* Character Gauntlet v3 — large scrolling map, equipped Indexling, 12 levelled power-ups, fullscreen.
   Overrides the arcade Gauntlet hooks from the main script. Saves best run into gameProgress.gauntlet. */
(function(){
'use strict';
var WW=2400, WH=1500, TAU=Math.PI*2, CX=WW/2, CY=WH/2;
var rnd=function(a,b){ return a+Math.random()*(b-a); }, clamp=function(n,a,b){ return Math.max(a,Math.min(b,n)); };
var dist=function(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); };
function $(id){ return document.getElementById(id); }
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; }; }

/* =====================================================================
   POWER-UPS — 12 types × 4 levels
   ===================================================================== */
var PU={
  laser:{icon:'⚡',name:'Laser Beam',col:'#5ad7ff',lv:['Fires a piercing laser at the nearest enemy','Faster fire rate and +40% damage','Twin lasers','LASER WAVE: a huge piercing energy wave every few shots']},
  orbs:{icon:'🔵',name:'Plasma Orbs',col:'#6a8cff',lv:['A plasma orb circles you, burning anything it touches','Two orbs, spinning faster','Three bigger orbs','Five-orb halo that also destroys enemy shots']},
  fire:{icon:'🔥',name:'Fireball',col:'#ff8a3a',lv:['Lobs an exploding fireball at enemies','Bigger blast that leaves enemies burning','Triple fireball fan','METEOR RAIN: meteors crash down on enemies']},
  storm:{icon:'🌩️',name:'Chain Lightning',col:'#ffe45a',lv:['Lightning strikes the nearest enemy and jumps once','Jumps 4 times','Strikes faster and stuns','LIGHTNING STORM: bolts rain on many enemies']},
  frost:{icon:'❄️',name:'Frost Nova',col:'#9fe8ff',lv:['Frost ring slows nearby enemies','Larger, stronger ring','Freezes enemies solid','BLIZZARD: a freezing aura follows you']},
  shield:{icon:'🛡️',name:'Aegis Shield',col:'#7cf0a0',lv:['A shield blocks one hit, then recharges','Recharges much faster','Two charges, and it blocks enemy shots','Breaking a shield unleashes a blast']},
  chakram:{icon:'💿',name:'Chakram',col:'#ffd24a',lv:['Throw a returning disc that cuts through enemies','Faster, harder-hitting discs','Two discs thrown at once','Three huge discs']},
  toxic:{icon:'☣️',name:'Toxic Trail',col:'#7cd23a',lv:['Leave poison puddles behind you','Bigger, longer-lasting puddles','Stronger poison that slows enemies','Puddles burst into acid explosions']},
  missile:{icon:'🚀',name:'Homing Missiles',col:'#ff6a6a',lv:['Fires a homing missile','Two missiles per volley','Faster volleys, more damage','MISSILE SWARM: six missiles per volley']},
  gravity:{icon:'🕳️',name:'Gravity Well',col:'#b07cff',lv:['A black hole pulls enemies together','Bigger and longer-lasting','Crushes enemies inside it','COLLAPSE: ends with a huge explosion']},
  dash:{icon:'💨',name:'Blazing Dash',col:'#ff9a5a',lv:['Dashing leaves a trail of fire','Dash start and end release shockwaves','+1 dash charge and faster recharge','TIME WARP: dashing slows all enemies and speeds you up']},
  spirit:{icon:'👻',name:'Spirit Allies',col:'#d6c8ff',lv:['A spirit ally orbits you and shoots enemies','Two spirits','Spirits shoot faster and harder','Four spirits plus periodic spirit bursts']}
};
var PU_KEYS=Object.keys(PU);

/* =====================================================================
   ENEMIES + WAVES
   ===================================================================== */
var EN={
  grunt:{e:'👹',hp:7,sp:80,r:16,col:'#ff6a6a',pts:10},
  runner:{e:'🦇',hp:3.5,sp:155,r:13,col:'#ffd24a',pts:12},
  spitter:{e:'🧙',hp:6,sp:62,r:15,col:'#b07cff',pts:16},
  brute:{e:'🦍',hp:28,sp:54,r:26,col:'#ff9a3c',pts:30},
  bomber:{e:'💣',hp:4,sp:108,r:14,col:'#7cf0a0',pts:18},
  king:{e:'👑',hp:230,sp:72,r:36,col:'#ffd24a',pts:300,boss:true,name:'The Hollow King'},
  titan:{e:'👁️',hp:430,sp:56,r:44,col:'#c07cff',pts:600,boss:true,name:'Void Titan'}
};
function waveDef(n){
  var q=[]; function add(t,c){ for(var i=0;i<c;i++) q.push(t); }
  add('grunt',4+n*2); if(n>=2) add('runner',1+n); if(n>=3) add('spitter',Math.floor(n/1.6)); if(n>=3) add('bomber',Math.floor(n/2)); if(n>=4) add('brute',Math.floor((n-2)/2));
  if(n===5) q.push('king'); if(n===10) q.push('titan');
  for(var i=q.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=q[i]; q[i]=q[j]; q[j]=t; }
  var bi=q.findIndex(function(x){return EN[x].boss;}); if(bi>0){ var b=q.splice(bi,1)[0]; q.unshift(b); }
  return q;
}

/* =====================================================================
   THE MAP — baked once: ruined garden with plaza, roads, ponds, forests
   ===================================================================== */
var MAP=null;
function bakeMap(){
  if(MAP) return MAP;
  var R=mulberry(20261025), r=function(a,b){ return a+R()*(b-a); };
  var cv=document.createElement('canvas'); cv.width=WW; cv.height=WH; var c=cv.getContext('2d');
  // base grass with large tonal patches
  c.fillStyle='#37583d'; c.fillRect(0,0,WW,WH);
  for(var i=0;i<130;i++){ var x=r(0,WW),y=r(0,WH),rad=r(120,340),g=c.createRadialGradient(x,y,0,x,y,rad),dark=R()<.5; g.addColorStop(0,dark?'rgba(20,48,32,.34)':'rgba(120,170,90,.22)'); g.addColorStop(1,'rgba(0,0,0,0)'); c.fillStyle=g; c.fillRect(x-rad,y-rad,rad*2,rad*2); }
  // dirt patches
  for(i=0;i<36;i++){ var dx=r(0,WW),dy=r(0,WH),w=r(60,190),h=r(40,120); var dg=c.createRadialGradient(dx,dy,0,dx,dy,w); dg.addColorStop(0,'rgba(120,92,58,.55)'); dg.addColorStop(1,'rgba(120,92,58,0)'); c.fillStyle=dg; c.save(); c.translate(dx,dy); c.scale(1,h/w); c.translate(-dx,-dy); c.beginPath(); c.arc(dx,dy,w,0,TAU); c.fill(); c.restore(); }
  // grass blades
  var cols=['#2b4932','#3f6647','#4a7650','#30533a','#5b8a58'];
  c.lineWidth=1.4; for(i=0;i<16000;i++){ var gx=r(0,WW),gy=r(0,WH); c.strokeStyle=cols[Math.floor(R()*cols.length)]; c.globalAlpha=.55; c.beginPath(); c.moveTo(gx,gy); c.lineTo(gx+r(-2,2),gy-r(3,8)); c.stroke(); } c.globalAlpha=1;
  // roads (cross + ring)
  function road(drawPath){ c.save(); c.lineCap='round'; c.lineJoin='round'; c.strokeStyle='#4a3f2c'; c.lineWidth=98; drawPath(); c.stroke(); c.strokeStyle='#8c7b5c'; c.lineWidth=86; drawPath(); c.stroke(); c.strokeStyle='#a39272'; c.lineWidth=70; drawPath(); c.stroke(); c.restore(); }
  road(function(){ c.beginPath(); c.moveTo(0,CY); c.lineTo(WW,CY); }); road(function(){ c.beginPath(); c.moveTo(CX,0); c.lineTo(CX,WH); });
  road(function(){ c.beginPath(); c.moveTo(0,200); c.quadraticCurveTo(CX*.55,CY*.7,CX-300,CY-250); }); road(function(){ c.beginPath(); c.moveTo(WW,WH-200); c.quadraticCurveTo(WW-CX*.55,WH-CY*.7,CX+300,CY+250); });
  for(i=0;i<2600;i++){ var px=r(0,WW),py=r(0,WH); var px2=Math.abs(py-CY)<44||Math.abs(px-CX)<44; if(!px2) continue; c.fillStyle=R()<.5?'rgba(60,48,30,.45)':'rgba(220,205,170,.4)'; c.beginPath(); c.arc(px,py,r(1.5,4),0,TAU); c.fill(); }
  // plaza
  c.save(); var pg=c.createRadialGradient(CX,CY,40,CX,CY,300); pg.addColorStop(0,'#8d8aa3'); pg.addColorStop(1,'#625f78'); c.fillStyle=pg; c.beginPath(); c.arc(CX,CY,300,0,TAU); c.fill(); c.clip();
  c.strokeStyle='rgba(20,18,40,.35)'; c.lineWidth=2; for(i=-8;i<=8;i++){ c.beginPath(); c.moveTo(CX+i*40,CY-310); c.lineTo(CX+i*40,CY+310); c.stroke(); c.beginPath(); c.moveTo(CX-310,CY+i*40); c.lineTo(CX+310,CY+i*40); c.stroke(); }
  for(i=0;i<500;i++){ c.fillStyle=R()<.5?'rgba(255,255,255,.06)':'rgba(0,0,0,.1)'; c.fillRect(CX+r(-300,300),CY+r(-300,300),r(6,26),r(6,22)); } c.restore();
  c.strokeStyle='#3b3856'; c.lineWidth=12; c.beginPath(); c.arc(CX,CY,300,0,TAU); c.stroke(); c.strokeStyle='#aaa6c6'; c.lineWidth=4; c.beginPath(); c.arc(CX,CY,295,0,TAU); c.stroke();
  c.shadowColor='#7cf0ff'; c.shadowBlur=18; c.strokeStyle='rgba(124,240,255,.75)'; c.lineWidth=4; [230,170,110].forEach(function(rr){ c.beginPath(); c.arc(CX,CY,rr,0,TAU); c.stroke(); });
  for(i=0;i<8;i++){ var a=i/8*TAU; c.beginPath(); c.moveTo(CX+Math.cos(a)*112,CY+Math.sin(a)*112); c.lineTo(CX+Math.cos(a)*228,CY+Math.sin(a)*228); c.stroke(); var gx2=CX+Math.cos(a+TAU/16)*200,gy2=CY+Math.sin(a+TAU/16)*200; c.font='22px serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillStyle='rgba(124,240,255,.85)'; c.fillText(['✦','☾','☼','✧','❖','✺','☽','✶'][i],gx2,gy2); }
  c.shadowBlur=0; c.fillStyle='rgba(124,240,255,.18)'; c.beginPath(); c.arc(CX,CY,60,0,TAU); c.fill(); c.font='54px serif'; c.fillStyle='rgba(180,250,255,.85)'; c.fillText('✦',CX,CY+3);
  // ponds
  var ponds=[{x:520,y:380,rx:190,ry:120},{x:1850,y:1120,rx:210,ry:130},{x:520,y:1180,rx:130,ry:90},{x:1900,y:330,rx:120,ry:80}];
  ponds.forEach(function(p){
    c.save(); c.translate(p.x,p.y); c.fillStyle='#b9a679'; c.beginPath(); c.ellipse(0,0,p.rx+26,p.ry+22,0,0,TAU); c.fill(); c.fillStyle='#8f7f58'; c.beginPath(); c.ellipse(0,0,p.rx+10,p.ry+8,0,0,TAU); c.fill();
    var wg=c.createRadialGradient(-p.rx*.2,-p.ry*.3,10,0,0,p.rx); wg.addColorStop(0,'#59c5e8'); wg.addColorStop(.6,'#2a86b8'); wg.addColorStop(1,'#1b5c8a'); c.fillStyle=wg; c.beginPath(); c.ellipse(0,0,p.rx,p.ry,0,0,TAU); c.fill();
    c.strokeStyle='rgba(255,255,255,.25)'; c.lineWidth=2; for(var k=0;k<5;k++){ c.beginPath(); c.ellipse(r(-p.rx*.4,p.rx*.4),r(-p.ry*.4,p.ry*.4),r(20,60),r(8,26),0,0,TAU); c.stroke(); }
    for(k=0;k<7;k++){ var ax=r(-p.rx*.7,p.rx*.7),ay=r(-p.ry*.6,p.ry*.6); c.fillStyle='#3fa36a'; c.beginPath(); c.arc(ax,ay,r(9,16),.3,TAU-.3); c.lineTo(ax,ay); c.fill(); if(R()<.4){ c.fillStyle='#ffb0d0'; c.beginPath(); c.arc(ax,ay,4,0,TAU); c.fill(); } }
    c.restore(); });
  // flowers + rubble
  var fc=['#ffd0e8','#fff3a0','#ffffff','#b8d8ff','#ffb27a']; for(i=0;i<900;i++){ var fx=r(0,WW),fy=r(0,WH); if(Math.abs(fy-CY)<50||Math.abs(fx-CX)<50||Math.hypot(fx-CX,fy-CY)<310) continue; c.fillStyle=fc[Math.floor(R()*fc.length)]; c.beginPath(); c.arc(fx,fy,r(1.6,3),0,TAU); c.fill(); }
  for(i=0;i<420;i++){ var rx=r(0,WW),ry=r(0,WH); c.fillStyle=R()<.5?'rgba(90,90,100,.7)':'rgba(130,130,140,.6)'; c.beginPath(); c.ellipse(rx,ry,r(2,6),r(1.5,4),r(0,3),0,TAU); c.fill(); }
  // cliffs on the border
  var bw=110; [[0,0,WW,bw,0,0,0,bw],[0,WH-bw,WW,bw,0,WH,0,WH-bw],[0,0,bw,WH,0,0,bw,0],[WW-bw,0,bw,WH,WW,0,WW-bw,0]].forEach(function(b){ var g2=c.createLinearGradient(b[4],b[5],b[6],b[7]); g2.addColorStop(0,'#0c0a14'); g2.addColorStop(.55,'#1d1a2c'); g2.addColorStop(1,'rgba(29,26,44,0)'); c.fillStyle=g2; c.fillRect(b[0],b[1],b[2],b[3]); });
  for(i=0;i<260;i++){ var side=Math.floor(R()*4),bx,by; if(side===0){ bx=r(0,WW); by=r(0,80); } else if(side===1){ bx=r(0,WW); by=r(WH-80,WH); } else if(side===2){ bx=r(0,80); by=r(0,WH); } else { bx=r(WW-80,WW); by=r(0,WH); } c.fillStyle=R()<.5?'#2a2640':'#3a3556'; c.beginPath(); c.moveTo(bx,by); c.lineTo(bx+r(14,40),by+r(-10,10)); c.lineTo(bx+r(0,24),by+r(14,36)); c.closePath(); c.fill(); }
  var vg=c.createRadialGradient(CX,CY,WH*.45,CX,CY,WW*.62); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,10,.5)'); c.fillStyle=vg; c.fillRect(0,0,WW,WH);

  // props
  var props=[], obs=[]; var noGo=function(x,y,m){ return Math.abs(y-CY)<(70+m)||Math.abs(x-CX)<(70+m)||Math.hypot(x-CX,y-CY)<(315+m)||x<130||y<130||x>WW-130||y>WH-130; };
  var inPond=function(x,y,m){ return ponds.some(function(p){ return Math.pow((x-p.x)/(p.rx+30+m),2)+Math.pow((y-p.y)/(p.ry+30+m),2)<1; }); };
  function put(kind,x,y,rr,extra){ var o=Object.assign({k:kind,x:x,y:y,r:rr,s:r(.85,1.25),v:Math.floor(R()*3),sd:R()*10},extra||{}); props.push(o); if(rr>0) obs.push({x:x,y:y,r:rr}); return o; }
  // forest clusters
  [[330,240,6],[1300,230,5],[2150,520,6],[330,820,5],[1500,1280,6],[900,1300,5],[2200,1330,4],[150,1300,4],[1150,150,3]].forEach(function(cl){ var n=cl[2]*7; for(var k=0;k<n;k++){ var a=r(0,TAU),d=r(0,160+cl[2]*14),x=cl[0]+Math.cos(a)*d,y=cl[1]+Math.sin(a)*d; if(noGo(x,y,30)||inPond(x,y,20)) continue; if(obs.some(function(o){ return Math.hypot(o.x-x,o.y-y)<46; })) continue; put('tree',x,y,17); } });
  for(i=0;i<46;i++){ var rx2=r(150,WW-150),ry2=r(150,WH-150); if(noGo(rx2,ry2,20)||inPond(rx2,ry2,10)) continue; if(obs.some(function(o){ return Math.hypot(o.x-rx2,o.y-ry2)<60; })) continue; put('rock',rx2,ry2,r(18,30)); }
  for(i=0;i<10;i++){ var ca=i/10*TAU+.15,cd=r(345,380); put('col',CX+Math.cos(ca)*cd,CY+Math.sin(ca)*cd,22,{broken:R()<.5}); }
  for(i=0;i<8;i++){ var ta=i/8*TAU+.4; put('torch',CX+Math.cos(ta)*318,CY+Math.sin(ta)*318,0,{}); }
  [[CX-130,CY-60],[CX+130,CY-60],[CX-130,CY+60],[CX+130,CY+60]].forEach(function(p){ put('torch',p[0]+(p[0]<CX?-90:90),p[1]*0+CY+(p[1]<CY?-340:340),0,{}); });
  for(i=0;i<110;i++){ var bx2=r(120,WW-120),by2=r(120,WH-120); if(noGo(bx2,by2,0)||inPond(bx2,by2,0)) continue; put('bush',bx2,by2,0); }
  // pond blockers
  ponds.forEach(function(p){ var n=Math.ceil(p.rx/26); for(var k=0;k<n;k++){ var t=k/n*TAU; obs.push({x:p.x+Math.cos(t)*p.rx*.8,y:p.y+Math.sin(t)*p.ry*.8,r:30}); } for(k=0;k<3;k++) obs.push({x:p.x+(k-1)*p.rx*.4,y:p.y,r:Math.min(p.ry,60)}); });
  props.sort(function(a,b){ return a.y-b.y; });
  // minimap
  var mm=document.createElement('canvas'); mm.width=180; mm.height=Math.round(180*WH/WW); mm.getContext('2d').drawImage(cv,0,0,mm.width,mm.height);
  MAP={bg:cv,mm:mm,props:props,obs:obs,ponds:ponds};
  return MAP;
}

/* =====================================================================
   Indexling sprite (real equipped art)
   ===================================================================== */
var spriteCache={key:'',img:null,col:'#b07cff'};
function playerSprite(){
  var id='ling-sugarbug', skinId='';
  try{ id=(state.progress.equipped&&state.progress.equipped.indexling)||id; skinId=(typeof getEquippedSkinId==='function'&&getEquippedSkinId(id))||''; }catch(e){}
  var key=id+'|'+skinId; if(spriteCache.key===key&&spriteCache.img) return spriteCache;
  var img=new Image(), col='#b07cff'; spriteCache={key:key,img:img,col:col};
  try{
    var ling=cosmeticById(id)||cosmeticById('ling-sugarbug'), sk=skinId&&typeof skinById==='function'?skinById(skinId):null;
    spriteCache.col=(sk&&sk.main)||(ling&&ling.main)||col; spriteCache.acc=(sk&&sk.accent)||(ling&&ling.accent)||'#fff';
    var html=typeof indexlingArtHtml==='function'?indexlingArtHtml(ling,true,sk||{}):arcadeCharacterHtml();
    var m=html.match(/<svg[\s\S]*<\/svg>/);
    if(m){ var vars={}; html.replace(/(--[\w-]+)\s*:\s*([^;"]+)/g,function(_,k,v){ vars[k]=v.trim(); return _; });
      var svg0=m[0].replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g,function(_,k){ return vars[k]||'#b07cff'; }); m=[svg0];
      var svg=m[0].replace(/<svg\b/,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"'); img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); }
  }catch(e){}
  return spriteCache;
}

/* =====================================================================
   Sound
   ===================================================================== */
var AC=null, sfxT={};
function muted(){ try{ return localStorage.getItem('gx-mute')==='1'; }catch(e){ return false; } }
function sfx(kind){
  if(muted()) return; var now=performance.now(); if(sfxT[kind]&&now-sfxT[kind]<45) return; sfxT[kind]=now;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume();
    var o=AC.createOscillator(), g=AC.createGain(), t=AC.currentTime;
    var P={swing:[300,120,.07,'triangle',.07],hit:[180,70,.09,'square',.07],crit:[520,160,.14,'sawtooth',.1],hurt:[140,50,.22,'sawtooth',.16],dash:[240,520,.1,'sine',.07],nova:[90,420,.35,'sawtooth',.18],pick:[520,880,.12,'sine',.1],kill:[260,90,.12,'square',.08],boom:[100,35,.3,'sawtooth',.2],wave:[330,660,.3,'triangle',.12],shoot:[420,200,.08,'square',.04],laser:[900,200,.12,'sawtooth',.06],zap:[700,90,.14,'square',.07],pu:[400,1000,.25,'triangle',.12]}[kind];
    if(!P) return; o.type=P[3]; o.frequency.setValueAtTime(P[0],t); o.frequency.exponentialRampToValueAtTime(Math.max(20,P[1]),t+P[2]);
    g.gain.setValueAtTime(P[4],t); g.gain.exponentialRampToValueAtTime(.001,t+P[2]+.02); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+P[2]+.03);
  }catch(e){}
}

/* =====================================================================
   Game state
   ===================================================================== */
function newGame(stats){
  var map=bakeMap();
  var m={dmg:2+stats.power*1.3,reach:84,arc:2.2,cd:.34,speed:150+stats.speed*42,dashMax:1,dashRe:1.35,charge:1+(stats.focus-150)/150,crit:.05+stats.luck*.03,drop:.06+stats.luck*.015,comboT:2.4,mcap:3};
  var hp=stats.vitality+3;
  var pu={}; PU_KEYS.forEach(function(k){ pu[k]={lv:0,t:rnd(0,1),n:0}; });
  return {s:stats,m:m,map:map,phase:'ready',wave:0,score:0,kills:0,combo:0,comboTimer:0,maxCombo:0,time:0,
    p:{x:CX,y:CY+120,vx:0,vy:0,r:16,hp:hp,maxhp:hp,face:1,aim:0,atkCd:0,swing:0,swingAng:0,dash:0,dashDx:1,dashDy:0,dashCharges:1,dashTimer:0,inv:0,sp:0,rage:0,hurtFlash:0,trail:[],shieldCh:0,shieldT:0,boost:0,hitByDash:{},fireT:0},
    pu:pu,enemies:[],shots:[],pp:[],zones:[],fx:[],parts:[],drops:[],texts:[],tele:[],rings:[],queue:[],spawnT:0,
    cam:{x:CX-500,y:CY-300},vw:1000,vh:560,timeScale:1,warpT:0,
    shake:0,hitstop:0,choices:[],noHit:true,banner:null,bannerT:0,keys:{},mouse:{x:CX,y:CY,on:false,use:false},joy:{x:0,y:0},btn:{atk:false},boss:null,flash:0,last:0,starter:true,dpr:1};
}
function totalLevels(g){ var n=0; PU_KEYS.forEach(function(k){ n+=g.pu[k].lv; }); return n; }
window.arcadeGauntletStart=function(){
  clearGameTimers(); var stats=arcadeCharacterStats();
  state.games={active:'gauntlet',gx:newGame(stats),finished:false,timerId:null,raf:null};
};
window.arcadeGauntletMove=function(){}; window.arcadeGauntletStrike=function(){};
window.arcadeGauntletFinish=function(){ var g=state.games&&state.games.gx; if(g&&g.phase!=='over'&&g.phase!=='win') end(g,false); };
window.arcadeGauntletTick=function(){};
window.arcadeGauntletHtml=function(){
  var g=state.games.gx; if(!g) return '';
  setTimeout(mount,0);
  var gp=arcadeGameProgress().gauntlet||{};
  var stats='<span class="arcade-pill">🏆 Best <b>'+(gp.best||0)+'</b></span><span class="arcade-pill">🌊 Best wave <b>'+(gp.bestWave||0)+'</b></span>';
  return arcadeFrame('Character Gauntlet','Mouse aims · click / Space pulse-strikes · Shift dashes · E special · WASD moves · F fullscreen',stats,
    '<div class="gx-wrap" id="gx-wrap"><canvas id="gx-canvas" width="1000" height="560"></canvas><div class="gx-ov" id="gx-ov"></div>'+
    '<div class="gx-tools"><button class="gx-mute" id="gx-mute" type="button" aria-label="Toggle sound" title="Sound">'+(muted()?'🔇':'🔊')+'</button><button class="gx-mute" id="gx-fs" type="button" aria-label="Fullscreen" title="Fullscreen (F)">⛶</button></div>'+
    '<div class="gx-touch"><div class="gx-joy" id="gx-joy"><div class="gx-knob"></div></div><div class="gx-btns"><button data-gx="special" type="button">🔮</button><button data-gx="dash" type="button">💨</button><button data-gx="atk" type="button" class="big">💥</button></div></div></div>');
};

/* =====================================================================
   Mount, sizing, input
   ===================================================================== */
var loopId=0;
function mount(){
  var g=state.games&&state.games.gx, cv=$('gx-canvas'); if(!g||!cv||state.games.active!=='gauntlet') return;
  g.cv=cv; g.ctx=cv.getContext('2d'); g.ov=$('gx-ov'); g.wrap=$('gx-wrap'); g.sp=playerSprite();
  wire(g); fit(g); overlay(g); cancelAnimationFrame(loopId); g.last=performance.now();
  (function frame(t){
    var cur=state.games&&state.games.gx; if(cur!==g||!document.body.contains(cv)||state.games.active!=='gauntlet') return;
    var dt=Math.min(.05,(t-g.last)/1000); g.last=t; try{ update(g,dt); draw(g); }catch(e){ console.error(e); }
    loopId=requestAnimationFrame(frame);
  })(g.last);
}
function isFS(){ return !!(document.fullscreenElement||document.webkitFullscreenElement); }
function fit(g){
  var wrap=g.wrap; if(!wrap) return; var fs=isFS()&&(document.fullscreenElement===wrap||document.webkitFullscreenElement===wrap);
  var cssW=fs?window.innerWidth:wrap.clientWidth, cssH=fs?window.innerHeight:Math.round(cssW*9/16);
  if(!cssW) return; var dpr=Math.min(window.devicePixelRatio||1,1.5); g.dpr=dpr;
  g.vw=cssW<520?620:cssW<800?820:1000; g.vh=g.vw*cssH/cssW;
  g.cv.width=Math.round(cssW*dpr); g.cv.height=Math.round(cssH*dpr);
  g.cv.style.width=cssW+'px'; g.cv.style.height=cssH+'px'; g.fs=fs;
  var b=$('gx-fs'); if(b) b.textContent=fs?'🗗':'⛶';
}
function toggleFS(g){
  var w=g.wrap; if(!w) return;
  try{ if(isFS()){ (document.exitFullscreen||document.webkitExitFullscreen).call(document); } else { (w.requestFullscreen||w.webkitRequestFullscreen).call(w); } }catch(e){}
}
function wire(g){
  var wrap=g.wrap; if(!wrap||wrap.__gx===g) return; wrap.__gx=g;
  var cv=g.cv;
  function pos(e){ var r=cv.getBoundingClientRect(); return {x:g.cam.x+(e.clientX-r.left)/r.width*g.vw,y:g.cam.y+(e.clientY-r.top)/r.height*g.vh}; }
  cv.addEventListener('mousemove',function(e){ var p=pos(e); g.mouse.x=p.x; g.mouse.y=p.y; g.mouse.use=true; g.mouse.sx=e.clientX; g.mouse.sy=e.clientY; });
  cv.addEventListener('mousedown',function(e){ if(e.button===2){ e.preventDefault(); dash(g); return; } g.mouse.on=true; if(g.phase==='ready') begin(g); });
  window.addEventListener('mouseup',function(){ g.mouse.on=false; });
  cv.addEventListener('contextmenu',function(e){ e.preventDefault(); });
  wrap.addEventListener('click',function(e){
    var pk=e.target.closest&&e.target.closest('[data-gx-perk]'); if(pk){ pickPU(g,pk.getAttribute('data-gx-perk')); return; }
    if(e.target.closest&&e.target.closest('[data-gx-start]')){ begin(g); return; }
    if(e.target.closest&&e.target.closest('[data-gx-resume]')){ togglePause(g); return; }
    if(e.target.closest&&e.target.closest("#gx-fs,[data-gx-fs]")){ toggleFS(g); return; }
    if(e.target.closest&&e.target.closest('#gx-mute')){ try{ localStorage.setItem('gx-mute',muted()?'0':'1'); }catch(er){} $('gx-mute').textContent=muted()?'🔇':'🔊'; }
  });
  if(window.ResizeObserver){ var ro=new ResizeObserver(function(){ fit(g); }); ro.observe(wrap); }
  var joy=$('gx-joy'), jid=null;
  function jm(e){ var b=joy.getBoundingClientRect(), cx=b.left+b.width/2, cy=b.top+b.height/2, dx=e.clientX-cx, dy=e.clientY-cy, d=Math.hypot(dx,dy)||1, k=Math.min(1,d/46); g.joy.x=dx/d*k; g.joy.y=dy/d*k; joy.firstChild.style.transform='translate('+g.joy.x*46+'px,'+g.joy.y*46+'px)'; }
  joy.addEventListener('pointerdown',function(e){ jid=e.pointerId; joy.setPointerCapture(jid); jm(e); if(g.phase==='ready') begin(g); e.preventDefault(); });
  joy.addEventListener('pointermove',function(e){ if(e.pointerId===jid) jm(e); });
  function je(e){ if(e.pointerId!==jid) return; jid=null; g.joy.x=g.joy.y=0; joy.firstChild.style.transform=''; } joy.addEventListener('pointerup',je); joy.addEventListener('pointercancel',je);
  wrap.querySelectorAll('[data-gx]').forEach(function(b){
    var a=b.getAttribute('data-gx');
    b.addEventListener('pointerdown',function(e){ e.preventDefault(); if(g.phase==='ready') begin(g); if(a==='atk') g.btn.atk=true; else if(a==='dash') dash(g); else special(g); });
    b.addEventListener('pointerup',function(){ g.btn.atk=false; }); b.addEventListener('pointercancel',function(){ g.btn.atk=false; });
  });
}
document.addEventListener('fullscreenchange',function(){ var g=state.games&&state.games.gx; if(g) setTimeout(function(){ fit(g); },60); });
document.addEventListener('webkitfullscreenchange',function(){ var g=state.games&&state.games.gx; if(g) setTimeout(function(){ fit(g); },60); });
function keyDown(e){
  var gm=state.games; if(state.view!=='games'||!gm||gm.active!=='gauntlet'||!gm.gx) return; var g=gm.gx, k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k)>=0) e.preventDefault();
  if(k==='f'&&g.phase!=='upgrade'){ toggleFS(g); return; }
  if(g.phase==='upgrade'){ var i='123'.indexOf(k); if(i>=0&&g.choices[i]) pickPU(g,g.choices[i]); return; }
  if(k==='p'||k==='escape'){ togglePause(g); return; }
  if(g.phase==='ready'&&(k===' '||k==='enter')){ begin(g); return; }
  g.keys[k]=true;
  if(k==='shift'||k==='x') dash(g); else if(k==='e'||k==='q') special(g);
}
function keyUp(e){ var gm=state.games; if(!gm||!gm.gx) return; gm.gx.keys[e.key.toLowerCase()]=false; }
document.addEventListener('keydown',keyDown); document.addEventListener('keyup',keyUp);
window.addEventListener('blur',function(){ var g=state.games&&state.games.gx; if(g&&g.phase==='play') togglePause(g); });
function begin(g){ if(g.phase!=='ready') return; offerPU(g,true); }
function togglePause(g){ if(g.phase==='play'){ g.phase='pause'; overlay(g); } else if(g.phase==='pause'){ g.phase='play'; g.last=performance.now(); overlay(g); } }

/* =====================================================================
   Overlays
   ===================================================================== */
function pips(lv,max){ var s=''; for(var i=0;i<max;i++) s+='<i class="'+(i<lv?'on':'')+'"></i>'; return '<span class="gx-pips">'+s+'</span>'; }
function overlay(g){
  var ov=g.ov; if(!ov) return; var h='';
  if(g.phase==='ready'){
    h='<div class="gx-card"><h2>🏰 Character Gauntlet</h2><p>Explore the ruined gardens and survive <b>10 waves</b> and two bosses. Collect and level up <b>12 power-ups</b> as you go.</p><ul class="gx-keys"><li><kbd>WASD</kbd> move</li><li><kbd>Click</kbd> / <kbd>Space</kbd> pulse-strike — aim with the mouse</li><li><kbd>Shift</kbd> / right-click dash (invincible)</li><li><kbd>E</kbd> special — charges as you hit</li><li><kbd>F</kbd> fullscreen · <kbd>P</kbd> pause</li></ul><p class="gx-stats">Power '+g.s.power+' · Speed '+g.s.speed.toFixed(1)+' · Vitality '+g.s.vitality+' · Luck '+g.s.luck+' · Focus '+g.s.focus+'</p><button class="btn btn-primary btn-lg" data-gx-start>Choose power-up</button> <button class="btn btn-ghost" data-gx-fs type="button">⛶ Fullscreen</button></div>';
  } else if(g.phase==='pause'){
    h='<div class="gx-card"><h2>⏸ Paused</h2><button class="btn btn-primary btn-lg" data-gx-resume>Resume</button></div>';
  } else if(g.phase==='upgrade'){
    h='<div class="gx-card wide"><h2>'+(g.starter?'Choose your starting power-up':'Wave '+g.wave+' cleared!')+'</h2><p>'+(g.starter?'You can level it up after every wave.':'Pick a power-up or level one up')+' <span class="gx-fine">(press 1 / 2 / 3)</span></p><div class="gx-perks">'+g.choices.map(function(k,i){ var d=PU[k], lv=g.pu[k].lv; return '<button class="gx-perk" data-gx-perk="'+k+'" type="button" style="--pc:'+d.col+'"><kbd>'+(i+1)+'</kbd><span class="gx-pi">'+d.icon+'</span><b>'+d.name+'</b><em>'+(lv?'Level '+lv+' → '+(lv+1):'NEW')+'</em>'+pips(lv+1,4)+'<span class="gx-pd">'+d.lv[lv]+'</span></button>'; }).join('')+'</div></div>';
  } else if(g.phase==='over'||g.phase==='win'){
    var gp=arcadeGameProgress().gauntlet||{};
    h='<div class="gx-card wide"><h2>'+(g.phase==='win'?'🏆 Gauntlet conquered!':'💀 Run over')+'</h2><div class="gx-res"><div><b>'+g.score+'</b><span>Score</span></div><div><b>'+g.wave+'/10</b><span>Wave</span></div><div><b>'+g.kills+'</b><span>Kills</span></div><div><b>×'+g.maxCombo+'</b><span>Best combo</span></div></div>'+(g.newBest?'<p class="gx-newbest">⭐ New personal best!</p>':'<p class="gx-fine">Personal best: '+(gp.best||0)+'</p>')+'<div class="gx-build">'+PU_KEYS.filter(function(k){return g.pu[k].lv;}).map(function(k){ return '<span title="'+PU[k].name+'">'+PU[k].icon+'<small>'+g.pu[k].lv+'</small></span>'; }).join('')+'</div><div class="gx-endbtns"><button class="btn btn-primary btn-lg" data-action="arcade-gauntlet-replay">Play again</button><button class="btn btn-ghost" data-action="arcade-hub">← All games</button></div></div>';
  }
  ov.innerHTML=h; ov.style.display=h?'flex':'none';
}

/* =====================================================================
   Waves, spawning, power-up choices
   ===================================================================== */
function offerPU(g,starter){
  g.starter=!!starter;
  var pool=PU_KEYS.filter(function(k){ return g.pu[k].lv<4; }), w=pool.map(function(k){ return g.pu[k].lv>0?1.7:1; }), out=[];
  while(out.length<3&&pool.length){ var tot=w.reduce(function(a,b){return a+b;},0), x=Math.random()*tot, i=0; while(i<pool.length-1&&x>w[i]){ x-=w[i]; i++; } out.push(pool[i]); pool.splice(i,1); w.splice(i,1); }
  g.choices=out; g.phase='upgrade'; overlay(g);
}
function pickPU(g,k){
  if(g.phase!=='upgrade'||g.choices.indexOf(k)<0) return; var u=g.pu[k]; u.lv=Math.min(4,u.lv+1); u.t=0; sfx('pu');
  applyPU(g); var col=PU[k].col; g.texts.push({x:g.p.x,y:g.p.y-50,t:1.6,max:1.6,s:PU[k].icon+' '+PU[k].name+' Lv '+u.lv,c:col,big:true});
  for(var i=0;i<24;i++){ var a=rnd(0,TAU),s=rnd(60,240); g.parts.push({x:g.p.x,y:g.p.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.4,.9),max:.9,c:col,s:rnd(2,5)}); }
  g.rings.push({x:g.p.x,y:g.p.y,r:10,max:130,t:0,c:col});
  g.p.dashCharges=Math.min(g.m.dashMax,g.p.dashCharges+1); g.p.hp=Math.min(g.p.maxhp,g.p.hp+1);
  g.phase='play'; overlay(g); nextWave(g);
}
function applyPU(g){
  var d=g.pu.dash.lv; g.m.dashMax=1+(d>=3?1:0); g.m.dashRe=1.35*(d>=3?.78:1);
  var s=g.pu.shield.lv; if(s>0&&g.p.shieldCh<1&&!g.p.shieldInit){ g.p.shieldCh=1; g.p.shieldInit=1; }
}
function nextWave(g){
  g.wave++; g.queue=waveDef(g.wave); g.spawnT=1.1; g.noHit=true;
  g.banner=g.wave===5?'⚠ BOSS: The Hollow King':g.wave===10?'⚠ FINAL BOSS: Void Titan':'Wave '+g.wave; g.bannerT=2.4; sfx('wave');
}
function solid(g,x,y,r){ return g.map.obs.some(function(o){ return Math.hypot(o.x-x,o.y-y)<o.r+r; }); }
function spawn(g,type){
  var d=EN[type], p=g.p, x=0,y=0, tries=0;
  do { var a=rnd(0,TAU), dd=rnd(g.vw*.55,g.vw*.8); x=p.x+Math.cos(a)*dd; y=p.y+Math.sin(a)*dd*.8; x=clamp(x,150,WW-150); y=clamp(y,150,WH-150); tries++; } while(tries<14&&(solid(g,x,y,d.r+6)||Math.hypot(x-p.x,y-p.y)<g.vw*.4));
  if(d.boss&&tries>=14){ x=CX; y=CY-200; }
  var sc=1+g.wave*.07;
  var e={t:type,x:x,y:y,vx:0,vy:0,r:d.r,hp:d.hp*sc,maxhp:d.hp*sc,sp:d.sp*(1+g.wave*.015),cd:rnd(.8,2),flash:0,warp:.8,state:0,st:0,fuse:0,face:1,phase2:false,slow:0,freeze:0,burn:0,burnDps:0,orbT:0,stun:0};
  g.enemies.push(e); if(d.boss){ g.boss=e; g.shake=.5; }
  for(var i=0;i<10;i++) g.parts.push({x:x,y:y,vx:Math.cos(i/10*TAU)*60,vy:Math.sin(i/10*TAU)*60,life:.5,max:.5,c:d.col,s:3});
}

/* =====================================================================
   Combat helpers
   ===================================================================== */
function U(g){ return g.m.dmg*(g.p.rage>0?1.4:1); }
function nearestEnemies(g,x,y,range,n,skip){
  var l=[]; g.enemies.forEach(function(e){ if(e.dead||e.warp>0||(skip&&skip.indexOf(e)>=0)) return; var d=Math.hypot(e.x-x,e.y-y); if(d<range) l.push([d,e]); }); l.sort(function(a,b){return a[0]-b[0];}); return l.slice(0,n).map(function(a){return a[1];});
}
function dmgNum(g,e,dmg,crit,col){ if(dmg<g.m.dmg*.35&&Math.random()>.3) return; g.texts.push({x:e.x+rnd(-8,8),y:e.y-e.r,t:.7,max:.7,s:(crit?'💥':'')+Math.round(dmg),c:crit?'#ffd24a':(col||'#fff'),big:crit}); }
function damage(g,e,dmg,o){
  o=o||{}; if(e.dead) return; e.hp-=dmg; e.flash=.1;
  if(o.kb){ var l=Math.hypot(o.nx||0,o.ny||0)||1; var k=(EN[e.t].boss||e.t==='brute')?.25:1; e.vx+=(o.nx||0)/l*o.kb*k; e.vy+=(o.ny||0)/l*o.kb*k; }
  if(o.charge!==false) g.p.sp=Math.min(100,g.p.sp+(o.crit?12:(o.small?2:8))*g.m.charge);
  if(o.combo!==false){ g.combo++; g.comboTimer=g.m.comboT; g.maxCombo=Math.max(g.maxCombo,mult(g)); }
  dmgNum(g,e,dmg,o.crit,o.col); if(!o.silent){ boom(g,e.x,e.y,o.col||(o.crit?'#ffd24a':'#ffb0b0'),o.crit?9:3); sfx(o.crit?'crit':'hit'); }
  if(e.hp<=0&&!e.dead) kill(g,e);
}
function mult(g){ return Math.min(g.m.mcap,1+Math.floor(g.combo/6)*.5); }
function kill(g,e){
  e.dead=true; var d=EN[e.t]; g.kills++; var pts=Math.round(d.pts*mult(g)); g.score+=pts; sfx('kill');
  for(var i=0;i<(d.boss?44:12);i++){ var a=rnd(0,TAU),s=rnd(40,d.boss?320:190); g.parts.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.3,.8),max:.8,c:d.col,s:rnd(2,5)}); }
  g.texts.push({x:e.x,y:e.y-e.r-10,t:.9,max:.9,s:'+'+pts,c:'#7cf0a0',big:false});
  var r=Math.random();
  if(d.boss||r<g.m.drop+.04) g.drops.push({x:e.x,y:e.y,k:'heart',t:14}); else if(r<g.m.drop+.2) g.drops.push({x:e.x,y:e.y,k:'shard',t:12}); else if(r<g.m.drop+.23) g.drops.push({x:e.x,y:e.y,k:'rage',t:12});
  if(d.boss){ g.hitstop=.25; g.shake=.8; g.boss=null; g.enemies.forEach(function(o){ if(o!==e&&!o.dead){ o.hp=0; o.dead=true; boom(g,o.x,o.y,'#fff',8); } }); g.shots=[]; }
}
function boom(g,x,y,c,n){ for(var i=0;i<n;i++){ var a=rnd(0,TAU),s=rnd(40,170); g.parts.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.2,.45),max:.45,c:c,s:rnd(1.5,3.5)}); } }
function aoe(g,x,y,r,dmg,o){ o=o||{}; g.enemies.forEach(function(e){ if(e.dead||e.warp>0) return; var d=Math.hypot(e.x-x,e.y-y); if(d<r+e.r){ damage(g,e,dmg*(o.falloff?1-d/(r+e.r)*.5:1),Object.assign({nx:e.x-x,ny:e.y-y,kb:o.kb||120,col:o.col,small:o.small,silent:o.silent},o.extra||{})); if(o.burn){ e.burn=3; e.burnDps=o.burn; } if(o.slow) e.slow=Math.max(e.slow,o.slow); if(o.freeze) e.freeze=Math.max(e.freeze,o.freeze); if(o.stun) e.stun=Math.max(e.stun,o.stun); } });
}
function ringFx(g,x,y,r,c){ g.rings.push({x:x,y:y,r:10,max:r,t:0,c:c}); }
function aimAngle(g){
  var p=g.p; if(g.mouse.use&&!('ontouchstart' in window&&!g.mouse.on)) return Math.atan2(g.mouse.y-p.y,g.mouse.x-p.x);
  var n=nearestEnemies(g,p.x,p.y,200,1)[0]; if(n) return Math.atan2(n.y-p.y,n.x-p.x);
  return Math.abs(p.vx)+Math.abs(p.vy)>10?Math.atan2(p.vy,p.vx):p.aim;
}
function strike(g){
  var p=g.p, m=g.m; if(p.atkCd>0||p.dash>0) return;
  p.atkCd=m.cd/(p.rage>0?1.35:1); p.aim=aimAngle(g); p.swing=.22; p.swingAng=p.aim; p.face=Math.cos(p.aim)<0?-1:1; sfx('swing');
  var reach=m.reach, half=m.arc/2, hits=0;
  g.enemies.forEach(function(e){
    if(e.dead||e.warp>0) return; var dx=e.x-p.x, dy=e.y-p.y, d=Math.hypot(dx,dy); if(d>reach+e.r) return;
    var a=Math.atan2(dy,dx), da=Math.abs(((a-p.aim+Math.PI*3)%TAU)-Math.PI); if(da>half&&d>e.r+26) return;
    var crit=Math.random()<m.crit; damage(g,e,U(g)*(crit?2:1)*rnd(.9,1.1),{crit:crit,nx:dx,ny:dy,kb:EN[e.t].boss?60:230}); hits++;
  });
  g.shots=g.shots.filter(function(s){ if(Math.hypot(s.x-p.x,s.y-p.y)<reach){ boom(g,s.x,s.y,'#fff',5); return false; } return true; });
  if(hits){ g.hitstop=.04; g.shake=Math.max(g.shake,.1); }
}
function hurtPlayer(g,dmg,fx,fy){
  var p=g.p; if(p.inv>0||g.phase!=='play') return;
  if(p.shieldCh>0){ p.shieldCh--; p.inv=.7; p.shieldT=0; sfx('pick'); ringFx(g,p.x,p.y,90,'#7cf0a0'); boom(g,p.x,p.y,'#7cf0a0',14);
    if(g.pu.shield.lv>=4){ aoe(g,p.x,p.y,190,g.m.dmg*2,{kb:320,col:'#7cf0a0'}); ringFx(g,p.x,p.y,190,'#7cf0a0'); g.shake=.3; } return; }
  p.hp-=dmg; p.inv=1.1; p.hurtFlash=.35; g.shake=.35; g.combo=0; g.noHit=false; sfx('hurt');
  var l=Math.hypot(fx,fy)||1; p.vx+=fx/l*320; p.vy+=fy/l*320; boom(g,p.x,p.y,'#ff4a5a',12);
  if(p.hp<=0){ p.hp=0; end(g,false); }
}
function dash(g){
  var p=g.p; if(g.phase!=='play'||p.dashCharges<1||p.dash>0) return;
  var k=g.keys, dx=(k.d||k.arrowright?1:0)-(k.a||k.arrowleft?1:0)+g.joy.x, dy=(k.s||k.arrowdown?1:0)-(k.w||k.arrowup?1:0)+g.joy.y, l=Math.hypot(dx,dy);
  if(l<.1){ dx=Math.cos(aimAngle(g)); dy=Math.sin(aimAngle(g)); l=1; }
  p.dashDx=dx/l; p.dashDy=dy/l; p.dash=.19; p.inv=Math.max(p.inv,.32); p.dashCharges--; sfx('dash'); p.dashT0=0;
  var d=g.pu.dash.lv; if(d>=2){ aoe(g,p.x,p.y,110,U(g)*1.1,{kb:260,col:'#ff9a5a'}); ringFx(g,p.x,p.y,110,'#ff9a5a'); }
  if(d>=4){ g.warpT=1.6; p.boost=1.6; }
}
function special(g){
  var p=g.p; if(g.phase!=='play'||p.sp<100) return; p.sp=0; p.inv=Math.max(p.inv,.6); sfx('nova');
  ringFx(g,p.x,p.y,300,'#b07cff'); g.shake=.45; g.flash=.25;
  g.enemies.forEach(function(e){ var d=dist(e,p); if(!e.dead&&d<310){ var a=Math.atan2(e.y-p.y,e.x-p.x); damage(g,e,U(g)*4*(1-d/620),{nx:Math.cos(a),ny:Math.sin(a),kb:EN[e.t].boss?100:420,col:'#c9a0ff'}); } });
  g.shots=g.shots.filter(function(s){ if(dist(s,p)<310){ boom(g,s.x,s.y,'#b07cff',4); return false; } return true; });
}
function end(g,win){
  if(g.phase==='over'||g.phase==='win') return; g.phase=win?'win':'over';
  var gp=arcadeGameProgress(); gp.gauntlet=gp.gauntlet||{best:0};
  g.newBest=g.score>(Number(gp.gauntlet.best)||0);
  gp.gauntlet.best=Math.max(Number(gp.gauntlet.best)||0,g.score); gp.gauntlet.bestWave=Math.max(Number(gp.gauntlet.bestWave)||0,g.wave);
  gp.gauntlet.kills=(Number(gp.gauntlet.kills)||0)+g.kills; gp.gauntlet.wins=(Number(gp.gauntlet.wins)||0)+(win?1:0); gp.gauntlet.runs=(Number(gp.gauntlet.runs)||0)+1;
  try{ persistProgress(); }catch(e){}
  setTimeout(function(){ if(state.games&&state.games.gx===g) overlay(g); },win?900:700);
}

/* =====================================================================
   POWER-UP ENGINE
   ===================================================================== */
function beam(g,x,y,ang,len,w,dmg,col,pierce){
  var x2=x+Math.cos(ang)*len, y2=y+Math.sin(ang)*len, hit=0; sfx('laser');
  g.fx.push({k:'beam',x1:x,y1:y,x2:x2,y2:y2,t:.18,max:.18,c:col,w:w});
  g.enemies.forEach(function(e){ if(e.dead||e.warp>0) return; var dx=x2-x, dy=y2-y, l2=dx*dx+dy*dy, t=clamp(((e.x-x)*dx+(e.y-y)*dy)/l2,0,1), px=x+dx*t, py=y+dy*t; if(Math.hypot(e.x-px,e.y-py)<e.r+w/2){ damage(g,e,dmg,{nx:dx,ny:dy,kb:90,col:col,crit:Math.random()<g.m.crit}); hit++; } });
  g.shots=g.shots.filter(function(s){ var dx=x2-x, dy=y2-y, t=clamp(((s.x-x)*dx+(s.y-y)*dy)/(dx*dx+dy*dy),0,1); return Math.hypot(s.x-(x+dx*t),s.y-(y+dy*t))>w; });
}
function bolt(g,x1,y1,e,dmg,col,stun){
  var pts=[[x1,y1]], n=6; for(var i=1;i<n;i++){ var t=i/n; pts.push([x1+(e.x-x1)*t+rnd(-14,14),y1+(e.y-y1)*t+rnd(-14,14)]); } pts.push([e.x,e.y]);
  g.fx.push({k:'bolt',pts:pts,t:.22,max:.22,c:col}); sfx('zap'); damage(g,e,dmg,{kb:60,col:col,crit:Math.random()<g.m.crit}); if(stun) e.stun=Math.max(e.stun,stun);
}
function chain(g,start,n,dmg,col,stun,from){
  var cur=start, done=[start], fx=from?from.x:g.p.x, fy=from?from.y:g.p.y; bolt(g,fx,fy,cur,dmg,col,stun);
  for(var i=0;i<n;i++){ var nx=nearestEnemies(g,cur.x,cur.y,190,1,done)[0]; if(!nx) break; bolt(g,cur.x,cur.y,nx,dmg*.8,col,stun); done.push(nx); cur=nx; }
}
function launch(g,o){ g.pp.push(Object.assign({x:g.p.x,y:g.p.y,vx:0,vy:0,life:2,r:8,dmg:1,hit:{},t:0},o)); }
function updatePU(g,dt){
  var p=g.p, u=g.pu, Um=U(g), L;
  // LASER
  L=u.laser.lv; if(L){ u.laser.t-=dt; if(u.laser.t<=0){ var tg=nearestEnemies(g,p.x,p.y,560,2); if(tg.length){ u.laser.t=L>=2?1.0:1.5; u.laser.n++; var dm=Um*(L>=2?1.4:1)*1.0, a=Math.atan2(tg[0].y-p.y,tg[0].x-p.x);
      if(L>=3){ var a2=tg[1]?Math.atan2(tg[1].y-p.y,tg[1].x-p.x):a+.18; beam(g,p.x,p.y,a,560,12,dm,'#5ad7ff'); beam(g,p.x,p.y,a===a2?a-.18:a2,560,12,dm,'#5ad7ff'); } else beam(g,p.x,p.y,a,560,12,dm,'#5ad7ff');
      if(L>=4&&u.laser.n%3===0){ launch(g,{k:'wave',vx:Math.cos(a)*520,vy:Math.sin(a)*520,ang:a,life:1.3,r:90,dmg:Um*2.2,c:'#5ad7ff',pierce:true}); sfx('nova'); } } else u.laser.t=.2; } }
  // ORBS
  L=u.orbs.lv; if(L){ var cnt=L>=4?5:L, rad=L>=4?105:L>=3?88:76; u.orbs.a=(u.orbs.a||0)+dt*(L>=3?3.6:2.8); u.orbs.list=[]; for(var i=0;i<cnt;i++){ var aa=u.orbs.a+i/cnt*TAU, ox=p.x+Math.cos(aa)*rad, oy=p.y+Math.sin(aa)*rad; u.orbs.list.push({x:ox,y:oy});
      g.enemies.forEach(function(e){ if(e.dead||e.warp>0) return; e.orbT-=dt*0; if(Math.hypot(e.x-ox,e.y-oy)<e.r+(L>=3?20:15)){ if(!e['o'+i]||g.time-e['o'+i]>.4){ e['o'+i]=g.time; damage(g,e,Um*(L>=4?.7:.5),{nx:e.x-ox,ny:e.y-oy,kb:200,col:'#6a8cff',small:true,charge:true}); } } });
      if(L>=4) g.shots=g.shots.filter(function(s){ return Math.hypot(s.x-ox,s.y-oy)>28; }); } }
  // FIRE
  L=u.fire.lv; if(L){ u.fire.t-=dt; if(u.fire.t<=0){ var f=nearestEnemies(g,p.x,p.y,520,1)[0]; if(f){ u.fire.t=2.2; var a3=Math.atan2(f.y-p.y,f.x-p.x), fan=L>=3?[-.28,0,.28]:[0]; fan.forEach(function(o){ launch(g,{k:'fire',vx:Math.cos(a3+o)*360,vy:Math.sin(a3+o)*360,life:1.5,r:12,dmg:Um*1.3*(L>=2?1.2:1),rad:L>=2?100:68,burn:L>=2?Um*.35:0,c:'#ff8a3a'}); }); sfx('shoot'); } else u.fire.t=.3; }
    if(L>=4){ u.fire.m=(u.fire.m||5)-dt; if(u.fire.m<=0){ u.fire.m=6; var ts=nearestEnemies(g,p.x,p.y,640,6); ts.forEach(function(e,ii){ var mx=e.x+rnd(-20,20), my=e.y+rnd(-20,20); g.tele.push({t:.6+ii*.12,circle:{x:mx,y:my,r:90},good:true,fire:function(){ aoe(g,mx,my,90,Um*2,{kb:220,col:'#ff8a3a',burn:Um*.4}); ringFx(g,mx,my,90,'#ff8a3a'); g.shake=Math.max(g.shake,.2); sfx('boom'); boom(g,mx,my,'#ffb04a',16); }}); }); } } }
  // LIGHTNING
  L=u.storm.lv; if(L){ u.storm.t-=dt; if(u.storm.t<=0){ var s1=nearestEnemies(g,p.x,p.y,440,1)[0]; if(s1){ u.storm.t=L>=3?1.4:2.0; chain(g,s1,L>=2?4:1,Um*1.1,'#ffe45a',L>=3?.6:0); } else u.storm.t=.25; }
    if(L>=4){ u.storm.m=(u.storm.m||4)-dt; if(u.storm.m<=0){ u.storm.m=5; nearestEnemies(g,p.x,p.y,620,8).forEach(function(e,ii){ setTimeout(function(){ if(!e.dead&&state.games&&state.games.gx===g&&g.phase==='play') chain(g,e,2,Um*1.2,'#ffe45a',.6,{x:e.x,y:e.y-420}); },ii*90); }); } } }
  // FROST
  L=u.frost.lv; if(L){ if(L>=4){ u.frost.f=(u.frost.f||0)-dt; if(u.frost.f<=0){ u.frost.f=.5; aoe(g,p.x,p.y,190,Um*.3,{kb:0,col:'#9fe8ff',slow:1.5,small:true,silent:true}); } }
    u.frost.t-=dt; if(u.frost.t<=0){ u.frost.t=L>=4?5.5:5; var rr=L>=2?210:150; if(L>=4) rr=250; aoe(g,p.x,p.y,rr,Um*(L>=2?.8:.4),{kb:60,col:'#9fe8ff',slow:3,freeze:L>=3?1.3:0}); ringFx(g,p.x,p.y,rr,'#9fe8ff'); sfx('wave'); for(var q=0;q<18;q++){ var fa=q/18*TAU; g.parts.push({x:p.x,y:p.y,vx:Math.cos(fa)*rr*2,vy:Math.sin(fa)*rr*2,life:.4,max:.4,c:'#dff8ff',s:3}); } } }
  // SHIELD
  L=u.shield.lv; if(L){ var maxC=L>=3?2:1; if(p.shieldCh<maxC){ p.shieldT+=dt; if(p.shieldT>=(L>=2?6:12)){ p.shieldT=0; p.shieldCh++; ringFx(g,p.x,p.y,70,'#7cf0a0'); sfx('pick'); } } else p.shieldT=0;
    if(L>=3&&p.shieldCh>0) g.shots=g.shots.filter(function(s){ if(Math.hypot(s.x-p.x,s.y-p.y)<54){ boom(g,s.x,s.y,'#7cf0a0',6); return false; } return true; }); }
  // CHAKRAM
  L=u.chakram.lv; if(L){ u.chakram.t-=dt; if(u.chakram.t<=0){ var c1=nearestEnemies(g,p.x,p.y,480,1)[0]; if(c1){ u.chakram.t=L>=2?1.9:2.6; var base=Math.atan2(c1.y-p.y,c1.x-p.x), n2=L>=4?3:L>=3?2:1; for(var j=0;j<n2;j++){ var ang=n2===1?base:n2===2?base+(j?Math.PI:0):base+j/3*TAU; launch(g,{k:'chakram',x0:p.x,y0:p.y,ang:ang,dist:L>=4?430:360,dmg:Um*(L>=2?1.4:1.05),r:L>=4?30:22,life:3,out:true,sp:L>=2?620:520,c:'#ffd24a',rebound:0}); } sfx('swing'); } else u.chakram.t=.3; } }
  // TOXIC
  L=u.toxic.lv; if(L){ u.toxic.t-=dt; if(u.toxic.t<=0){ u.toxic.t=L>=3?.7:1.1; g.zones.push({k:'poison',x:p.x,y:p.y,r:L>=2?64:46,t:L>=2?5:3.5,max:L>=2?5:3.5,dps:Um*(L>=3?.8:.45),slow:L>=3,burst:L>=4,c:'#7cd23a'}); } }
  // MISSILES
  L=u.missile.lv; if(L){ u.missile.t-=dt; if(u.missile.t<=0){ var ms=nearestEnemies(g,p.x,p.y,640,6); if(ms.length){ u.missile.t=L>=3?2.2:3.0; var n3=L>=4?6:L>=2?2:1; for(var m=0;m<n3;m++){ var tg2=ms[m%ms.length], a4=rnd(0,TAU); launch(g,{k:'missile',vx:Math.cos(a4)*140,vy:Math.sin(a4)*140,life:3.2,r:9,dmg:Um*(L>=3?1.5:1.2),rad:L>=4?80:60,tg:tg2,c:'#ff6a6a',sp:L>=3?420:340}); } sfx('shoot'); } else u.missile.t=.3; } }
  // GRAVITY
  L=u.gravity.lv; if(L){ u.gravity.t-=dt; if(u.gravity.t<=0){ var gt=nearestEnemies(g,p.x,p.y,560,1)[0]; if(gt){ var cl=g.enemies.filter(function(e){return !e.dead&&Math.hypot(e.x-gt.x,e.y-gt.y)<220;}).length; u.gravity.t=7; g.zones.push({k:'gravity',x:gt.x,y:gt.y,r:L>=2?250:180,t:L>=2?3.2:2.2,max:L>=2?3.2:2.2,dps:L>=3?Um*.7:0,collapse:L>=4,c:'#b07cff'}); sfx('wave'); } else u.gravity.t=.4; } }
  // DASH trail
  L=u.dash.lv; if(L&&p.dash>0){ u.dash.f=(u.dash.f||0)-dt; if(u.dash.f<=0){ u.dash.f=.04; g.zones.push({k:'fire',x:p.x,y:p.y,r:34,t:3,max:3,dps:Um*.6,c:'#ff9a5a'}); } }
  // SPIRITS
  L=u.spirit.lv; if(L){ var sc=L>=4?4:L>=2?2:1; u.spirit.a=(u.spirit.a||0)+dt*1.7; u.spirit.list=[]; u.spirit.t-=dt;
    for(var s=0;s<sc;s++){ var sa=u.spirit.a+s/sc*TAU, sx=p.x+Math.cos(sa)*62, sy=p.y+Math.sin(sa)*42-14; u.spirit.list.push({x:sx,y:sy}); }
    if(u.spirit.t<=0){ var sn=nearestEnemies(g,p.x,p.y,460,sc); if(sn.length){ u.spirit.t=L>=3?.55:.95; u.spirit.list.forEach(function(sp,ii){ var e=sn[ii%sn.length], a5=Math.atan2(e.y-sp.y,e.x-sp.x); launch(g,{k:'bolt',x:sp.x,y:sp.y,vx:Math.cos(a5)*560,vy:Math.sin(a5)*560,life:1,r:7,dmg:Um*(L>=3?.8:.55),c:'#d6c8ff'}); }); sfx('shoot'); } else u.spirit.t=.25; }
    if(L>=4){ u.spirit.b=(u.spirit.b||6)-dt; if(u.spirit.b<=0){ u.spirit.b=6; u.spirit.list.forEach(function(sp){ for(var k=0;k<6;k++){ var a6=k/6*TAU; launch(g,{k:'bolt',x:sp.x,y:sp.y,vx:Math.cos(a6)*400,vy:Math.sin(a6)*400,life:.9,r:7,dmg:Um*.8,c:'#d6c8ff'}); } }); ringFx(g,p.x,p.y,120,'#d6c8ff'); } } }
}
function updateProjectiles(g,dt){
  var p=g.p, Um=U(g);
  g.pp.forEach(function(b){
    b.t+=dt; b.life-=dt;
    if(b.k==='chakram'){ var tx=b.out?b.x0+Math.cos(b.ang)*b.dist:p.x, ty=b.out?b.y0+Math.sin(b.ang)*b.dist:p.y, d=Math.hypot(tx-b.x,ty-b.y), sp=b.sp*dt; if(d<=sp+4){ if(b.out){ b.out=false; b.hit={}; } else { b.life=0; } } else { b.x+=(tx-b.x)/d*sp; b.y+=(ty-b.y)/d*sp; } b.rot=(b.rot||0)+dt*18; }
    else if(b.k==='missile'){ if(b.tg&&b.tg.dead){ b.tg=nearestEnemies(g,b.x,b.y,500,1)[0]; } if(b.tg){ var a=Math.atan2(b.tg.y-b.y,b.tg.x-b.x), cur=Math.atan2(b.vy,b.vx), da=((a-cur+Math.PI*3)%TAU)-Math.PI; cur+=clamp(da,-6*dt,6*dt); b.vx=Math.cos(cur)*b.sp; b.vy=Math.sin(cur)*b.sp; } b.x+=b.vx*dt; b.y+=b.vy*dt; if(Math.random()<.6) g.parts.push({x:b.x,y:b.y,vx:rnd(-20,20),vy:rnd(-20,20),life:.3,max:.3,c:'#ffb04a',s:2.5}); }
    else { b.x+=b.vx*dt; b.y+=b.vy*dt; }
    if(b.k==='fire'&&Math.random()<.7) g.parts.push({x:b.x,y:b.y,vx:rnd(-30,30),vy:rnd(-30,30),life:.3,max:.3,c:'#ffb04a',s:3});
    // collisions
    if(b.life<=0) { if(b.k==='fire'||b.k==='missile') explode(g,b); return; }
    if(b.k==='fire'||b.k==='missile'||b.k==='bolt'){ if(g.map.obs.some(function(o){ return o.r>=16&&Math.hypot(o.x-b.x,o.y-b.y)<o.r+b.r; })&&b.k!=='bolt'){ b.life=0; explode(g,b); return; } }
    for(var i=0;i<g.enemies.length;i++){ var e=g.enemies[i]; if(e.dead||e.warp>0) continue;
      if(Math.hypot(e.x-b.x,e.y-b.y)<e.r+b.r){
        if(b.k==='fire'||b.k==='missile'){ b.life=0; explode(g,b); return; }
        if(b.k==='bolt'){ b.life=0; damage(g,e,b.dmg,{nx:b.vx,ny:b.vy,kb:90,col:b.c,small:true}); return; }
        var key=e.x+'|'+e.t+'|'+e.maxhp; if(!b.hit[key]){ b.hit[key]=1; damage(g,e,b.dmg,{nx:b.vx||(e.x-b.x),ny:b.vy||(e.y-b.y),kb:b.k==='wave'?260:140,col:b.c,crit:Math.random()<g.m.crit}); } } }
  });
  g.pp=g.pp.filter(function(b){ return b.life>0&&b.x>-60&&b.x<WW+60&&b.y>-60&&b.y<WH+60; });
}
function explode(g,b){ aoe(g,b.x,b.y,b.rad,b.dmg,{kb:200,col:b.c,burn:b.burn}); ringFx(g,b.x,b.y,b.rad,b.c); boom(g,b.x,b.y,b.c,14); g.shake=Math.max(g.shake,.15); sfx('boom'); }
function updateZones(g,dt){
  var Um=U(g);
  g.zones.forEach(function(z){
    z.t-=dt; z.tk=(z.tk||0)-dt;
    if(z.k==='gravity'){ g.enemies.forEach(function(e){ if(e.dead||e.warp>0||EN[e.t].boss) return; var d=Math.hypot(z.x-e.x,z.y-e.y); if(d<z.r){ e.x+=(z.x-e.x)/(d||1)*260*dt; e.y+=(z.y-e.y)/(d||1)*260*dt; } }); if(z.dps&&z.tk<=0){ z.tk=.4; aoe(g,z.x,z.y,z.r*.55,z.dps*.4,{kb:0,col:'#b07cff',small:true,silent:true}); } if(z.t<=0&&z.collapse){ aoe(g,z.x,z.y,z.r*.9,Um*3,{kb:420,col:'#b07cff'}); ringFx(g,z.x,z.y,z.r*.9,'#b07cff'); g.shake=.4; sfx('boom'); boom(g,z.x,z.y,'#d6b0ff',30); } }
    else if(z.k==='poison'||z.k==='fire'){ if(z.tk<=0){ z.tk=.35; g.enemies.forEach(function(e){ if(e.dead||e.warp>0) return; if(Math.hypot(e.x-z.x,e.y-z.y)<z.r+e.r*.6){ damage(g,e,z.dps*.35,{kb:0,col:z.c,small:true,silent:true,charge:false,combo:false}); if(z.slow) e.slow=Math.max(e.slow,.6); } }); } if(z.t<=0&&z.burst){ aoe(g,z.x,z.y,z.r*1.5,Um*1.2,{kb:160,col:'#7cd23a'}); ringFx(g,z.x,z.y,z.r*1.5,'#7cd23a'); } }
  });
  g.zones=g.zones.filter(function(z){ return z.t>0; });
}
function updateFx(g,dt){
  g.fx.forEach(function(f){ f.t-=dt; }); g.fx=g.fx.filter(function(f){ return f.t>0; });
}

/* =====================================================================
   Update
   ===================================================================== */
function update(g,dt){
  if(g.hitstop>0){ g.hitstop-=dt; dt*=.08; }
  var p=g.p; g.time+=dt;
  g.parts.forEach(function(q){ q.x+=q.vx*dt; q.y+=q.vy*dt; q.vx*=.93; q.vy*=.93; q.life-=dt; }); g.parts=g.parts.filter(function(q){ return q.life>0; });
  g.texts.forEach(function(t){ t.t-=dt; t.y-=34*dt; }); g.texts=g.texts.filter(function(t){ return t.t>0; });
  g.rings.forEach(function(r){ r.t+=dt; r.r=10+(r.max-10)*Math.min(1,r.t/.35); }); g.rings=g.rings.filter(function(r){ return r.t<.45; });
  g.shake=Math.max(0,g.shake-dt*1.4); g.flash=Math.max(0,g.flash-dt); if(g.bannerT>0) g.bannerT-=dt;
  updateFx(g,dt); camera(g,dt);
  if(g.phase!=='play'&&g.phase!=='over'&&g.phase!=='win') return;
  if(g.phase==='over'||g.phase==='win'){ g.enemies.forEach(function(e){ e.vx*=.9; e.vy*=.9; }); return; }
  g.warpT=Math.max(0,g.warpT-dt); g.timeScale=g.warpT>0?.45:1;
  p.atkCd=Math.max(0,p.atkCd-dt); p.swing=Math.max(0,p.swing-dt); p.inv=Math.max(0,p.inv-dt); p.hurtFlash=Math.max(0,p.hurtFlash-dt); p.rage=Math.max(0,p.rage-dt); p.boost=Math.max(0,p.boost-dt);
  if(p.dashCharges<g.m.dashMax){ p.dashTimer+=dt; if(p.dashTimer>=g.m.dashRe){ p.dashTimer=0; p.dashCharges++; } } else p.dashTimer=0;
  g.comboTimer-=dt; if(g.comboTimer<=0) g.combo=0;
  // movement
  var k=g.keys, ix=(k.d||k.arrowright?1:0)-(k.a||k.arrowleft?1:0)+g.joy.x, iy=(k.s||k.arrowdown?1:0)-(k.w||k.arrowup?1:0)+g.joy.y, il=Math.hypot(ix,iy);
  if(il>1){ ix/=il; iy/=il; }
  if(p.dash>0){ p.dash-=dt; p.vx=p.dashDx*740; p.vy=p.dashDy*740; p.trail.push({x:p.x,y:p.y,t:.25}); }
  else { var sp=g.m.speed*(p.boost>0?1.4:1); p.vx+=(ix*sp-p.vx)*Math.min(1,dt*14); p.vy+=(iy*sp-p.vy)*Math.min(1,dt*14); }
  p.x+=p.vx*dt; p.y+=p.vy*dt; p.x=clamp(p.x,p.r+70,WW-p.r-70); p.y=clamp(p.y,p.r+70,WH-p.r-70);
  g.map.obs.forEach(function(o){ var dx=p.x-o.x, dy=p.y-o.y; if(Math.abs(dx)>o.r+40||Math.abs(dy)>o.r+40) return; var d=Math.hypot(dx,dy),m=o.r+p.r; if(d<m){ var a=Math.atan2(dy,dx); p.x=o.x+Math.cos(a)*m; p.y=o.y+Math.sin(a)*m; } });
  p.trail.forEach(function(t){ t.t-=dt; }); p.trail=p.trail.filter(function(t){ return t.t>0; });
  if(Math.abs(p.vx)>20) p.face=p.vx<0?-1:1; if(g.mouse.use) p.face=Math.cos(Math.atan2(g.mouse.y-p.y,g.mouse.x-p.x))<0?-1:1;
  if(g.keys[' ']||g.mouse.on||g.btn.atk) strike(g);
  // mouse world pos follows camera when the mouse is idle
  if(g.mouse.use&&g.mouse.sx!=null){ var r=g.cv.getBoundingClientRect(); g.mouse.x=g.cam.x+(g.mouse.sx-r.left)/r.width*g.vw; g.mouse.y=g.cam.y+(g.mouse.sy-r.top)/r.height*g.vh; }
  // spawn
  if(g.queue.length){ g.spawnT-=dt; if(g.spawnT<=0&&g.enemies.filter(function(e){return !e.dead;}).length<14+g.wave*2){ spawn(g,g.queue.shift()); g.spawnT=Math.max(.3,1.2-g.wave*.08); } }
  updatePU(g,dt); updateProjectiles(g,dt); updateZones(g,dt);
  // enemies
  var edt=dt*g.timeScale; g.enemies.forEach(function(e){ enemyAI(g,e,edt); }); g.enemies=g.enemies.filter(function(e){ return !e.dead; });
  // enemy shots
  g.shots.forEach(function(s){
    s.x+=s.vx*edt; s.y+=s.vy*edt; s.life-=edt;
    g.map.obs.forEach(function(o){ if(o.r>=16&&Math.hypot(s.x-o.x,s.y-o.y)<o.r+s.r){ s.life=0; boom(g,s.x,s.y,'#fff',3); } });
    if(s.x<0||s.x>WW||s.y<0||s.y>WH) s.life=0;
    if(s.life>0&&Math.hypot(s.x-p.x,s.y-p.y)<s.r+p.r-3){ s.life=0; hurtPlayer(g,1,s.vx,s.vy); }
  }); g.shots=g.shots.filter(function(s){ return s.life>0; });
  g.tele.forEach(function(t){ t.t-=dt; if(t.t<=0&&!t.done){ t.done=true; t.fire(g); } }); g.tele=g.tele.filter(function(t){ return !t.done||t.t>-.2; });
  g.drops.forEach(function(d){
    d.t-=dt; var dd=dist(d,p), mg=90; if(dd<mg){ d.x+=(p.x-d.x)/dd*300*dt; d.y+=(p.y-d.y)/dd*300*dt; }
    if(dd<p.r+16){ d.t=0; sfx('pick'); if(d.k==='heart'){ p.hp=Math.min(p.maxhp,p.hp+1); g.texts.push({x:p.x,y:p.y-30,t:.9,max:.9,s:'❤ +1',c:'#ff6a8a',big:true}); } else if(d.k==='shard'){ p.sp=Math.min(100,p.sp+30); g.texts.push({x:p.x,y:p.y-30,t:.9,max:.9,s:'🔮 +30',c:'#c07cff',big:true}); } else { p.rage=8; g.texts.push({x:p.x,y:p.y-30,t:.9,max:.9,s:'🔥 RAGE',c:'#ffb02a',big:true}); } }
  }); g.drops=g.drops.filter(function(d){ return d.t>0; });
  if(g.wave>0&&!g.queue.length&&!g.enemies.length&&g.phase==='play'){
    var bonus=100*g.wave+(g.noHit?150:0); g.score+=bonus; g.texts.push({x:p.x,y:p.y-80,t:1.8,max:1.8,s:'Wave clear +'+bonus+(g.noHit?' (flawless!)':''),c:'#ffd24a',big:true});
    if(g.wave>=10){ end(g,true); return; }
    g.phase='wait'; setTimeout(function(){ if(state.games&&state.games.gx===g&&g.phase==='wait'){ offerPU(g,false); } },1300);
  }
}
function camera(g,dt){
  var p=g.p, tx=p.x-g.vw/2+(g.mouse.use?(g.mouse.x-p.x)*.12:0), ty=p.y-g.vh/2+(g.mouse.use?(g.mouse.y-p.y)*.12:0);
  tx=clamp(tx,0,Math.max(0,WW-g.vw)); ty=clamp(ty,0,Math.max(0,WH-g.vh));
  var k=Math.min(1,dt*7); if(g.phase==='ready'){ g.cam.x=tx; g.cam.y=ty; } else { g.cam.x+=(tx-g.cam.x)*k; g.cam.y+=(ty-g.cam.y)*k; }
}

/* =====================================================================
   Enemy AI
   ===================================================================== */
function enemyAI(g,e,dt){
  var p=g.p, d=EN[e.t]; e.flash=Math.max(0,e.flash-dt); e.cd-=dt; e.slow=Math.max(0,e.slow-dt); e.freeze=Math.max(0,e.freeze-dt); e.stun=Math.max(0,e.stun-dt);
  if(e.burn>0){ e.burn-=dt; e.bt=(e.bt||0)-dt; if(e.bt<=0){ e.bt=.4; damage(g,e,e.burnDps*.4,{kb:0,col:'#ff8a3a',small:true,silent:true,charge:false,combo:false}); if(e.dead) return; } }
  if(e.warp>0){ e.warp-=dt; return; }
  e.x+=e.vx*dt; e.y+=e.vy*dt; e.vx*=.88; e.vy*=.88;
  if(e.freeze>0||e.stun>0) return;
  var dx=p.x-e.x, dy=p.y-e.y, dd=Math.hypot(dx,dy)||1, nx=dx/dd, ny=dy/dd; e.face=nx<0?-1:1;
  var spd=e.sp*(e.slow>0?.5:1);
  if(e.t==='runner'){ var zz=Math.sin(g.time*6+e.x)*.6; e.x+=(nx-ny*zz)*spd*dt; e.y+=(ny+nx*zz)*spd*dt; }
  else if(e.t==='spitter'){
    var want=dd>300?1:dd<210?-1:0; e.x+=nx*spd*want*dt; e.y+=ny*spd*want*dt; e.x+=-ny*spd*.4*dt*(Math.sin(e.cd)>0?1:-1);
    if(e.cd<=0&&dd<700){ e.cd=2.1; var ex=e; g.tele.push({t:.45,line:[ex,p],fire:function(){ if(ex.dead) return; var a=Math.atan2(g.p.y-ex.y,g.p.x-ex.x); g.shots.push({x:ex.x,y:ex.y,vx:Math.cos(a)*240,vy:Math.sin(a)*240,r:7,life:4,enemy:true}); sfx('shoot'); }}); }
  }
  else if(e.t==='brute'){
    if(e.state===0){ e.x+=nx*spd*dt; e.y+=ny*spd*dt; if(e.cd<=0&&dd<190){ e.state=1; e.st=.75; var eb=e; g.tele.push({t:.75,circle:{e:eb,r:92},fire:function(){ if(eb.dead) return; slam(g,eb.x,eb.y,92,1); }}); } }
    else { e.st-=dt; if(e.st<=0){ e.state=0; e.cd=2.6; } }
  }
  else if(e.t==='bomber'){
    if(e.state===0){ e.x+=nx*spd*dt; e.y+=ny*spd*dt; if(dd<88){ e.state=1; e.fuse=.8; } }
    else { e.fuse-=dt; if(e.fuse<=0){ e.dead=true; slam(g,e.x,e.y,98,1,true); } }
  }
  else if(e.t==='king') bossKing(g,e,dt,nx,ny,dd,spd);
  else if(e.t==='titan') bossTitan(g,e,dt,nx,ny,dd,spd);
  else { e.x+=nx*spd*dt; e.y+=ny*spd*dt; }
  g.enemies.forEach(function(o){ if(o===e||o.dead) return; var ox=e.x-o.x, oy=e.y-o.y, od=Math.hypot(ox,oy), m=e.r+o.r; if(od>0&&od<m){ e.x+=ox/od*(m-od)*.4; e.y+=oy/od*(m-od)*.4; } });
  g.map.obs.forEach(function(o){ var ox=e.x-o.x, oy=e.y-o.y; if(Math.abs(ox)>o.r+e.r+4||Math.abs(oy)>o.r+e.r+4) return; var od=Math.hypot(ox,oy)||1, m=o.r+e.r; if(od<m){ e.x=o.x+ox/od*m; e.y=o.y+oy/od*m; } });
  e.x=clamp(e.x,e.r+40,WW-e.r-40); e.y=clamp(e.y,e.r+40,WH-e.r-40);
  if((e.t==='grunt'||e.t==='runner'||e.t==='king'||e.t==='titan'||e.t==='brute')&&dist(e,p)<e.r+p.r-4) hurtPlayer(g,1,-dx,-dy);
}
function slam(g,x,y,r,dmg,friendly){
  ringFx(g,x,y,r,friendly?'#ff9a3c':'#ff6a6a'); g.shake=Math.max(g.shake,.3); sfx('boom'); boom(g,x,y,'#ffb04a',16);
  if(dist({x:x,y:y},g.p)<r+g.p.r-4) hurtPlayer(g,dmg,g.p.x-x,g.p.y-y);
  if(friendly) g.enemies.forEach(function(o){ if(!o.dead&&Math.hypot(o.x-x,o.y-y)<r+o.r){ damage(g,o,10,{kb:0,col:'#ff9a3c'}); } });
}
function ringShots(g,e,n,off,sp){ for(var i=0;i<n;i++){ var a=off+i/n*TAU; g.shots.push({x:e.x,y:e.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:8,life:5,enemy:true}); } sfx('shoot'); }
function bossKing(g,e,dt,nx,ny,dd,spd){
  if(!e.phase2&&e.hp<e.maxhp*.5){ e.phase2=true; for(var i=0;i<4;i++) g.queue.unshift('grunt'); g.spawnT=.2; g.texts.push({x:e.x,y:e.y-60,t:1.5,max:1.5,s:'ENRAGED!',c:'#ff6a6a',big:true}); g.shake=.5; }
  if(e.state===0){ var f=e.phase2?1.35:1; e.x+=nx*spd*dt*f; e.y+=ny*spd*dt*f; if(e.cd<=0){ if(Math.random()<.45){ e.state=1; e.st=.9; var eb=e, ang=Math.atan2(g.p.y-e.y,g.p.x-e.x); e.cx=Math.cos(ang); e.cy=Math.sin(ang); g.tele.push({t:.9,line:[eb,{x:eb.x+e.cx*560,y:eb.y+e.cy*560}],wide:44,fire:function(){ eb.state=2; eb.st=.45; }}); } else { ringShots(g,e,e.phase2?18:12,rnd(0,TAU),175); e.cd=e.phase2?1.6:2.2; } } }
  else if(e.state===1){ e.st-=dt; }
  else { e.x+=e.cx*640*dt; e.y+=e.cy*640*dt; e.st-=dt; if(e.st<=0){ e.state=0; e.cd=1.3; slam(g,e.x,e.y,84,1); } }
}
function bossTitan(g,e,dt,nx,ny,dd,spd){
  if(!e.phase2&&e.hp<e.maxhp*.5){ e.phase2=true; g.texts.push({x:e.x,y:e.y-70,t:1.6,max:1.6,s:'THE VOID AWAKENS',c:'#c07cff',big:true}); g.shake=.6; for(var i=0;i<5;i++) g.queue.unshift('runner'); g.spawnT=.2; }
  e.x+=nx*spd*dt*.6; e.y+=ny*spd*dt*.6; e.spin=(e.spin||0)+dt*(e.phase2?2.4:1.6);
  e.shotT=(e.shotT||0)-dt; if(e.shotT<=0){ e.shotT=e.phase2?.17:.3; var a=e.spin*2; g.shots.push({x:e.x,y:e.y,vx:Math.cos(a)*195,vy:Math.sin(a)*195,r:7,life:5,enemy:true}); g.shots.push({x:e.x,y:e.y,vx:Math.cos(a+Math.PI)*195,vy:Math.sin(a+Math.PI)*195,r:7,life:5,enemy:true}); }
  if(e.cd<=0){ e.cd=e.phase2?3:4.2; var eb=e; g.tele.push({t:1,circle:{e:eb,r:155},fire:function(){ if(eb.dead) return; slam(g,eb.x,eb.y,155,2); ringShots(g,eb,14,rnd(0,TAU),205); }}); }
}

/* =====================================================================
   Rendering
   ===================================================================== */
function drawProp(c,o,t){
  var s=o.s;
  if(o.k==='tree'){ var sw=Math.sin(t*1.3+o.sd)*2.5*s; c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(o.x+10,o.y+8,30*s,12*s,0,0,TAU); c.fill(); c.fillStyle='#5a3d22'; c.fillRect(o.x-5*s,o.y-34*s,10*s,38*s); c.fillStyle='#3f2a16'; c.fillRect(o.x+1*s,o.y-34*s,4*s,38*s);
    var gc=[['#2f6b3a','#3f8a4a'],['#2a5f3a','#378348'],['#3a7a40','#4a9a54']][o.v]; [[-14,-52,26],[14,-50,24],[0,-72,28],[-4,-44,26]].forEach(function(b,i){ var gr=c.createRadialGradient(o.x+b[0]*s+sw-6,o.y+b[1]*s-8,2,o.x+b[0]*s+sw,o.y+b[1]*s,b[2]*s); gr.addColorStop(0,gc[1]); gr.addColorStop(1,gc[0]); c.fillStyle=gr; c.beginPath(); c.arc(o.x+b[0]*s+sw*(i%2?.6:1),o.y+b[1]*s,b[2]*s,0,TAU); c.fill(); }); }
  else if(o.k==='rock'){ var rr=o.r; c.fillStyle='rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(o.x+6,o.y+rr*.6,rr*1.05,rr*.45,0,0,TAU); c.fill(); var rg=c.createLinearGradient(o.x-rr,o.y-rr,o.x+rr,o.y+rr); rg.addColorStop(0,'#9a98ac'); rg.addColorStop(1,'#55536a'); c.fillStyle=rg; c.beginPath(); c.moveTo(o.x-rr,o.y+rr*.3); c.lineTo(o.x-rr*.6,o.y-rr*.8); c.lineTo(o.x+rr*.2,o.y-rr); c.lineTo(o.x+rr*.95,o.y-rr*.3); c.lineTo(o.x+rr*.8,o.y+rr*.6); c.lineTo(o.x-rr*.3,o.y+rr*.8); c.closePath(); c.fill(); c.fillStyle='rgba(255,255,255,.16)'; c.beginPath(); c.moveTo(o.x-rr*.6,o.y-rr*.8); c.lineTo(o.x+rr*.2,o.y-rr); c.lineTo(o.x,o.y-rr*.1); c.closePath(); c.fill(); c.strokeStyle='#3a384e'; c.lineWidth=2; c.stroke(); }
  else if(o.k==='col'){ c.fillStyle='rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(o.x+8,o.y+8,28,11,0,0,TAU); c.fill(); var h=o.broken?46:78; var cg=c.createLinearGradient(o.x-16,0,o.x+16,0); cg.addColorStop(0,'#c9c6dc'); cg.addColorStop(.5,'#9d9ab6'); cg.addColorStop(1,'#6a6784'); c.fillStyle='#7d7a96'; c.fillRect(o.x-22,o.y-8,44,14); c.fillStyle=cg; c.fillRect(o.x-15,o.y-8-h,30,h); c.fillStyle='rgba(0,0,0,.18)'; for(var k=-8;k<=8;k+=8) c.fillRect(o.x+k-1,o.y-8-h,2,h); c.fillStyle='#8b88a6'; if(o.broken){ c.beginPath(); c.moveTo(o.x-15,o.y-8-h); c.lineTo(o.x-5,o.y-18-h); c.lineTo(o.x+4,o.y-8-h); c.lineTo(o.x+10,o.y-14-h); c.lineTo(o.x+15,o.y-8-h); c.fill(); } else { c.fillRect(o.x-21,o.y-16-h,42,10); c.fillRect(o.x-17,o.y-22-h,34,7); } }
  else if(o.k==='torch'){ c.fillStyle='#4a3a2a'; c.fillRect(o.x-3,o.y-30,6,32); c.fillStyle='#2a2018'; c.fillRect(o.x-7,o.y-34,14,6); var fl=1+Math.sin(t*14+o.sd)*.14; c.save(); c.globalCompositeOperation='lighter'; var tg=c.createRadialGradient(o.x,o.y-40,2,o.x,o.y-40,70*fl); tg.addColorStop(0,'rgba(255,190,90,.55)'); tg.addColorStop(1,'rgba(255,120,30,0)'); c.fillStyle=tg; c.fillRect(o.x-80,o.y-120,160,160); c.restore(); c.fillStyle='#ff8a2a'; c.beginPath(); c.ellipse(o.x,o.y-42,6*fl,11*fl,0,0,TAU); c.fill(); c.fillStyle='#ffe08a'; c.beginPath(); c.ellipse(o.x,o.y-39,3*fl,6*fl,0,0,TAU); c.fill(); }
  else if(o.k==='bush'){ c.fillStyle='rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(o.x,o.y+5,18*s,6*s,0,0,TAU); c.fill(); [[-9,-4,11],[9,-3,10],[0,-10,12]].forEach(function(b,i){ c.fillStyle=['#2f6b3a','#3a7a40','#2a5f3a'][i]; c.beginPath(); c.arc(o.x+b[0]*s,o.y+b[1]*s,b[2]*s,0,TAU); c.fill(); }); if(o.v===0){ c.fillStyle='#ff6a8a'; [[-8,-8],[6,-5],[0,-14]].forEach(function(b){ c.beginPath(); c.arc(o.x+b[0]*s,o.y+b[1]*s,2.2,0,TAU); c.fill(); }); } }
}
function draw(g){
  var c=g.ctx, p=g.p, k=g.cv.width/g.vw, cam=g.cam, t=g.time, vw=g.vw, vh=g.vh;
  c.setTransform(k,0,0,k,0,0); c.clearRect(0,0,vw,vh);
  var sx=g.shake>0?rnd(-1,1)*g.shake*14:0, sy=g.shake>0?rnd(-1,1)*g.shake*14:0; var cx=Math.round(cam.x)+sx*-1, cy=Math.round(cam.y)+sy*-1;
  c.save(); c.translate(-cx,-cy);
  // ground
  c.drawImage(g.map.bg,0,0);
  // water shimmer
  g.map.ponds.forEach(function(pd){ if(Math.abs(pd.x-(cx+vw/2))>vw/2+pd.rx||Math.abs(pd.y-(cy+vh/2))>vh/2+pd.ry) return; c.strokeStyle='rgba(255,255,255,.28)'; c.lineWidth=2; for(var i=0;i<4;i++){ var ph=Math.abs((t*.4+i*.25)%1); c.globalAlpha=1-ph; c.beginPath(); c.ellipse(pd.x+Math.sin(i*2)*pd.rx*.3,pd.y+Math.cos(i*3)*pd.ry*.2,ph*pd.rx*.5,ph*pd.ry*.5,0,0,TAU); c.stroke(); } c.globalAlpha=1; });
  // zones (under entities)
  g.zones.forEach(function(z){ var a=clamp(z.t/z.max,0,1); c.save(); if(z.k==='poison'){ var pg=c.createRadialGradient(z.x,z.y,4,z.x,z.y,z.r); pg.addColorStop(0,'rgba(140,230,60,'+(.55*a)+')'); pg.addColorStop(1,'rgba(80,160,30,0)'); c.fillStyle=pg; c.beginPath(); c.arc(z.x,z.y,z.r,0,TAU); c.fill(); c.fillStyle='rgba(180,255,90,'+(.5*a)+')'; for(var i=0;i<4;i++){ var bb=(t*.8+i*.25)%1; c.beginPath(); c.arc(z.x+Math.cos(i*2)*z.r*.5,z.y-bb*z.r*.6+Math.sin(i)*8,3,0,TAU); c.fill(); } }
    else if(z.k==='fire'){ var fg=c.createRadialGradient(z.x,z.y,2,z.x,z.y,z.r); fg.addColorStop(0,'rgba(255,200,90,'+(.8*a)+')'); fg.addColorStop(1,'rgba(255,90,30,0)'); c.globalCompositeOperation='lighter'; c.fillStyle=fg; c.beginPath(); c.arc(z.x,z.y,z.r*(1+Math.sin(t*20+z.x)*.1),0,TAU); c.fill(); }
    else if(z.k==='gravity'){ var gg=c.createRadialGradient(z.x,z.y,6,z.x,z.y,z.r); gg.addColorStop(0,'rgba(10,0,30,.9)'); gg.addColorStop(.35,'rgba(110,50,200,.4)'); gg.addColorStop(1,'rgba(176,124,255,0)'); c.fillStyle=gg; c.beginPath(); c.arc(z.x,z.y,z.r,0,TAU); c.fill(); c.strokeStyle='rgba(200,160,255,.7)'; c.lineWidth=3; for(var j=0;j<3;j++){ var ph2=((t*1.2+j/3)%1); c.globalAlpha=1-ph2; c.beginPath(); c.arc(z.x,z.y,z.r*(1-ph2),0,TAU); c.stroke(); } c.globalAlpha=1; c.fillStyle='#050010'; c.beginPath(); c.arc(z.x,z.y,16+Math.sin(t*10)*2,0,TAU); c.fill(); } c.restore(); });
  if(g.pu.frost.lv>=4){ c.save(); var fz=c.createRadialGradient(p.x,p.y,20,p.x,p.y,250); fz.addColorStop(0,'rgba(160,230,255,.25)'); fz.addColorStop(1,'rgba(160,230,255,0)'); c.fillStyle=fz; c.beginPath(); c.arc(p.x,p.y,250,0,TAU); c.fill(); c.restore(); }
  // telegraphs
  g.tele.forEach(function(tt){ if(tt.done) return; var kk=1-clamp(tt.t/(tt.max||(tt.max=tt.t+.0001)),0,1); c.save(); c.globalAlpha=.25+kk*.45; var good=tt.good; c.fillStyle=good?'#ff9a3c':'#ff3a3a'; c.strokeStyle=good?'#ffcf7a':'#ff6a6a';
    if(tt.circle){ var ce=tt.circle.e||tt.circle; c.beginPath(); c.arc(ce.x,ce.y,tt.circle.r,0,TAU); c.fill(); c.beginPath(); c.arc(ce.x,ce.y,tt.circle.r*kk,0,TAU); c.stroke(); }
    else if(tt.line){ c.lineWidth=tt.wide||3; c.setLineDash([10,8]); c.beginPath(); c.moveTo(tt.line[0].x,tt.line[0].y); c.lineTo(tt.line[1].x,tt.line[1].y); c.stroke(); } c.restore(); });
  g.enemies.forEach(function(e){ if(e.warp>0){ c.strokeStyle=EN[e.t].col; c.globalAlpha=.8; c.lineWidth=3; c.beginPath(); c.arc(e.x,e.y,e.r*(1+e.warp*2.2),0,TAU); c.stroke(); c.globalAlpha=1; } });
  // drops
  g.drops.forEach(function(d){ var bob=Math.sin(g.time*5+d.x)*3; c.globalAlpha=d.t<3?(Math.sin(g.time*20)>0?1:.35):1; c.shadowColor=d.k==='heart'?'#ff4a6a':d.k==='shard'?'#b07cff':'#ffb02a'; c.shadowBlur=14; c.font='24px sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(d.k==='heart'?'❤️':d.k==='shard'?'🔮':'🔥',d.x,d.y+bob); c.shadowBlur=0; c.globalAlpha=1; });
  p.trail.forEach(function(tr){ c.globalAlpha=tr.t*1.5; if(g.sp.img&&g.sp.img.complete&&g.sp.img.naturalWidth) c.drawImage(g.sp.img,tr.x-34,tr.y-40,68,68); c.globalAlpha=1; });
  // y-sorted props + entities
  var list=[], pad=120;
  g.map.props.forEach(function(o){ if(o.x>cx-pad&&o.x<cx+vw+pad&&o.y>cy-pad&&o.y<cy+vh+pad+60) list.push({y:o.y,f:function(){ drawProp(c,o,t); }}); });
  g.enemies.forEach(function(e){ if(e.x>cx-60&&e.x<cx+vw+60&&e.y>cy-60&&e.y<cy+vh+60) list.push({y:e.y,f:function(){ drawEnemy(g,c,e); }}); });
  list.push({y:p.y,f:function(){ drawPlayer(g,c); }});
  list.sort(function(a,b){ return a.y-b.y; }); list.forEach(function(it){ it.f(); });
  // power-up visuals
  drawPU(g,c);
  g.pp.forEach(function(b){ drawPP(g,c,b); });
  g.shots.forEach(function(s){ c.shadowColor='#ff4a8a'; c.shadowBlur=14; c.fillStyle='#ff7aa8'; c.beginPath(); c.arc(s.x,s.y,s.r,0,TAU); c.fill(); c.fillStyle='#fff'; c.beginPath(); c.arc(s.x,s.y,s.r*.4,0,TAU); c.fill(); c.shadowBlur=0; });
  // swing: energy pulse in the Indexling's colors (no weapon)
  if(p.swing>0){ var kk2=1-p.swing/.22, reach=g.m.reach, half=g.m.arc/2, a0=p.swingAng-half+(kk2*g.m.arc*.35), col=g.sp.col||'#b07cff';
    var sg=c.createRadialGradient(p.x,p.y,reach*.25,p.x,p.y,reach); sg.addColorStop(0,'rgba(255,255,255,0)'); sg.addColorStop(.75,hexA(col,.55*(1-kk2))); sg.addColorStop(1,'rgba(255,255,255,'+(.9*(1-kk2))+')');
    c.fillStyle=sg; c.beginPath(); c.moveTo(p.x,p.y); c.arc(p.x,p.y,reach,a0,a0+g.m.arc*(.65+kk2*.35)); c.closePath(); c.fill(); c.strokeStyle='rgba(255,255,255,'+(.8*(1-kk2))+')'; c.lineWidth=3; c.beginPath(); c.arc(p.x,p.y,reach*.96,a0+g.m.arc*(.3+kk2*.3),a0+g.m.arc*(.65+kk2*.35)); c.stroke(); }
  g.rings.forEach(function(r){ c.strokeStyle=r.c; c.globalAlpha=1-r.t/.45; c.lineWidth=8*(1-r.t/.45)+2; c.beginPath(); c.arc(r.x,r.y,r.r,0,TAU); c.stroke(); c.globalAlpha=1; });
  g.fx.forEach(function(f){ var a=f.t/f.max; c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=a; c.lineCap='round';
    if(f.k==='beam'){ c.strokeStyle=f.c; c.shadowColor=f.c; c.shadowBlur=22; c.lineWidth=f.w*a+4; c.beginPath(); c.moveTo(f.x1,f.y1); c.lineTo(f.x2,f.y2); c.stroke(); c.strokeStyle='#fff'; c.lineWidth=Math.max(2,f.w*.4*a); c.stroke(); }
    else { c.strokeStyle=f.c; c.shadowColor=f.c; c.shadowBlur=18; c.lineWidth=4; c.beginPath(); f.pts.forEach(function(pt,i){ if(i) c.lineTo(pt[0],pt[1]); else c.moveTo(pt[0],pt[1]); }); c.stroke(); c.strokeStyle='#fff'; c.lineWidth=1.6; c.stroke(); } c.restore(); });
  g.parts.forEach(function(q){ c.globalAlpha=clamp(q.life/q.max,0,1); c.fillStyle=q.c; c.beginPath(); c.arc(q.x,q.y,q.s,0,TAU); c.fill(); }); c.globalAlpha=1;
  g.texts.forEach(function(tx){ c.globalAlpha=clamp(tx.t/tx.max*1.6,0,1); c.font=(tx.big?'900 22px':'800 15px')+' Inter,sans-serif'; c.textAlign='center'; c.lineWidth=4; c.strokeStyle='rgba(0,0,0,.7)'; c.strokeText(tx.s,tx.x,tx.y); c.fillStyle=tx.c; c.fillText(tx.s,tx.x,tx.y); }); c.globalAlpha=1;
  c.restore();
  // screen effects
  if(p.hp<=2&&g.phase==='play'){ var vg=c.createRadialGradient(vw/2,vh/2,vh*.3,vw/2,vh/2,vh*.9); vg.addColorStop(0,'rgba(255,0,40,0)'); vg.addColorStop(1,'rgba(255,0,40,'+(.28+Math.sin(g.time*6)*.08)+')'); c.fillStyle=vg; c.fillRect(0,0,vw,vh); }
  if(p.hurtFlash>0){ c.fillStyle='rgba(255,40,60,'+p.hurtFlash*.5+')'; c.fillRect(0,0,vw,vh); }
  if(g.flash>0){ c.fillStyle='rgba(200,160,255,'+g.flash*2+')'; c.fillRect(0,0,vw,vh); }
  if(g.timeScale<1){ c.fillStyle='rgba(120,160,255,.10)'; c.fillRect(0,0,vw,vh); }
  hud(g,c);
}
function hexA(h,a){ var n=parseInt((h||'#b07cff').replace('#','').slice(0,6),16); if(isNaN(n)) n=0xb07cff; return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')'; }
function drawEnemy(g,c,e){
  var d=EN[e.t]; if(e.warp>0&&Math.floor(e.warp*20)%2) return;
  c.fillStyle='rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(e.x,e.y+e.r*.8,e.r*.9,e.r*.38,0,0,TAU); c.fill();
  c.save(); c.translate(e.x,e.y); c.font=(e.r*2.1)+'px sans-serif'; c.textAlign='center'; c.textBaseline='middle';
  if(e.flash>0){ c.shadowColor='#fff'; c.shadowBlur=24; } else if(e.t==='bomber'&&e.state===1){ c.shadowColor=Math.floor(g.time*14)%2?'#ff4a4a':'#fff'; c.shadowBlur=22; } else if(d.boss){ c.shadowColor=d.col; c.shadowBlur=22+Math.sin(g.time*4)*6; }
  if(e.freeze>0){ c.shadowColor='#9fe8ff'; c.shadowBlur=26; } else if(e.burn>0){ c.shadowColor='#ff8a3a'; c.shadowBlur=18; } else if(e.slow>0){ c.shadowColor='#7cc8ff'; c.shadowBlur=12; }
  if(e.face<0) c.scale(-1,1); if(e.state===1&&e.t==='brute') c.scale(1+Math.sin(g.time*30)*.05,1+Math.sin(g.time*30)*.05);
  if(e.flash>0) c.globalAlpha=.7; c.fillText(d.e,0,2); c.restore();
  if(e.freeze>0){ c.fillStyle='rgba(180,235,255,.45)'; c.beginPath(); c.arc(e.x,e.y,e.r*1.1,0,TAU); c.fill(); }
  if(e.stun>0){ c.font='16px sans-serif'; c.textAlign='center'; c.fillText('💫',e.x,e.y-e.r-8); }
  if(e.hp<e.maxhp&&!d.boss){ c.fillStyle='rgba(0,0,0,.6)'; c.fillRect(e.x-e.r,e.y-e.r-12,e.r*2,5); c.fillStyle=d.col; c.fillRect(e.x-e.r,e.y-e.r-12,e.r*2*clamp(e.hp/e.maxhp,0,1),5); }
}
function drawPlayer(g,c){
  var p=g.p; c.fillStyle='rgba(0,0,0,.38)'; c.beginPath(); c.ellipse(p.x,p.y+22,22,8,0,0,TAU); c.fill();
  var col=g.sp.col||'#b07cff'; c.save(); c.globalCompositeOperation='lighter'; var ag=c.createRadialGradient(p.x,p.y,6,p.x,p.y,50); ag.addColorStop(0,hexA(col,.28)); ag.addColorStop(1,hexA(col,0)); c.fillStyle=ag; c.beginPath(); c.arc(p.x,p.y,50,0,TAU); c.fill(); c.restore();
  if(p.rage>0){ c.shadowColor='#ffb02a'; c.shadowBlur=26; }
  c.save(); c.translate(p.x,p.y); var moving=Math.hypot(p.vx,p.vy)>30; var sq=moving?1+Math.sin(g.time*16)*.05:1+Math.sin(g.time*3)*.02; c.scale(p.face<0?-sq:sq,2-sq);
  if(p.inv>0&&Math.floor(g.time*24)%2&&p.dash<=0) c.globalAlpha=.4; if(p.hurtFlash>0) c.filter='brightness(2) saturate(.2)';
  if(g.sp.img&&g.sp.img.complete&&g.sp.img.naturalWidth) c.drawImage(g.sp.img,-36,-46,72,72); else { c.fillStyle=col; c.beginPath(); c.arc(0,-10,22,0,TAU); c.fill(); }
  c.restore(); c.shadowBlur=0; c.globalAlpha=1; c.filter='none';
  if(p.shieldCh>0){ c.strokeStyle='rgba(124,240,160,.85)'; c.lineWidth=3; c.fillStyle='rgba(124,240,160,.16)'; c.beginPath(); c.arc(p.x,p.y-8,38+Math.sin(g.time*6)*2,0,TAU); c.fill(); c.stroke(); if(p.shieldCh>1){ c.beginPath(); c.arc(p.x,p.y-8,45,0,TAU); c.stroke(); } }
}
function drawPU(g,c){
  var u=g.pu; c.save();
  if(u.orbs.lv&&u.orbs.list) u.orbs.list.forEach(function(o){ var og=c.createRadialGradient(o.x,o.y,2,o.x,o.y,20); og.addColorStop(0,'#fff'); og.addColorStop(.4,'#6a8cff'); og.addColorStop(1,'rgba(106,140,255,0)'); c.globalCompositeOperation='lighter'; c.fillStyle=og; c.beginPath(); c.arc(o.x,o.y,22,0,TAU); c.fill(); });
  if(u.spirit.lv&&u.spirit.list) u.spirit.list.forEach(function(s,i){ c.globalAlpha=.9; c.font='26px sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.shadowColor='#d6c8ff'; c.shadowBlur=16; c.fillText('👻',s.x,s.y+Math.sin(g.time*4+i)*4); });
  c.restore();
}
function drawPP(g,c,b){
  c.save(); c.translate(b.x,b.y);
  if(b.k==='fire'){ var fg=c.createRadialGradient(0,0,2,0,0,b.r*2); fg.addColorStop(0,'#fff'); fg.addColorStop(.35,'#ffb04a'); fg.addColorStop(1,'rgba(255,90,20,0)'); c.globalCompositeOperation='lighter'; c.fillStyle=fg; c.beginPath(); c.arc(0,0,b.r*2.2,0,TAU); c.fill(); }
  else if(b.k==='missile'){ c.rotate(Math.atan2(b.vy,b.vx)); c.fillStyle='#ddd'; c.fillRect(-9,-4,18,8); c.fillStyle='#ff4a4a'; c.beginPath(); c.moveTo(9,-4); c.lineTo(16,0); c.lineTo(9,4); c.fill(); c.fillStyle='#ffb04a'; c.beginPath(); c.moveTo(-9,-3); c.lineTo(-16-Math.random()*5,0); c.lineTo(-9,3); c.fill(); }
  else if(b.k==='chakram'){ c.rotate(b.rot||0); c.shadowColor='#ffd24a'; c.shadowBlur=14; c.strokeStyle='#ffd24a'; c.lineWidth=b.r*.4; c.beginPath(); c.arc(0,0,b.r*.8,0,TAU); c.stroke(); c.strokeStyle='#fff7c0'; c.lineWidth=2; c.beginPath(); c.arc(0,0,b.r*.8,0,TAU); c.stroke(); for(var i=0;i<4;i++){ c.rotate(Math.PI/2); c.fillStyle='#ffd24a'; c.beginPath(); c.moveTo(b.r*.6,0); c.lineTo(b.r*1.2,-4); c.lineTo(b.r*1.2,4); c.fill(); } }
  else if(b.k==='bolt'){ c.globalCompositeOperation='lighter'; c.fillStyle=b.c; c.shadowColor=b.c; c.shadowBlur=12; c.beginPath(); c.arc(0,0,b.r,0,TAU); c.fill(); }
  else if(b.k==='wave'){ c.rotate(b.ang); c.globalCompositeOperation='lighter'; var wg=c.createLinearGradient(-20,0,40,0); wg.addColorStop(0,'rgba(90,215,255,0)'); wg.addColorStop(1,'rgba(200,245,255,.95)'); c.fillStyle=wg; c.shadowColor='#5ad7ff'; c.shadowBlur=26; c.beginPath(); c.moveTo(-10,-b.r); c.quadraticCurveTo(46,-b.r*.55,52,0); c.quadraticCurveTo(46,b.r*.55,-10,b.r); c.quadraticCurveTo(14,0,-10,-b.r); c.fill(); }
  c.restore();
}
function hud(g,c){
  var p=g.p, vw=g.vw, vh=g.vh, sc=g.vw<700?.8:1; c.textBaseline='middle';
  for(var i=0;i<p.maxhp;i++){ c.font=(22*sc)+'px sans-serif'; c.textAlign='left'; c.globalAlpha=i<p.hp?1:.25; c.fillText(i<p.hp?'❤️':'🖤',14+i*26*sc,26); } c.globalAlpha=1;
  c.textAlign='right'; c.font='900 '+(24*sc)+'px Inter,sans-serif'; c.lineWidth=4; c.strokeStyle='rgba(0,0,0,.7)'; c.strokeText(String(g.score),vw-92,26); c.fillStyle='#fff'; c.fillText(String(g.score),vw-92,26);
  if(g.combo>1){ var m=mult(g); c.font='900 '+((20+Math.min(12,g.combo/3))*sc)+'px Inter,sans-serif'; c.fillStyle=m>=3?'#ff6a3a':m>=2?'#ffd24a':'#fff'; c.strokeText(g.combo+' HITS  ×'+m.toFixed(1),vw-92,56); c.fillText(g.combo+' HITS  ×'+m.toFixed(1),vw-92,56); c.fillStyle='rgba(255,255,255,.2)'; c.fillRect(vw-212,70,120,5); c.fillStyle='#ffd24a'; c.fillRect(vw-212,70,120*clamp(g.comboTimer/g.m.comboT,0,1),5); }
  c.textAlign='center'; c.font='800 '+(15*sc)+'px Inter,sans-serif'; c.fillStyle='#e6e0ff'; c.lineWidth=3; c.strokeStyle='rgba(0,0,0,.6)'; var wt='WAVE '+Math.max(1,g.wave)+' / 10  ·  '+(g.queue.length+g.enemies.length)+' left'; c.strokeText(wt,vw/2,22); c.fillText(wt,vw/2,22);
  if(g.boss&&!g.boss.dead){ var b=g.boss, w=Math.min(420,vw*.5); c.fillStyle='rgba(0,0,0,.65)'; c.fillRect(vw/2-w/2,38,w,14); c.fillStyle=EN[b.t].col; c.fillRect(vw/2-w/2,38,w*clamp(b.hp/b.maxhp,0,1),14); c.strokeStyle='#fff'; c.lineWidth=2; c.strokeRect(vw/2-w/2,38,w,14); c.font='900 13px Inter,sans-serif'; c.fillStyle='#fff'; c.fillText(EN[b.t].name,vw/2,66);
    var ang=Math.atan2(b.y-(g.cam.y+vh/2),b.x-(g.cam.x+vw/2)); if(b.x<g.cam.x||b.x>g.cam.x+vw||b.y<g.cam.y||b.y>g.cam.y+vh){ var ax=vw/2+Math.cos(ang)*(vw/2-40), ay=vh/2+Math.sin(ang)*(vh/2-40); ax=clamp(ax,30,vw-30); ay=clamp(ay,30,vh-30); c.save(); c.translate(ax,ay); c.rotate(ang); c.fillStyle=EN[b.t].col; c.beginPath(); c.moveTo(14,0); c.lineTo(-8,-10); c.lineTo(-8,10); c.fill(); c.restore(); } }
  // special + dash
  var bw=Math.min(240,vw*.3), bx=vw/2-bw/2, by=vh-28; c.fillStyle='rgba(0,0,0,.6)'; c.fillRect(bx,by,bw,12); var full=p.sp>=100; c.fillStyle=full?(Math.floor(g.time*6)%2?'#e0b0ff':'#b07cff'):'#7a5cd0'; c.fillRect(bx,by,bw*p.sp/100,12); c.strokeStyle='#cfc6ff'; c.lineWidth=2; c.strokeRect(bx,by,bw,12);
  c.font='800 11px Inter,sans-serif'; c.fillStyle='#fff'; c.fillText(full?'🔮 SPECIAL READY — press E':'🔮 SPECIAL '+Math.floor(p.sp)+'%',vw/2,by-9);
  for(var d=0;d<g.m.dashMax;d++){ c.fillStyle=d<p.dashCharges?'#7ce8ff':'rgba(124,232,255,.18)'; c.beginPath(); c.arc(bx-24-d*20,by+6,7,0,TAU); c.fill(); }
  if(p.rage>0){ c.textAlign='left'; c.font='800 13px Inter,sans-serif'; c.fillStyle='#ffb02a'; c.fillText('🔥 RAGE '+p.rage.toFixed(1)+'s',14,52); }
  // minimap
  var mw=vw<700?120:180, mh=Math.round(mw*WH/WW), mx=14, my=vh-mh-14-(('ontouchstart' in window)?110:0);
  if(!('ontouchstart' in window)||vh>480){ c.globalAlpha=.88; c.drawImage(g.map.mm,mx,my,mw,mh); c.globalAlpha=1; c.strokeStyle='#8f86c4'; c.lineWidth=2; c.strokeRect(mx,my,mw,mh); var fx=mw/WW, fy=mh/WH;
    c.strokeStyle='rgba(255,255,255,.55)'; c.lineWidth=1; c.strokeRect(mx+g.cam.x*fx,my+g.cam.y*fy,g.vw*fx,g.vh*fy);
    g.enemies.forEach(function(e){ c.fillStyle=EN[e.t].boss?'#ffd24a':'#ff5a5a'; c.beginPath(); c.arc(mx+e.x*fx,my+e.y*fy,EN[e.t].boss?4:2,0,TAU); c.fill(); }); g.drops.forEach(function(dr){ c.fillStyle='#7cf0a0'; c.fillRect(mx+dr.x*fx-1,my+dr.y*fy-1,3,3); });
    c.fillStyle='#fff'; c.beginPath(); c.arc(mx+p.x*fx,my+p.y*fy,3.5,0,TAU); c.fill(); c.strokeStyle=g.sp.col||'#b07cff'; c.lineWidth=2; c.stroke(); }
  // power-up bar
  var act=PU_KEYS.filter(function(k){ return g.pu[k].lv>0; }), ry=96; c.textAlign='right';
  act.forEach(function(k,i){ var y=ry+i*(26*sc); c.fillStyle='rgba(10,8,24,.62)'; c.fillRect(vw-98,y-11,86,22); c.strokeStyle=PU[k].col; c.lineWidth=1.5; c.strokeRect(vw-98,y-11,86,22); c.font=(15*sc)+'px sans-serif'; c.textAlign='left'; c.fillStyle='#fff'; c.fillText(PU[k].icon,vw-94,y+1); for(var l=0;l<4;l++){ c.fillStyle=l<g.pu[k].lv?PU[k].col:'rgba(255,255,255,.18)'; c.fillRect(vw-70+l*14,y-4,11,8); } });
  if(g.bannerT>0){ var al=clamp(Math.min(g.bannerT,2.4-g.bannerT)*3,0,1); c.globalAlpha=al; c.textAlign='center'; c.font='900 '+(46*sc)+'px Inter,sans-serif'; c.lineWidth=7; c.strokeStyle='rgba(0,0,0,.75)'; var yy=vh/2-90+(1-al)*-14; c.strokeText(g.banner,vw/2,yy); c.fillStyle=g.banner.indexOf('BOSS')>=0?'#ff6a6a':'#fff'; c.fillText(g.banner,vw/2,yy); c.globalAlpha=1; }
}
})();
