(function(){
'use strict';
if(window.__indexCommanderPackArsenalV2)return;
window.__indexCommanderPackArsenalV2=true;

const IDS=[
  'ling-sugarbug','ling-squire','ling-bard','ling-knight','ling-alchemist',
  'ling-comet','ling-nebula','ling-voidling','ling-supernova'
];

function esc(v){
  return String(v==null?'':v).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}
function troop(id){
  try{return COMMANDER_TROOPS_FINAL.find(function(t){return t.id===id;})||null;}catch(e){return null;}
}
function cosmetic(id){
  try{return typeof cosmeticById==='function'?cosmeticById(id):null;}catch(e){return null;}
}
function skin(id){
  try{return typeof getEquippedSkinForIndexling==='function'?getEquippedSkinForIndexling(id):null;}catch(e){return null;}
}
function art(id,small){
  var c=cosmetic(id);
  if(!c)return '<span class="pack-v2-fallback">✦</span>';
  try{
    if(typeof indexlingArtHtml==='function'){
      var v=indexlingArtHtml(c,!!small,skin(id));
      if(v)return v;
    }
  }catch(e){}
  return '<span class="pack-v2-fallback">'+esc(c.icon||'✦')+'</span>';
}
function stats(id){
  try{
    var p=commanderFinalProfile(),lvl=Math.max(1,Number(p.levels&&p.levels[id])||1);
    return {lvl:lvl,st:commanderFinalStats(id,lvl)};
  }catch(e){
    var t=troop(id)||{};
    return {lvl:1,st:{damage:Number(t.damage)||0,range:Number(t.range)||0,rate:Number(t.rate)||1000,cooldown:Number(t.cooldown)||6}};
  }
}
function css(){
  if(document.getElementById('commander-pack-arsenal-v2-style'))return;
  var s=document.createElement('style');
  s.id='commander-pack-arsenal-v2-style';
  s.textContent=`
    .commander-pack-arsenal-v2{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px!important}
    .commander-pack-card-v2{position:relative;min-height:136px!important;padding:7px!important;border:2px solid rgba(255,255,255,.1)!important;border-radius:14px!important;background:linear-gradient(160deg,#17293d,#102033)!important;color:#fff!important;text-align:left!important;cursor:pointer!important;overflow:visible!important;transition:transform .12s,border-color .12s,box-shadow .12s,background .12s!important}
    .commander-pack-card-v2:hover{transform:translateY(-2px)!important;border-color:#6fd9ff!important;background:linear-gradient(160deg,#1d344b,#13283c)!important;box-shadow:0 9px 22px rgba(0,0,0,.22)!important}
    .commander-pack-card-v2.selected{border-color:#ffd45e!important;box-shadow:0 0 0 2px rgba(255,212,94,.2),0 10px 24px rgba(0,0,0,.22)!important}
    .commander-pack-card-v2.locked{opacity:.62}
    .commander-pack-art-v2{height:62px;display:grid;place-items:center}
    .commander-pack-art-v2>*{max-width:62px!important;max-height:62px!important}
    .commander-pack-art-v2 svg{width:62px!important;height:62px!important;display:block!important}
    .commander-pack-name-v2{font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .commander-pack-meta-v2{font-size:8px;color:#9eb5c9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
    .commander-pack-stats-v2{font-size:7.5px;color:#d3e3ee;line-height:1.35;margin-top:4px}
    .commander-pack-cost-v2{font-size:8px;font-weight:950;color:#ffd76c;margin-top:4px}
    .commander-pack-lock-v2{position:absolute;right:6px;top:6px;padding:3px 5px;border-radius:999px;background:rgba(5,14,24,.75);font-size:7px;font-weight:950;color:#ffd76c}
    .commander-pack-hint-v2{margin:0 0 8px;padding:7px 9px;border-radius:10px;background:#14283d;border:1px solid #35536d;color:#bfe3f5;font-size:8px;font-weight:850;line-height:1.35}
    .commander-pack-unit-layer-v2{position:absolute;inset:0;z-index:8;pointer-events:none}
    .commander-pack-unit-v2{position:absolute;transform:translate(-50%,-50%);width:78px;height:92px;pointer-events:auto;display:grid;place-items:center;filter:drop-shadow(0 7px 9px rgba(0,0,0,.32));cursor:pointer}
    .commander-pack-unit-v2:hover{z-index:30}
    .commander-pack-unit-art-v2{width:72px;height:72px;display:grid;place-items:center}
    .commander-pack-unit-art-v2 svg{width:72px!important;height:72px!important}
    .commander-pack-unit-name-v2{position:absolute;top:69px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:4px 7px;border-radius:999px;background:rgba(7,19,33,.94);border:1px solid rgba(255,255,255,.12);color:#fff;font:900 8px system-ui;pointer-events:none}
    .commander-pack-unit-role-v2{position:absolute;bottom:75px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:3px 6px;border-radius:999px;background:#fff;color:#15283a;font:900 7px system-ui;pointer-events:none}
    .commander-pack-unit-ring-v2{position:absolute;left:50%;top:50%;width:150px;height:150px;transform:translate(-50%,-50%);border:3px solid #37d990;border-radius:50%;background:rgba(55,217,144,.10);opacity:0;pointer-events:none}
    .commander-pack-unit-v2:hover .commander-pack-unit-ring-v2{opacity:1}
    .commander-pack-unit-tip-v2{position:absolute;left:100%;top:0;width:210px;padding:10px;border-radius:12px;background:rgba(7,19,33,.97);border:1px solid #3f6a88;color:#fff;box-shadow:0 14px 30px rgba(0,0,0,.3);opacity:0;transform:translateX(8px);transition:.12s;pointer-events:none;z-index:50}
    .commander-pack-unit-v2:hover .commander-pack-unit-tip-v2{opacity:1}
    .commander-pack-unit-tip-v2 b{font-size:11px}
    .commander-pack-ghost-v2{position:absolute;transform:translate(-50%,-50%);width:82px;height:82px;z-index:9;pointer-events:none;display:grid;place-items:center}
    .commander-pack-ghost-ring-v2{position:absolute;width:154px;height:154px;border-radius:50%;border:3px solid #37d990;background:rgba(55,217,144,.12)}
    .commander-pack-ghost-ring-v2.blocked{border-color:#ed5d6a;background:rgba(237,93,106,.12)}
    .commander-pack-ghost-art-v2{width:70px;height:70px;opacity:.68;filter:drop-shadow(0 6px 8px rgba(0,0,0,.35))}
    .commander-pack-ghost-art-v2 svg{width:70px!important;height:70px!important}
    .commander-pack-ghost-label-v2{position:absolute;top:60px;white-space:nowrap;padding:4px 7px;border-radius:8px;background:rgba(7,19,33,.95);border:1px solid #37d990;color:#d9ffef;font:900 8px system-ui}
    .commander-pack-ghost-label-v2.blocked{border-color:#ed5d6a;color:#ffe3e6}
    .commander-pack-fallback-v2{font-size:28px}
    @media(max-width:760px){.commander-pack-arsenal-v2{grid-template-columns:1fr!important}.commander-pack-unit-tip-v2{left:auto;right:100%;transform:translateX(-8px)}}
  `;
  document.head.appendChild(s);
}

function isBattle(){
  return !!document.querySelector('#games-stage .commander-auth-battle');
}
function stage(){
  return document.getElementById('games-stage');
}
function clearLegacy(){
  ['indexling-battlefield-overlay','indexling-battlefield-stats'].forEach(function(id){
    var e=document.getElementById(id);if(e)e.remove();
  });
  document.querySelectorAll('.ibp-hint,.ibp-unit').forEach(function(e){e.remove();});
}
function renderArsenal(){
  var st=stage();if(!st||!isBattle())return;
  var box=st.querySelector('.commander-auth-roster');
  var g=typeof state!=='undefined'?state.games:null;
  if(!box||!g||g.active!=='commander'||g.phase!=='battle')return;

  var p;
  try{p=commanderFinalProfile();}catch(e){p={owned:{},levels:{}};}
  var sig=IDS.map(function(id){return id+':'+(p.owned&&p.owned[id]?'1':'0')+':'+(g.selectedTroop===id?'1':'0');}).join('|');
  if(box.dataset.packV2Sig===sig&&box.querySelector('.commander-pack-arsenal-v2'))return;

  var html='<div class="commander-pack-hint-v2">Choose an Indexling from your pack collection. Click a card to select it, then click an open area of the battlefield to place it. Hover a placed Indexling for its range and stats.</div><div class="commander-pack-arsenal-v2">';
  IDS.forEach(function(id){
    var t=troop(id),c=cosmetic(id);
    if(!t||!c)return;
    var own=!!(p.owned&&p.owned[id]),info=stats(id),stt=info.st,lvl=info.lvl,cost=Math.max(0,Number(t.cost)||5);
    html+='<button type="button" class="commander-pack-card-v2 '+(g.selectedTroop===id?'selected ':'')+(!own?'locked':'')+'" data-pack-troop="'+id+'">'+
      (!own?'<span class="commander-pack-lock-v2">LOCKED</span>':'')+
      '<div class="commander-pack-art-v2">'+art(id,true)+'</div>'+
      '<div class="commander-pack-name-v2">'+esc(c.name)+' · Lv '+lvl+'</div>'+
      '<div class="commander-pack-meta-v2">'+esc(t.category||t.role||'Indexling')+' · '+esc(t.role||'Defense')+'</div>'+
      '<div class="commander-pack-stats-v2">⚔ '+stt.damage+' DMG · ◉ '+stt.range+' RNG · ⚡ '+(Math.round(1000/stt.rate*10)/10)+'/s<br>✦ '+esc(t.ability||'Unique Attack')+'</div>'+
      '<div class="commander-pack-cost-v2">Deploy · '+cost+' 🪙</div>'+
    '</button>';
  });
  html+='</div>';
  box.innerHTML=html;
  box.dataset.packV2Sig=sig;

  box.querySelectorAll('[data-pack-troop]').forEach(function(card){
    card.addEventListener('click',function(e){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      var id=card.dataset.packTroop,g=state.games;
      if(!g||g.running||g.questionGateOpen)return;
      if(typeof window.__commanderSelectFinal==='function'){
        window.__commanderSelectFinal(id,e);
      }else{
        g.selectedTroop=g.selectedTroop===id?null:id;
        if(typeof window.commanderRenderScreen==='function')window.commanderRenderScreen();
      }
    },true);
  });
}

function renderUnitLayer(){
  var st=stage(),world=st&&st.querySelector('.commander-auth-world'),g=typeof state!=='undefined'?state.games:null;
  if(!world||!g||g.active!=='commander'||g.phase!=='battle')return;
  var old=world.querySelector('.commander-pack-unit-layer-v2');
  if(!old){old=document.createElement('div');old.className='commander-pack-unit-layer-v2';world.appendChild(old);}
  var key=(g.towers||[]).map(function(t){return [t.id,t.x,t.y,t.level,t.hp].join(':');}).join('|')+'#'+String(g.selectedTroop||'')+'#'+String(g.cursor?g.cursor.x+'|'+g.cursor.y+'|'+g.cursor.valid:'');
  if(old.dataset.key===key)return;
  old.dataset.key=key;
  var html='';
  (g.towers||[]).forEach(function(t,i){
    var td=troop(t.id),info=stats(t.id),stt=info.st,lvl=info.lvl;
    if(!td)return;
    var c=cosmetic(t.id);
    html+='<div class="commander-pack-unit-v2" style="left:'+(t.x*100)+'%;top:'+(t.y*100)+'%;" data-pack-unit-index="'+i+'">'+
      '<div class="commander-pack-unit-ring-v2"></div>'+
      '<div class="commander-pack-unit-art-v2">'+art(t.id,false)+'</div>'+
      '<div class="commander-pack-unit-role-v2">'+esc(td.category||td.role||'Indexling')+'</div>'+
      '<div class="commander-pack-unit-name-v2">'+esc((c&&c.name)||td.name||'Indexling')+' · Lv '+lvl+'</div>'+
      '<div class="commander-pack-unit-tip-v2"><b>'+esc((c&&c.name)||td.name||'Indexling')+' · Lv '+lvl+'</b><br>'+
      '<span style="color:#9fdfff">'+esc(td.category||td.role||'Indexling')+'</span><br>'+
      '⚔ '+stt.damage+' DMG · ◉ '+stt.range+' RNG · ⚡ '+(Math.round(1000/stt.rate*10)/10)+'/s<br>'+
      '<span style="color:#ffd66e">✦ '+esc(td.ability||'Unique Attack')+'</span></div>'+
    '</div>';
  });
  if(g.selectedTroop&&g.cursor&&!g.running){
    var info2=stats(g.selectedTroop),td2=troop(g.selectedTroop);
    if(td2){
      html+='<div class="commander-pack-ghost-v2" style="left:'+(g.cursor.x*100)+'%;top:'+(g.cursor.y*100)+'%;">'+
        '<div class="commander-pack-ghost-ring-v2 '+(g.cursor.valid?'':'blocked')+'"></div>'+
        '<div class="commander-pack-ghost-art-v2">'+art(g.selectedTroop,false)+'</div>'+
        '<div class="commander-pack-ghost-label-v2 '+(g.cursor.valid?'':'blocked')+'">'+(g.cursor.valid?'PLACE':'BLOCKED')+' · '+esc(td2.name)+'</div>'+
      '</div>';
    }
  }
  old.innerHTML=html;
}

function bindWorldEvents(){
  var cv=document.getElementById('commander-auth-canvas');
  if(!cv||cv.dataset.packV2Bound==='1')return;
  cv.dataset.packV2Bound='1';
  cv.addEventListener('pointermove',function(){requestAnimationFrame(function(){renderUnitLayer();});},{passive:true});
  cv.addEventListener('pointerleave',function(){requestAnimationFrame(function(){renderUnitLayer();});},{passive:true});
}

function sync(){
  clearLegacy();
  if(!isBattle())return;
  css();
  renderArsenal();
  bindWorldEvents();
  renderUnitLayer();
}

var mo=new MutationObserver(function(){
  clearTimeout(window.__indexCommanderPackArsenalTimer);
  window.__indexCommanderPackArsenalTimer=setTimeout(sync,20);
});
var st=stage();
if(st)mo.observe(st,{childList:true,subtree:true});
setInterval(sync,700);
setTimeout(sync,120);
setTimeout(sync,700);

})();
