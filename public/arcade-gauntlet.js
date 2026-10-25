/* Character Gauntlet v2 — canvas hack-and-slash that replaces the original bare-bones mode.
   Uses the player's equipped Indexling + stats (arcadeCharacterStats), saves best run into gameProgress.gauntlet. */
(function(){
'use strict';
var AW=960, AH=560, TAU=Math.PI*2;
var rnd=function(a,b){ return a+Math.random()*(b-a); }, clamp=function(n,a,b){ return Math.max(a,Math.min(b,n)); };
var dist=function(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); };
function $(id){ return document.getElementById(id); }

/* ---------- perks ---------- */
var PERKS=[
  {id:'blade',icon:'🗡️',name:'Sharpened Blade',desc:'+25% strike damage',fn:function(m){ m.dmg*=1.25; }},
  {id:'arc',icon:'🌀',name:'Wide Arc',desc:'Bigger, wider slash',fn:function(m){ m.reach*=1.22; m.arc*=1.25; }},
  {id:'quick',icon:'⚡',name:'Quickstrike',desc:'Attack 22% faster',fn:function(m){ m.cd*=.78; }},
  {id:'dash2',icon:'💨',name:'Second Wind',desc:'+1 dash charge, faster recharge',fn:function(m){ m.dashMax++; m.dashRe*=.85; }},
  {id:'phase',icon:'👻',name:'Phase Dash',desc:'Dashing damages enemies you pass through',fn:function(m){ m.phase=true; }},
  {id:'vamp',icon:'🩸',name:'Vampiric',desc:'15% chance to heal on kill',fn:function(m){ m.vamp+=.15; }},
  {id:'magnet',icon:'🧲',name:'Magnet',desc:'Pickups fly to you from far away',fn:function(m){ m.magnet*=2.2; }},
  {id:'focus',icon:'🔮',name:'Attunement',desc:'Special charges 45% faster',fn:function(m){ m.charge*=1.45; }},
  {id:'heart',icon:'❤️',name:'Heartier',desc:'+2 max HP and heal 2',fn:function(m,g){ g.p.maxhp+=2; g.p.hp=Math.min(g.p.maxhp,g.p.hp+2); }},
  {id:'lucky',icon:'🍀',name:'Lucky Charm',desc:'+12% crit chance, better drops',fn:function(m){ m.crit+=.12; m.drop+=.05; }},
  {id:'combo',icon:'🔥',name:'Combo King',desc:'Combo lasts longer, higher multiplier cap',fn:function(m){ m.comboT+=1.1; m.mcap+=1; }},
  {id:'fleet',icon:'👟',name:'Fleet Foot',desc:'+14% move speed',fn:function(m){ m.speed*=1.14; }}
];

/* ---------- enemy defs ---------- */
var EN={
  grunt:{e:'👹',hp:7,sp:78,r:15,col:'#ff6a6a',pts:10},
  runner:{e:'🦇',hp:3.5,sp:150,r:12,col:'#ffd24a',pts:12},
  spitter:{e:'🧙',hp:6,sp:60,r:14,col:'#b07cff',pts:16},
  brute:{e:'🦍',hp:28,sp:52,r:24,col:'#ff9a3c',pts:30},
  bomber:{e:'💣',hp:4,sp:105,r:13,col:'#7cf0a0',pts:18},
  king:{e:'👑',hp:190,sp:70,r:34,col:'#ffd24a',pts:300,boss:true,name:'The Hollow King'},
  titan:{e:'👁️',hp:380,sp:55,r:42,col:'#c07cff',pts:600,boss:true,name:'Void Titan'}
};
function waveDef(n){
  var q=[]; function add(t,c){ for(var i=0;i<c;i++) q.push(t); }
  add('grunt',3+n*2);
  if(n>=2) add('runner',1+n);
  if(n>=3) add('spitter',Math.floor(n/1.7));
  if(n>=3) add('bomber',Math.floor(n/2));
  if(n>=4) add('brute',Math.floor((n-2)/2));
  if(n===5) q.push('king'); if(n===10){ q.push('titan'); }
  for(var i=q.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=q[i]; q[i]=q[j]; q[j]=t; }
  var bi=q.findIndex(function(x){return EN[x].boss;}); if(bi>0){ var b=q.splice(bi,1)[0]; q.unshift(b); }
  return q;
}

/* ---------- sprite of the equipped Indexling ---------- */
var spriteCache={key:'',img:null};
function playerSprite(){
  var key='';
  try{ key=(state.progress.equipped&&state.progress.equipped.indexling)+'|'+(typeof getEquippedSkinId==='function'?getEquippedSkinId(state.progress.equipped.indexling):''); }catch(e){}
  if(spriteCache.key===key&&spriteCache.img) return spriteCache.img;
  var img=new Image(); spriteCache={key:key,img:img};
  try{
    var html=arcadeCharacterHtml(); var m=html.match(/<svg[\s\S]*<\/svg>/);
    if(m){ var svg=m[0].replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" '); img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); }
  }catch(e){}
  return img;
}

/* ---------- sound ---------- */
var AC=null;
function muted(){ try{ return localStorage.getItem('gx-mute')==='1'; }catch(e){ return false; } }
function sfx(kind){
  if(muted()) return;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume();
    var o=AC.createOscillator(), g=AC.createGain(), t=AC.currentTime;
    var P={swing:[300,120,.07,'triangle',.08],hit:[180,70,.09,'square',.1],crit:[520,160,.14,'sawtooth',.12],hurt:[140,50,.22,'sawtooth',.18],dash:[240,520,.1,'sine',.08],nova:[90,420,.35,'sawtooth',.2],pick:[520,880,.12,'sine',.1],kill:[260,90,.12,'square',.1],boom:[100,35,.3,'sawtooth',.25],wave:[330,660,.3,'triangle',.14],shoot:[420,200,.08,'square',.05]}[kind];
    if(!P) return; o.type=P[3]; o.frequency.setValueAtTime(P[0],t); o.frequency.exponentialRampToValueAtTime(Math.max(20,P[1]),t+P[2]);
    g.gain.setValueAtTime(P[4],t); g.gain.exponentialRampToValueAtTime(.001,t+P[2]+.02); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+P[2]+.03);
  }catch(e){}
}

