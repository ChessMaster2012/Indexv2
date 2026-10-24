/* Live Game v2 — question-set creator, "My sets" manager and the public Library browser. */
(function(){
'use strict';
var LV = window.LV;
function $(id){ return document.getElementById(id); }
var SUBJ = window.LV_SUBJ_LABEL;
var fmtTypes = window.lvFmtTypes, formatsOf = window.lvFormatsOf;
if(!Array.isArray(state.customSets)) state.customSets = lsGet('index-customsets', []);
if(!Array.isArray(state.customSets)) state.customSets = [];
function persistCustomSets(){ lsSet('index-customsets', state.customSets); scheduleAccountStateSync(); }
function toast(t){ try{ showRewardToast(t); }catch(e){} }
function msgHtml(){ return LV.msg ? '<div class="lv-msg '+(LV.msgOk?'ok':'err')+'" role="status">'+esc(LV.msg)+'</div>' : ''; }
function setMsg(m,ok){ LV.msg=m; LV.msgOk=!!ok; }
function api(method,url,body){
  return fetch(url,{method:method,credentials:'same-origin',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined})
    .then(function(r){ return r.json().catch(function(){return {ok:false,error:'Unexpected response.'};}).then(function(j){ j.status=r.status; return j; }); })
    .catch(function(){ return {ok:false,error:'Network problem. Check your connection and try again.'}; });
}

/* ---------- drafts ---------- */
function blankDraft(type){ return { type:type||'mc', q:'', options:['','','',''], correct:0, tf:0, answers:'', explanation:'', time:0 }; }
function fromQ(q){
  var d = blankDraft(q.type||'mc'); d.q=q.q||''; d.explanation=q.explanation||''; d.time=q.time||0;
  if(d.type==='mc'){ (q.options||[]).forEach(function(o,i){ d.options[i]=o; }); d.correct=q.correct||0; }
  else if(d.type==='tf') d.tf = q.correct===1?1:0;
  else d.answers = (q.answers||[]).join('\n');
  return d;
}
function toQ(d){
  var q = (d.q||'').trim(); if(!q) return {err:'write the question'};
  var base = { type:d.type, q:q, explanation:(d.explanation||'').trim(), time:+d.time||0 };
  if(d.type==='tf'){ base.correct = d.tf===1?1:0; return {q:base}; }
  if(d.type==='type'){
    var a = (d.answers||'').split(/\n/).map(function(x){return x.trim();}).filter(Boolean);
    if(!a.length) return {err:'add at least one accepted answer'};
    base.answers = a.slice(0,6); return {q:base};
  }
  var opts=[], correct=-1;
  d.options.forEach(function(o,i){ var t=(o||'').trim(); if(!t) return; if(i===d.correct) correct=opts.length; opts.push(t); });
  if(opts.length<2) return {err:'give at least two answer choices'};
  if(correct<0) return {err:'mark which choice is correct (and fill it in)'};
  base.options=opts; base.correct=correct; return {q:base};
}
function validateEditor(){
  var ed = LV.ed, out=[], title=(ed.title||'').trim();
  if(title.length<3) return {err:'Give your set a title (at least 3 characters).'};
  if(!ed.qs.length) return {err:'Add at least one question.'};
  for(var i=0;i<ed.qs.length;i++){ var r=toQ(ed.qs[i]); if(r.err) return {err:'Question '+(i+1)+': '+r.err+'.', at:i}; out.push(r.q); }
  return {questions:out};
}

/* ---------- screens ---------- */
function listScreen(){
  var cs = state.customSets;
  return '<button class="btn btn-ghost btn-sm lv-back" data-lvc="goto" data-screen="hub">← Back</button>'+
  '<div class="lv-page-head lv-row"><div><p class="lv-eyebrow">CREATOR</p><h3>My question sets</h3><p>Write your own questions, host them live, or publish them to the library for everyone.</p></div>'+
  '<button class="btn btn-primary" data-lvc="new">＋ New set</button></div>'+msgHtml()+
  (cs.length ? '<div class="lv-set-grid">'+cs.map(setCard).join('')+'</div>' :
   '<div class="lv-empty-big"><div>✍️</div><h4>Make your first set</h4><p>Combine multiple choice, true/false and type-in questions in one set.</p><button class="btn btn-primary" data-lvc="new">Create a set</button></div>');
}
function setCard(s){
  var pub = !!s.publishedId;
  return '<article class="lv-set"><div class="lv-set-top"><h4>'+esc(s.title)+'</h4>'+(pub?'<span class="lv-badge pub">Published</span>':'<span class="lv-badge">Private</span>')+'</div>'+
    (s.description?'<p class="lv-set-desc">'+esc(s.description)+'</p>':'')+
    '<p class="lv-set-meta">'+s.questions.length+' questions · '+esc(fmtTypes(formatsOf(s.questions)))+' · '+esc(SUBJ[s.subject]||'General')+'</p>'+
    '<div class="lv-set-actions"><button class="btn btn-primary btn-sm" data-lvc="host" data-id="'+s.id+'">🎤 Host</button><button class="btn btn-ghost btn-sm" data-lvc="edit" data-id="'+s.id+'">Edit</button>'+
    (pub?'<button class="btn btn-ghost btn-sm" data-lvc="unpublish" data-id="'+s.id+'">Unpublish</button>':'<button class="btn btn-pink btn-sm" data-lvc="publish" data-id="'+s.id+'">🌍 Publish</button>')+
    '<button class="btn btn-ghost btn-sm" data-lvc="dup" data-id="'+s.id+'" title="Duplicate">⧉</button><button class="btn btn-ghost btn-sm" data-lvc="del" data-id="'+s.id+'" title="Delete">🗑</button></div></article>';
}
function editorScreen(){
  var ed = LV.ed;
  return '<button class="btn btn-ghost btn-sm lv-back" data-lvc="goto" data-screen="creator-list">← My sets</button>'+
  '<div class="lv-editor"><div class="lv-editor-main"><header class="lv-page-head"><p class="lv-eyebrow">'+(ed.id?'EDIT SET':'NEW SET')+'</p><h3>'+(ed.id?'Edit your set':'Create a question set')+'</h3></header>'+
  '<section class="lv-panel"><div class="lv-fields"><div class="field lv-wide"><label for="ed-title">Title</label><input id="ed-title" data-ed="title" maxlength="80" value="'+esc(ed.title)+'" placeholder="e.g. Cell Biology Vocab"></div>'+
    '<div class="field lv-wide"><label for="ed-desc">Description <em>optional</em></label><input id="ed-desc" data-ed="description" maxlength="240" value="'+esc(ed.description)+'" placeholder="What is this set about?"></div>'+
    '<div class="field"><label for="ed-subj">Subject</label><select id="ed-subj" data-ed="subject">'+Object.keys(SUBJ).map(function(k){return '<option value="'+k+'" '+(ed.subject===k?'selected':'')+'>'+SUBJ[k]+'</option>';}).join('')+'</select></div></div></section>'+
  '<div class="lv-qlist">'+ed.qs.map(qCard).join('')+'</div>'+
  '<div class="lv-addrow"><span>Add a question</span><button class="btn btn-ghost btn-sm" data-lvc="addq" data-type="mc">＋ Multiple choice</button><button class="btn btn-ghost btn-sm" data-lvc="addq" data-type="tf">＋ True / False</button><button class="btn btn-ghost btn-sm" data-lvc="addq" data-type="type">＋ Type-in answer</button></div>'+
  '<details class="lv-panel lv-paste"><summary>⚡ Quick add from text</summary><p class="lv-fine">One per line as <code>Question | Answer</code>. Answers of “true” or “false” become True/False questions; anything else becomes a type-in question.</p>'+
    '<textarea id="ed-paste" rows="5" placeholder="Powerhouse of the cell? | Mitochondria&#10;The sun is a star. | true"></textarea><button class="btn btn-ghost btn-sm" data-lvc="paste">Add these</button></details></div>'+
  '<aside class="lv-setup-side"><div class="lv-summary-card"><h4>Your set</h4><ul><li><span>Questions</span><b>'+ed.qs.length+'</b></li><li><span>Formats</span><b>'+(formatsOf(ed.qs.map(function(d){return {type:d.type};})).length||0)+'</b></li></ul>'+
    '<div id="ed-status">'+msgHtml()+'</div><button class="btn btn-primary btn-lg lv-create" data-lvc="save">💾 Save set</button><button class="btn btn-ghost" data-lvc="save-host">Save & host live</button>'+
    '<p class="lv-fine">Sets are saved to your device and your account. Publishing is optional and needs a signed-in account.</p></div></aside></div>';
}
function qCard(d,i){
  var n = LV.ed.qs.length;
  var types = [['mc','Multiple choice'],['tf','True / False'],['type','Type-in']];
  var body='';
  if(d.type==='mc'){
    body = '<div class="lv-opts">'+[0,1,2,3].map(function(k){
      return '<label class="lv-opt t'+k+'"><input type="radio" name="c'+i+'" data-qi="'+i+'" data-qf="correct" value="'+k+'" '+(d.correct===k?'checked':'')+' aria-label="Mark choice '+'ABCD'[k]+' correct"><span class="lv-opt-mark">'+'ABCD'[k]+'</span><input type="text" maxlength="200" data-qi="'+i+'" data-qf="opt'+k+'" value="'+esc(d.options[k])+'" placeholder="Choice '+'ABCD'[k]+(k>1?' (optional)':'')+'"></label>';
    }).join('')+'</div><p class="lv-fine">Select the radio button next to the correct answer.</p>';
  } else if(d.type==='tf'){
    body = '<div class="lv-tfpick" role="radiogroup" aria-label="Correct answer"><label class="'+(d.tf===0?'on':'')+'"><input type="radio" name="tf'+i+'" data-qi="'+i+'" data-qf="tf" value="0" '+(d.tf===0?'checked':'')+'> ✓ True</label><label class="'+(d.tf===1?'on':'')+'"><input type="radio" name="tf'+i+'" data-qi="'+i+'" data-qf="tf" value="1" '+(d.tf===1?'checked':'')+'> ✕ False</label></div><p class="lv-fine">Choose the correct answer for your statement.</p>';
  } else {
    body = '<div class="field"><label for="qa'+i+'">Accepted answers <em>one per line, up to 6</em></label><textarea id="qa'+i+'" rows="3" data-qi="'+i+'" data-qf="answers" placeholder="Mitochondria&#10;mitochondrion">'+esc(d.answers)+'</textarea></div><p class="lv-fine">Capitalization, “the/a/an” and small typos on longer answers are forgiven.</p>';
  }
  return '<section class="lv-qcard" data-card="'+i+'"><header><span class="lv-qnum">'+(i+1)+'</span>'+
    '<select class="lv-qtype-sel" data-qi="'+i+'" data-qf="type" aria-label="Question format">'+types.map(function(t){return '<option value="'+t[0]+'" '+(d.type===t[0]?'selected':'')+'>'+t[1]+'</option>';}).join('')+'</select>'+
    '<span class="lv-qtools"><button class="lv-ic" data-lvc="qup" data-i="'+i+'" '+(i===0?'disabled':'')+' aria-label="Move up">↑</button><button class="lv-ic" data-lvc="qdown" data-i="'+i+'" '+(i===n-1?'disabled':'')+' aria-label="Move down">↓</button><button class="lv-ic" data-lvc="qdup" data-i="'+i+'" aria-label="Duplicate">⧉</button><button class="lv-ic danger" data-lvc="qdel" data-i="'+i+'" aria-label="Delete question">🗑</button></span></header>'+
    '<div class="field"><label for="q'+i+'">'+(d.type==='tf'?'Statement':'Question')+'</label><textarea id="q'+i+'" rows="2" maxlength="400" data-qi="'+i+'" data-qf="q" placeholder="'+(d.type==='tf'?'Write a statement that is true or false…':'Write your question…')+'">'+esc(d.q)+'</textarea></div>'+body+
    '<div class="lv-qextra"><div class="field"><label for="qe'+i+'">Explanation <em>optional, shown after the answer</em></label><input id="qe'+i+'" type="text" maxlength="400" data-qi="'+i+'" data-qf="explanation" value="'+esc(d.explanation)+'"></div>'+
    '<div class="field lv-qtime"><label for="qt'+i+'">Time</label><select id="qt'+i+'" data-qi="'+i+'" data-qf="time">'+[[0,'Game default'],[10,'10 s'],[20,'20 s'],[30,'30 s'],[45,'45 s'],[60,'60 s'],[90,'90 s']].map(function(t){return '<option value="'+t[0]+'" '+(+d.time===t[0]?'selected':'')+'>'+t[1]+'</option>';}).join('')+'</select></div></div></section>';
}

/* ---------- library screens ---------- */
function libCard(s, compact){
  return '<article class="lv-lib'+(compact?' compact':'')+'"><div class="lv-lib-top"><h4>'+esc(s.title)+'</h4><span class="lv-badge">'+esc(SUBJ[s.subject]||'General')+'</span></div>'+
    (s.description&&!compact?'<p class="lv-set-desc">'+esc(s.description)+'</p>':'')+
    '<p class="lv-set-meta">'+s.count+' questions · '+esc(fmtTypes(s.formats))+'</p><p class="lv-set-meta">by <b>'+esc(s.author)+'</b> · '+(s.plays||0)+' play'+(s.plays===1?'':'s')+'</p>'+
    (s.tags&&s.tags.length&&!compact?'<div class="lv-tags">'+s.tags.map(function(t){return '<span>#'+esc(t)+'</span>';}).join('')+'</div>':'')+
    '<div class="lv-set-actions">'+(compact?'<button class="btn btn-primary btn-sm" data-lvc="lib-use" data-id="'+s.id+'">Use this set</button>':
      '<button class="btn btn-primary btn-sm" data-lvc="lib-host" data-id="'+s.id+'">🎤 Host</button><button class="btn btn-ghost btn-sm" data-lvc="lib-copy" data-id="'+s.id+'">Save a copy</button>'+
      (s.mine?'<button class="btn btn-ghost btn-sm" data-lvc="lib-unpub" data-id="'+s.id+'">Unpublish</button>':'<button class="btn btn-ghost btn-sm" data-lvc="lib-report" data-id="'+s.id+'" title="Report this set">⚑ Report</button>'))+'</div></article>';
}
function libControls(idq){
  return '<div class="lv-lib-controls"><input type="search" id="'+idq+'" class="lv-search" data-lvc-search="1" placeholder="Search sets, topics, authors…" value="'+esc(LV.libQuery)+'" aria-label="Search library">'+
    '<select data-lvc-subj="1" aria-label="Subject"><option value="">All subjects</option>'+Object.keys(SUBJ).map(function(k){return '<option value="'+k+'" '+(LV.libSubject===k?'selected':'')+'>'+SUBJ[k]+'</option>';}).join('')+'</select>'+
    '<select data-lvc-sort="1" aria-label="Sort"><option value="new" '+(LV.libSort==='new'?'selected':'')+'>Newest</option><option value="popular" '+(LV.libSort==='popular'?'selected':'')+'>Most played</option></select></div>';
}
function libResultsHtml(compact){
  if(LV.libLoading && !LV.libResults) return '<div class="loading-line"><span class="spinner"></span> Loading library…</div>';
  if(LV.libErr) return '<div class="error-note">'+esc(LV.libErr)+'</div>';
  var r = LV.libResults||[];
  if(!r.length) return '<div class="lv-empty-big"><div>🌍</div><h4>Nothing here yet</h4><p>No published sets match. Be the first — create a set and publish it!</p></div>';
  return '<div class="'+(compact?'lv-lib-list':'lv-set-grid')+'">'+r.map(function(s){return libCard(s,compact);}).join('')+'</div>';
}
function libraryScreen(){
  return '<button class="btn btn-ghost btn-sm lv-back" data-lvc="goto" data-screen="hub">← Back</button>'+
  '<div class="lv-page-head lv-row"><div><p class="lv-eyebrow">COMMUNITY</p><h3>Question library</h3><p>Sets published by other students. Host one live or save a copy to edit.</p></div><button class="btn btn-primary" data-lvc="goto" data-screen="creator-list">✍️ Publish yours</button></div>'+
  msgHtml()+libControls('lv-lib-q')+'<div id="lv-lib-results">'+libResultsHtml(false)+'</div>';
}
window.lvLibraryPicker = function(){ return libControls('lv-lib-q2')+'<div id="lv-lib-results">'+libResultsHtml(true)+'</div>'; };
var libTimer=null;
window.lvLibLoad = function(){
  LV.libLoading = true; LV.libErr='';
  var qs = '?q='+encodeURIComponent(LV.libQuery)+'&subject='+encodeURIComponent(LV.libSubject)+'&sort='+LV.libSort;
  var mySeq = LV.libSeq = (LV.libSeq||0)+1;
  api('GET','/api/library'+qs).then(function(j){
    if(mySeq!==LV.libSeq) return;
    LV.libLoading=false;
    if(j.ok) LV.libResults=j.sets; else LV.libErr=j.error||'Could not load the library.';
    var box=$('lv-lib-results'); if(box) box.innerHTML = libResultsHtml(state.live.screen==='host-setup');
  });
};
window.lvCountPlay = function(id){ api('POST','/api/library/'+id+'/play'); };
window.lvCreatorScreens = { 'creator-list':listScreen, 'creator':editorScreen, 'library':libraryScreen };
window.lvAfterRender = function(scr){ if(scr==='library' && !LV.libResults && !LV.libLoading) window.lvLibLoad(); };

/* ---------- actions ---------- */
function findSet(id){ return state.customSets.find(function(s){return s.id===id;}); }
function openEditor(set){
  LV.ed = set ? { id:set.id, title:set.title, description:set.description||'', subject:set.subject||'general', publishedId:set.publishedId||'', qs:set.questions.map(fromQ) } :
    { id:'', title:'', description:'', subject:'general', publishedId:'', qs:[blankDraft('mc'),blankDraft('mc'),blankDraft('mc')] };
  setMsg('');
  state.live.screen='creator'; renderLive(); window.scrollTo(0,0);
}
function saveEditor(){
  var v = validateEditor(), st = $('ed-status');
  if(v.err){ setMsg(v.err,false); if(st) st.innerHTML=msgHtml(); if(v.at!=null){ var c=document.querySelector('[data-card="'+v.at+'"]'); if(c){ c.scrollIntoView({block:'center',behavior:'smooth'}); c.classList.add('bad'); setTimeout(function(){c.classList.remove('bad');},1800);} } return null; }
  var ed = LV.ed, set = ed.id ? findSet(ed.id) : null;
  if(!set){ set = { id:uid() }; state.customSets.unshift(set); ed.id=set.id; }
  Object.assign(set,{ title:ed.title.trim().slice(0,80), description:(ed.description||'').trim().slice(0,240), subject:ed.subject, questions:v.questions, updatedAt:Date.now(), publishedId:set.publishedId||ed.publishedId||'' });
  persistCustomSets(); setMsg('Saved ✓',true); if(st) st.innerHTML=msgHtml();
  return set;
}
function publish(set){
  setMsg('Publishing…',true); window.lvRerender();
  api('POST','/api/library',{ title:set.title, description:set.description, subject:set.subject, tags:[], questions:set.questions }).then(function(j){
    if(j.ok){ set.publishedId=j.id; persistCustomSets(); setMsg('Published! Everyone can now find “'+set.title+'” in the library.',true); LV.libResults=null; }
    else if(j.status===401) setMsg('Sign in to your Index account to publish a set.',false);
    else setMsg(j.error||'Could not publish.',false);
    window.lvRerender();
  });
}
function unpublish(pid,set){
  api('DELETE','/api/library/'+pid).then(function(j){
    if(j.ok||j.status===404){ if(set){ set.publishedId=''; persistCustomSets(); } setMsg('Removed from the library.',true); LV.libResults=null; if(state.live.screen==='library') window.lvLibLoad(); }
    else setMsg(j.error||'Could not unpublish.',false);
    window.lvRerender();
  });
}
function fetchSet(id){ return api('GET','/api/library/'+id).then(function(j){ if(!j.ok) throw new Error(j.error||'Could not load that set.'); return j.set; }); }
function parsePaste(txt){
  return txt.split(/\n/).map(function(l){return l.trim();}).filter(Boolean).map(function(l){
    var p=l.split('|'); if(p.length<2) return null; var q=p[0].trim(), a=p.slice(1).join('|').trim(); if(!q||!a) return null;
    var d; if(/^(true|false)$/i.test(a)){ d=blankDraft('tf'); d.tf=/^true$/i.test(a)?0:1; } else { d=blankDraft('type'); d.answers=a; }
    d.q=q; return d;
  }).filter(Boolean);
}
function onClick(e){
  var t = e.target.closest ? e.target.closest('[data-lvc]') : null; if(!t) return;
  var a=t.getAttribute('data-lvc'), id=t.getAttribute('data-id'), i=parseInt(t.getAttribute('data-i'),10), L=state.live, ed=LV.ed, set;
  if(a==='goto'){ setMsg(''); L.screen=t.getAttribute('data-screen'); if(L.screen==='library') window.lvLibLoad(); renderLive(); window.scrollTo(0,0); }
  else if(a==='new') openEditor(null);
  else if(a==='edit'){ set=findSet(id); if(set) openEditor(set); }
  else if(a==='host'){ set=findSet(id); if(set) window.lvHostSet('c:'+set.id,set.title,set.questions,set.subject); }
  else if(a==='dup'){ set=findSet(id); if(set){ var c=JSON.parse(JSON.stringify(set)); c.id=uid(); c.title=(c.title+' (copy)').slice(0,80); c.publishedId=''; state.customSets.unshift(c); persistCustomSets(); window.lvRerender(); } }
  else if(a==='del'){ set=findSet(id); if(set && confirm('Delete “'+set.title+'”?'+(set.publishedId?' It stays in the library until you unpublish it.':''))){ state.customSets=state.customSets.filter(function(s){return s.id!==id;}); persistCustomSets(); window.lvRerender(); } }
  else if(a==='publish'){ set=findSet(id); if(set && confirm('Publish “'+set.title+'” to the public library? Anyone can play it. Language and links are filtered.')) publish(set); }
  else if(a==='unpublish'){ set=findSet(id); if(set) unpublish(set.publishedId,set); }
  else if(a==='addq'){ ed.qs.push(blankDraft(t.getAttribute('data-type'))); window.lvRerender(); var cards=document.querySelectorAll('.lv-qcard'); if(cards.length) cards[cards.length-1].scrollIntoView({block:'center'}); }
  else if(a==='qdel'){ if(ed.qs.length>1 || confirm('Delete the only question?')){ ed.qs.splice(i,1); window.lvRerender(); } }
  else if(a==='qdup'){ ed.qs.splice(i+1,0,JSON.parse(JSON.stringify(ed.qs[i]))); window.lvRerender(); }
  else if(a==='qup'&&i>0){ var x=ed.qs[i]; ed.qs[i]=ed.qs[i-1]; ed.qs[i-1]=x; window.lvRerender(); }
  else if(a==='qdown'&&i<ed.qs.length-1){ var y=ed.qs[i]; ed.qs[i]=ed.qs[i+1]; ed.qs[i+1]=y; window.lvRerender(); }
  else if(a==='paste'){ var ta=$('ed-paste'); var ds=parsePaste(ta?ta.value:''); if(!ds.length){ setMsg('Use the format: Question | Answer (one per line).',false); var st=$('ed-status'); if(st) st.innerHTML=msgHtml(); return; } ed.qs=ed.qs.filter(function(d){return d.q.trim();}).concat(ds); setMsg(ds.length+' question'+(ds.length===1?'':'s')+' added.',true); window.lvRerender(); }
  else if(a==='save'){ var s1=saveEditor(); if(s1){ setTimeout(function(){ L.screen='creator-list'; renderLive(); window.scrollTo(0,0); },350); } }
  else if(a==='save-host'){ var s2=saveEditor(); if(s2) window.lvHostSet('c:'+s2.id,s2.title,s2.questions,s2.subject); }
  else if(a==='lib-use'){ fetchSet(id).then(function(s){ window.lvChoose('l:'+s.id,s.title,s.questions,s.subject); window.lvRerender(); }).catch(function(er){ alert(er.message); }); }
  else if(a==='lib-host'){ fetchSet(id).then(function(s){ window.lvHostSet('l:'+s.id,s.title,s.questions,s.subject); }).catch(function(er){ alert(er.message); }); }
  else if(a==='lib-copy'){ fetchSet(id).then(function(s){ state.customSets.unshift({id:uid(),title:(s.title+' (copy)').slice(0,80),description:s.description||'',subject:s.subject||'general',questions:s.questions,updatedAt:Date.now(),publishedId:''}); persistCustomSets(); setMsg('Saved a copy to “My sets”.',true); window.lvRerender(); }).catch(function(er){ alert(er.message); }); }
  else if(a==='lib-unpub'){ if(confirm('Remove this set from the library?')){ var mine=state.customSets.find(function(s){return s.publishedId===id;}); unpublish(id,mine); } }
  else if(a==='lib-report'){ if(confirm('Report this set as inappropriate? Sets with multiple reports are hidden automatically.')) api('POST','/api/library/'+id+'/report',{}).then(function(j){ setMsg(j.ok?'Thanks — we’ll review it.':(j.error||'Could not send report.'),!!j.ok); window.lvRerender(); }); }
}
function onInput(e){
  var t=e.target; if(!t.getAttribute) return;
  var f = t.getAttribute('data-ed');
  if(f && LV.ed){ LV.ed[f]=t.value; return; }
  if(t.getAttribute('data-lvc-search')){ LV.libQuery=t.value; clearTimeout(libTimer); libTimer=setTimeout(window.lvLibLoad,250); return; }
  var qi=t.getAttribute('data-qi'); if(qi==null||!LV.ed) return;
  var d=LV.ed.qs[+qi], qf=t.getAttribute('data-qf'); if(!d) return;
  if(qf==='correct') d.correct=+t.value;
  else if(qf==='tf'){ d.tf=+t.value; var lbls=t.closest('.lv-tfpick').querySelectorAll('label'); lbls.forEach(function(l,k){ l.classList.toggle('on',k===d.tf); }); }
  else if(/^opt\d$/.test(qf)) d.options[+qf.slice(3)]=t.value;
  else if(qf==='type'){ d.type=t.value; window.lvRerender(); }
  else if(qf==='time') d.time=+t.value;
  else d[qf]=t.value;
}
function onChange(e){
  var t=e.target; if(!t.getAttribute) return;
  if(t.getAttribute('data-lvc-subj')){ LV.libSubject=t.value; window.lvLibLoad(); }
  else if(t.getAttribute('data-lvc-sort')){ LV.libSort=t.value; window.lvLibLoad(); }
  else onInput(e);
}
function bind(){
  var s=$('live-stage'); if(!s||s.__lvc) return; s.__lvc=1;
  s.addEventListener('click',onClick); s.addEventListener('input',onInput); s.addEventListener('change',onChange);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind); else bind();
})();
