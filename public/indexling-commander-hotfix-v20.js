(function(){
'use strict';
if(window.__indexCommanderHotfixV21)return;
window.__indexCommanderHotfixV21=true;

function commanderGame(){
  try{return window.state&&window.state.games?window.state.games:null;}catch(e){return null;}
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

  var beforeTowers=Array.isArray(g.towers)?g.towers.length:0;
  var beforeSelected=String(g.selectedTroop);

  var proxy={
    button:0,
    clientX:ev.clientX,
    clientY:ev.clientY,
    preventDefault:function(){},
    stopPropagation:function(){},
    stopImmediatePropagation:function(){}
  };

  try{
    if(typeof window.__commanderCanvasFinal==='function'){
      window.__commanderCanvasFinal(proxy);
      var afterTowers=Array.isArray(g.towers)?g.towers.length:0;
      var placed=afterTowers>beforeTowers || !g.selectedTroop;
      if(placed){
        console.debug('[Commander V21] placed',beforeSelected,'at',proxy.clientX,proxy.clientY);
        return true;
      }
    }
  }catch(err){
    console.error('[Commander V21] authoritative placement bridge failed',err);
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

  if(g.running&&!g.frame)g.running=false;

  var handler=window.__commanderStartWaveAuthoritative||window.__commanderStartWaveFinal;
  if(typeof handler!=='function')return false;

  try{
    handler(ev||null);
    setTimeout(function(){
      var live=commanderGame();
      if(!live||live!==g||live.questionGateOpen||live.finished)return;
      if(live.running&&!live.frame){
        live.running=false;
        var h=window.__commanderStartWaveAuthoritative||window.__commanderStartWaveFinal;
        if(typeof h==='function')h(null);
      }
    },120);
    return true;
  }catch(err){
    console.error('[Commander V21] Start Wave recovery failed',err);
    return false;
  }
}

document.addEventListener('click',function(ev){
  var el=ev.target&&ev.target.closest?ev.target.closest(
    '#commander-pack-v4-start,.commander-auth-start,.commander-start-ref,.commander-v6-start-wave,.commander-start-v8,[data-action="commander-start-wave"],[data-action="commander-v6-start"]'
  ):null;
  if(!el||el.disabled)return;
  var g=commanderGame();
  if(!g||g.active!=='commander'||g.phase!=='battle')return;
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();
  startWaveDirect(ev);
},true);
})();
