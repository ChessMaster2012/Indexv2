(function(){
'use strict';
if(window.__indexCommanderRuntimeV17)return;
window.__indexCommanderRuntimeV17=true;

function getGame(){
  try{return typeof state!=='undefined'&&state&&state.games?state.games:null;}catch(e){return null;}
}

function getDef(id){
  try{return typeof window.tdef==='function'?(window.tdef(id)||{}):{};}catch(e){return {};}
}

/*
 * Combat bridge:
 * The authoritative wave engine calls window.fireV6(). Pack Indexlings store
 * their signature attack on the troop definition, not on the placed tower.
 * Copy that attack type onto the live tower before firing so every Indexling
 * uses its intended projectile/ability instead of silently falling back to
 * "basic".
 */
try{
  var originalFire=window.fireV6;
  if(typeof originalFire==='function'&&!originalFire.__v17CombatBridge){
    var fireV17=function(g,t,target,stats,now){
      if(!g||!t)return false;
      try{
        var td=getDef(t.id);
        if(!t.attackType){
          t.attackType=td.attackType||td.ability||'basic';
        }
        if(!stats)stats=window.richStats?window.richStats(t.id,t.level):null;
        if(!stats)stats={range:150,rate:1000,damage:5,power:1,shot:'#9fe8ff'};
        return originalFire.call(this,g,t,target,stats,now);
      }catch(err){
        /*
         * Never let one malformed Indexling definition kill combat.
         * Create a visible basic projectile as a safe fallback; the normal
         * V6 updater/drawer will handle it.
         */
        try{
          if(target&&Array.isArray(g.projectiles)){
            var st=stats||{};
            g.projectiles.push({
              type:'basic',
              x:Number(t.x)||0,y:Number(t.y)||0,
              prevX:Number(t.x)||0,prevY:Number(t.y)||0,
              tx:target.id,
              speed:.68,
              damage:Math.max(1,Number(st.damage)||5),
              color:st.shot||'#9fe8ff',
              life:1450
            });
            t.cool=Math.max(450,Number(st.rate)||1000);
            t.recoil=(Number(now)||performance.now())+120;
            return true;
          }
        }catch(e){}
        console.error('[Commander V17] combat bridge failed',err);
        return false;
      }
    };
    fireV17.__v17CombatBridge=true;
    window.fireV6=fireV17;
  }
}catch(e){console.error('[Commander V17] fire bridge install failed',e);}

/*
 * Safety net for older saved towers: populate attackType once from the
 * authoritative troop registry. This does not change ownership or stats.
 */
try{
  var g=getGame();
  if(g&&Array.isArray(g.towers)){
    g.towers.forEach(function(t){
      if(t&&!t.attackType){
        var td=getDef(t.id);
        t.attackType=td.attackType||td.ability||'basic';
      }
    });
  }
}catch(e){}

/* Make the live combat state visible while testing without changing gameplay. */
try{
  if(!document.getElementById('commander-v17-combat-audit')){
    var s=document.createElement('style');
    s.id='commander-v17-combat-audit';
    s.textContent='.commander-auth-battle canvas{image-rendering:auto!important;}';
    document.head.appendChild(s);
  }
}catch(e){}
})();