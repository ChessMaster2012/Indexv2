/* AI Tutor extras: coaching modes, upload a document, quick prompts, copy/save replies, make a quiz or flashcards from the chat. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id);};
var I=function(n,z){return window.IX?IX.icon(n,z||16):'';};
var safe=function(f,d){try{return f();}catch(e){return d;}};
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
var S={mode:safe(function(){return localStorage.getItem('index-tutor-mode')||'';},''),doc:null,busy:false};
if(!MODES.some(function(m){return m.id===S.mode;})) S.mode='';
window.TutorPlus={mode:function(){return S.mode;},doc:function(){return S.doc?{name:S.doc.name,text:S.doc.text}:null;}};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function toastMsg(m,bad){ if(typeof toast==='function') toast(m,bad); }

/* ---------- build UI ---------- */
function build(){
  var shell=document.querySelector('#view-tutor .tutor-shell'); if(!shell||shell.getAttribute('data-tp')) return; shell.setAttribute('data-tp','1');
  var bar=shell.querySelector('.tutor-bar'), input=shell.querySelector('.tutor-input'), comp=$('tutor-textarea');
  // bar buttons
  var clear=bar.querySelector('[data-action="clear-chat"]');
  var mk=document.createElement('span'); mk.style.cssText='margin-left:auto;display:flex;gap:6px';
  mk.innerHTML='<button class="btn btn-ghost btn-sm tp-bar-btn" data-tp="quizset" title="Turn this conversation into a practice quiz">'+I('brain')+'<span class="tp-lbl"> Quiz from chat</span></button><button class="btn btn-ghost btn-sm tp-bar-btn" data-tp="cardset" title="Turn this conversation into flashcards">'+I('layers')+'<span class="tp-lbl"> Flashcards</span></button>';
  if(clear){ clear.style.marginLeft='0'; bar.insertBefore(mk,clear); } else bar.appendChild(mk);
  // modes row
  var modes=document.createElement('div'); modes.className='tp-modes'; modes.id='tp-modes'; bar.insertAdjacentElement('afterend',modes);
  // strip above composer
  var strip=document.createElement('div'); strip.className='tp-strip'; strip.innerHTML='<div id="tp-docbox"></div><div class="tp-status" id="tp-status" hidden></div><div class="tp-chips" id="tp-chips"></div>';
  shell.insertBefore(strip,input);
  // attach button + file input
  var btn=document.createElement('button'); btn.type='button'; btn.className='tp-attach'; btn.title='Upload a PDF, Word or text file (assignment, notes, worksheet)'; btn.setAttribute('aria-label','Upload a file'); btn.innerHTML=I('paperclip',20);
  var fi=document.createElement('input'); fi.type='file'; fi.id='tp-file'; fi.hidden=true; fi.accept='.pdf,.docx,.txt,.md,.csv,.html,.htm';
  input.insertBefore(btn,comp); input.appendChild(fi);
  btn.addEventListener('click',function(){fi.click();});
  fi.addEventListener('change',function(){ if(fi.files&&fi.files[0]) upload(fi.files[0]); fi.value=''; });
  // drag & drop
  ['dragenter','dragover'].forEach(function(ev){shell.addEventListener(ev,function(e){ if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')>=0){e.preventDefault();shell.classList.add('tp-drag');} });});
  ['dragleave','drop'].forEach(function(ev){shell.addEventListener(ev,function(e){ if(ev==='drop'||e.target===shell){shell.classList.remove('tp-drag');} });});
  shell.addEventListener('drop',function(e){ var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(f){e.preventDefault(); upload(f);} });
  shell.addEventListener('click',onClick);
  renderModes(); renderChips(); renderDoc();
}
function renderModes(){
  var box=$('tp-modes'); if(!box) return;
  var cur=MODES.filter(function(m){return m.id===S.mode;})[0]||MODES[0];
  box.innerHTML=MODES.map(function(m){return '<button type="button" class="tp-mode'+(m.id===S.mode?' on':'')+'" data-tp="mode" data-id="'+m.id+'" aria-pressed="'+(m.id===S.mode)+'">'+I(m.ic,15)+m.label+'</button>';}).join('')+'<div class="tp-mode-hint">'+esc(cur.hint)+'</div>';
}
function renderChips(){
  var box=$('tp-chips'); if(!box) return;
  box.innerHTML=CHIPS.map(function(c,i){return '<button type="button" class="tp-chip" data-tp="chip" data-i="'+i+'">'+I(c[0],14)+esc(c[1])+'</button>';}).join('');
}
function renderDoc(){
  var box=$('tp-docbox'); if(!box) return;
  box.innerHTML=S.doc?'<div class="tp-doc">'+I('file-text',18)+'<b>'+esc(S.doc.name)+'</b><small>'+Math.max(1,Math.round(S.doc.text.length/5))+' words read</small><button type="button" data-tp="rmdoc" title="Remove file" aria-label="Remove file">'+I('x',16)+'</button></div>':'';
}
function status(msg){ var s=$('tp-status'); if(!s) return; s.hidden=!msg; s.textContent=msg||''; }

/* ---------- upload ---------- */
function upload(f){
  if(f.size>8*1024*1024){ toastMsg('That file is over 8 MB.',true); return; }
  if(/\.(png|jpe?g|gif|webp|heic)$/i.test(f.name)){ toastMsg('Photos can’t be read yet. Upload a PDF, Word or text file, or paste the text.',true); return; }
  status('Reading '+f.name+'…');
  var fr=new FileReader();
  fr.onload=function(){
    var b64=String(fr.result).split(',')[1]||'';
    fetch('/api/tutor/extract',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({name:f.name,data:b64})})
      .then(function(r){return r.json().catch(function(){return {};});})
      .then(function(j){ if(j&&j.ok&&j.text){ S.doc={name:j.name||f.name,text:j.text}; renderDoc(); status('Attached. The tutor will use it until you remove it.'); setTimeout(function(){status('');},4000); } else { status(''); toastMsg((j&&j.error)||'Could not read that file.',true); } })
      .catch(function(){ status(''); toastMsg('Upload failed. Try again.',true); });
  };
  fr.onerror=function(){ status(''); toastMsg('Could not read that file.',true); };
  fr.readAsDataURL(f);
}

/* ---------- actions ---------- */
function send(text,mode){
  if(safe(function(){return state.chatLoading;},false)) return;
  if(mode!==undefined&&mode!==S.mode) setMode(mode);
  var ta=$('tutor-textarea'); if(!ta) return; ta.textContent=text; if(typeof sendChat==='function') sendChat();
}
function setMode(id){ S.mode=id; safe(function(){localStorage.setItem('index-tutor-mode',id);},0); renderModes(); }
function transcript(max){
  var chat=safe(function(){return state.chat;},[]).filter(function(m){return m&&m.text&&!m.streaming;}).slice(-(max||14));
  var t=chat.map(function(m){return (m.role==='user'?'Student: ':'Tutor: ')+m.text;}).join('\n\n');
  if(S.doc) t='Attached document "'+S.doc.name+'":\n'+S.doc.text.slice(0,5000)+'\n\n'+t;
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
  else if(a==='rmdoc'){ S.doc=null; renderDoc(); }
  else if(a==='quizset') makeSet('quiz');
  else if(a==='cardset') makeSet('flashcards');
  else if(a==='copy'){ var m=safe(function(){return state.chat[+b.getAttribute('data-i')];},null); if(m) copyText(m.text).then(function(){ b.innerHTML=I('circle-check',14)+' Copied'; setTimeout(function(){b.innerHTML=I('copy',14)+' Copy';},1500); }).catch(function(){toastMsg('Could not copy.',true);}); }
  else if(a==='note') saveNote(+b.getAttribute('data-i'));
}

/* ---------- decorate replies with Copy / Save ---------- */
function decorate(){
  var log=$('chat-log'); if(!log) return; var chat=safe(function(){return state.chat;},[]);
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
// "New chat" also detaches the document
document.addEventListener('click',function(e){ var b=e.target.closest&&e.target.closest('[data-action="clear-chat"]'); if(b){ S.doc=null; renderDoc(); } });

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',build); else build();
})();
