/* Gold Rush Mines v2 — an interactive idle/incremental mine.
   Tap the vein to dig (crits, heat combo), assign drones to Ore / Crystal / Relic layers, buy drills, drones, a Prospector,
   Lucky Pick, Refinery and Deep Storage, catch Mother-Lode nuggets, and Descend (prestige) for permanent Gems.
   Offline earnings still use the saved timestamp (cap 8h + 2h per Deep Storage level). Milestones pay small coin rewards once.
   Overrides arcadeGoldStart/arcadeGoldHtml/arcadeGoldAdjust. Progress: gameProgress.gold keeps {vault,workers,assign,lastSave}
   and adds {up:{},gems,lifetime,runEarned,clicks,nuggets,runs,ach:{}}. Fullscreen on the persistent games stage. */
(function(){
'use strict';
var $=function(id){ return document.getElementById(id); };
var LAYERS=[
  {id:'ore',icon:'⛏️',name:'Ore Seam',rate:1.6,value:1,col:'#d89a64',bg:'#4a3526',dc:150},
  {id:'crystal',icon:'💎',name:'Crystal Vein',rate:.9,value:3,col:'#6ee7ff',bg:'#183a4a',dc:450},
  {id:'relic',icon:'🏺',name:'Relic Vault',rate:.35,value:8,col:'#ffd24a',bg:'#4a3a12',dc:1200}
];
var ACH=[
  {id:'v1k',n:'First Fortune',d:'Earn 1,000 total',f:function(g){ return g.lifetime>=1e3; },c:1},
  {id:'v10k',n:'Rising Magnate',d:'Earn 10,000 total',f:function(g){ return g.lifetime>=1e4; },c:2},
  {id:'v100k',n:'Mine Baron',d:'Earn 100,000 total',f:function(g){ return g.lifetime>=1e5; },c:4},
  {id:'v1m',n:'Golden Empire',d:'Earn 1,000,000 total',f:function(g){ return g.lifetime>=1e6; },c:8},
  {id:'dr10',n:'Drone Swarm',d:'Own 10 drones',f:function(g){ return g.workers>=10; },c:2},
  {id:'dl10',n:'Sharp Tools',d:'10 total drill levels',f:function(g){ return lvl(g,'ore')+lvl(g,'crystal')+lvl(g,'relic')>=10; },c:2},
  {id:'ck500',n:'Tireless Digger',d:'Dig 500 times',f:function(g){ return g.clicks>=500; },c:2},
  {id:'ng5',n:'Nugget Hunter',d:'Catch 5 Mother Lodes',f:function(g){ return g.nuggets>=5; },c:2},
  {id:'ds1',n:'Deeper Still',d:'Descend once',f:function(g){ return g.runs>=1; },c:5}
];
function E(s){ return (typeof esc==='function')?esc(String(s==null?'':s)):String(s==null?'':s); }
function fmt(n){ n=Number(n)||0; if(n<1e4) return String(Math.floor(n)); var u=['','K','M','B','T','Qa','Qi']; var i=0; while(n>=1000&&i<u.length-1){ n/=1000; i++; } return (n>=100?n.toFixed(0):n>=10?n.toFixed(1):n.toFixed(2))+u[i]; }
function stats(){ try{ return arcadeCharacterStats()||{}; }catch(e){ return {}; } }
function ling(){ try{ return arcadeCharacterHtml(); }catch(e){ return ''; } }
var AC=null;
function muted(){ try{ return localStorage.getItem('gx-mute')==='1'; }catch(e){ return false; } }
function tone(f1,f2,d,type,v){ if(muted()) return; try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume(); var o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime; o.type=type||'triangle'; o.frequency.setValueAtTime(f1,t); o.frequency.exponentialRampToValueAtTime(f2,t+d); g.gain.setValueAtTime(v||.06,t); g.gain.exponentialRampToValueAtTime(.0001,t+d); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+d+.02); }catch(e){} }
function sfx(k){ if(k==='dig') tone(260+Math.random()*80,120,.07,'square',.04); else if(k==='crit') tone(500,1400,.2,'triangle',.08); else if(k==='buy') tone(520,880,.14,'triangle',.07); else if(k==='no') tone(180,120,.12,'sawtooth',.04); else if(k==='nug') tone(600,1800,.35,'sine',.1); else if(k==='ach') tone(440,1320,.5,'triangle',.1); }

