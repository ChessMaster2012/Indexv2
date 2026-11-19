/* Grade Calculator: import classes from StudentVUE, then change scores / add assignments to see the effect. */
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s);};
function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function ic(n,s){ try{ return IX.icon(n,s||16); }catch(e){ return ''; } }
function acct(){ try{ return (state.account&&(state.account.id||state.account.username))||'guest'; }catch(e){ return 'guest'; } }
var KEY=function(){return 'index-grades-v1:'+acct();};
var S={data:null,url:'',user:'',edits:{},added:{},open:-1,busy:false,err:'',districts:null,needPass:null};

function load(){ try{ var j=JSON.parse(localStorage.getItem(KEY())||'null'); if(j){ S.data=j.data||null; S.url=j.url||''; S.user=j.user||''; S.edits=j.edits||{}; S.added=j.added||{}; } }catch(e){} }
function save(){ try{ localStorage.setItem(KEY(),JSON.stringify({data:S.data,url:S.url,user:S.user,edits:S.edits,added:S.added})); }catch(e){} }
function forget(){ S.data=null; S.edits={}; S.added={}; S.open=-1; try{ localStorage.removeItem(KEY()); }catch(e){} }

/* ---------- the math ---------- */
function ckey(ci){ return S.data.manual?'m|'+ci:S.data.period&&S.data.period.name?S.data.period.name+'|'+ci:String(ci); }
function itemsFor(ci,useEdits){
  var c=S.data.courses[ci], ed=(S.edits[ckey(ci)]||{}), out=c.assignments.map(function(a){
    var e=useEdits?ed[a.id]:null; if(!e) return a;
    return Object.assign({},a,{earned:e.earned===undefined?a.earned:e.earned,possible:e.possible===undefined?a.possible:e.possible,excluded:e.excluded===undefined?a.excluded:e.excluded});
  });
  if(useEdits) out=out.concat((S.added[ckey(ci)]||[]));
  return out;
}
function calc(course,items){
  var graded=items.filter(function(i){ return !i.excluded&&i.earned!=null&&i.possible!=null&&isFinite(i.earned)&&isFinite(i.possible); });
  if(course.weighted){
    var tw=0,sum=0;
    course.categories.forEach(function(cat){
      var e=0,p=0; graded.forEach(function(i){ if(i.category===cat.name){ e+=i.earned; p+=i.possible; } });
      if(p>0){ tw+=cat.weight; sum+=cat.weight*(e/p); }
    });
    return tw>0?sum/tw*100:null;
  }
  var E=0,P=0; graded.forEach(function(i){ E+=i.earned; P+=i.possible; });
  return P>0?E/P*100:null;
}
function catStats(course,items){
  return course.categories.map(function(cat){
    var e=0,p=0; items.forEach(function(i){ if(!i.excluded&&i.category===cat.name&&i.earned!=null&&i.possible!=null){ e+=i.earned; p+=i.possible; } });
    return {name:cat.name,weight:cat.weight,earned:e,possible:p,pct:p>0?e/p*100:null};
  });
}
// Projected grade = what StudentVUE shows now, moved by how much your changes move the calculation.
function projected(ci){
  var c=S.data.courses[ci], base=c.percent, a=calc(c,itemsFor(ci,false)), b=calc(c,itemsFor(ci,true));
  if(b==null) return null;
  if(base==null||a==null) return b;
  return Math.max(0,base+(b-a));
}
function letter(p){ if(p==null) return '–'; var f=S.data&&S.data.courses.some(function(c){return c.letter==='E';})?'E':'F'; return p>=90?'A':p>=80?'B':p>=70?'C':p>=60?'D':f; }
function fmt(p){ return p==null?'–':(Math.round(p*100)/100).toFixed(p%1===0?0:2).replace(/(\.\d)0$/,'$1')+'%'; }
function changed(ci){ var k=ckey(ci); return Object.keys(S.edits[k]||{}).length>0||(S.added[k]||[]).length>0; }

