/* Live Game arena modes (Zombie Siege, Gem Heist, Last Stand): renders the server simulation with each
   player's equipped Indexling, handles keyboard/touch controls and the player camera + HUD. */
(function(){
'use strict';
var W=1200, H=700, VAULT={x:600,y:350,r:90};
var A = window.LVA = { inst:null, roster:{}, keys:{}, sock:null, timer:null };
function el(tag,cls,html){ var e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }
function px(n){ return Math.round(n*10)/10; }

/* ---------- sprites ---------- */
function lingArt(id,skin){
  try{
    var c=(typeof cosmeticById==='function'&&id&&cosmeticById(id))||(typeof cosmeticById==='function'&&cosmeticById('ling-sugarbug'));
    var sk=(skin&&typeof skinById==='function'&&skinById(skin))||{};
    if(c&&typeof indexlingArtHtml==='function') return indexlingArtHtml(c,true,sk);
  }catch(e){}
  return '<span class="ar-fallback">🙂</span>';
}
function playerEl(inst,n){
  var r=A.roster[n]||{name:'Player',ling:'',skin:''};
  var e=el('div','ar-p');
  e.innerHTML='<div class="ar-ring"></div><div class="ar-aim"><i>🔫</i></div><div class="ar-ling">'+lingArt(r.ling,r.skin)+'</div><div class="ar-carry"></div><div class="ar-tag"></div><div class="ar-bar"><i></i></div>';
  e.querySelector('.ar-tag').textContent=r.name+(inst.meN===n?' (you)':'');
  if(inst.meN===n) e.classList.add('me');
  inst.layer.appendChild(e); return e;
}
function setPos(e,x,y){ e.style.transform='translate('+px(x)+'px,'+px(y)+'px)'; }

/* ---------- scene (one instance per host/player view) ---------- */
function build(mode,kind){
  var root=el('div','ar-root ar-'+mode+' ar-'+kind);
  root.innerHTML='<div class="ar-view"><div class="ar-world"><div class="ar-floor"></div><div class="ar-vault"><span>VAULT</span></div><div class="ar-layer"></div><div class="ar-flash"></div></div><div class="ar-hud"></div><div class="ar-banner" style="display:none"></div>'+(kind==='me'?'<div class="ar-ctl"><div class="ar-joy"><div class="ar-knob"></div></div><button class="ar-act" type="button"></button></div>':'')+'</div>'+(kind==='me'?'<p class="ar-hint">'+({zombie:'WASD / arrows to move · hold SPACE to fire (auto-aims) · answer below for ammo',gems:'WASD / arrows to move · SPACE to dash-tackle · answer below for dashes',elimination:'WASD / arrows to move · dodge the red zones · answer below for shields'}[mode])+'</p>':'');
  var inst={ root:root, mode:mode, kind:kind, view:root.querySelector('.ar-view'), world:root.querySelector('.ar-world'), layer:root.querySelector('.ar-layer'), hud:root.querySelector('.ar-hud'), banner:root.querySelector('.ar-banner'), flash:root.querySelector('.ar-flash'),
    P:{}, Z:{}, G:{}, Hz:{}, B:[], scale:1, camX:0, camY:0, snap:null, meN:null, input:{mx:0,my:0,act:false}, lastSent:'' };
  root.__ar=inst;
  var act=root.querySelector('.ar-act'); if(act) act.textContent={zombie:'FIRE',gems:'DASH',elimination:''}[mode]||'';
  if(act&&mode==='elimination') act.style.display='none';
  if(kind==='me') wireControls(inst);
  if(window.ResizeObserver){ var ro=new ResizeObserver(function(){ layout(inst); }); ro.observe(root); inst.ro=ro; }
  setTimeout(function(){ layout(inst); },0);
  return root;
}
function layout(inst){
  var cw=inst.root.clientWidth||inst.view.clientWidth||600; if(!cw) return;
  if(inst.kind==='host'){
    var maxH=Math.max(320,window.innerHeight*0.66); var sc=Math.min(cw/W, maxH/H);
    inst.view.style.width=px(W*sc)+'px'; inst.view.style.height=px(H*sc)+'px'; inst.scale=sc; inst.camX=0; inst.camY=0;
  } else {
    var vw=Math.min(W, cw<520?560:720); var sc2=cw/vw; var vh=Math.min(H*sc2, Math.max(260,window.innerHeight*0.42));
    inst.view.style.width=cw+'px'; inst.view.style.height=px(vh)+'px'; inst.scale=sc2;
  }
  applyCam(inst);
}
function applyCam(inst){
  var vw=inst.view.clientWidth, vh=inst.view.clientHeight, sc=inst.scale, tx, ty;
  if(inst.kind==='host'){ tx=0; ty=0; }
  else {
    var wx=vw/sc, wy=vh/sc; var cx=inst.camX, cy=inst.camY;
    var mx=Math.max(0,W-wx), my=Math.max(0,H-wy);
    var ox=Math.min(mx,Math.max(0,cx-wx/2)), oy=Math.min(my,Math.max(0,cy-wy/2));
    tx=-ox*sc; ty=-oy*sc;
    if(wx>=W) tx=(vw-W*sc)/2; if(wy>=H) ty=(vh-H*sc)/2;
  }
  inst.world.style.transform='translate('+px(tx)+'px,'+px(ty)+'px) scale('+sc+')';
}

/* ---------- applying snapshots ---------- */
function applySnap(inst,s){
  inst.snap=s; var mode=inst.mode, meN=inst.meN;
  var seen={};
  s.p.forEach(function(r){
    var n=r[0]; seen[n]=1; var e=inst.P[n]; if(!e){ e=inst.P[n]=playerEl(inst,n); e.__first=true; }
    setPos(e,r[1]-28,r[2]-28);
    var fl=r[6], dead=!!(fl&8), down=!!(fl&1);
    e.classList.toggle('down',down); e.classList.toggle('inv',!!(fl&2)); e.classList.toggle('dash',!!(fl&4)); e.classList.toggle('dead',dead);
    var ling=e.querySelector('.ar-ling'); var face=Math.cos(r[3])<-0.15; ling.classList.toggle('flip',face);
    var aim=e.querySelector('.ar-aim'); if(mode==='zombie') aim.style.transform='rotate('+r[3]+'rad)'; else aim.style.display='none';
    var bar=e.querySelector('.ar-bar i'), carry=e.querySelector('.ar-carry');
    if(mode==='zombie'){ bar.style.width=Math.max(0,r[4])+'%'; bar.className=r[4]<35?'low':''; carry.textContent=''; }
    else if(mode==='gems'){ e.querySelector('.ar-bar').style.display='none'; carry.textContent=r[4]>0?'💎'+r[4]:''; }
    else { e.querySelector('.ar-bar').style.display='none'; carry.textContent=(r[4]>0?'❤'.repeat(r[4]):'')+(r[5]>0?'🛡'.repeat(r[5]):''); }
    if(n===meN){ inst.camX=r[1]; inst.camY=r[2]; inst.me=r; }
    if(e.__first){ e.__first=false; e.classList.add('spawn'); setTimeout(function(){ e.classList.remove('spawn'); },500); }
  });
  Object.keys(inst.P).forEach(function(n){ if(!seen[n]){ inst.layer.removeChild(inst.P[n]); delete inst.P[n]; } });
  if(mode==='zombie') applyZombies(inst,s);
  else if(mode==='gems') applyGems(inst,s);
  else applyHazards(inst,s);
  if(s.fx&&s.fx.length){ inst.flash.classList.remove('go'); void inst.flash.offsetWidth; inst.flash.classList.add('go'); }
  if(inst.kind==='me'){ applyCam(inst); updateHud(inst); }
  else updateHostHud(inst,s);
}
function applyZombies(inst,s){
  var seen={};
  (s.z||[]).forEach(function(r){
    seen[r[0]]=1; var e=inst.Z[r[0]];
    if(!e){ e=inst.Z[r[0]]=el('div','ar-z t'+r[3],'<span>🧟</span><i class="zb"><b></b></i>'); inst.layer.appendChild(e); }
    setPos(e,r[1]-20,r[2]-20); if(r[3]===2){ e.querySelector('.zb b').style.width=(r[4]/4*100)+'%'; }
  });
  Object.keys(inst.Z).forEach(function(id){ if(!seen[id]){ var e=inst.Z[id]; delete inst.Z[id]; e.classList.add('die'); setTimeout(function(){ if(e.parentNode) e.parentNode.removeChild(e); },320); } });
  var bl=s.b||[]; while(inst.B.length<bl.length){ var b=el('div','ar-b'); inst.layer.appendChild(b); inst.B.push(b); }
  inst.B.forEach(function(b,i){ if(i<bl.length){ b.style.display=''; setPos(b,bl[i][0]-4,bl[i][1]-4); } else b.style.display='none'; });
}
function applyGems(inst,s){
  var seen={};
  (s.g||[]).forEach(function(r){
    seen[r[0]]=1; var e=inst.G[r[0]];
    if(!e){ e=inst.G[r[0]]=el('div','ar-g v'+r[3],'<i></i>'); inst.layer.appendChild(e); setPos(e,r[1]-12,r[2]-12); e.classList.add('pop'); }
  });
  Object.keys(inst.G).forEach(function(id){ if(!seen[id]){ var e=inst.G[id]; delete inst.G[id]; e.classList.add('got'); setTimeout(function(){ if(e.parentNode) e.parentNode.removeChild(e); },260); } });
}
function applyHazards(inst,s){
  var seen={};
  (s.h||[]).forEach(function(r){
    var id=r[0]; seen[id]=1; var e=inst.Hz[id];
    if(!e){ e=inst.Hz[id]=el('div','ar-h '+(r[1]===0?'meteor':'sweep '+(r[2]===1?'v':'h'))); e.innerHTML='<i></i>'; inst.world.insertBefore(e,inst.layer); 
      if(r[1]===0){ e.style.width=e.style.height=(r[4]*2)+'px'; e.style.left=(r[2]-r[4])+'px'; e.style.top=(r[3]-r[4])+'px'; }
      else if(r[2]===1){ e.style.left=(r[3]-r[4]/2)+'px'; e.style.top='0'; e.style.width=r[4]+'px'; e.style.height=H+'px'; }
      else { e.style.top=(r[3]-r[4]/2)+'px'; e.style.left='0'; e.style.height=r[4]+'px'; e.style.width=W+'px'; } }
    e.classList.toggle('boom',r[5]===1); var f=r[6];
    e.firstChild.style.opacity=r[5]===1?f:0.25+f*0.55; if(r[1]===0&&r[5]===0) e.firstChild.style.transform='scale('+(0.25+f*0.75)+')'; else e.firstChild.style.transform='scale(1)';
  });
  Object.keys(inst.Hz).forEach(function(id){ if(!seen[id]){ var e=inst.Hz[id]; delete inst.Hz[id]; if(e.parentNode) e.parentNode.removeChild(e); } });
}

/* ---------- HUDs ---------- */
function updateHud(inst){
  var r=inst.me, h=inst.hud, mode=inst.mode; if(!r){ return; }
  var fl=r[6], html='';
  if(mode==='zombie') html='<span class="ar-hp"><i class="'+(r[4]<35?'low':'')+'" style="width:'+Math.max(0,r[4])+'%"></i></span><b>🔫 '+r[5]+'</b><b>☠ '+r[7]+'</b>';
  else if(mode==='gems') html='<b>💎 carrying '+r[4]+'</b><b>💨 '+r[5]+'</b><b>🏦 '+r[7]+'</b>';
  else html='<b class="ar-hearts">'+(r[4]>0?'❤'.repeat(r[4]):'💔')+'</b><b>'+(r[5]>0?'🛡'.repeat(r[5]):'')+'</b>';
  h.innerHTML=html;
  var msg='';
  if(fl&8) msg='👻 Eliminated — watch the rest!'; else if(fl&1) msg='💀 Bitten down — respawning…';
  else if(mode==='zombie'&&r[5]===0) msg='Out of ammo — answer a question below!';
  else if(mode==='gems'&&r[5]===0&&r[4]===0) msg='Grab gems, bank them in the vault. Answer questions for dashes!';
  inst.banner.style.display=msg?'':'none'; inst.banner.textContent=msg;
  var act=inst.root.querySelector('.ar-act'); if(act&&mode==='zombie') act.classList.toggle('empty',r[5]===0);
  if(act&&mode==='gems') act.classList.toggle('empty',r[5]===0);
}
function updateHostHud(inst,s){
  var h=inst.hud; if(inst.mode==='zombie') h.innerHTML='<b>🧟 '+(s.z||[]).length+' zombies</b>';
  else if(inst.mode==='gems') h.innerHTML='<b>💎 '+(s.g||[]).length+' gems on the map</b>';
  else h.innerHTML='<b>☄️ '+(s.h||[]).filter(function(x){return x[5]===0;}).length+' incoming</b>';
}

/* ---------- controls (player view) ---------- */
function wireControls(inst){
  var joy=inst.root.querySelector('.ar-joy'), knob=inst.root.querySelector('.ar-knob'), act=inst.root.querySelector('.ar-act');
  var jid=null, R=46;
  function jmove(ev){ var b=joy.getBoundingClientRect(), cx=b.left+b.width/2, cy=b.top+b.height/2; var dx=ev.clientX-cx, dy=ev.clientY-cy, d=Math.hypot(dx,dy)||1, k=Math.min(1,d/R); inst.joy={x:dx/d*k,y:dy/d*k}; knob.style.transform='translate('+(dx/d*k*R)+'px,'+(dy/d*k*R)+'px)'; }
  joy.addEventListener('pointerdown',function(ev){ jid=ev.pointerId; joy.setPointerCapture(jid); jmove(ev); ev.preventDefault(); });
  joy.addEventListener('pointermove',function(ev){ if(ev.pointerId===jid) jmove(ev); });
  function jend(ev){ if(ev.pointerId!==jid) return; jid=null; inst.joy=null; knob.style.transform=''; }
  joy.addEventListener('pointerup',jend); joy.addEventListener('pointercancel',jend);
  act.addEventListener('pointerdown',function(ev){ inst.btn=true; act.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  function aend(){ inst.btn=false; } act.addEventListener('pointerup',aend); act.addEventListener('pointercancel',aend);
}
function readInput(inst){
  var k=A.keys, mx=(k.right?1:0)-(k.left?1:0), my=(k.down?1:0)-(k.up?1:0), act=!!(k.act||inst.btn);
  if(inst.joy&&(Math.abs(inst.joy.x)>0.08||Math.abs(inst.joy.y)>0.08)){ mx=inst.joy.x; my=inst.joy.y; }
  return {mx:Math.round(mx*100)/100,my:Math.round(my*100)/100,act:act};
}
function pump(){
  var inst=A.inst; if(!inst||inst.kind!=='me'||!A.sock||state.live.screen!=='player-play') return;
  var inp=readInput(inst), key=inp.mx+'|'+inp.my+'|'+inp.act, moving=inp.mx||inp.my||inp.act;
  if(key!==inst.lastSent||moving){ inst.lastSent=key; A.sock.emit('player:input',{code:state.live.code,playerId:state.live.playerId,mx:inp.mx,my:inp.my,act:inp.act}); }
}
var KEYMAP={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',' ':'act',j:'act',J:'act',k:'act',K:'act'};
function kd(down){ return function(e){
  if(!A.inst||A.inst.kind!=='me'||state.view!=='live') return; var t=e.target&&e.target.tagName; if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT') return;
  var k=KEYMAP[e.key]; if(!k||e.ctrlKey||e.metaKey||e.altKey) return; A.keys[k]=down; e.preventDefault();
}; }
document.addEventListener('keydown',kd(true)); document.addEventListener('keyup',kd(false));
window.addEventListener('blur',function(){ A.keys={}; });

/* ---------- wiring ---------- */
A.wire=function(socket){
  A.sock=socket; ['arena:snap','arena:roster'].forEach(function(e){ socket.removeAllListeners(e); });
  socket.on('arena:roster',function(list){
    A.roster={}; list.forEach(function(r){ A.roster[r[0]]={name:r[1],ling:r[2],skin:r[3]}; });
    var inst=A.inst; if(!inst) return;
    Object.keys(inst.P).forEach(function(n){ var e=inst.P[n]; var r=A.roster[n]; if(r){ e.querySelector('.ar-tag').textContent=r.name+(inst.meN==+n?' (you)':''); e.querySelector('.ar-ling').innerHTML=lingArt(r.ling,r.skin); } });
  });
  socket.on('arena:snap',function(s){ var inst=A.inst; if(!inst) return; if(inst.kind==='me'&&state.live.me) inst.meN=state.live.me.n; applySnap(inst,s); });
  if(!A.timer) A.timer=setInterval(pump,100);
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
