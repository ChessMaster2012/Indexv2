/* First screen after "Continue to Index" (and whenever someone is logged out): Sign in / Sign up, then student or teacher,
   then the normal account form. Never shown to people who are already signed in.
   The chosen role is saved on the account (state.role via AccountExtras) and teachers land on Live Game. */
(function(){
'use strict';
var SEEN='index-welcome-v1', ROLE='index-role', PEND='index-role-pending';
function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} return null; }
function gateOpen(){ var g=document.getElementById('site-gate'); return !!g&&!g.classList.contains('hidden'); }
function role(){ var r=ls(ROLE); return r==='teacher'||r==='student'?r:''; }
function tag(){ document.body.setAttribute('data-role',role()||''); }

var MODE='login'; /* 'login' | 'signup' chosen on the first screen */
function build(){
  var o=document.createElement('div'); o.id='welcome-gate'; o.setAttribute('role','dialog'); o.setAttribute('aria-modal','true'); o.setAttribute('aria-labelledby','wg-title');
  o.innerHTML='<div class="wg-card" id="wg-card"></div>'; step(o,1); return o;
}
/* step 1: sign in or sign up. step 2: as a student or a teacher. Then the normal account form opens. */
function step(o,n){
  var c=o.querySelector('#wg-card'), up=MODE==='signup';
  if(n===1){
    c.innerHTML='<div class="wg-logo">Index</div><h2 id="wg-title">Welcome to Index</h2>'+
     '<p class="wg-sub">Your notes, progress, chats and lessons are saved to your account, so sign in or create one to get started.</p>'+
     '<div class="wg-choices">'+
       '<button type="button" class="wg-choice wg-student" data-mode="login"><span class="wg-ic">🔑</span><b>Sign in</b><span>I already have an Index account.</span></button>'+
       '<button type="button" class="wg-choice wg-teacher" data-mode="signup"><span class="wg-ic">✨</span><b>Sign up</b><span>Create a new account. It only takes a minute.</span></button>'+
     '</div><button type="button" class="wg-skip" data-role="">Continue without an account</button>'+
     '<p class="wg-fine">Without an account nothing is saved when you close or reload the page.</p>';
  } else {
    c.innerHTML='<div class="wg-logo">Index</div><h2 id="wg-title">'+(up?'Sign up':'Sign in')+' as a student or a teacher?</h2>'+
     '<p class="wg-sub">Pick the one that fits you.</p>'+
     '<div class="wg-choices">'+
       '<button type="button" class="wg-choice wg-student" data-role="student"><span class="wg-ic">🎒</span><b>'+(up?'Sign up':'Sign in')+' as a student</b><span>Study, play games, level up and use the AI Tutor.</span></button>'+
       '<button type="button" class="wg-choice wg-teacher" data-role="teacher"><span class="wg-ic">🍎</span><b>'+(up?'Sign up':'Sign in')+' as a teacher</b><span>Host Live Games and run quick class reviews.</span></button>'+
     '</div><button type="button" class="wg-skip" data-back="1">← Back</button>';
  }
  var f=c.querySelector('.wg-student'); if(f&&n===1) f.focus();
}
function close(o){ o.classList.add('wg-out'); setTimeout(function(){ if(o.parentNode) o.parentNode.removeChild(o); document.body.style.overflow=''; },220); }
function pick(o,r){
  if(r){ ls(PEND,r); ls(ROLE,r); tag(); }
  close(o);
  if(r){
    try{ openSignin().then(function(){ try{ setAuthMode(MODE); showAuthPanel(); }catch(e){} note(r); }); note(r); }catch(e){}
  }
}
function note(r){
  var p=document.getElementById('auth-panel'); if(!p) return;
  var n=document.getElementById('auth-role-note');
  if(!n){ n=document.createElement('div'); n.id='auth-role-note'; n.className='lesson-result good'; n.style.cssText='margin-bottom:12px;font-weight:800;'; p.insertBefore(n,p.firstChild); }
  n.textContent=(MODE==='signup'?'Signing up as a ':'Signing in as a ')+(r==='teacher'?'🍎 teacher':'🎒 student');
}
function show(){
  if(document.getElementById('welcome-gate')) return;
  var o=build(); document.body.appendChild(o); document.body.style.overflow='hidden';
  o.addEventListener('click',function(e){ var t=e.target.closest&&e.target.closest('[data-mode],[data-role],[data-back]'); if(!t) return;
    if(t.hasAttribute('data-mode')){ MODE=t.getAttribute('data-mode'); step(o,2); var f=o.querySelector('.wg-student'); if(f) f.focus(); }
    else if(t.hasAttribute('data-back')) step(o,1);
    else pick(o,t.getAttribute('data-role')||''); });
  var f=o.querySelector('.wg-student'); if(f) f.focus();
}
function init(){
  tag();
  if(gateOpen()) return;            // county screen still up: the page reloads after "Continue", then we run
  fetch('/api/auth/me',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null;}).then(function(d){
    if(d&&d.user){ return; }
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
    if(pend==='teacher'&&typeof switchView==='function'){ var m=document.getElementById('signin-modal'); setTimeout(function(){ if(m) m.classList.add('hidden'); switchView('classroom'); },900); }
  }catch(e){}
}
var wasIn=false;
function watchSignOut(){ try{ var inNow=typeof state!=='undefined'&&!!state.account; if(wasIn&&!inNow&&!gateOpen()){ var m=document.getElementById('signin-modal'); if(m) m.classList.add('hidden'); show(); } wasIn=inNow; }catch(e){} }
setInterval(function(){ afterSignIn(); watchSignOut(); },1000);
window.WelcomeRole={role:role,show:show};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(init,60); }); else setTimeout(init,60);
})();