/* ---------- game setup ---------- */
function newGame(stats){
  var m={dmg:2+stats.power*1.3,reach:78,arc:2.1,cd:.34,speed:150+stats.speed*42,dashMax:1,dashRe:1.35,phase:false,vamp:0,magnet:1,charge:1+(stats.focus-150)/150,crit:.05+stats.luck*.03,drop:.06+stats.luck*.015,comboT:2.2,mcap:3};
  var hp=stats.vitality+3;
  var g={s:stats,m:m,phase:'ready',wave:0,score:0,kills:0,combo:0,comboTimer:0,maxCombo:0,time:0,
    p:{x:AW/2,y:AH/2+60,vx:0,vy:0,r:15,hp:hp,maxhp:hp,face:1,aim:0,atkCd:0,swing:0,swingAng:0,dash:0,dashDx:1,dashDy:0,dashCharges:1,dashTimer:0,inv:0,sp:0,rage:0,hurtFlash:0,trail:[]},
    enemies:[],shots:[],parts:[],drops:[],texts:[],tele:[],rings:[],queue:[],spawnT:0,pillars:[{x:260,y:180,r:30},{x:700,y:180,r:30},{x:260,y:400,r:30},{x:700,y:400,r:30}],
    shake:0,hitstop:0,perks:[],choices:[],noHit:true,banner:null,bannerT:0,keys:{},mouse:{x:AW/2,y:AH/2,on:false,use:false},joy:{x:0,y:0},btn:{atk:false},boss:null,flash:0,last:0,bossDeath:0};
  return g;
}
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
  return arcadeFrame('Character Gauntlet','Mouse aims · click / Space strikes · Shift dashes · E unleashes your special · WASD moves',stats,
    '<div class="gx-wrap" id="gx-wrap"><canvas id="gx-canvas" width="'+AW+'" height="'+AH+'"></canvas><div class="gx-ov" id="gx-ov"></div>'+
    '<button class="gx-mute" id="gx-mute" type="button" aria-label="Toggle sound">'+(muted()?'🔇':'🔊')+'</button>'+
    '<div class="gx-touch"><div class="gx-joy" id="gx-joy"><div class="gx-knob"></div></div><div class="gx-btns"><button data-gx="special" type="button">🔮</button><button data-gx="dash" type="button">💨</button><button data-gx="atk" type="button" class="big">⚔️</button></div></div></div>');
};

/* ---------- mounting + input ---------- */
var loopId=0;
function mount(){
  var g=state.games&&state.games.gx, cv=$('gx-canvas'); if(!g||!cv||state.games.active!=='gauntlet') return;
  g.cv=cv; g.ctx=cv.getContext('2d'); g.ov=$('gx-ov'); g.sprite=playerSprite();
  wire(g); overlay(g); cancelAnimationFrame(loopId); g.last=performance.now();
  (function frame(t){
    var cur=state.games&&state.games.gx; if(cur!==g||!document.body.contains(cv)||state.games.active!=='gauntlet') return;
    var dt=Math.min(.05,(t-g.last)/1000); g.last=t; try{ update(g,dt); draw(g); }catch(e){ console.error(e); }
    loopId=requestAnimationFrame(frame);
  })(g.last);
}
function wire(g){
  var wrap=$('gx-wrap'); if(!wrap||wrap.__gx===g) return; wrap.__gx=g;
  var cv=g.cv;
  function pos(e){ var r=cv.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*AW,y:(e.clientY-r.top)/r.height*AH}; }
  cv.addEventListener('mousemove',function(e){ var p=pos(e); g.mouse.x=p.x; g.mouse.y=p.y; g.mouse.use=true; });
  cv.addEventListener('mousedown',function(e){ if(e.button===2){ e.preventDefault(); dash(g); return; } g.mouse.on=true; if(g.phase==='ready') begin(g); });
  window.addEventListener('mouseup',function(){ g.mouse.on=false; });
  cv.addEventListener('contextmenu',function(e){ e.preventDefault(); });
  wrap.addEventListener('click',function(e){
    var pk=e.target.closest&&e.target.closest('[data-gx-perk]'); if(pk){ pickPerk(g,pk.getAttribute('data-gx-perk')); return; }
    var st=e.target.closest&&e.target.closest('[data-gx-start]'); if(st){ begin(g); return; }
    var rs=e.target.closest&&e.target.closest('[data-gx-resume]'); if(rs){ togglePause(g); return; }
    if(e.target.closest&&e.target.closest('#gx-mute')){ try{ localStorage.setItem('gx-mute',muted()?'0':'1'); }catch(er){} $('gx-mute').textContent=muted()?'🔇':'🔊'; }
  });
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
function keyDown(e){
  var gm=state.games; if(state.view!=='games'||!gm||gm.active!=='gauntlet'||!gm.gx) return; var g=gm.gx, k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k)>=0) e.preventDefault();
  if(g.phase==='upgrade'){ var i='123'.indexOf(k); if(i>=0&&g.choices[i]) pickPerk(g,g.choices[i].id); return; }
  if(k==='p'||k==='escape'){ togglePause(g); return; }
  if(g.phase==='ready'&&(k===' '||k==='enter')){ begin(g); return; }
  g.keys[k]=true;
  if(k==='shift'||k==='x') dash(g); else if(k==='e'||k==='q') special(g);
}
function keyUp(e){ var gm=state.games; if(!gm||!gm.gx) return; gm.gx.keys[e.key.toLowerCase()]=false; }
document.addEventListener('keydown',keyDown); document.addEventListener('keyup',keyUp);
window.addEventListener('blur',function(){ var g=state.games&&state.games.gx; if(g&&g.phase==='play') togglePause(g); });

function begin(g){ if(g.phase!=='ready') return; g.phase='play'; overlay(g); nextWave(g); }
function togglePause(g){ if(g.phase==='play'){ g.phase='pause'; overlay(g); } else if(g.phase==='pause'){ g.phase='play'; g.last=performance.now(); overlay(g); } }

