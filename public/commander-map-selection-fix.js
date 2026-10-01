(function(){
  'use strict';
  if(window.__indexCommanderMapSelectionFix)return;
  window.__indexCommanderMapSelectionFix=true;

  function handleMapTile(e){
    var target=e.target&&e.target.closest?e.target.closest('[data-map]'):null;
    if(!target)return;

    var g=(typeof state!=='undefined'&&state)?state.games:null;
    if(!g||g.active!=='commander'||g.commanderScreen!=='maps')return;

    var mapId=target.dataset.map;
    if(!mapId)return;

    var maps=(typeof COMMANDER_MAPS_FINAL!=='undefined'&&Array.isArray(COMMANDER_MAPS_FINAL))
      ? COMMANDER_MAPS_FINAL : [];
    if(!maps.some(function(m){return m&&m.id===mapId;}))return;

    e.preventDefault();
    e.stopImmediatePropagation();

    if(target.dataset.mapLaunching==='1')return;
    target.dataset.mapLaunching='1';
    setTimeout(function(){target.dataset.mapLaunching='';},300);

    var slot=g.slotIndex;
    if(typeof window.__indexCommanderStartMap==='function'){
      window.__indexCommanderStartMap(mapId,slot);
    }else if(typeof commanderStartMapFinal==='function'){
      commanderStartMapFinal(mapId,slot);
    }else if(typeof commanderStartMap==='function'){
      commanderStartMap(mapId,slot);
    }
  }

  document.addEventListener('pointerup',handleMapTile,true);
  document.addEventListener('click',handleMapTile,true);
})();