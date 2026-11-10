/* One county, everywhere.
   The county (state.county) is the single source of truth. The school district is derived from it, so the
   dashboard banner, district chip, Local Review link, account label, privacy/terms/contact links and the
   AI tutor can never disagree. Saving a county from any picker, signing in to an account, or changing it
   in another tab all go through CountySync.set / reconcile. */
(function(){
'use strict';
var safe=function(f,d){try{return f();}catch(e){return d;}};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var DATA=null, dataWaiters=[];

function jur(id){ return safe(function(){return LOCAL_JURISDICTIONS.filter(function(x){return x.id===id;})[0]||null;},null); }
function setup(){ return safe(function(){return getSetup();},null); }
function shortName(p){ return p.id==='other'?'Local':p.name.replace(', Maryland',''); }

/* ----- per-county data (policy, curriculum, graduation) ----- */
function loadData(){
  return fetch('/county-data.json?v='+(window.__countyDataV||1),{cache:'no-cache'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
    DATA=j&&j.counties?j:null; dataWaiters.splice(0).forEach(function(f){f(DATA);}); refresh(); return DATA;
  }).catch(function(){ DATA=null; return null; });
}
function entry(id){ return DATA&&DATA.counties&&DATA.counties[id]||null; }

/* ----- the one setter ----- */
function set(id,opts){
  opts=opts||{}; var p=jur(id); if(!p) return false;
  state.profile=state.profile||{};
  state.county=id; state.profile.county=id; state.profile.countyName=p.name;
  var dist;
  if(id==='other'){
    var custom=opts.custom!==undefined?String(opts.custom||'').trim().slice(0,120):(state.profile.customDistrict||'');
    state.profile.customDistrict=custom; dist=custom;
  }else{ dist=p.district; state.profile.customDistrict=''; }
  state.profile.district=dist; state.district=dist;
  safe(function(){
    localStorage.setItem('index-county',id);
    var prev=setup()||{};
    localStorage.setItem(SETUP_KEY,JSON.stringify({county:id,policyVersion:prev.policyVersion||SITE_TERMS_VERSION,noticeShownAt:prev.noticeShownAt||new Date().toISOString(),changedAt:new Date().toISOString()}));
  },0);
  if(opts.silent) safe(function(){persistProfileLocalOnly();},0); else safe(function(){persistProfile();},0);
  refresh();
  return true;
}

/* ----- bring every stored copy and every label into line ----- */
function currentId(){ return state.county||safe(function(){return state.profile.county;},'')||''; }
function reconcile(source){
  var id=null;
  if(source==='account'){
    var acc=safe(function(){return state.profile.county;},'');
    if(jur(acc)) id=acc;
    else{ var local=(setup()||{}).county||safe(function(){return localStorage.getItem('index-county');},''); if(jur(local)){ set(local); return; } }
  }else if(source==='storage'){
    id=safe(function(){return localStorage.getItem('index-county');},'');
  }else{
    var s=(setup()||{}).county, pc=safe(function(){return state.profile.county;},'');
    id=jur(s)?s:(jur(pc)?pc:null);
  }
  if(id&&jur(id)) set(id,{silent:true,custom:id==='other'?safe(function(){return state.profile.customDistrict;},''):undefined});
  else refresh();
}
function refresh(){
  var id=currentId(), p=jur(id);
  safe(function(){applyLocalJurisdictionUI();},0);
  if(!p) return;
  var dist=state.district||(id==='other'?'':p.district);
  var e=entry(id);
  /* text that names the county or district anywhere in the app */
  document.querySelectorAll('[data-county-name]').forEach(function(el){ el.textContent=p.name; });
  document.querySelectorAll('[data-county-short]').forEach(function(el){ el.textContent=shortName(p); });
  document.querySelectorAll('[data-county-district]').forEach(function(el){ el.textContent=dist||p.name; });
  var chip=document.getElementById('district-chip-text'); if(chip) chip.textContent=dist||p.name;
  var sub=document.getElementById('personal-subtitle'); if(sub) sub.textContent='Personalized for '+(dist||p.name)+'. Local policy, curriculum and review links match this county.';
  safe(function(){updateAccountCountyLabel();},0);
  var g=document.getElementById('gate-county'); if(g&&g.value!==id) g.value=id;
  document.querySelectorAll('a[href^="/mcps-review.html"]').forEach(function(a){ var h=a.getAttribute('href'); if(h.indexOf('#')<0) a.href='/mcps-review.html?county='+encodeURIComponent(id); });
  renderCards(p,e,dist);
  window.dispatchEvent(new CustomEvent('county-changed',{detail:{id:id,name:p.name,district:dist}}));
}

/* ----- "Your county" cards (dashboard + courses) ----- */
function linkRow(label,item,icon){
  if(!item||!item.url) return '';
  return '<a class="cty-link" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer"><span class="cty-ic">'+icon+'</span><span class="cty-lt"><b>'+esc(label)+'</b><small>'+esc(item.label||'Official page')+'</small></span><span class="cty-go" aria-hidden="true">↗</span></a>';
}
function cardHtml(p,e,dist,compact){
  var fact='';
  if(e&&e.graduation&&(e.graduation.credits||e.graduation.summary)){
    fact='<p class="cty-fact"><strong>Graduation:</strong> '+(e.graduation.credits?e.graduation.credits+' credits. ':'')+esc(e.graduation.summary||'')+'</p>';
  }
  var links=e?(linkRow('Program of Studies / course catalog',e.programOfStudies,'📚')+linkRow('Curriculum',e.curriculum,'🧭')+linkRow('Student code of conduct',e.conduct,'📘')+linkRow('Board policies',e.policies,'⚖️')+linkRow('Technology, privacy & AI use',e.tech,'🔒')+linkRow('Academic calendar',e.calendar,'🗓️')):'';
  if(!links) links='<p class="cty-fact">Official links for this selection are on the Local Review page.</p>';
  return '<div class="cty-head"><div><div class="cty-eyebrow">Your county</div><h3>'+esc(p.name)+'</h3><p>'+esc(dist||p.name)+'</p></div>'
    +'<div class="cty-actions"><a class="btn btn-primary btn-sm" href="/mcps-review.html?county='+encodeURIComponent(p.id)+'">Open local review</a><button type="button" class="btn btn-ghost btn-sm" data-action="open-district">Change county</button></div></div>'
    +(compact?'':fact)+'<div class="cty-links">'+links+'</div>'
    +'<p class="cty-note">Links go to your district’s own pages. Index does not speak for your district. Always follow your school’s current rules.</p>';
}
function renderCards(p,e,dist){
  ['cty-card-dash','cty-card-courses'].forEach(function(id){ var el=document.getElementById(id); if(el) el.innerHTML=cardHtml(p,e,dist,false); });
}
function mountCards(){
  var dash=document.getElementById('view-dashboard');
  if(dash&&!document.getElementById('cty-card-dash')){
    var d=document.createElement('section'); d.id='cty-card-dash'; d.className='cty-card';
    var banner=dash.querySelector('.personal-banner'); if(banner) banner.insertAdjacentElement('afterend',d); else { var anchor=dash.querySelector('.panel')||dash.firstElementChild; if(anchor) anchor.parentNode.insertBefore(d,anchor); else dash.appendChild(d); }
  }
  var courses=document.getElementById('view-courses');
  if(courses&&!document.getElementById('cty-card-courses')){
    var c=document.createElement('section'); c.id='cty-card-courses'; c.className='cty-card';
    var h=courses.firstElementChild; if(h&&h.nextSibling) courses.insertBefore(c,h.nextSibling); else courses.appendChild(c);
  }
}

/* ----- hook the existing pickers into the one setter ----- */
function otherField(){
  var box=document.getElementById('county-gate-other');
  if(!box){
    var opts=document.getElementById('county-gate-options'); if(!opts) return null;
    box=document.createElement('div'); box.id='county-gate-other'; box.hidden=true; box.className='cty-other';
    box.innerHTML='<label for="county-gate-other-input">Your school district (optional)</label><input id="county-gate-other-input" type="text" maxlength="120" placeholder="e.g. Fairfax County Public Schools" autocomplete="off">';
    opts.insertAdjacentElement('afterend',box);
  }
  return box;
}
function hook(){
  var _sel=window.selectCounty;
  if(typeof _sel==='function') window.selectCounty=function(id){ var out=_sel.apply(this,arguments); var b=otherField(); if(b){ b.hidden=id!=='other'; if(id==='other'){ var i=document.getElementById('county-gate-other-input'); if(i&&!i.value) i.value=safe(function(){return state.profile.customDistrict;},'')||''; } } return out; };
  var _show=window.showCountyGate;
  if(typeof _show==='function') window.showCountyGate=function(){ var out=_show.apply(this,arguments); var b=otherField(); if(b){ b.hidden=countyDraft!=='other'; var i=document.getElementById('county-gate-other-input'); if(i) i.value=safe(function(){return state.profile.customDistrict;},'')||''; } return out; };
  window.saveCounty=function(){
    var draft=safe(function(){return countyDraft;},''); if(!jur(draft)) return;
    var i=document.getElementById('county-gate-other-input');
    set(draft,{custom:draft==='other'&&i?i.value:undefined});
    safe(function(){hideCountyGate();},0);
  };
  /* the Save button holds its own reference to the old function, so intercept the click itself */
  var cb=document.getElementById('continue-county'); if(cb) cb.addEventListener('click',function(e){ e.stopImmediatePropagation(); e.preventDefault(); window.saveCounty(); },true);
  /* the old free-list "school district" picker is replaced by the county picker */
  window.openDistrict=function(){ safe(function(){showCountyGate();},0); };
  window.saveDistrict=function(){ safe(function(){showCountyGate();},0); };
  /* the first-visit gate: make a changed dropdown update everything it can reach */
  var g=document.getElementById('gate-county'); if(g) g.addEventListener('change',function(){ var id=g.value; if(jur(id)&&safe(function(){return hasCompletedSetup();},false)) set(id); });
  /* other tabs / windows */
  window.addEventListener('storage',function(e){ if(e.key==='index-county'||e.key===SETUP_KEY||e.key==='index-profile'){ safe(function(){state.profile=JSON.parse(localStorage.getItem('index-profile')||'{}');},0); reconcile('storage'); } });
}

window.CountySync={set:set,reconcile:reconcile,refresh:refresh,current:currentId,data:function(){return DATA;},entry:entry,whenReady:function(f){ if(DATA) f(DATA); else dataWaiters.push(f); }};
function start(){ hook(); mountCards(); reconcile('local'); loadData(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