/* ---------- network ---------- */
function post(path,body){
  return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}).then(function(r){
    return r.json().catch(function(){return {};}).then(function(d){ if(!r.ok) throw new Error(d.error||'Something went wrong.'); return d; });
  });
}
function connect(url,user,pass,period){
  S.busy=true; S.err=''; render();
  return post('/api/studentvue/gradebook',{url:url,username:user,password:pass,period:period==null?'':period}).then(function(d){
    var samePeriod=S.data&&S.data.period&&d.period&&S.data.period.name===d.period.name;
    S.data=d; S.url=url; S.user=user; if(!samePeriod){ S.edits=S.edits; } S.open=-1; S.needPass=null; save();
  }).catch(function(e){ S.err=e.message; }).then(function(){ S.busy=false; render(); });
}

/* ---------- views ---------- */
function root(){ return $('#view-grades'); }
function privacy(){ return '<p class="gc-priv">'+ic('lock',14)+' Your StudentVUE password is sent straight to your school\'s StudentVUE site and is never saved. Your grades stay in this browser, not on Index\'s servers.</p>'; }
function connectView(){
  var ds=S.districts?(S.districts.length?'<div class="gc-dlist">'+S.districts.map(function(d,i){ return '<button type="button" class="gc-d" data-d="'+i+'">'+esc(d.name)+'</button>'; }).join('')+'</div>':'<p class="gc-hint">No districts found for that ZIP. Paste your StudentVUE address below.</p>'):'';
  return '<div class="gc-card gc-connect"><h3>Connect StudentVUE</h3><p class="gc-sub">Sign in once to pull in your classes and assignments. Then change any score to see what would happen to your grade.</p>'+
    '<div class="gc-row"><div><label>Find your school district by ZIP</label><div class="gc-inline"><input id="gc-zip" inputmode="numeric" maxlength="5" placeholder="ZIP code"><button class="btn btn-ghost" id="gc-find" type="button">Find</button></div></div></div>'+ds+
    '<label>StudentVUE address</label><input id="gc-url" type="text" placeholder="https://md-mcps-psv.edupoint.com" value="'+esc(S.url||'')+'" autocomplete="off">'+
    '<div class="gc-row"><div><label>Student ID</label><input id="gc-user" type="text" value="'+esc(S.user||'')+'" autocomplete="username"></div><div><label>StudentVUE password</label><input id="gc-pass" type="password" autocomplete="current-password"></div></div>'+
    (S.err?'<p class="gc-err">'+esc(S.err)+'</p>':'')+
    '<div class="gc-actions"><button class="btn btn-primary" id="gc-go" type="button"'+(S.busy?' disabled':'')+'>'+(S.busy?'Signing in…':'Import my grades')+'</button> <button class="btn btn-ghost" id="gc-manual" type="button">Enter my grades by hand</button></div>'+privacy()+'</div>';
}
function classCard(c,i){
  var p=projected(i), ch=changed(i), orig=c.percent;
  return '<button type="button" class="gc-class" data-c="'+i+'"><div class="gc-class-top"><span class="gc-per">P'+esc(c.period||'?')+'</span><span class="gc-teacher">'+esc(c.teacher)+'</span></div>'+
    '<h4>'+esc(c.title)+'</h4><div class="gc-class-grade"><b>'+fmt(p!=null?p:orig)+'</b><span class="gc-letter">'+letter(p!=null?p:orig)+'</span></div>'+
    (ch&&orig!=null&&p!=null?'<div class="gc-delta '+(p>=orig?'up':'down')+'">'+(p>=orig?'+':'')+(Math.round((p-orig)*100)/100)+' from '+fmt(orig)+'</div>':'<div class="gc-delta">'+(c.assignments.length)+' assignments</div>')+'</button>';
}
function listView(){
  var d=S.data, per=d.period?d.period.name:'';
  var opts=(d.periods||[]).map(function(p){ return '<option value="'+p.index+'"'+(p.name===per?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('');
  var gpa=d.courses.map(function(c,i){return projected(i);}).filter(function(x){return x!=null;});
  var avg=gpa.length?gpa.reduce(function(a,b){return a+b;},0)/gpa.length:null;
  var head=d.manual?'<div class="gc-bar"><div><b>My classes</b><span class="gc-muted"> · entered by hand, saved in this browser</span></div><div class="gc-bar-r"><button class="btn btn-primary btn-sm" id="gc-addclass" type="button">'+ic('plus',14)+' Add a class</button><button class="btn btn-ghost btn-sm" id="gc-out" type="button">Clear all</button></div></div>'+(S.addingClass?classForm():''):
    '<div class="gc-bar"><div><b>'+esc(per||'Current grading period')+'</b><span class="gc-muted"> · updated '+new Date(d.fetchedAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</span></div>'+
    '<div class="gc-bar-r">'+(opts?'<select id="gc-period" aria-label="Grading period">'+opts+'</select>':'')+'<button class="btn btn-ghost btn-sm" id="gc-refresh" type="button">'+ic('refresh-cw',14)+' Refresh</button><button class="btn btn-ghost btn-sm" id="gc-out" type="button">Disconnect</button></div></div>';
  return head+
    (S.needPass?passForm():'')+
    '<div class="gc-sum"><div><span>Classes</span><b>'+d.courses.length+'</b></div><div><span>Average (projected)</span><b>'+fmt(avg)+'</b></div></div>'+
    (d.courses.length?'':'<div class="gc-card"><b>No classes yet.</b><p class="gc-sub">Press "Add a class" to start. Add each assignment with the score you got, then change scores to see what happens.</p></div>')+'<div class="gc-grid">'+d.courses.map(classCard).join('')+'</div>'+(S.err?'<p class="gc-err">'+esc(S.err)+'</p>':'');
}
function classForm(){
  return '<div class="gc-card"><h4>New class</h4><div class="gc-row"><div><label>Class name</label><input id="gc-cn" type="text" maxlength="40" placeholder="e.g. English 9"></div><div><label>Categories and weights (optional)</label><input id="gc-cc" type="text" maxlength="120" placeholder="Homework 30, Tests 70"></div></div>'+
    '<p class="gc-hint">Leave categories empty if your class is graded on total points. Weights are percentages, for example "Homework 20, Quizzes 30, Tests 50".</p><div class="gc-actions"><button class="btn btn-primary" id="gc-cs" type="button">Create class</button> <button class="btn btn-ghost" id="gc-cx" type="button">Cancel</button></div></div>';
}
function passForm(){
  return '<div class="gc-card gc-pass"><b>'+(S.needPass.label||'Sign in again')+'</b><p class="gc-sub">Your password is not saved, so StudentVUE needs it each time you refresh.</p>'+
    '<div class="gc-inline"><input id="gc-pass2" type="password" placeholder="StudentVUE password" autocomplete="current-password"><button class="btn btn-primary" id="gc-pass-go" type="button"'+(S.busy?' disabled':'')+'>'+(S.busy?'Loading…':'Continue')+'</button><button class="btn btn-ghost" id="gc-pass-x" type="button">Cancel</button></div></div>';
}
function numIn(cls,id,val,ph){ return '<input type="number" step="any" min="0" class="'+cls+'" data-a="'+esc(id)+'" value="'+(val==null?'':val)+'" placeholder="'+(ph||'')+'">'; }
function detailView(ci){
  var c=S.data.courses[ci], k=ckey(ci), ed=S.edits[k]||{}, add=S.added[k]||[];
  var rows=c.assignments.map(function(a){
    var e=ed[a.id]||{}, earned=e.earned!==undefined?e.earned:a.earned, poss=e.possible!==undefined?e.possible:a.possible, ex=e.excluded!==undefined?e.excluded:a.excluded;
    var dirty=!!ed[a.id];
    return '<div class="gc-as'+(ex?' off':'')+(dirty?' dirty':'')+(a.earned==null?' ungraded':'')+'" data-id="'+esc(a.id)+'"><div class="gc-as-n"><b>'+esc(a.name)+'</b><span>'+esc(a.category)+(a.due?' · due '+esc(a.due):'')+(a.earned==null?' · not graded yet':'')+'</span></div>'+
      '<div class="gc-as-s">'+numIn('gc-e','e:'+a.id,earned,'–')+'<span>/</span>'+numIn('gc-p','p:'+a.id,poss,'pts')+'</div>'+
      '<div class="gc-as-b"><button type="button" class="gc-ic" data-tog="'+esc(a.id)+'" title="'+(ex?'Count this assignment':'Do not count this assignment')+'">'+ic(ex?'eye-off':'eye',16)+'</button>'+(c.manual?'<button type="button" class="gc-ic" data-delreal="'+esc(a.id)+'" title="Delete assignment">'+ic('trash-2',15)+'</button>':'')+(dirty?'<button type="button" class="gc-ic" data-rev="'+esc(a.id)+'" title="Undo changes">'+ic('rotate-ccw',15)+'</button>':'')+'</div></div>';
  }).join('');
  var addRows=add.map(function(a,i){
    return '<div class="gc-as dirty added" data-add="'+i+'"><div class="gc-as-n"><b>'+esc(a.name)+'</b><span>'+esc(a.category||'New assignment')+' · what-if</span></div><div class="gc-as-s">'+numIn('gc-e','ae:'+i,a.earned,'–')+'<span>/</span>'+numIn('gc-p','ap:'+i,a.possible,'pts')+'</div><div class="gc-as-b"><button type="button" class="gc-ic" data-del="'+i+'" title="Remove">'+ic('trash-2',15)+'</button></div></div>';
  }).join('');
  var catOpts=c.categories.map(function(x){return '<option>'+esc(x.name)+'</option>';}).join('')||'<option value="">All assignments</option>';
  return '<button type="button" class="gc-back" id="gc-back">'+ic('chevron-left',16)+' All classes</button>'+
   '<div class="gc-head"><div><span class="gc-per">P'+esc(c.period)+' · '+esc(c.teacher)+'</span><h3>'+esc(c.title)+'</h3></div><div class="gc-big" id="gc-big"></div></div>'+
   '<div class="gc-cols"><div><div class="gc-card"><div class="gc-card-h"><h4>Assignments</h4><div>'+(c.manual?'<button class="btn btn-ghost btn-sm" id="gc-delclass" type="button">'+ic('trash-2',14)+' Delete class</button> ':'')+'<button class="btn btn-ghost btn-sm" id="gc-reset" type="button">'+ic('rotate-ccw',14)+' Reset changes</button></div></div><p class="gc-hint">Change a score, or fill in an empty one, to see what it does. The eye icon leaves an assignment out.</p><div class="gc-list">'+(addRows+rows||'<p class="gc-hint">No assignments in this grading period yet.</p>')+'</div>'+
   '<div class="gc-addbox"><b>'+(c.manual?'Add an assignment':'Add a what-if assignment')+'</b><div class="gc-addrow"><input id="gc-an" type="text" placeholder="Name (e.g. Final exam)" maxlength="40"><select id="gc-ac">'+catOpts+'</select><input id="gc-ae" type="number" step="any" min="0" placeholder="Score"><input id="gc-ap" type="number" step="any" min="0" placeholder="Out of"><button class="btn btn-primary" id="gc-add" type="button">'+ic('plus',15)+' Add</button></div></div></div></div>'+
   '<div><div class="gc-card"><h4>Categories</h4><div id="gc-cats"></div></div>'+
   '<div class="gc-card"><h4>What do I need?</h4><p class="gc-hint">Find the score you need on an upcoming assignment to reach a goal.</p><div class="gc-need"><div><label>Goal grade</label><input id="gc-goal" type="number" step="any" value="90" min="0" max="200"></div><div><label>Category</label><select id="gc-nc">'+catOpts+'</select></div><div><label>Worth (points)</label><input id="gc-np" type="number" step="any" value="50" min="1"></div></div><div id="gc-needout" class="gc-needout"></div></div></div></div>';
}
function updateDetail(ci){
  var c=S.data.courses[ci], p=projected(ci), orig=c.percent, big=$('#gc-big'); if(!big) return;
  var ch=changed(ci);
  big.innerHTML='<div class="gc-now"><b>'+fmt(p)+'</b><span class="gc-letter">'+letter(p)+'</span></div>'+(ch&&orig!=null&&p!=null?'<div class="gc-delta '+(p>=orig?'up':'down')+'">'+(p>=orig?'▲ +':'▼ ')+(Math.round((p-orig)*100)/100)+' vs '+fmt(orig)+' ('+(c.letter||letter(orig))+')</div>':(c.manual?'<div class="gc-delta">Worked out from the assignments you entered</div>':'<div class="gc-delta">StudentVUE: '+fmt(orig)+(c.letter?' ('+esc(c.letter)+')':'')+'</div>'));
  var cs=$('#gc-cats'); if(cs){
    var st=catStats(c,itemsFor(ci,true));
    cs.innerHTML=c.weighted?st.map(function(x){ return '<div class="gc-cat"><div><b>'+esc(x.name)+'</b><span>'+x.weight+'% of grade</span></div><div class="gc-cat-v">'+fmt(x.pct)+'<span>'+(Math.round(x.earned*100)/100)+' / '+(Math.round(x.possible*100)/100)+'</span></div><i style="width:'+Math.max(0,Math.min(100,x.pct||0))+'%"></i></div>'; }).join(''):'<p class="gc-hint">This class is graded on total points.</p>';
  }
  needOut(ci);
}
function needOut(ci){
  var out=$('#gc-needout'); if(!out) return;
  var c=S.data.courses[ci], goal=parseFloat($('#gc-goal').value), worth=parseFloat($('#gc-np').value), cat=$('#gc-nc').value;
  if(!isFinite(goal)||!isFinite(worth)||worth<=0){ out.textContent=''; return; }
  var base=itemsFor(ci,true), orig=c.percent, ref=calc(c,itemsFor(ci,false));
  function proj(x){ var b=calc(c,base.concat([{category:cat,earned:x,possible:worth}])), a=calc(c,base); if(b==null) return null; var cur=projected(ci); return (cur!=null&&a!=null)?cur+(b-a):b; }
  var lo=0,hi=worth*3, pLo=proj(0), pHi=proj(hi);
  if(pLo==null){ out.textContent='Add at least one graded assignment first.'; return; }
  if(pLo>=goal){ out.innerHTML='<b>You are already there.</b> Even a 0 keeps you at '+fmt(pLo)+'.'; out.className='gc-needout good'; return; }
  if(pHi<goal){ out.innerHTML='<b>Out of reach</b> with just this one assignment: even a perfect score gets you to '+fmt(proj(worth))+'.'; out.className='gc-needout bad'; return; }
  for(var i=0;i<40;i++){ var mid=(lo+hi)/2; if(proj(mid)>=goal) hi=mid; else lo=mid; }
  var need=Math.ceil(hi*100)/100, pct=need/worth*100;
  out.className='gc-needout '+(need>worth?'bad':'good');
  out.innerHTML=need>worth?'<b>Out of reach</b> with this assignment: you would need '+need+' / '+worth+' ('+Math.round(pct)+'%).':'<b>You need '+need+' / '+worth+'</b> ('+Math.round(pct*10)/10+'%) to finish at '+fmt(goal)+'.';
}
function render(){
  var r=root(); if(!r) return;
  var inner;
  if(!state.account){ inner='<div class="gc-card"><h3>Sign in to use the grade calculator</h3><p class="gc-sub">The calculator keeps your imported grades with your Index account on this device.</p><button class="btn btn-primary" data-action="open-signin" type="button" id="gc-signin">Sign in</button></div>'; }
  else if(!S.data) inner=connectView();
  else if(S.open>=0&&S.data.courses[S.open]) inner=detailView(S.open);
  else inner=listView();
  var keep=document.activeElement&&document.activeElement.id;
  r.innerHTML='<div class="gc-wrap"><div class="gc-title"><h2>Grade calculator</h2><p>Import your classes from StudentVUE, then change scores to see how your grades would move.</p></div>'+inner+'</div>';
  if(S.data&&S.open>=0) updateDetail(S.open);
  if(keep&&$('#'+keep)) try{ $('#'+keep).focus(); }catch(e){}
}

/* ---------- events ---------- */
function setEdit(ci,id,field,val){
  var k=ckey(ci); S.edits[k]=S.edits[k]||{}; var e=S.edits[k][id]=S.edits[k][id]||{};
  e[field]=val; var a=S.data.courses[ci].assignments.filter(function(x){return x.id===id;})[0];
  if(a&&e.earned===a.earned&&e.possible===a.possible&&e.excluded===a.excluded) delete S.edits[k][id];
  if(a){ ['earned','possible','excluded'].forEach(function(f){ if(e[f]!==undefined&&e[f]===a[f]) delete e[f]; }); if(!Object.keys(e).length) delete S.edits[k][id]; }
  save();
}
function wire(){
  var r=root(); if(!r||r.__gc) return; r.__gc=true;
  r.addEventListener('click',function(ev){
    var t=ev.target, b;
    if(t.closest('#gc-signin')){ try{ openSignin(); }catch(e){} return; }
    if(t.closest('#gc-find')){ var z=$('#gc-zip').value; post('/api/studentvue/districts',{zip:z}).then(function(d){ S.districts=d.districts||[]; S.err=''; }).catch(function(e){ S.err=e.message; S.districts=null; }).then(function(){ var u=$('#gc-user')&&$('#gc-user').value; render(); if(u&&$('#gc-user')) $('#gc-user').value=u; }); return; }
    if((b=t.closest('[data-d]'))){ var d=S.districts[+b.dataset.d]; S.url=d.url; var u2=$('#gc-user')&&$('#gc-user').value; render(); if($('#gc-user')) $('#gc-user').value=u2||''; return; }
    if(t.closest('#gc-go')){ var url=$('#gc-url').value.trim(), us=$('#gc-user').value.trim(), pw=$('#gc-pass').value; if(!url||!us||!pw){ S.err='Fill in the address, Student ID and password.'; S.url=url; S.user=us; render(); return; } connect(url,us,pw); return; }
    if(t.closest('#gc-manual')){ S.data={manual:true,fetchedAt:Date.now(),periods:[],period:{name:'My classes'},courses:[]}; S.err=''; S.open=-1; save(); render(); return; }
    if(t.closest('#gc-addclass')){ S.addingClass=true; render(); var n=$('#gc-cn'); if(n) n.focus(); return; }
    if(t.closest('#gc-cx')){ S.addingClass=false; render(); return; }
    if(t.closest('#gc-cs')){
      var nm=$('#gc-cn').value.trim(); if(!nm){ $('#gc-cn').focus(); return; }
      var cats=($('#gc-cc').value||'').split(',').map(function(x){ var m=/^\s*(.+?)\s+(\d+(?:\.\d+)?)\s*%?\s*$/.exec(x); return m?{name:m[1],weight:parseFloat(m[2])}:null; }).filter(Boolean).slice(0,8);
      S.data.courses.push({title:nm,rawTitle:nm,period:'',room:'',teacher:'',mark:'',letter:'',percent:null,categories:cats,weighted:cats.length>1,assignments:[],totalPoints:null,manual:true});
      S.addingClass=false; S.open=S.data.courses.length-1; save(); render(); return;
    }
    if(t.closest('#gc-out')){ if(confirm(S.data&&S.data.manual?'Remove all the classes you entered from this browser?':'Disconnect StudentVUE and remove the imported grades from this browser?')){ forget(); render(); } return; }
    if(t.closest('#gc-refresh')){ S.needPass={label:'Refresh your grades'}; S.needPass.period=null; render(); return; }
    if(t.closest('#gc-pass-x')){ S.needPass=null; render(); return; }
    if(t.closest('#gc-pass-go')){ var p2=$('#gc-pass2').value; if(p2) connect(S.url,S.user,p2,S.needPass.period); return; }
    if((b=t.closest('[data-c]'))){ S.open=+b.dataset.c; render(); window.scrollTo(0,0); return; }
    if(t.closest('#gc-back')){ S.open=-1; render(); return; }
    if(S.open<0) return;
    var ci=S.open,k=ckey(ci);
    if((b=t.closest('[data-tog]'))){ var a=S.data.courses[ci].assignments.filter(function(x){return x.id===b.dataset.tog;})[0], cur=(S.edits[k]&&S.edits[k][a.id]&&S.edits[k][a.id].excluded!==undefined)?S.edits[k][a.id].excluded:a.excluded; setEdit(ci,a.id,'excluded',!cur); render(); return; }
    if((b=t.closest('[data-rev]'))){ if(S.edits[k]) delete S.edits[k][b.dataset.rev]; save(); render(); return; }
    if((b=t.closest('[data-del]'))){ (S.added[k]||[]).splice(+b.dataset.del,1); save(); render(); return; }
    if((b=t.closest('[data-delreal]'))){ var cc=S.data.courses[ci]; cc.assignments=cc.assignments.filter(function(x){return x.id!==b.dataset.delreal;}); if(S.edits[k]) delete S.edits[k][b.dataset.delreal]; save(); render(); return; }
    if(t.closest('#gc-delclass')){ if(confirm('Delete this class?')){ S.data.courses.splice(ci,1); S.edits={}; S.added={}; S.open=-1; save(); render(); } return; }
    if(t.closest('#gc-reset')){ delete S.edits[k]; delete S.added[k]; save(); render(); return; }
    if(t.closest('#gc-add')){
      var e=parseFloat($('#gc-ae').value), p=parseFloat($('#gc-ap').value);
      if(!isFinite(e)||!isFinite(p)||p<0||e<0){ $('#gc-ae').focus(); return; }
      var item={id:(S.data.courses[ci].manual?'m':'x')+Date.now(),name:$('#gc-an').value.trim()||(S.data.courses[ci].manual?'Assignment':'What-if assignment'),category:$('#gc-ac').value,earned:e,possible:p,excluded:false,date:'',due:''};
      if(S.data.courses[ci].manual) S.data.courses[ci].assignments.push(item); else (S.added[k]=S.added[k]||[]).push(item);
      save(); render();
    }
  });
  r.addEventListener('change',function(ev){
    if(ev.target.id==='gc-period'){ S.needPass={label:'Load '+ev.target.options[ev.target.selectedIndex].text,period:+ev.target.value}; render(); }
  });
  r.addEventListener('input',function(ev){
    var t=ev.target; if(S.open<0||!S.data) return; var ci=S.open,k=ckey(ci);
    if(t.id==='gc-goal'||t.id==='gc-np'||t.id==='gc-nc'){ needOut(ci); return; }
    var a=t.dataset&&t.dataset.a; if(!a) return;
    var v=t.value===''?null:parseFloat(t.value); if(t.value!==''&&!isFinite(v)) return;
    var parts=a.split(':'), kind=parts[0], id=parts.slice(1).join(':');
    if(kind==='e'||kind==='p'){ setEdit(ci,id,kind==='e'?'earned':'possible',v); }
    else{ var item=(S.added[k]||[])[+id]; if(item){ item[kind==='ae'?'earned':'possible']=v; save(); } }
    var row=t.closest('.gc-as'); if(row){ row.classList.add('dirty'); }
    updateDetail(ci);
  });
}
/* ---------- boot ---------- */
var css=document.createElement('link'); css.rel='stylesheet'; css.href='/grade-calc.css?v=2'; document.head.appendChild(css);
function ensure(){
  var main=document.querySelector('.main'), nav=document.getElementById('nav'); if(!main||!nav) return false;
  if(!$('#view-grades')){ var sec=document.createElement('section'); sec.className='view'; sec.id='view-grades'; var foot=main.querySelector('.app-footer'); if(foot&&foot.parentNode) foot.parentNode.insertBefore(sec,foot); else main.appendChild(sec); }
  if(!nav.querySelector('[data-view="grades"]')){
    var b=document.createElement('button'); b.className='nav-btn'; b.type='button'; b.dataset.view='grades'; b.innerHTML='<span class="ix-nav">'+ic('calculator',19)+'</span><span>Grades</span>';
    var after=nav.querySelector('[data-view="courses"]'); nav.insertBefore(b,after?after.nextSibling:null);
  }
  wire(); return true;
}
document.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('.nav-btn[data-view="grades"]'); if(!b) return;
  ensure(); load(); render();
},true);
var tries=0, iv=setInterval(function(){ tries++; if(ensure()){ clearInterval(iv); load(); } if(tries>80) clearInterval(iv); },300);
})();
