/* Study Sets upgrade: stats header, tidy filter bar, grid/list cards with progress,
   favorites, duplicate/rename/export, shuffle study, merge sets, bulk actions and a
   "write your own cards" creator that needs no AI.
   It only reads and edits state.studySets and re-draws #sets-list. Building sets with AI,
   the flashcard/quiz viewer and the lesson paths still use the existing code. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id);};
var safe=function(f,d){try{return f();}catch(e){return d;}};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var note=function(m,bad){ if(bad&&typeof toast==='function') toast(m,true); else if(typeof showRewardToast==='function') showRewardToast(m); else if(typeof toast==='function') toast(m); };
var P={
  star:'<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  copy:'<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  pencil:'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  download:'<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  shuffle:'<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>',
  layers:'<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  grid:'<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  list:'<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
  plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
  zap:'<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  merge:'<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"/><path d="m20 22-5-5"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  play:'<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
  list2:'<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>'
};
var I=function(n,z){ z=z||16; return '<svg class="ss-i" xmlns="http://www.w3.org/2000/svg" width="'+z+'" height="'+z+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+P[n]+'</svg>'; };

var UI_KEY='index-ss-ui';
var U=Object.assign({view:'grid',filter:'all',sort:'recent',course:'',q:''},safe(function(){return JSON.parse(localStorage.getItem(UI_KEY)||'{}');},{}));
U.q='';
var selecting=false, sel={}, built=false, rendering=false;
function saveUI(){ safe(function(){localStorage.setItem(UI_KEY,JSON.stringify({view:U.view,filter:U.filter,sort:U.sort,course:U.course}));},0); }

/* ---------- data helpers ---------- */
function sets(){ return Array.isArray(state.studySets)?state.studySets.filter(function(s){return !s.temp;}):[]; }
function items(s){ return s.type==='flashcards'?(s.cards||[]):(s.questions||[]); }
function stat(s){
  var now=Date.now(), n=items(s).length, o={n:n,mastered:0,due:0,best:null,tries:0,last:null};
  if(s.type==='flashcards'){
    (s.cards||[]).forEach(function(c){ if((c.box||1)>=4) o.mastered++; if(c.due===undefined||c.due<=now) o.due++; });
  }else{
    var a=Array.isArray(s.attempts)?s.attempts:[]; o.tries=a.length;
    a.forEach(function(t){ if(t&&t.total){ var p=Math.round(t.score/t.total*100); if(o.best===null||p>o.best) o.best=p; o.last=p; } });
  }
  return o;
}
function pathIds(){ var m={}; sets().forEach(function(s){ if(s.lessonPathId) m[s.lessonPathId]=1; }); return Object.keys(m); }
function subjIndex(id){ var l=safe(function(){return SUBJECTS;},[]); for(var i=0;i<l.length;i++) if(l[i].id===id) return i; return 0; }
function hue(id){ return (subjIndex(id)*47+250)%360; }
function subjName(id){ var s=safe(function(){return subjectById(id);},null); return s?s.name:''; }
function hay(s){ return ((s.title||'')+' '+(s.unit||'')+' '+(s.topic||'')+' '+subjName(s.subjectId)).toLowerCase(); }
function remKind(s){ return safe(function(){return studySetReminderState(s);},{kind:'none',label:''}); }
function needsReview(s){ var r=remKind(s); if(r.kind==='overdue') return true; return s.type==='flashcards'&&stat(s).due>0&&stat(s).n>0; }

function visible(){
  var q=U.q.trim().toLowerCase();
  var list=sets().filter(function(s){
    if(s.lessonPathId) return false;
    if(q&&hay(s).indexOf(q)<0) return false;
    if(U.course&&s.subjectId!==U.course) return false;
    if(U.filter==='flash'&&s.type!=='flashcards') return false;
    if(U.filter==='quiz'&&s.type!=='quiz') return false;
    if(U.filter==='fav'&&!s.fav) return false;
    if(U.filter==='due'&&!needsReview(s)) return false;
    return true;
  });
  var prog=function(s){ var t=stat(s); if(s.type==='flashcards') return t.n?t.mastered/t.n:0; return t.best===null?-1:t.best/100; };
  list.sort(function(a,b){
    if(U.sort==='old') return (a.createdAt||0)-(b.createdAt||0);
    if(U.sort==='name') return String(a.title||'').localeCompare(String(b.title||''));
    if(U.sort==='course') return subjName(a.subjectId).localeCompare(subjName(b.subjectId))||(b.createdAt||0)-(a.createdAt||0);
    if(U.sort==='due') return (Number(a.reminderAt)||Infinity)-(Number(b.reminderAt)||Infinity);
    if(U.sort==='weak') return prog(a)-prog(b);
    return (b.createdAt||0)-(a.createdAt||0);
  });
  // favorites float to the top of every view except when sorting by name
  if(U.sort!=='name'&&U.sort!=='course') list.sort(function(a,b){ return (b.fav?1:0)-(a.fav?1:0); });
  return list;
}

