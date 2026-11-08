/* AI Tutor extras: full-height layout, coaching modes, attach up to 5 files, quick prompts,
   starter cards, copy/save replies, make a quiz or flashcards from the chat.
   This file only builds the interface around the tutor. The AI request itself (sendChat/runLocalAi
   in index.html and /api/ai/chat on the server) is unchanged. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id);};
var I=function(n,z){return window.IX?IX.icon(n,z||16):'';};
var safe=function(f,d){try{return f();}catch(e){return d;}};
var MAX_FILES=5, MAX_BYTES=8*1024*1024, PARALLEL=2;
var MODES=[
  {id:'',ic:'compass',label:'Coach',hint:'Guides you step by step with hints and questions.'},
  {id:'explain',ic:'book-open',label:'Explain it',hint:'Gets a clear explanation with an example, then checks you understood.'},
  {id:'quiz',ic:'target',label:'Quiz me',hint:'Asks you one practice question at a time and gives feedback.'},
  {id:'check',ic:'circle-check',label:'Check my work',hint:'Send the problem plus your attempt; it checks your steps and points out the first mistake.'}
];
var CHIPS=[
  ['lightbulb','Give me a hint','Can I get a hint?'],
  ['search','Explain simpler','Can you explain that in simpler words?'],
  ['circle-help','Why?','Why?'],
  ['repeat','Similar problem','Give me a similar practice problem to try.'],
  ['target','Quiz me on this','Quiz me on this, one question at a time.','quiz'],
  ['file-text','Show full solution','I’m stuck — please show the full solution step by step.']
];
var STARTERS=[
  ['book-open','Explain a concept','Explain this to me: ','explain'],
  ['compass','Work through a problem','Help me with this problem: ',''],
  ['target','Quiz me','Quiz me on ','quiz'],
  ['paperclip','Study my files',null]
];
var S={mode:safe(function(){return localStorage.getItem('index-tutor-mode')||'';},''),docs:[],seq:0,busy:false,statusTimer:0};
if(!MODES.some(function(m){return m.id===S.mode;})) S.mode='';

function readyDocs(){ return S.docs.filter(function(d){return d.state==='ready';}); }
function pendingDocs(){ return S.docs.filter(function(d){return d.state==='reading'||d.state==='working';}); }
/* Read by the chat code (index.html) when it sends a message. With files attached it returns
   {name, text:'', docs:[{name,text}]}; the server accepts up to 5 and shares the space fairly. */
window.TutorPlus={
  mode:function(){return S.mode;},
  doc:function(){
    var r=readyDocs(); if(!r.length) return null;
    return {name:r.length===1?r[0].name:r.length+' documents',text:'',docs:r.map(function(d){return {name:d.name,text:d.text};})};
  },
  docs:function(){return readyDocs().map(function(d){return {name:d.name};});},
  send:function(t,m){send(t,m);}
};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function toastMsg(m,bad){ if(typeof toast==='function') toast(m,bad); }

/* ---------- layout: let the tutor use the whole screen ---------- */
function layout(){
  var v=$('view-tutor'); var on=!!(v&&v.classList.contains('active'));
  var was=document.body.classList.contains('tp-full');
  document.body.classList.toggle('tp-full',on);
  if(on){
    if(!was) safe(function(){window.scrollTo(0,0);},0);
    var top=v.getBoundingClientRect().top+(window.pageYOffset||0);
    document.documentElement.style.setProperty('--tp-top',Math.max(0,Math.round(top))+'px');
    var log=$('chat-log'); if(log&&!was) log.scrollTop=log.scrollHeight;
  }
}

