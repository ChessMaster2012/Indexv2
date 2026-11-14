/* First screen after "Continue to Index": sign in as a student or as a teacher.
   Shown once per browser (until the person picks something), never to people who are already signed in.
   The chosen role is saved on the account (state.role via AccountExtras) and teachers land on Live Game. */
(function(){
'use strict';
var SEEN='index-welcome-v1', ROLE='index-role', PEND='index-role-pending';
function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} return null; }
function gateOpen(){ var g=document.getElementById('site-gate'); return !!g&&!g.classList.contains('hidden'); }
function role(){ var r=ls(ROLE); return r==='teacher'||r==='student'?r:''; }
function tag(){ document.body.setAttribute('data-role',role()||''); }

function build(){
  var o=document.createElement('div'); o.id='welcome-gate'; o.setAttribute('role','dialog'); o.setAttribute('aria-modal','true'); o.setAttribute('aria-labelledby','wg-title');
  o.innerHTML=
   '<div class="wg-card"><div class="wg-logo">Index</div><h2 id="wg-title">Welcome! How are you using Index?</h2>'+
   '<p class="wg-sub">Pick one to sign in or create your account. Your progress, chats and lessons are saved to it.</p>'+
   '<div class="wg-choices">'+
     '<button type="button" class="wg-choice wg-student" data-role="student"><span class="wg-ic">🎒</span><b>Sign in as a student</b><span>Study, play games, level up and use the AI Tutor.</span></button>'+
     '<button type="button" class="wg-choice wg-teacher" data-role="teacher"><span class="wg-ic">🍎</span><b>Sign in as a teacher</b><span>Host Live Games and run quick class reviews.</span></button>'+
   '</div><button type="button" class="wg-skip" data-role="">Continue without an account</button>'+
   '<p class="wg-fine">You can sign in any time from the sidebar.</p></div>';
  return o;
}
function close(o){ o.classList.add('wg-out'); setTimeout(function(){ if(o.parentNode) o.parentNode.removeChild(o); document.body.style.overflow=''; },220); }
function pick(o,r){
  ls(SEEN,'1');
  if(r){ ls(PEND,r); ls(ROLE,r); tag(); }
  close(o);
  if(r){
    try{ openSignin().then(function(){ note(r); }); note(r); }catch(e){}
  }
}
function note(r){
  var p=document.getElementById('auth-panel'); if(!p) return;
  var n=document.getElementById('auth-role-note');
  if(!n){ n=document.createElement('div'); n.id='auth-role-note'; n.className='lesson-result good'; n.style.cssText='margin-bottom:12px;font-weight:800;'; p.insertBefore(n,p.firstChild); }
  n.textContent=r==='teacher'?'🍎 Signing in as a teacher':'🎒 Signing in as a student';
}
function show(){
  if(document.getElementById('welcome-gate')) return;
  var o=build(); document.body.appendChild(o); document.body.style.overflow='hidden';
  o.addEventListener('click',function(e){ var b=e.target.closest&&e.target.closest('[data-role]'); if(b) pick(o,b.getAttribute('data-role')||''); });
  var f=o.querySelector('.wg-student'); if(f) f.focus();
}
function init(){
  tag();
  if(gateOpen()) return;            // county screen still up: the page reloads after "Continue", then we run
  if(ls(SEEN)) return;
  fetch('/api/auth/me',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null;}).then(function(d){
    if(d&&d.user){ ls(SEEN,'1'); return; }
    show();
  }).catch(function(){ show(); });
}
/* After signing in with a chosen role: save it on the account, and send teachers to Live Game once. */
function afterSignIn(){
  var pend=ls(PEND); if(!pend) return;
  try{
    if(typeof state==='undefined'||!state.account) return;
    ls(PEND,null); ls(ROLE,pend); tag();
    if(window.AccountExtras&&AccountExtras.touchRole) AccountExtras.touchRole();
    if(pend==='teacher'&&typeof switchView==='function'){ var m=document.getElementById('signin-modal'); setTimeout(function(){ if(m) m.classList.add('hidden'); switchView('live'); },900); }
  }catch(e){}
}
setInterval(afterSignIn,1000);
window.WelcomeRole={role:role,show:show};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(init,60); }); else setTimeout(init,60);
})();
