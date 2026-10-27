/* Rhythm Reflector v2 — a 4-lane rhythm game with a synthesized backing track.
   Three procedurally charted tracks (100 / 124 / 150 BPM), notes are magical projectiles fired by a caster that your equipped
   Indexling reflects on the beat. Timing is read from the WebAudio clock (so it stays in sync with the music), Perfect/Great/Good/Miss
   windows widened by Focus, combo multiplier, HP (Vitality), Overdrive (Space, charges faster with Luck, +Power boosts score),
   hit sounds, ranks D–S, per-track best saved in gameProgress.rhythm = {best, tracks:{id:{best,rank,combo,acc}}}.
   Controls: D F J K or ← ↓ ↑ → or tap the lanes · Space overdrive · P pause · Shift+F or ⛶ fullscreen. Fullscreen uses the persistent games stage.
   Coins: first time you reach a better rank on a track → B +2, A +4, S +6; otherwise +1 for a B or better. */
(function(){
'use strict';
var LW=1000,LH=562,PX=300,LANEW=100,HITY=410,TOPY=96;
var $=function(id){ return document.getElementById(id); };
function rr(){ return state.games&&state.games.active==='rhythm'&&state.games.rr?state.games.rr:null; }
function stats(){ try{ return arcadeCharacterStats()||{}; }catch(e){ return {}; } }
function muted(){ try{ return localStorage.getItem('gx-mute')==='1'; }catch(e){ return false; } }
function prog(){ var gp=arcadeGameProgress(); gp.rhythm=gp.rhythm||{best:0}; gp.rhythm.tracks=gp.rhythm.tracks||{}; return gp.rhythm; }
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
var LANE_COL=['#ff6b8a','#ffd24a','#5be68f','#55b0ff'], LANE_KEYS=['D','F','J','K'];
var TRACKS=[
  {id:'sunrise',name:'Sunrise Reflect',bpm:100,bars:24,dens:.62,seed:11,icon:'🌅',caster:'🧙',col:'#ffb45a',desc:'Gentle tempo. Learn the lanes.',diff:'Easy'},
  {id:'moon',name:'Moonlit Duel',bpm:124,bars:32,dens:.74,seed:23,icon:'🌙',caster:'🦇',col:'#8a9bff',desc:'Steady groove with syncopation.',diff:'Medium'},
  {id:'storm',name:'Hex Storm',bpm:150,bars:40,dens:.9,seed:37,icon:'⚡',caster:'👹',col:'#c07cff',desc:'Fast streams and double hits.',diff:'Hard'}
];
function trackById(id){ for(var i=0;i<TRACKS.length;i++) if(TRACKS[i].id===id) return TRACKS[i]; return TRACKS[0]; }
function chart(tr){
  var rnd=mulberry(tr.seed), step=60/tr.bpm/4, notes=[], lane=1, last=-9;
  for(var bar=2;bar<tr.bars-1;bar++){
    var inten=Math.min(1,.55+bar/tr.bars*.6)*tr.dens;
    for(var s=0;s<16;s++){
      var p=(s%4===0)?.88:(s%4===2)?.6:(bar>6?.22:.06); p*=inten*1.15;
      var idx=bar*16+s; if(idx-last<2&&rnd()<.85) continue; if(rnd()<p){
        var mv=[-2,-1,-1,1,1,2,0]; lane=Math.max(0,Math.min(3,lane+mv[(rnd()*mv.length)|0]));
        notes.push({t:idx*step,lane:lane,st:0}); last=idx;
        if(tr.dens>.6&&s%4===0&&rnd()<.1*(tr.dens)&&bar>8){ var l2=(lane+2)%4; notes.push({t:idx*step,lane:l2,st:0}); }
      }
    }
  }
  return {notes:notes.sort(function(a,b){ return a.t-b.t; }),step:step,len:(tr.bars*16)*step};
}

/* ------------------------------ audio ------------------------------ */
var AC=null, noiseBuf=null;
function ctx(){ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume(); return AC; }
function env(o,t,a,d,v){ var g=AC.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+a); g.gain.exponentialRampToValueAtTime(.0001,t+a+d); o.connect(g); g.connect(AC.destination); }
function note(t,f,type,a,d,v){ if(muted()) return; var o=AC.createOscillator(); o.type=type; o.frequency.setValueAtTime(f,t); env(o,t,a,d,v); o.start(t); o.stop(t+a+d+.05); }
function noise(t,d,v,hp){ if(muted()) return; if(!noiseBuf){ noiseBuf=AC.createBuffer(1,AC.sampleRate*.5,AC.sampleRate); var ch=noiseBuf.getChannelData(0); for(var i=0;i<ch.length;i++) ch[i]=Math.random()*2-1; }
  var s=AC.createBufferSource(); s.buffer=noiseBuf; var f=AC.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp; var g=AC.createGain(); g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(.0001,t+d); s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t); s.stop(t+d+.02); }
