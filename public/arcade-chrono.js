/* Chrono Hex Puzzle v2 — animated match-3 campaign.
   8×8 board, six elements, gravity + cascades with combo multipliers, special gems (4-match line, L/T bomb, 5-match rainbow),
   ice tiles to break, level goals (score + ice) with a move limit, drag/swipe or click swaps, idle hints, auto-reshuffle,
   Indexling spell meter that earns spells (Rewind, Hammer, Elemental Burst, Shuffle), fullscreen on the persistent games stage.
   Overrides arcadeHexStart/arcadeHexHtml. Progress: gameProgress.chrono = {best, spells, level, bestCombo, cleared}.
   Coins: +4 for the first clear of a level, +1 for replays (via addCoins). */
(function(){
'use strict';
var $=function(id){ return document.getElementById(id); };
var N=8;
var TYPES=[{n:'Ember',s:'🔥',c:'#ff7a5c',d:'#b92d18'},{n:'Tide',s:'💧',c:'#55b0ff',d:'#1b62b8'},{n:'Leaf',s:'🌿',c:'#5be68f',d:'#17844a'},{n:'Spark',s:'⚡',c:'#ffdc5a',d:'#b88a0a'},{n:'Void',s:'🔮',c:'#b98aff',d:'#6a3bc0'},{n:'Sun',s:'☀️',c:'#ffab5a',d:'#b8570a'}];
function rnd(n){ return (Math.random()*n)|0; }
function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
var AC=null;
function muted(){ try{ return localStorage.getItem('gx-mute')==='1'; }catch(e){ return false; } }
function tone(f1,f2,d,type,v){ if(muted()) return; try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume(); var o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime; o.type=type||'triangle'; o.frequency.setValueAtTime(f1,t); o.frequency.exponentialRampToValueAtTime(f2,t+d); g.gain.setValueAtTime(v||.07,t); g.gain.exponentialRampToValueAtTime(.0001,t+d); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+d+.02); }catch(e){} }
function sfx(k,n){ n=n||0; if(k==='pop') tone(440+n*90,700+n*120,.12,'triangle',.07); else if(k==='swap') tone(300,420,.07,'sine',.05); else if(k==='bad') tone(200,120,.15,'sawtooth',.05); else if(k==='spec') tone(500,1400,.3,'square',.06); else if(k==='win'){ tone(440,1320,.6,'triangle',.1); } else if(k==='lose') tone(300,70,.6,'sawtooth',.09); else if(k==='spell') tone(400,1200,.35,'sine',.09); }
var G=function(){ return state.games&&state.games.cx?state.games:null; };
function stats(){ try{ return arcadeCharacterStats()||{}; }catch(e){ return {}; } }
function ling(){ try{ return arcadeCharacterHtml(); }catch(e){ return ''; } }
function prog(){ var gp=arcadeGameProgress(); gp.chrono=gp.chrono||{best:0,spells:0}; return gp.chrono; }

/* ------------------------------ levels ------------------------------ */
function levelCfg(L){
  var s=stats();
  return {level:L,target:280+L*170+(L>5?(L-5)*50:0),moves:18+Math.min(6,Math.floor(L/3))+((s.speed||0)>=3?2:0),types:L<3?5:6,ice:L>=3?Math.min(16,2+L*2):0};
}
function chargeMax(){ var f=stats().focus||100; return Math.max(14,26-Math.floor(f/45)); }