/* ---------- page skeleton ---------- */
function build(){
  var v=$('view-studysets'); if(!v||built) return; built=true;
  var head=v.querySelector('.row'); var builder=v.querySelector('.builder');
  var oldH3=null; Array.prototype.forEach.call(v.children,function(c){ if(c.tagName==='H3') oldH3=c; });
  if(oldH3) oldH3.classList.add('ss-hide');
  var oldSummary=$('sets-summary'); if(oldSummary) oldSummary.classList.add('ss-hide');
  var tb=v.querySelector('.sets-toolbar'); if(tb) tb.classList.add('ss-hide');

  var hero=document.createElement('div'); hero.className='ss-hero';
  hero.innerHTML='<div class="ss-hero-text"><h2>Study sets</h2><p>Flashcards and practice quizzes, tracked with spaced repetition.</p></div>'
    +'<div class="ss-hero-actions"><button type="button" class="ss-btn ss-primary" data-ss="new">'+I('plus')+'<span>Build with AI</span></button>'
    +'<button type="button" class="ss-btn" data-ss="manual">'+I('pencil')+'<span>Write your own</span></button></div>';
  if(head){ head.classList.add('ss-hide'); head.insertAdjacentElement('afterend',hero); } else v.insertBefore(hero,v.firstChild);
  var stats=document.createElement('div'); stats.id='ss-stats'; stats.className='ss-stats'; hero.insertAdjacentElement('afterend',stats);
  var weak=document.createElement('div'); weak.id='ss-weak'; weak.className='ss-weak'; weak.hidden=true; stats.insertAdjacentElement('afterend',weak);

  if(builder){
    builder.classList.add('ss-builder');
    var x=document.createElement('button'); x.type='button'; x.className='ss-builder-x'; x.setAttribute('data-ss','closebuilder'); x.setAttribute('aria-label','Close builder'); x.innerHTML=I('x',18);
    builder.insertBefore(x,builder.firstChild);
    stats.insertAdjacentElement('afterend',builder);
  }
  var ctl=document.createElement('div'); ctl.id='ss-controls'; ctl.className='ss-controls';
  ctl.innerHTML='<div class="ss-search"><span>'+I('search',15)+'</span><input id="ss-q" type="search" placeholder="Search sets, units or topics" autocomplete="off" aria-label="Search study sets"></div>'
    +'<div class="ss-pills" id="ss-pills" role="tablist"></div>'
    +'<div class="ss-ctl-row"><select id="ss-course" aria-label="Course"></select>'
    +'<select id="ss-sort" aria-label="Sort"><option value="recent">Newest first</option><option value="old">Oldest first</option><option value="name">Name A–Z</option><option value="course">By course</option><option value="due">Reminder date</option><option value="weak">Needs the most work</option></select>'
    +'<div class="ss-seg" role="group" aria-label="Layout"><button type="button" data-ss="view" data-v="grid" title="Cards" aria-label="Card view">'+I('grid')+'</button><button type="button" data-ss="view" data-v="list" title="List" aria-label="List view">'+I('list')+'</button></div>'
    +'<button type="button" class="ss-btn ss-sm" id="ss-selbtn" data-ss="select">'+I('check',15)+'<span>Select</span></button></div>';
  var list=$('sets-list'); list.parentNode.insertBefore(ctl,list);
  var bulk=document.createElement('div'); bulk.id='ss-bulk'; bulk.className='ss-bulk'; bulk.hidden=true; list.parentNode.insertBefore(bulk,list);

  v.addEventListener('click',onClick);
  v.addEventListener('input',function(e){
    if(e.target.id==='ss-q'){ U.q=e.target.value; draw(); }
  });
  v.addEventListener('change',function(e){
    if(e.target.id==='ss-course'){ U.course=e.target.value; saveUI(); draw(); }
    else if(e.target.id==='ss-sort'){ U.sort=e.target.value; saveUI(); draw(); }
  });
  v.addEventListener('keydown',function(e){
    var card=e.target.closest&&e.target.closest('.ss-card');
    if(card&&e.target===card&&selecting&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); toggleSel(card.getAttribute('data-id')); }
  });
  var wasActive=v.classList.contains('active');
  var vm=new MutationObserver(function(){ var on=v.classList.contains('active'); if(on&&!wasActive) draw(); wasActive=on; });
  vm.observe(v,{attributes:true,attributeFilter:['class']});
}

