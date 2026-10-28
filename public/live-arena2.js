/* Live Game arena modes v2 (Zombie Siege, Gem Heist, Last Stand): canvas renderer with snapshot interpolation,
   local movement prediction, particles/screen-shake, equipped Indexling sprites, HUDs and keyboard/touch controls. */
(function(){
'use strict';
var W=1200, H=700, PR=18, VAULT={x:600,y:350,r:90};
var A = window.LVA = { inst:null, roster:{}, keys:{}, sock:null, timer:null, sprites:{} };
function el(tag,cls,html){ var e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }
function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
function lerp(a,b,t){ return a+(b-a)*t; }
function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
var TAU=Math.PI*2;

/* ---------- sprites (equipped Indexling art rendered to an Image) ---------- */
function sprite(id,skin){
  var key=(id||'')+'|'+(skin||''); var s=A.sprites[key]; if(s) return s.img;
  s=A.sprites[key]={img:new Image()};
  try{
    var l=(typeof cosmeticById==='function'&&id&&cosmeticById(id))||cosmeticById('ling-sugarbug'), sk=(skin&&typeof skinById==='function'&&skinById(skin))||{};
    var html=indexlingArtHtml(l,true,sk), m=html.match(/<svg[\s\S]*<\/svg>/);
    if(m){ var vars={}; html.replace(/(--[\w-]+)\s*:\s*([^;"]+)/g,function(_,k,v){ vars[k]=v.trim(); return _; });
      var svg=m[0].replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g,function(_,k){ return vars[k]||'#b07cff'; }).replace(/<svg\b/,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"');
      s.img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); }
  }catch(e){}
  return s.img;
}
var HUES=['#ff6b6b','#ffa94d','#ffd43b','#69db7c','#38d9a9','#4dabf7','#9775fa','#f783ac'];

/* ---------- scene ---------- */
var HINT={
  zombie:'WASD / arrows move · hold SPACE to fire (auto-aims) · SHIFT to roll · stand next to a downed friend to revive · answer below for ammo',
  gems:'WASD / arrows move · SPACE to dash-tackle · grab ⚡🧲🛡️💣 power-ups · beware 🤖 drones · answer below for dashes',
  elimination:'WASD / arrows move · SPACE or SHIFT to dash through danger (brief invincibility) · grab orbs · answer below for shields'
};
function build(mode,kind){
  var root=el('div','ar2-root ar2-'+mode+' ar2-'+kind);
  root.innerHTML='<div class="ar2-view"><canvas class="ar2-cv"></canvas><div class="ar2-hud"></div>'+(kind==='host'?'<div class="ar2-lb"></div>':'')+'<div class="ar2-banner" style="display:none"></div>'+
    (kind==='me'?'<div class="ar2-ctl"><div class="ar2-joy"><div class="ar2-knob"></div></div><div class="ar2-btns"><button class="ar2-btn ar2-b2" type="button"></button><button class="ar2-btn ar2-b1" type="button"></button></div></div>':'')+'</div>'+
    (kind==='me'?'<p class="ar2-hint">'+HINT[mode]+'</p>':'');
  var cv=root.querySelector('canvas');
  var inst={ root:root, mode:mode, kind:kind, view:root.querySelector('.ar2-view'), cv:cv, g:cv.getContext('2d'), hud:root.querySelector('.ar2-hud'), lb:root.querySelector('.ar2-lb'), banner:root.querySelector('.ar2-banner'),
    buf:[], meN:null, sc:1, camX:0, camY:0, vw:W, vh:H, cw:600, ch:400, dpr:1, parts:[], nums:[], shake:0, obs:[], anId:0, pred:null, lastT:0, input:{mx:0,my:0,act:false,ab:false}, lastSent:'', abLatch:false, lastHp:100, lastLives:3, hudT:0, rings:[], decals:[] };
  root.__ar=inst;
  var b1=root.querySelector('.ar2-b1'), b2=root.querySelector('.ar2-b2');
  if(b1){ b1.textContent={zombie:'FIRE',gems:'DASH',elimination:'DASH'}[mode]; if(mode==='gems'){ b2.style.display='none'; } else { b2.textContent={zombie:'ROLL',elimination:'DASH'}[mode]; } }
  if(kind==='me') wireControls(inst);
  if(window.ResizeObserver){ var ro=new ResizeObserver(function(){ layout(inst); }); ro.observe(root); inst.ro=ro; }
  setTimeout(function(){ layout(inst); },0);
  return root;
}
function layout(inst){
  var cw=inst.root.clientWidth||inst.root.parentNode&&inst.root.parentNode.clientWidth||600; if(!cw) return;
  var dpr=Math.min(2,window.devicePixelRatio||1), w,h;
  if(inst.kind==='host'){ var maxH=Math.max(340,window.innerHeight*0.7); var sc=Math.min(cw/W,maxH/H); w=Math.floor(W*sc); h=Math.floor(H*sc); inst.sc=sc; inst.vw=W; inst.vh=H; }
  else { w=cw; h=Math.round(Math.min(Math.max(250,window.innerHeight*0.46),cw*0.85)); var vw=cw<520?520:(cw<820?680:860); inst.sc=w/vw; inst.vw=vw; inst.vh=h/inst.sc; }
  inst.cw=w; inst.ch=h; inst.dpr=dpr; inst.cv.width=Math.round(w*dpr); inst.cv.height=Math.round(h*dpr); inst.cv.style.width=w+'px'; inst.cv.style.height=h+'px';
  inst.view.style.width=w+'px'; inst.view.style.height=h+'px';
}

/* ---------- snapshots ---------- */
function indexSnap(s){
  s.pm={}; s.p.forEach(function(r){ s.pm[r[0]]=r; });
  if(s.z){ s.zm={}; s.z.forEach(function(r){ s.zm[r[0]]=r; }); }
  if(s.d){ s.dm={}; s.d.forEach(function(r){ s.dm[r[0]]=r; }); }
  if(s.h){ s.hm={}; s.h.forEach(function(r){ s.hm[r[0]]=r; }); }
}
function onSnap(inst,s){
  s.ts=performance.now(); indexSnap(s);
  if(s.ob) inst.obs=s.ob;
  inst.buf.push(s); if(inst.buf.length>5) inst.buf.shift();
  if(inst.kind==='me'&&state.live.me) inst.meN=state.live.me.n;
  if(s.fx) s.fx.forEach(function(f){ doFx(inst,f); });
  if(s.an&&s.an[0]!==inst.anId){ inst.anId=s.an[0]; showAnn(inst,s.an[1],s.an[2]); }
  var me=inst.meN!=null&&s.pm[inst.meN]; if(me){ inst.srv=me; if(!inst.pred||Math.hypot(inst.pred.x-me[1],inst.pred.y-me[2])>140) inst.pred={x:me[1],y:me[2]}; }
  // permanent ground marks for explosions are added in doFx
  var now=performance.now(); if(now-inst.hudT>90){ inst.hudT=now; updateHud(inst,s,me); }
}
function showAnn(inst,t,sub){
  inst.annT={t:t,sub:sub,at:performance.now()};
  if(inst.mode==='zombie'&&/^WAVE|BOSS/.test(t)) inst.shake=Math.max(inst.shake,6);
}
/* returns {a,b,t} two bracketing snapshots for time T */
function bracket(inst,T){
  var b=inst.buf; if(!b.length) return null; if(b.length===1) return {a:b[0],b:b[0],t:0};
  for(var i=b.length-1;i>0;i--){ if(b[i-1].ts<=T){ var s0=b[i-1], s1=b[i]; var d=s1.ts-s0.ts||1; return {a:s0,b:s1,t:clamp((T-s0.ts)/d,0,1)}; } }
  return {a:b[0],b:b[0],t:0};
}

/* ---------- fx ---------- */
function burst(inst,x,y,n,col,spd,life,size,grav){ for(var i=0;i<n&&inst.parts.length<420;i++){ var a=Math.random()*TAU, v=spd*(0.3+Math.random()*0.9); inst.parts.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:life*(0.6+Math.random()*0.6),max:life,c:col,s:size*(0.6+Math.random()*0.8),g:grav||0}); } }
function num(inst,x,y,txt,col,big){ if(inst.nums.length<40) inst.nums.push({x:x,y:y,t:txt,c:col,life:0.9,big:big}); }
function ring(inst,x,y,r,col,life){ inst.rings.push({x:x,y:y,r:r,c:col,life:life||0.5,max:life||0.5}); }
function nearMe(inst,x,y){ if(!inst.pred) return true; return Math.hypot(inst.pred.x-x,inst.pred.y-y)<700; }
function doFx(inst,f){
  var k=f[0],x=f[1],y=f[2],v=f[3], m=inst.mode;
  if(k===0){ burst(inst,x,y,26,'#ffb347',260,0.7,5); burst(inst,x,y,10,'#fff3b0',140,0.4,4); ring(inst,x,y,v||90,'#ffb347',0.45); inst.decals.push({x:x,y:y,r:(v||90)*0.45,c:'rgba(0,0,0,.35)'}); if(nearMe(inst,x,y)) inst.shake=Math.max(inst.shake,9); }
  else if(k===1){ for(var i=0;i<14;i++){ var xx=Math.random()*W, yy=Math.random()*H; (function(xx,yy,d){ setTimeout(function(){ burst(inst,xx,yy,14,'#ff9340',220,0.6,5); ring(inst,xx,yy,70,'#ffd27a',0.4); },d); })(xx,yy,i*45); } inst.flashT=0.35; inst.shake=Math.max(inst.shake,nearMe(inst,x,y)?12:0); }
  else if(k===2){ num(inst,x,y,v<0?String(v):'+'+v,v<0?'#ff6b6b':'#fff',v<0); if(v<0&&inst.meN!=null&&inst.pred&&Math.hypot(inst.pred.x-x,inst.pred.y-y+24)<30){ flash(inst); inst.shake=Math.max(inst.shake,8); } }
  else if(k===3){ var cols=['#7ad06a','#d8f060','#4a7a3a','#b57cff','#ff9340','#ff4d6d'],c=v===9?'#ff6b6b':cols[v]||'#7ad06a'; burst(inst,x,y,v===5?40:12,c,v===5?320:170,0.55,v===5?7:4,40); if(v!==9) inst.decals.push({x:x,y:y,r:v===5?34:12,c:'rgba(90,20,30,.28)'}); if(v===5) inst.shake=18; }
  else if(k===4){ var pc=m==='gems'&&v===9?'#7ee8ff':'#ffe27a'; burst(inst,x,y,10,pc,150,0.5,3.5); ring(inst,x,y,30,pc,0.35); }
  else if(k===5){ ring(inst,x,y,46,'#6dffa0',0.6); burst(inst,x,y,14,'#6dffa0',140,0.7,4); }
  else if(k===7){ num(inst,x,y-24,'+'+v,'#ffd84a',true); burst(inst,x,y,16,'#ffd84a',200,0.7,4); ring(inst,VAULT.x,VAULT.y,VAULT.r,'#ffd84a',0.6); }
  else if(k===8){ num(inst,x,y-24,'-'+v+' 💎','#ff6b6b',true); burst(inst,x,y,12,'#c084fc',200,0.5,4); inst.shake=Math.max(inst.shake,6); }
  else if(k===9){ burst(inst,x,y,v?22:6,'#ff7a3a',250,0.6,5); if(v){ ring(inst,x,y,v,'#ffb347',0.4); inst.decals.push({x:x,y:y,r:v*0.6,c:'rgba(0,0,0,.32)'}); } if(nearMe(inst,x,y)) inst.shake=Math.max(inst.shake,7); }
  else if(k===12){ burst(inst,x,y,8,'#ffffff',90,0.35,3); }
  else if(k===13){ burst(inst,x,y,3,'#ffd27a',80,0.25,2); }
  else if(k===14){ burst(inst,x,y,40,'#7ee8ff',300,0.9,5); ring(inst,x,y,240,'#7ee8ff',0.7); inst.shake=8; }
  if(inst.decals.length>40) inst.decals.shift();
}
function flash(inst){ inst.hurtT=0.45; }

/* ---------- local prediction (own player) ---------- */
function pushOut(x,y,r,obs){
  for(var i=0;i<obs.length;i++){ var o=obs[i]; var cx=clamp(x,o[0],o[0]+o[2]), cy=clamp(y,o[1],o[1]+o[3]); var dx=x-cx, dy=y-cy, d2=dx*dx+dy*dy; if(d2>=r*r) continue;
    if(d2<0.0001){ var l=x-o[0], rr=o[0]+o[2]-x, t=y-o[1], b=o[1]+o[3]-y, mm=Math.min(l,rr,t,b); if(mm===l) x=o[0]-r; else if(mm===rr) x=o[0]+o[2]+r; else if(mm===t) y=o[1]-r; else y=o[1]+o[3]+r; }
    else { var d=Math.sqrt(d2); x=cx+dx/d*r; y=cy+dy/d*r; } }
  return [x,y];
}
function predict(inst,dt,T){
  var me=inst.srv; if(!me||!inst.pred) return;
  var fl=me[6], p=inst.pred;
  var blocked=(fl&(1|4|8|16));
  var inp=readInput(inst), len=Math.hypot(inp.mx,inp.my);
  if(blocked||!document.hasFocus||false){ p.x=lerp(p.x,me[1],Math.min(1,dt*18)); p.y=lerp(p.y,me[2],Math.min(1,dt*18)); return; }
  var sp=215; if(inst.mode==='gems'){ sp*=clamp(1-me[4]*0.012,0.7,1); if(me[9]===2) sp*=1.4; } if(inst.mode==='elimination'&&me[9]===3) sp*=1.35;
  var mx=inp.mx,my=inp.my; if(len>1){ mx/=len; my/=len; }
  var nx=clamp(p.x+mx*sp*dt,PR,W-PR), ny=clamp(p.y+my*sp*dt,PR,H-PR); var o=pushOut(nx,ny,PR,inst.obs); p.x=clamp(o[0],PR,W-PR); p.y=clamp(o[1],PR,H-PR);
  var e=Math.hypot(p.x-me[1],p.y-me[2]);
  if(e>120){ p.x=me[1]; p.y=me[2]; }
  else { var k=Math.min(1,dt*(len>0.1?3.2:9)); p.x+=(me[1]-p.x)*k; p.y+=(me[2]-p.y)*k; }
}

/* ---------- frame ---------- */
var last=0;
function frame(ts){
  requestAnimationFrame(frame);
  var inst=A.inst; if(!inst||!inst.root.isConnected||!inst.cw) { last=ts; return; }
  var dt=Math.min(0.05,(ts-last)/1000||0.016); last=ts;
  var now=performance.now(), br=bracket(inst,now-105); if(!br){ drawEmpty(inst); return; }
  if(inst.kind==='me') predict(inst,dt,now);
  render(inst,br,dt,now);
}
function interpRow(a,b,t){ if(!a) return b; return [b[0],lerp(a[1],b[1],t),lerp(a[2],b[2],t)].concat(b.slice(3)); }
function camera(inst,dt){
  var vw=inst.vw, vh=inst.vh;
  if(inst.kind==='host'){ inst.camX=0; inst.camY=0; return; }
  var tx=inst.pred?inst.pred.x:W/2, ty=inst.pred?inst.pred.y:H/2;
  var off=vh*0.14, cx=vw>=W?W/2:clamp(tx,vw/2-40,W-vw/2+40), cy=vh>=H?H/2+off*0.6:clamp(ty+off,vh/2-40,H-vh/2+off+60);
  if(!inst.camInit){ inst.camX=cx; inst.camY=cy; inst.camInit=true; } else { var k=Math.min(1,dt*8); inst.camX+=(cx-inst.camX)*k; inst.camY+=(cy-inst.camY)*k; }
}
function render(inst,br,dt,now){
  var g=inst.g, mode=inst.mode, a=br.a, b=br.b, t=br.t, sc=inst.sc, dpr=inst.dpr; camera(inst,dt);
  inst.shake*=Math.pow(0.0008,dt); if(inst.shake<0.3) inst.shake=0;
  var sx=(Math.random()-0.5)*inst.shake, sy=(Math.random()-0.5)*inst.shake;
  var tx=inst.kind==='host'?0:(inst.vw>=W?(inst.cw-W*sc)/2:-(inst.camX-inst.vw/2)*sc), ty=inst.kind==='host'?0:(inst.vh>=H?(inst.ch-H*sc)/2:-(inst.camY-inst.vh/2)*sc);
  g.setTransform(1,0,0,1,0,0); g.fillStyle='#07070d'; g.fillRect(0,0,inst.cv.width,inst.cv.height);
  g.setTransform(dpr*sc,0,0,dpr*sc,(tx+sx)*dpr,(ty+sy)*dpr);
  var T=now/1000;
  drawFloor(inst,g,T);
  // decals
  inst.decals.forEach(function(d){ g.fillStyle=d.c; g.beginPath(); g.ellipse(d.x,d.y,d.r,d.r*0.7,0,0,TAU); g.fill(); });
  drawObstacles(inst,g);
  if(mode==='zombie') drawZombieWorld(inst,g,a,b,t,T,dt);
  else if(mode==='gems') drawGemsWorld(inst,g,a,b,t,T,dt);
  else drawElimWorld(inst,g,a,b,t,T,dt);
  // rings + particles + numbers
  inst.rings=inst.rings.filter(function(r){ r.life-=dt; return r.life>0; });
  inst.rings.forEach(function(r){ var f=1-r.life/r.max; g.strokeStyle=r.c; g.globalAlpha=1-f; g.lineWidth=5*(1-f)+1; g.beginPath(); g.arc(r.x,r.y,r.r*(0.25+0.75*f),0,TAU); g.stroke(); }); g.globalAlpha=1;
  inst.parts=inst.parts.filter(function(p){ p.life-=dt; if(p.life<=0) return false; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=Math.pow(0.05,dt); p.vy=p.vy*Math.pow(0.05,dt)+p.g*dt; var f=p.life/p.max; g.globalAlpha=Math.min(1,f*1.4); g.fillStyle=p.c; g.beginPath(); g.arc(p.x,p.y,p.s*(0.4+f*0.6),0,TAU); g.fill(); return true; }); g.globalAlpha=1;
  g.textAlign='center'; inst.nums=inst.nums.filter(function(n){ n.life-=dt; if(n.life<=0) return false; n.y-=34*dt; g.globalAlpha=Math.min(1,n.life*2.2); g.font='800 '+(n.big?22:15)+'px system-ui,sans-serif'; g.lineWidth=4; g.strokeStyle='rgba(0,0,0,.7)'; g.strokeText(n.t,n.x,n.y); g.fillStyle=n.c; g.fillText(n.t,n.x,n.y); return true; }); g.globalAlpha=1;
  // vignette (screen space)
  g.setTransform(1,0,0,1,0,0); if(inst.flashT>0){ g.fillStyle='rgba(255,240,200,'+Math.min(0.45,inst.flashT)+')'; g.fillRect(0,0,inst.cv.width,inst.cv.height); inst.flashT-=dt; } var cw=inst.cv.width,ch=inst.cv.height; var vg=g.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*0.35,cw/2,ch/2,Math.max(cw,ch)*0.75); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.5)'); g.fillStyle=vg; g.fillRect(0,0,cw,ch);
  if(inst.hurtT>0){ var hv=g.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*0.3,cw/2,ch/2,Math.max(cw,ch)*0.7); hv.addColorStop(0,'rgba(255,30,30,0)'); hv.addColorStop(1,'rgba(255,30,30,'+(inst.hurtT/0.45*0.7)+')'); g.fillStyle=hv; g.fillRect(0,0,cw,ch); inst.hurtT-=dt; }
  if(inst.annT){ var el=(now-inst.annT.at)/1000, D=3.2; if(el<D){ var al=el<0.15?el/0.15:(el>D-0.7?(D-el)/0.7:1), sc2=1+Math.max(0,0.18-el)*3, d=inst.dpr, fs=Math.min(cw/d/9,52)*d; g.save(); g.globalAlpha=al; g.translate(cw/2,ch*0.36); g.scale(sc2,sc2); g.textAlign='center'; g.font='900 '+fs+'px system-ui,sans-serif'; g.lineJoin='round'; g.lineWidth=fs*0.18; g.strokeStyle='rgba(0,0,0,.75)'; g.strokeText(inst.annT.t,0,0); g.shadowColor='rgba(255,90,60,.9)'; g.shadowBlur=24*d; g.fillStyle='#fff'; g.fillText(inst.annT.t,0,0); g.shadowBlur=0; g.font='700 '+(fs*0.34)+'px system-ui,sans-serif'; g.lineWidth=fs*0.08; g.strokeText(inst.annT.sub,0,fs*0.6); g.fillText(inst.annT.sub,0,fs*0.6); g.restore(); } }
  if(mode==='zombie') drawBossBar(inst,g,b);
}
function drawEmpty(inst){ var g=inst.g; g.setTransform(1,0,0,1,0,0); g.fillStyle='#0b0b14'; g.fillRect(0,0,inst.cv.width,inst.cv.height); g.fillStyle='#fff'; g.font=(16*inst.dpr)+'px system-ui'; g.textAlign='center'; g.fillText('Connecting to the arena…',inst.cv.width/2,inst.cv.height/2); }

