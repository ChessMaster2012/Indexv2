(function(){
'use strict';
if(window.__indexCommanderHotfixV22)return;
window.__indexCommanderHotfixV22=true;

function commanderGame(){
  try{return typeof state!=='undefined'&&state&&state.games?state.games:null;}catch(e){return null;}
}
function findCanvas(){
  return document.getElementById('commander-auth-canvas');
}

/*
 * IMPORTANT: the real placement function lives inside the authoritative
 * Commander scope in index.html. Calling that public bridge keeps the
 * click validator exactly identical to the green/red preview validator,
 * instead of trying to duplicate private map geometry in a separate file.
 */
function placeThroughAuthoritativeBridge(ev,cv){
  var g=commanderGame();
  if(!g||g.active!=='commander'||g.phase!=='battle'||g.running||g.finished||g.questionGateOpen||!g.selectedTroop)return false;
  if(!cv||cv.id!=='commander-auth-canvas')return false;
  try{
    if(typeof window.__commanderPlaceAtClient==='function'){
      return !!window.__commanderPlaceAtClient(ev.clientX,ev.clientY,ev);
    }
    console.error('[Commander V24] exact placement bridge is unavailable');
  }catch(err){
    console.error('[Commander V24] exact placement bridge failed',err);
  }
  return false;
}

/*
 * The original V20 handler tried to validate placement through a function
 * defined in a different JavaScript scope. That validator was unreachable,
 * so a green preview could still be rejected on click. V21 delegates the
 * actual click to __commanderCanvasFinal, which has access to the real
 * canPlace() and place() functions.
 */
document.addEventListener('pointerdown',function(ev){
  if(ev.button!==0)return;
  var cv=findCanvas();
  if(!cv)return;
  var g=commanderGame();
  if(!g||g.active!=='commander'||g.phase!=='battle'||g.questionGateOpen||g.running||!g.selectedTroop)return;

  /*
   * Normal battlefield clicks target the canvas. If a non-interactive
   * decoration receives the event, still treat it as a battlefield click,
   * but never steal clicks on placed Indexlings or controls.
   */
  var target=ev.target;
  if(target&&target.closest){
    if(target.closest('.commander-pack-v4-unit,.commander-auth-side-left,.commander-auth-side-right,.commander-auth-start,.commander-auth-change,[data-pack-v4-filter]'))return;
  }
  var world=cv.closest&&cv.closest('.commander-auth-world');
  var targetIsCanvas=target===cv;
  var targetIsWorld=world&&target===world;
  if(!targetIsCanvas&&!targetIsWorld)return;

  if(placeThroughAuthoritativeBridge(ev,cv)){
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  }
},true);

/*
 * Keep the canvas itself interactive after every battlefield redraw.
 */
function hardenCanvas(){
  try{
    var cv=findCanvas();
    if(cv){
      cv.style.pointerEvents='auto';
      cv.style.touchAction='none';
      cv.style.cursor=commanderGame()&&commanderGame().selectedTroop?'crosshair':'default';
      cv.removeAttribute('aria-disabled');
    }
  }catch(e){}
}
setTimeout(hardenCanvas,0);
setInterval(hardenCanvas,250);

/*
 * Start Wave recovery stays delegated to the authoritative handler. We only
 * repair the half-started state where an old handler marked the wave running
 * without scheduling loopV6.
 */
function startWaveDirect(ev){
  var g=commanderGame();
  if(!g||g.active!=='commander'||g.phase!=='battle'||g.questionGateOpen||g.finished)return false;
  var handler=window.__commanderStartWaveAuthoritative;
  if(typeof handler!=='function'){
    console.error('[Commander V22] authoritative Start Wave handler is unavailable');
    return false;
  }
  try{
    handler(ev);
    return true;
  }catch(err){
    console.error('[Commander V22] Start Wave launch failed',err);
    try{if(typeof showRewardToast==='function')showRewardToast('Could not start the wave: '+String(err&&err.message||err));}catch(e){}
    return false;
  }
}
window.__commanderStartWaveReliable=startWaveDirect;

function isStartWaveElement(target){
  return target&&target.closest?target.closest(
    '#commander-auth-start-wave,#commander-pack-v4-start,[data-commander-start-wave]'
  ):null;
}

/* Only the click event owns Start Wave. Pointerdown is deliberately ignored so
   the launcher cannot run twice for one physical click. */
document.addEventListener('click',function(ev){
  var el=isStartWaveElement(ev.target);
  if(!el||el.disabled)return;
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();
  startWaveDirect(ev);
},true);
})();
