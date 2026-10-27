/* Skin Crate auto roll. Wraps the existing openSkinCrate flow without changing how a crate is rolled or saved:
   after each reveal, if Auto roll is on and crates remain, the next crate opens automatically. Optional "Stop on Epic".
   Adds an Auto roll bar inside the crate modal and an "Auto roll" button beside every Open Skin Crate button. */
(function(){
'use strict';
var auto={on:false,stopEpic:true,rolled:0,tally:{Common:0,Rare:0,Epic:0},fresh:0,timer:0};
function crates(){ try{ return Math.max(0,Math.floor(Number(state.progress.skinCrates)||0)); }catch(e){ return 0; } }
function modal(){ return document.getElementById('skin-crate-modal'); }
function summary(){ var t=auto.tally; return auto.rolled?('Rolled '+auto.rolled+': '+t.Common+' Common · '+t.Rare+' Rare · '+t.Epic+' Epic · '+auto.fresh+' new'):'Rolls open back-to-back until you stop.'; }
function bar(){
  var m=modal(); if(!m) return; var b=m.querySelector('.sca-bar');
  if(!b){ b=document.createElement('div'); b.className='sca-bar'; var anchor=m.querySelector('.reward-muted'); if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(b,anchor.nextSibling); else return; }
  b.innerHTML='<button type="button" class="btn '+(auto.on?'btn-danger':'btn-primary')+' btn-sm" data-sca="toggle">'+(auto.on?'⏹ Stop auto roll':'🔁 Auto roll')+'</button><label class="sca-chk"><input type="checkbox" data-sca="epic" '+(auto.stopEpic?'checked':'')+'> Stop on Epic</label><span class="sca-left">🧰 '+crates()+' left</span><span class="sca-sum">'+summary()+'</span>';
}
function stop(msg){ auto.on=false; clearTimeout(auto.timer); bar(); if(msg&&typeof showRewardToast==='function') showRewardToast(msg); }
function start(){ auto.on=true; auto.rolled=0; auto.fresh=0; auto.tally={Common:0,Rare:0,Epic:0}; bar(); if(!state.skinCrateOpening&&crates()>0) window.openSkinCrate(); else if(crates()<=0) stop('You do not have a Skin Crate yet.'); }
function onReveal(){
  var res=document.getElementById('skin-crate-result'); if(!res) return; var meta=res.querySelector('.skin-crate-result-meta'); if(!meta) return;
  var txt=res.textContent||''; var rar=/\b(Epic|Rare|Common)\b/.exec(meta.textContent||'')||[0,'Common']; rar=rar[1];
  if(res.__sca) return;
  res.__sca=1; auto.rolled++; auto.tally[rar]=(auto.tally[rar]||0)+1; if(/Added to your skin collection/.test(txt)) auto.fresh++;
  bar();
  if(!auto.on) return;
  if(auto.stopEpic&&rar==='Epic'){ stop('🌟 Auto roll stopped: you rolled an Epic!'); return; }
  if(crates()<=0){ stop('Auto roll finished: out of crates. '+summary()); return; }
  clearTimeout(auto.timer); auto.timer=setTimeout(function(){ if(!auto.on) return; var m=modal(); if(!m||m.classList.contains('hidden')){ stop(); return; } if(state.skinCrateOpening) return; window.openSkinCrate(); },1700);
}
var obs=new MutationObserver(function(muts){
  if(obs.__run) return; obs.__run=1; try{
  var m=modal(); if(m&&!m.querySelector('.sca-bar')) bar();
  var res=document.getElementById('skin-crate-result');
  if(res&&res.querySelector('.skin-crate-actions')) onReveal();
  else if(res&&res.__sca) res.__sca=0;
  // add an Auto roll button next to every Open Skin Crate button
  document.querySelectorAll('[data-action="open-skin-crate"]').forEach(function(b){ if(b.__sca||(b.nextElementSibling&&b.nextElementSibling.hasAttribute&&b.nextElementSibling.hasAttribute('data-sca-open'))) return; b.__sca=1; if(b.parentNode.querySelector('[data-sca-open]')) return; var a=document.createElement('button'); a.type='button'; a.className=b.className.replace(/btn-primary/,'btn-ghost'); a.setAttribute('data-sca-open','1'); a.textContent='🔁 Auto roll'; a.style.marginLeft='6px'; b.parentNode.insertBefore(a,b.nextSibling); });
  }finally{ obs.takeRecords(); obs.__run=0; }
});
obs.observe(document.body,{childList:true,subtree:true});
document.addEventListener('click',function(e){
  var t=e.target.closest&&e.target.closest('[data-sca],[data-sca-open],[data-action="close-skin-crate"],[data-action="equip-indexling-skin"]'); if(!t) return;
  if(t.hasAttribute('data-sca-open')){ e.preventDefault(); e.stopPropagation(); if(crates()<=0){ if(typeof showRewardToast==='function') showRewardToast('You do not have a Skin Crate yet.'); return; } if(!state.account&&typeof promptAccountForPersistentView==='function'){ promptAccountForPersistentView('rewards'); return; } start(); return; }
  var k=t.getAttribute('data-sca');
  if(k==='toggle'){ if(auto.on) stop('Auto roll stopped.'); else start(); }
  else if(t.getAttribute('data-action')==='close-skin-crate'||t.getAttribute('data-action')==='equip-indexling-skin'){ if(auto.on) stop(); }
},true);
document.addEventListener('change',function(e){ var t=e.target; if(t&&t.getAttribute&&t.getAttribute('data-sca')==='epic'){ auto.stopEpic=!!t.checked; } });
})();