/* ------------------------------ board logic ------------------------------ */
function T(g,t,s){ return {id:++g.nid,t:t,s:s||''}; }
function runs(b){
  var out=[],x,y,i,k,t;
  for(y=0;y<N;y++){ x=0; while(x<N){ i=y*N+x; t=b[i]&&b[i].t; if(t==null||t>5){ x++; continue; } k=x; while(k+1<N&&b[y*N+k+1]&&b[y*N+k+1].t===t) k++; if(k-x>=2){ var c=[]; for(var q=x;q<=k;q++) c.push(y*N+q); out.push({cells:c,dir:'h',t:t}); } x=k+1; } }
  for(x=0;x<N;x++){ y=0; while(y<N){ i=y*N+x; t=b[i]&&b[i].t; if(t==null||t>5){ y++; continue; } k=y; while(k+1<N&&b[(k+1)*N+x]&&b[(k+1)*N+x].t===t) k++; if(k-y>=2){ var c2=[]; for(var q2=y;q2<=k;q2++) c2.push(q2*N+x); out.push({cells:c2,dir:'v',t:t}); } y=k+1; } }
  return out;
}
function swapIdx(b,i,j){ var t=b[i]; b[i]=b[j]; b[j]=t; }
function findMove(b){
  for(var i=0;i<N*N;i++){ var x=i%N,y=(i/N)|0; var nb=[]; if(x<N-1) nb.push(i+1); if(y<N-1) nb.push(i+N);
    for(var k=0;k<nb.length;k++){ var j=nb[k]; if(!b[i]||!b[j]) continue; if(b[i].s==='rainbow'||b[j].s==='rainbow') return [i,j]; swapIdx(b,i,j); var ok=runs(b).length>0; swapIdx(b,i,j); if(ok) return [i,j]; } }
  return null;
}
function randType(g,k){ return rnd(g.cfg.types); }
function fillFresh(g){
  var tries=0;
  do{ var b=[]; for(var i=0;i<N*N;i++){ var t,guard=0; do{ t=rnd(g.cfg.types); guard++; var x=i%N,y=(i/N)|0, bad=false; if(x>=2&&b[i-1].t===t&&b[i-2].t===t) bad=true; if(y>=2&&b[i-N].t===t&&b[i-2*N].t===t) bad=true; }while(bad&&guard<20); b.push(T(g,t)); } tries++; }while((!findMove(b)||runs(b).length)&&tries<40);
  g.b=b;
}
function shuffleBoard(g){
  var tiles=g.b.slice(), tries=0;
  do{ for(var i=tiles.length-1;i>0;i--){ var j=rnd(i+1),t=tiles[i]; tiles[i]=tiles[j]; tiles[j]=t; } g.b=tiles.slice(); tries++; }while((runs(g.b).length||!findMove(g.b))&&tries<60);
  if(runs(g.b).length||!findMove(g.b)) fillFresh(g);
}

/* ------------------------------ level lifecycle ------------------------------ */
window.arcadeHexStart=function(){
  clearGameTimers(); var p=prog();
  var g={active:'chrono',cx:1,ph:'title',nid:0,level:1,unlocked:Math.max(1,Number(p.level)||1),busy:false,sel:-1,tool:'',els:{},fx:[]};
  g.level=Math.min(g.unlocked,g.unlocked); g.spells=Math.min(9,Number(p.spells)||0); g.charge=0;
  state.games=g;
};
function begin(g){
  clearTimeout(g.hintT); g.cfg=levelCfg(g.level); g.ph='play'; g.score=0; g.moves=g.cfg.moves; g.maxCombo=0; g.busy=false; g.sel=-1; g.tool=''; g.els={}; g.nid=0; g.charge=g.charge||0;
  fillFresh(g);
  g.ice=[]; for(var i=0;i<N*N;i++) g.ice.push(0);
  var left=g.cfg.ice; while(left>0){ var k=rnd(N*N); if(!g.ice[k]){ g.ice[k]=1; left--; } }
  g.iceTotal=g.cfg.ice; g.iceLeft=g.cfg.ice; g.say='Match three or more gems!';
  renderGames();
}
function finishLevel(g,won){
  g.busy=true; clearTimeout(g.hintT); var p=prog();
  p.best=Math.max(Number(p.best)||0,g.score); p.bestCombo=Math.max(Number(p.bestCombo)||0,g.maxCombo); p.spells=g.spells;
  if(won){ var first=g.level>=g.unlocked; if(first){ g.unlocked=g.level+1; p.level=g.unlocked; } p.cleared=Math.max(Number(p.cleared)||0,g.level); g.coins=first?4:1; try{ addCoins(g.coins,'Chrono Hex clear'); }catch(e){} g.bonus=g.moves*20; g.score+=g.bonus; p.best=Math.max(p.best,g.score); sfx('win'); try{ celebrate(); }catch(e){} }
  else sfx('lose');
  try{ persistProgress(); }catch(e){}
  setTimeout(function(){ if(G()!==g) return; g.ph=won?'win':'lose'; paintFull(g); },won?700:500);
}
function persist(g){ var p=prog(); p.best=Math.max(Number(p.best)||0,g.score); p.bestCombo=Math.max(Number(p.bestCombo)||0,g.maxCombo); p.spells=g.spells; try{ persistProgress(); }catch(e){} }