/* ---------- drawing ---------- */
function ring(p){ var r=20,c=2*Math.PI*r,o=c*(1-Math.max(0,Math.min(100,p))/100); return '<svg class="ss-ring" width="52" height="52" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="'+r+'" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="26" cy="26" r="'+r+'" fill="none" stroke="var(--purple)" stroke-width="5" stroke-linecap="round" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+o.toFixed(1)+'" transform="rotate(-90 26 26)"/></svg>'; }
function drawStats(){
  var box=$('ss-stats'); if(!box) return;
  if(!sets().length){ box.innerHTML=''; box.hidden=true; return; } box.hidden=false;
  var all=sets(), fl=all.filter(function(s){return s.type==='flashcards';}), qz=all.filter(function(s){return s.type==='quiz';});
  var cards=0,mastered=0,due=0; fl.forEach(function(s){ var t=stat(s); cards+=t.n; mastered+=t.mastered; due+=t.due; });
  var best=[],tries=0; qz.forEach(function(s){ var t=stat(s); tries+=t.tries; if(t.best!==null) best.push(t.best); });
  var avg=best.length?Math.round(best.reduce(function(a,b){return a+b;},0)/best.length):null;
  var mp=cards?Math.round(mastered/cards*100):0;
  var remDue=all.filter(function(s){return remKind(s).kind==='overdue';}).length;
  box.innerHTML=
    '<div class="ss-tile"><div class="ss-tile-top"><span class="ss-tile-ic">'+I('layers',20)+'</span><div><b>'+all.length+'</b><small>study sets</small></div></div><div class="ss-tile-sub">'+fl.length+' flashcard · '+qz.length+' quiz</div></div>'
    +'<div class="ss-tile"><div class="ss-tile-top">'+ring(mp)+'<div><b>'+mp+'%</b><small>cards mastered</small></div></div><div class="ss-tile-sub">'+mastered+' of '+cards+' cards</div></div>'
    +'<div class="ss-tile"><div class="ss-tile-top"><span class="ss-tile-ic">'+I('check',20)+'</span><div><b>'+(avg===null?'–':avg+'%')+'</b><small>quiz best average</small></div></div><div class="ss-tile-sub">'+tries+(tries===1?' attempt':' attempts')+' so far</div></div>'
    +'<div class="ss-tile ss-tile-cta'+(due?' hot':'')+'"><div class="ss-tile-top"><span class="ss-tile-ic">'+I('zap',20)+'</span><div><b>'+due+'</b><small>cards due now</small></div></div>'
    +(due?'<button type="button" class="ss-btn ss-primary ss-sm" data-ss="review">'+I('play',14)+'<span>Review now</span></button>':'<div class="ss-tile-sub">You are all caught up'+(remDue?' · '+remDue+' reminder'+(remDue>1?'s':''):'')+'</div>')+'</div>';
}
function drawControls(){
  var pills=$('ss-pills'); if(!pills) return;
  var all=sets().filter(function(s){return !s.lessonPathId;});
  var cnt={all:all.length,flash:0,quiz:0,fav:0,due:0}; all.forEach(function(s){ if(s.type==='flashcards') cnt.flash++; else cnt.quiz++; if(s.fav) cnt.fav++; if(needsReview(s)) cnt.due++; });
  var defs=[['all','All'],['flash','Flashcards'],['quiz','Quizzes'],['fav','Favorites'],['due','Needs review']];
  pills.innerHTML=defs.map(function(d){ return '<button type="button" role="tab" aria-selected="'+(U.filter===d[0])+'" class="ss-pill'+(U.filter===d[0]?' on':'')+'" data-ss="filter" data-f="'+d[0]+'">'+d[1]+'<em>'+cnt[d[0]]+'</em></button>'; }).join('');
  var cs=$('ss-course'); if(cs){
    var used={}; sets().forEach(function(s){ used[s.subjectId]=1; });
    var opts='<option value="">All courses</option>'+safe(function(){return SUBJECTS;},[]).filter(function(s){return used[s.id];}).map(function(s){ return '<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>'; }).join('');
    if(cs.getAttribute('data-sig')!==opts){ cs.innerHTML=opts; cs.setAttribute('data-sig',opts); }
    cs.value=U.course;
  }
  var so=$('ss-sort'); if(so) so.value=U.sort;
  var q=$('ss-q'); if(q&&document.activeElement!==q) q.value=U.q;
  document.querySelectorAll('#ss-controls .ss-seg button').forEach(function(b){ b.classList.toggle('on',b.getAttribute('data-v')===U.view); });
  var sb=$('ss-selbtn'); if(sb){ sb.classList.toggle('on',selecting); sb.querySelector('span').textContent=selecting?'Done':'Select'; }
}
function cardHtml(s){
  var t=stat(s), r=remKind(s), subj=safe(function(){return subjectById(s.subjectId);},null);
  var isF=s.type==='flashcards', wk=isF?weakCards(s).length:weakQs(s).length, pct=isF?(t.n?Math.round(t.mastered/t.n*100):0):(t.best===null?0:t.best);
  var unitIdx=s.unit&&subj?(subj.units||[]).indexOf(s.unit)+1:0;
  var meta=[subj?subj.name:'',s.unit?(unitIdx?'Unit '+unitIdx+': ':'')+s.unit:'',s.topic||''].filter(Boolean).map(esc).join(' · ');
  var prog=isF
    ? '<div class="ss-prog"><div class="ss-bar"><i style="width:'+pct+'%"></i></div><span>'+t.mastered+'/'+t.n+' mastered'+(t.due?' · <b>'+t.due+' due</b>':'')+(wk?' · <b class="ss-weak-tag">'+wk+' weak</b>':'')+'</span></div>'
    : '<div class="ss-prog"><div class="ss-bar"><i style="width:'+pct+'%"></i></div><span>'+(t.best===null?'Not attempted yet':'Best '+t.best+'% · '+t.tries+(t.tries===1?' try':' tries'))+(wk?' · <b class="ss-weak-tag">'+wk+' missed</b>':'')+'</span></div>';
  var badge=r.label?'<span class="ss-badge '+r.kind+'">'+esc(r.label)+'</span>':'';
  var on=sel[s.id]?' picked':'';
  return '<article class="ss-card '+(isF?'flash':'quiz')+on+'" data-id="'+esc(s.id)+'" style="--acc:hsl('+hue(s.subjectId)+' 78% 62%)"'+(selecting?' tabindex="0" role="checkbox" aria-checked="'+(!!sel[s.id])+'"':'')+'>'
    +'<span class="ss-selmark">'+I('check',14)+'</span>'
    +'<div class="ss-card-top"><span class="ss-kind">'+(isF?'Flashcards':'Quiz')+'</span>'+badge
    +'<button type="button" class="ss-ico'+(s.fav?' fav':'')+'" data-ss="fav" data-id="'+esc(s.id)+'" title="'+(s.fav?'Remove from favorites':'Add to favorites')+'" aria-label="Favorite" aria-pressed="'+(!!s.fav)+'">'+I('star',17)+'</button></div>'
    +'<button type="button" class="ss-title" data-action="open-set" data-id="'+esc(s.id)+'">'+esc(s.title||'Untitled set')+'</button>'
    +'<div class="ss-meta">'+meta+'</div>'
    +'<div class="ss-count">'+t.n+' '+(isF?'cards':'questions')+'</div>'
    +prog
    +'<div class="ss-foot"><button type="button" class="ss-btn ss-primary ss-sm" data-action="open-set" data-id="'+esc(s.id)+'">'+I('play',13)+'<span>'+(isF?'Study':'Take quiz')+'</span></button>'
    +(isF&&t.n>1?'<button type="button" class="ss-btn ss-sm ss-ghost" data-ss="shuffle" data-id="'+esc(s.id)+'" title="Study in random order">'+I('shuffle',14)+'<span class="ss-lbl">Shuffle</span></button>':'')
    +'<span class="ss-spacer"></span>'
    +'<button type="button" class="ss-ico" data-ss="dup" data-id="'+esc(s.id)+'" title="Duplicate" aria-label="Duplicate">'+I('copy',15)+'</button>'
    +'<button type="button" class="ss-ico" data-ss="rename" data-id="'+esc(s.id)+'" title="Rename" aria-label="Rename">'+I('pencil',15)+'</button>'
    +'<button type="button" class="ss-ico" data-ss="export" data-id="'+esc(s.id)+'" title="Export" aria-label="Export">'+I('download',15)+'</button>'
    +'<button type="button" class="ss-ico danger" data-action="delete-set" data-id="'+esc(s.id)+'" title="Delete" aria-label="Delete">'+I('trash',15)+'</button></div>'
    +'</article>';
}
function pathsHtml(){
  var q=U.q.trim().toLowerCase(); if(U.filter==='fav'||U.filter==='flash'||U.filter==='quiz'||U.filter==='due') return '';
  var ids=pathIds().filter(function(id){
    var first=sets().filter(function(s){return s.lessonPathId===id;})[0]; if(!first) return false;
    if(U.course&&first.subjectId!==U.course) return false;
    return !q||hay(first).indexOf(q)>=0;
  });
  if(!ids.length||typeof pathOverviewHtml!=='function') return '';
  var out=ids.map(function(id){ return safe(function(){return pathOverviewHtml(id);},''); }).join('');
  return out?'<div class="ss-section"><h3>Topic study paths</h3><div class="ss-paths">'+out+'</div></div>':'';
}
function draw(){
  if(!built||rendering) return; rendering=true;
  try{
    var box=$('sets-list'); if(!box) return;
    if(purgeTemp()&&!(state.viewer&&String(state.viewer.setId||'').indexOf('tmp-')===0)) save();
    drawStats(); drawWeak(); drawControls();
    var v=$('view-studysets'); if(v.classList.contains('ss-selecting')!==selecting) v.classList.toggle('ss-selecting',selecting);
    var total=sets().length, list=visible(), html='';
    if(!total){
      html='<div class="ss-empty"><div class="ss-empty-ic">'+I('layers',34)+'</div><h3>No study sets yet</h3><p>Let the AI build flashcards or a quiz from a topic or your notes, or type your own cards in seconds.</p><div class="ss-empty-actions"><button type="button" class="ss-btn ss-primary" data-ss="new">'+I('plus')+'<span>Build with AI</span></button><button type="button" class="ss-btn" data-ss="manual">'+I('pencil')+'<span>Write your own</span></button></div></div>';
      if(!v.classList.contains('ss-building')) v.classList.add('ss-building');
    }else if(!list.length&&!pathIds().length){
      html='<div class="ss-empty"><h3>No sets match</h3><p>Try a different filter or search.</p><button type="button" class="ss-btn" data-ss="reset">Clear filters</button></div>';
    }else if(list.length){
      if(U.sort==='course'){
        var groups=[],map={}; list.forEach(function(s){ var k=s.subjectId; if(!map[k]){ map[k]={k:k,items:[]}; groups.push(map[k]); } map[k].items.push(s); });
        html=groups.map(function(g){ return '<div class="ss-section"><h3>'+esc(subjName(g.k)||'Other')+'<em>'+g.items.length+'</em></h3><div class="ss-grid '+U.view+'">'+g.items.map(cardHtml).join('')+'</div></div>'; }).join('');
      }else html='<div class="ss-grid '+U.view+'">'+list.map(cardHtml).join('')+'</div>';
    }
    box.innerHTML=html+pathsHtml();
    drawBulk();
  }finally{ rendering=false; }
}
function drawBulk(){
  var b=$('ss-bulk'); if(!b) return;
  var ids=Object.keys(sel).filter(function(k){return sel[k];});
  b.hidden=!selecting;
  if(!selecting) return;
  b.innerHTML='<span class="ss-bulk-n"><b>'+ids.length+'</b> selected</span>'
    +'<button type="button" class="ss-btn ss-sm" data-ss="selall">Select all shown</button>'
    +'<button type="button" class="ss-btn ss-sm" data-ss="merge"'+(ids.length<2?' disabled':'')+'>'+I('merge',14)+'<span>Merge into one set</span></button>'
    +'<button type="button" class="ss-btn ss-sm" data-ss="bulkfav"'+(ids.length?'':' disabled')+'>'+I('star',14)+'<span>Favorite</span></button>'
    +'<button type="button" class="ss-btn ss-sm ss-danger" data-ss="bulkdel"'+(ids.length?'':' disabled')+'>'+I('trash',14)+'<span>Delete</span></button>';
}

/* ---------- actions ---------- */
function find(id){ var a=Array.isArray(state.studySets)?state.studySets:[]; for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return null; }
function save(){ safe(function(){persistSets();},0); }
function shuffleArr(a){ a=a.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function newId(){ return typeof uid==='function'?uid():Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function openViewer(set,cards,title){
  state.viewer={setId:set?set.id:null,mode:'flashcards',cardsRef:cards,flashIndex:0,flashFlipped:false,sessionXP:0};
  $('viewer-title').textContent=title; renderViewerBody(); $('viewer-modal').classList.remove('hidden');
}
function download(name,text,type){
  var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:type||'text/plain'}));
  a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
}
function slug(s){ return String(s||'study-set').replace(/[^\w]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'study-set'; }
function exportSet(s){
  if(s.type==='flashcards'){
    var tsv=(s.cards||[]).map(function(c){ return String(c.front||'').replace(/[\t\r\n]+/g,' ')+'\t'+String(c.back||'').replace(/[\t\r\n]+/g,' '); }).join('\n');
    download(slug(s.title)+'.txt',tsv); note('Exported. Import the .txt into Quizlet or Anki (tab between term and definition).');
  }else{
    var L=['A','B','C','D','E','F'];
    var txt=(s.title||'Quiz')+'\n\n'+(s.questions||[]).map(function(q,i){
      return (i+1)+'. '+q.q+'\n'+(q.options||[]).map(function(o,k){ return '   '+L[k]+') '+o+(k===q.correct?'  ✓':''); }).join('\n')+(q.explanation?'\n   Why: '+q.explanation:'');
    }).join('\n\n')+'\n';
    download(slug(s.title)+'.txt',txt); note('Quiz exported as a text file.');
  }
}
function copyOf(s,title){
  var c=JSON.parse(JSON.stringify(s)); c.id=newId(); c.title=title||((s.title||'Set')+' (copy)'); c.createdAt=Date.now(); c.fav=false;
  c.reminderAt=0; c.reminderCompleted=false; c.reminderNotified=false; delete c.lessonPathId; delete c.lessonNumber; delete c.lessonTotal;
  if(c.type==='flashcards') (c.cards||[]).forEach(function(k){ k.id=newId(); k.box=1; k.due=Date.now(); }); else c.attempts=[];
  return c;
}
function toggleSel(id){ if(sel[id]) delete sel[id]; else sel[id]=true; draw(); }
function selectedSets(){ return Object.keys(sel).filter(function(k){return sel[k];}).map(find).filter(Boolean); }
function doMerge(){
  var chosen=selectedSets(); if(chosen.length<2){ note('Pick at least two sets to merge.',true); return; }
  var type=chosen[0].type; if(chosen.some(function(s){return s.type!==type;})){ note('Merge works on sets of the same kind. Pick all flashcards or all quizzes.',true); return; }
  var def='Mix: '+chosen.map(function(s){return s.title;}).join(' + '); if(def.length>80) def=def.slice(0,78)+'…';
  ask({title:'Merge '+chosen.length+' sets',label:'Name for the new set',value:def,ok:'Merge'}).then(function(name){
    if(!name) return;
    var base=copyOf(chosen[0],name), all=[];
    chosen.forEach(function(s){ var c=copyOf(s); all=all.concat(type==='flashcards'?c.cards:c.questions); });
    if(type==='flashcards') base.cards=all; else base.questions=all;
    base.unit=''; base.topic=''; base.merged=true;
    var courses={}; chosen.forEach(function(s){courses[s.subjectId]=(courses[s.subjectId]||0)+1;});
    base.subjectId=Object.keys(courses).sort(function(a,b){return courses[b]-courses[a];})[0];
    state.studySets.push(base); save(); sel={}; selecting=false; draw(); note('Merged into “'+name+'” ('+all.length+' '+(type==='flashcards'?'cards':'questions')+')');
  });
}

/* small dialog used for rename, merge and the card writer */
function ask(o){
  return new Promise(function(resolve){
    var m=document.createElement('div'); m.className='ss-modal'; m.innerHTML='<div class="ss-dialog" role="dialog" aria-modal="true" aria-label="'+esc(o.title)+'"><h3>'+esc(o.title)+'</h3>'
      +(o.body||'')+'<label class="ss-fl">'+esc(o.label||'')+'<input class="ss-input" id="ss-ask" type="text" maxlength="120" value="'+esc(o.value||'')+'"></label>'
      +'<div class="ss-dialog-actions"><button type="button" class="ss-btn" data-k="no">Cancel</button><button type="button" class="ss-btn ss-primary" data-k="ok">'+esc(o.ok||'OK')+'</button></div></div>';
    document.body.appendChild(m);
    var inp=m.querySelector('#ss-ask'); inp.focus(); inp.select();
    var done=function(val){ document.removeEventListener('keydown',key,true); m.remove(); resolve(val); };
    var key=function(e){ if(e.key==='Escape'){ e.stopPropagation(); done(null); } else if(e.key==='Enter'&&e.target===inp){ e.preventDefault(); done(inp.value.trim()); } };
    document.addEventListener('keydown',key,true);
    m.addEventListener('click',function(e){ var k=e.target.getAttribute&&e.target.getAttribute('data-k'); if(k==='ok') done(inp.value.trim()); else if(k==='no'||e.target===m) done(null); });
  });
}

/* ---------- write your own cards (no AI needed) ---------- */
var SEPS=['\t',' :: ','::',' | ',' - ',' – ',' — ',' = ',': '];
function parseCards(text){
  var out=[]; String(text||'').split(/\r?\n/).forEach(function(line){
    line=line.trim(); if(!line) return;
    for(var i=0;i<SEPS.length;i++){ var k=line.indexOf(SEPS[i]); if(k>0){ var f=line.slice(0,k).trim(), b=line.slice(k+SEPS[i].length).trim(); if(f&&b){ out.push({front:f.slice(0,200),back:b.slice(0,600)}); return; } } }
  });
  return out.slice(0,200);
}
function openManual(){
  var subs=safe(function(){return SUBJECTS;},[]); if(!subs.length) return;
  var m=document.createElement('div'); m.className='ss-modal';
  m.innerHTML='<div class="ss-dialog ss-wide" role="dialog" aria-modal="true" aria-label="Write your own flashcards"><h3>Write your own flashcards</h3>'
    +'<div class="ss-form"><label class="ss-fl">Title<input class="ss-input" id="ssm-title" type="text" maxlength="100" placeholder="e.g. Unit 3 vocabulary"></label>'
    +'<label class="ss-fl">Course<select class="ss-input" id="ssm-course">'+subs.map(function(s){return '<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>';}).join('')+'</select></label></div>'
    +'<label class="ss-fl">One card per line, term then definition<textarea class="ss-input" id="ssm-text" rows="9" placeholder="Photosynthesis - how plants turn light into chemical energy&#10;Mitochondria :: the cell\'s powerhouse&#10;Federalism = power shared between national and state governments"></textarea></label>'
    +'<p class="ss-hint">Separate with <code>-</code>, <code>::</code>, <code>=</code>, <code>|</code>, a colon or a tab. Pasting from a spreadsheet or Quizlet works too.</p>'
    +'<div id="ssm-prev" class="ss-prev"></div>'
    +'<div class="ss-dialog-actions"><button type="button" class="ss-btn" data-k="no">Cancel</button><button type="button" class="ss-btn ss-primary" data-k="ok" id="ssm-ok" disabled>Create set</button></div></div>';
  document.body.appendChild(m);
  var ti=m.querySelector('#ssm-title'), tx=m.querySelector('#ssm-text'), ok=m.querySelector('#ssm-ok'), pv=m.querySelector('#ssm-prev');
  var sub=safe(function(){return $('ss-course').value;},''); if(sub) m.querySelector('#ssm-course').value=sub;
  ti.focus();
  var upd=function(){
    var c=parseCards(tx.value), lines=tx.value.split(/\r?\n/).filter(function(l){return l.trim();}).length;
    ok.disabled=!c.length;
    pv.innerHTML=c.length?('<b>'+c.length+'</b> card'+(c.length>1?'s':'')+' ready'+(lines>c.length?' · '+(lines-c.length)+' line'+((lines-c.length)>1?'s':'')+' skipped (no separator)':'')
      +'<div class="ss-prev-list">'+c.slice(0,3).map(function(k){return '<div><strong>'+esc(k.front)+'</strong><span>'+esc(k.back)+'</span></div>';}).join('')+(c.length>3?'<small>+ '+(c.length-3)+' more</small>':'')+'</div>'):'';
  };
  tx.addEventListener('input',upd);
  var close=function(){ document.removeEventListener('keydown',key,true); m.remove(); };
  var key=function(e){ if(e.key==='Escape'){ e.stopPropagation(); close(); } };
  document.addEventListener('keydown',key,true);
  m.addEventListener('click',function(e){
    var k=e.target.getAttribute&&e.target.getAttribute('data-k');
    if(k==='no'||e.target===m) close();
    else if(k==='ok'){
      var cards=parseCards(tx.value); if(!cards.length) return;
      var now=Date.now(), course=m.querySelector('#ssm-course').value;
      var set={id:newId(),subjectId:course,type:'flashcards',unit:'',topic:'',title:ti.value.trim()||('My cards · '+new Date().toLocaleDateString()),createdAt:now,reminderAt:0,reminderCompleted:false,manual:true,
        cards:cards.map(function(c){return {id:newId(),front:c.front,back:c.back,box:1,due:now};})};
      state.studySets.push(set); save(); close(); U.filter='all'; U.q=''; draw(); note('Created “'+set.title+'” with '+cards.length+' cards');
    }
  });
}

/* ---------- weak spots ---------- */
/* Flashcards: card.weak goes up when you rate a card Again (+2) or Hard (+1) and down on Good (-1) / Easy (-2).
   Quiz questions: q.last is 'w' after a miss and 'r' after a correct answer. Both live on the set, so they sync with your account. */
function realSets(){ return sets().filter(function(s){return !s.temp;}); }
function weakCards(set){ return (set.cards||[]).filter(function(c){return (c.weak||0)>=1;}); }
function weakQs(set){ var o=[]; (set.questions||[]).forEach(function(q,i){ if(q&&q.last==='w') o.push({q:q,i:i}); }); return o; }
function weakSummary(){
  var rows=[],cards=0,qs=0;
  realSets().forEach(function(s){
    var n=s.type==='flashcards'?weakCards(s).length:weakQs(s).length; if(!n) return;
    rows.push({set:s,n:n}); if(s.type==='flashcards') cards+=n; else qs+=n;
  });
  rows.sort(function(a,b){return b.n-a.n;});
  return {rows:rows,cards:cards,qs:qs};
}
function purgeTemp(){
  var had=(state.studySets||[]).some(function(s){return s.temp;}); if(!had) return false;
  state.studySets=state.studySets.filter(function(s){return !s.temp;}); return true;
}
function drawWeak(){
  var box=$('ss-weak'); if(!box) return;
  if(!realSets().length){ box.hidden=true; box.innerHTML=''; return; }
  box.hidden=false;
  var w=weakSummary();
  if(!w.rows.length){
    box.className='ss-weak calm';
    box.innerHTML='<div class="ss-weak-head"><span class="ss-weak-ic">'+I('target',20)+'</span><div><b>Weak spots</b><small>Cards you rate Again or Hard, and quiz questions you miss, collect here so you can drill just those.</small></div></div>';
    return;
  }
  box.className='ss-weak';
  box.innerHTML='<div class="ss-weak-head"><span class="ss-weak-ic">'+I('target',20)+'</span><div><b>Weak spots</b><small>'
    +(w.cards?w.cards+(w.cards===1?' card':' cards'):'')+(w.cards&&w.qs?' and ':'')+(w.qs?w.qs+(w.qs===1?' question':' questions'):'')+' to practice. Get them right to clear them.</small></div>'
    +'<div class="ss-weak-actions">'
    +(w.cards?'<button type="button" class="ss-btn ss-primary ss-sm" data-ss="weakcards">'+I('play',13)+'<span>Practice weak cards</span></button>':'')
    +(w.qs?'<button type="button" class="ss-btn ss-primary ss-sm" data-ss="weakq">'+I('play',13)+'<span>Retry missed questions</span></button>':'')
    +'</div></div>'
    +'<div class="ss-weak-sets">'+w.rows.slice(0,6).map(function(r){
      return '<button type="button" class="ss-weak-chip" data-ss="weakset" data-id="'+esc(r.set.id)+'" style="--acc:hsl('+hue(r.set.subjectId)+' 78% 62%)"><span>'+esc(r.set.title||'Untitled')+'</span><em>'+r.n+(r.set.type==='flashcards'?(r.n===1?' card':' cards'):(r.n===1?' question':' questions'))+'</em></button>';
    }).join('')+'</div>';
}
function weakCardList(only){
  var out=[]; (only?[only]:realSets()).forEach(function(s){ if(s.type==='flashcards') weakCards(s).forEach(function(c){ out.push(c); }); });
  out.sort(function(a,b){return (b.weak||0)-(a.weak||0);}); return out;
}
function startWeakCards(only){
  var list=weakCardList(only); if(!list.length){ note('No weak cards right now. Nice work!'); return; }
  openViewer(only||null,list,(only?only.title+' · ':'')+'Weak spots · '+list.length+(list.length===1?' card':' cards'));
}
function startWeakQuestions(only){
  var pool=[]; (only?[only]:realSets()).forEach(function(s){ if(s.type==='quiz') weakQs(s).forEach(function(x){ var c=JSON.parse(JSON.stringify(x.q)); c._src=[s.id,x.i]; pool.push({c:c,s:s}); }); });
  if(!pool.length){ note('No missed questions to retry. Nice work!'); return; }
  var count={}; pool.forEach(function(x){count[x.s.subjectId]=(count[x.s.subjectId]||0)+1;});
  var subj=Object.keys(count).sort(function(a,b){return count[b]-count[a];})[0];
  var tmp={id:'tmp-'+newId(),temp:true,type:'quiz',subjectId:subj,unit:'',topic:'',title:(only?only.title+' · ':'')+'Missed questions',createdAt:Date.now(),reminderAt:0,reminderCompleted:false,
    questions:shuffleArr(pool).map(function(x){return x.c;}),attempts:[]};
  state.studySets.push(tmp); openStudySetViewer(tmp.id);
}
/* learn from what happens in the viewer */
var _rc=window.rateCard;
if(typeof _rc==='function') window.rateCard=function(card,rating){
  try{ var d={again:2,hard:1,good:-1,easy:-2}[rating]||0; card.weak=Math.max(0,Math.min(6,(card.weak||0)+d)); }catch(e){}
  return _rc.apply(this,arguments);
};
document.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('[data-action="quiz-finish"]'); if(!b) return;
  safe(function(){
    var vw=state.viewer; if(!vw||vw.mode!=='quiz'||!vw.quizSubmitted) return;
    var s=find(vw.setId); if(!s) return;
    s.questions.forEach(function(q,i){
      var right=vw.quizAnswers[i]===q.correct, target=q;
      if(q._src){ var o=find(q._src[0]); target=o&&o.questions&&o.questions[q._src[1]]; }
      if(!target) return;
      target.last=right?'r':'w'; if(right) target.hit=(target.hit||0)+1; else target.miss=(target.miss||0)+1;
    });
    save();
  },0);
});
var _cv=window.closeViewer;
if(typeof _cv==='function') window.closeViewer=function(){
  var out=_cv.apply(this,arguments);
  if(purgeTemp()) save();
  if(state.viewer&&state.viewer.setId&&String(state.viewer.setId).indexOf('tmp-')===0) state.viewer.setId=null;
  if(built&&$('view-studysets').classList.contains('active')) draw();
  return out;
};

