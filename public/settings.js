/* Settings tab: appearance, accessibility, sound, gameplay, live games, privacy and data.
   Preferences are stored on this device (localStorage) and applied instantly via attributes on <html>. */
(function(){
'use strict';
var KEY='index-settings-v1';
var DEF={theme:'warm',accent:'coral',size:100,font:'default',spacing:'normal',motion:'full',contrast:'normal',links:false,focus:false,density:'comfortable',creator:true,celebrate:true,toasts:true,nick:'',shareStats:true};
var S=load();
function load(){var o={};try{o=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){}var r={};for(var k in DEF)r[k]=(k in o&&typeof o[k]===typeof DEF[k])?o[k]:DEF[k];return r;}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}
window.IXSettings={get:function(k){return S[k];},all:function(){return S;}};
function apply(){
  var h=document.documentElement;
  h.setAttribute('data-ix-theme',S.theme);h.setAttribute('data-ix-accent',S.accent);h.setAttribute('data-ix-font',S.font);h.setAttribute('data-ix-spacing',S.spacing);
  h.setAttribute('data-ix-contrast',S.contrast);h.setAttribute('data-ix-density',S.density);
  h.classList.toggle('ix-links',!!S.links);h.classList.toggle('ix-focus',!!S.focus);h.classList.toggle('ix-hide-creator',!S.creator);
  var mo=S.motion==='reduced'||(S.motion==='system'&&window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  h.classList.toggle('ix-calm',!!mo);
  h.style.zoom=S.size===100?'':String(S.size/100);
}
apply();
/* celebrations + reward pop-ups can be switched off */
function wrapFx(){
  [['celebrate','celebrate'],['showRewardToast','toasts']].forEach(function(p){
    var f=window[p[0]]; if(typeof f!=='function'||f.__ixs) return;
    var w=function(){ if(!S[p[1]]) return; return f.apply(this,arguments); }; w.__ixs=1; window[p[0]]=w;
  });
}
document.addEventListener('DOMContentLoaded',function(){wrapFx();setTimeout(wrapFx,1500);});
/* nickname prefill for live games */
document.addEventListener('focusin',function(e){var t=e.target;if(t&&t.id==='live-join-name'&&!t.value&&S.nick)t.value=S.nick;},true);

/* ---------- UI ---------- */
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function seg(key,opts){return '<div class="st-seg" role="group">'+opts.map(function(o){return '<button type="button" data-set="'+key+'" data-val="'+esc(o[0])+'" class="'+(String(S[key])===String(o[0])?'on':'')+'" aria-pressed="'+(String(S[key])===String(o[0]))+'">'+esc(o[1])+'</button>';}).join('')+'</div>';}
function sw(key,label,desc){return '<label class="st-row st-sw"><span class="st-t"><b>'+esc(label)+'</b><small>'+esc(desc||'')+'</small></span><input type="checkbox" data-tog="'+key+'"'+(S[key]?' checked':'')+'><span class="st-knob"></span></label>';}
function row(label,desc,ctl){return '<div class="st-row"><span class="st-t"><b>'+esc(label)+'</b><small>'+esc(desc||'')+'</small></span><div class="st-c">'+ctl+'</div></div>';}
var ACC=[['coral','#ff7a4d'],['amber','#f0b429'],['mint','#4fd1a5'],['sky','#5aa9ff'],['violet','#a78bfa'],['rose','#ff6b9a']];
var THEMES=[['warm','Warm','#15120e','#2a241c'],['midnight','Midnight','#0d1220','#1c2740'],['forest','Forest','#0e1712','#1d2f25'],['plum','Plum','#17101c','#2c1e36']];
function sfx(){return window.SFX||null;}
function render(){
  var root=$('st-root'); if(!root) return;
  var m=sfx()?!SFX.muted():true, v=sfx()?Math.round(SFX.volume()*100):70;
  var acct=false; try{acct=!!state.account;}catch(e){}
  root.innerHTML=
  '<div class="st-head"><div><h2>Settings</h2><p class="lede">Make Index fit the way you learn. Changes apply right away and are saved on this device.</p></div><button type="button" class="btn btn-ghost" data-st-reset>Reset all</button></div>'+
  '<nav class="st-tabs" aria-label="Settings sections"><a href="#st-appearance">Appearance</a><a href="#st-access">Reading &amp; access</a><a href="#st-sound">Sound</a><a href="#st-play">Games &amp; effects</a><a href="#st-live">Live games</a><a href="#st-data">Privacy &amp; data</a></nav>'+
  '<section class="st-card" id="st-appearance"><h3>Appearance</h3>'+
   row('Theme','Pick the mood of the app.','<div class="st-themes">'+THEMES.map(function(t){return '<button type="button" class="st-theme'+(S.theme===t[0]?' on':'')+'" data-set="theme" data-val="'+t[0]+'" style="--a:'+t[2]+';--b:'+t[3]+'" aria-pressed="'+(S.theme===t[0])+'"><i></i><span>'+t[1]+'</span></button>';}).join('')+'</div>')+
   row('Accent colour','Buttons, highlights and the selected tab.','<div class="st-swatches">'+ACC.map(function(a){return '<button type="button" class="st-sw-c'+(S.accent===a[0]?' on':'')+'" data-set="accent" data-val="'+a[0]+'" style="--c:'+a[1]+'" aria-label="'+a[0]+'" aria-pressed="'+(S.accent===a[0])+'"></button>';}).join('')+'</div>')+
   row('Interface size','Make everything larger or smaller.',seg('size',[[90,'Small'],[100,'Normal'],[112,'Large'],[125,'Extra large']]))+
   row('Layout density','Compact fits more on screen.',seg('density',[['comfortable','Comfortable'],['compact','Compact']]))+
   sw('creator','Show the creator card','The "Built by a student" card on the dashboard.')+
  '</section>'+
  '<section class="st-card" id="st-access"><h3>Reading &amp; accessibility</h3>'+
   row('Font','Dyslexia-friendly uses a wide, plain font with extra spacing.',seg('font',[['default','Default'],['sans','Clean sans'],['readable','Dyslexia-friendly'],['serif','Serif']]))+
   row('Line spacing','Space between lines of text.',seg('spacing',[['normal','Normal'],['relaxed','Relaxed'],['loose','Loose']]))+
   row('Contrast','Brighter text and stronger borders.',seg('contrast',[['normal','Normal'],['high','High']]))+
   row('Motion','Turn off animations if they distract or make you dizzy.',seg('motion',[['full','Full'],['system','Match my device'],['reduced','Reduced']]))+
   sw('links','Underline links','Makes links easier to spot.')+
   sw('focus','Bold focus outline','A thick outline around whatever you tab to.')+
  '</section>'+
  '<section class="st-card" id="st-sound"><h3>Sound</h3>'+
   sw('__sfx','App sounds','Clicks, rewards and game effects.')+
   row('Volume','How loud sounds are.','<input type="range" class="st-range" id="st-vol" min="0" max="100" value="'+v+'" aria-label="Volume"><span class="st-val" id="st-volv">'+v+'%</span><button type="button" class="btn btn-ghost btn-sm" data-st-test>Test</button>')+
  '</section>'+
  '<section class="st-card" id="st-play"><h3>Games &amp; effects</h3>'+
   sw('celebrate','Confetti and celebrations','The burst when you finish something.')+
   sw('toasts','Reward pop-ups','The small "+coins / level up" messages.')+
  '</section>'+
  '<section class="st-card" id="st-live"><h3>Live games</h3>'+
   row('Default nickname','Pre-fills the name box when you join a room.','<input type="text" class="st-in" id="st-nick" maxlength="20" placeholder="e.g. Alex" value="'+esc(S.nick)+'" autocomplete="off">')+
   sw('shareStats','Show my level and stats in lobbies','When off, other players see a blank profile card.')+
  '</section>'+
  '<section class="st-card" id="st-data"><h3>Privacy &amp; data</h3>'+
   row('Download my data','Saves a file with your progress, sets and settings from this device.','<button type="button" class="btn btn-ghost" data-st-export>Download</button>')+
   row('Privacy policy','How Index handles student information.','<a class="btn btn-ghost" href="/privacy.html" target="_blank" rel="noopener">Open</a>')+
   (acct?row('Sign out','Leave this account on this device.','<button type="button" class="btn btn-ghost" data-st-signout>Sign out</button>'):'')+
  '</section>';
  /* sound switch reads SFX */
  var s=root.querySelector('[data-tog="__sfx"]'); if(s) s.checked=m;
}
function toast(t){try{var f=window.showRewardToast; if(f&&f.__ixs){} var e=document.createElement('div');e.className='st-toast';e.textContent=t;document.body.appendChild(e);setTimeout(function(){e.remove();},1600);}catch(x){}}
function onClick(e){
  var t=e.target.closest&&e.target.closest('[data-set]');
  if(t){var k=t.getAttribute('data-set'),v=t.getAttribute('data-val'); S[k]=(typeof DEF[k]==='number')?Number(v):v; save(); apply(); render(); return;}
  if(e.target.closest('[data-st-reset]')){ if(confirm('Reset every setting to the default?')){ S=JSON.parse(JSON.stringify(DEF)); save(); apply(); if(sfx()){SFX.setMuted(false);SFX.volume(.7);} render(); toast('Settings reset'); } return; }
  if(e.target.closest('[data-st-test]')){ if(sfx()) SFX.play('success'); return; }
  if(e.target.closest('[data-st-signout]')){ if(typeof accountSignout==='function') accountSignout(); return; }
  if(e.target.closest('[data-st-export]')){ exportData(); return; }
  var a=e.target.closest('.st-tabs a'); if(a){ e.preventDefault(); var el=$(a.getAttribute('href').slice(1)); if(el) el.scrollIntoView({behavior:S.motion==='reduced'?'auto':'smooth',block:'start'}); }
}
function onChange(e){
  var t=e.target; if(!t||!t.matches) return;
  if(t.matches('[data-tog]')){ var k=t.getAttribute('data-tog'); if(k==='__sfx'){ if(sfx()) SFX.setMuted(!t.checked); return; } S[k]=t.checked; save(); apply(); }
}
function onInput(e){
  var t=e.target; if(!t) return;
  if(t.id==='st-vol'){ var v=Number(t.value); if(sfx()) SFX.volume(v/100); var o=$('st-volv'); if(o) o.textContent=v+'%'; }
  else if(t.id==='st-nick'){ S.nick=t.value.replace(/[<>]/g,'').slice(0,20); save(); }
}
function exportData(){
  var out={exportedAt:new Date().toISOString(),settings:S,local:{}};
  try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(/^(index|gx|ix)/i.test(k)&&!/token|secret|session/i.test(k)){ var v=localStorage.getItem(k); try{v=JSON.parse(v);}catch(e){} out.local[k]=v; } } }catch(e){}
  try{ if(state.progress) out.progress=state.progress; if(state.studySets) out.studySets=state.studySets; if(state.notes) out.notes=state.notes; }catch(e){}
  var b=new Blob([JSON.stringify(out,null,2)],{type:'application/json'}), a=document.createElement('a');
  a.href=URL.createObjectURL(b); a.download='index-my-data.json'; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
}
function ensure(){
  if($('view-settings')) return true;
  var main=document.querySelector('main.main'); if(!main) return false;
  var sec=document.createElement('section'); sec.className='view'; sec.id='view-settings'; sec.innerHTML='<div id="st-root"></div>';
  var ft=main.querySelector(':scope > .app-footer'); if(ft) main.insertBefore(sec,ft); else main.appendChild(sec);
  sec.addEventListener('click',onClick); sec.addEventListener('change',onChange); sec.addEventListener('input',onInput);
  var nav=document.getElementById('nav'), rv=nav&&nav.querySelector('[data-view="rewards"]');
  if(nav&&!nav.querySelector('[data-view="settings"]')){ var b=document.createElement('button'); b.className='nav-btn'; b.setAttribute('data-view','settings'); b.innerHTML='<span></span><span>Settings</span>'; var ref=nav.querySelector('a.nav-btn'); nav.insertBefore(b,ref||null); }
  return true;
}
function boot(){
  if(!ensure()) return setTimeout(boot,200);
  var sw0=window.switchView; if(typeof sw0==='function'&&!sw0.__st){ var w=function(view){ var r=sw0.apply(this,arguments); try{ if(view==='settings') render(); }catch(e){} return r; }; w.__st=1; window.switchView=w; }
  if(window.IX&&IX.refreshNav) try{IX.refreshNav();}catch(e){}
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
window.addEventListener('load',function(){ setTimeout(boot,300); });
})();