/* ---------- overlays (DOM) ---------- */
function overlay(g){
  var ov=g.ov; if(!ov) return; var h='';
  if(g.phase==='ready'){
    h='<div class="gx-card"><h2>⚔️ Character Gauntlet</h2><p>Survive <b>10 waves</b> and two bosses. Pick an upgrade after every wave.</p><ul class="gx-keys"><li><kbd>WASD</kbd> move</li><li><kbd>Click</kbd> / <kbd>Space</kbd> strike — aim with the mouse</li><li><kbd>Shift</kbd> / right-click dash (invincible)</li><li><kbd>E</kbd> special — charges as you hit</li><li><kbd>P</kbd> pause</li></ul><p class="gx-stats">Power '+g.s.power+' · Speed '+g.s.speed.toFixed(1)+' · Vitality '+g.s.vitality+' · Luck '+g.s.luck+' · Focus '+g.s.focus+'</p><button class="btn btn-primary btn-lg" data-gx-start>Start run</button></div>';
  } else if(g.phase==='pause'){
    h='<div class="gx-card"><h2>⏸ Paused</h2><button class="btn btn-primary btn-lg" data-gx-resume>Resume</button></div>';
  } else if(g.phase==='upgrade'){
    h='<div class="gx-card wide"><h2>Wave '+g.wave+' cleared!</h2><p>Choose an upgrade <span class="gx-fine">(press 1 / 2 / 3)</span></p><div class="gx-perks">'+g.choices.map(function(c,i){ return '<button class="gx-perk" data-gx-perk="'+c.id+'" type="button"><kbd>'+(i+1)+'</kbd><span class="gx-pi">'+c.icon+'</span><b>'+c.name+'</b><span>'+c.desc+'</span></button>'; }).join('')+'</div></div>';
  } else if(g.phase==='over'||g.phase==='win'){
    var gp=arcadeGameProgress().gauntlet||{};
    h='<div class="gx-card wide"><h2>'+(g.phase==='win'?'🏆 Gauntlet conquered!':'💀 Run over')+'</h2><div class="gx-res"><div><b>'+g.score+'</b><span>Score</span></div><div><b>'+g.wave+'/10</b><span>Wave</span></div><div><b>'+g.kills+'</b><span>Kills</span></div><div><b>×'+g.maxCombo+'</b><span>Best combo</span></div></div>'+(g.newBest?'<p class="gx-newbest">⭐ New personal best!</p>':'<p class="gx-fine">Personal best: '+(gp.best||0)+'</p>')+(g.perks.length?'<p class="gx-fine">Upgrades: '+g.perks.map(function(p){return p.icon;}).join(' ')+'</p>':'')+'<div class="gx-endbtns"><button class="btn btn-primary btn-lg" data-action="arcade-gauntlet-replay">Play again</button><button class="btn btn-ghost" data-action="arcade-hub">← All games</button></div></div>';
  }
  ov.innerHTML=h; ov.style.display=h?'flex':'none';
}

/* ---------- waves ---------- */
function nextWave(g){
  g.wave++; g.queue=waveDef(g.wave); g.spawnT=1.1; g.noHit=true;
  g.banner=g.wave===5?'⚠ BOSS: The Hollow King':g.wave===10?'⚠ FINAL BOSS: Void Titan':'Wave '+g.wave; g.bannerT=2.2; sfx('wave');
}
function spawn(g,type){
  var d=EN[type], side=Math.floor(Math.random()*4), x,y;
  if(side===0){ x=rnd(60,AW-60); y=40; } else if(side===1){ x=rnd(60,AW-60); y=AH-40; } else if(side===2){ x=40; y=rnd(60,AH-60); } else { x=AW-40; y=rnd(60,AH-60); }
  if(d.boss){ x=AW/2; y=90; }
  var sc=1+g.wave*.07;
  var e={t:type,x:x,y:y,vx:0,vy:0,r:d.r,hp:d.hp*sc*(d.boss?1:1),maxhp:d.hp*sc,sp:d.sp*(1+g.wave*.015),cd:rnd(.8,2),flash:0,warp:.8,state:0,st:0,fuse:0,face:1,phase2:false};
  g.enemies.push(e); if(d.boss){ g.boss=e; g.shake=.5; }
  for(var i=0;i<10;i++) g.parts.push({x:x,y:y,vx:Math.cos(i/10*TAU)*60,vy:Math.sin(i/10*TAU)*60,life:.5,max:.5,c:d.col,s:3});
}