/* ---------- build UI ---------- */
function build(){
  var shell=document.querySelector('#view-tutor .tutor-shell'); if(!shell||shell.getAttribute('data-tp')) return; shell.setAttribute('data-tp','1');
  var bar=shell.querySelector('.tutor-bar'), input=shell.querySelector('.tutor-input'), comp=$('tutor-textarea');
  var clear=bar.querySelector('[data-action="clear-chat"]');

  // header actions: Quiz from chat, Flashcards, New chat
  var acts=document.createElement('div'); acts.className='tp-bar-actions';
  acts.innerHTML='<button class="btn btn-ghost btn-sm tp-bar-btn" data-tp="quizset" title="Turn this conversation into a practice quiz">'+I('brain')+'<span class="tp-lbl"> Quiz from chat</span></button><button class="btn btn-ghost btn-sm tp-bar-btn" data-tp="cardset" title="Turn this conversation into flashcards">'+I('layers')+'<span class="tp-lbl"> Flashcards</span></button>';
  if(clear){ bar.insertBefore(acts,clear); acts.appendChild(clear); } else bar.appendChild(acts);

  // coaching modes
  var modes=document.createElement('div'); modes.className='tp-modes'; modes.id='tp-modes'; bar.insertAdjacentElement('afterend',modes);

  // bottom dock: attached files, quick prompts, composer, small print
  var dock=document.createElement('div'); dock.className='tp-dock';
  var strip=document.createElement('div'); strip.className='tp-strip';
  strip.innerHTML='<div id="tp-docbox" class="tp-docbox"></div><div class="tp-status" id="tp-status" hidden></div><div class="tp-chips" id="tp-chips"></div>';
  dock.appendChild(strip); dock.appendChild(input);
  var foot=shell.parentNode.querySelector('.disclaimer'); if(foot){ foot.className='tp-foot'; dock.appendChild(foot); }
  shell.appendChild(dock);

  // attach button + hidden multi-file input
  var btn=document.createElement('button'); btn.type='button'; btn.className='tp-attach'; btn.id='tp-attach';
  btn.setAttribute('aria-label','Attach files');
  var fi=document.createElement('input'); fi.type='file'; fi.id='tp-file'; fi.hidden=true; fi.multiple=true; fi.accept='.pdf,.docx,.txt,.md,.csv,.html,.htm,.rtf';
  input.insertBefore(btn,comp); input.appendChild(fi);
  btn.addEventListener('click',function(){ if(S.docs.length>=MAX_FILES){ toastMsg('You can attach up to '+MAX_FILES+' files at a time. Remove one to add another.',true); return; } fi.click(); });
  fi.addEventListener('change',function(){ if(fi.files&&fi.files.length) addFiles(fi.files); fi.value=''; });

  // drag & drop (any number of files; the limit is applied in addFiles)
  var hasFiles=function(e){ return e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')>=0; };
  ['dragenter','dragover'].forEach(function(ev){shell.addEventListener(ev,function(e){ if(hasFiles(e)){e.preventDefault();shell.classList.add('tp-drag');} });});
  shell.addEventListener('dragleave',function(e){ if(e.target===shell||!shell.contains(e.relatedTarget)) shell.classList.remove('tp-drag'); });
  shell.addEventListener('drop',function(e){ shell.classList.remove('tp-drag'); if(hasFiles(e)){ e.preventDefault(); addFiles(e.dataTransfer.files); } });

  shell.addEventListener('click',onClick);
  renderModes(); renderChips(); renderDocs();

  // go full height whenever the Tutor view is shown
  var v=$('view-tutor');
  if(v&&window.MutationObserver) new MutationObserver(layout).observe(v,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',layout);
  layout();
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(layout);
}
function renderModes(){
  var box=$('tp-modes'); if(!box) return;
  var cur=MODES.filter(function(m){return m.id===S.mode;})[0]||MODES[0];
  box.innerHTML='<div class="tp-mode-row" role="group" aria-label="Tutor mode">'+MODES.map(function(m){return '<button type="button" class="tp-mode'+(m.id===S.mode?' on':'')+'" data-tp="mode" data-id="'+m.id+'" aria-pressed="'+(m.id===S.mode)+'">'+I(m.ic,15)+'<span>'+m.label+'</span></button>';}).join('')+'</div><div class="tp-mode-hint">'+esc(cur.hint)+'</div>';
}
function renderChips(){
  var box=$('tp-chips'); if(!box) return;
  box.innerHTML=CHIPS.map(function(c,i){return '<button type="button" class="tp-chip" data-tp="chip" data-i="'+i+'">'+I(c[0],14)+esc(c[1])+'</button>';}).join('');
}
function words(d){ return Math.max(1,Math.round(d.text.length/5)); }
function renderDocs(){
  var box=$('tp-docbox'); if(box){
    var n=S.docs.length;
    box.innerHTML=n?S.docs.map(function(d){
      var busy=d.state!=='ready';
      return '<div class="tp-doc'+(busy?' busy':'')+'" title="'+esc(d.name)+'">'+(busy?'<span class="tp-spin" aria-hidden="true"></span>':I('file-text',16))+'<b>'+esc(d.name)+'</b><small>'+(busy?'Reading…':words(d)+' words')+'</small><button type="button" data-tp="rmdoc" data-id="'+d.id+'" title="Remove '+esc(d.name)+'" aria-label="Remove '+esc(d.name)+'">'+I('x',14)+'</button></div>';
    }).join('')+'<span class="tp-count">'+n+' of '+MAX_FILES+' files</span>'+(n>1?'<button type="button" class="tp-clearall" data-tp="rmall">Remove all</button>':''):'';
  }
  var a=$('tp-attach');
  if(a){
    var n2=S.docs.length, full=n2>=MAX_FILES;
    a.innerHTML=I('paperclip',20)+(n2?'<span class="tp-badge">'+n2+'</span>':'');
    a.title=full?'You have attached the maximum of '+MAX_FILES+' files':'Attach up to '+MAX_FILES+' files (PDF, Word, or text): assignments, notes, worksheets';
    a.classList.toggle('full',full);
  }
}
function status(msg,keepMs){
  var s=$('tp-status'); if(!s) return;
  clearTimeout(S.statusTimer);
  s.hidden=!msg; s.textContent=msg||'';
  if(msg&&keepMs) S.statusTimer=setTimeout(function(){ s.hidden=true; s.textContent=''; },keepMs);
}

/* ---------- attach files (up to 5) ---------- */
var IMG=/\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i, OK=/\.(pdf|docx|txt|md|csv|html?|rtf)$/i;
function addFiles(list){
  var files=Array.prototype.slice.call(list||[]); if(!files.length) return;
  var skipped=[], added=0, over=0;
  files.forEach(function(f){
    if(S.docs.length>=MAX_FILES){ over++; return; }
    if(S.docs.some(function(d){return d.name===f.name&&d.size===f.size;})){ skipped.push(f.name+' is already attached'); return; }
    if(IMG.test(f.name)){ skipped.push(f.name+' is a photo (photos can’t be read yet)'); return; }
    if(!OK.test(f.name)){ skipped.push(f.name+' isn’t a PDF, Word, or text file'); return; }
    if(f.size>MAX_BYTES){ skipped.push(f.name+' is over 8 MB'); return; }
    S.docs.push({id:++S.seq,name:f.name,size:f.size,text:'',state:'reading',file:f}); added++;
  });
  var msgs=[];
  if(over) msgs.push('Only '+MAX_FILES+' files fit at a time, so '+over+' '+(over===1?'file was':'files were')+' left out.');
  if(skipped.length) msgs.push(skipped.slice(0,2).join('. ')+(skipped.length>2?' (+'+(skipped.length-2)+' more skipped).':'.'));
  if(msgs.length) toastMsg(msgs.join(' '),true);
  renderDocs();
  if(added){ updateReading(); pump(); }
}
function updateReading(){
  var total=S.docs.length, done=readyDocs().length;
  if(!pendingDocs().length) return;
  status(total===1?'Reading '+S.docs[0].name+'…':'Reading file '+Math.min(done+1,total)+' of '+total+'…');
}
function pump(){
  var running=S.docs.filter(function(d){return d.state==='working';}).length;
  S.docs.forEach(function(d){ if(d.state==='reading'&&running<PARALLEL){ d.state='working'; running++; extract(d); } });
}
function finish(d,ok,err){
  var alive=S.docs.indexOf(d)>=0;
  if(alive){
    if(ok){ d.state='ready'; d.file=null; }
    else { S.docs=S.docs.filter(function(x){return x!==d;}); toastMsg(d.name+': '+(err||'Could not read that file.'),true); }
  }
  renderDocs();
  var left=pendingDocs().length;
  if(left){ updateReading(); pump(); }
  else if(alive){
    var r=readyDocs().length;
    status(r?(r===1?'File attached. The tutor will use it until you remove it.':r+' files attached. The tutor will use them until you remove them.'):'',4500);
    pump();
  }
}
function extract(d){
  var fr=new FileReader();
  fr.onload=function(){
    var b64=String(fr.result).split(',')[1]||'';
    fetch('/api/tutor/extract',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({name:d.name,data:b64})})
      .then(function(r){return r.json().catch(function(){return {};});})
      .then(function(j){ if(j&&j.ok&&j.text){ d.text=String(j.text); if(j.name) d.name=String(j.name); finish(d,true); } else finish(d,false,(j&&j.error)||'Could not read that file.'); })
      .catch(function(){ finish(d,false,'Upload failed. Try again.'); });
  };
  fr.onerror=function(){ finish(d,false,'Could not read that file.'); };
  fr.readAsDataURL(d.file);
}
function removeDoc(id){
  S.docs=S.docs.filter(function(d){return String(d.id)!==String(id);});
  renderDocs(); if(!pendingDocs().length) status('');
  pump();
}
function clearDocs(){ S.docs=[]; renderDocs(); status(''); }

/* ---------- actions ---------- */
function composer(){ return $('tutor-textarea'); }
function focusEnd(el){
  el.focus();
  safe(function(){ var r=document.createRange(); r.selectNodeContents(el); r.collapse(false); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); },0);
}
function send(text,mode){
  if(safe(function(){return state.chatLoading;},false)) return;
  if(mode!==undefined&&mode!==S.mode) setMode(mode);
  var ta=composer(); if(!ta) return; ta.textContent=text; if(typeof sendChat==='function') sendChat();
}
function prefill(text,mode){
  if(mode!==undefined&&mode!==S.mode) setMode(mode);
  var ta=composer(); if(!ta) return; ta.textContent=text; focusEnd(ta);
}
function setMode(id){ S.mode=id; safe(function(){localStorage.setItem('index-tutor-mode',id);},0); renderModes(); }
function transcript(max){
  var chat=safe(function(){return state.chat;},[]).filter(function(m){return m&&m.text&&!m.streaming;}).slice(-(max||14));
  var t=chat.map(function(m){return (m.role==='user'?'Student: ':'Tutor: ')+m.text;}).join('\n\n');
  var r=readyDocs();
  if(r.length){ var each=Math.floor(5000/r.length); t=r.map(function(d){return 'Attached document "'+d.name+'":\n'+d.text.slice(0,each);}).join('\n\n')+'\n\n'+t; }
  return t.slice(0,12000);
}
function pickSubject(sample){
  var subs=safe(function(){return SUBJECTS;},[]); if(!subs.length) return Promise.resolve(null);
  var sel=$('tutor-subject'); if(sel&&sel.value&&subs.some(function(s){return s.id===sel.value;})) return Promise.resolve(sel.value);
  if(typeof askJSON!=='function') return Promise.resolve(subs[0].id);
  var list=subs.map(function(s){return s.id+' = '+s.name;}).join('\n');
  return askJSON('Choose the ONE course below that best matches this tutoring conversation.\n\n'+String(sample).slice(0,1500)+'\n\nCourses:\n'+list+'\n\nReply with ONLY JSON: {"id":"<course id from the list>"}')
    .then(function(r){var id=r&&String(r.id||'');return subs.some(function(s){return s.id===id;})?id:subs[0].id;}).catch(function(){return subs[0].id;});
}
function makeSet(type){
  var src=transcript(14);
  if(src.replace(/\s+/g,' ').length<80){ toastMsg('Chat with the tutor a bit first, then I can build a set from it.',true); return; }
  if(!safe(function(){return state.aiEnabled;},true)){ toastMsg('AI is unavailable right now.',true); return; }
  if(S.busy) return; S.busy=true; toastMsg(type==='quiz'?'Building a quiz from your chat…':'Building flashcards from your chat…');
  var firstQ=(safe(function(){return state.chat;},[]).filter(function(m){return m.role==='user';})[0]||{}).text||'Tutor chat';
  pickSubject(src).then(function(sid){
    return buildStudySet({subjectId:sid,topic:String(firstQ).replace(/\s+/g,' ').slice(0,60),type:type,count:type==='quiz'?6:8,sourceText:src});
  }).then(function(){ toastMsg(type==='quiz'?'Quiz ready in Study Sets':'Flashcards ready in Study Sets'); switchView('studysets'); })
    .catch(function(){ toastMsg('Could not build that. Try again.',true); }).then(function(){S.busy=false;});
}
function copyText(t){
  if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
  return new Promise(function(res,rej){ try{var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a);res();}catch(e){rej(e);} });
}
function saveNote(i){
  var chat=safe(function(){return state.chat;},[]), m=chat[i]; if(!m||!m.text) return;
  var q=''; for(var k=i-1;k>=0;k--){ if(chat[k].role==='user'){q=chat[k].text;break;} }
  pickSubject(q+'\n'+m.text).then(function(sid){
    state.notes.push({id:uid(),title:(String(q||'Tutor notes').replace(/\s+/g,' ').slice(0,60))||'Tutor notes',content:m.text,subjectId:sid||'',topic:'',createdAt:Date.now()});
    persistNotes(); toastMsg('Saved to notes');
  }).catch(function(){ toastMsg('Could not save that note.',true); });
}
function onClick(e){
  var b=e.target.closest&&e.target.closest('[data-tp]'); if(!b) return; var a=b.getAttribute('data-tp');
  if(a==='mode') setMode(b.getAttribute('data-id')||'');
  else if(a==='chip'){ var c=CHIPS[+b.getAttribute('data-i')]; if(c) send(c[2],c[3]); }
  else if(a==='starter'){ var s=STARTERS[+b.getAttribute('data-i')]; if(!s) return; if(s[2]===null){ var at=$('tp-attach'); if(at) at.click(); } else prefill(s[2],s[3]); }
  else if(a==='rmdoc') removeDoc(b.getAttribute('data-id'));
  else if(a==='rmall') clearDocs();
  else if(a==='quizset') makeSet('quiz');
  else if(a==='cardset') makeSet('flashcards');
  else if(a==='copy'){ var m=safe(function(){return state.chat[+b.getAttribute('data-i')];},null); if(m) copyText(m.text).then(function(){ b.innerHTML=I('circle-check',14)+' Copied'; setTimeout(function(){b.innerHTML=I('copy',14)+' Copy';},1500); }).catch(function(){toastMsg('Could not copy.',true);}); }
  else if(a==='note') saveNote(+b.getAttribute('data-i'));
}