/* ---------- world drawing helpers ---------- */
var FLOOR={zombie:['#1d211c','#262c24','#3a4a32'],gems:['#17142b','#1f1b3d','#3d3478'],elimination:['#1a1013','#241418','#5a2830']};
function drawFloor(inst,g,T){
  var c=FLOOR[inst.mode]; var gr=g.createRadialGradient(W/2,H/2,60,W/2,H/2,760); gr.addColorStop(0,c[1]); gr.addColorStop(1,c[0]); g.fillStyle=gr; g.fillRect(0,0,W,H);
  g.strokeStyle='rgba(255,255,255,.045)'; g.lineWidth=1; g.beginPath(); for(var x=0;x<=W;x+=60){ g.moveTo(x,0); g.lineTo(x,H); } for(var y=0;y<=H;y+=60){ g.moveTo(0,y); g.lineTo(W,y); } g.stroke();
  if(inst.mode==='zombie'){ g.fillStyle='rgba(255,255,255,.03)'; for(var i=0;i<30;i++){ g.fillRect((i*197)%W,(i*263)%H,34,3); } }
  if(inst.mode==='elimination'){ g.strokeStyle='rgba(255,80,60,.10)'; g.lineWidth=3; g.beginPath(); g.arc(W/2,H/2,300,0,TAU); g.arc(W/2,H/2,180,0,TAU); g.stroke(); }
  g.strokeStyle=c[2]; g.lineWidth=6; g.strokeRect(3,3,W-6,H-6);
  g.strokeStyle='rgba(255,255,255,.12)'; g.lineWidth=1; g.strokeRect(10,10,W-20,H-20);
}
function drawObstacles(inst,g){
  inst.obs.forEach(function(o){
    g.fillStyle='rgba(0,0,0,.4)'; g.fillRect(o[0]+6,o[1]+8,o[2],o[3]);
    var gr=g.createLinearGradient(0,o[1],0,o[1]+o[3]); if(inst.mode==='gems'){ gr.addColorStop(0,'#4a3f94'); gr.addColorStop(1,'#2b2460'); } else { gr.addColorStop(0,'#6b5a3a'); gr.addColorStop(1,'#43371f'); }
    g.fillStyle=gr; g.fillRect(o[0],o[1],o[2],o[3]);
    g.strokeStyle=inst.mode==='gems'?'#8f80ff':'#a38a55'; g.lineWidth=2; g.strokeRect(o[0]+1,o[1]+1,o[2]-2,o[3]-2);
    if(inst.mode==='zombie'&&o[2]>=50&&o[3]>=50){ g.beginPath(); g.moveTo(o[0],o[1]); g.lineTo(o[0]+o[2],o[1]+o[3]); g.moveTo(o[0]+o[2],o[1]); g.lineTo(o[0],o[1]+o[3]); g.stroke(); }
  });
}
function drawShadow(g,x,y,r){ g.fillStyle='rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x,y+r*0.75,r*0.9,r*0.38,0,0,TAU); g.fill(); }
function glow(g,x,y,r,col,al){ var gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,col); gr.addColorStop(1,'rgba(0,0,0,0)'); g.globalAlpha=al; g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,TAU); g.fill(); g.globalAlpha=1; }
function rosterOf(n){ return A.roster[n]||{name:'Player',ling:'',skin:''}; }

