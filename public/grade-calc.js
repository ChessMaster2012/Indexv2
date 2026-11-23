/* Grade Calculator: import classes from StudentVUE, then change scores / add assignments to see the effect. */
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s);};
function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function ic(n,s){ try{ return IX.icon(n,s||16); }catch(e){ return ''; } }
function acct(){ try{ return (state.account&&(state.account.id||state.account.username))||'guest'; }catch(e){ return 'guest'; } }
var KEY=function(){return 'index-grades-v1:'+acct();};
var S={cstate:'',cdist:null,showAddr:false,data:null,url:'',user:'',edits:{},added:{},open:-1,busy:false,err:'',districts:null,needPass:null};

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
function keepOn(){ try{ var el=$('#gc-keep'); if(el) return !!el.checked; }catch(e){} return localStorage.getItem('index-grades-keep')!=='0'; }
function post(path,body){
  return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}).then(function(r){
    return r.json().catch(function(){return {};}).then(function(d){ if(!r.ok) throw new Error(d.error||'Something went wrong.'); return d; });
  });
}
function connect(url,user,pass,period){
  var keep=keepOn(); try{ localStorage.setItem('index-grades-keep',keep?'1':'0'); }catch(e){}
  S.busy=true; S.err=''; render();
  return post('/api/studentvue/gradebook',{url:url,username:user,password:pass,period:period==null?'':period}).then(function(d){
    var samePeriod=S.data&&S.data.period&&d.period&&S.data.period.name===d.period.name;
    S.data=d; S.url=url; S.user=user; if(!samePeriod){ S.edits=S.edits; } S.open=(S.open>=0&&d.courses&&S.open<d.courses.length)?S.open:-1; S.needPass=null; save(); if(keep) post('/api/studentvue/remember',{url:url,username:user,password:pass}).catch(function(){});
  }).catch(function(e){ S.err=e.message; }).then(function(){ S.busy=false; render(); });
}