/* ---------- decorate the chat: Copy / Save on replies, starter cards on an empty chat ---------- */
function decorate(){
  var log=$('chat-log'); if(!log) return; var chat=safe(function(){return state.chat;},[]);
  var empty=log.querySelector('.chat-empty');
  if(empty&&!empty.querySelector('.tp-starters')){
    var st=document.createElement('div'); st.className='tp-starters';
    st.innerHTML=STARTERS.map(function(s,i){return '<button type="button" class="tp-starter" data-tp="starter" data-i="'+i+'">'+I(s[0],18)+'<span>'+esc(s[1])+'</span></button>';}).join('');
    empty.appendChild(st);
  }
  var msgs=log.querySelectorAll('.msg');
  for(var i=0;i<msgs.length&&i<chat.length;i++){
    var el=msgs[i], m=chat[i];
    if(!m||m.role!=='assistant'||m.streaming||!m.text||el.querySelector('.tp-actions')) continue;
    var d=document.createElement('div'); d.className='tp-actions';
    d.innerHTML='<button type="button" class="tp-act" data-tp="copy" data-i="'+i+'">'+I('copy',14)+' Copy</button><button type="button" class="tp-act" data-tp="note" data-i="'+i+'">'+I('notebook-pen',14)+' Save to notes</button>';
    var c=el.querySelector('.msg-content'); (c||el).appendChild(d);
  }
}
var _r=window.renderChatLog;
if(typeof _r==='function') window.renderChatLog=function(){ var out=_r.apply(this,arguments); try{decorate();}catch(e){} return out; };

// Do not send while a file is still being read, or the tutor would answer without it.
var _s=window.sendChat;
if(typeof _s==='function') window.sendChat=function(){
  if(pendingDocs().length){ toastMsg('Still reading your files. One moment, then send again.',true); return; }
  return _s.apply(this,arguments);
};

// "New chat" also detaches the files
document.addEventListener('click',function(e){ var b=e.target.closest&&e.target.closest('[data-action="clear-chat"]'); if(b){ clearDocs(); } });

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',build); else build();
})();
