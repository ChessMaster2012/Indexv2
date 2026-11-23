/* Leaderboards for every game mode. Scores are read from the saved game progress, sent to the server (which only ever keeps a player's best),
   and shown under the arcade game list. */
(function(){
'use strict';
if(window.__ixLB) return; window.__ixLB=true;
var GAMES=[['study','📚','Study Mode','points'],['commander','🛡️','Troop Commander','best wave'],['gauntlet','⚔️','Character Gauntlet','score'],['expedition','🗺️','Expedition Dash','score'],['trial','🏃','Trial of the Ancients','score'],['shadow','♟️','Shadow Arena','matches won'],['gold','⛏️','Gold Rush Mines','lifetime gold'],['rogue','🃏',"Rogue's Sanctuary",'best floor'],['chrono','💠','Chrono Hex Puzzle','best score'],['rhythm','🎵','Rhythm Reflector','best score']];
var SHOW='index-lb-show', LAST='index-lb-last', cur='study';
function n(v){ v=Number(v); return isFinite(v)&&v>0?Math.floor(v):0; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function fmt(v){ v=Number(v)||0; if(v>=1e12) return (v/1e12).toFixed(2)+'T'; if(v>=1e9) return (v/1e9).toFixed(2)+'B'; if(v>=1e6) return (v/1e6).toFixed(2)+'M'; return v.toLocaleString(); }
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function showMe(){ return lsGet(SHOW)!=='0'; }
function scores(){
  var gp={}; try{ gp=state.progress.gameProgress||{}; }catch(e){}
  var sh=gp.shadow||{}, ro=gp.rogue||{}, rh=gp.rhythm||{}, bestR=n(rh.best); try{ Object.keys(rh.tracks||{}).forEach(function(k){ bestR=Math.max(bestR,n(rh.tracks[k]&&rh.tracks[k].best)); }); }catch(e){}
  return { study:n((gp.study||{}).best), commander:n(gp.commanderBest), gauntlet:n((gp.gauntlet||{}).best), expedition:n((gp.expedition||{}).best), trial:n((gp.trial||{}).best),
    shadow:sh.floor?Math.max(0,(n(sh.floor)-1)*18+Math.max(0,n(sh.match)-1)):0, gold:n((gp.gold||{}).lifetime), rogue:Math.max(n(ro.best),n(ro.floor)>1?n(ro.floor):0), chrono:n((gp.chrono||{}).best), rhythm:bestR };
}
var sending=false;
function submit(force){
  var signed=false; try{ signed=!!(state.account&&state.account.id); }catch(e){} if(!signed||sending) return Promise.resolve();
  var sc=scores(), sig=JSON.stringify(sc)+showMe();
  if(!force&&lsGet(LAST)===sig) return Promise.resolve();
  sending=true;
  return fetch('/api/leaderboard/submit',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({scores:sc,show:showMe()})})
    .then(function(r){ if(r.ok) lsSet(LAST,sig); }).catch(function(){}).then(function(){ sending=false; });
}
function body(){ return document.getElementById('lb-body'); }
function load(g){
  cur=g; var b=body(); if(!b) return;
  document.querySelectorAll('[data-lb-game]').forEach(function(t){ t.classList.toggle('on',t.getAttribute('data-lb-game')===g); });
  b.innerHTML='<div class="lb-note">Loading…</div>';
  submit(false).then(function(){ return fetch('/api/leaderboard/'+g,{credentials:'same-origin'}); }).then(function(r){ return r.json().then(function(d){ return {ok:r.ok,d:d}; }); }).then(function(x){
    var b2=body(); if(!b2||cur!==g) return; if(!x.ok){ b2.innerHTML='<div class="lb-note">'+esc(x.d.error||'Could not load the leaderboard.')+'</div>'; return; }
    var d=x.d, h='';
    if(!d.top.length) h='<div class="lb-note">No scores yet. Play '+esc(d.name)+' and be the first on the board!</div>';
    else h='<ol class="lb-list">'+d.top.map(function(r){ var m=r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':r.rank; return '<li class="'+(r.me?'me':'')+'"><span class="lb-rk">'+m+'</span><span class="lb-nm">'+esc(r.name)+(r.me?' <em>(you)</em>':'')+'</span><b>'+fmt(r.score)+'</b></li>'; }).join('')+'</ol>';
    var mine=d.mine;
    h+='<div class="lb-me">'+(mine?(mine.hidden?'Your best is '+fmt(mine.score)+' (hidden from the board).':'You are '+(mine.rank?'<b>#'+mine.rank+'</b> of '+d.total+' with ':'on the board with ')+'<b>'+fmt(mine.score)+'</b> '+esc(d.label)+'.'):'You have no score here yet.')+'</div>';
    b2.innerHTML=h;
  }).catch(function(){ var b3=body(); if(b3) b3.innerHTML='<div class="lb-note">Could not load the leaderboard.</div>'; });
}
function section(){
  return '<section class="lb-panel" id="lb-panel"><div class="lb-head"><h3>🏆 Leaderboards</h3><label class="lb-show"><input type="checkbox" id="lb-show" '+(showMe()?'checked':'')+'> Show my name</label></div>'+
    '<div class="lb-tabs" role="tablist">'+GAMES.map(function(g){ return '<button type="button" class="lb-tab'+(g[0]===cur?' on':'')+'" data-lb-game="'+g[0]+'" role="tab">'+g[1]+' <span>'+esc(g[2])+'</span></button>'; }).join('')+'</div>'+
    '<div class="lb-sub" id="lb-sub"></div><div id="lb-body"><div class="lb-note">Loading…</div></div><p class="lb-fine">Ranked by each player\'s best. Your name is your Index username; turn off "Show my name" to hide from the board.</p></section>';
}
function wrap(){
  if(typeof window.arcadeHubHtml!=='function'||window.arcadeHubHtml.__lb) return false;
  var o=window.arcadeHubHtml; var f=function(){ var h=o.apply(this,arguments); setTimeout(function(){ if(document.getElementById('lb-panel')) load(cur); },30); return h+section(); }; f.__lb=1; window.arcadeHubHtml=f; try{ arcadeHubHtml=f; }catch(e){} return true;
}
document.addEventListener('click',function(e){ var t=e.target&&e.target.closest&&e.target.closest('[data-lb-game]'); if(t){ load(t.getAttribute('data-lb-game')); } });
document.addEventListener('change',function(e){ if(e.target&&e.target.id==='lb-show'){ lsSet(SHOW,e.target.checked?'1':'0'); submit(true).then(function(){ load(cur); }); } });
wrap(); var tries=0, iv=setInterval(function(){ if(wrap()||++tries>40) clearInterval(iv); },500);
setInterval(function(){ submit(false); },20000);
window.IXLeaderboard={submit:submit,scores:scores};
})();