/* ---------- views ---------- */
function root(){ return $('#view-grades'); }
function privacy(){ return '<p class="gc-priv">'+ic('lock',14)+' Your StudentVUE password is sent straight to your school\'s StudentVUE site and is never saved. Your grades stay in this browser, not on Index\'s servers.</p>'; }
function connectView(){
  if(/switched off/.test(S.err||'')) return '<div class="gc-card gc-connect"><h3>StudentVUE import is unavailable</h3><p class="gc-sub">StudentVUE has turned off the connection that outside tools use, so Index cannot pull your grades in right now. You can still use the calculator by entering your classes and scores yourself.</p><div class="gc-actions"><button class="btn btn-primary" id="gc-manual" type="button">Enter my grades by hand</button></div></div>';
  var cid=''; try{ cid=(typeof state!=='undefined'&&state&&state.county)||''; }catch(e){}
  if(cid&&cid!=='other'&&!S.cstate){ S.cstate='loading'; post('/api/studentvue/county',{county:cid}).then(function(d){ if(d.found&&d.district){ S.cdist=d.district; S.url=d.district.url; S.cstate='found'; } else S.cstate='none'; }).catch(function(){ S.cstate='none'; }).then(function(){ if(!S.data) { var u=$('#gc-user')&&$('#gc-user').value; render(); if(u&&$('#gc-user')) $('#gc-user').value=u; } }); }
  var auto=S.cstate==='found'&&S.cdist&&!S.showAddr;
  var ds=S.districts?(S.districts.length?'<div class="gc-dlist">'+S.districts.map(function(d,i){ return '<button type="button" class="gc-d" data-d="'+i+'">'+esc(d.name)+'</button>'; }).join('')+'</div>':'<p class="gc-hint">No districts found for that ZIP. Paste your StudentVUE address below.</p>'):'';
  var where=auto?'<div class="gc-where"><div><span>Your school district</span><b>'+esc(S.cdist.name)+'</b></div><button type="button" class="btn btn-ghost btn-sm" id="gc-chg">Not right?</button></div>':
    S.cstate==='loading'?'<p class="gc-hint">Finding your school district…</p>':
    (S.cstate==='none'&&!S.showAddr?'<p class="gc-hint">We could not find your county\'s StudentVUE automatically, so look it up by ZIP below.</p>':'')+
    '<div class="gc-row"><div><label>Find your school district by ZIP</label><div class="gc-inline"><input id="gc-zip" inputmode="numeric" maxlength="5" placeholder="ZIP code"><button class="btn btn-ghost" id="gc-find" type="button">Find</button></div></div></div>'+ds+
    '<label>StudentVUE address</label><input id="gc-url" type="text" placeholder="https://md-mcps-psv.edupoint.com" value="'+esc(S.url||'')+'" autocomplete="off">';
  return '<div class="gc-card gc-connect"><h3>Connect StudentVUE</h3><p class="gc-sub">Sign in once to pull in your classes and assignments. Then change any score to see what would happen to your grade.</p>'+where+
    '<div class="gc-row"><div><label>Student ID</label><input id="gc-user" type="text" value="'+esc(S.user||'')+'" autocomplete="off" inputmode="numeric" placeholder="6 or 8 digit ID"></div><div><label>StudentVUE password</label><input id="gc-pass" type="password" autocomplete="current-password"></div></div>'+
    '<label class="gc-keep"><input type="checkbox" id="gc-keep" '+(localStorage.getItem('index-grades-keep')!=='0'?'checked':'')+'> Keep me connected so my grades load fresh every time I open this tab <span class="gc-muted">(your login is stored encrypted on the Index server; you can turn this off anytime with Disconnect)</span></label>'+
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
    (S.auto?'<div class="gc-card"><b>Loading your latest grades…</b></div>':'')+(S.needPass?passForm():'')+
    '<div class="gc-sum"><div><span>Classes</span><b>'+d.courses.length+'</b></div><div><span>Average (projected)</span><b>'+fmt(avg)+'</b></div></div>'+
    (d.courses.length?'':'<div class="gc-card"><b>No classes yet.</b><p class="gc-sub">Press "Add a class" to start. Add each assignment with the score you got, then change scores to see what happens.</p></div>')+'<div class="gc-grid">'+d.courses.map(classCard).join('')+'</div>'+(S.err?'<p class="gc-err">'+esc(S.err)+'</p>':'');
}
function classForm(){
  return '<div class="gc-card"><h4>New class</h4><div class="gc-row"><div><label>Class name</label><input id="gc-cn" type="text" maxlength="40" placeholder="e.g. English 9"></div><div><label>Categories and weights (optional)</label><input id="gc-cc" type="text" maxlength="120" placeholder="Homework 30, Tests 70"></div></div>'+
    '<p class="gc-hint">Leave categories empty if your class is graded on total points. Weights are percentages, for example "Homework 20, Quizzes 30, Tests 50".</p><div class="gc-actions"><button class="btn btn-primary" id="gc-cs" type="button">Create class</button> <button class="btn btn-ghost" id="gc-cx" type="button">Cancel</button></div></div>';
}
function passForm(){
  var n=S.needPass||{}, when=S.data&&S.data.fetchedAt?new Date(S.data.fetchedAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
  var sub=n.fresh?'Sign in once to load the latest from StudentVUE'+(when?' (saved grades from '+esc(when)+' are shown below)':'')+'. Tick "Keep me connected" and this tab will load fresh grades by itself from now on.':'Your password is not saved, so StudentVUE needs it each time you refresh.';
  return '<form class="gc-card gc-pass" id="gc-passform" onsubmit="return false"><b>'+(n.label||'Sign in again')+'</b><p class="gc-sub">'+sub+'</p>'+
    '<input type="text" name="username" value="'+esc(S.user||'')+'" autocomplete="username" readonly hidden>'+
    '<div class="gc-inline"><input id="gc-pass2" type="password" placeholder="StudentVUE password" autocomplete="current-password"><button class="btn btn-primary" id="gc-pass-go" type="submit"'+(S.busy?' disabled':'')+'>'+(S.busy?'Loading…':(n.fresh?'Load fresh grades':'Continue'))+'</button><button class="btn btn-ghost" id="gc-pass-x" type="button">'+(n.fresh?'Keep saved':'Cancel')+'</button></div>'+'<label class="gc-keep"><input type="checkbox" id="gc-keep" '+(localStorage.getItem('index-grades-keep')!=='0'?'checked':'')+'> Keep me connected so my grades load fresh every time I open this tab <span class="gc-muted">(your login is stored encrypted on the Index server; you can turn this off anytime with Disconnect)</span></label>'+'</form>';
}
function render(){
  var r=root(); if(!r) return;
  var inner;
  if(!state.account){ inner='<div class="gc-card"><h3>Sign in to use the grade calculator</h3><p class="gc-sub">The calculator keeps your imported grades with your Index account on this device.</p><button class="btn btn-primary" data-action="open-signin" type="button" id="gc-signin">Sign in</button></div>'; }
  else if(!S.data) inner=S.auto?'<div class="gc-card"><b>Loading your grades…</b></div>':connectView();
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
    if(t.closest('#gc-go')){ var url=($('#gc-url')?$('#gc-url').value.trim():S.url), us=$('#gc-user').value.trim(), pw=$('#gc-pass').value; if(!url||!us||!pw){ S.err='Fill in the address, Student ID and password.'; S.url=url; S.user=us; render(); return; } connect(url,us,pw); return; }
    if(t.closest('#gc-chg')){ S.showAddr=true; var u3=$('#gc-user')&&$('#gc-user').value; render(); if(u3&&$('#gc-user')) $('#gc-user').value=u3; return; }
    if(t.closest('#gc-manual')){ S.data={manual:true,fetchedAt:Date.now(),periods:[],period:{name:'My classes'},courses:[]}; S.err=''; S.open=-1; save(); render(); return; }
    if(t.closest('#gc-addclass')){ S.addingClass=true; render(); var n=$('#gc-cn'); if(n) n.focus(); return; }
    if(t.closest('#gc-cx')){ S.addingClass=false; render(); return; }
    if(t.closest('#gc-cs')){
      var nm=$('#gc-cn').value.trim(); if(!nm){ $('#gc-cn').focus(); return; }
      var cats=($('#gc-cc').value||'').split(',').map(function(x){ var m=/^\s*(.+?)\s+(\d+(?:\.\d+)?)\s*%?\s*$/.exec(x); return m?{name:m[1],weight:parseFloat(m[2])}:null; }).filter(Boolean).slice(0,8);
      S.data.courses.push({title:nm,rawTitle:nm,period:'',room:'',teacher:'',mark:'',letter:'',percent:null,categories:cats,weighted:cats.length>1,assignments:[],totalPoints:null,manual:true});
      S.addingClass=false; S.open=S.data.courses.length-1; save(); render(); return;
    }
    if(t.closest('#gc-out')){ if(confirm(S.data&&S.data.manual?'Remove all the classes you entered from this browser?':'Disconnect StudentVUE and remove the imported grades from this browser?')){ if(!(S.data&&S.data.manual)) fetch('/api/studentvue/remember',{method:'DELETE',credentials:'same-origin'}).catch(function(){}); forget(); render(); } return; }
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
    if(t.closest('#gc-addtoggle')){
      var cm=S.data.courses[ci];
      if(cm.manual||isGold()){ S.addOpen=!S.addOpen; S.goldNote=false; render(); var an=$('#gc-an'); if(an) an.focus(); }
      else { S.goldNote=!S.goldNote; render(); }
      return;
    }
    if(t.closest('#gc-gold-x')){ S.goldNote=false; render(); return; }
    if(t.closest('#gc-gold-go')){ try{ if(typeof openMembership==='function') openMembership(); else if(typeof switchView==='function') switchView('membership'); }catch(e){} return; }
    if(t.closest('#gc-reset')){ delete S.edits[k]; delete S.added[k]; save(); render(); return; }
    if(t.closest('#gc-add')){
      if(!S.data.courses[ci].manual&&!isGold()){ S.goldNote=true; S.addOpen=false; render(); return; }
      var e=parseFloat($('#gc-ae').value), p=parseFloat($('#gc-ap').value);
      if(!isFinite(e)||!isFinite(p)||p<0||e<0){ $('#gc-ae').focus(); return; }
      var item={id:(S.data.courses[ci].manual?'m':'x')+Date.now(),name:$('#gc-an').value.trim()||(S.data.courses[ci].manual?'Assignment':'What-if assignment'),category:$('#gc-ac').value,earned:e,possible:p,excluded:false,date:'',due:''};
      if(S.data.courses[ci].manual) S.data.courses[ci].assignments.push(item); else (S.added[k]=S.added[k]||[]).push(item);
      S.addOpen=false; save(); render();
    }
  });
  r.addEventListener('change',function(ev){
    if(ev.target.id==='gc-period'){ S.needPass={label:'Load '+ev.target.options[ev.target.selectedIndex].text,period:+ev.target.value}; render(); }
  });
  r.addEventListener('input',function(ev){
    var t=ev.target; if(S.open<0||!S.data) return; var ci=S.open,k=ckey(ci);
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
var css=document.createElement('link'); css.rel='stylesheet'; css.href='/grade-calc.css?v=5'; document.head.appendChild(css);
function ensure(){
  var main=document.querySelector('.main'), nav=document.getElementById('nav'); if(!main||!nav) return false;
  if(!$('#view-grades')){ var sec=document.createElement('section'); sec.className='view'; sec.id='view-grades'; var foot=main.querySelector('.app-footer'); if(foot&&foot.parentNode) foot.parentNode.insertBefore(sec,foot); else main.appendChild(sec); }
  if(!nav.querySelector('[data-view="grades"]')){
    var b=document.createElement('button'); b.className='nav-btn'; b.type='button'; b.dataset.view='grades'; b.innerHTML='<span class="ix-nav">'+ic('calculator',19)+'</span><span>Grades</span>';
    var after=nav.querySelector('[data-view="courses"]'); nav.insertBefore(b,after?after.nextSibling:null);
  }
  wire(); return true;
}
/* Every time the Grades tab is opened, saved grades show instantly and a fresh load from StudentVUE is requested (the password is never stored). */
function autoLoad(){
  S.auto=true; S.err=''; render();
  return post('/api/studentvue/auto',{period:null}).then(function(d){
    if(d&&d.ok){ var keepEdits=S.edits, keepAdded=S.added; S.data=d; S.url=d.url||S.url; S.user=d.user||S.user; S.edits=keepEdits||{}; S.added=keepAdded||{}; S.needPass=null; S.open=(S.open>=0&&d.courses&&S.open<d.courses.length)?S.open:-1; save(); }
    else if(S.data&&!S.data.manual&&S.url&&S.user) S.needPass={label:'Load your latest grades',fresh:true,period:null};
  }).catch(function(e){ S.err=e.message; if(S.data&&!S.data.manual&&S.url&&S.user) S.needPass={label:'Sign in again to load your latest grades',fresh:true,period:null}; }).then(function(){ S.auto=false; render(); });
}
function onOpen(){
  ensure(); load();
  if(!state.account||S.busy||S.auto) { render(); return; }
  if(S.data&&S.data.manual){ render(); return; }
  render(); autoLoad();
}
var lastView='';
setInterval(function(){ var v=''; try{ v=state.view; }catch(e){} if(v==='grades'&&lastView!=='grades') onOpen(); lastView=v; },250);
document.addEventListener('click',function(e){ var b=e.target.closest&&e.target.closest('.nav-btn[data-view="grades"]'); if(b) { ensure(); } },true);
var tries=0, iv=setInterval(function(){ tries++; if(ensure()){ clearInterval(iv); load(); } if(tries>80) clearInterval(iv); },300);
})();