function drawPlayers(inst,g,a,b,t,T,list){
  var meN=inst.meN, mode=inst.mode, rows=[];
  b.p.forEach(function(r){ var ra=a.pm[r[0]]; var row=interpRow(ra,r,t);
    if(r[0]===meN&&inst.pred&&!(r[6]&(1|4|8|16))){ row[1]=inst.pred.x; row[2]=inst.pred.y; }
    else if(r[0]===meN&&inst.pred){ row[1]=inst.pred.x; row[2]=inst.pred.y; }
    rows.push(row); });
  rows.sort(function(p,q){ return p[2]-q[2]; });
  rows.forEach(function(r){ list.push({y:r[2],f:function(){ drawPlayer(inst,g,r,T); }}); });
}
function drawPlayer(inst,g,r,T){
  var n=r[0], x=r[1], y=r[2], ang=r[3], fl=r[6], mode=inst.mode, ro=rosterOf(n), me=n===inst.meN; var dead=!!(fl&8), down=!!(fl&1);
  var S=me?58:52; var img=sprite(ro.ling,ro.skin);
  if(dead){ g.globalAlpha=0.25; }
  drawShadow(g,x,y,18);
  if((fl&32)&&!dead){ glow(g,x,y,40,mode==='elimination'?'#6dd3ff':'#9ae6ff',0.55); g.strokeStyle='rgba(120,220,255,.8)'; g.lineWidth=2.5; g.beginPath(); g.arc(x,y,31+Math.sin(T*6)*1.5,0,TAU); g.stroke(); }
  if(fl&4){ g.globalAlpha*=0.35; var dx=Math.cos(ang),dy=Math.sin(ang); for(var i=1;i<=3;i++) drawImg(g,img,x-dx*i*20,y-dy*i*20,S*(1-i*0.08),Math.cos(ang)<-0.15); g.globalAlpha=dead?0.25:1; }
  var blink=(fl&2)&&!(fl&32)&&Math.floor(T*14)%2===0;
  if(!blink){ g.save(); if(down){ g.translate(x,y+6); g.rotate(1.35); g.translate(-x,-(y+6)); g.globalAlpha*=0.6; } drawImg(g,img,x,y-4+(fl&16?Math.sin(T*40)*2:0),S,Math.cos(ang)<-0.15); g.restore(); }
  if(mode==='zombie'&&!down&&!dead){ g.save(); g.translate(x,y+6); g.rotate(ang); g.fillStyle='#222'; g.fillRect(16,-3,20,6); g.fillStyle='#8a8f9c'; g.fillRect(30,-2,8,4); g.restore(); if(r[9]===1||r[9]===2){ g.fillStyle=r[9]===1?'#ffe27a':'#ff9340'; g.font='700 12px system-ui'; g.textAlign='center'; g.fillText(r[9]===1?'⚡':'🎯',x,y-S*0.65-14); } }
  if(down){ var prog=r[8]/100; g.strokeStyle='rgba(0,0,0,.6)'; g.lineWidth=6; g.beginPath(); g.arc(x,y-S*0.9,16,0,TAU); g.stroke(); g.strokeStyle='#6dffa0'; g.lineWidth=5; g.beginPath(); g.arc(x,y-S*0.9,16,-Math.PI/2,-Math.PI/2+TAU*prog); g.stroke(); g.font='14px system-ui'; g.textAlign='center'; g.fillStyle='#fff'; g.fillText('🩹',x,y-S*0.9+5); }
  if(!dead){
    g.font='700 12px system-ui,sans-serif'; g.textAlign='center'; var nm=ro.name+(me?' (you)':''); g.lineWidth=3; g.strokeStyle='rgba(0,0,0,.75)'; g.strokeText(nm,x,y-S*0.62-4); g.fillStyle=me?'#ffe27a':'#fff'; g.fillText(nm,x,y-S*0.62-4);
    if(mode==='zombie'&&!down){ g.fillStyle='rgba(0,0,0,.6)'; g.fillRect(x-20,y+S*0.5,40,5); g.fillStyle=r[4]<35?'#ff5a5a':'#5ee06a'; g.fillRect(x-20,y+S*0.5,40*clamp(r[4]/100,0,1),5); }
    if(mode==='gems'&&r[4]>0){ g.font='800 13px system-ui'; g.lineWidth=3; g.strokeStyle='rgba(0,0,0,.8)'; var tx='💎 '+r[4]; g.strokeText(tx,x,y+S*0.62+10); g.fillStyle='#9ef0ff'; g.fillText(tx,x,y+S*0.62+10); }
    if(mode==='gems'&&r[9]>0){ g.font='14px system-ui'; g.fillText(['🧲','⚡','🛡️'][r[9]-1]||'',x+S*0.5,y-S*0.3); }
    if(mode==='elimination'){ g.font='12px system-ui'; var hs=(r[4]>0?'❤'.repeat(r[4]):'')+(r[5]>0?'🛡'.repeat(r[5]):''); g.fillText(hs,x,y+S*0.62+10); if(r[9]===3){ g.fillText('⚡',x+S*0.5,y-S*0.3); } }
  }
  g.globalAlpha=1;
}
function drawImg(g,img,x,y,S,flip){
  if(!img||!img.complete||!img.naturalWidth){ g.fillStyle='#b07cff'; g.beginPath(); g.arc(x,y,S*0.38,0,TAU); g.fill(); return; }
  if(flip){ g.save(); g.translate(x,0); g.scale(-1,1); g.drawImage(img,-S/2,y-S/2,S,S); g.restore(); } else g.drawImage(img,x-S/2,y-S/2,S,S);
}

