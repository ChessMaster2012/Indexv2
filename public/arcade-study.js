/* Study Mode v3 — a 40-round, 5-stage study run on ANY material: AI topic, saved study set or note.
   The shared GameStudy picker runs first (study is in GATED); rounds are built from GameStudy.session.bank via GameStudy.take(1),
   so AI sources keep refilling. Flashcard sets keep the full mix (choice, typed recall, true/false, pair-matching); AI/note/quiz
   questions become multiple choice, typed recall (short answers) and true/false. Each stage = 8 rounds with a progress bar and a
   stage summary; streak multiplier, earnable lifelines, missed-item retries, results with review. Coins: +5 per fresh correct answer
   (addCoins), +10 per cleared stage, +20 for finishing; XP via addXP. */
(function(){
'use strict';
var cfg={timed:true};
var STAGES=5, PER=8, SNAMES=['Warm-up','Building','Deep dive','Challenge','Final boss'];
function GS(){ return (window.GameStudy&&GameStudy.session)||null; }
var $=function(id){ return document.getElementById(id); };
function esc2(s){ return (typeof esc==='function')?esc(String(s==null?'':s)):String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function norm(s){ return String(s==null?'':s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim(); }
function lev(a,b){ var m=a.length,n=b.length,d=[],i,j; for(i=0;i<=m;i++){ d[i]=[i]; } for(j=1;j<=n;j++) d[0][j]=j; for(i=1;i<=m;i++) for(j=1;j<=n;j++) d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); return d[m][n]; }
function shuf(a){ a=a.slice(); for(var i=a.length-1;i>0;i--){ var j=(Math.random()*(i+1))|0, t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function fmt(s){ s=Math.max(0,Math.ceil(s)); return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
var AC=null;
function muted(){ try{ return localStorage.getItem('gx-mute')==='1'; }catch(e){ return false; } }
function sfx(kind){ if(muted()) return; try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume(); var P={good:[520,1040,.18,'triangle',.09],bad:[220,110,.25,'sawtooth',.08],streak:[660,1320,.3,'triangle',.1],life:[400,900,.2,'sine',.08],tick:[900,900,.04,'square',.04],done:[440,880,.5,'triangle',.12]}[kind]; if(!P) return; var o=AC.createOscillator(), g=AC.createGain(), t=AC.currentTime; o.type=P[3]; o.frequency.setValueAtTime(P[0],t); o.frequency.exponentialRampToValueAtTime(P[1],t+P[2]); g.gain.setValueAtTime(P[4],t); g.gain.exponentialRampToValueAtTime(.0001,t+P[2]); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+P[2]+.02); }catch(e){} }

function ling(){ try{ var id=(state.progress.equipped&&state.progress.equipped.indexling)||'ling-sugarbug', sid=(typeof getEquippedSkinId==='function'&&getEquippedSkinId(id))||'', l=cosmeticById(id)||cosmeticById('ling-sugarbug'), sk=sid&&typeof skinById==='function'?skinById(sid):null; if(typeof indexlingArtHtml==='function') return indexlingArtHtml(l,true,sk||{}); }catch(e){} return arcadeCharacterHtml(); }
/* ------------------------------ setup screen ------------------------------ */
window.arcadeStudySetup=function(){
  var sp=(arcadeGameProgress().study)||{}, S=GS();
  var pills='<span class="arcade-pill">🔥 Best streak <b>'+(sp.bestStreak||0)+'</b></span><span class="arcade-pill">⭐ Best score <b>'+(sp.best||0)+'</b></span><span class="arcade-pill">📚 Sessions <b>'+(sp.sessions||0)+'</b></span>';
  if(!S) return arcadeFrame('Study Mode','Choose your material, then play '+STAGES*PER+' rounds in '+STAGES+' stages.',pills,'<div class="st-setup"><div class="st-opts"><p>Pick an AI topic, a saved study set or one of your notes to begin.</p></div><button class="btn btn-primary btn-lg" data-st="repick">Choose what to study</button></div>');
  return arcadeFrame('Study Mode',STAGES*PER+' rounds in '+STAGES+' stages, built from your chosen material.',pills,
    '<div class="st-setup"><div class="st-opts"><div class="st-optrow"><b>Studying</b><span>'+esc2(S.title)+'</span></div>'+
    '<div class="st-optrow"><b>Question timer</b><div class="st-pills" id="st-tm">'+[[true,'20 sec each'],[false,'Relaxed']].map(function(o){ return '<button type="button" class="st-pill '+(cfg.timed===o[0]?'on':'')+'" data-st="timed" data-v="'+o[0]+'">'+o[1]+'</button>'; }).join('')+'</div></div></div>'+
    '<div class="st-how"><span>✅ Multiple choice</span><span>⌨️ Type from memory</span><span>⚖️ True / False</span><span>🧩 Match pairs (flashcard sets)</span><span>🔥 Streak multiplier</span><span>🎁 Earn lifelines</span></div></div>'+
    '<div class="st-rbtns" style="margin-top:12px;justify-content:flex-start"><button class="btn btn-primary btn-lg" data-st="begin">Start '+STAGES*PER+'-round study</button><button class="btn btn-ghost" data-st="repick">Change topic</button></div>');
};

/* ------------------------------ session build ------------------------------ */
function itemsOf(set){
  if(set.type==='quiz') return set.questions.map(function(q,i){ return {key:'q'+i,q:q}; });
  return set.cards.map(function(c,i){ return {key:'c'+(c.id!=null?c.id:i),card:c}; });
}
function mkey(q){ return 'm'+String(q.q).toLowerCase().replace(/\s+/g,' ').slice(0,100); }
window.arcadeStudyStart=function(id,opts){
  opts=opts||{}; var S=GS(), items=opts.items||null, cardMode=false;
  if(!items&&S&&S.source==='sets'){ var set=(state.studySets||[]).filter(function(x){ return x.type==='flashcards'&&x.title===S.title&&x.cards&&x.cards.length>=4; })[0]; if(set){ items=itemsOf(set); cardMode=true; } }
  if(!items&&!(S&&S.bank&&S.bank.length)) return; clearGameTimers();
  var stages=opts.review?1:STAGES, per=opts.review?Math.max(5,Math.min(12,items.length)):PER;
  var g={active:'study',st:true,items:items,cardMode:cardMode||!!(items&&items.some(function(x){ return x.card; })),deck:[],n:0,retry:[],cur:null,phase:'q',
    stages:stages,per:per,stage:0,sIdx:0,stPips:[],stStat:{c:0,w:0,pts:0,best:0},stDone:[],
    correct:0,wrong:0,skipped:0,streak:0,bestStreak:0,points:0,coins:0,xp:0,elapsed:0,
    qMax:cfg.timed?20:0,qLeft:cfg.timed?20:0,life:{fifty:1,skip:1,time:1},missed:{},log:[],review:!!opts.review,paused:false,mood:'ready',say:'Let\'s learn! 💪',times:[],lastTick:Date.now(),fbUntil:0};
  state.games=g; nextRound(g);
  if(!g.cur){ state.games={active:null,setupType:'study'}; return; }
  g.timerId=setInterval(function(){ tick(g); },200);
  try{ renderGames(); }catch(e){}
};
function mult(g){ return Math.min(3,1+Math.floor(g.streak/3)*.5); }
function pickItem(g){
  var due=g.retry.findIndex(function(r){ return g.n>=r.at; }); if(due>=0&&!g.review){ var r=g.retry.splice(due,1)[0]; return {item:r.item,retry:true}; }
  if(g.items){ if(!g.deck.length) g.deck=shuf(g.items); var it=g.deck.pop(); if(g.cur&&g.items.length>1&&it.key===g.cur.key&&g.deck.length){ var o=g.deck.pop(); g.deck.push(it); it=o; } return {item:it,retry:false}; }
  var qs=(window.GameStudy&&GameStudy.take)?GameStudy.take(1):[]; if(!qs.length) return null;
  if(g.cur&&g.cur.item&&g.cur.item.q&&mkey(qs[0])===g.cur.key){ var q2=GameStudy.take(1); if(q2.length) qs=q2; }
  return {item:{key:mkey(qs[0]),q:qs[0],mc:1},retry:false};
}
function shortAns(a){ a=String(a||''); return a.length<=28&&a.split(/\s+/).length<=4; }
function nextRound(g){
  var pk=pickItem(g); if(!pk){ if(g.n>0) finish(g); return; }
  var it=pk.item, n=g.n, r={key:it.key,item:it,retry:pk.retry,hidden:[]};
  if(it.q){
    var q=it.q, ans=q.options[q.correct]; r.expl=q.explanation||q.explain||'';
    if(!pk.retry&&shortAns(ans)&&n%4===1){ r.kind='recall'; r.prompt=q.q; r.answer=ans; r.label='Type the answer from memory'; }
    else if(!pk.retry&&n%5===3&&q.options.length>1){ var truth=Math.random()<.5, wr=shuf(q.options.filter(function(o,i){ return i!==q.correct; }))[0]; r.kind='tf'; r.statement=q.q; r.eq='Answer:'; r.truth=truth||!wr; r.shown=r.truth?ans:wr; r.answer=ans; r.prompt=q.q; }
    else { r.kind='choice'; r.prompt=q.q; r.options=q.options.slice(); r.correct=q.correct; r.answer=ans; }
  } else {
    var c=it.card, cards=g.items.filter(function(x){ return x.card&&x.key!==it.key; }), many=cards.length, kind;
    if(n%5===4&&many>=3&&!pk.retry) kind='match'; else if(n%3===1) kind='recall'; else if(n%4===2&&many>=1) kind='tf'; else kind=many>=1?'choice':'recall';
    r.kind=kind;
    if(kind==='choice'){ var others=shuf(cards).slice(0,3).map(function(x){ return x.card.back; }); r.options=shuf([c.back].concat(others)); r.correct=r.options.indexOf(c.back); r.prompt=c.front; r.answer=c.back; }
    else if(kind==='recall'){ r.prompt=c.back; r.answer=c.front; r.label='Which term matches this definition?'; }
    else if(kind==='tf'){ var truth2=Math.random()<.5, fake=shuf(cards)[0]; r.statement=c.front; r.eq='means'; r.shown=truth2||!fake?c.back:fake.card.back; r.truth=truth2||!fake; r.answer=c.back; r.prompt=c.front; }
    else if(kind==='match'){ var pool=[it].concat(shuf(cards).slice(0,3)); r.pairs=pool.map(function(x){ return {key:x.key,front:x.card.front,back:x.card.back}; }); r.left=shuf(r.pairs); r.right=shuf(r.pairs); r.done={}; r.mist=0; r.selL=null; r.selR=null; r.answer='Match all '+pool.length+' pairs'; r.prompt='Match each term to its definition'; }
  }
  g.cur=r; g.phase='q'; g.qLeft=g.qMax; g.t0=Date.now(); g.n++;
  paint(g);
}
window.arcadeStudyFinish=function(){ var g=state.games; if(!g||!g.st||g.phase==='done') return; finish(g); };
window.arcadeStudyChoice=function(){}; window.arcadeStudyRecall=function(){}; window.arcadeStudyNext=function(){};
window.arcadeStudyHtml=function(){
  var g=state.games; if(!g||!g.st) return ''; setTimeout(function(){ paint(g); },0);
  var sub=g.review?'Reviewing your missed items — no coins in review.':'A:B:C:D or 1–4 to answer · Space continues · F for focus mode';
  return arcadeFrame('Study Mode',sub.replace('A:B:C:D','A/B/C/D'),'','<div class="st-wrap" id="st-wrap"><div id="st-root"></div></div>');
};

/* ------------------------------ ticking ------------------------------ */
function tick(g){
  if(state.games!==g||g.phase==='done'){ clearInterval(g.timerId); return; }
  var now=Date.now(), dt=Math.min(.5,(now-g.lastTick)/1000); g.lastTick=now; if(g.paused) return;
  if(g.phase!=='stage') g.elapsed+=dt; var tEl=$('st-elapsed'); if(tEl) tEl.textContent=fmt(g.elapsed);
  if(g.phase==='q'&&g.qMax){ g.qLeft-=dt; var qb=$('st-qbar'); if(qb){ qb.style.width=(Math.max(0,g.qLeft/g.qMax)*100)+'%'; qb.className=g.qLeft<5?'low':''; } if(g.qLeft<=0){ answer(g,false,{timeout:true}); } else if(g.qLeft<5&&Math.floor(g.qLeft)!==g._tk){ g._tk=Math.floor(g.qLeft); sfx('tick'); } }
  if(g.phase==='fb'&&now>=g.fbUntil) advance(g);
}
function advance(g){
  if(g.phase!=='fb') return;
  g.sIdx++; if(g.sIdx<g.per){ nextRound(g); return; }
  endStage(g);
}
function endStage(g){
  var st=g.stStat, tot=st.c+st.w, acc=tot?Math.round(st.c/tot*100):0, rec={name:SNAMES[g.stage]||('Stage '+(g.stage+1)),c:st.c,w:st.w,pts:st.pts,acc:acc,pips:g.stPips.slice(),best:st.best,bonus:0,reward:''};
  if(!g.review&&acc>=60){ try{ addCoins(10,'Study Mode stage clear'); g.coins+=10; rec.bonus=10; }catch(e){} try{ addXP(10); g.xp+=10; }catch(e){} }
  if(!g.review&&tot&&st.w===0){ var k=['fifty','skip','time'][g.stage%3]; g.life[k]++; rec.reward=k; }
  g.stDone.push(rec); sfx(acc>=60?'streak':'life');
  if(g.stage>=g.stages-1){ finish(g); return; }
  g.phase='stage'; g.mood=acc>=60?'happy':'ready'; g.say=acc>=80?'Stage cleared! 🌟':acc>=60?'On to the next! 💪':'Shake it off — next stage! 💡'; g.lastTick=Date.now(); paint(g);
}
function nextStage(g){
  if(g.phase!=='stage') return; g.stage++; g.sIdx=0; g.stPips=[]; g.stStat={c:0,w:0,pts:0,best:0}; g.lastTick=Date.now(); nextRound(g);
}

/* ------------------------------ answering ------------------------------ */
function answer(g,ok,info){
  if(g.phase!=='q') return; info=info||{}; var r=g.cur, el=(Date.now()-g.t0)/1000; g.times.push(el);
  if(ok){ g.correct++; g.streak++; if(g.streak>g.bestStreak) g.bestStreak=g.streak; g.stStat.c++; g.stStat.best=Math.max(g.stStat.best,g.streak); var gl=GS(); if(gl){ gl.asked++; gl.correct++; } var speed=g.qMax?Math.max(0,g.qLeft/g.qMax):.5, gain=Math.round((100+speed*50)*mult(g)); g.points+=gain; g.stStat.pts+=gain; info.gain=gain; g.say=['Nice! 🔥','Got it! ✨','Brilliant! 🧠','On fire! 🔥','Yes! 💥'][(Math.random()*5)|0]; g.mood='happy';
    if(!r.retry&&!g.review){ try{ addCoins(5,'Study Mode correct answer'); g.coins+=5; }catch(e){} try{ addXP(3); g.xp+=3; }catch(e){} }
    if(g.streak>0&&g.streak%5===0){ var k=['fifty','skip','time'][(g.streak/5)%3|0]; g.life[k]++; info.reward=k; g.say='Streak '+g.streak+'! Lifeline earned 🎁'; sfx('streak'); } else sfx('good');
    delete g.missed[r.key];
  } else { g.wrong++; g.stStat.w++; var gl2=GS(); if(gl2) gl2.asked++; g.streak=0; g.mood='sad'; g.say=info.timeout?'Time\'s up ⏰':'So close — review it! 💡'; sfx('bad'); g.missed[r.key]={prompt:r.kind==='tf'?r.statement:r.prompt,answer:r.answer,item:r.item};
    if(!g.review&&r.retry!==2){ g.retry.push({item:r.item,at:g.n+3}); } }
  g.log.push({key:r.key,ok:ok}); g.stPips.push(ok);
  g.phase='fb'; g.info=info; g.fbUntil=Date.now()+(ok?900:2200); paint(g);
}
function lifeline(g,k){
  if(g.phase!=='q'||g.paused||!g.life[k]) return; var r=g.cur;
  if(k==='fifty'){ if(!(r.kind==='choice'&&r.options&&r.options.length>2)) return; var wrongs=r.options.map(function(o,i){ return i; }).filter(function(i){ return i!==r.correct&&r.hidden.indexOf(i)<0; }); shuf(wrongs).slice(0,2).forEach(function(i){ r.hidden.push(i); }); }
  else if(k==='skip'){ g.life.skip--; g.skipped++; g.retry.push({item:r.item,at:g.n+2}); g.say='Skipped — it\'ll be back 👀'; g.mood='ready'; sfx('life'); nextRound(g); return; }
  else if(k==='time'){ if(!g.qMax) return; g.qLeft=g.qMax; g.say='Timer reset ⏳'; }
  g.life[k]--; sfx('life'); paint(g);
}
function finish(g){
  if(g.phase==='done') return; g.phase='done'; clearInterval(g.timerId); sfx('done'); var tot=g.correct+g.wrong; g.acc=tot?Math.round(g.correct/tot*100):0;
  var gp=arcadeGameProgress(); gp.study=gp.study||{}; var s=gp.study;
  if(!g.review){ g.newBest=g.points>(Number(s.best)||0); s.best=Math.max(Number(s.best)||0,g.points); s.sessions=(Number(s.sessions)||0)+1; s.correct=(Number(s.correct)||0)+g.correct; s.answered=(Number(s.answered)||0)+tot; s.bestStreak=Math.max(Number(s.bestStreak)||0,g.bestStreak); s.bestAcc=Math.max(Number(s.bestAcc)||0,tot>=5?g.acc:0); s.minutes=(Number(s.minutes)||0)+Math.round(g.elapsed/60);
    if(tot>=g.stages*g.per*.6){ try{ addCoins(20,'Study Mode session complete'); g.coins+=20; }catch(e){} try{ addXP(25); g.xp+=25; }catch(e){} } }
  try{ persistProgress(); }catch(e){} if(g.acc>=80&&tot>=8){ try{ celebrate(); }catch(e){} }
  paint(g);
}

/* ------------------------------ painting ------------------------------ */
function companion(g){ var cls=g.mood==='happy'?'happy':g.mood==='sad'?'sad':''; return '<div class="st-comp '+cls+'" id="st-comp"><div class="st-char">'+ling()+'</div><div class="st-say">'+esc2(g.say)+'</div></div>'; }
function pips(g,arr,cur){
  var h='<div class="st-pips">'; for(var i=0;i<g.per;i++){ h+='<i class="'+(i<arr.length?(arr[i]?'ok':'bad'):(cur&&i===arr.length?'cur':''))+'"></i>'; } return h+'</div>';
}
function topbar(g){
  var m=mult(g), done=g.stage*g.per+Math.min(g.sIdx,g.per), all=g.stages*g.per;
  return '<div class="st-top"><div class="st-clock"><span class="st-time">'+(g.review?'Review':'Stage '+(g.stage+1)+' <small>/ '+g.stages+' · '+esc2(SNAMES[g.stage]||'')+'</small>')+'</span> <span class="st-fine">Round '+Math.min(g.sIdx+1,g.per)+'/'+g.per+(g.review?'':' · '+done+'/'+all+' overall')+' · <span id="st-elapsed">'+fmt(g.elapsed)+'</span></span>'+pips(g,g.stPips,g.phase!=='stage')+'</div>'+
    '<div class="st-stats"><span class="st-chip">✅ <b>'+g.correct+'</b></span><span class="st-chip '+(g.streak>=3?'hot':'')+'">🔥 <b>'+g.streak+'</b>'+(m>1?' <em>×'+m.toFixed(1)+'</em>':'')+'</span><span class="st-chip">⭐ <b>'+g.points+'</b></span></div>'+
    '<div class="st-tools"><button type="button" class="st-tool" data-st="pause" title="Pause (P)">'+(g.paused?'▶':'⏸')+'</button><button type="button" class="st-tool" data-st="fs" title="Focus mode (F)">⛶</button></div></div>';
}
function lifebar(g){
  var r=g.cur, canFifty=r&&r.kind==='choice'&&r.options&&r.options.length>2;
  function b(k,icon,name){ return '<button type="button" class="st-life" data-st="life" data-k="'+k+'" '+((!g.life[k]||g.phase!=='q'||(k==='fifty'&&!canFifty)||(k==='time'&&!g.qMax))?'disabled':'')+'>'+icon+' <span>'+name+'</span> <b>×'+g.life[k]+'</b></button>'; }
  return '<div class="st-lifes">'+b('fifty','✂️','50/50')+b('skip','⏭','Skip')+b('time','⏳','Reset timer')+'<span class="st-hint">Every 5-streak earns a lifeline</span></div>';
}
function paint(g){
  var root=$('st-root'); if(!root||state.games!==g) return; var r=g.cur, h='';
  if(g.phase==='done'){ root.innerHTML=results(g); return; }
  h+=topbar(g);
  var body='';
  if(g.phase==='stage'&&!g.paused){ root.innerHTML=h+stageScreen(g); return; }
  if(g.paused){ body='<div class="st-pause"><h3>⏸ Paused</h3><p>Your timer is stopped.</p><button class="btn btn-primary" data-st="pause">Resume</button></div>'; }
  else if(r.kind==='choice'){
    var letters='ABCD', fb=g.phase==='fb';
    body='<div class="st-q">'+esc2(r.prompt)+'</div><div class="st-opts4">'+r.options.map(function(o,i){ var cls='st-opt'; if(r.hidden.indexOf(i)>=0) cls+=' gone'; if(fb){ if(i===r.correct) cls+=' good'; else if(i===g.info.chosen) cls+=' bad'; } return '<button type="button" class="'+cls+'" data-st="opt" data-i="'+i+'" '+(fb||r.hidden.indexOf(i)>=0?'disabled':'')+'><kbd>'+letters[i]+'</kbd><span>'+esc2(o)+'</span></button>'; }).join('')+'</div>';
  } else if(r.kind==='tf'){
    var fb2=g.phase==='fb';
    body='<div class="st-q small">True or false?</div><div class="st-tf"><div class="st-tfterm">'+esc2(r.statement)+'</div><div class="st-tfeq">'+esc2(r.eq||'means')+'</div><div class="st-tfdef">'+esc2(r.shown)+'</div></div><div class="st-tfbtns"><button type="button" class="st-opt '+(fb2?(r.truth?'good':(g.info.chosen===true?'bad':'')):'')+'" data-st="tf" data-v="1" '+(fb2?'disabled':'')+'><kbd>T</kbd><span>✅ True</span></button><button type="button" class="st-opt '+(fb2?(!r.truth?'good':(g.info.chosen===false?'bad':'')):'')+'" data-st="tf" data-v="0" '+(fb2?'disabled':'')+'><kbd>F</kbd><span>❌ False</span></button></div>';
  } else if(r.kind==='recall'){
    var fb3=g.phase==='fb';
    body='<div class="st-q small">'+esc2(r.label||'Type the answer from memory')+'</div><div class="st-def">'+esc2(r.prompt)+'</div><div class="st-recall"><input id="st-input" autocomplete="off" spellcheck="false" placeholder="Type your answer…" '+(fb3?'disabled':'')+' value="'+(fb3?esc2(g.info.typed||''):'')+'" class="'+(fb3?(g.log[g.log.length-1].ok?'good':'bad'):'')+'"><button type="button" class="btn btn-primary" data-st="check" '+(fb3?'disabled':'')+'>Check</button></div>';
  } else if(r.kind==='match'){
    body='<div class="st-q small">🧩 '+esc2(r.prompt)+'</div><div class="st-match"><div class="st-mcol">'+r.left.map(function(p){ return '<button type="button" class="st-mi '+(r.done[p.key]?'done ':'')+(r.selL===p.key?'sel':'')+'" data-st="ml" data-k="'+p.key+'" '+(r.done[p.key]||g.phase==='fb'?'disabled':'')+'>'+esc2(p.front)+'</button>'; }).join('')+'</div><div class="st-mcol">'+r.right.map(function(p){ return '<button type="button" class="st-mi '+(r.done[p.key]?'done ':'')+(r.selR===p.key?'sel':'')+'" data-st="mr" data-k="'+p.key+'" '+(r.done[p.key]||g.phase==='fb'?'disabled':'')+'>'+esc2(p.back)+'</button>'; }).join('')+'</div></div><div class="st-fine">Mistakes: '+r.mist+' (2 or more counts as missed)</div>';
  }
  var fbx='';
  if(g.phase==='fb'){ var ok=g.log[g.log.length-1].ok, i=g.info; fbx='<div class="st-fb '+(ok?'good':'bad')+'"><b>'+(ok?'Correct!'+(i.gain?' +'+i.gain:''):(i.timeout?'Time\'s up':'Not quite'))+'</b>'+(ok&&i.close?' <span>(close enough — answer: '+esc2(r.answer)+')</span>':'')+(!ok?'<div>Answer: <strong>'+esc2(r.kind==='tf'?(r.truth?r.shown:r.answer):r.answer)+'</strong></div>':'')+(r.expl?'<div class="st-expl">'+esc2(r.expl)+'</div>':'')+(i.reward?'<div class="st-reward">🎁 Lifeline earned: '+({fifty:'50/50',skip:'Skip',time:'Timer reset'}[i.reward])+'</div>':'')+'<button type="button" class="btn btn-ghost btn-sm" data-st="next">Continue ▸</button></div>'; }
  var qbar=(g.qMax&&g.phase==='q'&&!g.paused&&r.kind!=='match'||g.qMax&&g.phase==='q'&&!g.paused)?'<div class="st-qbar"><i id="st-qbar" style="width:'+(Math.max(0,g.qLeft/g.qMax)*100)+'%"></i></div>':'';
  h+='<div class="st-main">'+companion(g)+'<div class="st-card '+(g.phase==='fb'?(g.log[g.log.length-1].ok?'ok':'no'):'')+'">'+(r.retry?'<span class="st-tag">↻ Second chance</span>':'')+(r.kind==='recall'||r.kind==='choice'||r.kind==='tf'||r.kind==='match'?'':'')+body+fbx+qbar+'</div></div>'+lifebar(g);
  root.innerHTML=h;
  var inp=$('st-input'); if(inp&&g.phase==='q'&&!g.paused){ inp.focus(); inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.stopPropagation(); submitRecall(g); } e.stopPropagation(); }); }
}
function stageScreen(g){
  var rec=g.stDone[g.stDone.length-1], nx=g.stage+1;
  return '<div class="st-stage">'+companion(g)+'<div class="st-card ok"><span class="st-tag">Stage '+(g.stage+1)+' of '+g.stages+' complete</span><h3>'+esc2(rec.name)+'</h3>'+pips(Object.assign({},g,{per:g.per}),rec.pips,false)+
    '<div class="st-rgrid"><div><b>'+rec.c+'/'+(rec.c+rec.w)+'</b><span>Correct · '+rec.acc+'%</span></div><div><b>'+rec.pts+'</b><span>Stage score</span></div><div><b>🔥 '+rec.best+'</b><span>Best streak</span></div><div><b>'+(rec.bonus?'+'+rec.bonus+' 🪙':'—')+'</b><span>Stage bonus</span></div></div>'+
    (rec.reward?'<div class="st-reward">🎁 Flawless stage — lifeline earned: '+({fifty:'50/50',skip:'Skip',time:'Timer reset'}[rec.reward])+'</div>':'')+
    '<p class="st-fine">Up next: stage '+(nx+1)+' · '+esc2(SNAMES[nx]||'')+' · '+(g.stages-nx)+' stage'+(g.stages-nx>1?'s':'')+' to go</p><button type="button" class="btn btn-primary btn-lg" data-st="stagego">Start stage '+(nx+1)+' ▸</button></div></div>';
}
function results(g){
  var tot=g.correct+g.wrong, avg=g.times.length?(g.times.reduce(function(a,b){ return a+b; },0)/g.times.length):0, miss=Object.keys(g.missed).map(function(k){ return g.missed[k]; });
  var grade=g.acc>=90?'🏆 Mastery!':g.acc>=75?'🌟 Great session':g.acc>=50?'👍 Good progress':'💪 Keep practicing';
  return '<div class="st-results"><div class="st-rtop">'+companion(Object.assign({},g,{mood:g.acc>=60?'happy':'sad',say:grade}))+'<div><h2>'+grade+'</h2><p class="st-fine">'+(g.review?'Review session':esc2((GS()||{}).title||'Study run'))+'</p></div></div>'+
    '<div class="st-rgrid"><div><b>'+g.points+'</b><span>Score'+(g.newBest?' ⭐ new best':'')+'</span></div><div><b>'+g.correct+'/'+tot+'</b><span>Correct · '+g.acc+'%</span></div><div><b>🔥 '+g.bestStreak+'</b><span>Best streak</span></div><div><b>'+avg.toFixed(1)+'s</b><span>Avg per answer</span></div></div>'+
    '<div class="st-stagesum">'+g.stDone.map(function(d,i){ return '<div><b>'+(g.review?'Review':'Stage '+(i+1))+'</b>'+pips(g,d.pips,false)+'<span>'+d.c+'/'+(d.c+d.w)+' · '+d.acc+'%</span></div>'; }).join('')+'</div>'+'<div class="st-ring" style="--p:'+g.acc+'"><span>'+g.acc+'%</span></div>'+
    (g.coins?'<p class="st-fine">🪙 +'+g.coins+' coins'+(g.xp?' · ✨ +'+g.xp+' XP':'')+' earned this session (daily coin cap applies).</p>':'')+((window.GameStudy&&GameStudy.summaryHtml)?GameStudy.summaryHtml():'')+
    (miss.length?'<div class="st-miss"><h4>Needs review ('+miss.length+')</h4>'+miss.slice(0,12).map(function(m){ return '<div class="st-missrow"><span>'+esc2(m.prompt)+'</span><b>'+esc2(m.answer)+'</b></div>'; }).join('')+(miss.length>12?'<div class="st-fine">+'+(miss.length-12)+' more</div>':'')+'</div>':'<p class="st-fine">🎉 Nothing missed — perfect recall!</p>')+
    '<div class="st-rbtns"><button class="btn btn-primary btn-lg" data-st="again">Study again</button><button class="btn btn-ghost btn-lg" data-st="repick">New topic</button>'+(miss.length?'<button class="btn btn-pink btn-lg" data-st="review">Review missed ('+miss.length+')</button>':'')+'<button class="btn btn-ghost" data-action="arcade-hub">← All games</button></div></div>';
}

/* ------------------------------ input ------------------------------ */
function submitRecall(g){
  if(g.phase!=='q'||g.paused||g.cur.kind!=='recall') return; var inp=$('st-input'); var v=inp?inp.value:''; if(!norm(v)) return;
  var a=norm(g.cur.answer), b=norm(v), ok=a===b, close=false; if(!ok&&a.length>=6&&lev(a,b)<=1){ ok=true; close=true; }
  answer(g,ok,{typed:v,close:close});
}
function repick(){
  if(!window.GameStudy) return; var c=state.games; if(c&&c.timerId) clearInterval(c.timerId);
  GameStudy.pick('study').then(function(s){ if(!s) { try{ renderGames(); }catch(e){} return; } state.games={active:null,setupType:'study',selectedSetId:null}; try{ renderGames(); }catch(e){} });
}
function onClick(e){
  var t=e.target.closest&&e.target.closest('[data-st]'); if(!t) return; var a=t.getAttribute('data-st'), g=state.games;
  if(!g||!g.st){
    if(state.view!=='games'||!g||g.setupType!=='study') return;
    if(a==='timed'){ cfg.timed=t.getAttribute('data-v')==='true'; document.querySelectorAll('#st-tm .st-pill').forEach(function(b){ b.classList.toggle('on',b===t); }); }
    else if(a==='begin') window.arcadeStudyStart();
    else if(a==='repick') repick();
    return;
  }
  if(a==='opt'){ if(g.phase!=='q'||g.paused) return; var i=+t.getAttribute('data-i'); answer(g,i===g.cur.correct,{chosen:i}); }
  else if(a==='tf'){ if(g.phase!=='q'||g.paused) return; var v=t.getAttribute('data-v')==='1'; answer(g,v===g.cur.truth,{chosen:v}); }
  else if(a==='check') submitRecall(g);
  else if(a==='next') advance(g);
  else if(a==='stagego') nextStage(g);
  else if(a==='life') lifeline(g,t.getAttribute('data-k'));
  else if(a==='pause') togglePause(g);
  else if(a==='fs') toggleFS();
  else if(a==='ml'||a==='mr') matchClick(g,a,t.getAttribute('data-k'));
  else if(a==='again'){ if(GS()){ window.arcadeStudyStart(); renderGames(); } else repick(); }
  else if(a==='repick') repick();
  else if(a==='review'){ var items=Object.keys(g.missed).map(function(k){ return g.missed[k].item; }).filter(Boolean); if(items.length){ window.arcadeStudyStart(null,{items:items,review:true}); renderGames(); } }
}
function matchClick(g,side,key){
  var r=g.cur; if(g.phase!=='q'||g.paused||r.kind!=='match') return;
  if(side==='ml') r.selL=r.selL===key?null:key; else r.selR=r.selR===key?null:key;
  if(r.selL&&r.selR){ if(r.selL===r.selR){ r.done[r.selL]=true; sfx('good'); } else { r.mist++; sfx('bad'); var root=$('st-root'); if(root){ root.querySelectorAll('.st-mi.sel').forEach(function(b){ b.classList.add('shake'); }); } }
    r.selL=r.selR=null; if(r.pairs.every(function(p){ return r.done[p.key]; })){ answer(g,r.mist<2,{}); if(r.mist>=2){ r.pairs.forEach(function(p){ g.missed[p.key]=g.missed[p.key]||{prompt:p.front,answer:p.back,item:g.items.find(function(x){ return x.key===p.key; })||r.item}; }); } return; } }
  paint(g);
}
function togglePause(g){ if(g.phase==='done') return; g.paused=!g.paused; g.lastTick=Date.now(); paint(g); }
function isFS(){ var st=$('games-stage'); return !!st&&(document.fullscreenElement===st||document.webkitFullscreenElement===st); }
function toggleFS(){ var w=$('games-stage'); if(!w) return; try{ if(isFS()) (document.exitFullscreen||document.webkitExitFullscreen).call(document); else (w.requestFullscreen||w.webkitRequestFullscreen).call(w); }catch(e){} }
document.addEventListener('click',onClick);
document.addEventListener('keydown',function(e){
  var gm=state.games; if(state.view!=='games'||!gm||!gm.st) return; var g=gm, k=e.key.toLowerCase(), inInput=e.target&&e.target.tagName==='INPUT';
  if(inInput) return; if(g.phase==='done') return;
  if(k==='f'){ toggleFS(); return; } if(k==='p'){ togglePause(g); return; }
  if(g.paused) return;
  if(g.phase==='fb'&&(k===' '||k==='enter')){ e.preventDefault(); advance(g); return; }
  if(g.phase==='stage'&&(k===' '||k==='enter')){ e.preventDefault(); nextStage(g); return; }
  if(g.phase!=='q') return; var r=g.cur;
  if(r.kind==='choice'){ var i='abcd'.indexOf(k); if(i<0) i='1234'.indexOf(k); if(i>=0&&i<r.options.length&&r.hidden.indexOf(i)<0){ answer(g,i===r.correct,{chosen:i}); } }
  else if(r.kind==='tf'){ if(k==='t'||k==='1'){ answer(g,r.truth===true,{chosen:true}); } else if(k==='f'||k==='2'){ answer(g,r.truth===false,{chosen:false}); } }
  else if(r.kind==='recall'&&k==='enter') submitRecall(g);
},true);
})();
