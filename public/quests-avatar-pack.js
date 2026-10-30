(function(){
'use strict';
/* Quests v7. Quest definitions live in /quest-catalog.js (shared with the server).
 * Rewards are always granted by the server; this file only shows progress and asks the server to claim. */
const CAT=window.QUEST_CATALOG;
if(!CAT){console.warn('Quest catalog missing');return;}

function avatarFix(){
  const slot=document.getElementById('profile-slot');
  if(slot)slot.dataset.avatarFix='1';
}

let questAccountKey='';
const QUEST_VERSION='v7';
let ui={tab:'daily',filter:'all'};
let ach={claimed:null,values:null,loading:false};
let lastSig='';

function dayKey(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function accountKey(){
  const a=state.account;
  return a && (a.id||a.userId||a.email) ? String(a.id||a.userId||a.email) : '';
}
function storageKey(){return 'index-quest-'+QUEST_VERSION+'-'+accountKey();}
function loadQuestData(){
  if(!accountKey())return {};
  try{return JSON.parse(localStorage.getItem(storageKey())||'{}')||{};}catch(e){return {};}
}
function saveQuestData(data){
  if(!accountKey())return;
  try{localStorage.setItem(storageKey(),JSON.stringify(data));}catch(e){}
}
let questServerSaveTimer=null,questServerSaveInFlight=false,questServerSaveQueued=false,lastQuestServerSignature='';

/* ---------- metrics ---------- */
function appSnapshot(){
  const p=state.progress||{};
  return {
    ai:Array.isArray(state.chat)?state.chat.filter(function(x){return x&&x.role==='user';}).length:0,
    sets:Array.isArray(state.studySets)?state.studySets.length:0,
    notes:Array.isArray(state.notes)?state.notes.length:0,
    lessons:Array.isArray(p.lessonsLearned)?p.lessonsLearned.length:0,
    xp:Number(p.xp||0),
    packs:Number(p.openedPacks||0),
    liveGames:Number(p.liveGames||0)
  };
}
function etDay(ts){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts));
}
function quizTodayStats(){
  let quizzes=0,perfect=0;const d=dayKey();
  (state.studySets||[]).forEach(function(s){
    (Array.isArray(s.attempts)?s.attempts:[]).forEach(function(a){
      if(a&&a.ts&&etDay(a.ts)===d){quizzes++;if(a.total>0&&a.score===a.total)perfect++;}
    });
  });
  return {quizzes:quizzes,perfect:perfect};
}
function computeMetrics(data){
  const now=appSnapshot(),base=data.baseline||now,ctr=data.ctr||{},prev=data.progress||{},p=state.progress||{};
  const qz=quizTodayStats();
  const coinsToday=String(p.dailyCoinDate||'')===dayKey()?Math.max(0,Number(p.dailyCoinEarned)||0):0;
  let streak=0;try{streak=typeof computeStreak==='function'?computeStreak():0;}catch(e){}
  function mx(k,v){return Math.max(Number(prev[k])||0,v);}   // progress never goes backwards within a day
  return {
    login:1,
    ai:mx('ai',Math.max(0,now.ai-Number(base.ai||0))),
    sets:mx('sets',Math.max(0,now.sets-Number(base.sets||0))),
    notes:mx('notes',Math.max(0,now.notes-Number(base.notes||0))),
    lessons:mx('lessons',Math.max(0,now.lessons-Number(base.lessons||0))),
    xp:mx('xp',Math.max(0,now.xp-Number(base.xp||0))),
    packs:mx('packs',Math.max(0,now.packs-Number(base.packs||0))),
    liveGames:mx('liveGames',Math.max(0,now.liveGames-Number(base.liveGames||0))),
    quizzes:mx('quizzes',qz.quizzes),
    perfect:mx('perfect',qz.perfect),
    coins:mx('coins',coinsToday),
    wheel:mx('wheel',String(p.dailyWheelDate||'')===dayKey()?1:0),
    streak:mx('streak',streak),
    cards:mx('cards',Number(ctr.cards)||0),
    games:mx('games',Number(ctr.games)||0),
    waves:mx('waves',Number(ctr.waves)||0),
    crates:mx('crates',Number(ctr.crates)||0)
  };
}
function bump(metric,n){
  if(!state.account||!ensureQuestDay())return;
  const data=loadQuestData();
  data.ctr=data.ctr||{};
  data.ctr[metric]=Math.max(Number(data.ctr[metric])||0,Number((data.progress||{})[metric])||0)+(n||1);
  saveQuestData(data);
  updateQuestProgressFromApp();
}
function updateQuestProgressFromApp(){
  if(!state.account||!ensureQuestDay())return;
  const data=loadQuestData(),next=computeMetrics(data),prev=data.progress||{};
  if(JSON.stringify(prev)!==JSON.stringify(next)){data.progress=next;saveQuestData(data);return next;}
  return prev;
}
function questPayload(){
  updateQuestProgressFromApp();
  const fresh=loadQuestData();
  return {
    day:fresh.day||dayKey(),
    baseline:fresh.baseline||appSnapshot(),
    progress:fresh.progress||{},
    claimed:fresh.claimed||{},
    announced:fresh.announced||{},
    crateRewardsClaimed:fresh.crateRewardsClaimed||{},
    chestClaimed:fresh.chestClaimed||{}
  };
}
async function syncQuestToServer(keepalive){
  if(!state.account)return;
  if(questServerSaveInFlight){questServerSaveQueued=true;return;}
  questServerSaveInFlight=true;
  try{
    const payload={quests:questPayload()};
    const signature=JSON.stringify(payload.quests);
    const r=await fetch('/api/account/quests',{method:'PUT',headers:{'content-type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(payload),keepalive:!!keepalive});
    if(!r.ok)throw new Error('quest sync '+r.status);
    lastQuestServerSignature=signature;
  }catch(e){}finally{
    questServerSaveInFlight=false;
    if(questServerSaveQueued){questServerSaveQueued=false;setTimeout(function(){syncQuestToServer();},0);}
  }
}
function scheduleQuestServerSave(immediate){
  if(!state.account)return;
  updateQuestProgressFromApp();
  const signature=JSON.stringify({quests:questPayload()});
  if(!immediate&&signature===lastQuestServerSignature)return;
  clearTimeout(questServerSaveTimer);
  questServerSaveTimer=setTimeout(function(){syncQuestToServer();},immediate?0:500);
}
async function loadQuestFromServer(){
  if(!state.account)return false;
  try{
    const r=await fetch('/api/account/quests',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)return false;
    const d=await r.json();
    if(d.quests){
      const local=loadQuestData();
      // keep local-only counters (cards, games, ...) if the saved day matches
      if(local.day===d.quests.day&&local.ctr)d.quests.ctr=local.ctr;
      saveQuestData(d.quests);
      questAccountKey=accountKey();
      lastQuestServerSignature=JSON.stringify({quests:d.quests});
      return true;
    }
  }catch(e){}
  return false;
}
function ensureQuestDay(){
  if(!state.account)return false;
  const k=accountKey(),d=dayKey(),data=loadQuestData();
  if(questAccountKey!==k||data.day!==d||!data.baseline){
    // A new Index day starts a completely new board. Never carry yesterday's flags over.
    saveQuestData({day:d,baseline:appSnapshot(),progress:{login:1},claimed:{},announced:{},crateRewardsClaimed:{},chestClaimed:{},ctr:{}});
    questAccountKey=k;
    scheduleQuestServerSave(true);
  }
  return true;
}

/* ---------- quest list ---------- */
function todaysBoard(){return CAT.board(dayKey());}
function quests(){
  ensureQuestDay();updateQuestProgressFromApp();
  const data=loadQuestData(),prog=data.progress||{};
  return todaysBoard().map(function(def){
    const v=Math.min(def.goal,Math.max(0,Number(prog[def.metric])||0));
    return Object.assign({},def,{value:v,claimed:!!(data.claimed&&data.claimed[def.id]),done:v>=def.goal,reward:CAT.rewardText(def),rewardXP:def.xp,rewardCoins:def.coins,rewardSkinCrates:def.skinCrates});
  });
}
function claimedCount(list){return list.filter(function(q){return q.claimed;}).length;}
function nextQuestResetMs(){
  const now=new Date();
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=function(t){const x=parts.find(function(y){return y.type===t;});return Number(x?x.value:0);};
  const tomorrow=new Date(Date.UTC(get('year'),get('month')-1,get('day')+1));
  const y=tomorrow.getUTCFullYear(),m=String(tomorrow.getUTCMonth()+1).padStart(2,'0'),d=String(tomorrow.getUTCDate()).padStart(2,'0');
  const off=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'longOffset'}).formatToParts(now).find(function(x){return x.type==='timeZoneName';});
  const offset=String(off?off.value:'GMT-04:00').replace('GMT','');
  const target=Date.parse(y+'-'+m+'-'+d+'T00:00:00'+offset);
  return Number.isFinite(target)?target:Date.now()+86400000;
}
function questCountdownText(){
  const total=Math.floor(Math.max(0,nextQuestResetMs()-Date.now())/1000);
  return String(Math.floor(total/3600)).padStart(2,'0')+':'+String(Math.floor((total%3600)/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
function showQuestCompletion(q){
  let el=document.getElementById('index-quest-popup');
  if(!el){el=document.createElement('div');el.id='index-quest-popup';document.body.appendChild(el);}
  el.innerHTML='<div class="quest-popup-backdrop"></div><div class="quest-popup-card"><div class="quest-popup-icon">'+q.icon+'</div><div class="quest-popup-eyebrow">QUEST COMPLETE</div><h3>'+q.title+'</h3><p>Claim <strong>'+q.reward+'</strong> in the Quests tab.</p><button class="btn btn-primary" data-quest-popup-close>Continue</button></div>';
  el.classList.add('show');
  const close=el.querySelector('[data-quest-popup-close]');
  if(close)close.onclick=function(){el.classList.remove('show');};
  const bd=el.querySelector('.quest-popup-backdrop');
  if(bd)bd.onclick=function(){el.classList.remove('show');};
  clearTimeout(showQuestCompletion._timer);
  showQuestCompletion._timer=setTimeout(function(){if(el)el.classList.remove('show');},7000);
}
function checkQuestCompletions(){
  if(!state.account||!ensureQuestDay())return;
  const data=loadQuestData(),current=quests();
  data.announced=data.announced||{};
  let changed=false;
  current.forEach(function(q){
    if(q.done&&!q.claimed&&!data.announced[q.id]){
      data.announced[q.id]=Date.now();changed=true;
      if(state.view!=='quests')showQuestCompletion(q);
    }
  });
  if(changed){saveQuestData(data);scheduleQuestServerSave(true);}
}

/* ---------- rendering ---------- */
function pills(r){
  const o=[];
  if(r.xp)o.push('<span class="qp qp-xp">⚡ '+r.xp+' XP</span>');
  if(r.coins)o.push('<span class="qp qp-coin">🪙 '+r.coins+'</span>');
  if(r.packTokens)o.push('<span class="qp qp-pack">🎁 ×'+r.packTokens+'</span>');
  if(r.skinCrates)o.push('<span class="qp qp-crate">🧰 ×'+r.skinCrates+'</span>');
  return o.join('');
}
function questCard(q){
  const pct=Math.round(q.value/q.goal*100);
  const cls='qc'+(q.claimed?' claimed':q.done?' ready':'')+(q.skinCrates||q.packTokens?' rare':'');
  const action=q.claimed?'<span class="qc-done">✓ Claimed</span>':q.done?'<button class="qbtn qbtn-gold" data-action="claim-quest" data-quest="'+q.id+'">Claim</button>':'<span class="qc-count">'+q.value+' / '+q.goal+'</span>';
  return '<article class="'+cls+'"><div class="qc-top"><div class="qc-ic">'+q.icon+'</div><div class="qc-txt"><h4>'+q.title+'</h4><p>'+q.desc+'</p></div></div><div class="qc-bar"><i style="width:'+pct+'%"></i></div><div class="qc-bot"><div class="qc-rw">'+pills(q)+'</div>'+action+'</div></article>';
}
function chestHtml(list){
  const data=loadQuestData(),n=claimedCount(list),total=list.length;
  const maxNeed=CAT.CHEST[CAT.CHEST.length-1].need;
  const items=CAT.CHEST.map(function(c){
    const got=!!(data.chestClaimed&&data.chestClaimed[c.id]),ready=!got&&n>=c.need;
    return '<div class="ch'+(got?' got':ready?' ready':'')+'" style="--at:'+Math.round(c.need/maxNeed*100)+'%"><div class="ch-ic">'+c.icon+'</div><div class="ch-n">'+c.name+'</div><div class="ch-need">'+Math.min(n,c.need)+' / '+c.need+' quests</div><div class="qc-rw ch-rw">'+pills(c)+'</div>'+(got?'<span class="qc-done">✓ Opened</span>':ready?'<button class="qbtn qbtn-gold" data-action="claim-chest" data-tier="'+c.id+'">Open</button>':'<span class="qc-count">Locked</span>')+'</div>';
  }).join('');
  return '<section class="q-chests"><div class="q-chests-h"><div><div class="q-eyebrow">DAILY CHESTS</div><h3>Claim quests to open chests</h3></div><div class="q-chests-n"><b>'+n+'</b> / '+total+' claimed</div></div><div class="q-chests-bar"><i style="width:'+Math.round(n/maxNeed*100)+'%"></i></div><div class="q-chests-grid">'+items+'</div></section>';
}
function achievementsHtml(){
  if(!ach.claimed||!ach.values){
    if(!ach.loading)loadAchievements();
    return '<div class="q-empty">Loading achievements…</div>';
  }
  const list=CAT.ACHIEVEMENTS;
  const doneN=list.filter(function(a){return ach.claimed[a.id];}).length;
  const metricLabel={lessons:'lessons',level:'level',collection:'Indexlings',skins:'skins',packs:'packs',liveGames:'Live Games',activeDays:'active days'};
  const cards=list.map(function(a){
    const v=Math.min(a.goal,Number(ach.values[a.metric])||0),got=!!ach.claimed[a.id],ready=!got&&v>=a.goal;
    return '<article class="qc ach'+(got?' claimed':ready?' ready':'')+'"><div class="qc-top"><div class="qc-ic">'+a.icon+'</div><div class="qc-txt"><h4>'+a.title+'</h4><p>'+a.desc+'</p></div></div><div class="qc-bar"><i style="width:'+Math.round(v/a.goal*100)+'%"></i></div><div class="qc-bot"><div class="qc-rw">'+pills(a)+'</div>'+(got?'<span class="qc-done">✓ Claimed</span>':ready?'<button class="qbtn qbtn-gold" data-action="claim-achievement" data-id="'+a.id+'">Claim</button>':'<span class="qc-count">'+v+' / '+a.goal+' '+(metricLabel[a.metric]||'')+'</span>')+'</div></article>';
  }).join('');
  return '<section class="q-sec"><div class="q-sec-h"><div><span>🏅</span><strong>Lifetime Achievements</strong></div><span class="q-sub">'+doneN+' / '+list.length+' earned · these never reset</span></div><div class="q-grid">'+cards+'</div></section>';
}
function renderQuests(){
  const root=document.getElementById('view-quests');
  if(!root||!state.account)return;
  const list=quests(),n=claimedCount(list),total=list.length,readyN=list.filter(function(q){return q.done&&!q.claimed;}).length;
  const p=state.progress||{};
  let streak=0;try{streak=computeStreak();}catch(e){}
  const pct=total?Math.round(n/total*100):0;
  const filters=[['all','All'],['ready','Ready ('+readyN+')'],['todo','In progress'],['done','Claimed']];
  const vis=list.filter(function(q){return ui.filter==='all'||(ui.filter==='ready'&&q.done&&!q.claimed)||(ui.filter==='todo'&&!q.done)||(ui.filter==='done'&&q.claimed);});
  let body;
  if(ui.tab==='ach')body=achievementsHtml();
  else{
    body=chestHtml(list)+'<div class="q-filters">'+filters.map(function(f){return '<button type="button" class="q-f'+(ui.filter===f[0]?' on':'')+'" data-qf="'+f[0]+'">'+f[1]+'</button>';}).join('')+(readyN>1?'<button type="button" class="qbtn qbtn-gold q-claimall" data-action="claim-all-quests">Claim all ('+readyN+')</button>':'')+'</div>'+
      CAT.CATEGORIES.map(function(cat){
        const items=vis.filter(function(q){return q.category===cat.id;});
        if(!items.length)return '';
        return '<section class="q-sec"><div class="q-sec-h"><div><span>'+cat.icon+'</span><strong>'+cat.id+'</strong></div><span class="q-sub">'+cat.blurb+'</span></div><div class="q-grid">'+items.map(questCard).join('')+'</div></section>';
      }).join('')||'<div class="q-empty">Nothing here right now.</div>';
  }
  root.innerHTML='<div class="quest-page qx"><section class="q-hero"><div class="q-hero-main"><div class="q-eyebrow">MISSION CONTROL</div><h2>Quests</h2><p>Finish today\'s missions to open daily chests. Achievements are lifetime goals that never reset.</p><div class="q-timer">🔄 New board in <b id="quest-reset-countdown">'+questCountdownText()+'</b></div></div>'+
    '<div class="q-hero-stats"><div class="q-ring" style="--p:'+pct+'"><div><b>'+n+'</b><span>/ '+total+'</span></div></div>'+
    '<div class="q-stat"><span>🔥</span><b>'+streak+'</b><small>day streak</small></div><div class="q-stat"><span>⚡</span><b>'+(p.xp||0)+'</b><small>total XP</small></div></div></section>'+
    '<div class="q-tabs"><button type="button" class="q-tab'+(ui.tab==='daily'?' on':'')+'" data-qtab="daily">📅 Daily Quests'+(readyN?' <em>'+readyN+'</em>':'')+'</button><button type="button" class="q-tab'+(ui.tab==='ach'?' on':'')+'" data-qtab="ach">🏅 Achievements</button></div>'+body+'</div>';
  lastSig=signature();
}
function signature(){
  const d=loadQuestData();
  return [ui.tab,ui.filter,JSON.stringify(d.progress||{}),JSON.stringify(d.claimed||{}),JSON.stringify(d.chestClaimed||{}),JSON.stringify(ach.claimed||{}),JSON.stringify(ach.values||{}),(state.progress||{}).xp].join('|');
}
async function loadAchievements(){
  if(ach.loading||!state.account)return;
  ach.loading=true;
  try{
    const r=await fetch('/api/account/achievements',{credentials:'same-origin',cache:'no-store'});
    if(r.ok){const d=await r.json();ach.claimed=d.claimed||{};ach.values=d.values||{};}
  }catch(e){}
  ach.loading=false;
  if(!ach.claimed){ach.claimed={};ach.values={};}   // offline: show empty state instead of spinning forever
  if(state.view==='quests')renderQuests();
}

/* ---------- views ---------- */
function ensureView(){
  const main=document.querySelector('.main');
  if(main&&!document.getElementById('view-quests')){
    const sec=document.createElement('section');sec.className='view';sec.id='view-quests';main.appendChild(sec);
  }
  const nav=document.getElementById('nav');
  if(nav&&!nav.querySelector('[data-view="quests"]')){
    const b=document.createElement('button');b.className='nav-btn';b.dataset.view='quests';
    b.innerHTML='<span></span><span>Quests</span>';
    const rewards=nav.querySelector('[data-view="rewards"]');
    nav.insertBefore(b,rewards||null);
  }
}
function openQuestView(){
  ensureView();
  if(!state.account){if(typeof openSignin==='function')openSignin();return;}
  state.view='quests';
  document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active');});
  const view=document.getElementById('view-quests');
  if(view)view.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.toggle('active',b.dataset.view==='quests');});
  const pop=document.getElementById('index-quest-popup');if(pop)pop.classList.remove('show');
  ach.claimed=null;ach.values=null;   // refresh from the server each time the tab opens
  renderQuests();
}

/* ---------- claims (server-authoritative) ---------- */
function applyServerState(result){
  if(result.state&&result.state.progress){
    state.progress={...state.progress,...result.state.progress,equipped:{...state.progress.equipped,...(result.state.progress.equipped||{})}};
    state.progress.skinCrates=Math.max(0,Math.floor(Number(result.state.progress.skinCrates)||0));
    state.progress.claimedSkinCrateLevels=Array.isArray(result.state.progress.claimedSkinCrateLevels)?result.state.progress.claimedSkinCrateLevels.slice():[];
  }
  try{recordActiveToday();}catch(e){}
  try{applyBattlePassRewards();}catch(e){}
  try{persistProgressLocalOnly();}catch(e){}
  if(result.quests){const local=loadQuestData();if(local.ctr)result.quests.ctr=local.ctr;saveQuestData(result.quests);}
  if(typeof renderSidebarBadge==='function')renderSidebarBadge();
  if(typeof renderXP==='function')renderXP();
  if(typeof renderRewards==='function'&&state.view==='rewards')renderRewards();
  if(typeof renderDashboard==='function'&&state.view==='dashboard')renderDashboard();
}
async function claimQuest(id){
  const q=quests().find(function(x){return x.id===id;});
  if(!q||!q.done||q.claimed)return false;
  const data=loadQuestData();
  data.claimed=data.claimed||{};
  const claimTime=Date.now();
  data.claimed[id]=claimTime;saveQuestData(data);renderQuests();
  try{
    const r=await fetch('/api/account/quest-claim',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({questId:id,day:data.day||dayKey(),claimedAt:claimTime,progress:data.progress||{}})});
    const result=await r.json().catch(function(){return {};});
    if(!r.ok)throw new Error(result.error||('claim '+r.status));
    if(!(result.state&&result.state.progress)){
      state.progress.xp=(state.progress.xp||0)+q.rewardXP;
      state.progress.skinCrates=Math.max(0,Math.floor(Number(state.progress.skinCrates)||0))+Number(q.rewardSkinCrates||0);
    }
    applyServerState(result);
    renderQuests();
    showRewardToast('🎉 Quest reward · '+(result.rewardText||q.reward));
    return true;
  }catch(err){
    const d2=loadQuestData();if(d2.claimed)delete d2.claimed[id];saveQuestData(d2);scheduleQuestServerSave(true);renderQuests();
    showRewardToast('Could not claim this quest yet. Please try again.');
    console.warn('Quest claim failed:',err);
    return false;
  }
}
async function postClaim(url,body,label){
  try{
    const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(body)});
    const result=await r.json().catch(function(){return {};});
    if(!r.ok)throw new Error(result.error||('claim '+r.status));
    applyServerState(result);
    return result;
  }catch(e){
    showRewardToast(e&&e.message&&!/^claim \d+$/.test(e.message)?e.message:'Could not claim that reward yet. Please try again.');
    return null;
  }
}
async function claimChest(tier){
  const res=await postClaim('/api/account/quest-chest-claim',{tier:tier});
  if(res){showRewardToast('🎁 Chest opened · '+(res.rewardText||''));try{celebrate();}catch(e){}renderQuests();}
}
async function claimAchievement(id){
  const res=await postClaim('/api/account/achievement-claim',{id:id});
  if(res){ach.claimed=res.claimed||ach.claimed;ach.values=null;showRewardToast('🏅 Achievement reward · '+(res.rewardText||''));try{celebrate();}catch(e){}loadAchievements();renderQuests();}
}
let claimingAll=false;
async function claimAll(){
  if(claimingAll)return;claimingAll=true;
  try{
    const ids=quests().filter(function(q){return q.done&&!q.claimed;}).map(function(q){return q.id;});
    for(let i=0;i<ids.length;i++){await claimQuest(ids[i]);}
  }finally{claimingAll=false;renderQuests();}
}