/* ---------- click routing ---------- */
function onClick(e){
  var card=e.target.closest&&e.target.closest('.ss-card');
  if(selecting&&card&&!(e.target.closest('[data-ss="fav"]'))){ e.preventDefault(); e.stopPropagation(); toggleSel(card.getAttribute('data-id')); return; }
  var b=e.target.closest&&e.target.closest('[data-ss]'); if(!b) return; var a=b.getAttribute('data-ss'), id=b.getAttribute('data-id'), s=id?find(id):null;
  if(a==='new'){ $('view-studysets').classList.add('ss-building'); var bd=document.querySelector('#view-studysets .ss-builder'); if(bd) bd.scrollIntoView({behavior:'smooth',block:'start'}); }
  else if(a==='closebuilder'){ $('view-studysets').classList.remove('ss-building'); }
  else if(a==='manual') openManual();
  else if(a==='review'){ if(typeof openSmartReview==='function') openSmartReview(); }
  else if(a==='filter'){ U.filter=b.getAttribute('data-f'); saveUI(); draw(); }
  else if(a==='view'){ U.view=b.getAttribute('data-v'); saveUI(); draw(); }
  else if(a==='reset'){ U.filter='all'; U.course=''; U.q=''; saveUI(); draw(); }
  else if(a==='select'){ selecting=!selecting; if(!selecting) sel={}; draw(); }
  else if(a==='selall'){ visible().forEach(function(x){sel[x.id]=true;}); draw(); }
  else if(a==='fav'&&s){ s.fav=!s.fav; save(); draw(); }
  else if(a==='shuffle'&&s){ openViewer(s,shuffleArr(s.cards||[]),s.title+' · shuffled'); }
  else if(a==='dup'&&s){ var c=copyOf(s); state.studySets.push(c); save(); draw(); note('Duplicated “'+s.title+'”'); }
  else if(a==='rename'&&s){ ask({title:'Rename study set',label:'Name',value:s.title||'',ok:'Save'}).then(function(n){ if(n){ s.title=n; save(); draw(); } }); }
  else if(a==='export'&&s) exportSet(s);
  else if(a==='merge') doMerge();
  else if(a==='weakcards') startWeakCards();
  else if(a==='weakq') startWeakQuestions();
  else if(a==='weakset'&&s){ if(s.type==='flashcards') startWeakCards(s); else startWeakQuestions(s); }
  else if(a==='bulkfav'){ var ch=selectedSets(), on=ch.some(function(x){return !x.fav;}); ch.forEach(function(x){x.fav=on;}); save(); draw(); }
  else if(a==='bulkdel'){
    var del=selectedSets(); if(!del.length) return;
    if(!window.confirm('Delete '+del.length+' study set'+(del.length>1?'s':'')+'? This cannot be undone.')) return;
    var ids={}; del.forEach(function(x){ids[x.id]=1;});
    state.studySets=state.studySets.filter(function(x){return !ids[x.id];});
    if(state.viewer&&ids[state.viewer.setId]&&typeof closeViewer==='function') closeViewer();
    sel={}; selecting=false; save(); draw(); note('Deleted '+del.length+' study set'+(del.length>1?'s':''));
  }
}

/* ---------- hook into the existing renderer ---------- */
var _r=window.renderStudySets;
window.renderStudySets=function(){
  var out; try{ out=typeof _r==='function'?_r.apply(this,arguments):undefined; }catch(e){}
  try{ build(); draw(); }catch(e){ if(window.console) console.error('Study Sets UI',e); }
  return out;
};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ build(); }); else build();
})();