/* ------------------------------ data ------------------------------ */
function raw(){ var gp=arcadeGameProgress(); var g=gp.gold=gp.gold||{vault:0,workers:6,assign:{ore:2,crystal:2,relic:2},lastSave:Date.now()};
  if(!g.assign) g.assign={ore:2,crystal:2,relic:2}; if(!g.up) g.up={}; ['gems','lifetime','runEarned','clicks','nuggets','runs'].forEach(function(k){ if(typeof g[k]!=='number') g[k]=0; }); if(!g.ach) g.ach={};
  if(!g.lifetime) g.lifetime=Math.max(0,Number(g.vault)||0); if(!g.runEarned) g.runEarned=g.lifetime; return g; }
function lvl(g,k){ return Number(g.up[k])||0; }
function gm(g){ var s=stats(); return (1+.1*lvl(g,'refine'))*(1+.1*g.gems)*(1+(s.focus||0)/900); }
function layerRate(g,L){ return (Number(g.assign[L.id])||0)*L.rate*L.value*(1+.25*lvl(g,L.id)); }
function rate(g){ return LAYERS.reduce(function(n,L){ return n+layerRate(g,L); },0)*gm(g); }
function clickVal(g){ var s=stats(); return (2+(s.power||1)*1.5)*(1+.6*lvl(g,'click'))*gm(g); }
function critP(g){ return Math.min(.6,.05+.02*lvl(g,'crit')+(stats().luck||0)*.01); }
function capH(g){ return 8+2*lvl(g,'storage'); }
var COST={
  drone:function(g){ return Math.floor(300*Math.pow(1.5,Math.max(0,g.workers-6))); },
  ore:function(g){ return Math.floor(150*Math.pow(2.1,lvl(g,'ore'))); },
  crystal:function(g){ return Math.floor(450*Math.pow(2.1,lvl(g,'crystal'))); },
  relic:function(g){ return Math.floor(1200*Math.pow(2.1,lvl(g,'relic'))); },
  click:function(g){ return Math.floor(100*Math.pow(2,lvl(g,'click'))); },
  crit:function(g){ return Math.floor(250*Math.pow(2.4,lvl(g,'crit'))); },
  refine:function(g){ return Math.floor(800*Math.pow(2.6,lvl(g,'refine'))); },
  storage:function(g){ return Math.floor(400*Math.pow(2.2,lvl(g,'storage'))); }
};
var MAXL={crit:10,storage:10};
function descGain(g){ return Math.floor(Math.sqrt(Math.max(0,g.runEarned)/20000)); }
function earn(g,n){ g.vault+=n; g.lifetime+=n; g.runEarned+=n; }

/* ------------------------------ lifecycle ------------------------------ */
window.arcadeGoldStart=function(){
  clearGameTimers(); var g=raw(), now=Date.now(), last=Number(g.lastSave)||now, back=null;
  if(last<now){ var off=Math.min(capH(g)*3600*1000,Math.max(0,now-last)); var gain=rate(g)*off/1000; if(gain>0&&off>30000){ earn(g,gain); back={gain:gain,secs:Math.round(off/1000),capped:(now-last)>capH(g)*3600*1000}; } }
  g.lastSave=now; try{ persistProgress(); }catch(e){}
  state.games={active:'gold',gm:{back:back,last:now,nug:null,nugT:35+Math.random()*30,heat:0,heatT:0,lastClick:0,confirm:false,showAch:false,tab:'shop',saveT:0,unmuted:true},timerId:null};
  state.games.timerId=setInterval(tick,250);
};
window.arcadeGoldAdjust=function(id,d){ var g=raw(); var a=g.assign, total=Object.keys(a).reduce(function(n,k){ return n+Number(a[k]||0); },0); if(d>0&&total>=g.workers) return; if(d<0&&Number(a[id]||0)<=0) return; a[id]=Number(a[id]||0)+d; sfx('buy'); save(); paint(); };
function save(){ var g=raw(); g.lastSave=Date.now(); try{ persistProgress(); }catch(e){} }
function G(){ return state.games&&state.games.active==='gold'&&state.games.gm?state.games.gm:null; }