/* ---------- Zombie Siege ---------- */
var ZCOL=[['#6aa55a','#3f6b36'],['#c9d65a','#7f8a2a'],['#47703c','#24401f'],['#b58cf0','#6a3fb0'],['#ff9340','#b84a10'],['#d84a6a','#6e1630']];
var ZR=[16,14,25,15,16,42];
var PKI=[['📦','AMMO'],['💊','MEDKIT'],['⚡','RAPID'],['🎯','SHOTGUN'],['🛡️','SHIELD'],['☢️','NUKE']];
function drawZombie(g,z,T,tgx,tgy){
  var type=z[3],x=z[1],y=z[2],R=ZR[type],c=ZCOL[type],wob=Math.sin(T*9+z[0])*(type===1?2.5:1.6);
  drawShadow(g,x,y,R);
  if(z[6]&1){ g.fillStyle='rgba(255,60,60,.25)'; g.beginPath(); g.arc(x,y,R+30+Math.sin(T*30)*4,0,TAU); g.fill(); }
  if(type===4){ glow(g,x,y,R*2.6,'rgba(255,140,40,.8)',0.35+0.3*Math.sin(T*10+z[0])); }
  if(type===5){ glow(g,x,y,R*2.2,'rgba(255,40,90,.7)',0.35); }
  var bx=x, by=y+wob*0.5;
  var gr=g.createRadialGradient(bx-R*0.3,by-R*0.4,R*0.2,bx,by,R*1.1); gr.addColorStop(0,(z[6]&4)?'#fff':c[0]); gr.addColorStop(1,(z[6]&4)?'#ddd':c[1]);
  g.fillStyle=gr; g.beginPath(); g.ellipse(bx,by,R,R*(1+wob*0.02),0,0,TAU); g.fill(); g.strokeStyle='rgba(0,0,0,.45)'; g.lineWidth=2; g.stroke();
  // arms
  var ang=Math.atan2(tgy-y,tgx-x); g.strokeStyle=c[1]; g.lineWidth=Math.max(4,R*0.28); g.lineCap='round'; var sw=Math.sin(T*8+z[0])*0.25;
  [-1,1].forEach(function(s){ var aa=ang+s*(0.55+sw*s); g.beginPath(); g.moveTo(bx+Math.cos(ang+s*1.2)*R*0.7,by+Math.sin(ang+s*1.2)*R*0.7); g.lineTo(bx+Math.cos(aa)*(R+R*0.55),by+Math.sin(aa)*(R+R*0.55)); g.stroke(); });
  // eyes
  var ex=Math.cos(ang)*R*0.28, ey=Math.sin(ang)*R*0.28, px=-Math.sin(ang)*R*0.3, py=Math.cos(ang)*R*0.3;
  [-1,1].forEach(function(s){ g.fillStyle='#fff'; g.beginPath(); g.arc(bx+ex+px*s,by+ey+py*s,R*0.2,0,TAU); g.fill(); g.fillStyle=type===5?'#ff1f4b':'#c01020'; g.beginPath(); g.arc(bx+ex*1.5+px*s,by+ey*1.5+py*s,R*0.1,0,TAU); g.fill(); });
  if(type===3){ g.fillStyle='rgba(160,255,90,.9)'; g.beginPath(); g.arc(bx+Math.cos(ang)*R*0.8,by+Math.sin(ang)*R*0.8,R*0.22,0,TAU); g.fill(); }
  if(type===5){ g.fillStyle='#ffd84a'; g.beginPath(); var cy=by-R-6; g.moveTo(bx-18,cy+10); g.lineTo(bx-18,cy-8); g.lineTo(bx-9,cy+2); g.lineTo(bx,cy-12); g.lineTo(bx+9,cy+2); g.lineTo(bx+18,cy-8); g.lineTo(bx+18,cy+10); g.closePath(); g.fill(); }
  if(type===2||type===5){ var w=R*1.6; g.fillStyle='rgba(0,0,0,.6)'; g.fillRect(x-w/2,y-R-16,w,5); g.fillStyle=type===5?'#ff4d6d':'#ffb347'; g.fillRect(x-w/2,y-R-16,w*clamp(z[4]/z[5],0,1),5); }
}
function drawZombieWorld(inst,g,a,b,t,T,dt){
  var list=[];
  // acid
  (b.ac||[]).forEach(function(ac){ g.globalAlpha=clamp(ac[3]/1.2,0.2,0.7); var gr=g.createRadialGradient(ac[0],ac[1],0,ac[0],ac[1],ac[2]); gr.addColorStop(0,'rgba(150,255,60,.9)'); gr.addColorStop(1,'rgba(60,160,20,.35)'); g.fillStyle=gr; g.beginPath(); g.arc(ac[0],ac[1],ac[2]*(0.9+0.06*Math.sin(T*6)),0,TAU); g.fill(); g.globalAlpha=1; });
  // pickups
  (b.pk||[]).forEach(function(k){ var by=Math.sin(T*3+k[0])*3; glow(g,k[1],k[2],34,'rgba(255,230,120,.9)',0.55); g.fillStyle='rgba(20,20,30,.8)'; g.beginPath(); g.arc(k[1],k[2]+by,15,0,TAU); g.fill(); g.strokeStyle=k[4]<4?'#ff6b6b':'#ffe27a'; g.lineWidth=2; g.stroke(); g.font='17px system-ui'; g.textAlign='center'; g.fillStyle='#fff'; g.fillText(PKI[k[3]][0],k[1],k[2]+by+6); g.font='700 9px system-ui'; g.fillStyle='#ffe27a'; g.fillText(PKI[k[3]][1],k[1],k[2]+by+28); });
  // barrels
  (b.br||[]).forEach(function(br){ drawShadow(g,br[1],br[2],14); g.fillStyle='#b8321f'; g.fillRect(br[1]-13,br[2]-16,26,32); g.fillStyle='#e8c14a'; g.fillRect(br[1]-13,br[2]-7,26,5); g.fillRect(br[1]-13,br[2]+5,26,5); g.fillStyle='#fff'; g.font='700 11px system-ui'; g.textAlign='center'; g.fillText('☢',br[1],br[2]-9); if(br[3]<3){ g.strokeStyle='rgba(0,0,0,.7)'; g.lineWidth=1.5; g.beginPath(); g.moveTo(br[1]-8,br[2]-14); g.lineTo(br[1]+2,br[2]-4); g.stroke(); } });
  // zombies (interpolated)
  var tgx=inst.pred?inst.pred.x:W/2, tgy=inst.pred?inst.pred.y:H/2;
  b.z.forEach(function(r){ var ra=a.zm&&a.zm[r[0]]; var row=ra?[r[0],lerp(ra[1],r[1],t),lerp(ra[2],r[2],t),r[3],r[4],r[5],r[6]]:r; var tp=nearestPlayerPos(b,row[1],row[2]); list.push({y:row[2],f:function(){ drawZombie(g,row,T,tp[0],tp[1]); }}); });
  drawPlayers(inst,g,a,b,t,T,list);
  list.sort(function(p,q){ return p.y-q.y; }).forEach(function(o){ o.f(); });
  // bullets (extrapolated from newest snapshot)
  var el=clamp((performance.now()-b.ts)/1000,0,0.15);
  (b.b||[]).forEach(function(bl){ var x=bl[0]+bl[3]*el, y=bl[1]+bl[4]*el;
    if(bl[2]===1){ glow(g,x,y,14,'rgba(150,255,60,.9)',0.8); g.fillStyle='#c6ff6a'; g.beginPath(); g.arc(x,y,6,0,TAU); g.fill(); }
    else { var L=Math.hypot(bl[3],bl[4])||1; g.strokeStyle='rgba(255,230,140,.9)'; g.lineWidth=3; g.lineCap='round'; g.beginPath(); g.moveTo(x,y); g.lineTo(x-bl[3]/L*16,y-bl[4]/L*16); g.stroke(); g.fillStyle='#fff'; g.beginPath(); g.arc(x,y,2.5,0,TAU); g.fill(); } });
}
function nearestPlayerPos(b,x,y){ var bd=1e12,bx=x,by=y; b.p.forEach(function(r){ if(r[6]&(1|8)) return; var d=(r[1]-x)*(r[1]-x)+(r[2]-y)*(r[2]-y); if(d<bd){ bd=d; bx=r[1]; by=r[2]; } }); return [bx,by]; }
function drawBossBar(inst,g,b){
  var boss=(b.z||[]).filter(function(z){ return z[3]===5; })[0]; if(!boss) return; var cw=inst.cv.width, d=inst.dpr, w=Math.min(cw*0.7,520*d), x=(cw-w)/2, y=16*d;
  g.fillStyle='rgba(0,0,0,.65)'; g.fillRect(x-3*d,y-3*d,w+6*d,16*d); g.fillStyle='#ff4d6d'; g.fillRect(x,y,w*clamp(boss[4]/boss[5],0,1),10*d); g.fillStyle='#fff'; g.font='800 '+(11*d)+'px system-ui'; g.textAlign='center'; g.fillText('👑 BOSS',cw/2,y+8.5*d);
}

