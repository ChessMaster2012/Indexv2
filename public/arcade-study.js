/* Study Mode v2 — interactive 3/5/10-minute study sessions on a saved set.
   Question types (choice, typed recall, true/false, pair-matching), per-question timers, streak multiplier,
   earnable lifelines, missed-item retries, an Indexling companion, results with missed-item review, fullscreen focus mode.
   Overrides the arcade Study hooks from the main script. Coins: +5 per fresh correct answer (same rule as before, via addCoins). */
(function(){
'use strict';
var cfg={min:5,timed:true};
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
  var sets=state.studySets.filter(function(s){ return (s.type==='quiz'&&s.questions&&s.questions.length)||(s.type==='flashcards'&&s.cards&&s.cards.length); });
  var sel=state.games.selectedSetId;
  var pick=sets.length?sets.map(function(s){ var n=s.type==='quiz'?s.questions.length+' questions':s.cards.length+' cards'; return '<button class="set-pick-item '+(sel===s.id?'selected':'')+'" data-action="arcade-study-pick" data-id="'+s.id+'"><strong>'+esc2(s.title)+'</strong><br><span style="color:var(--ink-soft);">'+esc2((subjectById(s.subjectId)||{}).name||'')+' · '+n+'</span></button>'; }).join(''):'<div class="empty-state"><h3>No saved study sets</h3><p>Create one in Study Sets first.</p><button class="btn btn-primary btn-sm" data-action="goto" data-view="studysets">Go to Study Sets</button></div>';
  var sp=(arcadeGameProgress().study)||{};
  return arcadeFrame('Study Mode','Pick a set, choose your session length, and learn with streaks and lifelines.','<span class="arcade-pill">🔥 Best streak <b>'+(sp.bestStreak||0)+'</b></span><span class="arcade-pill">⭐ Best score <b>'+(sp.best||0)+'</b></span><span class="arcade-pill">📚 Sessions <b>'+(sp.sessions||0)+'</b></span>',
    '<div class="st-setup"><div class="set-pick-list">'+pick+'</div>'+
    '<div class="st-opts"><div class="st-optrow"><b>Session length</b><div class="st-pills" id="st-len">'+[3,5,10].map(function(m){ return '<button type="button" class="st-pill '+(cfg.min===m?'on':'')+'" data-st="len" data-v="'+m+'">'+m+' min</button>'; }).join('')+'</div></div>'+
    '<div class="st-optrow"><b>Question timer</b><div class="st-pills" id="st-tm">'+[[true,'20 sec each'],[false,'Relaxed']].map(function(o){ return '<button type="button" class="st-pill '+(cfg.timed===o[0]?'on':'')+'" data-st="timed" data-v="'+o[0]+'">'+o[1]+'</button>'; }).join('')+'</div></div></div>'+
    '<div class="st-how"><span>✅ Multiple choice</span><span>⌨️ Type from memory</span><span>⚖️ True / False</span><span>🧩 Match pairs</span><span>🔥 Streak multiplier</span><span>🎁 Earn lifelines</span></div></div>'+
    '<button class="btn btn-primary btn-lg" style="margin-top:12px;" data-action="arcade-study-start" '+(sel?'':'disabled')+'>Start '+cfg.min+'-minute study</button>');
};

/* ------------------------------ session build ------------------------------ */
function itemsOf(set){
  if(set.type==='quiz') return set.questions.map(function(q,i){ return {key:'q'+i,q:q}; });
  return set.cards.map(function(c,i){ return {key:'c'+(c.id!=null?c.id:i),card:c}; });
}
window.arcadeStudyStart=function(id,opts){
  opts=opts||{}; var set=state.studySets.find(function(x){ return x.id===id; }); if(!set) return;
  var items=opts.items||itemsOf(set); if(!items.length) return; clearGameTimers();
  var secs=opts.minutes?opts.minutes*60:cfg.min*60;
  var g={active:'study',selectedSetId:id,st:true,set:set,items:items,deck:[],n:0,retry:[],cur:null,phase:'q',
    correct:0,wrong:0,skipped:0,streak:0,bestStreak:0,points:0,coins:0,total:secs,left:secs,
    qMax:cfg.timed?20:0,qLeft:cfg.timed?20:0,life:{fifty:1,skip:1,time:1},missed:{},log:[],review:!!opts.review,paused:false,mood:'ready',say:'Let\'s learn! 💪',times:[],lastTick:Date.now(),fbUntil:0,cardMul:0};
  state.games=g; nextRound(g);
  g.timerId=setInterval(function(){ tick(g); },200);
  try{ renderGames(); }catch(e){}
};
function mult(g){ return Math.min(3,1+Math.floor(g.streak/3)*.5); }
function pickItem(g){
  var due=g.retry.findIndex(function(r){ return g.n>=r.at; }); if(due>=0&&!g.review){ var r=g.retry.splice(due,1)[0]; return {item:r.item,retry:true}; }
  if(!g.deck.length) g.deck=shuf(g.items); var it=g.deck.pop(); if(g.cur&&g.items.length>1&&it.key===g.cur.key&&g.deck.length) { var o=g.deck.pop(); g.deck.push(it); it=o; }
  return {item:it,retry:false};
}
function nextRound(g){
  var pk=pickItem(g), it=pk.item, set=g.set, n=g.n, r={key:it.key,item:it,retry:pk.retry,hidden:[]};
  if(it.q){ var q=it.q; r.kind='choice'; r.prompt=q.q; r.options=q.options.slice(); r.correct=q.correct; r.answer=q.options[q.correct]; r.expl=q.explanation||q.explain||''; }
  else {
    var c=it.card, cards=g.items.filter(function(x){ return x.card&&x.key!==it.key; }), many=cards.length;
    var kinds=['choice']; if(many>=1) kinds.push('tf'); kinds.push('recall'); var kind;
    if(n%5===4&&many>=3&&!pk.retry) kind='match'; else if(n%3===1) kind='recall'; else if(n%4===2&&many>=1) kind='tf'; else kind=many>=1?'choice':'recall';
    r.kind=kind;
    if(kind==='choice'){ var others=shuf(cards).slice(0,3).map(function(x){ return x.card.back; }); r.options=shuf([c.back].concat(others)); r.correct=r.options.indexOf(c.back); r.prompt=c.front; r.answer=c.back; }
    else if(kind==='recall'){ r.prompt=c.back; r.answer=c.front; r.label='Which term matches this definition?'; }
    else if(kind==='tf'){ var truth=Math.random()<.5, fake=shuf(cards)[0]; r.statement=c.front; r.shown=truth||!fake?c.back:fake.card.back; r.truth=truth||!fake; r.answer=c.back; r.prompt=c.front; }
    else if(kind==='match'){ var pool=[it].concat(shuf(cards).slice(0,3)); r.pairs=pool.map(function(x){ return {key:x.key,front:x.card.front,back:x.card.back}; }); r.left=shuf(r.pairs); r.right=shuf(r.pairs); r.done={}; r.mist=0; r.selL=null; r.selR=null; r.answer='Match all '+pool.length+' pairs'; r.prompt='Match each term to its definition'; }
  }
  g.cur=r; g.phase='q'; g.qLeft=g.qMax; g.t0=Date.now(); if(g.qMax) g.qLeft=g.qMax; g.n++;
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
  g.left-=dt; var tEl=$('st-time'); if(tEl) tEl.textContent=fmt(g.left); var tb=$('st-tbar'); if(tb){ tb.style.width=(Math.max(0,g.left/g.total)*100)+'%'; tb.className=g.left<30?'low':''; }
  if(g.phase==='q'&&g.qMax){ g.qLeft-=dt; var qb=$('st-qbar'); if(qb){ qb.style.width=(Math.max(0,g.qLeft/g.qMax)*100)+'%'; qb.className=g.qLeft<5?'low':''; } if(g.qLeft<=0){ answer(g,false,{timeout:true}); } else if(g.qLeft<5&&Math.floor(g.qLeft)!==g._tk){ g._tk=Math.floor(g.qLeft); sfx('tick'); } }
  if(g.phase==='fb'&&now>=g.fbUntil) advance(g);
  if(g.left<=0&&g.phase!=='done') finish(g);
}
function advance(g){ if(g.phase!=='fb') return; if(g.left<=0){ finish(g); return; } nextRound(g); }

/* ------------------------------ answering ------------------------------ */
function answer(g,ok,info){
  if(g.phase!=='q') return; info=info||{}; var r=g.cur, el=(Date.now()-g.t0)/1000; g.times.push(el);
  if(ok){ g.correct++; g.streak++; if(g.streak>g.bestStreak) g.bestStreak=g.streak; var speed=g.qMax?Math.max(0,g.qLeft/g.qMax):.5, gain=Math.round((100+speed*50)*mult(g)); g.points+=gain; info.gain=gain; g.say=['Nice! 🔥','Got it! ✨','Brilliant! 🧠','On fire! 🔥','Yes! 💥'][(Math.random()*5)|0]; g.mood='happy';
    if(!r.retry&&!g.review){ try{ addCoins(5,'Study Mode correct answer'); g.coins+=5; }catch(e){} }
    if(g.streak>0&&g.streak%5===0){ var k=['fifty','skip','time'][(g.streak/5)%3|0]; g.life[k]++; info.reward=k; g.say='Streak '+g.streak+'! Lifeline earned 🎁'; sfx('streak'); } else sfx('good');
    delete g.missed[r.key];
  } else { g.wrong++; g.streak=0; g.mood='sad'; g.say=info.timeout?'Time\'s up ⏰':'So close — review it! 💡'; sfx('bad'); g.missed[r.key]={prompt:r.kind==='tf'?r.statement:r.prompt,answer:r.answer,item:r.item};
    if(!g.review&&r.retry!==2){ g.retry.push({item:r.item,at:g.n+3}); } }
  g.log.push({key:r.key,ok:ok});
  g.phase='fb'; g.info=info; g.fbUntil=Date.now()+(ok?900:2200); paint(g);
}
function lifeline(g,k){
  if(g.phase!=='q'||g.paused||!g.life[k]) return; var r=g.cur;
  if(k==='fifty'){ if(!(r.kind==='choice'&&r.options&&r.options.length>2)) return; var wrongs=r.options.map(function(o,i){ return i; }).filter(function(i){ return i!==r.correct&&r.hidden.indexOf(i)<0; }); shuf(wrongs).slice(0,2).forEach(function(i){ r.hidden.push(i); }); }
  else if(k==='skip'){ g.life.skip--; g.skipped++; g.retry.push({item:r.item,at:g.n+2}); g.say='Skipped — it\'ll be back 👀'; g.mood='ready'; sfx('life'); nextRound(g); return; }
  else if(k==='time'){ g.left+=20; g.total+=20; g.qLeft=g.qMax; g.say='+20 seconds ⏳'; }
  g.life[k]--; sfx('life'); paint(g);
}
function finish(g){
  if(g.phase==='done') return; g.phase='done'; clearInterval(g.timerId); sfx('done'); var tot=g.correct+g.wrong; g.acc=tot?Math.round(g.correct/tot*100):0;
  var gp=arcadeGameProgress(); gp.study=gp.study||{}; var s=gp.study;
  if(!g.review){ g.newBest=g.points>(Number(s.best)||0); s.best=Math.max(Number(s.best)||0,g.points); s.sessions=(Number(s.sessions)||0)+1; s.correct=(Number(s.correct)||0)+g.correct; s.answered=(Number(s.answered)||0)+tot; s.bestStreak=Math.max(Number(s.bestStreak)||0,g.bestStreak); s.bestAcc=Math.max(Number(s.bestAcc)||0,tot>=5?g.acc:0); s.minutes=(Number(s.minutes)||0)+Math.round((g.total-Math.max(0,g.left))/60); }
  try{ persistProgress(); }catch(e){} if(g.acc>=80&&tot>=8){ try{ celebrate(); }catch(e){} }
  paint(g);
}

/* ------------------------------ painting ------------------------------ */
function companion(g){ var cls=g.mood==='happy'?'happy':g.mood==='sad'?'sad':''; return '<div class="st-comp '+cls+'" id="st-comp"><div class="st-char">'+ling()+'</div><div class="st-say">'+esc2(g.say)+'</div></div>'; }
function topbar(g){
  var m=mult(g); return '<div class="st-top"><div class="st-clock"><span class="st-time" id="st-time">'+fmt(g.left)+'</span><div class="st-bar"><i id="st-tbar" style="width:'+(Math.max(0,g.left/g.total)*100)+'%" class="'+(g.left<30?'low':'')+'"></i></div></div>'+
    '<div class="st-stats"><span class="st-chip">✅ <b>'+g.correct+'</b></span><span class="st-chip '+(g.streak>=3?'hot':'')+'">🔥 <b>'+g.streak+'</b>'+(m>1?' <em>×'+m.toFixed(1)+'</em>':'')+'</span><span class="st-chip">⭐ <b>'+g.points+'</b></span></div>'+
    '<div class="st-tools"><button type="button" class="st-tool" data-st="pause" title="Pause (P)">'+(g.paused?'▶':'⏸')+'</button><button type="button" class="st-tool" data-st="fs" title="Focus mode (F)">⛶</button></div></div>';
}
function lifebar(g){
  var r=g.cur, canFifty=r&&r.kind==='choice'&&r.options&&r.options.length>2;
  function b(k,icon,name){ return '<button type="button" class="st-life" data-st="life" data-k="'+k+'" '+((!g.life[k]||g.phase!=='q'||(k==='fifty'&&!canFifty))?'disabled':'')+'>'+icon+' <span>'+name+'</span> <b>×'+g.life[k]+'</b></button>'; }
  return '<div class="st-lifes">'+b('fifty','✂️','50/50')+b('skip','⏭','Skip')+b('time','⏳','+20s')+'<span class="st-hint">Every 5-streak earns a lifeline</span></div>';
}
function paint(g){
  var root=$('st-root'); if(!root||state.games!==g) return; var r=g.cur, h='';
  if(g.phase==='done'){ root.innerHTML=results(g); return; }
  h+=topbar(g);
  var body='';
  if(g.paused){ body='<div class="st-pause"><h3>⏸ Paused</h3><p>Your timer is stopped.</p><button class="btn btn-primary" data-st="pause">Resume</button></div>'; }
  else if(r.kind==='choice'){
    var letters='ABCD', fb=g.phase==='fb';
    body='<div class="st-q">'+esc2(r.prompt)+'</div><div class="st-opts4">'+r.options.map(function(o,i){ var cls='st-opt'; if(r.hidden.indexOf(i)>=0) cls+=' gone'; if(fb){ if(i===r.correct) cls+=' good'; else if(i===g.info.chosen) cls+=' bad'; } return '<button type="button" class="'+cls+'" data-st="opt" data-i="'+i+'" '+(fb||r.hidden.indexOf(i)>=0?'disabled':'')+'><kbd>'+letters[i]+'</kbd><span>'+esc2(o)+'</span></button>'; }).join('')+'</div>';
  } else if(r.kind==='tf'){
    var fb2=g.phase==='fb';
    body='<div class="st-q small">True or false?</div><div class="st-tf"><div class="st-tfterm">'+esc2(r.statement)+'</div><div class="st-tfeq">means</div><div class="st-tfdef">'+esc2(r.shown)+'</div></div><div class="st-tfbtns"><button type="button" class="st-opt '+(fb2?(r.truth?'good':(g.info.chosen===true?'bad':'')):'')+'" data-st="tf" data-v="1" '+(fb2?'disabled':'')+'><kbd>T</kbd><span>✅ True</span></button><button type="button" class="st-opt '+(fb2?(!r.truth?'good':(g.info.chosen===false?'bad':'')):'')+'" data-st="tf" data-v="0" '+(fb2?'disabled':'')+'><kbd>F</kbd><span>❌ False</span></button></div>';
  } else if(r.kind==='recall'){
    var fb3=g.phase==='fb';
    body='<div class="st-q small">'+esc2(r.label||'Type the answer from memory')+'</div><div class="st-def">'+esc2(r.prompt)+'</div><div class="st-recall"><input id="st-input" autocomplete="off" spellcheck="false" placeholder="Type the term…" '+(fb3?'disabled':'')+' value="'+(fb3?esc2(g.info.typed||''):'')+'" class="'+(fb3?(g.log[g.log.length-1].ok?'good':'bad'):'')+'"><button type="button" class="btn btn-primary" data-st="check" '+(fb3?'disabled':'')+'>Check</button></div>';
  } else if(r.kind==='match'){
    body='<div class="st-q small">🧩 '+esc2(r.prompt)+'</div><div class="st-match"><div class="st-mcol">'+r.left.map(function(p){ return '<button type="button" class="st-mi '+(r.done[p.key]?'done ':'')+(r.selL===p.key?'sel':'')+'" data-st="ml" data-k="'+p.key+'" '+(r.done[p.key]||g.phase==='fb'?'disabled':'')+'>'+esc2(p.front)+'</button>'; }).join('')+'</div><div class="st-mcol">'+r.right.map(function(p){ return '<button type="button" class="st-mi '+(r.done[p.key]?'done ':'')+(r.selR===p.key?'sel':'')+'" data-st="mr" data-k="'+p.key+'" '+(r.done[p.key]||g.phase==='fb'?'disabled':'')+'>'+esc2(p.back)+'</button>'; }).join('')+'</div></div><div class="st-fine">Mistakes: '+r.mist+' (2 or more counts as missed)</div>';
  }
  var fbx='';
  if(g.phase==='fb'){ var ok=g.log[g.log.length-1].ok, i=g.info; fbx='<div class="st-fb '+(ok?'good':'bad')+'"><b>'+(ok?'Correct!'+(i.gain?' +'+i.gain:''):(i.timeout?'Time\'s up':'Not quite'))+'</b>'+(ok&&i.close?' <span>(close enough — answer: '+esc2(r.answer)+')</span>':'')+(!ok?'<div>Answer: <strong>'+esc2(r.kind==='tf'?(r.truth?r.shown:r.answer):r.answer)+'</strong></div>':'')+(r.expl?'<div class="st-expl">'+esc2(r.expl)+'</div>':'')+(i.reward?'<div class="st-reward">🎁 Lifeline earned: '+({fifty:'50/50',skip:'Skip',time:'+20s'}[i.reward])+'</div>':'')+'<button type="button" class="btn btn-ghost btn-sm" data-st="next">Continue ▸</button></div>'; }
  var qbar=(g.qMax&&g.phase==='q'&&!g.paused&&r.kind!=='match'||g.qMax&&g.phase==='q'&&!g.paused)?'<div class="st-qbar"><i id="st-qbar" style="width:'+(Math.max(0,g.qLeft/g.qMax)*100)+'%"></i></div>':'';
  h+='<div class="st-main">'+companion(g)+'<div class="st-card '+(g.phase==='fb'?(g.log[g.log.length-1].ok?'ok':'no'):'')+'">'+(r.retry?'<span class="st-tag">↻ Second chance</span>':'')+(r.kind==='recall'||r.kind==='choice'||r.kind==='tf'||r.kind==='match'?'':'')+body+fbx+qbar+'</div></div>'+lifebar(g);
  root.innerHTML=h;
  var inp=$('st-input'); if(inp&&g.phase==='q'&&!g.paused){ inp.focus(); inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.stopPropagation(); submitRecall(g); } e.stopPropagation(); }); }
}
function results(g){
  var tot=g.correct+g.wrong, avg=g.times.length?(g.times.reduce(function(a,b){ return a+b; },0)/g.times.length):0, miss=Object.keys(g.missed).map(function(k){ return g.missed[k]; });
  var grade=g.acc>=90?'🏆 Mastery!':g.acc>=75?'🌟 Great session':g.acc>=50?'👍 Good progress':'💪 Keep practicing';
  return '<div class="st-results"><div class="st-rtop">'+companion(Object.assign({},g,{mood:g.acc>=60?'happy':'sad',say:grade}))+'<div><h2>'+grade+'</h2><p class="st-fine">'+(g.review?'Review session':esc2(g.set.title))+'</p></div></div>'+
    '<div class="st-rgrid"><div><b>'+g.points+'</b><span>Score'+(g.newBest?' ⭐ new best':'')+'</span></div><div><b>'+g.correct+'/'+tot+'</b><span>Correct · '+g.acc+'%</span></div><div><b>🔥 '+g.bestStreak+'</b><span>Best streak</span></div><div><b>'+avg.toFixed(1)+'s</b><span>Avg per answer</span></div></div>'+
    '<div class="st-ring" style="--p:'+g.acc+'"><span>'+g.acc+'%</span></div>'+
    (g.coins?'<p class="st-fine">🪙 +'+g.coins+' coins earned this session (daily cap applies).</p>':'')+
    (miss.length?'<div class="st-miss"><h4>Needs review ('+miss.length+')</h4>'+miss.slice(0,12).map(function(m){ return '<div class="st-missrow"><span>'+esc2(m.prompt)+'</span><b>'+esc2(m.answer)+'</b></div>'; }).join('')+(miss.length>12?'<div class="st-fine">+'+(miss.length-12)+' more</div>':'')+'</div>':'<p class="st-fine">🎉 Nothing missed — perfect recall!</p>')+
    '<div class="st-rbtns"><button class="btn btn-primary btn-lg" data-st="again">Study again</button>'+(miss.length?'<button class="btn btn-pink btn-lg" data-st="review">Review missed ('+miss.length+')</button>':'')+'<button class="btn btn-ghost" data-action="arcade-hub">← All games</button></div></div>';
}

