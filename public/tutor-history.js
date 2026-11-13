/* AI Tutor side panel: recent chats (saved in this browser), search, pin, rename, delete,
   plus tools that build on the current chat. The AI request itself (sendChat/runLocalAi and
   /api/ai/chat) is untouched; this file only saves and restores state.chat and can send ordinary
   messages through the existing composer. */
(function(){
'use strict';
var KEY='index-tutor-chats', OPEN_KEY='index-tutor-side', MAX_CHATS=40, MAX_TEXT=24000;
var $=function(id){return document.getElementById(id);};
var safe=function(f,d){try{return f();}catch(e){return d;}};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var toastMsg=function(m,bad){ if(typeof toast==='function') toast(m,bad); };
var P={
  plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  pin:'<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  pencil:'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  download:'<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  panel:'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  list:'<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
  note:'<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.6a2 2 0 0 0-.6-1.4l-4.6-4.6A2 2 0 0 0 13.4 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};
var I=function(n,z){ z=z||15; return '<svg class="ix-i" xmlns="http://www.w3.org/2000/svg" width="'+z+'" height="'+z+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+P[n]+'</svg>'; };

var chats=load(), cur=null, q='', renaming=null, confirmId=null, confirmTimer=0, side=null;
function load(){ var a=safe(function(){return JSON.parse(localStorage.getItem(KEY)||'[]');},[]); return Array.isArray(a)?a.filter(function(c){return c&&c.id&&Array.isArray(c.msgs);}):[]; }
function persist(){
  chats.sort(function(a,b){return (b.t||0)-(a.t||0);});
  while(chats.length>MAX_CHATS){ var i=-1; for(var k=chats.length-1;k>=0;k--){ if(!chats[k].pin){i=k;break;} } if(i<0) break; chats.splice(i,1); }
  safe(function(){localStorage.setItem(KEY,JSON.stringify(chats));},0);
}
function newId(){ return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function clean(msgs){ return msgs.filter(function(m){return m&&m.text&&!m.streaming;}).map(function(m){return {role:m.role==='user'?'user':'assistant',text:String(m.text).slice(0,MAX_TEXT)};}); }
function titleOf(msgs){ var u=msgs.filter(function(m){return m.role==='user';})[0]; var t=String(u?u.text:'New chat').replace(/\s+/g,' ').trim(); return t.length>56?t.slice(0,54)+'…':t||'New chat'; }
function byId(id){ for(var i=0;i<chats.length;i++) if(chats[i].id===id) return chats[i]; return null; }

/* ask the AI for a short topic title (like ChatGPT); until it answers the first prompt is shown */
var titling={};
function aiTitle(c){
  if(!c||c.custom||c.ai||titling[c.id]) return;
  var us=c.msgs.filter(function(m){return m.role==='user';}), as=c.msgs.filter(function(m){return m.role==='assistant';});
  if(!us.length||!as.length) return;
  var q=''; for(var i=0;i<us.length;i++){ if(!/^(hi|hello|hey|yo|sup|hii+|test)\W*$/i.test(us[i].text.trim())){ q=us[i].text; break; } }
  if(!q){ if(us.length<2) return; q=us[0].text; } // a lone greeting: wait for a real question
  titling[c.id]=1; var id=c.id;
  fetch('/api/ai/title',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({question:q,answer:as[0].text})})
    .then(function(r){return r.ok?r.json():null;}).then(function(d){
      var cc=byId(id); var t=d&&String(d.title||'').trim();
      if(cc&&t&&!cc.custom){ cc.title=t.slice(0,80); cc.ai=true; persist(); render(); }
    }).catch(function(){}).then(function(){ setTimeout(function(){ delete titling[id]; },30000); });
}

/* save the live conversation whenever it settles */
function sync(){
  var chat=safe(function(){return state.chat;},[]);
  if(!chat.length){ if(cur){ cur=null; render(); } return; }
  if(safe(function(){return state.chatLoading;},false)||chat.some(function(m){return m&&m.streaming;})) return;
  var msgs=clean(chat); if(!msgs.length) return;
  var c=cur&&byId(cur);
  var subj=safe(function(){return $('tutor-subject').value;},'');
  if(!c){ c={id:newId(),title:titleOf(msgs),t:Date.now(),pin:false,subject:subj,msgs:msgs}; chats.push(c); cur=c.id; persist(); render(); aiTitle(c); return; }
  if(JSON.stringify(c.msgs)!==JSON.stringify(msgs)){ c.msgs=msgs; c.t=Date.now(); c.subject=subj; if(!c.custom&&!c.ai) c.title=titleOf(msgs); persist(); render(); aiTitle(c); }
}

/* open a saved chat */
function openChat(id){
  var c=byId(id); if(!c) return;
  if(safe(function(){return state.chatLoading;},false)){ toastMsg('Wait for the tutor to finish answering first.',true); return; }
  state.chat=c.msgs.map(function(m){return {role:m.role,text:m.text};});
  cur=id;
  var sel=$('tutor-subject'); if(sel&&c.subject&&safe(function(){return Array.prototype.some.call(sel.options,function(o){return o.value===c.subject;});},false)) sel.value=c.subject;
  if(typeof renderChatLog==='function') renderChatLog();
  var log=$('chat-log'); if(log){ log.style.scrollBehavior='auto'; log.scrollTop=log.scrollHeight; setTimeout(function(){log.style.scrollBehavior='';},50); }
  if(narrow()) setOpen(false);
  render();
}
function newChat(){
  if(safe(function(){return state.chatLoading;},false)){ toastMsg('Wait for the tutor to finish answering first.',true); return; }
  var b=document.querySelector('#view-tutor [data-action="clear-chat"]'); if(b) b.click(); else { state.chat=[]; if(typeof renderChatLog==='function') renderChatLog(); }
  cur=null; render(); if(narrow()) setOpen(false);
  var ta=$('tutor-textarea'); if(ta) ta.focus();
}
function removeChat(id){
  var i=chats.findIndex?chats.findIndex(function(c){return c.id===id;}):-1; if(i<0) return;
  chats.splice(i,1); persist();
  if(cur===id){ cur=null; state.chat=[]; if(typeof renderChatLog==='function') renderChatLog(); }
  render();
}
function exportChat(){
  var chat=clean(safe(function(){return state.chat;},[]));
  if(!chat.length){ toastMsg('Nothing to export yet.',true); return; }
  var md='# '+titleOf(chat)+'\n\n_Exported from Index Tutor, '+new Date().toLocaleString()+'_\n\n'+chat.map(function(m){return '**'+(m.role==='user'?'You':'Tutor')+':**\n\n'+m.text;}).join('\n\n---\n\n')+'\n';
  var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([md],{type:'text/markdown'}));
  a.download=(titleOf(chat).replace(/[^\w]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'tutor-chat')+'.md';
  document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
}
function tool(text){
  if(!safe(function(){return state.chat.length;},0)){ toastMsg('Chat with the tutor first, then use this tool.',true); return; }
  if(window.TutorPlus&&TutorPlus.send) TutorPlus.send(text);
  if(narrow()) setOpen(false);
}

/* ---------- panel ---------- */
function narrow(){ return window.matchMedia&&matchMedia('(max-width:900px)').matches; }
function isOpen(){ var v=$('view-tutor'); return !!(v&&v.classList.contains('th-open')); }
function setOpen(on){
  var v=$('view-tutor'); if(!v) return; v.classList.toggle('th-open',!!on);
  if(!narrow()) safe(function(){localStorage.setItem(OPEN_KEY,on?'1':'0');},0);
  var b=$('th-toggle'); if(b) b.setAttribute('aria-expanded',on?'true':'false');
}
function group(t){
  var d=new Date(), start=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(), day=86400000;
  if(t>=start) return 'Today'; if(t>=start-day) return 'Yesterday'; if(t>=start-6*day) return 'Previous 7 days'; return 'Older';
}
function render(){
  var list=$('th-list'); if(!list) return;
  var needle=q.trim().toLowerCase();
  var shown=chats.filter(function(c){
    if(!needle) return true;
    return c.title.toLowerCase().indexOf(needle)>=0||c.msgs.some(function(m){return m.text.toLowerCase().indexOf(needle)>=0;});
  }).sort(function(a,b){return (b.t||0)-(a.t||0);});
  if(!shown.length){ list.innerHTML='<p class="th-empty">'+(needle?'No chats match “'+esc(q)+'”.':'Your conversations will show up here so you can come back to them.')+'</p>'; return; }
  var order=['Pinned','Today','Yesterday','Previous 7 days','Older'], groups={};
  shown.forEach(function(c){ var g=c.pin?'Pinned':group(c.t||0); (groups[g]=groups[g]||[]).push(c); });
  list.innerHTML=order.filter(function(g){return groups[g];}).map(function(g){
    return '<div class="th-group">'+g+'</div>'+groups[g].map(item).join('');
  }).join('');
  var ri=list.querySelector('.th-rename'); if(ri){ ri.focus(); ri.select(); }
}
function item(c){
  var on=c.id===cur?' on':'', n=Math.ceil(c.msgs.length/2);
  var title=renaming===c.id
    ? '<input class="th-rename" data-id="'+c.id+'" value="'+esc(c.title)+'" maxlength="80" aria-label="Chat name">'
    : '<span class="th-title">'+esc(c.title)+'</span>';
  var del=confirmId===c.id?'<button type="button" class="th-btn th-danger" data-th="del" data-id="'+c.id+'" title="Click again to delete">Delete?</button>':'<button type="button" class="th-btn" data-th="del" data-id="'+c.id+'" title="Delete chat" aria-label="Delete chat">'+I('trash')+'</button>';
  return '<div class="th-item'+on+(c.pin?' pinned':'')+'" data-th="open" data-id="'+c.id+'" role="button" tabindex="0">'
    +'<span class="th-ic">'+(c.pin?I('pin',13):I('chat',13))+'</span>'
    +'<span class="th-text">'+title+'<span class="th-meta">'+n+(n===1?' question':' questions')+'</span></span>'
    +'<span class="th-acts"><button type="button" class="th-btn" data-th="pin" data-id="'+c.id+'" title="'+(c.pin?'Unpin':'Pin to top')+'" aria-label="'+(c.pin?'Unpin':'Pin')+'">'+I('pin')+'</button>'
    +'<button type="button" class="th-btn" data-th="rename" data-id="'+c.id+'" title="Rename" aria-label="Rename">'+I('pencil')+'</button>'+del+'</span></div>';
}
function build(){
  var v=$('view-tutor'), shell=v&&v.querySelector('.tutor-shell'); if(!v||!shell||$('th-side')) return;
  side=document.createElement('aside'); side.id='th-side'; side.className='th-side'; side.setAttribute('aria-label','Tutor chats');
  side.innerHTML='<button type="button" class="th-new" data-th="new">'+I('plus',16)+'<span>New chat</span></button>'
    +'<label class="th-search">'+I('search',14)+'<input id="th-q" type="search" placeholder="Search chats" autocomplete="off" aria-label="Search chats"></label>'
    +'<div class="th-listwrap"><div id="th-list" class="th-list"></div></div>'
    +'<div class="th-tools"><div class="th-group">Tools for this chat</div>'
    +'<button type="button" data-th="summ">'+I('list')+'<span>Summarize chat</span></button>'
    +'<button type="button" data-th="notes">'+I('note')+'<span>Make study notes</span></button>'
    +'<button type="button" data-th="export">'+I('download')+'<span>Export as .md</span></button>'
    +'<button type="button" data-th="clearall" class="th-warn">'+I('trash')+'<span>Delete all chats</span></button></div>';
  v.insertBefore(side,shell);
  var scrim=document.createElement('div'); scrim.className='th-scrim'; scrim.setAttribute('data-th','close'); v.insertBefore(scrim,shell);

  var bar=shell.querySelector('.tutor-bar');
  if(bar){ var t=document.createElement('button'); t.type='button'; t.id='th-toggle'; t.className='th-toggle'; t.title='Chats'; t.setAttribute('aria-label','Show or hide chats'); t.setAttribute('aria-controls','th-side'); t.innerHTML=I('panel',18); t.setAttribute('data-th','toggle'); bar.insertBefore(t,bar.firstChild); }

  v.addEventListener('click',onClick);
  v.addEventListener('keydown',function(e){
    var it=e.target.closest&&e.target.closest('.th-item');
    if(e.target.classList&&e.target.classList.contains('th-rename')){ if(e.key==='Enter'){ finishRename(e.target,true); } else if(e.key==='Escape'){ renaming=null; render(); } return; }
    if(it&&(e.key==='Enter'||e.key===' ')&&e.target===it){ e.preventDefault(); openChat(it.getAttribute('data-id')); }
  });
  v.addEventListener('focusout',function(e){ if(e.target.classList&&e.target.classList.contains('th-rename')) finishRename(e.target,true); });
  $('th-q').addEventListener('input',function(e){ q=e.target.value; render(); });

  var wasOpen=safe(function(){return localStorage.getItem(OPEN_KEY);},null);
  setOpen(narrow()?false:wasOpen!=='0');
  var wasNarrow=narrow();
  window.addEventListener('resize',function(){ var n=narrow(); if(n!==wasNarrow){ wasNarrow=n; setOpen(n?false:safe(function(){return localStorage.getItem(OPEN_KEY);},null)!=='0'); } });
  render();
}
function finishRename(input,save){
  if(renaming===null) return; var id=renaming; renaming=null;
  var c=byId(id), v=input.value.replace(/\s+/g,' ').trim();
  if(save&&c&&v){ c.title=v.slice(0,80); c.custom=true; persist(); }
  render();
}
function onClick(e){
  var b=e.target.closest&&e.target.closest('[data-th]'); if(!b||!$('view-tutor').contains(b)) return;
  var a=b.getAttribute('data-th'), id=b.getAttribute('data-id');
  if(e.target.classList&&e.target.classList.contains('th-rename')) return;
  if(a==='toggle') setOpen(!isOpen());
  else if(a==='close') setOpen(false);
  else if(a==='new') newChat();
  else if(a==='open') openChat(id);
  else if(a==='pin'){ var c=byId(id); if(c){ c.pin=!c.pin; persist(); render(); } }
  else if(a==='rename'){ renaming=id; render(); }
  else if(a==='del'){
    if(confirmId===id){ clearTimeout(confirmTimer); confirmId=null; removeChat(id); }
    else { confirmId=id; render(); clearTimeout(confirmTimer); confirmTimer=setTimeout(function(){confirmId=null;render();},3000); }
  }
  else if(a==='summ') tool('Summarize our conversation so far in a few short bullet points, then tell me the one thing I should review next.');
  else if(a==='notes') tool('Turn what we covered into concise study notes: key terms with short definitions, the main steps or formulas, and one worked example.');
  else if(a==='export') exportChat();
  else if(a==='clearall'){
    if(!chats.length){ toastMsg('There are no saved chats.'); return; }
    if(b.getAttribute('data-sure')){ chats=[]; persist(); cur=null; state.chat=[]; if(typeof renderChatLog==='function') renderChatLog(); render(); b.removeAttribute('data-sure'); toastMsg('All saved chats deleted'); }
    else { b.setAttribute('data-sure','1'); b.querySelector('span').textContent='Click again to confirm'; setTimeout(function(){ b.removeAttribute('data-sure'); var s=b.querySelector('span'); if(s) s.textContent='Delete all chats'; },3000); }
  }
}

var _r=window.renderChatLog;
if(typeof _r==='function') window.renderChatLog=function(){ var out=_r.apply(this,arguments); try{sync();}catch(e){} return out; };
window.TutorHistory={reload:function(){ chats=load(); cur=null; render(); },list:function(){return chats.map(function(c){return {id:c.id,title:c.title,pin:!!c.pin};});},open:openChat,current:function(){return cur;}};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',build); else build();
})();