/* ---------- Gem Heist ---------- */
var GPK=[['🧲','MAGNET'],['⚡','SPEED'],['🛡️','SHIELD'],['💣','BOMB']];
function drawGem(g,x,y,v,T,id){
  var s=v>=8?13:v>=3?10:7.5, c=v>=8?['#fff1a8','#ffb400']:v>=3?['#ffb3ff','#c24cff']:['#bff6ff','#27c6ee']; var by=Math.sin(T*3+id)*2;
  glow(g,x,y+by,s*2.6,c[0],0.45); g.fillStyle='rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x,y+s+4,s*0.8,3,0,0,TAU); g.fill();
  var gr=g.createLinearGradient(x-s,y-s,x+s,y+s); gr.addColorStop(0,c[0]); gr.addColorStop(1,c[1]); g.fillStyle=gr; g.beginPath(); g.moveTo(x,y+by-s*1.15); g.lineTo(x+s,y+by); g.lineTo(x,y+by+s*1.15); g.lineTo(x-s,y+by); g.closePath(); g.fill(); g.strokeStyle='rgba(255,255,255,.8)'; g.lineWidth=1.2; g.stroke();
  g.fillStyle='rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(x-s*0.2,y+by-s*0.9); g.lineTo(x+s*0.35,y+by-s*0.1); g.lineTo(x-s*0.1,y+by-s*0.05); g.closePath(); g.fill();
}
function drawDrone(g,d,T){
  var x=d[1],y=d[2],st=d[3];
  if(st===1){ g.strokeStyle='rgba(255,70,90,.25)'; g.setLineDash([6,8]); g.lineWidth=2; g.beginPath(); g.arc(x,y,60+Math.sin(T*8)*4,0,TAU); g.stroke(); g.setLineDash([]); }
  drawShadow(g,x,y+10,16); var by=y+Math.sin(T*4+d[0])*2;
  g.save(); g.translate(x,by); g.fillStyle='#4b5063'; g.beginPath(); g.arc(0,0,17,0,TAU); g.fill(); g.strokeStyle='#9aa3c0'; g.lineWidth=2.5; g.stroke();
  g.rotate(T*(st===2?1:14)); g.strokeStyle='rgba(200,210,240,.8)'; g.lineWidth=3; g.lineCap='round'; for(var i=0;i<3;i++){ g.rotate(TAU/3); g.beginPath(); g.moveTo(14,0); g.lineTo(27,0); g.stroke(); }
  g.rotate(-T*(st===2?1:14)-0); g.restore();
  g.fillStyle=st===2?'#888':(st===1?'#ff3355':'#ffb347'); g.beginPath(); g.arc(x,by,6,0,TAU); g.fill(); if(st===2){ g.font='12px system-ui'; g.textAlign='center'; g.fillText('💫',x,by-22); }
}
function drawGemsWorld(inst,g,a,b,t,T,dt){
  var fin=b.ev&&b.ev[1]===2, rush=b.ev&&b.ev[0]>0;
  // vault
  var vx=VAULT.x, vy=VAULT.y, vr=VAULT.r;
  glow(g,vx,vy,vr*1.9,fin?'rgba(255,200,60,.9)':'rgba(255,214,90,.8)',0.32+0.12*Math.sin(T*3));
  g.fillStyle='rgba(255,214,90,.10)'; g.beginPath(); g.arc(vx,vy,vr,0,TAU); g.fill();
  g.strokeStyle=fin?'#ffe27a':'rgba(255,214,90,.8)'; g.lineWidth=4; g.setLineDash([16,10]); g.lineDashOffset=-T*30; g.beginPath(); g.arc(vx,vy,vr,0,TAU); g.stroke(); g.setLineDash([]);
  g.font='800 22px system-ui'; g.textAlign='center'; g.fillStyle='rgba(255,226,122,.9)'; g.fillText(fin?'VAULT ×2':'VAULT',vx,vy+7);
  if(rush){ var f=1-b.ev[0]/3; g.strokeStyle='rgba(126,232,255,.9)'; g.lineWidth=3; g.beginPath(); g.arc(vx,vy,vr+30+f*160,0,TAU); g.stroke(); g.fillStyle='rgba(126,232,255,.9)'; g.font='800 20px system-ui'; g.fillText('GEM RUSH!',vx,vy-vr-36); }
  b.g.forEach(function(r){ drawGem(g,r[1],r[2],r[3],T,r[0]); });
  (b.pk||[]).forEach(function(k){ var by=Math.sin(T*3+k[0])*3; glow(g,k[1],k[2],38,'rgba(160,140,255,.9)',0.6); g.fillStyle='rgba(20,16,50,.85)'; g.beginPath(); g.arc(k[1],k[2]+by,16,0,TAU); g.fill(); g.strokeStyle=k[4]<5?'#ff6b6b':'#b9a8ff'; g.lineWidth=2.5; g.stroke(); g.font='18px system-ui'; g.textAlign='center'; g.fillStyle='#fff'; g.fillText(GPK[k[3]][0],k[1],k[2]+by+6); g.font='700 9px system-ui'; g.fillStyle='#d6ccff'; g.fillText(GPK[k[3]][1],k[1],k[2]+by+30); });
  var list=[];
  b.d.forEach(function(r){ var ra=a.dm&&a.dm[r[0]]; var row=ra?[r[0],lerp(ra[1],r[1],t),lerp(ra[2],r[2],t),r[3]]:r; list.push({y:row[2],f:function(){ drawDrone(g,row,T); }}); });
  drawPlayers(inst,g,a,b,t,T,list);
  list.sort(function(p,q){ return p.y-q.y; }).forEach(function(o){ o.f(); });
}