/* ------------------------------ element/DOM sync ------------------------------ */
function tileEl(g,tile){
  var el=g.els[tile.id]; var ty=TYPES[tile.t];
  if(!el){ el=document.createElement('div'); el.className='cx-t'; el.dataset.id=tile.id; g.els[tile.id]=el; var bd=$('cx-board'); if(bd) bd.appendChild(el); }
  var key=tile.t+'|'+tile.s;
  if(el._k!==key){ el._k=key; Array.prototype.slice.call(el.classList).forEach(function(c){ if(c.indexOf('sp-')===0) el.classList.remove(c); }); if(tile.s) el.classList.add('sp-'+tile.s);
    if(tile.t<6&&ty){ el.style.setProperty('--c',ty.c); el.style.setProperty('--d',ty.d); el.innerHTML='<i>'+ty.s+'</i>'; }
    else { el.innerHTML='<i>🌈</i>'; el.style.setProperty('--c','#fff'); el.style.setProperty('--d','#888'); } }
  return el;
}
function place(g,animateFromTop){
  var dropCount={};
  for(var i=0;i<N*N;i++){ var tile=g.b[i]; if(!tile) continue; var x=i%N,y=(i/N)|0; var el=g.els[tile.id];
    if(!el){ el=tileEl(g,tile); el.style.setProperty('--x',x); var c=(dropCount[x]=(dropCount[x]||0)+1); el.style.setProperty('--y',-c-1); el.style.transition='none'; void el.offsetWidth; el.style.transition=''; }
    else { tileEl(g,tile); }
    el.style.setProperty('--x',x); el.style.setProperty('--y',y); el.classList.toggle('sel',g.sel===i); }
  // ice layer
  var cells=document.querySelectorAll('#cx-board .cx-cell'); cells.forEach(function(c,k){ c.classList.toggle('ice',!!g.ice[k]); });
}
function buildBoard(g){
  var bd=$('cx-board'); if(!bd) return; bd.innerHTML='';
  for(var i=0;i<N*N;i++){ var c=document.createElement('div'); c.className='cx-cell'+(g.ice[i]?' ice':''); c.style.setProperty('--x',i%N); c.style.setProperty('--y',(i/N)|0); bd.appendChild(c); }
  g.els={}; for(var k=0;k<N*N;k++){ var t=g.b[k]; if(t){ var el=tileEl(g,t); el.style.transition='none'; el.style.setProperty('--x',k%N); el.style.setProperty('--y',(k/N)|0); } }
  void bd.offsetWidth; Array.prototype.forEach.call(bd.querySelectorAll('.cx-t'),function(e){ e.style.transition=''; });
  fit();
}
function fit(){
  var g=G(); var wrap=$('cx-main'); var bd=$('cx-board'); if(!wrap||!bd) return;
  var fs=isFS(), availW=wrap.clientWidth, availH=(window.innerHeight)-(fs?210:330);
  var cs=Math.floor(Math.max(34,Math.min(fs?96:72,availW/N,availH/N))); bd.parentNode.style.setProperty('--cs',cs+'px');
}
function floatText(g,i,txt,cls){
  var fx=$('cx-fx'); if(!fx) return; var s=document.createElement('span'); s.className='cx-float '+(cls||''); s.textContent=txt;
  s.style.setProperty('--x',(i%N)); s.style.setProperty('--y',((i/N)|0)); fx.appendChild(s); setTimeout(function(){ if(s.parentNode) s.parentNode.removeChild(s); },1100);
}

