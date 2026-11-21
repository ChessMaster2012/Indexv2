/* Live Lobby map: while a room waits to start, every student appears on a shared plaza as their equipped Indexling.
   Students walk around (WASD / arrows / tap), the host sees everyone. The top bar shows the room code and how many
   students are in; clicking the count opens the player list, and any player opens a profile banner. */
(function(){
'use strict';
var W=1200,H=700,SPEED=240;
var EMOTES=['👋','😂','🔥','👍','🎉','😮'];
var L=window.LVL={root:null,role:'',code:'',cv:null,ctx:null,bg:null,P:{},meId:'',sel:'',listOpen:false,raf:0,keys:{},target:null,sprites:{},t0:0,lastSend:0,sent:{x:0,y:0},ping:null,socks:null,sig:''};
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function rng(seed){return function(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function S(){try{return state.live||{};}catch(e){return {};}}

/* ---------- my profile card data (sent when joining) ---------- */
L.myProfile=function(){
  try{
    var p=state.progress||{}, xp=p.xp||0;
    return {lv:Math.floor(xp/100)+1,xp:xp,st:(typeof computeStreak==='function'?computeStreak():0),own:(p.unlockedCosmetics||[]).length,packs:p.openedPacks||0,games:p.liveGames||0,fr:(p.equipped&&p.equipped.frame)||''};
  }catch(e){return {lv:1,xp:0,st:0,own:1,packs:0,games:0,fr:''};}
};

/* ---------- indexling sprites ---------- */
function sprite(id,skin){
  var key=(id||'')+'|'+(skin||''), s=L.sprites[key]; if(s) return s.img;
  s=L.sprites[key]={img:new Image()};
  try{
    var l=(typeof cosmeticById==='function'&&id&&cosmeticById(id))||cosmeticById('ling-sugarbug'), sk=(skin&&typeof skinById==='function'&&skinById(skin))||{};
    var html=indexlingArtHtml(l,true,sk), m=html.match(/<svg[\s\S]*<\/svg>/);
    if(m){var vars={}; html.replace(/(--[\w-]+)\s*:\s*([^;"]+)/g,function(_,k,v){vars[k]=v.trim();return _;});
      var svg=m[0].replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g,function(_,k){return vars[k]||'#b07cff';}).replace(/<svg\b/,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"');
      s.img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}
  }catch(e){}
  return s.img;
}
function lingInfo(id){try{return cosmeticById(id)||cosmeticById('ling-sugarbug');}catch(e){return {name:'Indexling',rarity:'Common',icon:''};}}
var RCOL={Common:'#9aa3ad',Rare:'#5aa9ff',Epic:'#b07cff',Legendary:'#ffb23f',Mythic:'#ff5a7a'};

/* ---------- map (drawn once) ---------- */
var OBST=[];
function buildBg(){
  var c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d'), r=rng(7);
  OBST=[{x:600,y:300,r:78}];
  var g=x.createLinearGradient(0,0,0,H); g.addColorStop(0,'#5fae6a'); g.addColorStop(1,'#78c77c'); x.fillStyle=g; x.fillRect(0,0,W,H);
  for(var i=0;i<26;i++){x.fillStyle='rgba(255,255,255,.035)'; x.fillRect(0,i*28,W,14);}
  for(i=0;i<260;i++){x.fillStyle=r()<.5?'rgba(40,110,60,.28)':'rgba(255,255,255,.12)'; x.beginPath(); x.arc(r()*W,r()*H,1+r()*2.4,0,7); x.fill();}
  /* plaza */
  x.save(); x.beginPath(); x.ellipse(600,400,420,250,0,0,7); x.fillStyle='#d9cdb4'; x.fill(); x.lineWidth=10; x.strokeStyle='#bfae8d'; x.stroke(); x.clip();
  for(var gy=150;gy<660;gy+=34){for(var gx=140+((gy/34)%2)*20;gx<1080;gx+=40){x.fillStyle='rgba('+(120+r()*40|0)+','+(104+r()*30|0)+',80,.16)'; x.fillRect(gx,gy,36,30);}}
  x.restore();
  /* path to portal */
  x.fillStyle='#cdbf9f'; x.fillRect(560,120,80,170);
  /* fountain */
  x.beginPath(); x.ellipse(600,318,96,66,0,0,7); x.fillStyle='#a8998a'; x.fill();
  x.beginPath(); x.ellipse(600,312,82,54,0,0,7); x.fillStyle='#4aa8e8'; x.fill();
  x.beginPath(); x.ellipse(600,310,60,38,0,0,7); x.fillStyle='#79c8f5'; x.fill();
  x.fillStyle='#bfb3a5'; x.fillRect(590,262,20,50); x.beginPath(); x.arc(600,262,16,0,7); x.fillStyle='#d6cbbd'; x.fill();
  /* portal arch */
  var pg=x.createRadialGradient(600,92,8,600,92,70); pg.addColorStop(0,'#fff6c9'); pg.addColorStop(.5,'#ffb86b'); pg.addColorStop(1,'rgba(255,122,77,0)');
  x.fillStyle=pg; x.beginPath(); x.arc(600,96,70,0,7); x.fill();
  x.fillStyle='#8a6f52'; x.fillRect(528,56,18,96); x.fillRect(654,56,18,96); x.beginPath(); x.arc(600,64,72,Math.PI,0); x.lineWidth=18; x.strokeStyle='#8a6f52'; x.stroke();
  /* trees */
  function tree(tx,ty,s){OBST.push({x:tx,y:ty,r:22*s}); x.fillStyle='rgba(0,0,0,.18)'; x.beginPath(); x.ellipse(tx+6,ty+10*s,30*s,12*s,0,0,7); x.fill();
    x.fillStyle='#7a5636'; x.fillRect(tx-6*s,ty-10*s,12*s,30*s);
    var cols=['#2f8f4e','#3aa35c','#47b469']; for(var k=0;k<3;k++){x.fillStyle=cols[k]; x.beginPath(); x.arc(tx+(k-1)*14*s,ty-24*s-(k===1?14*s:0),26*s-k*3,0,7); x.fill();}}
  var tp=[[70,130],[160,90],[250,60],[950,60],[1040,95],[1130,135],[50,300],[1150,300],[60,520],[1140,520],[170,640],[1030,640],[350,40],[860,38]];
  tp.forEach(function(t){tree(t[0],t[1],.9+r()*.5);});
  /* flowers */
  var fc=['#ff7aa8','#ffd45c','#ffffff','#b58cff'];
  for(i=0;i<70;i++){var fx=r()*W,fy=r()*H; if(Math.hypot((fx-600)/430,(fy-400)/255)<1.05) continue; x.fillStyle=fc[i%4]; x.beginPath(); x.arc(fx,fy,3,0,7); x.fill();}
  /* benches + lamps */
  [[330,520],[870,520],[420,640],[780,640]].forEach(function(b){x.fillStyle='#8a6a45'; x.fillRect(b[0]-34,b[1]-8,68,14); x.fillStyle='#6c5233'; x.fillRect(b[0]-30,b[1]+6,6,10); x.fillRect(b[0]+24,b[1]+6,6,10); OBST.push({x:b[0],y:b[1],r:20});});
  [[250,300],[950,300],[250,560],[950,560]].forEach(function(l){x.fillStyle='#4b4a55'; x.fillRect(l[0]-3,l[1]-40,6,50); x.fillStyle='#ffe28a'; x.beginPath(); x.arc(l[0],l[1]-46,9,0,7); x.fill(); x.fillStyle='rgba(255,226,138,.18)'; x.beginPath(); x.arc(l[0],l[1]-46,34,0,7); x.fill(); OBST.push({x:l[0],y:l[1],r:10});});
  /* bunting */
  x.strokeStyle='rgba(60,40,30,.5)'; x.lineWidth=2; x.beginPath(); x.moveTo(0,30); x.quadraticCurveTo(300,80,600,36); x.quadraticCurveTo(900,-4,1200,34); x.stroke();
  var bc=['#ff7a4d','#ffd45c','#4aa8e8','#7be0a0','#b58cff']; for(i=0;i<22;i++){var tt=i/21,bx=tt*W,by=30+Math.sin(tt*Math.PI*2)*-4+ (tt<.5?tt*60:(1-tt)*10)+2; x.fillStyle=bc[i%5]; x.beginPath(); x.moveTo(bx-8,by); x.lineTo(bx+8,by); x.lineTo(bx,by+18); x.fill();}
  L.bg=c;
}
function resolve(p){
  p.x=Math.max(40,Math.min(W-40,p.x)); p.y=Math.max(90,Math.min(H-40,p.y));
  for(var i=0;i<OBST.length;i++){var o=OBST[i],dx=p.x-o.x,dy=p.y-o.y,d=Math.hypot(dx,dy),m=o.r+14; if(d<m&&d>0.01){p.x=o.x+dx/d*m; p.y=o.y+dy/d*m;}}
}

/* ---------- state sync ---------- */
function syncRoster(){
  var list=S().players||[], seen={}, me=S().playerId||'';
  L.meId=me;
  list.forEach(function(r,i){
    seen[r.id]=1; var p=L.P[r.id];
    if(!p){var a=((i*137)%360)*Math.PI/180; p=L.P[r.id]={id:r.id,x:600+Math.cos(a)*220,y:520+Math.sin(a)*40,tx:0,ty:0,f:1,mv:0,em:'',emT:0}; p.tx=p.x; p.ty=p.y;}
    p.name=r.name; p.ling=r.ling; p.skin=r.skin; p.prof=r.prof; p.online=r.online!==false;
  });
  Object.keys(L.P).forEach(function(k){if(!seen[k]) delete L.P[k];});
  var n=list.length, sig=n+'|'+list.map(function(r){return r.id+r.name+(r.online===false?0:1);}).join(',');
  if(sig!==L.sig){L.sig=sig; updateBar(); if(L.listOpen) renderList();}
}
function onSnap(a){
  (a||[]).forEach(function(r){var p=L.P[r[0]]; if(!p) return; if(!p.inited){p.inited=true; p.x=p.tx=r[1]; p.y=p.ty=r[2]; p.f=r[3]||1; return;} if(r[0]===L.meId&&L.role==='player') return; p.tx=r[1]; p.ty=r[2]; p.f=r[3]||1;});
}
function onEmote(d){var p=L.P[d.id]; if(p){p.em=EMOTES[d.e]||'👋'; p.emT=performance.now()+2200;}}
function SK(){try{return socket;}catch(e){return null;}}
function bindSock(){
  var sk=SK(); if(!sk||L.socks===sk) return;
  unbindSock(); L.socks=sk; sk.on('lobby:snap',onSnap); sk.on('lobby:emote',onEmote);
}
function unbindSock(){ if(L.socks){try{L.socks.off('lobby:snap',onSnap);L.socks.off('lobby:emote',onEmote);}catch(e){}} L.socks=null; }

/* ---------- DOM ---------- */
L.shell=function(role){
  var c=S().config||{}, m=(typeof GAME_MODES!=='undefined'&&GAME_MODES[S().mode])||{icon:'',label:'Live game',desc:''};
  var chips=(typeof window.lvSummaryChips==='function')?window.lvSummaryChips(c):'';
  return '<div class="lvl-wrap lvl-'+role+'"><div id="lvl-slot"></div>'+
    '<div class="lvl-info"><p class="lv-eyebrow">'+(m.icon||'')+' '+esc((m.label||'').toUpperCase())+'</p><h3 class="lvl-title">'+esc((role==='host'?c.title:S().title)||'Live Game')+'</h3>'+
    '<p class="lv-fine">'+esc(m.desc||'')+'</p><div class="lv-chips">'+chips+'</div></div></div>';
};
function build(role){
  var r=document.createElement('div'); r.className='lvl-root'; r.setAttribute('data-role',role);
  var host=role==='host';
  r.innerHTML=
   '<div class="lvl-bar"><div class="lvl-code" title="Room code"><span>ROOM CODE</span><b id="lvl-code">'+esc(S().code||'')+'</b>'+(host?'<button type="button" class="lvl-ib" data-lv="copy-code" title="Copy code">⧉</button><button type="button" class="lvl-ib" data-lv="copy-link" title="Copy invite text">🔗</button>':'')+'</div>'+
   '<button type="button" class="lvl-count" id="lvl-count" aria-expanded="false" aria-controls="lvl-list"><span class="lvl-live"></span><b id="lvl-n">0</b><span id="lvl-nlab">students</span><i>▾</i></button>'+
   '<div class="lvl-sp"></div>'+
   (host?'<label class="lv-toggle lv-toggle-sm lvl-lock"><input type="checkbox" data-lv-lock="1"><span class="lv-switch"></span><span class="lv-toggle-t"><b>Lock room</b></span></label><button type="button" class="btn btn-primary lvl-start" data-lv="start" disabled>▶ Start game</button>'
        :'<div class="lvl-status"><span class="lv-pulse"></span><span id="lvl-stat">Waiting for the host to start…</span></div>')+
   '</div>'+
   '<div class="lvl-list" id="lvl-list" hidden></div><div class="lvl-banner" id="lvl-banner" hidden></div>'+
   '<div class="lvl-stage"><canvas id="lvl-cv" width="'+W+'" height="'+H+'" aria-label="Lobby map"></canvas>'+
   (host?'<div class="lvl-hint">Students are walking around the lobby. Click a student to see their profile.</div>'
        :'<div class="lvl-hint">Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys, or tap the map.</div><div class="lvl-emotes" id="lvl-emotes">'+EMOTES.map(function(e,i){return '<button type="button" data-em="'+i+'" aria-label="Emote">'+e+'</button>';}).join('')+'</div>')+
   '</div>';
  L.root=r; L.cv=r.querySelector('#lvl-cv'); L.ctx=L.cv.getContext('2d');
  r.addEventListener('click',onClick);
  L.cv.addEventListener('pointerdown',onPointer);
  return r;
}
function updateBar(){
  if(!L.root) return; var list=S().players||[], n=list.length, on=list.filter(function(p){return p.online!==false;}).length;
  var a=$('lvl-n'); if(a) a.textContent=n; var b=$('lvl-nlab'); if(b) b.textContent=(n===1?'student':'students')+(on<n?' ('+on+' online)':'');
  var st=L.root.querySelector('.lvl-start'); if(st){st.disabled=!n; st.textContent='▶ Start game'+(n?' ('+n+')':'');}
  var lk=L.root.querySelector('[data-lv-lock]'); if(lk) lk.checked=!!(S().config&&S().config.locked);
  var cd=$('lvl-code'); if(cd&&S().code) cd.textContent=S().code;
  var ss=$('lvl-stat'); if(ss) ss.textContent=S().inProgress?'Get ready, the game is about to start…':'You are in! Waiting for '+(S().hostName||'the host')+' to start…';
}
function renderList(){
  var box=$('lvl-list'); if(!box) return; var list=(S().players||[]).slice();
  box.innerHTML='<div class="lvl-list-h"><b>Students in this game</b><span>'+list.length+'</span></div>'+
   (list.length?'<div class="lvl-rows">'+list.map(function(p){var li=lingInfo(p.ling),lv=p.prof&&p.prof.lv||1;
     return '<div class="lvl-row'+(p.id===L.sel?' on':'')+(p.online===false?' off':'')+'" data-pid="'+esc(p.id)+'" role="button" tabindex="0"><img alt="" src="'+sprite(p.ling,p.skin).src+'"><div class="lvl-rn"><b>'+esc(p.name)+(p.id===L.meId?' (you)':'')+'</b><span style="color:'+(RCOL[li.rarity]||'#9aa3ad')+'">'+esc(li.name)+' · '+esc(li.rarity)+'</span></div><em>Lv '+lv+'</em></div>';}).join('')+'</div>'
     :'<p class="lvl-empty">Nobody has joined yet. Share the code!</p>');
}
function renderBanner(){
  var box=$('lvl-banner'); if(!box) return; var p=L.P[L.sel];
  if(!p){box.hidden=true; return;}
  var li=lingInfo(p.ling), pr=p.prof||{lv:1,xp:0,st:0,own:1,packs:0,games:0}, col=RCOL[li.rarity]||'#9aa3ad', into=(pr.xp||0)%100;
  box.hidden=false; box.style.setProperty('--rc',col);
  box.innerHTML='<button type="button" class="lvl-bx" data-close="1" aria-label="Close profile">×</button>'+
   '<div class="lvl-bart"><img alt="" src="'+sprite(p.ling,p.skin).src+'"></div>'+
   '<div class="lvl-bmain"><div class="lvl-bname"><h4>'+esc(p.name)+(p.id===L.meId?' <small>(you)</small>':'')+'</h4><span class="lvl-lvl">Lv '+(pr.lv||1)+'</span></div>'+
   '<div class="lvl-bling"><span class="lvl-rar" style="background:'+col+'">'+esc(li.rarity)+'</span> '+esc(li.name)+(p.online===false?' · <i>offline</i>':'')+'</div>'+
   '<div class="lvl-xp"><div><i style="width:'+into+'%"></i></div><span>'+into+' / 100 XP to Lv '+((pr.lv||1)+1)+'</span></div>'+
   '<div class="lvl-stats"><div><b>'+(pr.st||0)+'</b><span>Day streak</span></div><div><b>'+(pr.own||0)+'</b><span>Items owned</span></div><div><b>'+(pr.packs||0)+'</b><span>Packs opened</span></div><div><b>'+(pr.games||0)+'</b><span>Live games</span></div></div>'+
   '<div class="lvl-bact"><button type="button" class="btn btn-ghost btn-sm" data-locate="1">📍 Find on map</button>'+(L.role==='host'&&p.id!==L.meId?'<button type="button" class="btn btn-ghost btn-sm lvl-kick" data-lv="kick" data-id="'+esc(p.id)+'">Remove</button>':'')+'</div></div>';
}
function onClick(e){
  var t=e.target; if(!t.closest) return;
  if(t.closest('#lvl-count')){ L.listOpen=!L.listOpen; var b=$('lvl-list'); b.hidden=!L.listOpen; $('lvl-count').setAttribute('aria-expanded',L.listOpen); $('lvl-count').classList.toggle('on',L.listOpen); if(L.listOpen) renderList(); return; }
  var row=t.closest('.lvl-row'); if(row){ L.sel=row.getAttribute('data-pid'); L.listOpen=false; $('lvl-list').hidden=true; $('lvl-count').classList.remove('on'); $('lvl-count').setAttribute('aria-expanded','false'); renderBanner(); L.ping={id:L.sel,t:performance.now()}; return; }
  if(t.closest('[data-close]')){ L.sel=''; renderBanner(); if(L.listOpen) renderList(); return; }
  if(t.closest('[data-locate]')){ L.ping={id:L.sel,t:performance.now()}; return; }
  var em=t.closest('[data-em]'); if(em){ var i=Number(em.getAttribute('data-em')); onEmote({id:L.meId,e:i}); if(SK()) SK().emit('lobby:emote',{code:S().code,playerId:L.meId,e:i}); return; }
}
document.addEventListener('keydown',function(e){ if(!L.root) return; if(e.target&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; var k=e.key.toLowerCase(); if('wasdarrowuparrowdownarrowleftarrowright'.indexOf(k)>=0||k===' '){ L.keys[k]=1; if(k.indexOf('arrow')===0) e.preventDefault(); } });
document.addEventListener('keyup',function(e){ delete L.keys[e.key.toLowerCase()]; });
window.addEventListener('blur',function(){L.keys={};});
function worldPt(e){var r=L.cv.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H};}
function onPointer(e){
  var w=worldPt(e), hit=null, best=1e9;
  Object.keys(L.P).forEach(function(id){var p=L.P[id],d=Math.hypot(p.x-w.x,p.y-24-w.y); if(d<38&&d<best){best=d;hit=id;}});
  if(hit){ L.sel=hit; renderBanner(); if(L.listOpen) renderList(); return; }
  if(L.role==='player'){ L.target={x:w.x,y:w.y}; }
}

/* ---------- loop ---------- */
function frame(ts){
  L.raf=requestAnimationFrame(frame);
  if(!L.root||!L.ctx) return;
  if(!document.body.contains(L.cv)) return;
  var dt=Math.min(.05,(ts-(L.t0||ts))/1000); L.t0=ts;
  syncRoster(); bindSock();
  var me=L.P[L.meId];
  if(L.role==='player'&&me){
    var dx=(L.keys.d||L.keys.arrowright?1:0)-(L.keys.a||L.keys.arrowleft?1:0), dy=(L.keys.s||L.keys.arrowdown?1:0)-(L.keys.w||L.keys.arrowup?1:0);
    if(dx||dy){L.target=null;}
    else if(L.target){var tx=L.target.x-me.x,ty=L.target.y-me.y,td=Math.hypot(tx,ty); if(td<6){L.target=null;} else {dx=tx/td; dy=ty/td; if(td<SPEED*dt){dx*=td/(SPEED*dt); dy*=td/(SPEED*dt);}}}
    var len=Math.hypot(dx,dy); if(len>1){dx/=len;dy/=len;}
    me.mv=(dx||dy)?1:0;
    if(dx||dy){me.x+=dx*SPEED*dt; me.y+=dy*SPEED*dt; if(dx) me.f=dx<0?-1:1; resolve(me); me.tx=me.x; me.ty=me.y;}
    var now=performance.now();
    if(SK()&&now-L.lastSend>110&&(Math.abs(me.x-L.sent.x)>1||Math.abs(me.y-L.sent.y)>1)){
      L.lastSend=now; L.sent={x:me.x,y:me.y}; SK().emit('lobby:move',{code:S().code,playerId:L.meId,x:Math.round(me.x),y:Math.round(me.y),f:me.f});
    }
  }
  Object.keys(L.P).forEach(function(id){var p=L.P[id]; if(id===L.meId&&L.role==='player') return;
    var ox=p.x,oy=p.y,k=1-Math.pow(.0005,dt); p.x+=(p.tx-p.x)*k; p.y+=(p.ty-p.y)*k; p.mv=(Math.abs(p.x-ox)+Math.abs(p.y-oy))>.15?1:0;});
  draw(ts);
}
function rr(x,a,b,w,h,r){x.beginPath(); x.moveTo(a+r,b); x.arcTo(a+w,b,a+w,b+h,r); x.arcTo(a+w,b+h,a,b+h,r); x.arcTo(a,b+h,a,b,r); x.arcTo(a,b,a+w,b,r); x.closePath();}
function draw(ts){
  var x=L.ctx; if(!L.bg) buildBg();
  x.clearRect(0,0,W,H); x.drawImage(L.bg,0,0);
  var list=Object.keys(L.P).map(function(k){return L.P[k];}).sort(function(a,b){return a.y-b.y;});
  var t=ts/1000;
  list.forEach(function(p){
    var img=sprite(p.ling,p.skin), bob=p.mv?Math.abs(Math.sin(t*11+p.x))*7:Math.sin(t*2+p.x)*1.5, sz=76, alpha=p.online===false?.45:1;
    x.save(); x.globalAlpha=alpha;
    x.fillStyle='rgba(0,0,0,.22)'; x.beginPath(); x.ellipse(p.x,p.y+2,24,8,0,0,7); x.fill();
    if(p.id===L.sel||(L.ping&&L.ping.id===p.id&&ts-L.ping.t<2400)){var pulse=(Math.sin(t*6)+1)/2; x.strokeStyle='rgba(255,214,90,'+(.55+pulse*.4)+')'; x.lineWidth=4; x.beginPath(); x.ellipse(p.x,p.y+2,34+pulse*6,13+pulse*3,0,0,7); x.stroke();}
    if(img&&img.complete&&img.naturalWidth){x.save(); x.translate(p.x,p.y-sz+8-bob); if(p.f<0) x.scale(-1,1); x.drawImage(img,-sz/2,0,sz,sz); x.restore();}
    else {x.fillStyle='#b07cff'; x.beginPath(); x.arc(p.x,p.y-30-bob,26,0,7); x.fill();}
    var nm=p.name||'', me=p.id===L.meId; x.font='800 14px system-ui,sans-serif'; var tw=x.measureText(nm).width+18;
    rr(x,p.x-tw/2,p.y+12,tw,22,11); x.fillStyle=me?'rgba(255,122,77,.95)':'rgba(24,20,16,.78)'; x.fill();
    x.fillStyle='#fff'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(nm,p.x,p.y+23);
    var lv=p.prof&&p.prof.lv; if(lv){var lw=26; rr(x,p.x+tw/2-6,p.y+8,lw,16,8); x.fillStyle='#ffd45c'; x.fill(); x.fillStyle='#3a2a0a'; x.font='900 10px system-ui,sans-serif'; x.fillText(lv,p.x+tw/2-6+lw/2,p.y+16.5);}
    if(me&&L.role==='player'){x.fillStyle='#ffd45c'; x.beginPath(); x.moveTo(p.x-8,p.y-sz-8-bob+(Math.sin(t*5)*3)); x.lineTo(p.x+8,p.y-sz-8-bob+(Math.sin(t*5)*3)); x.lineTo(p.x,p.y-sz+4-bob+(Math.sin(t*5)*3)); x.fill();}
    if(p.em&&performance.now()<p.emT){x.font='30px system-ui,sans-serif'; var ey=p.y-sz-18-bob-Math.sin(t*4)*3; rr(x,p.x-24,ey-24,48,40,14); x.fillStyle='rgba(255,255,255,.95)'; x.fill(); x.fillStyle='#222'; x.fillText(p.em,p.x,ey-2);}
    x.restore();
  });
  if(L.role==='player'&&L.target){x.strokeStyle='rgba(255,255,255,.7)'; x.lineWidth=3; x.beginPath(); x.arc(L.target.x,L.target.y,10+Math.sin(t*8)*2,0,7); x.stroke();}
  if(!list.length){x.fillStyle='rgba(20,16,12,.55)'; rr(x,380,330,440,64,18); x.fill(); x.fillStyle='#fff'; x.font='800 20px system-ui,sans-serif'; x.textAlign='center'; x.fillText('Waiting for students to join…',600,362);}
}

/* ---------- mount / unmount ---------- */
L.mount=function(role){
  var slot=$('lvl-slot'); if(!slot) return;
  if(!L.root||L.role!==role||L.code!==S().code){ L.unmount(); L.role=role; L.code=S().code; L.P={}; L.sel=''; L.listOpen=false; L.target=null; build(role); }
  slot.appendChild(L.root); L.sig=''; syncRoster(); updateBar(); renderBanner(); bindSock();
  if(!L.raf) L.raf=requestAnimationFrame(frame);
};
L.unmount=function(){
  if(L.raf){cancelAnimationFrame(L.raf); L.raf=0;}
  unbindSock(); if(L.root&&L.root.parentNode) L.root.parentNode.removeChild(L.root);
  L.root=null; L.cv=null; L.ctx=null; L.code=''; L.keys={}; L.P={};
};
var prev=window.lvAfterRender;
window.lvAfterRender=function(scr){
  if(prev) prev.apply(this,arguments);
  if(scr==='host-lobby') L.mount('host'); else if(scr==='player-wait') L.mount('player'); else if(L.root) L.unmount();
};
var tdn=window.liveTeardown; if(typeof tdn==='function') window.liveTeardown=function(){ L.unmount(); return tdn.apply(this,arguments); };
})();