/* ---------- Last Stand ---------- */
var EPK=[['🛡️','SHIELD','#6dd3ff'],['❤️','HEART','#ff6b8a'],['⚡','SPEED','#ffe27a']];
function drawHazard(inst,g,h,T,top){
  var k=h[1],x=h[2],y=h[3],r=h[4],boom=h[5]===1,f=h[6];
  if(k===0){
    if(!top){ if(!boom){ g.fillStyle='rgba(255,60,40,'+(0.10+f*0.16)+')'; g.beginPath(); g.arc(x,y,r,0,TAU); g.fill(); g.fillStyle='rgba(255,90,50,'+(0.18+f*0.3)+')'; g.beginPath(); g.arc(x,y,r*f,0,TAU); g.fill(); g.strokeStyle='rgba(255,120,80,'+(0.55+0.35*Math.sin(T*18))+')'; g.lineWidth=3; g.beginPath(); g.arc(x,y,r,0,TAU); g.stroke(); } }
    else { if(!boom){ var fy=-(1-f)*(1-f)*420, s=8+f*14; glow(g,x-(1-f)*60,y+fy,s*3,'rgba(255,170,60,.9)',0.8); g.fillStyle='#ff7a2a'; g.beginPath(); g.arc(x-(1-f)*60,y+fy,s,0,TAU); g.fill(); g.fillStyle='#ffe07a'; g.beginPath(); g.arc(x-(1-f)*60,y+fy,s*0.55,0,TAU); g.fill(); } else { var al=f; var gr=g.createRadialGradient(x,y,0,x,y,r*1.15); gr.addColorStop(0,'rgba(255,240,170,'+al+')'); gr.addColorStop(0.5,'rgba(255,130,40,'+al*0.85+')'); gr.addColorStop(1,'rgba(255,60,20,0)'); g.fillStyle=gr; g.beginPath(); g.arc(x,y,r*1.15,0,TAU); g.fill(); } }
  } else if(k===1||k===3){
    var vert=k===3?null:(x===1); var rects=[];
    if(k===1){ rects=vert?[[y-r/2,0,r,H]]:[[0,y-r/2,W,r]]; } else { rects=[[x-r/2,0,r,H],[0,y-r/2,W,r]]; }
    if(!top&&!boom){ rects.forEach(function(q){ g.fillStyle='rgba(255,50,50,'+(0.10+f*0.12)+')'; g.fillRect(q[0],q[1],q[2],q[3]); g.strokeStyle='rgba(255,100,100,'+(0.5+0.4*Math.sin(T*20))+')'; g.lineWidth=2; g.setLineDash([14,10]); g.strokeRect(q[0],q[1],q[2],q[3]); g.setLineDash([]); g.fillStyle='rgba(255,70,70,'+(0.2+f*0.4)+')'; var cx=q[0]+q[2]/2, cy=q[1]+q[3]/2; if(q[3]===H) g.fillRect(cx-q[2]*f/2,0,q[2]*f,H); else g.fillRect(0,cy-q[3]*f/2,W,q[3]*f); }); }
    if(top&&boom){ rects.forEach(function(q){ var gr; if(q[3]===H){ gr=g.createLinearGradient(q[0],0,q[0]+q[2],0); } else gr=g.createLinearGradient(0,q[1],0,q[1]+q[3]); gr.addColorStop(0,'rgba(255,60,60,0)'); gr.addColorStop(0.5,'rgba(255,255,255,'+f+')'); gr.addColorStop(1,'rgba(255,60,60,0)'); g.fillStyle=gr; g.fillRect(q[0],q[1],q[2],q[3]); }); }
    if(k===3&&!top&&!boom){ g.fillStyle='#ff5050'; g.beginPath(); g.arc(x,y,9+4*Math.sin(T*20),0,TAU); g.fill(); }
  } else if(k===2){
    if(top){ g.lineCap='butt'; g.strokeStyle='rgba(120,220,255,'+(0.35+f*0.55)+')'; g.lineWidth=14; g.beginPath(); g.arc(x,y,r,0,TAU); g.stroke(); g.strokeStyle='rgba(255,255,255,'+f+')'; g.lineWidth=4; g.beginPath(); g.arc(x,y,r,0,TAU); g.stroke(); }
  } else if(k===4){
    if(top){ glow(g,x,y,48,'rgba(190,90,255,.95)',0.75); g.fillStyle='#7a1fd6'; g.beginPath(); g.arc(x,y,15,0,TAU); g.fill(); g.fillStyle='#f0c8ff'; g.beginPath(); g.arc(x-3,y-3,6,0,TAU); g.fill(); g.strokeStyle='rgba(255,255,255,.7)'; g.lineWidth=2; g.beginPath(); g.arc(x,y,19+Math.sin(T*12)*2,0,TAU); g.stroke(); }
  } else if(k===5){
    if(!top){ if(!boom){ g.strokeStyle='rgba(255,150,40,.9)'; g.setLineDash([10,8]); g.lineWidth=3; g.beginPath(); g.arc(x,y,r,0,TAU); g.stroke(); g.setLineDash([]); g.fillStyle='rgba(255,120,30,'+(0.1+f*0.25)+')'; g.beginPath(); g.arc(x,y,r*f,0,TAU); g.fill(); }
      else { var gr2=g.createRadialGradient(x,y,0,x,y,r); gr2.addColorStop(0,'rgba(255,230,90,.95)'); gr2.addColorStop(0.6,'rgba(255,110,20,.9)'); gr2.addColorStop(1,'rgba(160,30,0,.7)'); g.globalAlpha=Math.min(1,f*5); g.fillStyle=gr2; g.beginPath(); g.arc(x,y,r*(0.95+0.03*Math.sin(T*7)),0,TAU); g.fill(); g.globalAlpha=1; g.fillStyle='rgba(255,240,150,.8)'; for(var i=0;i<5;i++){ var a2=T*0.8+i*1.3, rr=r*0.6*Math.abs(Math.sin(T*1.7+i)); g.beginPath(); g.arc(x+Math.cos(a2)*rr,y+Math.sin(a2)*rr,3+2*Math.sin(T*5+i),0,TAU); g.fill(); } } }
  }
}
function drawElimWorld(inst,g,a,b,t,T,dt){
  var hz=b.h.map(function(h){ var ha=a.hm&&a.hm[h[0]]; if(ha&&(h[1]===2||h[1]===4)){ var q=h.slice(); q[2]=lerp(ha[2],h[2],t); q[3]=lerp(ha[3],h[3],t); q[4]=lerp(ha[4],h[4],t); return q; } return h; });
  hz.forEach(function(h){ drawHazard(inst,g,h,T,false); });
  (b.pk||[]).forEach(function(k){ var e=EPK[k[3]]||EPK[0], by=Math.sin(T*3+k[0])*3; glow(g,k[1],k[2],40,e[2],0.6); g.fillStyle='rgba(15,15,30,.85)'; g.beginPath(); g.arc(k[1],k[2]+by,16,0,TAU); g.fill(); g.strokeStyle=k[4]<4?'#ff6b6b':e[2]; g.lineWidth=2.5; g.stroke(); g.font='18px system-ui'; g.textAlign='center'; g.fillStyle='#fff'; g.fillText(e[0],k[1],k[2]+by+6); g.font='700 9px system-ui'; g.fillStyle=e[2]; g.fillText(e[1],k[1],k[2]+by+30); });
  var list=[]; drawPlayers(inst,g,a,b,t,T,list); list.sort(function(p,q){ return p.y-q.y; }).forEach(function(o){ o.f(); });
  hz.forEach(function(h){ drawHazard(inst,g,h,T,true); });
}