function kick(t){ if(muted()) return; var o=AC.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(42,t+.13); env(o,t,.005,.2,.35); o.start(t); o.stop(t+.25); }
var CHORDS=[[110,131,165],[87.3,110,131],[131,165,196],[98,123,147]];
var PENT=[0,3,5,7,10];
function schedStep(g,k,t){
  var s=k%16, bar=(k/16)|0, ch=CHORDS[(bar>>1)%4], tr=g.tr;
  if(s%4===0) kick(t); if(s===4||s===12){ noise(t,.14,.22,1500); note(t,190,'triangle',.003,.08,.12); }
  if(s%2===0) noise(t,.04,.06+(s%4===2?.04:0),7000);
  if([0,3,6,8,11,14].indexOf(s)>=0) note(t,ch[0]*(s===6||s===14?2:1),'sawtooth',.005,.18,.11);
  if(bar>=2&&s%2===0){ var n=ch[(s/2|0)%3]*4; note(t,n,'square',.003,.1,.028); }
  if(bar>=4&&s===0){ note(t,ch[1]*2,'triangle',.05,step(g)*14,.05); }
}
function step(g){ return g.ch.step; }
function sched(g){
  var now=AC.currentTime;
  while(g.nextStepTime<now+.35&&g.nextK<g.totalSteps){ schedStep(g,g.nextK,g.nextStepTime); g.nextStepTime+=g.ch.step; g.nextK++; }
}
function hitSound(lane,q){ if(muted()||!AC) return; var t=AC.currentTime, ch=CHORDS[((((AC.currentTime))|0)%4)], f=330*Math.pow(2,PENT[lane+(q==='perfect'?1:0)]/12); note(t,f*2,'triangle',.004,.16,q==='good'?.08:.15); if(q==='perfect') note(t,f*4,'sine',.004,.2,.07); }
function missSound(){ if(muted()||!AC) return; var t=AC.currentTime; note(t,120,'sawtooth',.004,.12,.07); }