/* ---------- activity hooks (counters for metrics the app doesn't already store) ---------- */
function hook(name,fn){
  const o=window[name];
  if(typeof o!=='function'||o.__qhook)return;
  const w=function(){const before=fn.before?fn.before():null;const r=o.apply(this,arguments);try{fn(before,arguments);}catch(e){}return r;};
  w.__qhook=true;window[name]=w;
}
function installHooks(){
  const rc=function(){bump('cards',1);};
  hook('rateCard',rc);
  const sc=function(before){if(before!=null&&(Number(state.progress.skinCrates)||0)<before)bump('crates',1);};
  sc.before=function(){return Number(state.progress&&state.progress.skinCrates)||0;};
  hook('openSkinCrate',sc);
}
let lastActive=null,lastWave=null;
function pollGames(){
  const g=state.games;
  const act=g&&g.active?g.active:null;
  if(act&&act!==lastActive){bump('games',1);lastWave=null;}
  lastActive=act;
  if(act==='commander'&&typeof g.wave==='number'){
    if(lastWave===null)lastWave=g.wave;
    else if(g.wave>lastWave){bump('waves',Math.min(3,g.wave-lastWave));lastWave=g.wave;}
    else if(g.wave<lastWave)lastWave=g.wave;
  }
}

function wire(){
  ensureView();avatarFix();installHooks();
  document.addEventListener('click',function(e){
    const t=e.target;if(!t||!t.closest)return;
    const nav=t.closest('[data-view="quests"]');
    if(nav){e.preventDefault();openQuestView();return;}
    const tab=t.closest('[data-qtab]');
    if(tab){ui.tab=tab.dataset.qtab;renderQuests();return;}
    const f=t.closest('[data-qf]');
    if(f){ui.filter=f.dataset.qf;renderQuests();return;}
    const claim=t.closest('[data-action="claim-quest"]');
    if(claim){if(!state.account){if(typeof openSignin==='function')openSignin();return;}claimQuest(claim.dataset.quest);return;}
    const chest=t.closest('[data-action="claim-chest"]');
    if(chest){claimChest(chest.dataset.tier);return;}
    const a=t.closest('[data-action="claim-achievement"]');
    if(a){claimAchievement(a.dataset.id);return;}
    if(t.closest('[data-action="claim-all-quests"]')){claimAll();}
  });
  setInterval(function(){
    ensureView();avatarFix();installHooks();
    if(state.account){
      pollGames();
      updateQuestProgressFromApp();
      checkQuestCompletions();
      scheduleQuestServerSave();
      if(state.view==='quests'){
        if(signature()!==lastSig)renderQuests();
        const timer=document.getElementById('quest-reset-countdown');
        if(timer)timer.textContent=questCountdownText();
      }
    }else{questAccountKey='';lastQuestServerSignature='';}
  },1000);
}
async function startWhenReady(){
  if(!state.account){setTimeout(startWhenReady,500);return;}
  await loadQuestFromServer();
  ensureQuestDay();
  updateQuestProgressFromApp();
  scheduleQuestServerSave();
  checkQuestCompletions();
  if(state.view==='quests')renderQuests();
}
window.addEventListener('pagehide',function(){if(state.account){saveQuestData(questPayload());syncQuestToServer(true);}});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&state.account){saveQuestData(questPayload());syncQuestToServer(true);}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){wire();startWhenReady();});
else{wire();startWhenReady();}
})();