/* ---------- actions ---------- */
function aimAngle(g){
  var p=g.p;
  if(g.mouse.use&&!('ontouchstart' in window&&!g.mouse.on)) return Math.atan2(g.mouse.y-p.y,g.mouse.x-p.x);
  var best=null,bd=170; g.enemies.forEach(function(e){ var d=dist(e,p); if(d<bd){ bd=d; best=e; } });
  if(best) return Math.atan2(best.y-p.y,best.x-p.x);
  return Math.abs(p.vx)+Math.abs(p.vy)>10?Math.atan2(p.vy,p.vx):p.aim;
}
function strike(g){
  var p=g.p, m=g.m; if(p.atkCd>0||p.dash>0) return;
  p.atkCd=m.cd/(p.rage>0?1.35:1); p.aim=aimAngle(g); p.swing=.2; p.swingAng=p.aim; p.face=Math.cos(p.aim)<0?-1:1; sfx('swing');
  var reach=m.reach, half=m.arc/2, hits=0;
  g.enemies.forEach(function(e){
    var dx=e.x-p.x, dy=e.y-p.y, d=Math.hypot(dx,dy); if(d>reach+e.r) return;
    var a=Math.atan2(dy,dx), da=Math.abs(((a-p.aim+Math.PI*3)%TAU)-Math.PI); if(da>half&&d>e.r+26) return;
    var crit=Math.random()<m.crit, dmg=m.dmg*(p.rage>0?1.5:1)*(crit?2:1)*rnd(.9,1.1); hurtEnemy(g,e,dmg,crit,Math.cos(a),Math.sin(a),e.t==='brute'||EN[e.t].boss?60:230); hits++;
  });
  g.shots=g.shots.filter(function(s){ if(!s.enemy) return true; var d=Math.hypot(s.x-p.x,s.y-p.y); if(d<reach){ boom(g,s.x,s.y,'#fff',5); return false; } return true; });
  if(hits){ g.hitstop=.045; g.shake=Math.max(g.shake,.12); }
}
function hurtEnemy(g,e,dmg,crit,nx,ny,kb){
  e.hp-=dmg; e.flash=.12; e.vx+=nx*kb; e.vy+=ny*kb;
  g.p.sp=Math.min(100,g.p.sp+(crit?12:8)*g.m.charge);
  g.combo++; g.comboTimer=g.m.comboT; g.maxCombo=Math.max(g.maxCombo,mult(g));
  g.texts.push({x:e.x+rnd(-8,8),y:e.y-e.r,t:.7,max:.7,s:(crit?'💥':'')+Math.round(dmg),c:crit?'#ffd24a':'#fff',big:crit});
  boom(g,e.x,e.y,crit?'#ffd24a':'#ffb0b0',crit?9:5); sfx(crit?'crit':'hit');
  if(e.hp<=0&&!e.dead) kill(g,e);
}
function mult(g){ return Math.min(g.m.mcap,1+Math.floor(g.combo/6)*.5); }
function kill(g,e){
  e.dead=true; var d=EN[e.t]; g.kills++; g.score+=Math.round(d.pts*mult(g)); sfx('kill');
  for(var i=0;i<(d.boss?40:12);i++){ var a=rnd(0,TAU),s=rnd(40,d.boss?300:180); g.parts.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.3,.8),max:.8,c:d.col,s:rnd(2,5)}); }
  g.texts.push({x:e.x,y:e.y-e.r-10,t:.9,max:.9,s:'+'+Math.round(d.pts*mult(g)),c:'#7cf0a0',big:false});
  if(Math.random()<g.m.vamp&&g.p.hp<g.p.maxhp){ g.p.hp++; g.texts.push({x:g.p.x,y:g.p.y-30,t:.9,max:.9,s:'❤ +1',c:'#ff6a8a',big:true}); }
  var r=Math.random();
  if(d.boss||r<g.m.drop+.04) g.drops.push({x:e.x,y:e.y,k:'heart',t:12});
  else if(r<g.m.drop+.2) g.drops.push({x:e.x,y:e.y,k:'shard',t:10});
  else if(r<g.m.drop+.23) g.drops.push({x:e.x,y:e.y,k:'rage',t:10});
  if(d.boss){ g.bossDeath=1.2; g.hitstop=.25; g.shake=.8; g.boss=null; g.enemies.forEach(function(o){ if(o!==e&&!o.dead){ o.hp=0; o.dead=true; boom(g,o.x,o.y,'#fff',8); } }); g.shots=[]; }
}
function dash(g){
  var p=g.p; if(g.phase!=='play'||p.dashCharges<1||p.dash>0) return;
  var k=g.keys, dx=(k.d||k.arrowright?1:0)-(k.a||k.arrowleft?1:0)+g.joy.x, dy=(k.s||k.arrowdown?1:0)-(k.w||k.arrowup?1:0)+g.joy.y, l=Math.hypot(dx,dy);
  if(l<.1){ dx=Math.cos(aimAngle(g)); dy=Math.sin(aimAngle(g)); l=1; }
  p.dashDx=dx/l; p.dashDy=dy/l; p.dash=.19; p.inv=Math.max(p.inv,.3); p.dashCharges--; sfx('dash'); p.hitByDash={};
}
function special(g){
  var p=g.p; if(g.phase!=='play'||p.sp<100) return; p.sp=0; p.inv=Math.max(p.inv,.6); sfx('nova');
  g.rings.push({x:p.x,y:p.y,r:10,max:260,t:0,c:'#b07cff'}); g.shake=.45; g.flash=.25;
  var dmg=g.m.dmg*4;
  g.enemies.forEach(function(e){ var d=dist(e,p); if(d<270){ var a=Math.atan2(e.y-p.y,e.x-p.x); hurtEnemy(g,e,dmg*(1-d/540),false,Math.cos(a),Math.sin(a),EN[e.t].boss?100:420); } });
  g.shots=g.shots.filter(function(s){ if(s.enemy&&dist(s,p)<270){ boom(g,s.x,s.y,'#b07cff',4); return false; } return true; });
}
function boom(g,x,y,c,n){ for(var i=0;i<n;i++){ var a=rnd(0,TAU),s=rnd(40,170); g.parts.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.2,.45),max:.45,c:c,s:rnd(1.5,3.5)}); } }
function hurtPlayer(g,dmg,fx,fy){
  var p=g.p; if(p.inv>0||g.phase!=='play') return; p.hp-=dmg; p.inv=1.1; p.hurtFlash=.35; g.shake=.35; g.combo=0; g.noHit=false; sfx('hurt');
  var l=Math.hypot(fx,fy)||1; p.vx+=fx/l*320; p.vy+=fy/l*320; boom(g,p.x,p.y,'#ff4a5a',12);
  if(p.hp<=0){ p.hp=0; end(g,false); }
}
function pickPerk(g,id){
  var pk=PERKS.find(function(x){return x.id===id;}); if(!pk||g.phase!=='upgrade') return; pk.fn(g.m,g); g.perks.push(pk); sfx('pick');
  g.p.dashCharges=Math.min(g.m.dashMax,g.p.dashCharges+1); g.p.hp=Math.min(g.p.maxhp,g.p.hp+1);
  g.phase='play'; overlay(g); nextWave(g);
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

/* ---------- update ---------- */
function update(g,dt){
  if(g.hitstop>0){ g.hitstop-=dt; dt*=.08; }
  var p=g.p; g.time+=dt;
  g.parts.forEach(function(q){ q.x+=q.vx*dt; q.y+=q.vy*dt; q.vx*=.93; q.vy*=.93; q.life-=dt; }); g.parts=g.parts.filter(function(q){ return q.life>0; });
  g.texts.forEach(function(t){ t.t-=dt; t.y-=34*dt; }); g.texts=g.texts.filter(function(t){ return t.t>0; });
  g.rings.forEach(function(r){ r.t+=dt; r.r=10+(r.max-10)*Math.min(1,r.t/.35); }); g.rings=g.rings.filter(function(r){ return r.t<.45; });
  g.shake=Math.max(0,g.shake-dt*1.4); g.flash=Math.max(0,g.flash-dt); if(g.bannerT>0) g.bannerT-=dt; if(g.bossDeath>0) g.bossDeath-=dt;
  if(g.phase!=='play'&&g.phase!=='over'&&g.phase!=='win') return;
  if(g.phase==='over'||g.phase==='win'){ g.enemies.forEach(function(e){ e.vx*=.9; e.vy*=.9; }); return; }
  // timers
  p.atkCd=Math.max(0,p.atkCd-dt); p.swing=Math.max(0,p.swing-dt); p.inv=Math.max(0,p.inv-dt); p.hurtFlash=Math.max(0,p.hurtFlash-dt); p.rage=Math.max(0,p.rage-dt);
  if(p.dashCharges<g.m.dashMax){ p.dashTimer+=dt; if(p.dashTimer>=g.m.dashRe){ p.dashTimer=0; p.dashCharges++; } } else p.dashTimer=0;
  g.comboTimer-=dt; if(g.comboTimer<=0) g.combo=0;
  // movement
  var k=g.keys, ix=(k.d||k.arrowright?1:0)-(k.a||k.arrowleft?1:0)+g.joy.x, iy=(k.s||k.arrowdown?1:0)-(k.w||k.arrowup?1:0)+g.joy.y, il=Math.hypot(ix,iy);
  if(il>1){ ix/=il; iy/=il; }
  if(p.dash>0){ p.dash-=dt; p.vx=p.dashDx*720; p.vy=p.dashDy*720; p.trail.push({x:p.x,y:p.y,t:.25}); }
  else { var ax=ix*g.m.speed, ay=iy*g.m.speed; p.vx+=(ax-p.vx)*Math.min(1,dt*14); p.vy+=(ay-p.vy)*Math.min(1,dt*14); }
  p.x+=p.vx*dt; p.y+=p.vy*dt; p.x=clamp(p.x,p.r+8,AW-p.r-8); p.y=clamp(p.y,p.r+8,AH-p.r-8);
  g.pillars.forEach(function(pl){ var d=Math.hypot(p.x-pl.x,p.y-pl.y),m=pl.r+p.r; if(d<m){ var a=Math.atan2(p.y-pl.y,p.x-pl.x); p.x=pl.x+Math.cos(a)*m; p.y=pl.y+Math.sin(a)*m; } });
  p.trail.forEach(function(t){ t.t-=dt; }); p.trail=p.trail.filter(function(t){ return t.t>0; });
  if(Math.abs(p.vx)>20) p.face=p.vx<0?-1:1; if(g.mouse.use) p.face=Math.cos(Math.atan2(g.mouse.y-p.y,g.mouse.x-p.x))<0?-1:1;
  if(g.keys[' ']||g.mouse.on||g.btn.atk) strike(g);
  // spawning
  if(g.queue.length){ g.spawnT-=dt; if(g.spawnT<=0&&g.enemies.filter(function(e){return !e.dead;}).length<12+g.wave*2){ spawn(g,g.queue.shift()); g.spawnT=Math.max(.35,1.3-g.wave*.08); } }
  // enemies
  g.enemies.forEach(function(e){ enemyAI(g,e,dt); });
  g.enemies=g.enemies.filter(function(e){ return !e.dead; });
  // shots
  g.shots.forEach(function(s){
    s.x+=s.vx*dt; s.y+=s.vy*dt; s.life-=dt;
    g.pillars.forEach(function(pl){ if(Math.hypot(s.x-pl.x,s.y-pl.y)<pl.r+s.r){ s.life=0; boom(g,s.x,s.y,'#fff',3); } });
    if(s.x<-20||s.x>AW+20||s.y<-20||s.y>AH+20) s.life=0;
    if(s.life>0&&Math.hypot(s.x-p.x,s.y-p.y)<s.r+p.r-3) { s.life=0; hurtPlayer(g,1,s.vx,s.vy); }
  });
  g.shots=g.shots.filter(function(s){ return s.life>0; });
  // telegraph hazards
  g.tele.forEach(function(t){ t.t-=dt; if(t.t<=0&&!t.done){ t.done=true; t.fire(g); } }); g.tele=g.tele.filter(function(t){ return !t.done||t.t>-.2; });
  // drops
  g.drops.forEach(function(d){
    d.t-=dt; var dd=dist(d,p), mg=70*g.m.magnet; if(dd<mg){ d.x+=(p.x-d.x)/dd*260*dt; d.y+=(p.y-d.y)/dd*260*dt; }
    if(dd<p.r+14){ d.t=0; sfx('pick'); if(d.k==='heart'){ p.hp=Math.min(p.maxhp,p.hp+1); g.texts.push({x:p.x,y:p.y-30,t:.9,max:.9,s:'❤ +1',c:'#ff6a8a',big:true}); } else if(d.k==='shard'){ p.sp=Math.min(100,p.sp+30); g.texts.push({x:p.x,y:p.y-30,t:.9,max:.9,s:'🔮 +30',c:'#c07cff',big:true}); } else { p.rage=8; g.texts.push({x:p.x,y:p.y-30,t:.9,max:.9,s:'🔥 RAGE',c:'#ffb02a',big:true}); } }
  }); g.drops=g.drops.filter(function(d){ return d.t>0; });
  // wave cleared
  if(g.wave>0&&!g.queue.length&&!g.enemies.length&&g.phase==='play'){
    var bonus=100*g.wave+(g.noHit?150:0); g.score+=bonus; g.texts.push({x:AW/2,y:AH/2-40,t:1.6,max:1.6,s:'Wave clear +'+bonus+(g.noHit?' (flawless!)':''),c:'#ffd24a',big:true});
    if(g.wave>=10){ end(g,true); return; }
    var pool=PERKS.filter(function(x){ return !g.perks.some(function(y){return y.id===x.id;}); }); var ch=[]; while(ch.length<3&&pool.length){ ch.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]); }
    g.choices=ch; g.phase='wait'; setTimeout(function(){ if(state.games&&state.games.gx===g&&g.phase==='wait'){ g.phase='upgrade'; overlay(g); } },1300);
  }
}
function enemyAI(g,e,dt){
  var p=g.p, d=EN[e.t]; e.flash=Math.max(0,e.flash-dt); e.cd-=dt;
  if(e.warp>0){ e.warp-=dt; return; }
  e.x+=e.vx*dt; e.y+=e.vy*dt; e.vx*=.88; e.vy*=.88;
  var dx=p.x-e.x, dy=p.y-e.y, dd=Math.hypot(dx,dy)||1, nx=dx/dd, ny=dy/dd; e.face=nx<0?-1:1;
  var spd=e.sp, moving=true;
  if(e.t==='runner'){ var zz=Math.sin(g.time*6+e.x)*.6; e.x+=(nx-ny*zz)*spd*dt; e.y+=(ny+nx*zz)*spd*dt; }
  else if(e.t==='spitter'){
    var want=dd>280?1:dd<200?-1:0; e.x+=nx*spd*want*dt; e.y+=ny*spd*want*dt; e.x+=-ny*spd*.4*dt*(Math.sin(e.cd)>0?1:-1);
    if(e.cd<=0){ e.cd=2.1; var ex=e; g.tele.push({t:.45,line:[ex,p],fire:function(){ if(ex.dead) return; var a=Math.atan2(g.p.y-ex.y,g.p.x-ex.x); g.shots.push({x:ex.x,y:ex.y,vx:Math.cos(a)*230,vy:Math.sin(a)*230,r:7,life:4,enemy:true}); sfx('shoot'); }}); }
  }
  else if(e.t==='brute'){
    if(e.state===0){ e.x+=nx*spd*dt; e.y+=ny*spd*dt; if(e.cd<=0&&dd<190){ e.state=1; e.st=.75; var eb=e; g.tele.push({t:.75,circle:{e:eb,r:90},fire:function(){ if(eb.dead) return; slam(g,eb.x,eb.y,90,1); }}); } }
    else { e.st-=dt; if(e.st<=0){ e.state=0; e.cd=2.6; } }
  }
  else if(e.t==='bomber'){
    if(e.state===0){ e.x+=nx*spd*dt; e.y+=ny*spd*dt; if(dd<85){ e.state=1; e.fuse=.8; } }
    else { e.fuse-=dt; if(e.fuse<=0){ e.dead=true; slam(g,e.x,e.y,95,1,true); } }
  }
  else if(e.t==='king') bossKing(g,e,dt,nx,ny,dd);
  else if(e.t==='titan') bossTitan(g,e,dt,nx,ny,dd);
  else { e.x+=nx*spd*dt; e.y+=ny*spd*dt; }
  // separation
  g.enemies.forEach(function(o){ if(o===e||o.dead) return; var ox=e.x-o.x, oy=e.y-o.y, od=Math.hypot(ox,oy), m=e.r+o.r; if(od>0&&od<m){ e.x+=ox/od*(m-od)*.4; e.y+=oy/od*(m-od)*.4; } });
  g.pillars.forEach(function(pl){ var ox=e.x-pl.x, oy=e.y-pl.y, od=Math.hypot(ox,oy), m=pl.r+e.r; if(od<m){ e.x=pl.x+ox/od*m; e.y=pl.y+oy/od*m; } });
  e.x=clamp(e.x,e.r,AW-e.r); e.y=clamp(e.y,e.r,AH-e.r);
  // contact
  if((e.t==='grunt'||e.t==='runner'||e.t==='king'||e.t==='titan'||e.t==='brute')&&dist(e,p)<e.r+p.r-4) hurtPlayer(g,1,-dx,-dy);
  // dash damage
  if(g.m.phase&&p.dash>0&&dist(e,p)<e.r+p.r+6&&!p.hitByDash[e.x+','+e.t+e.maxhp]){ p.hitByDash[e.x+','+e.t+e.maxhp]=1; hurtEnemy(g,e,g.m.dmg*1.2,false,nx,ny,200); }
}
function slam(g,x,y,r,dmg,friendly){
  g.rings.push({x:x,y:y,r:10,max:r,t:0,c:friendly?'#ff9a3c':'#ff6a6a'}); g.shake=Math.max(g.shake,.3); sfx('boom'); boom(g,x,y,'#ffb04a',16);
  if(dist({x:x,y:y},g.p)<r+g.p.r-4) hurtPlayer(g,dmg,g.p.x-x,g.p.y-y);
  if(friendly) g.enemies.forEach(function(o){ if(!o.dead&&Math.hypot(o.x-x,o.y-y)<r+o.r){ hurtEnemy(g,o,10,false,0,0,0); } });
}
function ringShots(g,e,n,off,sp){ for(var i=0;i<n;i++){ var a=off+i/n*TAU; g.shots.push({x:e.x,y:e.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:8,life:5,enemy:true}); } sfx('shoot'); }
function bossKing(g,e,dt,nx,ny,dd){
  if(!e.phase2&&e.hp<e.maxhp*.5){ e.phase2=true; for(var i=0;i<4;i++) g.queue.unshift('grunt'); g.spawnT=.2; g.texts.push({x:e.x,y:e.y-60,t:1.5,max:1.5,s:'ENRAGED!',c:'#ff6a6a',big:true}); g.shake=.5; }
  if(e.state===0){ e.x+=nx*e.sp*dt*(e.phase2?1.35:1); e.y+=ny*e.sp*dt*(e.phase2?1.35:1); if(e.cd<=0){ var r=Math.random(); if(r<.45){ e.state=1; e.st=.9; var eb=e, ang=Math.atan2(g.p.y-e.y,g.p.x-e.x); e.cx=Math.cos(ang); e.cy=Math.sin(ang); g.tele.push({t:.9,line:[eb,{x:eb.x+e.cx*520,y:eb.y+e.cy*520}],wide:40,fire:function(){ eb.state=2; eb.st=.45; }}); } else { ringShots(g,e,e.phase2?18:12,rnd(0,TAU),170); e.cd=e.phase2?1.6:2.2; } } }
  else if(e.state===1){ e.st-=dt; }
  else { e.x+=e.cx*620*dt; e.y+=e.cy*620*dt; e.st-=dt; if(e.st<=0){ e.state=0; e.cd=1.3; slam(g,e.x,e.y,80,1); } }
}
function bossTitan(g,e,dt,nx,ny,dd){
  if(!e.phase2&&e.hp<e.maxhp*.5){ e.phase2=true; g.texts.push({x:e.x,y:e.y-70,t:1.6,max:1.6,s:'THE VOID AWAKENS',c:'#c07cff',big:true}); g.shake=.6; for(var i=0;i<5;i++) g.queue.unshift('runner'); g.spawnT=.2; }
  e.x+=nx*e.sp*dt*.6; e.y+=ny*e.sp*dt*.6; e.spin=(e.spin||0)+dt*(e.phase2?2.4:1.6);
  e.shotT=(e.shotT||0)-dt; if(e.shotT<=0){ e.shotT=e.phase2?.16:.28; var a=e.spin*2; g.shots.push({x:e.x,y:e.y,vx:Math.cos(a)*190,vy:Math.sin(a)*190,r:7,life:5,enemy:true}); g.shots.push({x:e.x,y:e.y,vx:Math.cos(a+Math.PI)*190,vy:Math.sin(a+Math.PI)*190,r:7,life:5,enemy:true}); }
  if(e.cd<=0){ e.cd=e.phase2?3:4.2; var eb=e; g.tele.push({t:1,circle:{e:eb,r:150},fire:function(){ if(eb.dead) return; slam(g,eb.x,eb.y,150,2); ringShots(g,eb,14,rnd(0,TAU),200); }}); }
}

