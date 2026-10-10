(function(){
'use strict';
if(window.__indexCommanderRuntimeV15)return;
window.__indexCommanderRuntimeV15=true;

/*
 * Commander V15 integration hardening.
 * The original index.html still contains the older inline V10 wave watchdog.
 * V14 is the authoritative wave engine, so the watchdog must never take over
 * while V14 owns a live wave.
 */
function game(){try{return typeof state!=='undefined'&&state&&state.games?state.games:null;}catch(e){return null;}}
function hardenLegacyWaveGuard(){
  try{
    if(typeof commanderWaveEngineV10!=='undefined'&&commanderWaveEngineV10){
      commanderWaveEngineV10.active=true;
    }
  }catch(e){}
  var g=game();
  if(g&&g.active==='commander'&&g.phase==='battle'&&g.running&&!g.finished&&!g.questionGateOpen){
    g.__commanderRuntimeWave=true;
  }else if(g){
    g.__commanderRuntimeWave=false;
  }
}

/* Make the displayed Upgrade price exactly match the live V14 economy. */
function upgradeCost(t){
  var td=null;
  try{td=window.tdef?window.tdef(t.id):null;}catch(e){}
  return Math.round(Math.max(4,Number(td&&td.cost)||6)*(0.65+Math.max(0,(Number(t.level)||1)-1)*.45));
}
function syncActionLabels(){
  var g=game();
  if(!g||g.active!=='commander'||g.phase!=='battle')return;
  document.querySelectorAll('.commander-auth-active-card').forEach(function(card,idx){
    var t=g.towers&&g.towers[idx],actions=card.querySelector('.commander-auth-active-actions');
    if(!t||!actions)return;
    var buttons=actions.querySelectorAll('button');
    if(buttons[0]){
      buttons[0].textContent='Heal · 10 🪙';
      buttons[0].disabled=!!g.questionGateOpen||Number(g.waveCoins||0)<10;
    }
    if(buttons[1]){
      var cost=upgradeCost(t);
      buttons[1].textContent=Number(t.level)>=10?'MAX LEVEL':('Upgrade · '+cost+' 🪙');
      buttons[1].disabled=!!g.questionGateOpen||Number(t.level)>=10||Number(g.waveCoins||0)<cost;
    }
    if(buttons[2]){
      buttons[2].textContent='Sell';
      buttons[2].disabled=!!g.questionGateOpen;
    }
  });
}

/*
 * A single safety wrapper around the already-loaded V14 authoritative
 * handler. We do not replace its combat logic; we only mark ownership so the
 * legacy V10 watchdog cannot launch a second engine.
 */
try{
  var current=window.__commanderStartWaveAuthoritative;
  if(typeof current==='function'&&!current.__v15Owned){
    var wrapped=function(e){
      var g=game();
      var result=current.apply(this,arguments);
      g=game();
      if(g&&g.running&&!g.finished&&!g.questionGateOpen)g.__commanderRuntimeWave=true;
      return result;
    };
    wrapped.__v15Owned=true;
    window.__commanderStartWaveAuthoritative=wrapped;
    window.__commanderStartWaveFinal=wrapped;
    window.__commanderStartWaveReliable=wrapped;
  }
}catch(e){console.error('[Commander V15] start-wave wrapper failed',e);}

setInterval(function(){
  try{hardenLegacyWaveGuard();syncActionLabels();}catch(e){console.error('[Commander V15] integration check failed',e);}
},250);
hardenLegacyWaveGuard();
syncActionLabels();
})();