/* ------------------------------ sprite ------------------------------ */
var spr={key:'',img:null};
function sprite(){
  var id='ling-sugarbug', sid=''; try{ id=(state.progress.equipped&&state.progress.equipped.indexling)||id; sid=(typeof getEquippedSkinId==='function'&&getEquippedSkinId(id))||''; }catch(e){}
  var key=id+'|'+sid; if(spr.key===key&&spr.img) return spr.img; spr={key:key,img:new Image()};
  try{ var l=cosmeticById(id)||cosmeticById('ling-sugarbug'), sk=sid&&typeof skinById==='function'?skinById(sid):null; var html=indexlingArtHtml(l,true,sk||{}), m=html.match(/<svg[\s\S]*<\/svg>/);
    if(m){ var vars={}; html.replace(/(--[\w-]+)\s*:\s*([^;"]+)/g,function(_,k,v){ vars[k]=v.trim(); return _; }); var svg=m[0].replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g,function(_,k){ return vars[k]||'#b07cff'; }).replace(/<svg\b/,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"'); spr.img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); } }catch(e){}
  return spr.img;
}

/* ------------------------------ session ------------------------------ */
window.arcadeRhythmStart=function(){
  clearGameTimers(); cancelAnimationFrame(loopId); if(AC&&AC.state==='running'){ try{ AC.suspend(); }catch(e){} }
  var s=stats(); var g={phase:'ready',track:prog().last||'sunrise',offset:readOffset(),maxHp:80+Math.round((s.vitality||4)*4),fx:[],flash:[0,0,0,0],shake:0};
  state.games={active:'rhythm',rr:g};
};
window.arcadeRhythmHit=function(){};
window.arcadeRhythmFinish=function(){};
function readOffset(){ try{ return parseInt(localStorage.getItem('rr-offset')||'0',10)||0; }catch(e){ return 0; } }
function setOffset(g,v){ g.offset=Math.max(-200,Math.min(200,v)); try{ localStorage.setItem('rr-offset',String(g.offset)); }catch(e){} overlay(g); }
function begin(g){
  ctx(); var tr=trackById(g.track); g.tr=tr; g.ch=chart(tr); g.notes=g.ch.notes.map(function(n){ return {t:n.t,lane:n.lane,st:0,h:0}; }); g.total=g.notes.length;
  g.totalSteps=tr.bars*16+8; g.nextK=0; g.t0=AC.currentTime+1.6; g.nextStepTime=g.t0; g.phase='play';
  g.score=0; g.combo=0; g.maxCombo=0; g.cnt={perfect:0,great:0,good:0,miss:0}; g.hp=g.maxHp; g.od=0; g.odT=0; g.odOn=false; g.fx=[]; g.judge=null; g.pulse=0; g.swing=0; g.paused=false; g.flash=[0,0,0,0]; g.shake=0; g.approach=1.55-(stats().speed||2)*.04;
  var p=prog(); p.last=g.track; overlay(g); g.sp=sprite();
  try{ AC.resume(); }catch(e){}
}
function songT(g){ return AC.currentTime-g.t0-g.offset/1000; }
function winP(g){ var f=stats().focus||100, P=.036+f/9000; if(g.odOn) P*=1.2; return {perfect:P,great:P*1.9,good:P*2.8}; }
function addFx(g,lane,txt,col,big){ g.fx.push({lane:lane,t:0,txt:txt,col:col,big:big}); }
function judge(g,lane){
  if(g.phase!=='play'||g.paused) return; g.flash[lane]=1;
  var t=songT(g), w=winP(g), best=null, bd=9;
  for(var i=0;i<g.notes.length;i++){ var n=g.notes[i]; if(n.st||n.lane!==lane) continue; var d=Math.abs(n.t-t); if(n.t-t>w.good+.02) break; if(d<bd){ bd=d; best=n; } }
  g.swing=1;
  if(!best||bd>w.good){ g.hit=g.hit||0; return; }
  var q=bd<=w.perfect?'perfect':bd<=w.great?'great':'good'; best.st=1; best.q=q; best.h=1; g.cnt[q]++; g.combo++; if(g.combo>g.maxCombo) g.maxCombo=g.combo;
  var base={perfect:300,great:200,good:100}[q], mult=1+Math.min(4,Math.floor(g.combo/10))*.25; var pw=1+(stats().power||0)*.02;
  g.score+=Math.round(base*mult*pw*(g.odOn?2:1));
  g.hp=Math.min(g.maxHp,g.hp+(q==='perfect'?.8:q==='great'?.4:0));
  if(!g.odOn){ g.od=Math.min(100,g.od+({perfect:4,great:2.5,good:1}[q])*(1+(stats().luck||0)*.08)); }
  g.judge={q:q,t:0,d:(songT(g)-best.t)};
  addFx(g,lane,q.toUpperCase(),{perfect:'#ffe27a',great:'#7be0ff',good:'#9bffb0'}[q]);
  hitSound(lane,q); g.pulse=Math.max(g.pulse,.6);
  if(g.combo>0&&g.combo%25===0){ addFx(g,2,g.combo+' COMBO!','#ffffff',true); g.shake=.3; }
}
function activateOD(g){ if(g.phase!=='play'||g.paused||g.odOn||g.od<100) return; g.odOn=true; g.odT=8; addFx(g,2,'OVERDRIVE!','#ffd24a',true); g.shake=.5; if(AC&&!muted()){ var t=AC.currentTime; note(t,300,'sawtooth',.01,.4,.12); note(t,600,'square',.02,.5,.08); } }
function togglePause(g){ if(g.phase!=='play') return; g.paused=!g.paused; if(g.paused){ try{ AC.suspend(); }catch(e){} } else { try{ AC.resume(); }catch(e){} } overlay(g); }

function rankOf(g){ var tot=g.total||1, acc=(g.cnt.perfect+g.cnt.great*.75+g.cnt.good*.4)/tot; var r=acc>=.95?'S':acc>=.88?'A':acc>=.75?'B':acc>=.6?'C':'D'; return {acc:acc,rank:r}; }
var RORD={F:-1,D:0,C:1,B:2,A:3,S:4};
function finish(g,failed){
  if(g.phase!=='play') return; g.phase=failed?'failed':'done'; g.paused=false; try{ AC.suspend(); }catch(e){}
  var rk=rankOf(g); g.result=rk; var p=prog(), key=g.tr.id, rec=p.tracks[key]||{best:0,rank:'-',combo:0,acc:0};
  g.newBest=g.score>rec.best; g.coins=0;
  if(!failed){ var better=(RORD[rk.rank]||0)>(RORD[rec.rank]||-2); var base={B:2,A:4,S:6}[rk.rank]||0; g.coins=better?base:(RORD[rk.rank]>=2?1:0); if(g.coins){ try{ addCoins(g.coins,'Rhythm Reflector '+rk.rank+' rank'); }catch(e){} } if(better) rec.rank=rk.rank; if(rk.rank==='S'&&g.cnt.miss===0) { try{ celebrate(); }catch(e){} } }
  rec.best=Math.max(rec.best,g.score); rec.combo=Math.max(rec.combo,g.maxCombo); rec.acc=Math.max(rec.acc,Math.round(rk.acc*1000)/10); p.tracks[key]=rec; p.best=Math.max(Number(p.best)||0,g.score);
  try{ persistProgress(); }catch(e){} overlay(g);
}

/* ------------------------------ update / draw ------------------------------ */
function update(g,dt){
  if(g.phase!=='play'||g.paused) return;
  sched(g); var t=songT(g), w=winP(g);
  g.pulse=Math.max(0,g.pulse-dt*2.2); g.swing=Math.max(0,g.swing-dt*5); g.shake=Math.max(0,g.shake-dt);
  for(var l=0;l<4;l++) g.flash[l]=Math.max(0,g.flash[l]-dt*5);
  if(g.odOn){ g.odT-=dt; g.od=Math.max(0,g.odT/8*100); if(g.odT<=0){ g.odOn=false; g.od=0; } }
  g.fx.forEach(function(f){ f.t+=dt; }); g.fx=g.fx.filter(function(f){ return f.t<1; }); if(g.judge) g.judge.t+=dt;
  var beatPh=((t/ (60/g.tr.bpm))%1+1)%1; if(beatPh<.06&&t>0&&g.lastBeat!==Math.floor(t/(60/g.tr.bpm))){ g.lastBeat=Math.floor(t/(60/g.tr.bpm)); g.pulse=Math.max(g.pulse,.35); }
  for(var i=0;i<g.notes.length;i++){ var n=g.notes[i]; if(n.st) { if(n.h>0) n.h=Math.max(0,n.h-dt*4); continue; } if(t-n.t>w.good){ n.st=2; g.cnt.miss++; g.combo=0; g.hp-=6; addFx(g,n.lane,'MISS','#ff6b7a'); g.judge={q:'miss',t:0}; missSound(); g.shake=.15; } }
  if(g.hp<=0){ finish(g,true); return; }
  if(t>g.ch.len+1.2){ finish(g,false); }
}
function X(l){ return PX+l*LANEW+LANEW/2; }
function draw(g){
  var c=g.ctx; if(!c) return; var W=g.cv.width,H=g.cv.height; c.setTransform(1,0,0,1,0,0); c.fillStyle='#07050f'; c.fillRect(0,0,W,H);
  var d=g.dpr||1; c.setTransform(g.sc*d,0,0,g.sc*d,g.ox*d,g.oy*d); c.save(); c.beginPath(); c.rect(0,0,LW,LH); c.clip();
  var tr=g.tr||trackById(g.track), col=tr.col, t=g.phase==='play'?songT(g):-1;
  var sx=g.shake>0?(Math.random()-.5)*8*g.shake:0, sy=g.shake>0?(Math.random()-.5)*8*g.shake:0; c.translate(sx,sy);
  // background
  var bg=c.createLinearGradient(0,0,0,LH); bg.addColorStop(0,'#150f33'); bg.addColorStop(1,'#07050f'); c.fillStyle=bg; c.fillRect(-10,-10,LW+20,LH+20);
  var pr=g.pulse||0; var rg=c.createRadialGradient(LW/2,LH*.3,20,LW/2,LH*.3,520); rg.addColorStop(0,hexA(col,.18+pr*.25)); rg.addColorStop(1,'rgba(0,0,0,0)'); c.fillStyle=rg; c.fillRect(0,0,LW,LH);
  for(var s=0;s<40;s++){ var sxx=(s*137.5)%LW, syy=(s*71.3+ (Math.max(0,t)*20*(1+s%3))) % LH; c.fillStyle='rgba(255,255,255,'+(.08+.04*(s%4))+')'; c.fillRect(sxx,syy,2,2); }
  if(g.odOn){ c.fillStyle='rgba(255,210,74,'+(.05+.04*Math.sin(performance.now()/90))+')'; c.fillRect(0,0,LW,LH); }
  // lanes
  for(var l=0;l<4;l++){ var x=PX+l*LANEW; var lg=c.createLinearGradient(0,TOPY,0,HITY); lg.addColorStop(0,'rgba(255,255,255,.01)'); lg.addColorStop(1,hexA(LANE_COL[l],.12+g.flash[l]*.3)); c.fillStyle=lg; c.fillRect(x,TOPY,LANEW,HITY-TOPY+40); c.strokeStyle='rgba(255,255,255,.1)'; c.lineWidth=1; c.beginPath(); c.moveTo(x,TOPY); c.lineTo(x,HITY+40); c.stroke(); }
  c.beginPath(); c.moveTo(PX+4*LANEW,TOPY); c.lineTo(PX+4*LANEW,HITY+40); c.stroke();
  // hit line
  for(var l2=0;l2<4;l2++){ var hx=X(l2); c.lineWidth=4; c.strokeStyle=hexA(LANE_COL[l2],.7+g.flash[l2]*.3); c.beginPath(); c.arc(hx,HITY,34+g.flash[l2]*8,0,7); c.stroke(); c.fillStyle=hexA(LANE_COL[l2],.12+g.flash[l2]*.4); c.fill();
    c.fillStyle='rgba(255,255,255,.75)'; c.font='800 18px system-ui,sans-serif'; c.textAlign='center'; c.fillText(LANE_KEYS[l2],hx,HITY+58); }
  // caster
  var cy=TOPY-36; c.font=(54+pr*14)+'px system-ui,sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.globalAlpha=1; c.fillText(tr.caster,LW/2,cy+Math.sin(performance.now()/400)*4); c.textBaseline='alphabetic';
  // notes
  if(g.phase==='play'||g.phase==='done'||g.phase==='failed'){
    var ap=g.approach||1.5;
    for(var i=0;i<(g.notes||[]).length;i++){ var n=g.notes[i]; var dt2=n.t-t; if(dt2>ap+.05) break; var nx=X(n.lane);
      if(n.st===1){ if(n.h>0){ var rr2=34+(1-n.h)*40; c.strokeStyle=hexA('#ffffff',n.h); c.lineWidth=5*n.h; c.beginPath(); c.arc(nx,HITY,rr2,0,7); c.stroke(); } continue; }
      if(n.st===2) { var fy2=HITY+(-dt2)*(HITY-TOPY)/ap; if(fy2>LH) continue; c.globalAlpha=.3; drawOrb(c,nx,fy2,n.lane,.8,true); c.globalAlpha=1; continue; }
      var fy=HITY-dt2*(HITY-TOPY)/ap; var sc=.55+Math.min(1,Math.max(0,(fy-TOPY)/(HITY-TOPY)))*.45; drawOrb(c,nx,fy,n.lane,sc,false); }
  }
  // indexling
  var img=g.sp||sprite(); var by=HITY+64; if(img&&img.complete&&img.naturalWidth){ var sw=84; c.save(); c.translate(LW/2,by+sw*.5); c.rotate(Math.sin(performance.now()/500)*.03+(g.swing||0)*.25*(g.lastLane>1?1:-1)); var sq=1+(g.swing||0)*.1+pr*.05; c.scale(sq,sq); c.drawImage(img,-sw/2,-sw/2-(g.swing||0)*10,sw,sw); c.restore(); }
  // fx text
  (g.fx||[]).forEach(function(f){ var a=1-f.t; c.globalAlpha=Math.max(0,a); c.fillStyle=f.col; c.font='900 '+(f.big?34:22)+'px system-ui,sans-serif'; c.textAlign='center'; c.fillText(f.txt,f.big?LW/2:X(f.lane),(f.big?HITY-150:HITY-52)-f.t*40); c.globalAlpha=1; });
  // HUD
  c.textAlign='left'; c.fillStyle='#fff'; c.font='900 30px system-ui,sans-serif'; c.fillText(String(g.score||0).padStart(7,'0'),24,50); c.font='700 13px system-ui,sans-serif'; c.fillStyle='#b9b0ee'; c.fillText(tr.name+' · '+tr.bpm+' BPM',24,74);
  if(g.phase==='play'){ var rk=rankOf({cnt:g.cnt,total:Math.max(1,g.cnt.perfect+g.cnt.great+g.cnt.good+g.cnt.miss)}); c.font='900 54px system-ui,sans-serif'; c.fillStyle=rankCol(rk.rank); c.fillText(rk.rank,28,140); c.font='700 13px system-ui,sans-serif'; c.fillStyle='#b9b0ee'; c.fillText(Math.round(rk.acc*100)+'% accuracy',28,162); }
  if((g.combo||0)>=2){ c.textAlign='center'; c.globalAlpha=.9; c.fillStyle='#fff'; c.font='900 '+(44+pr*10)+'px system-ui,sans-serif'; c.fillText(g.combo,LW/2,250); c.font='800 14px system-ui,sans-serif'; c.fillStyle=g.odOn?'#ffd24a':'#b9b0ee'; c.fillText('COMBO'+(g.odOn?' · ×2':'  ×'+(1+Math.min(4,Math.floor(g.combo/10))*.25).toFixed(2)),LW/2,272); c.globalAlpha=1; }
  // hp & overdrive bars
  bar(c,760,60,200,14,(g.hp||0)/(g.maxHp||1),'#4be39a','HP'); bar(c,760,96,200,14,(g.od||0)/100,g.odOn?'#ffd24a':'#b07cff',(g.od>=100&&!g.odOn)?'OVERDRIVE READY · SPACE':'OVERDRIVE');
  // progress
  if(g.phase==='play'){ var pp=Math.max(0,Math.min(1,t/g.ch.len)); c.fillStyle='rgba(255,255,255,.12)'; c.fillRect(0,LH-6,LW,6); c.fillStyle=col; c.fillRect(0,LH-6,LW*pp,6); if(t<0){ c.textAlign='center'; c.fillStyle='#fff'; c.font='900 60px system-ui,sans-serif'; c.fillText(Math.ceil(-t)||'GO',LW/2,330); } }
  c.restore();
}
function bar(c,x,y,w,h,p,col,label){ c.fillStyle='rgba(255,255,255,.12)'; c.fillRect(x,y,w,h); c.fillStyle=col; c.fillRect(x,y,w*Math.max(0,Math.min(1,p)),h); c.fillStyle='#fff'; c.font='800 10px system-ui,sans-serif'; c.textAlign='left'; c.fillText(label,x+4,y+h-3.5); }
function rankCol(r){ return {S:'#ffe27a',A:'#7be0ff',B:'#9bffb0',C:'#ffb27a',D:'#ff8a9a'}[r]||'#fff'; }
function hexA(h,a){ var n=parseInt(h.slice(1),16); return 'rgba('+(n>>16)+','+((n>>8)&255)+','+(n&255)+','+a+')'; }
function drawOrb(c,x,y,lane,sc,dead){ var col=LANE_COL[lane], r=28*sc; var gr=c.createRadialGradient(x-r*.3,y-r*.3,r*.1,x,y,r*1.5); gr.addColorStop(0,'#fff'); gr.addColorStop(.35,col); gr.addColorStop(1,hexA(col,0)); c.fillStyle=gr; c.beginPath(); c.arc(x,y,r*1.5,0,7); c.fill(); c.strokeStyle='#fff'; c.lineWidth=2.5; c.beginPath(); c.arc(x,y,r*.8,0,7); c.stroke();
  if(!dead){ c.fillStyle=hexA(col,.25); c.beginPath(); c.moveTo(x-r*.5,y); c.lineTo(x,y-r*3); c.lineTo(x+r*.5,y); c.fill(); } }

/* ------------------------------ overlays ------------------------------ */
function overlay(g){
  var ov=g.ov; if(!ov) return; var h='';
  if(g.phase==='ready'){
    var p=prog();
    h='<div class="gx-card wide"><h2>🎵 Rhythm Reflector</h2><p>Reflect the caster\'s magic back on the beat. Pick a track:</p><div class="rr-tracks">'+TRACKS.map(function(t){ var rec=p.tracks[t.id]; return '<button type="button" class="rr-track'+(g.track===t.id?' on':'')+'" data-rr-track="'+t.id+'" style="--tc:'+t.col+'"><span class="rr-ti">'+t.icon+'</span><b>'+t.name+'</b><small>'+t.bpm+' BPM · '+t.diff+'</small><em>'+(rec?'Rank '+rec.rank+' · '+rec.best:'Not played')+'</em></button>'; }).join('')+'</div>'+
      '<ul class="gx-keys"><li><kbd>D</kbd><kbd>F</kbd><kbd>J</kbd><kbd>K</kbd> or <kbd>←</kbd><kbd>↓</kbd><kbd>↑</kbd><kbd>→</kbd> or tap a lane — reflect when the orb hits the ring</li><li><kbd>Space</kbd> Overdrive when the meter is full (×2 score, wider timing) · <kbd>P</kbd> pause · <kbd>Shift</kbd>+<kbd>F</kbd> fullscreen (or the ⛶ button)</li></ul>'+
      '<p class="gx-stats">Your Indexling: Focus '+(stats().focus||0)+' (timing window) · Vitality → HP '+g.maxHp+' · Luck charges Overdrive · Power boosts score</p>'+
      '<div class="rr-off">Audio offset <button type="button" data-rr-off="-10">−</button><b>'+g.offset+' ms</b><button type="button" data-rr-off="10">+</button><small>Raise if you hit late, lower if early. Headphones recommended.</small></div>'+
      '<div class="gx-endbtns"><button class="btn btn-primary btn-lg" data-rr-start>▶ Start</button><button class="btn btn-ghost" data-rr-fs>⛶ Fullscreen</button></div></div>';
  } else if(g.phase==='play'&&g.paused){
    h='<div class="gx-card"><h2>⏸ Paused</h2><div class="gx-endbtns"><button class="btn btn-primary" data-rr-resume>Resume</button><button class="btn btn-ghost" data-rr-quit>Quit to menu</button></div></div>';
  } else if(g.phase==='done'||g.phase==='failed'){
    var r=g.result, f=g.phase==='failed';
    h='<div class="gx-card wide"><h2>'+(f?'💔 Overwhelmed':'🎉 Track complete')+'</h2><div class="rr-rank" style="color:'+(f?'#ff8a9a':rankCol(r.rank))+'">'+(f?'—':r.rank)+'</div><p>'+g.tr.name+' · '+Math.round(r.acc*1000)/10+'% accuracy'+(g.newBest?' · <span class="gx-newbest">New best!</span>':'')+'</p>'+
      '<div class="gx-res"><div><b>'+g.score+'</b><span>Score</span></div><div><b>'+g.maxCombo+'</b><span>Max combo</span></div><div><b>'+g.cnt.perfect+'</b><span>Perfect</span></div><div><b>'+g.cnt.great+'/'+g.cnt.good+'</b><span>Great/Good</span></div></div>'+
      '<p class="gx-stats">'+g.cnt.miss+' missed'+(g.coins?' · +'+g.coins+' 🪙':'')+(f?' · You ran out of HP — keep your combo alive and use Overdrive.':'')+'</p>'+
      '<div class="gx-endbtns"><button class="btn btn-primary" data-rr-start>Play again</button><button class="btn btn-ghost" data-rr-quit>Track select</button></div></div>';
  }
  ov.innerHTML=h; ov.style.display=h?'flex':'none';
}

/* ------------------------------ mount / input ------------------------------ */
var loopId=0;
window.arcadeRhythmHtml=function(){
  var g=rr(); if(!g) return ''; setTimeout(mount,0); var p=prog();
  var stats2='<span class="arcade-pill">⭐ Best <b>'+(Number(p.best)||0)+'</b></span><span class="arcade-pill">🎼 Tracks cleared <b>'+Object.keys(p.tracks).length+'/3</b></span>';
  return arcadeFrame('Rhythm Reflector','Reflect the caster\'s magic on the beat · D F J K or arrows · Space overdrive · Shift+F fullscreen',stats2,
    '<div class="gx-wrap rr-wrap" id="rr-wrap"><canvas id="rr-canvas" width="1000" height="562"></canvas><div class="gx-ov" id="rr-ov"></div><div class="gx-tools"><button class="gx-mute" id="rr-pause" type="button" aria-label="Pause" title="Pause (P)">⏸</button><button class="gx-mute" id="rr-mute" type="button" aria-label="Toggle sound">'+(muted()?'🔇':'🔊')+'</button><button class="gx-mute" id="rr-fs" type="button" aria-label="Fullscreen" title="Fullscreen (F)">⛶</button></div></div>');
};
function isFS(){ var st=$('games-stage'); return !!st&&(document.fullscreenElement===st||document.webkitFullscreenElement===st); }
function toggleFS(){ var w=$('games-stage'); if(!w) return; try{ if(isFS()) (document.exitFullscreen||document.webkitExitFullscreen).call(document); else (w.requestFullscreen||w.webkitRequestFullscreen).call(w); }catch(e){} }
function fit(g){
  var wrap=g.wrap; if(!wrap) return; var fs=isFS(); var cssW=fs?window.innerWidth:wrap.clientWidth; if(!cssW) return; var cssH=fs?window.innerHeight:Math.round(cssW*LH/LW);
  var dpr=Math.min(window.devicePixelRatio||1,1.5); g.cv.width=Math.round(cssW*dpr); g.cv.height=Math.round(cssH*dpr); g.cv.style.width=cssW+'px'; g.cv.style.height=cssH+'px'; g.dpr=dpr;
  if(fs){ g.sc=Math.min(cssW/LW,cssH/LH); g.ox=(cssW-LW*g.sc)/2; g.oy=(cssH-LH*g.sc)/2; } else { g.sc=cssW/LW; g.ox=0; g.oy=0; }
  var b=$('rr-fs'); if(b) b.textContent=fs?'🗗':'⛶';
}
function laneAt(g,e){ var r=g.cv.getBoundingClientRect(), lx=((e.clientX-r.left)-g.ox)/g.sc; var l=Math.floor((lx-PX)/LANEW); if(lx<PX-60||lx>PX+4*LANEW+60) return -1; return Math.max(0,Math.min(3,l)); }
function mount(){
  var g=rr(), cv=$('rr-canvas'); if(!g||!cv) return; g.cv=cv; g.ctx=cv.getContext('2d'); g.ov=$('rr-ov'); g.wrap=$('rr-wrap'); g.sp=sprite(); wire(g); fit(g); overlay(g);
  cancelAnimationFrame(loopId); g.last=performance.now();
  (function frame(t){ var cur=rr(); if(cur!==g||!document.body.contains(cv)) return; var dt=Math.min(.05,(t-g.last)/1000); g.last=t; try{ update(g,dt); draw(g); }catch(e){ console.error(e); } loopId=requestAnimationFrame(frame); })(g.last);
}
function wire(g){
  var wrap=g.wrap; if(!wrap||wrap.__rr===g) return; wrap.__rr=g;
  g.cv.addEventListener('pointerdown',function(e){ if(g.phase!=='play'||g.paused) return; var l=laneAt(g,e); if(l>=0){ g.lastLane=l; judge(g,l); e.preventDefault(); } });
  wrap.addEventListener('click',function(e){ var t=e.target; if(!t.closest) return;
    var tk=t.closest('[data-rr-track]'); if(tk){ g.track=tk.getAttribute('data-rr-track'); overlay(g); return; }
    var of=t.closest('[data-rr-off]'); if(of){ setOffset(g,g.offset+parseInt(of.getAttribute('data-rr-off'),10)); return; }
    if(t.closest('[data-rr-start]')){ begin(g); return; }
    if(t.closest('[data-rr-resume]')){ togglePause(g); return; }
    if(t.closest('[data-rr-quit]')){ g.phase='ready'; g.paused=false; try{ AC&&AC.suspend(); }catch(er){} overlay(g); return; }
    if(t.closest('#rr-pause')){ togglePause(g); return; }
    if(t.closest('#rr-fs,[data-rr-fs]')){ toggleFS(); return; }
    if(t.closest('#rr-mute')){ try{ localStorage.setItem('gx-mute',muted()?'0':'1'); }catch(er){} $('rr-mute').textContent=muted()?'🔇':'🔊'; } });
  if(window.ResizeObserver) new ResizeObserver(function(){ fit(g); }).observe(wrap);
  g.api={begin:function(){ begin(g); },judge:function(l){ judge(g,l); },songT:function(){ return songT(g); },od:function(){ activateOD(g); }};
}
function onFS(){ var g=rr(); if(g) setTimeout(function(){ fit(g); },60); }
document.addEventListener('fullscreenchange',onFS); document.addEventListener('webkitfullscreenchange',onFS);
var KEYL={d:0,f:1,j:2,k:3,arrowleft:0,arrowdown:1,arrowup:2,arrowright:3};
document.addEventListener('keydown',function(e){
  var g=rr(); if(!g||state.view!=='games') return; var k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k)>=0) e.preventDefault();
  if(e.repeat) return;
  if(g.phase==='play'){
    if(k==='p'||k==='escape'&&false){ togglePause(g); return; }
    if(k===' '){ activateOD(g); return; }
    if(k==='f'&&!(g.phase==='play'&&false)){ /* F is also a lane key; fullscreen uses the button or Shift+F */ if(e.shiftKey){ toggleFS(); return; } }
    if(KEYL.hasOwnProperty(k)){ g.lastLane=KEYL[k]; judge(g,KEYL[k]); }
  } else { if(k==='f'){ toggleFS(); } else if(k==='enter'&&g.phase==='ready'){ begin(g); } }
},true);
})();