/* ---------- drawing ---------- */
function draw(g){
  var c=g.ctx, p=g.p; c.save(); c.clearRect(0,0,AW,AH);
  var sx=g.shake>0?rnd(-1,1)*g.shake*14:0, sy=g.shake>0?rnd(-1,1)*g.shake*14:0; c.translate(sx,sy);
  // floor
  var gr=c.createRadialGradient(AW/2,AH/2,60,AW/2,AH/2,620); gr.addColorStop(0,'#2b2547'); gr.addColorStop(1,'#0e0c1c'); c.fillStyle=gr; c.fillRect(-20,-20,AW+40,AH+40);
  c.strokeStyle='rgba(255,255,255,.045)'; c.lineWidth=1; for(var x=0;x<=AW;x+=48){ c.beginPath(); c.moveTo(x,0); c.lineTo(x,AH); c.stroke(); } for(var y=0;y<=AH;y+=48){ c.beginPath(); c.moveTo(0,y); c.lineTo(AW,y); c.stroke(); }
  c.strokeStyle='rgba(176,124,255,.25)'; c.lineWidth=3; c.beginPath(); c.arc(AW/2,AH/2,170,0,TAU); c.stroke(); c.beginPath(); c.arc(AW/2,AH/2,110,0,TAU); c.stroke();
  c.strokeStyle='#4a3f78'; c.lineWidth=6; c.strokeRect(6,6,AW-12,AH-12);
  // pillars
  g.pillars.forEach(function(pl){ c.fillStyle='rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(pl.x+4,pl.y+pl.r*.7,pl.r,pl.r*.45,0,0,TAU); c.fill(); var pg=c.createLinearGradient(pl.x-pl.r,pl.y,pl.x+pl.r,pl.y); pg.addColorStop(0,'#5d5780'); pg.addColorStop(1,'#2a2644'); c.fillStyle=pg; c.beginPath(); c.arc(pl.x,pl.y,pl.r,0,TAU); c.fill(); c.strokeStyle='#8f86c4'; c.lineWidth=2; c.stroke(); c.fillStyle='rgba(255,255,255,.12)'; c.beginPath(); c.arc(pl.x-8,pl.y-8,pl.r*.45,0,TAU); c.fill(); });
  // telegraphs
  g.tele.forEach(function(t){ if(t.done) return; var k=1-clamp(t.t/(t.max||(t.max=t.t+.0001)),0,1); c.save(); c.globalAlpha=.25+k*.45; c.fillStyle='#ff3a3a'; c.strokeStyle='#ff6a6a';
    if(t.circle){ var e=t.circle.e; c.beginPath(); c.arc(e.x,e.y,t.circle.r,0,TAU); c.fill(); c.beginPath(); c.arc(e.x,e.y,t.circle.r*k,0,TAU); c.stroke(); }
    else if(t.line){ c.lineWidth=t.wide||3; c.setLineDash([10,8]); c.beginPath(); c.moveTo(t.line[0].x,t.line[0].y); c.lineTo(t.line[1].x,t.line[1].y); c.stroke(); } c.restore(); });
  // spawn warps
  g.enemies.forEach(function(e){ if(e.warp>0){ c.strokeStyle=EN[e.t].col; c.globalAlpha=.8; c.lineWidth=3; c.beginPath(); c.arc(e.x,e.y,e.r*(1+e.warp*2.2),0,TAU); c.stroke(); c.globalAlpha=1; } });
  // drops
  g.drops.forEach(function(d){ var bob=Math.sin(g.time*5+d.x)*3; c.globalAlpha=d.t<3?(Math.sin(g.time*20)>0?1:.35):1; c.shadowColor=d.k==='heart'?'#ff4a6a':d.k==='shard'?'#b07cff':'#ffb02a'; c.shadowBlur=14; c.font='22px sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(d.k==='heart'?'❤️':d.k==='shard'?'🔮':'🔥',d.x,d.y+bob); c.shadowBlur=0; c.globalAlpha=1; });
  // player trail
  p.trail.forEach(function(t){ c.globalAlpha=t.t*1.6; if(g.sprite&&g.sprite.complete&&g.sprite.naturalWidth) c.drawImage(g.sprite,t.x-26,t.y-30,52,52); c.globalAlpha=1; });
  // enemies
  g.enemies.forEach(function(e){
    var d=EN[e.t]; if(e.warp>0&&Math.floor(e.warp*20)%2) return;
    c.fillStyle='rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(e.x,e.y+e.r*.8,e.r*.9,e.r*.38,0,0,TAU); c.fill();
    c.save(); c.translate(e.x,e.y); var sz=e.r*2.1; c.font=sz+'px sans-serif'; c.textAlign='center'; c.textBaseline='middle';
    if(e.flash>0){ c.shadowColor='#fff'; c.shadowBlur=24; } else if(e.t==='bomber'&&e.state===1){ c.shadowColor=Math.floor(g.time*14)%2?'#ff4a4a':'#fff'; c.shadowBlur=22; } else if(d.boss){ c.shadowColor=d.col; c.shadowBlur=22+Math.sin(g.time*4)*6; }
    if(e.face<0) c.scale(-1,1); if(e.state===1&&e.t==='brute') c.scale(1+Math.sin(g.time*30)*.05,1+Math.sin(g.time*30)*.05);
    if(e.flash>0) c.globalAlpha=.7; c.fillText(d.e,0,2); c.restore();
    if(e.hp<e.maxhp&&!d.boss){ c.fillStyle='rgba(0,0,0,.6)'; c.fillRect(e.x-e.r,e.y-e.r-12,e.r*2,5); c.fillStyle=d.col; c.fillRect(e.x-e.r,e.y-e.r-12,e.r*2*clamp(e.hp/e.maxhp,0,1),5); }
  });
  // shots
  g.shots.forEach(function(s){ c.shadowColor='#ff4a8a'; c.shadowBlur=14; c.fillStyle='#ff7aa8'; c.beginPath(); c.arc(s.x,s.y,s.r,0,TAU); c.fill(); c.fillStyle='#fff'; c.beginPath(); c.arc(s.x,s.y,s.r*.4,0,TAU); c.fill(); c.shadowBlur=0; });
  // player
  c.fillStyle='rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(p.x,p.y+16,18,7,0,0,TAU); c.fill();
  if(p.rage>0){ c.shadowColor='#ffb02a'; c.shadowBlur=24; }
  c.save(); c.translate(p.x,p.y); if(p.face<0) c.scale(-1,1); if(p.inv>0&&Math.floor(g.time*24)%2&&p.dash<=0) c.globalAlpha=.4; if(p.hurtFlash>0) c.filter='brightness(2) saturate(.2)';
  var bob=Math.sin(g.time*14)*(Math.hypot(p.vx,p.vy)>30?2:0.8); if(g.sprite&&g.sprite.complete&&g.sprite.naturalWidth) c.drawImage(g.sprite,-28,-32+bob,56,56); else { c.fillStyle='#8f86c4'; c.beginPath(); c.arc(0,0,16,0,TAU); c.fill(); }
  c.restore(); c.shadowBlur=0; c.globalAlpha=1;
  // swing arc
  if(p.swing>0){ var k=1-p.swing/.2, reach=g.m.reach, half=g.m.arc/2, a0=p.swingAng-half+(k*g.m.arc*.35);
    var sg=c.createRadialGradient(p.x,p.y,reach*.3,p.x,p.y,reach); sg.addColorStop(0,'rgba(255,255,255,0)'); sg.addColorStop(.8,'rgba(190,230,255,'+(.75*(1-k))+')'); sg.addColorStop(1,'rgba(255,255,255,'+(.95*(1-k))+')');
    c.fillStyle=sg; c.beginPath(); c.moveTo(p.x,p.y); c.arc(p.x,p.y,reach,a0,a0+g.m.arc*(.65+k*.35)); c.closePath(); c.fill(); }
  // rings
  g.rings.forEach(function(r){ c.strokeStyle=r.c; c.globalAlpha=1-r.t/.45; c.lineWidth=8*(1-r.t/.45)+2; c.beginPath(); c.arc(r.x,r.y,r.r,0,TAU); c.stroke(); c.globalAlpha=1; });
  // particles
  g.parts.forEach(function(q){ c.globalAlpha=clamp(q.life/q.max,0,1); c.fillStyle=q.c; c.beginPath(); c.arc(q.x,q.y,q.s,0,TAU); c.fill(); }); c.globalAlpha=1;
  // texts
  g.texts.forEach(function(t){ c.globalAlpha=clamp(t.t/t.max*1.6,0,1); c.font=(t.big?'900 22px':'800 15px')+' Inter,sans-serif'; c.textAlign='center'; c.lineWidth=4; c.strokeStyle='rgba(0,0,0,.7)'; c.strokeText(t.s,t.x,t.y); c.fillStyle=t.c; c.fillText(t.s,t.x,t.y); }); c.globalAlpha=1;
  c.restore();
  // vignette / flashes
  if(p.hp<=2&&g.phase==='play'){ var vg=c.createRadialGradient(AW/2,AH/2,AH*.3,AW/2,AH/2,AH*.85); vg.addColorStop(0,'rgba(255,0,40,0)'); vg.addColorStop(1,'rgba(255,0,40,'+(.28+Math.sin(g.time*6)*.08)+')'); c.fillStyle=vg; c.fillRect(0,0,AW,AH); }
  if(p.hurtFlash>0){ c.fillStyle='rgba(255,40,60,'+p.hurtFlash*.5+')'; c.fillRect(0,0,AW,AH); }
  if(g.flash>0){ c.fillStyle='rgba(200,160,255,'+g.flash*2+')'; c.fillRect(0,0,AW,AH); }
  hud(g,c);
}
function hud(g,c){
  var p=g.p; c.textBaseline='middle';
  // hearts
  for(var i=0;i<p.maxhp;i++){ c.font='22px sans-serif'; c.textAlign='left'; c.globalAlpha=i<p.hp?1:.25; c.fillText(i<p.hp?'❤️':'🖤',14+i*26,26); } c.globalAlpha=1;
  // score + combo
  c.textAlign='right'; c.font='900 24px Inter,sans-serif'; c.lineWidth=4; c.strokeStyle='rgba(0,0,0,.7)'; c.strokeText(String(g.score),AW-16,26); c.fillStyle='#fff'; c.fillText(String(g.score),AW-16,26);
  if(g.combo>1){ var m=mult(g); c.font='900 '+(20+Math.min(12,g.combo/3))+'px Inter,sans-serif'; c.fillStyle=m>=3?'#ff6a3a':m>=2?'#ffd24a':'#fff'; c.strokeText(g.combo+' HITS  ×'+m.toFixed(1),AW-16,56); c.fillText(g.combo+' HITS  ×'+m.toFixed(1),AW-16,56);
    c.fillStyle='rgba(255,255,255,.2)'; c.fillRect(AW-136,70,120,5); c.fillStyle='#ffd24a'; c.fillRect(AW-136,70,120*clamp(g.comboTimer/g.m.comboT,0,1),5); }
  // wave
  c.textAlign='center'; c.font='800 15px Inter,sans-serif'; c.fillStyle='#cfc6ff'; c.fillText('WAVE '+Math.max(1,g.wave)+' / 10  ·  '+(g.queue.length+g.enemies.length)+' left',AW/2,22);
  // boss bar
  if(g.boss&&!g.boss.dead){ var b=g.boss, w=420; c.fillStyle='rgba(0,0,0,.65)'; c.fillRect(AW/2-w/2,38,w,14); c.fillStyle=EN[b.t].col; c.fillRect(AW/2-w/2,38,w*clamp(b.hp/b.maxhp,0,1),14); c.strokeStyle='#fff'; c.lineWidth=2; c.strokeRect(AW/2-w/2,38,w,14); c.font='900 13px Inter,sans-serif'; c.fillStyle='#fff'; c.fillText(EN[b.t].name,AW/2,66); }
  // special + dash
  var bx=AW/2-110, by=AH-26; c.fillStyle='rgba(0,0,0,.6)'; c.fillRect(bx,by,220,12); var full=p.sp>=100; c.fillStyle=full?(Math.floor(g.time*6)%2?'#e0b0ff':'#b07cff'):'#7a5cd0'; c.fillRect(bx,by,220*p.sp/100,12); c.strokeStyle='#cfc6ff'; c.lineWidth=2; c.strokeRect(bx,by,220,12);
  c.font='800 11px Inter,sans-serif'; c.fillStyle='#fff'; c.fillText(full?'🔮 SPECIAL READY — press E':'🔮 SPECIAL '+Math.floor(p.sp)+'%',AW/2,by-9);
  for(var d=0;d<g.m.dashMax;d++){ c.fillStyle=d<p.dashCharges?'#7ce8ff':'rgba(124,232,255,.18)'; c.beginPath(); c.arc(16+d*20,AH-24,7,0,TAU); c.fill(); }
  if(p.dashCharges<g.m.dashMax){ c.fillStyle='rgba(124,232,255,.8)'; c.fillRect(8,AH-12,(g.m.dashMax*20)*clamp(p.dashTimer/g.m.dashRe,0,1),3); }
  if(p.rage>0){ c.textAlign='left'; c.font='800 13px Inter,sans-serif'; c.fillStyle='#ffb02a'; c.fillText('🔥 RAGE '+p.rage.toFixed(1)+'s',14,52); }
  // banner
  if(g.bannerT>0){ var al=clamp(Math.min(g.bannerT,2.2-g.bannerT)*3,0,1); c.globalAlpha=al; c.textAlign='center'; c.font='900 46px Inter,sans-serif'; c.lineWidth=7; c.strokeStyle='rgba(0,0,0,.75)'; var y=AH/2-70+(1-al)*-14; c.strokeText(g.banner,AW/2,y); c.fillStyle=g.banner.indexOf('BOSS')>=0?'#ff6a6a':'#fff'; c.fillText(g.banner,AW/2,y); c.globalAlpha=1; }
}
})();