/* ------------------------------ resolve engine ------------------------------ */
function expand(g,set){
  var queue=Array.from(set), seen=new Set(queue), usedSpecial=false;
  while(queue.length){ var i=queue.pop(), tile=g.b[i]; if(!tile||!tile.s) continue; var x=i%N,y=(i/N)|0, add=[];
    if(tile.s==='row'){ for(var a=0;a<N;a++) add.push(y*N+a); }
    else if(tile.s==='col'){ for(var b=0;b<N;b++) add.push(b*N+x); }
    else if(tile.s==='bomb'){ for(var dy=-1;dy<=1;dy++) for(var dx=-1;dx<=1;dx++){ var nx=x+dx,ny=y+dy; if(nx>=0&&nx<N&&ny>=0&&ny<N) add.push(ny*N+nx); } }
    else if(tile.s==='rainbow'){ var cnt={},best=0; g.b.forEach(function(t){ if(t&&t.t<6){ cnt[t.t]=(cnt[t.t]||0)+1; } }); var tt=-1; Object.keys(cnt).forEach(function(k){ if(cnt[k]>best){ best=cnt[k]; tt=+k; } }); g.b.forEach(function(t,k){ if(t&&t.t===tt) add.push(k); }); }
    if(add.length) usedSpecial=true;
    add.forEach(function(k){ if(!seen.has(k)&&g.b[k]){ seen.add(k); queue.push(k); } });
  }
  return {set:seen,special:usedSpecial};
}
async function clearAndFall(g,set,made,cascade,label){
  var ex=expand(g,set); var all=ex.set;
  made=made||{}; Object.keys(made).forEach(function(k){ all.delete(+k); });
  var n=all.size; if(!n&&!Object.keys(made).length) return;
  var mult=1+.5*(cascade-1), power=stats().power||0;
  var gain=Math.round(n*10*mult*(1+power*.04)+(ex.special?n*4:0));
  g.score+=gain; if(cascade>g.maxCombo) g.maxCombo=cascade;
  // charge
  g.charge+=n; var cm=chargeMax(); while(g.charge>=cm){ g.charge-=cm; if(g.spells<9){ g.spells++; g.say='Spell charged! ✨'; fxSpell(g); } }
  // ice
  all.forEach(function(i){ if(g.ice[i]){ g.ice[i]=0; g.iceLeft--; } });
  // anchors -> specials
  Object.keys(made).forEach(function(k){ var tile=g.b[+k]; if(!tile) return; tile.t=made[k].t; tile.s=made[k].s; tile.fresh=1; });
  sfx(ex.special?'spec':'pop',Math.min(6,cascade));
  var mid=0,cnt=0; all.forEach(function(i){ mid+=i; cnt++; var t=g.b[i]; var el=t&&g.els[t.id]; if(el) el.classList.add('pop'); });
  var anchor=cnt?(Array.from(all)[(cnt/2)|0]):0;
  floatText(g,anchor,'+'+gain+(cascade>1?'  ×'+mult.toFixed(1):''),cascade>1?'combo':'');
  if(cascade>=2){ g.say=['','','Nice combo!','Great chain!','Amazing!!','Incredible!!!','LEGENDARY!'][Math.min(6,cascade)]; bounce(); }
  hud(g); place(g); await sleep(230); if(G()!==g) return;
  all.forEach(function(i){ var t=g.b[i]; if(t){ var el=g.els[t.id]; if(el&&el.parentNode) el.parentNode.removeChild(el); delete g.els[t.id]; g.b[i]=null; } });
  Object.keys(made).forEach(function(k){ var t=g.b[+k]; if(t){ tileEl(g,t); var el=g.els[t.id]; if(el){ el.classList.add('born'); setTimeout(function(){ el.classList.remove('born'); },500); } } });
  // gravity
  for(var x=0;x<N;x++){ var col=[]; for(var y=N-1;y>=0;y--){ if(g.b[y*N+x]) col.push(g.b[y*N+x]); } for(var y2=N-1;y2>=0;y2--){ g.b[y2*N+x]=col[N-1-y2]||T(g,rnd(g.cfg.types)); } }
  place(g); hud(g); await sleep(330);
}
function anchorOf(r,pair){ if(pair){ for(var k=0;k<pair.length;k++){ if(r.cells.indexOf(pair[k])>=0) return pair[k]; } } return r.cells[(r.cells.length/2)|0]; }
async function resolve(g,pair){
  var cascade=0;
  while(true){
    var rs=runs(g.b); if(!rs.length) break; cascade++;
    var set=new Set(), made={}, h={}, v={};
    rs.forEach(function(r){ r.cells.forEach(function(i){ set.add(i); (r.dir==='h'?h:v)[i]=1; }); });
    rs.forEach(function(r){ var a; if(r.cells.length>=5){ a=anchorOf(r,pair); made[a]={t:6,s:'rainbow'}; } else if(r.cells.length===4){ a=anchorOf(r,pair); if(!made[a]) made[a]={t:r.t,s:r.dir==='h'?'row':'col'}; } });
    Object.keys(h).forEach(function(i){ if(v[i]&&!made[i]) made[i]={t:g.b[i].t,s:'bomb'}; });
    await clearAndFall(g,set,made,cascade); if(G()!==g) return; pair=null;
  }
  if(!findMove(g.b)){ g.say='No moves — reshuffling!'; hud(g); await sleep(500); if(G()!==g) return; shuffleBoard(g); buildBoard(g); await sleep(250); }
}
async function afterMove(g){
  if(G()!==g) return; persist(g);
  if(g.score>=g.cfg.target&&g.iceLeft<=0){ finishLevel(g,true); return; }
  if(g.moves<=0){ finishLevel(g,false); return; }
  g.busy=false; hud(g); armHint(g);
}
async function trySwap(g,i,j){
  if(g.busy||g.ph!=='play') return; g.busy=true; clearHint(g); g.sel=-1;
  var a=g.b[i],b=g.b[j]; if(!a||!b){ g.busy=false; return; }
  swapIdx(g.b,i,j); sfx('swap'); place(g); await sleep(190); if(G()!==g) return;
  if(a.s==='rainbow'||b.s==='rainbow'){
    g.moves--; var set=new Set(); var other=a.s==='rainbow'?b:a;
    if(a.s==='rainbow'&&b.s==='rainbow'){ g.b.forEach(function(t,k){ if(t) set.add(k); }); g.say='RAINBOW CLASH!'; }
    else { g.b.forEach(function(t,k){ if(t&&t.t===other.t&&t!==a&&t!==b) set.add(k); }); var rt=a.s==='rainbow'?a:b; set.add(g.b.indexOf(rt)); rt.s=''; }
    await clearAndFall(g,set,null,2); if(G()!==g) return; await resolve(g,null); if(G()!==g) return; await afterMove(g); return;
  }
  if(!runs(g.b).length){ swapIdx(g.b,i,j); sfx('bad'); g.say='That swap makes no match.'; place(g); [i,j].forEach(function(k){ var t=g.b[k]; var el=t&&g.els[t.id]; if(el){ el.classList.add('shake'); setTimeout(function(){ el.classList.remove('shake'); },350); } }); await sleep(250); g.busy=false; hud(g); armHint(g); return; }
  g.moves--; hud(g); await resolve(g,[j,i]); if(G()!==g) return; await afterMove(g);
}

