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
