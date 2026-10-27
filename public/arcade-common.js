/* Shared arcade tweak: every arcade game's character (header strip, companions, etc.) shows the player's equipped
   Indexling art and skin instead of the generic blob. Overrides arcadeCharacterHtml from the main script; falls back to it on error. */
(function(){
'use strict';
var orig=window.arcadeCharacterHtml;
window.arcadeCharacterHtml=function(){
  try{
    var id=(state.progress.equipped&&state.progress.equipped.indexling)||'ling-sugarbug';
    var sid=(typeof getEquippedSkinId==='function'&&getEquippedSkinId(id))||'';
    var l=cosmeticById(id)||cosmeticById('ling-sugarbug'), sk=sid&&typeof skinById==='function'?skinById(sid):null;
    if(typeof indexlingArtHtml==='function') return '<div class="game-character gc-art">'+indexlingArtHtml(l,true,sk||{})+'</div>';
  }catch(e){}
  return orig?orig():'';
};
})();