/* ------------------------------ spells ------------------------------ */
function fxSpell(g){ sfx('spell'); var a=$('cx-ling'); if(a){ a.classList.remove('cast'); void a.offsetWidth; a.classList.add('cast'); } }
function bounce(){ var a=$('cx-ling'); if(a){ a.classList.remove('hop'); void a.offsetWidth; a.classList.add('hop'); } }
async function spell(g,k){
  if(g.busy||g.ph!=='play') return; var costs={rewind:1,hammer:1,burst:2,shuffle:1}; if(g.spells<costs[k]){ g.say='Not enough spells — fill the charge meter!'; hud(g); return; }
  clearHint(g);
  if(k==='hammer'){ g.tool=g.tool==='hammer'?'':'hammer'; g.say=g.tool?'Tap any gem to smash it.':'Hammer put away.'; hud(g); return; }
  g.busy=true; g.spells-=costs[k]; fxSpell(g);
  if(k==='rewind'){ g.moves+=3; g.say='⏪ Time rewinds: +3 moves!'; floatText(g,27,'+3 moves','combo'); hud(g); g.busy=false; persist(g); armHint(g); return; }
  if(k==='shuffle'){ g.say='🔀 The gems swirl!'; shuffleBoard(g); buildBoard(g); await sleep(300); if(G()!==g) return; hud(g); g.busy=false; persist(g); armHint(g); return; }
  if(k==='burst'){ var cnt={}; g.b.forEach(function(t){ if(t&&t.t<6) cnt[t.t]=(cnt[t.t]||0)+1; }); var best=-1,bn=0; Object.keys(cnt).forEach(function(q){ if(cnt[q]>bn){ bn=cnt[q]; best=+q; } }); var set=new Set(); g.b.forEach(function(t,i){ if(t&&t.t===best) set.add(i); }); g.say='🌈 Elemental Burst: '+TYPES[best].n+'!'; g.score+=(stats().power||1)*5; hud(g); await clearAndFall(g,set,null,2); if(G()!==g) return; await resolve(g,null); if(G()!==g) return; await afterMove(g); return; }
}
async function hammer(g,i){
  g.tool=''; g.busy=true; g.spells--; fxSpell(g); var set=new Set([i]); g.say='🔨 Smash!'; await clearAndFall(g,set,null,1); if(G()!==g) return; await resolve(g,null); if(G()!==g) return; await afterMove(g);
}