function tick(){
  var m=G(); if(!m||state.view!=='games'){ return; } var g=raw(), now=Date.now(), dt=Math.min(5,(now-m.last)/1000); m.last=now;
  var r=rate(g); if(r>0) earn(g,r*dt);
  m.heat=Math.max(0,m.heat-dt*3);
  m.nugT-=dt; if(!m.nug&&m.nugT<=0){ m.nug={x:10+Math.random()*75,y:15+Math.random()*60,t:14}; }
  if(m.nug){ m.nug.t-=dt; if(m.nug.t<=0){ m.nug=null; m.nugT=40+Math.random()*40; } }
  m.saveT+=dt; if(m.saveT>=4){ m.saveT=0; save(); }
  checkAch(g,m); live(g,m);
  m.layerT=(m.layerT||0)+dt; if(m.layerT>=1){ m.layerT=0; LAYERS.forEach(function(L){ var v=layerRate(g,L)*gm(g); if(v>0) floater('#gm-layer-'+L.id,'+'+fmt(v),L.col); }); }
}
function checkAch(g,m){ ACH.forEach(function(a){ if(!g.ach[a.id]&&a.f(g)){ g.ach[a.id]=1; try{ addCoins(a.c,'Gold Rush: '+a.n); }catch(e){} sfx('ach'); toast('🏆 '+a.n+' · +'+a.c+' 🪙'); save(); m.dirty=1; } }); if(m.dirty){ m.dirty=0; paint(); } }
function toast(t){ var l=$('gm-toast'); if(!l) return; l.textContent=t; l.classList.remove('on'); void l.offsetWidth; l.classList.add('on'); }
function floater(sel,txt,col){ var host=document.querySelector(sel); if(!host) return; var s=document.createElement('span'); s.className='gm-fl'; s.textContent=txt; s.style.color=col||'#fff'; s.style.left=(15+Math.random()*60)+'%'; host.appendChild(s); setTimeout(function(){ if(s.parentNode) s.parentNode.removeChild(s); },1100); }

/* ------------------------------ actions ------------------------------ */
function dig(e){
  var g=raw(), m=G(); if(!m) return; var now=Date.now(); m.heat=Math.min(20,m.heat+1); var heatMult=1+m.heat/20; var crit=Math.random()<critP(g);
  var v=clickVal(g)*heatMult*(crit?5:1); earn(g,v); g.clicks++; m.lastClick=now; sfx(crit?'crit':'dig');
  floater('#gm-vein',(crit?'CRIT +':'+')+fmt(v),crit?'#ffd24a':'#fff'); var vb=$('gm-vein-btn'); if(vb){ vb.classList.remove('hit'); void vb.offsetWidth; vb.classList.add('hit'); }
  live(g,m);
}
function buy(k){
  var g=raw(), m=G(); var cost=COST[k]?COST[k](g):0;
  if(k!=='drone'&&MAXL[k]&&lvl(g,k)>=MAXL[k]) return;
  if(g.vault<cost){ sfx('no'); toast('Not enough gold!'); return; }
  g.vault-=cost; if(k==='drone'){ g.workers++; var a=g.assign; var free=g.workers-Object.keys(a).reduce(function(n,q){ return n+Number(a[q]||0); },0); if(free>0) a.ore=(Number(a.ore)||0)+1; } else g.up[k]=lvl(g,k)+1;
  sfx('buy'); save(); paint();
}
function catchNug(){ var g=raw(), m=G(); if(!m||!m.nug) return; var v=Math.max(60,rate(g)*45+clickVal(g)*20); earn(g,v); g.nuggets++; m.nug=null; m.nugT=40+Math.random()*40; sfx('nug'); toast('✨ Mother Lode! +'+fmt(v)); try{ celebrate(); }catch(e){} save(); paint(); }
function descend(){
  var g=raw(), m=G(); var gain=descGain(g); if(gain<1){ sfx('no'); return; }
  if(!m.confirm){ m.confirm=true; paint(); return; }
  g.gems+=gain; g.runs++; g.vault=0; g.runEarned=0; g.workers=6; g.assign={ore:2,crystal:2,relic:2}; g.up={}; m.confirm=false; m.nug=null; sfx('ach'); toast('⬇ You descended! +'+gain+' 💠 Gems (+'+gain*10+'% income forever)'); save(); paint();
}
var tab=null;

