/* AI credits meter: a small pill under the profile, a details panel, and the daily bonus roll. */
(function(){
'use strict';
var st=null, tick=0, refreshTimer=0, rolling=false, open=false;
var $=function(id){return document.getElementById(id);};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
function wait(ms){ var m=Math.max(1,Math.ceil(ms/60000)),h=Math.floor(m/60),r=m%60; return h?(h+'h'+(r?' '+r+'m':'')):(r+' min'); }
function mount(){
  if($('cr-pill')) return;
  var slot=$('profile-slot'); if(!slot||!slot.parentNode) return;
  var wrap=document.createElement('div'); wrap.id='cr-wrap';
  wrap.innerHTML='<button type="button" id="cr-pill" class="cr-pill" aria-haspopup="dialog" aria-expanded="false"><span class="cr-bolt">⚡</span><span id="cr-pill-n">…</span><small id="cr-pill-t">AI credits</small></button><div id="cr-pop" class="cr-pop" role="dialog" aria-label="AI credits" hidden></div>';
  slot.parentNode.insertBefore(wrap,slot.nextSibling);
  $('cr-pill').addEventListener('click',function(e){ e.stopPropagation(); toggle(); });
  document.addEventListener('click',function(e){ if(open&&e.target.isConnected&&!e.target.closest('#cr-wrap')&&!e.target.closest('#cr-pop')) toggle(false); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&open) toggle(false); });
  var pop=$('cr-pop'); document.body.appendChild(pop); /* outside the sidebar so it is not clipped or covered */
  wrap.addEventListener('click',onClick); pop.addEventListener('click',onClick);
}
function toggle(force){
  open=force==null?!open:!!force; var pop=$('cr-pop'); if(!pop) return;
  pop.hidden=!open; $('cr-pill').setAttribute('aria-expanded',open?'true':'false');
  if(open){ place(); paintPop(); refresh(); }
}
function place(){ // the sidebar clips overflow, so the panel is positioned beside the pill
  var pop=$('cr-pop'), pill=$('cr-pill'); if(!pop||!pill) return;
  if(window.innerWidth<=860){ pop.style.left=''; pop.style.top=''; return; }
  var r=pill.getBoundingClientRect(); pop.style.left=Math.round(r.right+10)+'px'; pop.style.top=Math.max(8,Math.min(Math.round(r.top),window.innerHeight-420))+'px';
}
function paintPill(){
  var n=$('cr-pill-n'), t=$('cr-pill-t'), pill=$('cr-pill'); if(!n||!st) return;
  if(st.unlimited){ n.textContent='∞'; t.textContent='unlimited credits'; pill.classList.remove('low','roll'); return; }
  n.textContent=st.remaining; t.textContent=(st.remaining>0?'credits · ':'out · ')+wait(st.resetsAt-Date.now());
  pill.classList.toggle('low',st.remaining<=Math.max(5,Math.round(st.allowance*0.1)));
  pill.classList.toggle('roll',!!st.canRoll);
  pill.title=st.canRoll?'Your daily bonus roll is ready!':'AI credits';
}
function paintPop(msg){
  var pop=$('cr-pop'); if(!pop||!st) return;
  if(st.unlimited){ pop.innerHTML='<div class="cr-head"><b>AI credits</b><button type="button" class="cr-x" data-cr="close" aria-label="Close">×</button></div><div class="cr-big"><span>∞</span><small>unlimited</small></div><div class="cr-rolled">Owner account: no limits on AI credits.</div>'; return; }
  var pctUsed=st.allowance?Math.min(100,Math.round(st.used/st.allowance*100)):0;
  var h='<div class="cr-head"><b>AI credits</b><button type="button" class="cr-x" data-cr="close" aria-label="Close">×</button></div>'
   +'<div class="cr-big"><span>'+st.remaining+'</span><small>available now</small></div>'
   +'<div class="cr-bar" role="img" aria-label="'+st.remainingWindow+' of '+st.allowance+' left this window"><i style="width:'+(100-pctUsed)+'%"></i></div>'
   +'<div class="cr-row"><span>This window</span><b>'+st.remainingWindow+' / '+st.allowance+'</b></div>'
   +'<div class="cr-row"><span>Bonus credits <em>(kept until used)</em></span><b>'+st.bonus+' / '+st.bonusCap+'</b></div>'
   +'<div class="cr-row"><span>Refills every '+st.windowHours+' hours</span><b>in '+wait(st.resetsAt-Date.now())+'</b></div>';
  if(st.signedIn){
    h+='<div class="cr-roll">'
      +(st.canRoll?'<button type="button" class="cr-rollbtn" data-cr="roll"'+(rolling?' disabled':'')+'>🎲 Roll your daily bonus</button><small>Win '+Math.min.apply(null,st.rolls)+'–'+Math.max.apply(null,st.rolls)+' bonus credits, once a day.</small>'
        :'<div class="cr-rolled">'+(st.lastRoll?'🎲 Today\'s roll: <b>+'+st.lastRoll+'</b> credits.':'🎲 Daily roll used.')+' Come back tomorrow!</div>')
      +'</div>';
  }else{
    h+='<div class="cr-roll"><div class="cr-rolled">Sign in to get <b>'+(st.plans&&st.plans.free||20)+' credits every 6 hours</b>, a welcome bonus, a daily roll, and chats saved to your account.</div><button type="button" class="cr-rollbtn" data-cr="signin">Sign in / Create account</button></div>';
  }
  h+='<div class="cr-costs">Your plan: <b>'+esc(st.plan||'free')+'</b> · Tutor message: <b>'+st.costs.tutor+'</b> · Study set: <b>'+st.costs['study-set']+'</b></div>';
  if(msg) h+='<div class="cr-msg">'+esc(msg)+'</div>';
  pop.innerHTML=h;
}
function chip(){
  var send=$('tutor-send'); if(!send||!send.parentNode) return;
  var c=document.getElementById('cr-tchip');
  if(!c){ c=document.createElement('button'); c.type='button'; c.id='cr-tchip'; c.className='cr-tchip'; c.addEventListener('click',function(e){ e.stopPropagation(); toggle(true); });
    send.parentNode.insertBefore(c,send); }
  var html=st?(st.unlimited?'⚡ <b>∞</b><small>unlimited</small>':'⚡ <b>'+st.remaining+'</b><small>'+st.costs.tutor+' per message</small>'):'⚡ …';
  if(c.innerHTML!==html) c.innerHTML=html; /* only write when changed, or the observer would loop */
  if(!st) return;
  c.classList.toggle('low',st.remaining<=Math.max(3,Math.round(st.allowance*0.15)));
  c.title=st.remaining+' AI credits left · refills in '+wait(st.resetsAt-Date.now());
}
function paint(){ paintPill(); chip(); if(open&&!rolling) paintPop(); }
function refresh(){
  return fetch('/api/account/credits',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(d){
    if(!d||!d.ok) return; st=d; paint();
    clearTimeout(refreshTimer); refreshTimer=setTimeout(refresh,Math.max(5000,Math.min(st.resetsAt-Date.now()+1500,10*60*1000)));
  }).catch(function(){});
}
var soon=0; function refreshSoon(){ clearTimeout(soon); soon=setTimeout(refresh,900); }
function onClick(e){
  var b=e.target.closest('[data-cr]'); if(!b) return; var a=b.getAttribute('data-cr');
  if(a==='close') toggle(false);
  else if(a==='signin'){ toggle(false); var s=document.querySelector('[data-action="open-signin"]'); if(s) s.click(); }
  else if(a==='roll') doRoll();
}
function doRoll(){
  if(rolling||!st) return; rolling=true;
  var pop=$('cr-pop'), pool=st.rolls||[10,20,50], i=0;
  pop.querySelector('.cr-roll').innerHTML='<div class="cr-dice" id="cr-dice">🎲 <span id="cr-dn">?</span></div>';
  var spin=setInterval(function(){ var n=$('cr-dn'); if(n) n.textContent='+'+pool[Math.floor(Math.random()*pool.length)]; if(++i>14) clearInterval(spin); },80);
  var started=Date.now();
  fetch('/api/account/credits/roll',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'}}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});}).then(function(x){
    var left=Math.max(0,1300-(Date.now()-started));
    setTimeout(function(){
      clearInterval(spin); rolling=false;
      if(x.d&&x.d.ok) st=x.d;
      if(x.ok&&x.d.rolled!=null){ paintPop(); paintPill(); var r=pop.querySelector('.cr-roll'); if(r) r.insertAdjacentHTML('afterbegin','<div class="cr-won">🎉 +'+x.d.rolled+' bonus credits!</div>'); try{ if(typeof showRewardToast==='function') showRewardToast('🎲 Daily roll: +'+x.d.rolled+' AI credits'); }catch(e){} }
      else { paintPop((x.d&&x.d.error)||'Could not roll right now.'); refresh(); }
    },left);
  }).catch(function(){ clearInterval(spin); rolling=false; paintPop('Could not reach the server. Please try again.'); });
}
// Update the meter after any AI request; show the panel when the credits run out.
var realFetch=window.fetch;
window.fetch=function(input,init){
  var url=typeof input==='string'?input:(input&&input.url)||'';
  var p=realFetch.apply(this,arguments);
  if(url.indexOf('/api/ai/chat')>-1){
    p.then(function(res){
      if(res.status===429){ res.clone().json().then(function(d){ if(d&&d.code==='NO_CREDITS'){ if(d.credits) st=d.credits; paint(); toggle(true); } }).catch(function(){}); }
      refreshSoon();
    },refreshSoon);
  }
  return p;
};
function boot(){ mount(); refresh(); new MutationObserver(function(){ chip(); }).observe(document.body,{childList:true,subtree:true}); chip(); clearInterval(tick); tick=setInterval(function(){ paint(); },30000); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
window.addEventListener('resize',function(){ if(open) place(); });
window.CreditsPlus={refresh:refresh};
})();