/* ------------------------------ hints ------------------------------ */
function clearHint(g){ clearTimeout(g.hintT); document.querySelectorAll('#cx-board .hint').forEach(function(e){ e.classList.remove('hint'); }); }
function armHint(g){ clearTimeout(g.hintT); g.hintT=setTimeout(function(){ if(G()!==g||g.busy||g.ph!=='play') return; var m=findMove(g.b); if(!m) return; m.forEach(function(k){ var t=g.b[k],el=t&&g.els[t.id]; if(el) el.classList.add('hint'); }); },7000); }

/* ------------------------------ HUD / screens ------------------------------ */
function isFS(){ var st=$('games-stage'); return !!st&&(document.fullscreenElement===st||document.webkitFullscreenElement===st); }
function toggleFS(){ var w=$('games-stage'); if(!w) return; try{ if(isFS()) (document.exitFullscreen||document.webkitExitFullscreen).call(document); else (w.requestFullscreen||w.webkitRequestFullscreen).call(w); }catch(e){} }
function hud(g){
  if(g.ph!=='play') return;
  var set=function(id,v){ var e=$(id); if(e) e.textContent=v; };
  set('cx-score',g.score); set('cx-moves',g.moves); set('cx-spells',g.spells); set('cx-say',g.say||''); set('cx-ice',g.iceTotal?('🧊 '+(g.iceTotal-g.iceLeft)+' / '+g.iceTotal):'');
  var pg=$('cx-goalbar'); if(pg) pg.style.width=Math.min(100,g.score/g.cfg.target*100)+'%';
  var cb=$('cx-chargebar'); if(cb) cb.style.width=Math.min(100,g.charge/chargeMax()*100)+'%'; set('cx-chargetxt',g.charge+' / '+chargeMax());
  var mv=$('cx-movesbox'); if(mv) mv.classList.toggle('low',g.moves<=4);
  [['rewind',1],['hammer',1],['burst',2],['shuffle',1]].forEach(function(s){ var b=document.querySelector('[data-cx="spell"][data-k="'+s[0]+'"]'); if(b){ b.disabled=g.busy&&s[0]!=='hammer'||g.spells<s[1]; b.classList.toggle('on',g.tool===s[0]); } });
  var bw=$('cx-board'); if(bw) bw.classList.toggle('hammer',g.tool==='hammer');
  place(g);
}
function playHtml(g){
  var mute=muted()?'🔇':'🔊';
  return '<div class="cx-top"><div class="cx-goalwrap"><b>Level '+g.level+'</b> · reach <b>'+g.cfg.target+'</b> points'+(g.iceTotal?' and break all the ice':'')+'<div class="cx-goalbar"><i id="cx-goalbar"></i></div></div><div class="cx-box" id="cx-movesbox"><small>Moves</small><b id="cx-moves">'+g.moves+'</b></div><div class="cx-box"><small>Score</small><b id="cx-score">'+g.score+'</b></div><span class="cx-ice" id="cx-ice"></span><div class="cx-tools"><button class="cx-tool" data-cx="mute" title="Sound">'+mute+'</button><button class="cx-tool" data-cx="fs" title="Fullscreen (F)">⛶</button></div></div>'+
    '<div class="cx-body"><div class="cx-side"><div class="cx-ling" id="cx-ling">'+ling()+'</div><div class="cx-say" id="cx-say"></div><div class="cx-charge"><small>Spell charge <span id="cx-chargetxt"></span></small><div class="cx-chbar"><i id="cx-chargebar"></i></div><div class="cx-sp">✨ Spells <b id="cx-spells">'+g.spells+'</b></div></div></div>'+
    '<div class="cx-main" id="cx-main"><div class="cx-boardwrap"><div class="cx-board" id="cx-board"></div><div class="cx-fx" id="cx-fx"></div></div>'+
    '<div class="cx-spellbar"><button data-cx="spell" data-k="rewind" title="+3 moves">⏪ Rewind <em>1</em></button><button data-cx="spell" data-k="hammer" title="Smash one gem">🔨 Hammer <em>1</em></button><button data-cx="spell" data-k="burst" title="Clear the most common element">🌈 Burst <em>2</em></button><button data-cx="spell" data-k="shuffle" title="Shuffle the board">🔀 Shuffle <em>1</em></button></div></div></div>';
}
function titleHtml(g){
  var p=prog(), c=levelCfg(g.level);
  var goal=c.target+' points'+(c.ice?' + break '+c.ice+' ice tiles':'');
  return '<div class="cx-title"><div class="cx-ling big">'+ling()+'</div><h2>Chrono Hex Puzzle</h2><p>Swap neighbouring gems to match 3+. Clear levels by hitting the score goal before you run out of moves. Match 4 for a line gem, L/T for a bomb, 5 for a rainbow. Matches charge your Indexling\'s spell meter.</p>'+
    '<div class="cx-lv"><button class="cx-tool" data-cx="lv-" '+(g.level<=1?'disabled':'')+'>◀</button><div><small>Level</small><b>'+g.level+'</b></div><button class="cx-tool" data-cx="lv+" '+(g.level>=g.unlocked?'disabled':'')+'>▶</button></div>'+
    '<div class="cx-facts"><span>🎯 '+goal+'</span><span>🔁 '+c.moves+' moves</span><span>💠 Best '+(Number(p.best)||0)+'</span><span>🔥 Best combo ×'+(Number(p.bestCombo)||0)+'</span><span>✨ '+g.spells+' spells</span></div>'+
    '<div class="cx-btns"><button class="btn btn-primary btn-lg" data-cx="start">▶ Play level '+g.level+'</button><button class="btn btn-ghost" data-cx="fs">⛶ Fullscreen</button></div><div class="cx-how"><span>Drag or click to swap</span><span>F fullscreen</span><span>Hint after 7s idle</span></div></div>';
}
function endHtml(g,won){
  var p=prog();
  return '<div class="cx-title"><div class="cx-ling big '+(won?'hop':'')+'">'+ling()+'</div><h2>'+(won?'Level '+g.level+' cleared!':'Out of moves')+'</h2><p>'+(won?'Score <b>'+g.score+'</b> (incl. +'+g.bonus+' for '+g.moves+' spare moves) · best combo ×'+g.maxCombo+' · <b>+'+g.coins+' 🪙</b>':'You scored <b>'+g.score+'</b> of '+g.cfg.target+(g.iceLeft?' with '+g.iceLeft+' ice left':'')+'. Spells you saved are kept.')+'</p><div class="cx-btns">'+(won?'<button class="btn btn-primary btn-lg" data-cx="next">Next level ▶</button><button class="btn btn-ghost" data-cx="again">Replay</button>':'<button class="btn btn-primary btn-lg" data-cx="again">Try again</button>')+'<button class="btn btn-ghost" data-cx="menu">Level select</button></div></div>';
}
function inner(g){ return g.ph==='title'?titleHtml(g):g.ph==='play'?playHtml(g):endHtml(g,g.ph==='win'); }
function paintFull(g){
  var root=$('cx-root'); if(!root||G()!==g) return; root.innerHTML=inner(g); root.setAttribute('data-ph',g.ph);
  if(g.ph==='play'){ buildBoard(g); hud(g); armHint(g); }
}
window.arcadeHexHtml=function(){
  var g=state.games; if(!g||!g.cx) return '';
  var p=prog();
  var statsH='<span class="arcade-pill">💠 Best <b>'+(Number(p.best)||0)+'</b></span><span class="arcade-pill">🔓 Level <b>'+g.unlocked+'</b></span><span class="arcade-pill">✨ <b>'+g.spells+'</b></span>';
  setTimeout(function(){ if(G()===g&&g.ph==='play'){ var bd=$('cx-board'); if(bd&&!bd.children.length){ buildBoard(g); hud(g); armHint(g); } } },0);
  return arcadeFrame('Chrono Hex Puzzle','Match gems, break ice and charge your Indexling\'s spells.',statsH,'<div id="cx-root" class="cx-root" data-ph="'+g.ph+'">'+inner(g)+'</div>');
};