/* ------------------------------ rendering ------------------------------ */
function btn(g,k,label,desc,cost,max){ var lv=lvl(g,k), capped=max&&lv>=max; return '<button class="gm-buy'+(capped||g.vault<cost?' poor':'')+'" data-gm="buy" data-k="'+k+'" data-cost="'+(capped?'':cost)+'"><b>'+label+(max?' '+lv+'/'+max:lv?' Lv '+lv:'')+'</b><small>'+desc+'</small><em>'+(capped?'MAX':'🪙 '+fmt(cost))+'</em></button>'; }
function inner(g,m){
  var total=Object.keys(g.assign).reduce(function(n,k){ return n+Number(g.assign[k]||0); },0), free=g.workers-total;
  var layers=LAYERS.map(function(L){
    var n=Number(g.assign[L.id])||0, drones=''; for(var i=0;i<Math.min(n,14);i++) drones+='<span class="gm-drone" style="--i:'+i+'">🤖</span>';
    var c=COST[L.id](g);
    return '<div class="gm-layer" style="--lc:'+L.col+';--lb:'+L.bg+'"><div class="gm-lhead"><span class="gm-li">'+L.icon+'</span><div><b>'+L.name+'</b><small id="gm-lr-'+L.id+'">'+fmt(layerRate(g,L)*gm(g))+'/s</small></div><div class="gm-asg"><button data-gm="adj" data-id="'+L.id+'" data-d="-1" '+(n<=0?'disabled':'')+'>−</button><b>'+n+'</b><button data-gm="adj" data-id="'+L.id+'" data-d="1" '+(free<=0?'disabled':'')+'>+</button></div></div><div class="gm-tunnel" id="gm-layer-'+L.id+'">'+drones+(n>14?'<em class="gm-more">+'+(n-14)+'</em>':'')+'</div><button class="gm-drill'+(g.vault<c?' poor':'')+'" data-gm="buy" data-k="'+L.id+'" data-cost="'+c+'">🔩 Drill Lv '+lvl(g,L.id)+' → +25% · 🪙 '+fmt(c)+'</button></div>'; }).join('');
  var shop=btn(g,'drone','🤖 Drone','+1 worker drone',COST.drone(g))+btn(g,'click','⛏️ Prospector','+60% dig power',COST.click(g))+btn(g,'crit','🍀 Lucky Pick','+2% crit chance (x5)',COST.crit(g),MAXL.crit)+btn(g,'refine','🏭 Refinery','+10% all income',COST.refine(g))+btn(g,'storage','🏚️ Deep Storage','+2h offline cap',COST.storage(g),MAXL.storage);
  var gain=descGain(g);
  var desc='<div class="gm-desc"><b>⬇ Descend</b><small>Reset vault, drones &amp; upgrades for permanent <b>💠 Gems</b> (+10% income each).</small><div>Gain now: <b id="gm-dg">'+gain+'</b> 💠 · you have '+g.gems+'</div><button class="gm-buy '+(gain<1?'poor':'')+'" data-gm="descend">'+(m.confirm?'Tap again to confirm':gain<1?'Earn '+fmt(Math.max(0,20000-g.runEarned))+' more this run':'Descend for '+gain+' 💠')+'</button></div>';
  var ach='<div class="gm-ach">'+ACH.map(function(a){ var on=g.ach[a.id]; return '<div class="'+(on?'on':'')+'"><span>'+(on?'🏆':'🔒')+'</span><b>'+a.n+'</b><small>'+a.d+' · +'+a.c+' 🪙</small></div>'; }).join('')+'</div>';
  var back=m.back?'<div class="gm-back" data-gm="dismiss">💤 Welcome back! Your drones mined <b>'+fmt(m.back.gain)+'</b> over '+(m.back.secs>=3600?(m.back.secs/3600).toFixed(1)+'h':Math.round(m.back.secs/60)+'m')+(m.back.capped?' (offline cap reached)':'')+'. <u>Dismiss</u></div>':'';
  return back+'<div class="gm-top"><div class="gm-big"><small>Vault</small><b id="gm-vault">'+fmt(g.vault)+'</b></div><div class="gm-box"><small>Income</small><b id="gm-rate">'+fmt(rate(g))+'/s</b></div><div class="gm-box"><small>Gems</small><b>💠 '+g.gems+'</b></div><div class="gm-box"><small>Drones</small><b>'+total+'/'+g.workers+'</b></div><div class="gm-tools"><button data-gm="mute" class="gm-tl">'+(muted()?'🔇':'🔊')+'</button><button data-gm="fs" class="gm-tl" title="Fullscreen">⛶</button></div></div>'+
    '<div class="gm-body"><div class="gm-left"><div class="gm-foreman">'+ling()+'</div><div class="gm-veinwrap" id="gm-vein"><button class="gm-vein" id="gm-vein-btn" data-gm="dig" aria-label="Dig"><span>⛏️</span><b>DIG</b><small id="gm-dig">+'+fmt(clickVal(g))+' · crit '+Math.round(critP(g)*100)+'%</small></button><div class="gm-heat"><i id="gm-heat" style="width:'+(m.heat/20*100)+'%"></i></div><small class="gm-ht">Keep digging fast to build heat (up to ×2)</small></div>'+(m.nug?'<button class="gm-nug" id="gm-nug" data-gm="nug" style="left:'+m.nug.x+'%;top:'+m.nug.y+'%">✨</button>':'')+'</div>'+
    '<div class="gm-mid"><div class="gm-free">'+(free>0?'👷 '+free+' idle drone'+(free>1?'s':'')+' — assign them below!':'All drones are working.')+'</div>'+layers+'</div>'+
    '<div class="gm-right"><h4>🏪 Upgrades</h4><div class="gm-shop">'+shop+'</div>'+desc+'<h4 style="margin-top:10px">🏆 Milestones</h4>'+ach+'<div class="gm-fine">Offline earnings are capped at '+capH(g)+' hours and use your last saved time.</div></div></div><div class="gm-toast" id="gm-toast"></div>';
}
function live(g,m){
  var set=function(id,v){ var e=$(id); if(e) e.textContent=v; };
  set('gm-vault',fmt(g.vault)); set('gm-rate',fmt(rate(g))+'/s'); set('gm-dg',descGain(g));
  var h=$('gm-heat'); if(h) h.style.width=(m.heat/20*100)+'%';
  document.querySelectorAll('#gm-root [data-cost]').forEach(function(b){ var c=b.getAttribute('data-cost'); b.classList.toggle('poor',!c||g.vault<Number(c)); });
  if(m.nug&&!$('gm-nug')||!m.nug&&$('gm-nug')) paint();
}
function paint(){ var m=G(), root=$('gm-root'); if(!m||!root) return; var sc=root.scrollTop; root.innerHTML=inner(raw(),m); root.scrollTop=sc; }
window.arcadeGoldHtml=function(){
  var m=G(); if(!m) return ''; var g=raw();
  var st='<span class="arcade-pill">🏦 <b>'+fmt(g.vault)+'</b></span><span class="arcade-pill">⚙ <b>'+fmt(rate(g))+'/s</b></span><span class="arcade-pill">💠 <b>'+g.gems+'</b></span>';
  return arcadeFrame('Gold Rush Mines','Dig, assign drones, upgrade, catch Mother Lodes and descend for permanent Gems.',st,'<div class="gm-root" id="gm-root">'+inner(g,m)+'</div>');
};

