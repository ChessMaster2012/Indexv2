/* Owner account: unlimited coins, every Indexling/skin/cosmetic, packs and crates.
   The server decides who the owner is (OWNER_EMAILS in Render); this only runs when it says so. */
(function(){
'use strict';
var on=false, MAX=100000000;
function apply(){
  if(typeof state==='undefined'||!state.progress) return;
  on=true; var p=state.progress;
  // Battle Pass: every season starts maxed (level 100, every reward claimed).
  try{
    var sc=window.SeasonCore;
    if(sc){
      sc.ensure(p); var need=(sc.LEVELS-1)*sc.XP_PER_LEVEL;
      if((p.xp||0)<need) p.xp=need;
      p.season.base=Math.max(0,(p.xp||0)-need);
      sc.apply(p);
    }
  }catch(e){}
  p.coins=MAX; p.freePackTokens=100000; p.skinCrates=1000000;
  try{ p.unlockedCosmetics=Array.from(new Set((p.unlockedCosmetics||[]).concat(REWARD_COSMETICS.map(function(c){return c.id;})))); }catch(e){}
  try{ p.unlockedSkins=Array.from(new Set((p.unlockedSkins||[]).concat(INDEXLING_SKINS.map(function(c){return c.id;})))); }catch(e){}
  try{ persistProgress(); updateCoinDisplays(); }catch(e){}
}
// Keep the coin balance topped up after spending.
var realUpdate=window.updateCoinDisplays;
if(typeof realUpdate==='function'){
  window.updateCoinDisplays=function(){
    if(on&&typeof state!=='undefined'&&state.progress&&(state.progress.coins||0)<MAX*0.9){ state.progress.coins=MAX; try{ persistProgress(); }catch(e){} }
    return realUpdate.apply(this,arguments);
  };
}
window.OwnerMode={apply:apply,active:function(){return on;}};
})();