/* ------------------------------ input ------------------------------ */
function submitRecall(g){
  if(g.phase!=='q'||g.paused||g.cur.kind!=='recall') return; var inp=$('st-input'); var v=inp?inp.value:''; if(!norm(v)) return;
  var a=norm(g.cur.answer), b=norm(v), ok=a===b, close=false; if(!ok&&a.length>=6&&lev(a,b)<=1){ ok=true; close=true; }
  answer(g,ok,{typed:v,close:close});
}
function onClick(e){
  var g=state.games; if(!g||!g.st) { var t0=e.target.closest&&e.target.closest('[data-st]'); if(t0){ var a0=t0.getAttribute('data-st'); if(a0==='len'){ cfg.min=+t0.getAttribute('data-v'); document.querySelectorAll('#st-len .st-pill').forEach(function(b){ b.classList.toggle('on',b===t0); }); var sb=document.querySelector('[data-action="arcade-study-start"]'); if(sb) sb.textContent='Start '+cfg.min+'-minute study'; } else if(a0==='timed'){ cfg.timed=t0.getAttribute('data-v')==='true'; document.querySelectorAll('#st-tm .st-pill').forEach(function(b){ b.classList.toggle('on',b===t0); }); } } return; }
  var t=e.target.closest&&e.target.closest('[data-st]'); if(!t||!g.st) return; var a=t.getAttribute('data-st');
  if(a==='opt'){ if(g.phase!=='q'||g.paused) return; var i=+t.getAttribute('data-i'); answer(g,i===g.cur.correct,{chosen:i}); }
  else if(a==='tf'){ if(g.phase!=='q'||g.paused) return; var v=t.getAttribute('data-v')==='1'; answer(g,v===g.cur.truth,{chosen:v}); }
  else if(a==='check') submitRecall(g);
  else if(a==='next') advance(g);
  else if(a==='life') lifeline(g,t.getAttribute('data-k'));
  else if(a==='pause') togglePause(g);
  else if(a==='fs') toggleFS();
  else if(a==='ml'||a==='mr') matchClick(g,a,t.getAttribute('data-k'));
  else if(a==='again') window.arcadeStudyStart(g.selectedSetId);
  else if(a==='review'){ var items=Object.keys(g.missed).map(function(k){ return g.missed[k].item; }); window.arcadeStudyStart(g.selectedSetId,{items:items,review:true,minutes:Math.max(3,Math.min(5,Math.ceil(items.length*.5)))}); renderGames(); }
  if(a==='again') renderGames();
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
  if(g.phase!=='q') return; var r=g.cur;
  if(r.kind==='choice'){ var i='abcd'.indexOf(k); if(i<0) i='1234'.indexOf(k); if(i>=0&&i<r.options.length&&r.hidden.indexOf(i)<0){ answer(g,i===r.correct,{chosen:i}); } }
  else if(r.kind==='tf'){ if(k==='t'||k==='1'){ answer(g,r.truth===true,{chosen:true}); } else if(k==='f'||k==='2'){ answer(g,r.truth===false,{chosen:false}); } }
  else if(r.kind==='recall'&&k==='enter') submitRecall(g);
},true);
})();