/* ------------------------------ input ------------------------------ */
function isFS(){ var st=$('games-stage'); return !!st&&(document.fullscreenElement===st||document.webkitFullscreenElement===st); }
function toggleFS(){ var w=$('games-stage'); if(!w) return; try{ if(isFS()) (document.exitFullscreen||document.webkitExitFullscreen).call(document); else (w.requestFullscreen||w.webkitRequestFullscreen).call(w); }catch(e){} }
document.addEventListener('click',function(e){
  var m=G(); if(!m) return; var t=e.target.closest&&e.target.closest('[data-gm]'); if(!t||t.disabled) return; var a=t.getAttribute('data-gm');
  if(a==='dig') dig(e);
  else if(a==='adj') window.arcadeGoldAdjust(t.getAttribute('data-id'),parseInt(t.getAttribute('data-d'),10));
  else if(a==='buy') buy(t.getAttribute('data-k'));
  else if(a==='nug') catchNug();
  else if(a==='descend') descend();
  else if(a==='dismiss'){ m.back=null; paint(); }
  else if(a==='mute'){ try{ localStorage.setItem('gx-mute',muted()?'0':'1'); }catch(er){} paint(); }
  else if(a==='fs') toggleFS();
});
document.addEventListener('keydown',function(e){ var m=G(); if(!m||state.view!=='games') return; var k=e.key.toLowerCase(); if(k==='f'){ toggleFS(); } else if(k===' '||k==='enter'){ if(e.target&&/BUTTON|INPUT/.test(e.target.tagName)) return; e.preventDefault(); dig(e); } });
document.addEventListener('visibilitychange',function(){ if(document.hidden&&G()) save(); });
window.__gm={raw:raw,rate:rate,buy:buy,dig:dig,descend:descend,catchNug:catchNug,get:G,tick:tick,COST:COST,descGain:descGain};
})();
