/* Live lesson: a long, guided lesson taught as a real conversation with the Tutor.
   Every AI request is a normal chat turn that starts from the student's own click or message
   (no hidden background requests, no JSON generation). The lesson keeps a plan, a part-by-part
   path with 3-question checkpoints, a final review, time studied and the whole conversation,
   all saved on this device so it can be resumed. */
(function(){
'use strict';
var LP=window.LearnPlus; if(!LP||typeof runLocalAi!=='function'||typeof subjectById!=='function') return;
var safe=function(f,d){try{return f();}catch(e){return d;}};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var rich=function(t){ return safe(function(){return formatTutorText(String(t||''));},esc(t)); };
var $=function(id){return document.getElementById(id);};
var KINDS={live8:{n:8,label:'Live lesson',sub:'≈ 1½ hours · 8 parts'},live12:{n:12,label:'Deep live lesson',sub:'≈ 2½–3 hours · 12 parts'}};
var MIN_PER_PART=12, CP_Q=3, CP_PASS=2, FINAL_Q=5, FINAL_PASS=4, MAX_MSGS=240;
var busy=null, lastAction=null, ui={ask:false,rail:false};

function subj(l){ var s=subjectById(l.subjectId); return s?s.name:'this course'; }
function isLive(l){ return l&&l.type==='live'; }
function partsDone(l){ return l.parts.filter(function(p){return p.status==='done';}).length; }
function pct(l){ return Math.round((partsDone(l)+(l.final&&l.final.status==='done'?1:0))/(l.parts.length+1)*100); }
function minsLeft(l){ return l.doneAt?0:(l.parts.length-partsDone(l))*MIN_PER_PART+8; }
function hm(min){ min=Math.round(min); var h=Math.floor(min/60), r=min%60; return h?(h+'h'+(r?' '+r+'m':'')):(r+'m'); }
function curPart(l){ return l.parts[l.cur]; }

/* ---------- create ---------- */
function create(kind){
  var subjectId=$('learn-subject').value, topic=$('learn-topic').value.trim(), status=$('learn-status');
  if(!topic){ status.innerHTML='<div class="error-note">Enter a topic you want taught.</div>'; return; }
  var store=LP.store(), key=(subjectId+'::'+topic+'::'+kind).toLowerCase();
  var ex=store.lessons.filter(function(l){return isLive(l)&&(l.subjectId+'::'+l.topic+'::'+l.depth).toLowerCase()===key;})[0];
  if(ex){ status.innerHTML=''; LP.open(ex.id); return; }
  var n=KINDS[kind].n;
  var l={id:uid(),type:'live',subjectId:subjectId,topic:topic,depth:kind,title:topic,createdAt:Date.now(),updatedAt:Date.now(),seconds:0,
    parts:Array.from({length:n},function(_,i){return {title:'Part '+(i+1),status:'todo',q:0,right:0,best:null};}),cur:0,planned:false,
    msgs:[],final:{status:'todo',q:0,right:0},doneAt:null,outline:[],mods:[]};
  store.lessons.unshift(l); store.activeId=l.id; LP.save(); status.innerHTML='';
  LP.show(true); requestPlan(l);
}

/* ---------- prompts ---------- */
function systemPrompt(l,extra){
  var plan=l.planned?l.parts.map(function(p,i){return (i+1)+'. '+p.title;}).join('\n'):'(not written yet)';
  return 'You are the live lesson tutor inside Index, teaching a high school student AP '+subj(l)+', topic "'+l.topic+'". '
    +'Teach like an excellent teacher: clear, concrete, step by step, short paragraphs, one idea at a time, plain Unicode symbols for math (×, ², √, ≤, π), never LaTeX. '
    +'Do not reveal the answer to a checkpoint question before the student has tried it. Be accurate; if you are unsure of a fact, say so.\n'
    +'Lesson plan ('+l.parts.length+' parts):\n'+plan+(extra?'\n'+extra:'');
}
function history(l){
  return l.msgs.filter(function(m){return !m.err&&m.text;}).slice(-8).map(function(m){ return {role:m.role,content:m.text.slice(0,2500)}; });
}

/* ---------- sending ---------- */
function stripMarker(t){ return String(t||'').replace(/\s*\[\[RESULT:(correct|wrong)\]\]\s*/ig,' ').trim(); }
function gradeOf(raw){
  var m=/\[\[RESULT:(correct|wrong)\]\]/i.exec(raw); if(m) return m[1].toLowerCase()==='correct';
  var head=String(raw||'').slice(0,90).toLowerCase();
  if(/not (quite )?(correct|right)|incorrect|wrong|not exactly|close, but/.test(head)) return false;
  return /\b(correct|right|exactly|well done|great job|that'?s it)\b/.test(head);
}
function ask(l,visible,instruction,opts){
  opts=opts||{};
  if(busy) return;
  if(!LP.aiOk()){ addMsg(l,{role:'assistant',text:LP.aiMsg(),err:true}); LP.touch(l); LP.render(); return; }
  lastAction={id:l.id,visible:visible,instruction:instruction,opts:opts};
  var past=history(l);
  if(visible!=null){ l.msgs.push({role:'user',text:visible,part:l.cur}); }
  var a={role:'assistant',text:'',part:l.cur,kind:opts.kind||''}; l.msgs.push(a);
  /* the Tutor endpoint only keeps user/assistant turns, so the lesson context travels inside the last user message */
  var turns=past.concat([{role:'user',content:systemPrompt(l,opts.system)+'\n\nTask: '+instruction}]);
  busy=l.id; LP.touch(l); LP.render(); logScroll();
  var shown='';
  runLocalAi(turns,{intent:'tutor',mode:(opts.kind==='q'||opts.kind==='g')?'quiz':'explain',context:{county:safe(function(){return state.county||'';},'')},timeoutMs:90000,onChunk:function(chunk){
    if(chunk==='\u0000RESET_STREAM\u0000'){ shown=''; a.text=''; paintLog(l); return; }
    shown+=chunk; a.text=stripMarker(shown); paintLog(l);
  }}).then(function(reply){
    var raw=reply||shown; a.text=stripMarker(raw)||"I couldn't come up with an answer. Please try again.";
    busy=null; if(opts.after) opts.after(l,a,raw); trim(l); LP.touch(l); LP.render(); logScroll();
  },function(e){
    busy=null; if(shown.trim()){ a.text=stripMarker(shown)+'\n\n⚠️ The response was cut off. Press “Try again” to resend.'; }
    else{ l.msgs.pop(); if(visible!=null) l.msgs.pop(); }
    l.err=safe(function(){return explainAiError(e,'The tutor');},'The tutor could not answer. Please try again.');
    if(visible!=null&&!shown.trim()) l.pendingText=visible;
    LP.touch(l); LP.render();
  });
}
function addMsg(l,m){ m.part=l.cur; l.msgs.push(m); }
function trim(l){ if(l.msgs.length>MAX_MSGS) l.msgs=l.msgs.slice(-MAX_MSGS); }

/* ---------- lesson actions ---------- */
function requestPlan(l){
  var n=l.parts.length;
  ask(l,null,'Please write a numbered lesson plan of exactly '+n+' parts for "'+l.topic+'" in AP '+subj(l)+'. Order the parts from foundations, to core ideas, to problem solving, to exam-style application. Give just the numbers and short titles, one per line, then one sentence telling me we will go part by part with a short checkpoint after each. Do not teach anything yet.',
    {kind:'plan',after:function(l,a){
      var titles=[]; String(a.text).split(/\n/).forEach(function(line){ var m=/^\s*(\d{1,2})[.)]\s*\**\s*(.+?)\**\s*$/.exec(line); if(m) titles[+m[1]-1]=m[2].replace(/\*+/g,'').trim().slice(0,90); });
      var got=titles.filter(Boolean).length;
      if(got>=Math.min(4,l.parts.length)){ l.parts.forEach(function(p,i){ if(titles[i]) p.title=titles[i]; }); }
      l.planned=true; l.err=null;
    }});
}
function teach(l,again){
  var p=curPart(l); if(!p) return; p.status='teach'; p.q=0; p.right=0;
  var n=l.cur+1;
  ask(l,again?'Teach part '+n+' again, a different way.':'Start part '+n+': '+p.title,
    'Teach part '+n+' of '+l.parts.length+': "'+p.title+'". '+(again?'The student did not pass the checkpoint, so explain it a different way with a fresh example. ':'')+'Use about 200 to 300 words in short paragraphs, include one fully worked example, and define any key terms in **bold**. End by telling the student they can ask questions or start the checkpoint when ready.',
    {kind:'teach'});
}
function startCheck(l,isFinal){
  var p=isFinal?l.final:curPart(l); p.status='check'; p.q=0; p.right=0; l.err=null;
  var total=isFinal?FINAL_Q:CP_Q;
  ask(l,isFinal?'Start the final review':'Quiz me on this part',
    (isFinal?'Final review, question 1 of '+FINAL_Q+'. Ask ONE multiple-choice question (options A to D) mixing ideas from across the whole lesson.':'Checkpoint question 1 of '+CP_Q+' for part '+(l.cur+1)+'. Ask ONE multiple-choice question (options A to D) that checks understanding of this part, not trivia.')+' Do not give the answer. Wait for my reply.',
    {kind:'q'});
}
function answer(l,text){
  var isFinal=l.cur>=l.parts.length, p=isFinal?l.final:curPart(l); if(!p||p.status!=='check') return;
  var total=isFinal?FINAL_Q:CP_Q, n=p.q+1;
  ask(l,text,'My answer: '+text,{kind:'g',system:'You are grading question '+n+' of '+total+' of the '+(isFinal?'final review':'checkpoint for part '+(l.cur+1))+'. First say whether the student is correct, then explain why in 2 to 3 sentences. '+(n<total?'Then ask question '+(n+1)+' of '+total+': one new multiple-choice question (A to D), different from the earlier ones, and wait for the reply. ':'This was the last question: do not ask another. ')+'End your message with exactly [[RESULT:correct]] or [[RESULT:wrong]] for the answer just given.',
    after:function(l,a,raw){
      p.q=n; if(gradeOf(raw)) p.right++;
      if(p.q>=total){
        var pass=p.right>=(isFinal?FINAL_PASS:CP_PASS); p.best=Math.max(p.best||0,p.right);
        p.result=pass?'pass':'fail'; p.status=pass?'done':'retry';
        if(pass){ if(isFinal) finish(l); else safe(function(){addXP(15);},0); }
      }
    }});
}
function finish(l){
  l.doneAt=Date.now(); safe(function(){ addXP(60); celebrate(); },0);
  safe(function(){ var key=(l.subjectId+'::'+l.topic).toLowerCase(); if(!state.progress.lessonsLearned.some(function(x){return (x.subjectId+'::'+x.topic).toLowerCase()===key;})){ state.progress.lessonsLearned.push({subjectId:l.subjectId,topic:l.topic,ts:Date.now()}); persistProgress(); } },0);
}
function nextPart(l){
  if(l.cur+1<l.parts.length){ l.cur++; LP.touch(l); teach(l,false); }
  else{ l.cur=l.parts.length; LP.touch(l); startCheck(l,true); }
}
function chat(l,text){
  ui.ask=false;
  var p=l.cur>=l.parts.length?null:curPart(l);
  ask(l,text,'The student asks: '+text+'\nAnswer helpfully and briefly (under 150 words), staying on this lesson. If it is a checkpoint question, do not give the answer away.',{kind:'a'});
}

/* ---------- rendering ---------- */
function bubble(m,i){
  if(m.role==='user') return '<div class="lv-msg lv-user"><div>'+esc(m.text).replace(/\n/g,'<br>')+'</div></div>';
  return '<div class="lv-msg lv-ai"><span class="lv-av">🎓</span><div class="lv-text">'+(m.text?rich(m.text):'<span class="lv-dots"><i></i><i></i><i></i></span>')+'</div></div>';
}
function logHtml(l){
  var out=l.msgs.map(bubble).join('');
  if(!l.msgs.length) out='<div class="lv-msg lv-ai"><span class="lv-av">🎓</span><div class="lv-text"><span class="lv-dots"><i></i><i></i><i></i></span></div></div>';
  return out;
}
function paintLog(l){ var el=$('lv-log'); if(el){ el.innerHTML=logHtml(l); var s=$('lv-scroll'); if(s&&nearBottom(s)) s.scrollTop=s.scrollHeight; } }
function nearBottom(s){ return s.scrollHeight-s.scrollTop-s.clientHeight<140; }
function logScroll(){ setTimeout(function(){ var s=$('lv-scroll'); if(s) s.scrollTop=s.scrollHeight; },30); }
function lastAiText(l){ for(var i=l.msgs.length-1;i>=0;i--) if(l.msgs[i].role==='assistant') return l.msgs[i].text||''; return ''; }
function optionKeys(t){ var keys=[]; ['A','B','C','D'].forEach(function(k){ if(new RegExp('(^|\\n)\\s*\\**\\(?'+k+'[).:]').test(t)) keys.push(k); }); return keys.length>=2?keys:[]; }

function rail(l){
  var items=l.parts.map(function(p,i){
    var st=p.status==='done'?'done':(i===l.cur&&l.cur<l.parts.length?'cur':(i>0&&l.parts[i-1].status!=='done'&&p.status==='todo'?'lock':'open'));
    return '<button type="button" class="lp-ri '+st+(i===l.cur?' active':'')+'" data-lv="goto" data-i="'+i+'"'+(st==='lock'?' disabled':'')+'><span class="lp-rn">'+(st==='done'?'✓':(st==='lock'?'🔒':i+1))+'</span><span class="lp-rt"><b>'+esc(p.title)+'</b><small>'+(p.status==='done'?'Checkpoint '+(p.best!=null?p.best:CP_Q)+'/'+CP_Q:'≈ '+MIN_PER_PART+' min')+'</small></span></button>';
  }).join('');
  var all=partsDone(l)===l.parts.length, f=l.final;
  items+='<button type="button" class="lp-ri '+(f.status==='done'?'done':(all?(l.cur>=l.parts.length?'cur active':'open'):'lock'))+'" data-lv="goto" data-i="'+l.parts.length+'"'+(all?'':' disabled')+'><span class="lp-rn">'+(f.status==='done'?'✓':(all?'★':'🔒'))+'</span><span class="lp-rt"><b>Final review</b><small>'+(f.status==='done'?'Score '+f.best+'/'+FINAL_Q:'5 questions')+'</small></span></button>';
  return items;
}
function controls(l){
  if(busy===l.id) return '<div class="lv-status"><span class="spinner"></span> The tutor is writing…</div>';
  var errBox=l.err?'<div class="error-note">'+esc(l.err)+'</div><div class="lv-chips"><button type="button" class="btn btn-primary btn-sm" data-lv="retry">Try again</button></div>':'';
  if(errBox) return errBox;
  if(l.doneAt) return '<div class="lv-result good"><b>Lesson complete 🎉</b><span>You passed the final review. Practice this topic next, or ask the tutor anything below.</span><div class="lv-chips"><button type="button" class="btn btn-primary btn-sm" data-lv="practice">Practice this topic →</button></div></div>'+inputRow(l,'Ask a question about this lesson…');
  if(!l.planned) return '<div class="lv-status">Writing your lesson plan…</div>';
  var isFinal=l.cur>=l.parts.length, p=isFinal?l.final:curPart(l), t=lastAiText(l);
  if(p.status==='todo') return '<div class="lv-chips"><button type="button" class="btn btn-primary" data-lv="'+(isFinal?'startfinal':'teach')+'">'+(isFinal?'Start the final review →':'Start part '+(l.cur+1)+': '+esc(p.title)+' →')+'</button></div>'+inputRow(l,'Or ask a question first…');
  if(p.status==='teach') return '<div class="lv-chips"><button type="button" class="btn btn-primary btn-sm" data-lv="check">✅ Quiz me on this part</button><button type="button" class="lp-chip" data-lv="say" data-t="Explain that a different way.">Explain it differently</button><button type="button" class="lp-chip" data-lv="say" data-t="Show me another worked example.">Another example</button><button type="button" class="lp-chip" data-lv="say" data-t="Why does this matter for the AP exam?">Why it matters</button></div>'+inputRow(l,'Ask a question…');
  if(p.status==='check'){
    var keys=ui.ask?[]:optionKeys(t), total=isFinal?FINAL_Q:CP_Q;
    return '<div class="lv-cpbar">'+(isFinal?'Final review':'Checkpoint')+' · question '+Math.min(p.q+1,total)+' of '+total+' · '+p.right+' right so far</div>'
      +(keys.length?'<div class="lv-chips">'+keys.map(function(k){return '<button type="button" class="lv-key" data-lv="say" data-ans="1" data-t="'+k+'">'+k+'</button>';}).join('')+'</div>':'')
      +inputRow(l,ui.ask?'Ask a question…':'Type your answer (or pick a letter)…',true);
  }
  if(p.status==='done'||p.result==='pass'){
    return '<div class="lv-result good"><b>'+(isFinal?'Final review':'Checkpoint')+' passed: '+p.right+' of '+(isFinal?FINAL_Q:CP_Q)+'</b>'+(isFinal?'':'<span>Nicely done. Ready for the next part?</span>')+(isFinal?'':'<div class="lv-chips"><button type="button" class="btn btn-primary" data-lv="next">'+(l.cur+1<l.parts.length?'Next part →':'On to the final review →')+'</button></div>')+'</div>'+inputRow(l,'Ask a question…');
  }
  if(p.status==='retry'){
    return '<div class="lv-result retry"><b>'+(isFinal?'Final review':'Checkpoint')+': '+p.right+' of '+(isFinal?FINAL_Q:CP_Q)+'</b><span>You need '+(isFinal?FINAL_PASS:CP_PASS)+' to pass. Review the explanations above, then try again.</span><div class="lv-chips">'+(isFinal?'':'<button type="button" class="lp-chip" data-lv="reteach">Teach it again a different way</button>')+'<button type="button" class="btn btn-primary btn-sm" data-lv="'+(isFinal?'retryfinal':'check')+'">Try the checkpoint again</button></div></div>'+inputRow(l,'Ask a question…');
  }
  return '';
}
function inputRow(l,ph,answerMode){
  return '<div class="lv-input"><textarea id="lv-in" rows="1" placeholder="'+esc(ph)+'" aria-label="Message"></textarea><button type="button" class="btn btn-primary" data-lv="send" data-mode="'+(answerMode?'answer':'chat')+'">Send</button></div>'
    +(answerMode?'<button type="button" class="lv-link" data-lv="toggleask">'+(ui.ask?'← Back to answering':'Ask a question instead')+'</button>':'');
}
function player(l){
  var p=pct(l);
  var top='<div class="lp-top"><button type="button" class="btn btn-ghost btn-sm" data-lp="close">← All lessons</button><div class="lp-tt"><span class="lp-lib-sub">AP '+esc(subj(l))+' · Live lesson</span><h3>'+esc(l.title)+'</h3></div>'
    +'<div class="lp-stats"><span><b>'+p+'%</b> complete</span><span><b>'+hm(l.seconds/60)+'</b> studied</span><span>'+(l.doneAt?'Finished':'≈ <b>'+hm(minsLeft(l))+'</b> left')+'</span></div></div><div class="lp-bar big"><i style="width:'+p+'%"></i></div>';
  var heading=l.cur>=l.parts.length?'Final review':'Part '+(l.cur+1)+' of '+l.parts.length+' · '+esc(curPart(l).title);
  return top+'<div class="lp-layout"><button type="button" class="lp-railbtn" data-lv="rail">☰ Parts</button><nav class="lp-rail'+(ui.rail?' open':'')+'" aria-label="Lesson parts">'+rail(l)+'</nav>'
    +'<div class="lp-main lv-main"><div class="lp-kicker">'+heading+'</div><div id="lv-scroll" class="lv-scroll"><div id="lv-log" class="lv-log">'+logHtml(l)+'</div></div><div class="lv-controls">'+controls(l)+'</div></div></div>';
}

/* ---------- events ---------- */
function curLive(){ var s=LP.store(); return s.lessons.filter(function(l){return l.id===s.activeId&&isLive(l);})[0]||null; }
function onClick(e){
  var t=e.target.closest&&e.target.closest('[data-lv]'); if(!t) return; var l=curLive(); if(!l) return;
  var a=t.getAttribute('data-lv');
  if(busy&&a!=='rail'&&a!=='goto') return;
  if(a==='rail'){ ui.rail=!ui.rail; LP.render(); return; }
  if(a==='goto'){ var i=+t.getAttribute('data-i'); l.cur=i; ui.rail=false; ui.ask=false; LP.touch(l); LP.render(); logScroll(); return; }
  if(a==='teach') teach(l,false);
  else if(a==='reteach') teach(l,true);
  else if(a==='check') startCheck(l,false);
  else if(a==='startfinal'||a==='retryfinal') startCheck(l,true);
  else if(a==='next') nextPart(l);
  else if(a==='toggleask'){ ui.ask=!ui.ask; LP.render(); }
  else if(a==='say'){ var txt=t.getAttribute('data-t'); if(t.getAttribute('data-ans')) answer(l,txt); else chat(l,txt); }
  else if(a==='send'){ var ta=$('lv-in'); var v=ta?ta.value.trim():''; if(!v) return; ta.value=''; if(t.getAttribute('data-mode')==='answer'&&!ui.ask) answer(l,v); else chat(l,v); }
  else if(a==='retry'){ l.err=null; if(!l.planned&&!l.msgs.length) requestPlan(l); else if(lastAction&&lastAction.id===l.id){ var la=lastAction; ask(l,la.visible,la.instruction,la.opts); } else LP.render(); }
  else if(a==='practice'){
    var prev=state.learn.lesson; state.learn.lesson={subjectId:l.subjectId,topic:l.topic};
    var b=document.createElement('button'); b.setAttribute('data-action','go-practice-topic'); b.style.display='none'; document.body.appendChild(b); b.click(); b.remove(); state.learn.lesson=prev||null;
  }
}
document.addEventListener('click',onClick);
document.addEventListener('keydown',function(e){
  if(e.target&&e.target.id==='lv-in'&&e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); var b=document.querySelector('[data-lv="send"]'); if(b) b.click(); }
});
document.addEventListener('input',function(e){ var t=e.target; if(t&&t.id==='lv-in'){ t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,140)+'px'; } });

window.LearnLive={player:player,pct:pct,minsLeft:minsLeft,isLive:isLive,create:create,kinds:KINDS,libMeta:function(l){ return (l.doneAt?'Completed ✓':'Part '+Math.min(l.cur+1,l.parts.length)+' of '+l.parts.length+' · ≈ '+hm(minsLeft(l))+' left'); },busy:function(){return busy;}};
})();
