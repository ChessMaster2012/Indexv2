/* Troop Commander study gate, rebuilt on the shared GameStudy gate so it works like every other game mode.
   - You must answer correctly to deploy (1 correct answer, +1 every 15 waves).
   - A wrong answer locks the card for 3 seconds, then a fresh question appears.
   - Answering earns NO coins/XP. Each wave simply gives a flat deployment budget.
   The old per-version gate screens stay in the page but are hidden. */
(function(){
'use strict';
if(window.__commanderGateV30) return; window.__commanderGateV30=true;
var FLAT_BUDGET=20, COOLDOWN=3000, busy=false;
function G(){ try{ return state&&state.games||null; }catch(e){ return null; } }
/* ---- Long run: 60 waves per map (was open-ended and ramped steeply), checkpoint every 10 ---- */
var TOTAL=60, CHECK=10;
window.__cmdTotalWaves=TOTAL; window.__cmdCheckpointEvery=CHECK;
window.__cmdWL=function(w){ return 'Wave '+Math.min(TOTAL,Math.max(1,Number(w)||1))+' / '+TOTAL; };
/* Enemy HP: same as before for waves 1-10, then a gentler slope (4.6x at wave 60 instead of 7.6x). */
window.__cmdHpScale=function(w){ w=Math.max(1,Number(w)||1); return w<=10?1+.11*w:2.1+.05*(w-10); };
/* Enemies per wave: 10 at wave 1, rising slowly to 28 at wave 40, then flat (wave length ~ unchanged => rewards per minute unchanged). */
window.__cmdSpawnTotal=function(w){ return 8+Math.min(20,Math.ceil(Math.max(1,Number(w)||1)*.5)); };
function toast(m){ try{ if(window.showRewardToast) showRewardToast(m); }catch(e){} }
function victory(g){
  g.finished=true; g.won=true; g.running=false; g.questionGateOpen=false;
  try{ if(g.frame){ cancelAnimationFrame(g.frame); g.frame=null; } }catch(e){}
  try{ if(window.v6Save) window.v6Save(g); }catch(e){}
  var d=document.createElement('div'); d.id='commander-victory';
  d.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(5,16,29,.86);color:#e9fbff;font-family:inherit;text-align:center';
  d.innerHTML='<div style="padding:28px 36px;border-radius:18px;background:#0d2840;border:2px solid #7fe3ff"><h1 style="margin:0 0 8px">Victory!</h1><p style="margin:0 0 16px">You defended the base through all '+TOTAL+' waves.</p><button type="button" id="commander-victory-back" style="padding:10px 22px;font-size:16px;border-radius:10px;cursor:pointer">Back</button></div>';
  document.body.appendChild(d);
  document.getElementById('commander-victory-back').onclick=function(){ d.remove(); leave(); };
}
function need(g){ return 1+Math.floor(Math.max(0,Number(g&&g.wave)||0)/15); }
/* No background AI question calls from the old gate layers. */
window.__commanderWarmAiQuestion=function(){ return Promise.resolve(null); };
window.commanderRequestAiQuestionV9=function(){ return Promise.resolve(null); };
function leave(){ try{ if(typeof window.exitGame==='function') window.exitGame(); else if(typeof window.__commanderExitV6==='function') window.__commanderExitV6(); }catch(e){} }
async function openGate(g){
  busy=true;
  try{
    if(!window.GameStudy) return;
    if(!GameStudy.session){ var s=await GameStudy.pick('commander'); if(!s){ if(G()===g) leave(); return; } }
    if(G()!==g||!g.questionGateOpen||g.finished) return;
    var n=need(g);
    var r=await GameStudy.gate({need:n,cooldown:COOLDOWN,label:'TROOP COMMANDER · STUDY GATE',
      title:'Answer to deploy',
      sub:'Get '+n+' right to deploy your Indexlings. A wrong answer locks the card for 3 seconds. Answers do not earn coins; every wave gives the same deployment budget.'});
    if(r.skipped){ if(window.showRewardToast) try{ showRewardToast('No questions available. Pick a topic or study set first.'); }catch(e){} return; }
    if(G()!==g||!g.questionGateOpen||g.finished) return;
    g.waveCoins=FLAT_BUDGET; g.questionCorrectCount=n; g.questionAskedCount=r.total;
    g.questionFeedback={chosen:-1,correct:true,explanation:''};
    if(typeof window.__commanderEnterBattlefieldV7==='function') window.__commanderEnterBattlefieldV7();
  }catch(e){ console.error('Commander gate failed',e); }
  finally{ busy=false; }
}
var forcePick=false, picking=false;
document.addEventListener('click',function(e){
  var t=e.target&&e.target.closest&&e.target.closest('[data-action="commander-study-change"],[data-action="commander-study-back"]');
  if(t) forcePick=true;
},true);
async function setupStep(g){
  picking=true;
  try{
    if(!window.GameStudy) return;
    var s=(forcePick||!GameStudy.session)?await GameStudy.pick('commander'):GameStudy.session;
    forcePick=false;
    if(G()!==g) return;
    if(!s){ if(typeof window.commanderOpen==='function') window.commanderOpen(); else leave(); return; }
    g.commanderScreen='maps';
    if(typeof window.renderGames==='function') window.renderGames();
  }catch(e){ console.error('Commander topic step failed',e); }
  finally{ picking=false; }
}
function tick(){
  var g=G();
  if(g&&!picking&&g.active==='commander'&&g.commanderScreen==='setup'&&!(window.GameStudy&&GameStudy.isOpen())&&!document.getElementById('gs-picker')){ setupStep(g); return; }
  if(g&&g.active==='commander'&&Number(g.wave)>1){ try{ var gpc=arcadeGameProgress(), cw=Math.min(TOTAL,Number(g.wave)-(g.running?1:0)); if(cw>(Number(gpc.commanderBest)||0)){ gpc.commanderBest=cw; persistProgress(); } }catch(e){} }
  if(g&&g.active==='commander'&&g.phase==='battle'&&g.questionGateOpen&&!g.running&&!g.finished&&Number(g.wave)>=TOTAL){ victory(g); return; }
  if(g&&g.active==='commander'&&g.phase==='battle'&&g.questionGateOpen&&!g.running&&!g.finished&&g.wave>0&&g.wave%CHECK===0&&g.__cmdCp!==g.wave){
    g.__cmdCp=g.wave; try{ if(window.v6Save) window.v6Save(g); }catch(e){} toast('Checkpoint saved: wave '+g.wave+' / '+TOTAL+'. Continue from the save slot any time.');
  }
  if(!g||busy||g.active!=='commander'||g.phase!=='battle'||!g.questionGateOpen||g.finished) return;
  if(window.GameStudy&&GameStudy.isOpen()) return;
  if(document.getElementById('gs-picker')) return;
  if(!document.querySelector('.commander-auth-gate,.commander-gate-v8,.commander-gate-v4,.commander-v8-root')&&!document.getElementById('games-stage')) return;
  openGate(g);
}
setInterval(tick,120);
document.documentElement.classList.add('cg-on');
var st=document.createElement('style');
st.textContent='.cg-on .commander-auth-gate,.cg-on .commander-gate-v8,.cg-on .commander-gate-v4,.cg-on .commander-study-shell-final{visibility:hidden!important}';
document.head.appendChild(st);
})();