/* ------------------------------ input ------------------------------ */
var down=null;
function tileAt(e){ var t=e.target.closest&&e.target.closest('.cx-t'); if(!t) return -1; var g=G(); if(!g) return -1; var id=t.dataset.id; for(var i=0;i<N*N;i++){ if(g.b[i]&&String(g.b[i].id)===id) return i; } return -1; }
function click(g,i){
  if(g.busy||g.ph!=='play') return;
  if(g.tool==='hammer'){ hammer(g,i); return; }
  if(g.sel<0){ g.sel=i; place(g); return; }
  var s=g.sel; g.sel=-1; if(s===i){ place(g); return; }
  var dx=Math.abs((s%N)-(i%N)),dy=Math.abs(((s/N)|0)-((i/N)|0));
  if(dx+dy===1) trySwap(g,s,i); else { g.sel=i; place(g); }
}
document.addEventListener('pointerdown',function(e){ var g=G(); if(!g||g.ph!=='play') return; var i=tileAt(e); if(i<0){ down=null; return; } down={i:i,x:e.clientX,y:e.clientY}; });
document.addEventListener('pointerup',function(e){
  var g=G(); if(!g||!down){ down=null; return; } var d=down; down=null; if(g.ph!=='play'||g.busy) return;
  var dx=e.clientX-d.x,dy=e.clientY-d.y, th=14;
  if(g.tool==='hammer'){ click(g,d.i); return; }
  if(Math.abs(dx)>th||Math.abs(dy)>th){ var x=d.i%N,y=(d.i/N)|0; if(Math.abs(dx)>Math.abs(dy)) x+=dx>0?1:-1; else y+=dy>0?1:-1; if(x<0||x>=N||y<0||y>=N) return; g.sel=-1; trySwap(g,d.i,y*N+x); }
  else click(g,d.i);
});
document.addEventListener('click',function(e){
  var g=G(); if(!g) return; var t=e.target.closest&&e.target.closest('[data-cx]'); if(!t||t.disabled) return; var a=t.getAttribute('data-cx');
  if(a==='fs') toggleFS();
  else if(a==='mute'){ try{ localStorage.setItem('gx-mute',muted()?'0':'1'); }catch(er){} t.textContent=muted()?'🔇':'🔊'; }
  else if(a==='lv-'){ g.level=Math.max(1,g.level-1); paintFull(g); }
  else if(a==='lv+'){ g.level=Math.min(g.unlocked,g.level+1); paintFull(g); }
  else if(a==='start'||a==='again'){ begin(g); }
  else if(a==='next'){ g.level=Math.min(g.unlocked,g.level+1); begin(g); }
  else if(a==='menu'){ g.ph='title'; paintFull(g); }
  else if(a==='spell') spell(g,t.getAttribute('data-k'));
});
document.addEventListener('keydown',function(e){ var g=G(); if(!g||state.view!=='games') return; if(e.key==='f'||e.key==='F'){ toggleFS(); } },true);
window.addEventListener('resize',function(){ if(G()) fit(); });
document.addEventListener('fullscreenchange',function(){ if(G()) setTimeout(fit,60); });
window.__cx={get:function(){ return G(); },trySwap:trySwap,findMove:findMove,runs:runs,begin:begin,spell:spell,N:N};
})();
