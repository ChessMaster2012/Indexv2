(function(){
'use strict';
if(window.__indexCommanderHotfixV20)return;
window.__indexCommanderHotfixV20=true;

function commanderGame(){
  try{return window.state&&window.state.games?window.state.games:null;}catch(e){return null;}
}
function troopDef(id){
  try{
    if(Array.isArray(window.COMMANDER_TROOPS_FINAL)){
      var t=window.COMMANDER_TROOPS_FINAL.find(function(x){return x&&x.id===id;});
      if(t)return t;
    }
  }catch(e){}
  return null;
}
function cosmetic(id){
  try{
    if(typeof window.cosmeticById==='function')return window.cosmeticById(id);
    if(Array.isArray(window.REWARD_COSMETICS))return window.REWARD_COSMETICS.find(function(x){return x&&x.id===id;})||null;
  }catch(e){}
  return null;
}
function canPlace(g,x,y){
  try{
    if(typeof window.commanderCanPlaceFinal==='function')return !!window.commanderCanPlaceFinal(x,y);
  }catch(e){}
  return !!g&&!g.running&&!g.finished&&!!g.selectedTroop;
}
function save(g){
  try{if(typeof window.v6Save==='function')window.v6Save(g);else if(typeof window.commanderSaveFinal==='function')window.commanderSaveFinal(g);}catch(e){}
}
function redraw(g){
  try{if(typeof window.renderBattle==='function')window.renderBattle(g);else document.dispatchEvent(new CustomEvent('commander-hotfix-redraw'));}catch(e){console.error('Commander V20 redraw failed',e);}
}
function placeDirect(ev){
  var g=commanderGame();
  if(!g||g.active!=='commander'||g.phase!=='battle'||g.running||g.finished||g.questionGateOpen||!g.selectedTroop)return false;
  var cv=ev.currentTarget||ev.target;
  if(!cv||cv.id!=='commander-auth-canvas')return false;
  var r=cv.getBoundingClientRect();
  if(!r.width||!r.height)return false;
  var x=Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width));
  var y=Math.max(0,Math.min(1,(ev.clientY-r.top)/r.height));
  if(!canPlace(g,x,y))return false;

  var id=String(g.selectedTroop);
  var td=troopDef(id);
  var c=cosmetic(id);
  if(!td&&!c){
    console.warn('Commander V20 refused unknown troop ID',id);
    g.selectedTroop=null;g.cursor=null;redraw(g);return true;
  }
  var cost=Math.max(1,Number(td&&td.cost)||5);
  if(Number(g.waveCoins||0)<cost){
    try{if(typeof window.showRewardToast==='function')window.showRewardToast('Not enough deployment coins for this Indexling.');}catch(e){}
    return true;
  }
  var levels={};
  try{var p=typeof window.commanderFinalProfile==='function'?window.commanderFinalProfile():null;levels=p&&p.levels||{};}catch(e){}
  var level=Math.max(1,Number(levels[id])||1);
  var hp=100+(level-1)*18;
  g.waveCoins-=cost;
  if(!Array.isArray(g.towers))g.towers=[];
  g.towers.push({id:id,x:x,y:y,level:level,hp:hp,maxHp:hp,cool:0,abilityReady:performance.now()+1200,recoil:0});
  g.selectedTroop=null;
  g.selectedTowerIndex=-1;
  g.hoverTowerIndex=-1;
  g.cursor=null;
  save(g);
  redraw(g);
  setTimeout(function(){document.dispatchEvent(new CustomEvent('commander-hotfix-redraw'));},0);
  return true;
}

/* Capture placement before the legacy canvas handler. A green ghost is now
   guaranteed to use this same click path, so preview and placement cannot
   disagree because of a stale legacy place() function. */
document.addEventListener('pointerdown',function(ev){
  if(ev.button!==0)return;
  var target=ev.target;
  if(!target||target.id!=='commander-auth-canvas')return;
  var g=commanderGame();
  if(!g||!g.selectedTroop||g.running||g.questionGateOpen)return;
  if(placeDirect(ev)){
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  }
},true);

function startWaveDirect(ev){
  var g=commanderGame();
  if(!g||g.active!=='commander'||g.phase!=='battle'||g.questionGateOpen||g.finished)return false;
  /* Recover a half-started wave left by an older handler. */
  if(g.running){
    if(g.frame)return false;
    g.running=false;
  }
  try{
    if(g.frame){cancelAnimationFrame(g.frame);g.frame=null;}
    g.wave=Math.max(0,Number(g.wave)||0)+1;
    g.running=true;
    g.spawnCount=0;
    g.spawnTotal=6+Math.min(14,g.wave*2);
    g.enemies=[];
    g.projectiles=[];
    g.effects=[];
    g.nextSpawnAt=performance.now()+150;
    g.lastFrame=performance.now();
    g.waveBanner='ROUND '+g.wave;
    g.waveBannerUntil=Date.now()+850;
    save(g);
    redraw(g);

    /* Use the authoritative game loop through the existing final handler.
       The retry only runs when the old handler failed to create a frame. */
    var handler=window.__commanderStartWaveAuthoritative||window.__commanderStartWaveFinal;
    if(typeof handler==='function'){
      handler(ev||null);
    }
    setTimeout(function(){
      var live=commanderGame();
      if(live!==g||!live.running||live.questionGateOpen||live.finished)return;
      if(!live.frame){
        live.lastFrame=performance.now();
        try{
          var h=window.__commanderStartWaveAuthoritative||window.__commanderStartWaveFinal;
          if(typeof h==='function'){
            live.running=false;
            h(null);
          }
        }catch(e){console.error('Commander V20 wave retry failed',e);}
      }
    },120);
    return true;
  }catch(err){
    console.error('Commander V20 direct Start Wave failed',err);
    g.running=false;g.frame=null;
    redraw(g);
    try{if(typeof window.showRewardToast==='function')window.showRewardToast('Could not start the wave.');}catch(e){}
    return false;
  }
}

document.addEventListener('click',function(ev){
  var el=ev.target&&ev.target.closest?ev.target.closest('#commander-pack-v4-start,.commander-auth-start,.commander-start-ref,.commander-v6-start-wave,.commander-start-v8,[data-action="commander-start-wave"],[data-action="commander-v6-start"]'):null;
  if(!el||el.disabled)return;
  var g=commanderGame();
  if(!g||g.active!=='commander'||g.phase!=='battle')return;
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();
  startWaveDirect(ev);
},true);

/* If the pack overlay is rebuilt, make the actual canvas accept pointer events
   even if a legacy layer accidentally places an overlay above it. */
setInterval(function(){
  try{
    var cv=document.getElementById('commander-auth-canvas');
    if(cv){cv.style.pointerEvents='auto';cv.style.touchAction='none';}
  }catch(e){}
},500);
})();