/* ---------- HUDs ---------- */
function updateHud(inst,s,me){
  var mode=inst.mode, h=inst.hud;
  if(inst.kind==='host'){ updateHost(inst,s); return; }
  if(!me){ h.innerHTML=''; return; }
  var fl=me[6], html='', msg='';
  if(mode==='zombie'){
    var w=s.w||[0,0,0,0];
    html='<div class="ar2-row"><span class="ar2-hp"><i class="'+(me[4]<35?'low':'')+'" style="width:'+Math.max(0,me[4])+'%"></i><em>'+Math.round(me[4])+'</em></span><b class="'+(me[5]<=3?'warn':'')+'">🔫 '+me[5]+'</b><b>☠ '+me[7]+'</b>'+(me[9]?'<b class="pu">'+(me[9]===1?'⚡ RAPID':'🎯 SHOTGUN')+'</b>':'')+(me[10]>=3?'<b class="cmb">🔥 x'+me[10]+'</b>':'')+'</div><div class="ar2-wave">WAVE '+w[0]+' · '+(w[1]?w[2]+' left':'next in '+w[2]+'s')+'</div>';
    if(me[4]<inst.lastHp-1){ flash(inst); inst.shake=Math.max(inst.shake,7); } inst.lastHp=me[4];
    if(fl&8) msg='👻 Eliminated'; else if(fl&1) msg='💀 You\'re down — a teammate can revive you!'; else if(me[5]===0) msg='Out of ammo — answer a question below!';
  } else if(mode==='gems'){
    var ev=s.ev||[0,1];
    html='<div class="ar2-row"><b>💎 carrying '+me[4]+'/30</b><b>💨 '+me[5]+'</b><b>🏦 '+me[7]+'</b>'+(me[9]?'<b class="pu">'+['🧲 MAGNET','⚡ SPEED','🛡️ SHIELD'][me[9]-1]+' '+me[10]+'s</b>':'')+(ev[1]===2?'<b class="cmb">×2 BANK</b>':'')+'</div>';
    if(me[5]===0&&me[4]===0) msg='Grab gems, bank them in the vault. Answer questions for dashes!';
  } else {
    html='<div class="ar2-row"><b class="ar2-hearts">'+(me[4]>0?'❤'.repeat(me[4]):'💔')+'</b><b>'+(me[5]>0?'🛡'.repeat(me[5]):'')+'</b>'+(me[9]===3?'<b class="pu">⚡ '+me[10]+'s</b>':'')+'<b>⭐ '+me[7]+'</b></div><div class="ar2-wave">'+esc((s.ph&&s.ph[1])||'')+'</div>';
    if(me[4]<inst.lastLives){ flash(inst); inst.shake=Math.max(inst.shake,9); } inst.lastLives=me[4];
    if(fl&8) msg='👻 Eliminated — watch the rest!';
  }
  h.innerHTML=html; inst.banner.style.display=msg?'':'none'; inst.banner.textContent=msg;
  var b2=inst.root.querySelector('.ar2-b2'), b1=inst.root.querySelector('.ar2-b1');
  if(mode==='zombie'){ b1.classList.toggle('empty',me[5]===0); b2.style.setProperty('--cd',me[8]+'%'); b2.classList.toggle('cd',me[8]>0&&!(fl&1)); }
  if(mode==='elimination'){ b1.style.setProperty('--cd',me[8]+'%'); b2.style.setProperty('--cd',me[8]+'%'); b1.classList.toggle('cd',me[8]>0); b2.classList.toggle('cd',me[8]>0); }
  if(mode==='gems') b1.classList.toggle('empty',me[5]===0);
}
function updateHost(inst,s){
  var mode=inst.mode, h=inst.hud, rows=s.p.slice(), top;
  if(mode==='zombie'){ var w=s.w||[0,0,0,0]; h.innerHTML='<b>🌊 Wave '+w[0]+'</b><b>🧟 '+(s.z||[]).length+' alive</b><b>'+(w[1]?w[2]+' to go':'next wave in '+w[2]+'s')+'</b>'; rows.sort(function(a,b){ return b[7]-a[7]; }); }
  else if(mode==='gems'){ var ev=s.ev||[0,1]; h.innerHTML='<b>💎 '+s.g.length+' on the map</b><b>🤖 '+s.d.length+' drones</b>'+(ev[1]===2?'<b class="cmb">×2 FINAL PUSH</b>':''); rows.sort(function(a,b){ return b[7]-a[7]; }); }
  else { var alive=rows.filter(function(r){ return !(r[6]&8); }).length; h.innerHTML='<b>'+esc((s.ph&&s.ph[1])||'')+'</b><b>🧍 '+alive+' standing</b>'; rows.sort(function(a,b){ var da=(a[6]&8)?1:0, db=(b[6]&8)?1:0; return da-db||b[4]-a[4]||b[7]-a[7]; }); }
  inst.lb.innerHTML=rows.slice(0,6).map(function(r,i){ var ro=rosterOf(r[0]); var v=mode==='zombie'?'☠ '+r[7]+((r[6]&1)?' 🩸':''):mode==='gems'?'🏦 '+r[7]+(r[4]?' (+'+r[4]+')':''):((r[6]&8)?'💀':'❤'.repeat(r[4])+(r[5]?'🛡'.repeat(r[5]):'')); return '<div class="'+((r[6]&8)?'out':'')+'"><i>'+(i+1)+'</i><span>'+esc(ro.name)+'</span><b>'+v+'</b></div>'; }).join('');
}

