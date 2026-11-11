/* Learn tab upgrade: long, multi-module lessons (Standard ≈ 1.5 h, Deep ≈ 3 h+) with teaching pages,
   worked examples, try-it practice, checkpoint quizzes you must pass, a final mastery check, and
   progress that is saved on this device so you can stop and resume. The original quick lesson stays
   available. Content is generated one module at a time (3 small AI calls) and cached, so a lesson never
   has to be rebuilt. Uses the existing askJSON() / Vireonix path unchanged. */
(function(){
'use strict';
if(typeof askJSON!=='function'||typeof teachMe!=='function'||typeof subjectById!=='function') return;
var safe=function(f,d){try{return f();}catch(e){return d;}};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var rich=function(t){ return safe(function(){return formatTutorText(String(t||''));},esc(t)); };
var $=function(id){return document.getElementById(id);};
var KEY='index-learn-v2', DEPTH_KEY='index-learn-depth', MAX_LESSONS=10;
var DEPTHS={quick:{label:'Quick',sub:'≈ 5 min · one page',n:0},standard:{label:'Standard',sub:'≈ 1½ hours · 6 modules',n:6},deep:{label:'Deep',sub:'≈ 3+ hours · 10 modules',n:10}};
var PASS=0.75;

/* ---------------- storage ---------------- */
var store=load();
function load(){ var d=safe(function(){return JSON.parse(localStorage.getItem(KEY)||'null');},null); return d&&Array.isArray(d.lessons)?d:{v:1,activeId:null,lessons:[]}; }
function save(){
  for(var tries=0;tries<6;tries++){
    try{ localStorage.setItem(KEY,JSON.stringify(store)); return true; }
    catch(e){
      var idx=-1; for(var i=store.lessons.length-1;i>=0;i--){ if(store.lessons[i].id!==store.activeId&&store.lessons[i].doneAt){idx=i;break;} }
      if(idx<0) for(var j=store.lessons.length-1;j>=0;j--){ if(store.lessons[j].id!==store.activeId){idx=j;break;} }
      if(idx<0) return false; store.lessons.splice(idx,1);
    }
  }
  return false;
}
function cur(){ return store.lessons.filter(function(l){return l.id===store.activeId;})[0]||null; }
function touch(l){ l.updatedAt=Date.now(); save(); }
function depthPref(){ var d=safe(function(){return localStorage.getItem(DEPTH_KEY);},'')||'standard'; return DEPTHS[d]?d:'standard'; }

/* ---------------- AI generation (queued, deduped, cached) ---------------- */
var queue=[], running=false, inflight={};
function pump(){
  if(running||!queue.length) return;
  queue.sort(function(a,b){return a.prio-b.prio;});
  var job=queue.shift(); running=true;
  job.fn().then(job.resolve,job.reject).then(function(){ running=false; pump(); },function(){ running=false; pump(); });
}
function enqueue(key,prio,fn){
  if(inflight[key]){ inflight[key].job.prio=Math.min(inflight[key].job.prio,prio); return inflight[key].p; }
  var job={prio:prio,fn:fn}; var p=new Promise(function(res,rej){ job.resolve=res; job.reject=rej; });
  inflight[key]={p:p,job:job}; queue.push(job);
  var done=function(){ delete inflight[key]; }; p.then(done,done);
  pump(); return p;
}
function subjName(l){ var s=subjectById(l.subjectId); return s?s.name:'this course'; }
var STYLE='Write for a high school student seeing this for the first time: clear, accurate, exam-relevant, concrete. Use plain Unicode symbols for math (×, ÷, ², √, ≤, π, Δ); never LaTeX or markdown headings. You may use **bold** for key terms.';
function ctx(l,i){
  return 'Course: AP '+subjName(l)+'. Lesson topic: "'+l.topic+'". Modules in this lesson: '+l.outline.map(function(m,k){return (k+1)+') '+m.title;}).join('; ')+'. You are writing module '+(i+1)+' of '+l.outline.length+': "'+l.outline[i].title+'" — goal: '+l.outline[i].goal+'.';
}
var PROMPTS={
a:function(l,i){ return ctx(l,i)+'\n'+STYLE+'\nTeach this module. Do not repeat material that belongs to other modules.\nReturn ONLY JSON: {"intro":"1-2 sentences on why this matters","sections":[{"heading":"short heading","body":"120-170 words; separate paragraphs with \\n\\n"},{"heading":"...","body":"..."},{"heading":"...","body":"..."}],"terms":[{"term":"...","def":"under 25 words"}]}\nExactly 3 sections and 4 to 5 terms.'; },
b:function(l,i){ return ctx(l,i)+'\n'+STYLE+'\nCreate a worked example and a practice task for this module, in the style of an AP exam.\nReturn ONLY JSON: {"example":{"problem":"the problem or scenario","steps":["step 1 with reasoning","step 2","step 3"],"takeaway":"one sentence"},"tryIt":{"prompt":"a similar task for the student to attempt on their own","hint":"a nudge that does not give the answer away","answer":"model answer with brief reasoning, under 90 words"}}\nUse 3 to 5 steps.'; },
c:function(l,i){ return ctx(l,i)+'\nWrite 4 multiple-choice checkpoint questions that test understanding of this module (not trivia), mixing recall and application, AP-exam style. Exactly 4 options each, one correct, plausible wrong answers, no "all of the above". Use plain Unicode symbols for math, never LaTeX.\nReturn ONLY JSON: {"questions":[{"q":"...","options":["...","...","...","..."],"correct":0,"explanation":"why the answer is right, under 40 words"}]}'; }
};
function normA(j){
  if(!j||!Array.isArray(j.sections)) return null;
  var secs=j.sections.map(function(s){return {heading:String(s&&s.heading||'').trim().slice(0,120),body:String(s&&s.body||'').trim().slice(0,2400)};}).filter(function(s){return s.heading&&s.body.length>40;}).slice(0,4);
  if(secs.length<2) return null;
  var terms=(Array.isArray(j.terms)?j.terms:[]).map(function(t){return {term:String(t&&t.term||'').trim().slice(0,80),def:String(t&&t.def||'').trim().slice(0,300)};}).filter(function(t){return t.term&&t.def;}).slice(0,6);
  return {intro:String(j.intro||'').trim().slice(0,400),sections:secs,terms:terms};
}
function normB(j){
  if(!j||!j.example||!j.tryIt) return null;
  var steps=(Array.isArray(j.example.steps)?j.example.steps:[]).map(function(s){return String(s||'').trim().slice(0,700);}).filter(Boolean).slice(0,6);
  var prob=String(j.example.problem||'').trim(), pr=String(j.tryIt.prompt||'').trim(), ans=String(j.tryIt.answer||'').trim();
  if(!prob||steps.length<2||!pr||!ans) return null;
  return {example:{problem:prob.slice(0,900),steps:steps,takeaway:String(j.example.takeaway||'').trim().slice(0,300)},tryIt:{prompt:pr.slice(0,900),hint:String(j.tryIt.hint||'').trim().slice(0,400),answer:ans.slice(0,1000)}};
}
function normC(j){
  var arr=j&&Array.isArray(j.questions)?j.questions:null; if(!arr) return null;
  var qs=arr.map(function(q){return safe(function(){return normalizeCheckpoint(q);},null);}).filter(Boolean).slice(0,5);
  return qs.length>=3?{qs:qs}:null;
}
var NORM={a:normA,b:normB,c:normC};
function gen(l,i,part,prio){
  var m=l.mods[i]; if(m[part]) return Promise.resolve(m[part]);
  return enqueue(l.id+':'+i+':'+part,prio,function(){
    return askJSON(PROMPTS[part](l,i)).then(function(j){
      var v=NORM[part](j); if(!v) throw new Error('The AI returned an incomplete section.');
      if(store.lessons.indexOf(l)<0) return v;
      m[part]=v; m.err=null; touch(l); return v;
    });
  });
}
function loadModule(l,i,prio){
  return gen(l,i,'a',prio).then(function(){ return gen(l,i,'b',prio); }).then(function(){ return gen(l,i,'c',prio); });
}
function ensureCurrent(l){
  var i=l.cur; if(i>=l.mods.length) return;
  var m=l.mods[i]; if(m.a&&m.b&&m.c){ prefetch(l); return; }
  m.err=null;
  loadModule(l,i,0).then(function(){ afterLoad(l); prefetch(l); },function(e){ m.err=String(e&&e.message||'Could not load this part.'); afterLoad(l); });
}
function prefetch(l){
  var i=l.cur+1; if(i>=l.mods.length) return; var m=l.mods[i]; if(m.a&&m.b&&m.c) return;
  loadModule(l,i,1).then(function(){ afterLoad(l); },function(){});
}
function afterLoad(l){ if(cur()===l&&visible()) render(); }

/* ---------------- lesson creation ---------------- */
function mins(m){ return Math.max(12,Math.min(40,Number(m&&m.minutes)||20)); }
function startDeep(){
  var subjectId=$('learn-subject').value, topic=$('learn-topic').value.trim(), depth=depthPref(), status=$('learn-status');
  if(!topic){ status.innerHTML='<div class="error-note">Enter a topic you want taught.</div>'; return; }
  if(!state.aiEnabled){ status.innerHTML='<div class="error-note">'+esc(localAiUnavailableMessage)+'</div>'; return; }
  var key=(subjectId+'::'+topic+'::'+depth).toLowerCase();
  var ex=store.lessons.filter(function(l){return (l.subjectId+'::'+l.topic+'::'+l.depth).toLowerCase()===key;})[0];
  if(ex){ openLesson(ex.id); safe(function(){toast('Picked up your saved lesson where you left off.');},0); return; }
  var subj=subjectById(subjectId), n=DEPTHS[depth].n;
  status.innerHTML='<div class="loading-line"><span class="spinner"></span> Designing your '+(depth==='deep'?'deep':'standard')+' lesson plan… (about 20 seconds)</div>';
  var prompt='You are an expert AP teacher designing a self-paced lesson. Course: AP '+subj.name+'. Topic: "'+topic+'". The student is seeing it for the first time and wants to reach exam readiness. Design exactly '+n+' modules in teaching order: foundations, core ideas, worked problem solving, then exam-style application. Each module should take 15 to 30 minutes. Return ONLY JSON: {"title":"short lesson title","overview":"2 sentences on what the student will be able to do","modules":[{"title":"module title","goal":"one sentence: what the student can do afterward","minutes":20}]}';
  askJSON(prompt).then(function(j){
    var mods=(j&&Array.isArray(j.modules)?j.modules:[]).map(function(m){return {title:String(m&&m.title||'').trim().slice(0,120),goal:String(m&&m.goal||'').trim().slice(0,260),minutes:mins(m)};}).filter(function(m){return m.title;}).slice(0,14);
    if(mods.length<3) throw new Error('outline');
    var l={id:uid(),subjectId:subjectId,topic:topic,depth:depth,title:String(j.title||topic).trim().slice(0,120)||topic,overview:String(j.overview||'').trim().slice(0,500),createdAt:Date.now(),updatedAt:Date.now(),seconds:0,outline:mods,
      mods:mods.map(function(){return {a:null,b:null,c:null,status:'todo',stepKey:'',attempts:0,best:null,missed:{},tryNotes:'',selfRate:'',cp:null,xp:false,seconds:0};}),cur:0,final:null,doneAt:null};
    store.lessons.unshift(l); store.lessons=store.lessons.slice(0,MAX_LESSONS+5); store.activeId=l.id; save(); status.innerHTML='';
    show(true);
  }).catch(function(e){ status.innerHTML='<div class="error-note">Couldn’t design that lesson ('+esc(explainAi(e))+'). Please try again.</div>'; });
}
function explainAi(e){ return safe(function(){return explainAiError(e,'The AI').replace(/^The AI /,'').replace(/\.$/,'');},'try again'); }

function openLesson(id){ store.activeId=id; save(); show(true); }
function closeLesson(){ var l=cur(); if(l) touch(l); store.activeId=null; save(); show(false); }
function deleteLesson(id){
  var l=store.lessons.filter(function(x){return x.id===id;})[0]; if(!l) return;
  if(!confirm('Delete “'+l.title+'” and its saved progress?')) return;
  store.lessons=store.lessons.filter(function(x){return x.id!==id;}); if(store.activeId===id) store.activeId=null; save(); render();
}

/* ---------------- steps ---------------- */
function steps(l,i){
  var m=l.mods[i], out=[];
  var secs=m.a?m.a.sections.length:1;
  for(var k=0;k<secs;k++) out.push('s'+k);
  if(m.a&&m.a.terms.length) out.push('terms');
  out.push('ex','try','cp');
  return out;
}
function stepIndex(l,i){ var s=steps(l,i), k=s.indexOf(l.mods[i].stepKey); return k<0?0:k; }
function unlockedTo(l){ for(var i=0;i<l.mods.length;i++) if(l.mods[i].status!=='done') return i; return l.mods.length; }
function pct(l){ var d=l.mods.filter(function(m){return m.status==='done';}).length+(l.doneAt?1:0); return Math.round(d/(l.mods.length+1)*100); }
function minsLeft(l){ var t=l.doneAt?0:10; l.mods.forEach(function(m,i){ if(m.status!=='done') t+=mins(l.outline[i]); }); return t; }
function hm(min){ min=Math.round(min); var h=Math.floor(min/60), r=min%60; return h?(h+'h'+(r?' '+r+'m':'')):(r+'m'); }
function hmSec(s){ return hm(Math.max(0,s)/60); }

/* ---------------- quiz engine (modules and final) ---------------- */
function shuffleQ(q){ var order=[0,1,2,3]; shuffleArray(order); return {q:q.q,options:order.map(function(o){return q.options[o];}),correct:order.indexOf(q.correct),explanation:q.explanation,mod:q.mod}; }
function need(n){ return Math.ceil(n*PASS); }
function quizHtml(qs,st,labels){
  if(st.done){
    var score=st.picks.reduce(function(a,p,i){return a+(p===qs[i].correct?1:0);},0), pass=score>=need(qs.length);
    return '<div class="lp-result '+(pass?'good':'retry')+'"><div class="lp-score">'+score+' / '+qs.length+'</div><p>'+(pass?labels.pass:labels.fail(need(qs.length)))+'</p></div>'
      +qs.map(function(q,i){ var ok=st.picks[i]===q.correct; return '<div class="lp-review '+(ok?'ok':'bad')+'"><b>'+(ok?'✓':'✗')+' '+rich(q.q)+'</b>'+(ok?'':'<span>You chose: '+rich(q.options[st.picks[i]])+'</span>')+'<span>Answer: '+rich(q.options[q.correct])+'</span><em>'+rich(q.explanation||'')+'</em></div>'; }).join('');
  }
  var q=qs[st.i], p=st.picks[st.i], answered=p!=null;
  return '<div class="lp-qhead">Question '+(st.i+1)+' of '+qs.length+'</div><div class="lp-q">'+rich(q.q)+'</div>'
    +q.options.map(function(o,oi){ var c='lp-opt'; if(answered){ if(oi===q.correct) c+=' correct'; else if(oi===p) c+=' wrong'; } return '<button type="button" class="'+c+'" data-lp="pick" data-i="'+oi+'"'+(answered?' disabled':'')+'><span class="lp-key">'+'ABCD'[oi]+'</span><span>'+rich(o)+'</span></button>'; }).join('')
    +(answered?'<div class="lp-expl '+(p===q.correct?'good':'bad')+'"><b>'+(p===q.correct?'Correct.':'Not quite.')+'</b> '+rich(q.explanation||'')+'</div><div class="lp-nav"><span></span><button type="button" class="btn btn-primary" data-lp="qnext">'+(st.i+1<qs.length?'Next question →':'See results')+'</button></div>':'');
}

/* ---------------- player rendering ---------------- */
var UI={reveal:{},showAns:{},rail:false};
function visible(){ return state.view==='learn'; }
function show(active){
  var v=$('view-learn'); if(!v) return;
  v.classList.toggle('lp-active',!!active);
  render();
  if(active){ var l=cur(); if(l) ensureCurrent(l); window.scrollTo(0,0); }
}
function root(){
  var r=$('lp-root'); var v=$('view-learn'); if(!v) return null;
  if(!r){ r=document.createElement('div'); r.id='lp-root'; var lesson=$('learn-lesson'); v.insertBefore(r,lesson||null); }
  return r;
}
function render(){
  var r=root(); if(!r) return;
  var l=cur();
  r.innerHTML=l?player(l):library();
  var ta=$('lp-try'); if(ta&&l) ta.addEventListener('input',function(){ l.mods[l.cur].tryNotes=ta.value; clearTimeout(ta._t); ta._t=setTimeout(function(){touch(l);},600); });
}
function library(){
  if(!store.lessons.length) return '';
  var items=store.lessons.slice().sort(function(a,b){return b.updatedAt-a.updatedAt;}).map(function(l){
    var p=pct(l), done=!!l.doneAt, nm=subjName(l);
    return '<div class="lp-lib-card"><div class="lp-lib-main"><span class="lp-lib-sub">AP '+esc(nm)+' · '+(l.depth==='deep'?'Deep':'Standard')+'</span><b>'+esc(l.title)+'</b><span class="lp-lib-meta">'+(done?'Completed ✓':'Module '+Math.min(l.cur+1,l.mods.length)+' of '+l.mods.length+' · ≈ '+hm(minsLeft(l))+' left')+' · '+hmSec(l.seconds)+' studied</span><span class="lp-bar"><i style="width:'+p+'%"></i></span></div>'
      +'<div class="lp-lib-act"><button type="button" class="btn btn-primary btn-sm" data-lp="open" data-id="'+esc(l.id)+'">'+(done?'Review':(p?'Resume':'Start'))+'</button><button type="button" class="btn btn-ghost btn-sm" data-lp="delete" data-id="'+esc(l.id)+'" aria-label="Delete lesson">🗑</button></div></div>';
  }).join('');
  return '<section class="lp-lib"><h3>Your lessons</h3><p class="lp-sub">Saved on this device. Pick up exactly where you stopped.</p>'+items+'</section>';
}
function rail(l){
  var u=unlockedTo(l);
  var items=l.outline.map(function(o,i){
    var m=l.mods[i], st=m.status==='done'?'done':(i===l.cur?'cur':(i>u?'lock':'open'));
    var icon=st==='done'?'✓':(st==='lock'?'🔒':(i+1));
    return '<button type="button" class="lp-ri '+st+(i===l.cur?' active':'')+'" data-lp="goto" data-i="'+i+'"'+(st==='lock'?' disabled':'')+'><span class="lp-rn">'+icon+'</span><span class="lp-rt"><b>'+esc(o.title)+'</b><small>'+(m.status==='done'?(m.best!=null?'Checkpoint '+m.best+'/'+(m.c?m.c.qs.length:4):'Done'):'≈ '+mins(o)+' min')+'</small></span></button>';
  }).join('');
  var fst=l.doneAt?'done':(u>=l.mods.length?(l.cur>=l.mods.length?'cur':'open'):'lock');
  items+='<button type="button" class="lp-ri '+fst+(l.cur>=l.mods.length?' active':'')+'" data-lp="goto" data-i="'+l.mods.length+'"'+(fst==='lock'?' disabled':'')+'><span class="lp-rn">'+(fst==='done'?'✓':(fst==='lock'?'🔒':'★'))+'</span><span class="lp-rt"><b>Final mastery check</b><small>'+(l.final&&l.final.done?'Score '+l.final.score+'/'+l.final.qs.length:'≈ 10 min')+'</small></span></button>';
  return items;
}
function player(l){
  var p=pct(l);
  var top='<div class="lp-top"><button type="button" class="btn btn-ghost btn-sm" data-lp="close">← All lessons</button><div class="lp-tt"><span class="lp-lib-sub">AP '+esc(subjName(l))+'</span><h3>'+esc(l.title)+'</h3></div>'
    +'<div class="lp-stats"><span><b>'+p+'%</b> complete</span><span><b>'+hmSec(l.seconds)+'</b> studied</span><span>'+(l.doneAt?'Finished':'≈ <b>'+hm(minsLeft(l))+'</b> left')+'</span></div></div><div class="lp-bar big"><i style="width:'+p+'%"></i></div>';
  var body=l.cur>=l.mods.length?finalView(l):moduleView(l);
  return top+'<div class="lp-layout"><button type="button" class="lp-railbtn" data-lp="rail">☰ Modules</button><nav class="lp-rail'+(UI.rail?' open':'')+'" aria-label="Lesson modules">'+rail(l)+'</nav><div class="lp-main">'+body+'</div></div>';
}
function loadingBox(l,i,label){
  var m=l.mods[i];
  if(m.err) return '<div class="lp-card"><div class="error-note">That part didn’t load: '+esc(m.err)+'</div><button type="button" class="btn btn-primary" data-lp="retry">Try again</button></div>';
  return '<div class="lp-card lp-loading"><span class="spinner"></span> '+esc(label)+'<small>Each module is written for you as you go, usually 20 to 40 seconds.</small></div>';
}
function moduleView(l){
  var i=l.cur, m=l.mods[i], o=l.outline[i], st=steps(l,i), k=stepIndex(l,i), key=st[k];
  var head='<div class="lp-kicker">Module '+(i+1)+' of '+l.mods.length+' · '+esc(o.title)+'</div>';
  var dots='<div class="lp-dots" aria-label="Progress in this module">'+st.map(function(s,x){return '<i class="'+(x<k?'d':(x===k?'c':''))+'"></i>';}).join('')+'</div>';
  var card='';
  if(/^s\d+$/.test(key)){
    if(!m.a) card=loadingBox(l,i,'Writing this module…');
    else { var s=m.a.sections[+key.slice(1)]; card='<div class="lp-card">'+(+key.slice(1)===0&&m.a.intro?'<div class="lp-intro">'+rich(m.a.intro)+'</div>':'')+'<h3>'+esc(s.heading)+'</h3><div class="lp-body">'+s.body.split(/\n\s*\n/).map(function(pp){return '<p>'+rich(pp)+'</p>';}).join('')+'</div></div>'; }
  }else if(key==='terms'){
    card='<div class="lp-card"><h3>Key terms</h3><div class="lp-terms">'+m.a.terms.map(function(t){return '<div><b>'+rich(t.term)+'</b><span>'+rich(t.def)+'</span></div>';}).join('')+'</div></div>';
  }else if(key==='ex'){
    if(!m.b) card=loadingBox(l,i,'Preparing a worked example…');
    else { var rv=UI.reveal[l.id+i]||1, ex=m.b.example; card='<div class="lp-card"><span class="lp-tag">Worked example</span><div class="lp-prob">'+rich(ex.problem)+'</div><ol class="lp-steps">'+ex.steps.slice(0,rv).map(function(s){return '<li>'+rich(s)+'</li>';}).join('')+'</ol>'
      +(rv<ex.steps.length?'<button type="button" class="btn btn-ghost btn-sm" data-lp="reveal">Show next step</button>':(ex.takeaway?'<div class="lp-take"><b>Takeaway.</b> '+rich(ex.takeaway)+'</div>':''))+'</div>'; }
  }else if(key==='try'){
    if(!m.b) card=loadingBox(l,i,'Preparing your practice task…');
    else { var ti=m.b.tryIt, sa=UI.showAns[l.id+i]; card='<div class="lp-card"><span class="lp-tag try">Your turn</span><div class="lp-prob">'+rich(ti.prompt)+'</div>'
      +(ti.hint?'<details class="lp-hint"><summary>Need a hint?</summary>'+rich(ti.hint)+'</details>':'')
      +'<textarea id="lp-try" rows="4" placeholder="Work it out here before you look at the answer…">'+esc(m.tryNotes||'')+'</textarea>'
      +(sa?'<div class="lp-ans"><b>Model answer</b>'+rich(ti.answer)+'</div><div class="lp-rate"><span>How did you do?</span>'+[['got','Got it'],['part','Partly'],['not','Not yet']].map(function(r){return '<button type="button" class="lp-chip'+(m.selfRate===r[0]?' on':'')+'" data-lp="rate" data-r="'+r[0]+'">'+r[1]+'</button>';}).join('')+'</div>':'<button type="button" class="btn btn-ghost btn-sm" data-lp="showans">Check my answer</button>')+'</div>'; }
  }else if(key==='cp'){
    if(!m.c) card=loadingBox(l,i,'Writing your checkpoint…');
    else {
      if(!m.cp) m.cp={i:0,picks:[],done:false,qs:m.c.qs.map(shuffleQ)};
      var done=m.status==='done', labels={pass:'Checkpoint passed. You’re ready for the next module.',fail:function(n){return 'You need '+n+' correct to move on. Read the explanations, then try again.';}};
      var acts='';
      if(m.cp.done){
        var sc=m.cp.picks.reduce(function(a,pk,x){return a+(pk===m.cp.qs[x].correct?1:0);},0), pass=sc>=need(m.cp.qs.length);
        acts='<div class="lp-nav">'+(pass||done?'<span></span><button type="button" class="btn btn-primary" data-lp="nextmod">'+(i+1<l.mods.length?'Next module →':'Go to the final check →')+'</button>':'<button type="button" class="btn btn-ghost" data-lp="review">↺ Review the lesson</button><span class="lp-grow"></span>'+(m.attempts>=2?'<button type="button" class="btn btn-ghost" data-lp="skip">Continue anyway</button>':'')+'<button type="button" class="btn btn-primary" data-lp="retrycp">Try again</button>')+'</div>';
      }
      card='<div class="lp-card"><span class="lp-tag cp">Checkpoint · pass with '+need(m.cp.qs.length)+' of '+m.cp.qs.length+'</span>'+quizHtml(m.cp.qs,m.cp,labels)+acts+'</div>';
    }
  }
  var nav='';
  if(key!=='cp'){
    var nextDisabled=(/^s\d+$/.test(key)&&!m.a)||((key==='ex'||key==='try')&&!m.b);
    nav='<div class="lp-nav">'+(k>0?'<button type="button" class="btn btn-ghost" data-lp="back">← Back</button>':'<span></span>')+'<button type="button" class="btn btn-primary" data-lp="next"'+(nextDisabled?' disabled':'')+'>'+(key==='try'?'On to the checkpoint →':'Continue →')+'</button></div>';
  }else if(k>0&&!m.cp.done){ nav='<div class="lp-nav"><button type="button" class="btn btn-ghost" data-lp="back">← Back to lesson</button><span></span></div>'; }
  return head+dots+card+nav;
}
function finalView(l){
  var f=l.final;
  if(!f){
    var all=[]; l.mods.forEach(function(m,mi){ if(m.c) m.c.qs.forEach(function(q){ all.push({q:q,mod:mi,missed:!!m.missed[q.q]}); }); });
    var missed=shuffleArray(all.filter(function(x){return x.missed;})), rest=shuffleArray(all.filter(function(x){return !x.missed;}));
    var pick=missed.slice(0,6).concat(rest).slice(0,10);
    f=l.final={qs:shuffleArray(pick).map(function(x){var q=shuffleQ(x.q); q.mod=x.mod; return q;}),i:0,picks:[],done:false,score:null,attempts:0,passed:false};
    touch(l);
  }
  var labels={pass:'Lesson complete. You can explain this topic and apply it.',fail:function(n){return 'You need '+n+' correct. Revisit the modules below, then try again.';}};
  var weak='';
  if(f.done&&!f.passed){
    var bad={}; f.qs.forEach(function(q,x){ if(f.picks[x]!==q.correct) bad[q.mod]=1; });
    var ks=Object.keys(bad); if(ks.length) weak='<div class="lp-weak"><b>Worth another look:</b> '+ks.map(function(k){return '<button type="button" class="lp-chip" data-lp="goto" data-i="'+k+'">'+esc(l.outline[k].title)+'</button>';}).join(' ')+'</div>';
  }
  var acts='';
  if(f.done) acts=f.passed
    ?'<div class="lp-nav"><button type="button" class="btn btn-ghost" data-lp="close">Back to lessons</button><button type="button" class="btn btn-primary" data-lp="practice">Practice this topic →</button></div>'
    :'<div class="lp-nav"><button type="button" class="btn btn-ghost" data-lp="close">Back to lessons</button><button type="button" class="btn btn-primary" data-lp="retryfinal">Try again</button></div>';
  var head='<div class="lp-kicker">Final mastery check</div>';
  var intro=(!f.done&&f.i===0&&!f.picks.length)?'<p class="lp-sub">'+f.qs.length+' questions from across the whole lesson, with extra weight on anything you missed earlier. Pass with '+need(f.qs.length)+'.</p>':'';
  return head+'<div class="lp-card"><span class="lp-tag cp">Final check</span>'+intro+quizHtml(f.qs,f,labels)+weak+acts+'</div>';
}

/* ---------------- actions ---------------- */
function complete(l){
  l.doneAt=Date.now(); touch(l);
  safe(function(){ addXP(60); celebrate(); },0);
  safe(function(){ var key=(l.subjectId+'::'+l.topic).toLowerCase(); if(!state.progress.lessonsLearned.some(function(x){return (x.subjectId+'::'+x.topic).toLowerCase()===key;})){ state.progress.lessonsLearned.push({subjectId:l.subjectId,topic:l.topic,ts:Date.now()}); persistProgress(); } },0);
}
function pickAnswer(l,idx){
  var big=l.cur>=l.mods.length, st=big?l.final:l.mods[l.cur].cp; if(!st||st.done||st.picks[st.i]!=null) return;
  var q=st.qs[st.i]; st.picks[st.i]=idx;
  if(idx!==q.correct){ var mi=big?q.mod:l.cur, src=(l.mods[mi]||{}).missed; if(src){ var orig=(l.mods[mi].c&&l.mods[mi].c.qs||[]).filter(function(o){return o.q===q.q;})[0]; if(orig) src[orig.q]=1; } }
  touch(l);
}
function nextQuestion(l){
  var big=l.cur>=l.mods.length, m=big?null:l.mods[l.cur], st=big?l.final:m.cp; if(!st||st.picks[st.i]==null) return;
  if(st.i+1<st.qs.length){ st.i++; touch(l); return; }
  st.done=true; var score=st.picks.reduce(function(a,p,i){return a+(p===st.qs[i].correct?1:0);},0), pass=score>=need(st.qs.length);
  if(big){ st.score=score; st.attempts++; st.passed=pass; if(pass&&!l.doneAt) complete(l); }
  else { m.attempts++; m.best=Math.max(m.best||0,score); if(pass&&m.status!=='done'){ m.status='done'; if(!m.xp){ m.xp=true; safe(function(){addXP(20);},0); } } }
  touch(l);
}
function go(l,i){ l.cur=Math.max(0,Math.min(i,l.mods.length)); UI.rail=false; touch(l); render(); window.scrollTo(0,0); if(l.cur<l.mods.length) ensureCurrent(l); }
function setStep(l,key){ l.mods[l.cur].stepKey=key; touch(l); render(); window.scrollTo(0,0); var m=l.mods[l.cur]; if((key==='terms'||key==='ex')&&m.a) prefetch(l); }
function act(e){
  var t=e.target.closest&&e.target.closest('[data-lp]'); if(!t) return;
  var a=t.getAttribute('data-lp'), l=cur();
  if(a==='open'){ openLesson(t.getAttribute('data-id')); return; }
  if(a==='delete'){ deleteLesson(t.getAttribute('data-id')); return; }
  if(a==='depth'){ safe(function(){localStorage.setItem(DEPTH_KEY,t.getAttribute('data-d'));},0); renderDepth(); return; }
  if(!l) return;
  var m=l.mods[l.cur];
  if(a==='close') closeLesson();
  else if(a==='rail'){ UI.rail=!UI.rail; render(); }
  else if(a==='goto'){ var i=+t.getAttribute('data-i'); if(i<=unlockedTo(l)) go(l,i); }
  else if(a==='next'||a==='back'){ var st=steps(l,l.cur), k=stepIndex(l,l.cur)+(a==='next'?1:-1); if(k>=0&&k<st.length) setStep(l,st[k]); }
  else if(a==='reveal'){ UI.reveal[l.id+l.cur]=(UI.reveal[l.id+l.cur]||1)+1; render(); }
  else if(a==='showans'){ UI.showAns[l.id+l.cur]=true; render(); }
  else if(a==='rate'){ m.selfRate=t.getAttribute('data-r'); touch(l); render(); }
  else if(a==='pick'){ pickAnswer(l,+t.getAttribute('data-i')); render(); }
  else if(a==='qnext'){ nextQuestion(l); render(); window.scrollTo(0,0); }
  else if(a==='retrycp'){ m.cp={i:0,picks:[],done:false,qs:m.c.qs.map(shuffleQ)}; touch(l); render(); }
  else if(a==='review'){ setStep(l,'s0'); }
  else if(a==='skip'){ m.status='done'; m.skipped=true; touch(l); go(l,l.cur+1); }
  else if(a==='nextmod'){ go(l,l.cur+1); }
  else if(a==='retry'){ ensureCurrent(l); render(); }
  else if(a==='retryfinal'){ l.final=null; touch(l); render(); }
  else if(a==='practice'){
    var prev=state.learn.lesson; state.learn.lesson={subjectId:l.subjectId,topic:l.topic};
    var b=document.createElement('button'); b.setAttribute('data-action','go-practice-topic'); b.style.display='none'; document.body.appendChild(b); b.click(); b.remove(); state.learn.lesson=prev||null;
  }
}
document.addEventListener('click',act);

/* ---------------- depth chooser inside the existing builder ---------------- */
function renderDepth(){
  var b=document.querySelector('#view-learn .builder'); if(!b) return;
  var box=$('lp-depth'); if(!box){ box=document.createElement('div'); box.id='lp-depth'; box.className='lp-depth'; var btn=b.querySelector('[data-action="teach-me"]'); b.insertBefore(box,btn||null); }
  var d=depthPref();
  box.innerHTML='<label>Lesson length</label><div class="lp-depth-opts">'+Object.keys(DEPTHS).map(function(k){return '<button type="button" class="lp-dopt'+(d===k?' on':'')+'" data-lp="depth" data-d="'+k+'"><b>'+DEPTHS[k].label+'</b><small>'+DEPTHS[k].sub+'</small></button>';}).join('')+'</div>';
  var btn2=b.querySelector('[data-action="teach-me"]'); if(btn2) btn2.textContent=d==='quick'?'🎓 Teach me this':'🎓 Build my lesson';
}

/* ---------------- hooks ---------------- */
var _teach=window.teachMe;
window.teachMe=function(){ if(depthPref()==='quick'){ var l=cur(); if(l){ store.activeId=null; save(); show(false); } return _teach.apply(this,arguments); } return startDeep(); };
var _rl=window.renderLearn;
window.renderLearn=function(){ var out=_rl.apply(this,arguments); renderDepth(); show(!!cur()); return out; };

/* time spent: only while the lesson is on screen, the tab is visible, and the student is active */
var lastAct=Date.now(), ticks=0;
['click','keydown','scroll','input','touchstart'].forEach(function(ev){ document.addEventListener(ev,function(){lastAct=Date.now();},{passive:true,capture:true}); });
setInterval(function(){
  var l=cur(); if(!l||!visible()||document.hidden||Date.now()-lastAct>180000) return;
  l.seconds+=5; l.mods[Math.min(l.cur,l.mods.length-1)].seconds+=5; if(++ticks%6===0) touch(l);
},5000);
window.addEventListener('pagehide',function(){ var l=cur(); if(l) touch(l); });
window.addEventListener('storage',function(e){ if(e.key===KEY){ store=load(); if(visible()) render(); } });

window.LearnPlus={store:function(){return store;},open:openLesson};
renderDepth(); if(cur()&&visible()) show(true); else $('view-learn')&&$('view-learn').classList.toggle('lp-active',false);
})();
