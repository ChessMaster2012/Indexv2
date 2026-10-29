/* Profile Hub: the page opened from the profile button at the top of the sidebar.
   Shows the account's equipped Indexling, level, streak, collection, arcade records, badges and activity.
   The original profile editor (name, accent, goal…) stays one click away under "Edit profile". */
(function(){
'use strict';
var ACC={purple:['#7c5cff','#c04bff'],blue:['#2f7bff','#27c6ee'],green:['#1fb86b','#9be15d'],pink:['#ec4899','#ff8a65'],orange:['#f97316','#ffcf33']};
var RORDER=['Common','Rare','Epic','Legendary','Mythic','Divine','Secret'];
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function num(n){ return (Number(n)||0).toLocaleString(); }
function safe(fn,d){ try{ var v=fn(); return v==null?d:v; }catch(e){ return d; } }

function ownedLings(){ var P=state.progress||{}, un=P.unlockedCosmetics||[]; return (window.REWARD_COSMETICS||[]).filter(function(c){ return c.type==='indexling'&&un.indexOf(c.id)>=0; }); }
function allLings(){ return (window.REWARD_COSMETICS||[]).filter(function(c){ return c.type==='indexling'; }); }
function ownedSkins(){ var P=state.progress||{}, un=P.unlockedSkins||[]; var all=safe(function(){ return INDEXLING_SKINS; },[]); return all.filter(function(s){ return un.indexOf(s.id)>=0; }); }
function allSkins(){ return safe(function(){ return INDEXLING_SKINS; },[]); }
function rIdx(r){ var i=RORDER.indexOf(r); return i<0?99:i; }

function equippedArt(size){
  return safe(function(){
    var eq=state.progress.equipped||{}, ling=cosmeticById(eq.indexling)||cosmeticById('ling-sugarbug'), sid=eq.indexlingSkin||(typeof getEquippedSkinId==='function'&&getEquippedSkinId(ling.id))||'';
    var sk=sid&&typeof skinById==='function'?skinById(sid):null;
    return indexlingArtHtml(ling,true,sk||{},null);
  },'<span style="font-size:48px">👤</span>');
}
function lingArt(c){ return safe(function(){ return indexlingArtHtml(c,true,{},null); },'<span>'+esc(c.icon||'?')+'</span>'); }

/* ---------- badges ---------- */
function badges(ctx){
  var P=state.progress, gp=P.gameProgress||{};
  var list=[
    ['🔥','On a roll','Reach a 3-day streak',ctx.best>=3],
    ['🌋','Unstoppable','Reach a 7-day streak',ctx.best>=7],
    ['📚','Student','Learn 5 lessons',ctx.lessons>=5],
    ['🎓','Scholar','Learn 25 lessons',ctx.lessons>=25],
    ['⭐','Level 5','Reach level 5',ctx.level>=5],
    ['👑','Level 10','Reach level 10',ctx.level>=10],
    ['🧬','Collector','Own 10 Indexlings',ctx.owned>=10],
    ['💎','Rare find','Own an Epic or better',ctx.rarest<=2],
    ['🎨','Skin hunter','Own 5 skins',ctx.skins>=5],
    ['⚡','Live host','Play a live game',(P.liveGames||0)>=1],
    ['🏰','Climber','Reach floor 5 in Rogue\'s Sanctuary',((gp.rogue||{}).best||0)>=5],
    ['⛏️','Deep miner','Own gems in Gold Rush Mines',((gp.gold||{}).gems||0)>0||((gp.gold||{}).prestige||0)>0]
  ];
  return list;
}

/* ---------- activity heat grid (last 5 weeks) ---------- */
function heat(){
  var set={}; (state.progress.activeDates||[]).forEach(function(d){ set[d]=1; });
  var out=[], now=new Date(); now.setHours(12,0,0,0);
  for(var i=34;i>=0;i--){ var d=new Date(now); d.setDate(d.getDate()-i); var k=d.toISOString().slice(0,10); out.push('<i class="'+(set[k]?'on':'')+'" title="'+k+(set[k]?' · active':'')+'"></i>'); }
  return out.join('');
}
function bestStreak(){
  var ds=(state.progress.activeDates||[]).slice().sort(), best=0, cur=0, prev=null;
  ds.forEach(function(k){ var t=Date.parse(k+'T12:00:00Z'); if(prev!=null&&Math.round((t-prev)/864e5)===1) cur++; else cur=1; prev=t; if(cur>best) best=cur; });
  return best;
}

/* ---------- build ---------- */
function build(){
  var P=state.progress, pr=state.profile||{}, acc=ACC[pr.profileAccent]||ACC.purple;
  var name=safe(function(){ return displayName(); },'')||safe(function(){ return state.account.username; },'')||'Your account';
  var lvl=safe(function(){ return levelInfo(P.xp); },{level:1,into:0}), streak=safe(function(){ return computeStreak(); },0), best=bestStreak();
  var lings=ownedLings(), allL=allLings(), sk=ownedSkins(), allS=allSkins(), gp=P.gameProgress||{};
  var rarest=lings.reduce(function(m,c){ return Math.min(m,rIdx(c.rarity)); },99);
  var tier=safe(function(){ var m=state.membership||{}; return m.lifetimeBadgeTier||(m.tier&&m.tier!=='free'?m.tier:''); },'');
  var tierName=tier?safe(function(){ return membershipTierName(tier); },tier):'';
  var eq=P.equipped||{}, frame=safe(function(){ return indexlingFrameStyle(eq.frame||'default'); },'');
  var county=pr.countyName||pr.district||'';
  var pct=Math.max(0,Math.min(100,lvl.into));
  var ctx={best:Math.max(best,streak),lessons:(P.lessonsLearned||[]).length,level:lvl.level,owned:lings.length,rarest:rarest,skins:sk.length};
  var b=badges(ctx), got=b.filter(function(x){ return x[3]; }).length;
  // rarity breakdown
  var byR={}; allL.forEach(function(c){ var r=c.rarity||'Common'; (byR[r]=byR[r]||[0,0])[1]++; }); lings.forEach(function(c){ var r=c.rarity||'Common'; (byR[r]=byR[r]||[0,0])[0]++; });
  var rkeys=Object.keys(byR).sort(function(a,b2){ return rIdx(a)-rIdx(b2); });
  // showcase: rarest owned first
  var show=lings.slice().sort(function(a,b2){ return rIdx(a.rarity)-rIdx(b2.rarity)||a.name.localeCompare(b2.name); }).slice(0,8);
  var records=[];
  var rg=gp.rogue||{}, cx=gp.chrono||{}, rh=gp.rhythm||{}, gd=gp.gold||{};
  if(rg.best||rg.wins) records.push(['🏰','Rogue\'s Sanctuary','Floor '+num(rg.best||0)+(rg.wins?' · '+num(rg.wins)+' boss wins':'')]);
  if(cx.best) records.push(['🔮','Chrono Hex','Best '+num(cx.best)+' · level '+num(cx.level||1)]);
  if(rh.best) records.push(['🎵','Rhythm Reflector','Best '+num(rh.best)]);
  if(gd.vault||gd.prestige) records.push(['⛏️','Gold Rush Mines','Vault '+num(Math.round(gd.vault||0))+(gd.prestige?' · prestige '+num(gd.prestige):'')]);
  var recHtml=records.length?records.map(function(r){ return '<div class="ph-rec"><span>'+r[0]+'</span><div><b>'+esc(r[1])+'</b><em>'+esc(r[2])+'</em></div></div>'; }).join(''):'<p class="ph-empty">Play the arcade to set records — they show up here.</p>';
  var chips=[]; if(pr.favoriteSubject) chips.push('📘 '+esc(pr.favoriteSubject)); if(pr.studyGoal) chips.push('🎯 '+esc(pr.studyGoal)); if(county) chips.push('📍 '+esc(county));
  var gradient='linear-gradient(135deg,'+acc[0]+','+acc[1]+')';
  return '<div class="ph-card" role="dialog" aria-modal="true" aria-label="Your profile" style="--ph-a:'+acc[0]+';--ph-b:'+acc[1]+'">'+
    '<button class="ph-x" type="button" data-ph="close" aria-label="Close">×</button>'+
    '<div class="ph-banner" style="background:'+gradient+'"><span class="ph-orb o1"></span><span class="ph-orb o2"></span><span class="ph-orb o3"></span></div>'+
    '<div class="ph-head"><div class="ph-av" style="'+frame+'"><div class="ph-av-art">'+equippedArt()+'</div><span class="ph-lv">Lv '+lvl.level+'</span></div>'+
      '<div class="ph-id"><h2>'+esc(name)+'</h2>'+(tierName?'<span class="ph-tier">💎 '+esc(tierName)+'</span>':'')+
      '<p class="ph-bio">'+(pr.bio?esc(pr.bio):'<span class="ph-dim">No bio yet — add one in Edit profile.</span>')+'</p>'+(chips.length?'<div class="ph-chips">'+chips.map(function(c){return '<span>'+c+'</span>';}).join('')+'</div>':'')+'</div></div>'+
    '<div class="ph-body">'+
      '<section class="ph-xp"><div class="ph-xp-top"><b>Level '+lvl.level+'</b><span>'+lvl.into+' / 100 XP · '+num(P.xp)+' total</span></div><div class="ph-bar"><i style="width:'+pct+'%"></i></div></section>'+
      '<section class="ph-stats">'+
        stat('🔥',streak,'day streak','best '+Math.max(best,streak))+stat('📚',ctx.lessons,'lessons learned','')+stat('🪙',num(P.coins||0),'coins','')+stat('⚡',num(P.liveGames||0),'live games','')+stat('🎁',num(P.openedPacks||0),'packs opened','')+stat('🧰',num(P.skinCrates||0),'skin crates','')+
      '</section>'+
      '<div class="ph-cols">'+
        '<section class="ph-box"><h3>Collection</h3>'+
          '<div class="ph-coll-top"><b>'+lings.length+'<small> / '+allL.length+'</small></b><span>Indexlings</span><b>'+sk.length+'<small> / '+allS.length+'</small></b><span>Skins</span></div>'+
          '<div class="ph-bar thin"><i style="width:'+(allL.length?Math.round(lings.length/allL.length*100):0)+'%"></i></div>'+
          '<div class="ph-rar">'+rkeys.map(function(r){ return '<span class="r-'+esc(r.toLowerCase())+'">'+esc(r)+' <b>'+byR[r][0]+'/'+byR[r][1]+'</b></span>'; }).join('')+'</div>'+
          '<div class="ph-show">'+show.map(function(c){ return '<div title="'+esc(c.name+' · '+(c.rarity||''))+'" class="ph-mini">'+lingArt(c)+'</div>'; }).join('')+'</div></section>'+
        '<section class="ph-box"><h3>Activity <small>last 5 weeks</small></h3><div class="ph-heat">'+heat()+'</div><h3 style="margin-top:16px">Arcade records</h3>'+recHtml+'</section>'+
      '</div>'+
      '<section class="ph-box"><h3>Badges <small>'+got+' / '+b.length+'</small></h3><div class="ph-badges">'+b.map(function(x){ return '<div class="ph-badge '+(x[3]?'on':'')+'" title="'+esc(x[2])+'"><span>'+(x[3]?x[0]:'🔒')+'</span><b>'+esc(x[1])+'</b><em>'+esc(x[2])+'</em></div>'; }).join('')+'</div></section>'+
    '</div>'+
    '<div class="ph-actions"><button class="btn btn-primary" type="button" data-ph="edit">✏️ Edit profile</button>'+
      '<button class="btn btn-ghost" type="button" data-ph="go" data-view="rewards">🏆 Rewards</button><button class="btn btn-ghost" type="button" data-ph="go" data-view="quests">🎯 Quests</button><button class="btn btn-ghost" type="button" data-ph="go" data-view="membership">⭐ Membership</button>'+
      '<button class="btn btn-ghost ph-out" type="button" data-ph="signout">Sign out</button></div>'+
  '</div>';
}
function stat(ico,v,label,sub){ return '<div class="ph-stat"><span>'+ico+'</span><b>'+v+'</b><em>'+label+'</em>'+(sub?'<small>'+sub+'</small>':'')+'</div>'; }

/* ---------- open / close ---------- */
var lastFocus=null;
function open(){
  close(true); lastFocus=document.activeElement;
  var o=document.createElement('div'); o.id='ph-overlay'; o.className='ph-overlay'; o.innerHTML=build();
  document.body.appendChild(o); document.body.classList.add('ph-lock');
  var x=o.querySelector('.ph-x'); if(x) x.focus();
  // refresh in the background so numbers are current
  try{ if(typeof loadAccountState==='function') Promise.resolve(loadAccountState()).then(function(){ var el=$('ph-overlay'); if(el){ var sc=el.scrollTop; el.innerHTML=build(); el.scrollTop=sc; } }).catch(function(){}); }catch(e){}
}
function close(quiet){
  var o=$('ph-overlay'); if(o&&o.parentNode) o.parentNode.removeChild(o); document.body.classList.remove('ph-lock');
  if(!quiet&&lastFocus&&lastFocus.focus) try{ lastFocus.focus(); }catch(e){}
}
document.addEventListener('click',function(e){
  var t=e.target&&e.target.closest?e.target.closest('.profile-btn[data-action="open-signin"]'):null;
  if(t&&state.account&&!window.__phBypass){ e.preventDefault(); e.stopImmediatePropagation(); open(); return; }
  var o=$('ph-overlay'); if(!o) return;
  if(e.target===o){ close(); return; }
  var b=e.target.closest&&e.target.closest('[data-ph]'); if(!b) return;
  var a=b.getAttribute('data-ph');
  if(a==='close') close();
  else if(a==='edit'){ close(true); window.__phBypass=true; try{ openSignin(); }finally{ setTimeout(function(){ window.__phBypass=false; },0); } }
  else if(a==='go'){ close(true); try{ switchView(b.getAttribute('data-view')); }catch(er){} }
  else if(a==='signout'){ close(true); var s=document.createElement('button'); s.setAttribute('data-action','account-signout'); s.style.display='none'; document.body.appendChild(s); s.click(); setTimeout(function(){ if(s.parentNode) s.parentNode.removeChild(s); },50); }
},true);
document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&$('ph-overlay')){ e.stopPropagation(); close(); } },true);

/* ---------- sidebar button: level + XP bar under the name ---------- */
var _rps=window.renderProfileSlot;
function decorate(){
  try{
    var btn=document.querySelector('#profile-slot .profile-btn'); if(!btn||!state.account||btn.querySelector('.ph-mini-xp')) return;
    var col=btn.lastElementChild; if(!col) return;
    var l=levelInfo(state.progress.xp);
    var d=document.createElement('span'); d.className='ph-mini-xp'; d.innerHTML='<em>Lv '+l.level+' · 🔥 '+computeStreak()+'</em><i><b style="width:'+Math.max(0,Math.min(100,l.into))+'%"></b></i>';
    col.appendChild(d); btn.setAttribute('title','Open your profile');
  }catch(e){}
}
if(typeof _rps==='function'){ window.renderProfileSlot=function(){ var r=_rps.apply(this,arguments); decorate(); return r; }; }
setTimeout(function(){ try{ if(typeof renderProfileSlot==='function') renderProfileSlot(); }catch(e){} },400);
window.openProfileHub=open;
})();