/* ---------- controls ---------- */
function wireControls(inst){
  var joy=inst.root.querySelector('.ar2-joy'), knob=inst.root.querySelector('.ar2-knob'), b1=inst.root.querySelector('.ar2-b1'), b2=inst.root.querySelector('.ar2-b2');
  var jid=null, R=46;
  function jmove(ev){ var bb=joy.getBoundingClientRect(), cx=bb.left+bb.width/2, cy=bb.top+bb.height/2; var dx=ev.clientX-cx, dy=ev.clientY-cy, d=Math.hypot(dx,dy)||1, k=Math.min(1,d/R); inst.joy={x:dx/d*k,y:dy/d*k}; knob.style.transform='translate('+(dx/d*k*R)+'px,'+(dy/d*k*R)+'px)'; }
  joy.addEventListener('pointerdown',function(ev){ jid=ev.pointerId; joy.setPointerCapture(jid); jmove(ev); ev.preventDefault(); });
  joy.addEventListener('pointermove',function(ev){ if(ev.pointerId===jid) jmove(ev); });
  function jend(ev){ if(ev.pointerId!==jid) return; jid=null; inst.joy=null; knob.style.transform=''; }
  joy.addEventListener('pointerup',jend); joy.addEventListener('pointercancel',jend);
  b1.addEventListener('pointerdown',function(ev){ inst.btn=true; b1.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  function e1(){ inst.btn=false; } b1.addEventListener('pointerup',e1); b1.addEventListener('pointercancel',e1);
  b2.addEventListener('pointerdown',function(ev){ inst.btn2=true; inst.abLatch=true; b2.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  function e2(){ inst.btn2=false; } b2.addEventListener('pointerup',e2); b2.addEventListener('pointercancel',e2);
  inst.root.querySelector('.ar2-view').addEventListener('contextmenu',function(e){ e.preventDefault(); });
}
function readInput(inst){
  var k=A.keys, mx=(k.right?1:0)-(k.left?1:0), my=(k.down?1:0)-(k.up?1:0), act=!!(k.act||inst.btn), ab=!!(k.ab||inst.btn2||inst.abLatch);
  if(inst.joy&&(Math.abs(inst.joy.x)>0.08||Math.abs(inst.joy.y)>0.08)){ mx=inst.joy.x; my=inst.joy.y; }
  return {mx:Math.round(mx*100)/100,my:Math.round(my*100)/100,act:act,ab:ab};
}
function pump(){
  var inst=A.inst; if(!inst||inst.kind!=='me'||!A.sock||!state.live||state.live.screen!=='player-play') return;
  var inp=readInput(inst), key=inp.mx+'|'+inp.my+'|'+inp.act+'|'+inp.ab, moving=inp.mx||inp.my||inp.act||inp.ab;
  if(key!==inst.lastSent||moving||inst.abLatch){ inst.lastSent=key; A.sock.emit('player:input',{code:state.live.code,playerId:state.live.playerId,mx:inp.mx,my:inp.my,act:inp.act,ab:inp.ab}); inst.abLatch=false; }
}
var KEYMAP={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',' ':'act',j:'act',J:'act',Shift:'ab',e:'ab',E:'ab',k:'ab',K:'ab'};
function kd(down){ return function(e){
  if(!A.inst||A.inst.kind!=='me'||state.view!=='live') return; var t=e.target&&e.target.tagName; if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT') return;
  var k=KEYMAP[e.key]; if(!k||e.ctrlKey||e.metaKey||e.altKey) return; A.keys[k]=down; if(down&&k==='ab') A.inst.abLatch=true; e.preventDefault();
}; }
document.addEventListener('keydown',kd(true)); document.addEventListener('keyup',kd(false));
window.addEventListener('blur',function(){ A.keys={}; });

/* ---------- wiring ---------- */
A.wire=function(socket){
  A.sock=socket; ['arena:snap','arena:roster'].forEach(function(e){ socket.removeAllListeners(e); });
  socket.on('arena:roster',function(list){ A.roster={}; list.forEach(function(r){ A.roster[r[0]]={name:r[1],ling:r[2],skin:r[3]}; }); });
  socket.on('arena:snap',function(s){ var inst=A.inst; if(!inst) return; onSnap(inst,s); });
  if(!A.timer) A.timer=setInterval(pump,50);
  if(!A.raf){ A.raf=true; requestAnimationFrame(frame); }
};
A.scene=function(mode){
  return {
    host:function(){ var r=build(mode,'host'); A.inst=r.__ar; return r; },
    me:function(){ var r=build(mode,'me'); A.inst=r.__ar; if(state.live.me) A.inst.meN=state.live.me.n; return r; },
    update:function(e){ if(e.__ar) layout(e.__ar); },
    meUpdate:function(e){ var i=e.__ar; if(i&&state.live.me){ i.meN=state.live.me.n; } }
  };
};
A.reset=function(){ A.inst=null; A.roster={}; A.keys={}; };
if(window.LVM){
  ['zombie','gems','elimination'].forEach(function(m){ LVM.SCENES[m]=A.scene(m); });
  var _r=LVM.reset; LVM.reset=function(){ _r(); A.reset(); };
}
})();
