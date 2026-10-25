/* Live Game modes — unique animated scenes for each game mode (host big-screen + player HUD).
   Scenes are persistent DOM nodes that are patched (not rebuilt) so CSS transitions animate smoothly
   even though the live screens re-render on every socket event. */
(function(){
'use strict';
var LV = window.LV;
var M = window.LVM = { els:{}, feed:[], intro:null, introTimer:null, lastAlive:{}, lastRank:{}, lastT:{}, storm:false };
function $(id){ return document.getElementById(id); }
function el(tag, cls, html){ var e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }
function ctx(){ var L=state.live, r=L.ranks||{}; return { track:M.track||80, storm:!!M.storm, meId:L.playerId, role:L.role, mode:L.mode, rank:r[L.playerId]||0, count:L.count||0, alive:L.alive }; }
function recent(p,ms){ return !!(p.last && Date.now()-p.last.t<ms); }
function fresh(p){ var t=p.last&&p.last.t; if(!t||M.lastT[p.id]===t) return false; var first=M.lastT[p.id]===undefined; M.lastT[p.id]=t; return !first; }
function rk(c,players,p){ return c.rank || (players.indexOf(p)+1); }
function initial(n){ return esc((n||'?').trim().charAt(0).toUpperCase()||'?'); }
var HUES = [350,210,40,150,280,20,180,320,100,240,60,0];
function hue(id,i){ var h=0; for(var k=0;k<String(id).length;k++) h=(h*31+String(id).charCodeAt(k))>>>0; return HUES[(h+i)%HUES.length]; }
function col(p,i){ return 'hsl('+hue(p.id,0)+' 75% 58%)'; }

/* ---------- ROCKET RACE ---------- */
var rocketSvg = '<svg viewBox="0 0 80 40" class="rk-ship" aria-hidden="true"><defs><linearGradient id="rkb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#c9d4ee"/></linearGradient></defs><path d="M10 12 L2 4 L22 10Z M10 28 L2 36 L22 30Z" fill="var(--rk)"/><path d="M14 8 H54 Q72 20 54 32 H14 Q8 20 14 8Z" fill="url(#rkb)" stroke="#9fb0d6" stroke-width="1"/><circle cx="46" cy="20" r="6" fill="#58b8ff" stroke="#fff" stroke-width="2"/><path d="M30 8 H40 L44 20 L40 32 H30 Q34 20 30 8Z" fill="var(--rk)" opacity=".85"/></svg>';
var Rocket = {
  host: function(){
    var e = el('div','rk-scene'); e.innerHTML='<div class="rk-stars s1"></div><div class="rk-stars s2"></div><div class="rk-planet"></div><div class="rk-finish"><span>FINISH</span></div><div class="rk-lanes"></div>'; return e;
  },
  update: function(e, players, c, me){
    var lanes = e.querySelector('.rk-lanes'); var order = players.slice().sort(function(a,b){return a.id<b.id?-1:1;});
    var maxLanes=14; var shown = order.slice(0,maxLanes);
    shown.forEach(function(p,i){
      var ln = lanes.querySelector('[data-id="'+p.id+'"]');
      if(!ln){ ln=el('div','rk-lane'); ln.setAttribute('data-id',p.id); ln.innerHTML='<span class="rk-name"></span><div class="rk-track"><div class="rk-ship-wrap"><span class="rk-flame"></span>'+rocketSvg+'<span class="rk-tag"></span></div></div>'; ln.style.setProperty('--rk',col(p,i)); lanes.appendChild(ln); }
      var pct = Math.min(1, (p.dist||0)/c.track);
      var w = ln.querySelector('.rk-ship-wrap'); w.style.left = 'calc('+(pct*100)+'% - '+(pct*74)+'px)';
      ln.querySelector('.rk-name').innerHTML = esc(p.name)+(p.id===c.meId?' <i>you</i>':'');
      ln.classList.toggle('turbo', (p.streak||0)>=3); ln.classList.toggle('done', !!p.finish); ln.classList.toggle('stall', !!(p.last&&p.last.c===false&&recent(p,2200)));
      ln.querySelector('.rk-tag').textContent = p.finish ? '🏁 #'+p.finish : Math.round(p.dist||0)+' km';
    });
  },
  me: function(){ var e=el('div','hud hud-rk'); e.innerHTML='<div class="hud-row"><b class="hud-big" data-k="km">0</b><span>km</span><span class="hud-chip" data-k="rank"></span></div><div class="rk-mini"><div class="rk-mini-bar"><div class="rk-mini-fill"></div><div class="rk-mini-ship">🚀</div></div><span class="rk-mini-flag">🏁</span></div><p class="hud-note" data-k="note"></p>'; return e; },
  meUpdate: function(e,p,c,players){
    var pct=Math.min(100,Math.round((p.dist||0)/c.track*100)); e.querySelector('.rk-mini-fill').style.width=pct+'%'; e.querySelector('.rk-mini-ship').style.left='calc('+pct+'% - 14px)';
    e.querySelector('[data-k=km]').textContent=Math.round(p.dist||0)+' / '+c.track; e.querySelector('[data-k=rank]').textContent='#'+rk(c,players,p)+(c.count?' of '+c.count:'');
    e.classList.toggle('turbo',(p.streak||0)>=3); e.querySelector('[data-k=note]').textContent=(p.streak||0)>=3?'🔥 TURBO active — keep the streak alive!':(p.finish?'🏁 You finished #'+p.finish+'!':'Answer fast for more thrust.');
  }
};

/* ---------- TOWER CLIMB ---------- */
var Tower = {
  host: function(){ var e=el('div','tw-scene'); e.innerHTML='<div class="tw-sky"></div><div class="tw-sun"></div><div class="tw-rain"></div><div class="tw-flash"></div><div class="tw-city"></div><div class="tw-ground"></div><div class="tw-towers"></div>'; return e; },
  towerEl: function(p,i){
    var t=el('div','tw-col'); t.setAttribute('data-id',p.id); t.style.setProperty('--tc',col(p,i)); t.innerHTML='<div class="tw-top"><span class="tw-crown">👑</span><span class="tw-shield">🛡️</span><b class="tw-count"></b></div><div class="tw-stack"></div><div class="tw-name"></div>'; return t; },
  update: function(e, players, c){
    var wrap=e.querySelector('.tw-towers'), order=players.slice().sort(function(a,b){return a.id<b.id?-1:1;}).slice(0,12);
    var maxF=Math.max(6, Math.max.apply(null,players.map(function(p){return p.floors||0;}))); var ph=Math.min(30, Math.floor(250/maxF));
    e.style.setProperty('--bh', ph+'px'); var leader=players.length?players[0].id:null; var topF=players.length?players[0].floors:0;
    order.forEach(function(p,i){
      var t=wrap.querySelector('[data-id="'+p.id+'"]'); if(!t){ t=Tower.towerEl(p,i); wrap.appendChild(t); }
      var stack=t.querySelector('.tw-stack'); var live=stack.querySelectorAll('.tw-block:not(.fall)').length;
      var n=p.floors||0; while(live<n){ var b=el('div','tw-block'+(live%2?' alt':'')+' drop'); b.innerHTML='<i></i><i></i><i></i>'; stack.appendChild(b); live++; }
      while(live>n){ var bl=stack.querySelectorAll('.tw-block:not(.fall)'); var lst=bl[bl.length-1]; lst.classList.add('fall'); (function(x){ setTimeout(function(){ if(x.parentNode) x.parentNode.removeChild(x); },560); })(lst); live--; t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); }
      t.querySelector('.tw-count').textContent=n; t.querySelector('.tw-name').innerHTML=esc(p.name)+(p.id===c.meId?' <i>you</i>':'');
      t.classList.toggle('shielded',!!p.shield); t.classList.toggle('lead', p.id===leader && topF>0);
    });
    e.classList.toggle('storm', !!c.storm);
  },
  me: function(){ var e=el('div','hud hud-tw'); e.innerHTML='<div class="hud-row"><b class="hud-big" data-k="f">0</b><span>floors</span><span class="hud-chip" data-k="rank"></span><span class="hud-chip sh" data-k="sh">🛡️ Shield</span></div><div class="tw-mini"></div><p class="hud-note" data-k="note"></p>'; return e; },
  meUpdate: function(e,p,c,players){
    var s=e.querySelector('.tw-mini'); var n=p.floors||0, cur=s.children.length; while(cur<n&&cur<30){ s.appendChild(el('div','tw-mb'+(cur%2?' alt':''))); cur++; } while(cur>n){ s.removeChild(s.lastElementChild); cur--; }
    e.querySelector('[data-k=f]').textContent=n; e.querySelector('[data-k=rank]').textContent='#'+rk(c,players,p); e.querySelector('[data-k=sh]').style.display=p.shield?'':'none';
    e.querySelector('[data-k=note]').textContent=c.storm?'⛈️ STORM — a wrong answer costs 2 floors!':(p.shield?'Your shield will block the next collapse.':'3 correct in a row earns a shield.');
    e.classList.toggle('storm',!!c.storm);
  }
};

function countUp(node,from,to){ var t0=performance.now(), dur=700; (function f(t){ var k=Math.min(1,(t-t0)/dur); node.textContent=Math.round(from+(to-from)*(1-Math.pow(1-k,3))); if(k<1) requestAnimationFrame(f); })(t0); }

/* ---------- TRIVIA DASH ---------- */
var Trivia = {
  host: function(){ var e=el('div','tv-scene'); e.innerHTML='<div class="tv-rows"></div>'; return e; },
  update: function(e, players, c){
    var wrap=e.querySelector('.tv-rows'); var show=players.slice(0,10); var max=Math.max(1,players.length?players[0].score:1); wrap.style.height=(show.length*50)+'px';
    var seen={};
    show.forEach(function(p,rank){ seen[p.id]=1;
      var r=wrap.querySelector('[data-id="'+p.id+'"]'); if(!r){ r=el('div','tv-row'); r.setAttribute('data-id',p.id); r.innerHTML='<span class="tv-rank"></span><span class="tv-name"></span><div class="tv-bar"><div class="tv-fill"></div></div><b class="tv-score"></b><span class="tv-badge"></span>'; r.style.setProperty('--tc',col(p,rank)); r.style.transform='translateY('+(rank*50)+'px)'; wrap.appendChild(r); }
      r.style.transform='translateY('+(rank*50)+'px)'; r.querySelector('.tv-rank').textContent=rank+1; r.querySelector('.tv-name').innerHTML=esc(p.name)+(p.id===c.meId?' <i>you</i>':'');
      r.querySelector('.tv-fill').style.width=Math.max(3,Math.round(p.score/max*100))+'%'; var sc=r.querySelector('.tv-score'); var from=+sc.getAttribute('data-v')||0; if(from!==p.score){ sc.setAttribute('data-v',p.score); countUp(sc,from,p.score); }
      var prev=M.lastRank[p.id]; var b=r.querySelector('.tv-badge'); b.textContent=(p.last&&p.last.c&&/Quick/.test(p.last.msg||'')&&recent(p,2500))?'⚡':(prev!=null&&prev>rank?'▲':(prev!=null&&prev<rank?'▼':'')); b.className='tv-badge'+(b.textContent==='▲'?' up':b.textContent==='▼'?' down':''); M.lastRank[p.id]=rank; r.classList.toggle('first',rank===0&&p.score>0);
    });
    Array.prototype.slice.call(wrap.children).forEach(function(r){ if(!seen[r.getAttribute('data-id')]) r.style.opacity=0; });
  },
  me: function(){ var e=el('div','hud hud-tv'); e.innerHTML='<div class="hud-row"><b class="hud-big" data-k="rank">#1</b><span class="hud-chip" data-k="score"></span><span class="hud-chip" data-k="gap"></span></div><p class="hud-note">Answer quickly and correctly — every right answer earns points, speed earns more.</p>'; return e; },
  meUpdate: function(e,p,c,players){ var r=rk(c,players,p); e.querySelector('[data-k=rank]').textContent='#'+r; e.querySelector('[data-k=score]').textContent=p.score+' pts'; var sorted=players.filter(function(x){return x.id!==p.id&&x.score>=p.score;}).sort(function(a,b){return a.score-b.score;}); var up=sorted[0]; e.querySelector('[data-k=gap]').textContent=r===1?'👑 You lead!':(up?(up.score-p.score+1)+' pts to pass '+up.name:'Climb the board!'); }
};
var SCENES = M.SCENES = { rocket:Rocket, tower:Tower, trivia:Trivia };

/* ---------- mounting ---------- */
function mount(){
  var c=ctx(); var S=SCENES[c.mode]; if(!S) return; var players=window.lvShown?window.lvShown():state.live.players;
  document.querySelectorAll('.lv-scene-slot').forEach(function(slot){
    var kind=slot.getAttribute('data-scene'); var key=kind+':'+c.mode; var rec=M.els[kind];
    if(!rec||rec.key!==key){ rec={key:key,el:kind==='host'?S.host():S.me()}; M.els[kind]=rec; rec.el.classList.add('lvm-scene'); }
    slot.appendChild(rec.el);
    if(kind==='host') S.update(rec.el,players,c);
    else { var me=state.live.me||players.find(function(p){return p.id===c.meId;}); if(me) S.meUpdate(rec.el,me,c,players); }
  });
}
function renderFeed(){
  var f=$('lv-feed'); if(!f) return; var now=Date.now(); M.feed=M.feed.filter(function(x){return now-x.t<9000;});
  f.innerHTML=M.feed.slice(-4).map(function(x){return '<div class="lv-feed-item '+(x.type||'')+'">'+esc(x.text)+'</div>';}).join('');
}
M.pushFeed=function(text,type){ M.feed.push({text:text,type:type,t:Date.now()}); renderFeed(); setTimeout(renderFeed,9100); };
M.refresh=function(){ mount(); };
M.reset=function(){ M.els={}; M.feed=[]; M.lastAlive={}; M.lastRank={}; M.lastT={}; M.intro=null; M.track=null; M.storm=false; hideIntro(); };

/* ---------- intro overlay ---------- */
var ICON = { trivia:'⚡', rocket:'🚀', tower:'🏗️', zombie:'🧟', gems:'💎', elimination:'☄️' };
function hideIntro(){ clearTimeout(M.introTimer); var o=$('lv-intro'); if(o&&o.parentNode) o.parentNode.removeChild(o); }
M.showIntro=function(d){
  if(d.meta&&d.meta.trackLength) M.track=d.meta.trackLength; hideIntro();
  var o=el('div','lv-intro lvm-'+d.mode); o.id='lv-intro'; o.setAttribute('role','dialog'); o.setAttribute('aria-label',d.title+' — get ready');
  o.innerHTML='<div class="lv-intro-card"><div class="lv-intro-ico">'+(ICON[d.mode]||'🎮')+'</div><p class="lv-eyebrow">GET READY</p><h2>'+esc(d.title)+'</h2><p class="lv-intro-tag">'+esc(d.tagline)+'</p><ul>'+(d.rules||[]).map(function(r,i){return '<li style="animation-delay:'+(0.5+i*0.45)+'s">'+esc(r)+'</li>';}).join('')+'</ul><div class="lv-intro-bar"><i style="animation-duration:'+(d.ms||4000)+'ms"></i></div></div>';
  document.body.appendChild(o); M.introTimer=setTimeout(hideIntro,(d.ms||4000)+150);
};

/* ---------- mode descriptions shown in the host setup ---------- */
try{ Object.assign(GAME_MODES.trivia,{desc:'Race the clock at your own pace — fast, correct answers climb the live podium.'}); Object.assign(GAME_MODES.rocket,{desc:'Every correct answer fires your engines. Streaks trigger TURBO — first across the finish line wins.'}); Object.assign(GAME_MODES.tower,{desc:'Build a skyline floor by floor. Earn shields, survive storms, out-build everyone.'}); }catch(e){}
/* ---------- hooks ---------- */
var prevAfter=window.lvAfterRender;
window.lvAfterRender=function(scr){
  if(prevAfter) prevAfter(scr);
  var stage=$('live-stage'); if(stage){ stage.className=stage.className.replace(/\blvm-\S+/g,'').trim(); if(state.live.mode&&scr!=='hub'&&scr!=='host-setup'&&scr.indexOf('creator')<0&&scr!=='library'&&scr!=='join-form') stage.classList.add('lvm-'+state.live.mode); }
  mount(); renderFeed();
};
var prevTear=window.liveTeardown; window.liveTeardown=function(){ prevTear(); M.reset(); };
})();
