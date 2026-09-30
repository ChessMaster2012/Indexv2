(function(){
'use strict';

const LOGOS={
  candy:['#ff5ca8','#ffc0d8','🍬','CANDY'],
  medieval:['#9b7655','#d8b58a','♜','MEDIEVAL'],
  robo:['#2ac7b2','#9af3e3','⚙','ROBO'],
  ocean:['#3aa7d8','#98e7ff','≈','OCEAN'],
  arcade:['#7f6cff','#cbbfff','◈','ARCADE'],
  cosmic:['#6f7cff','#d3d6ff','✦','COSMIC']
};

const style=document.createElement('style');
style.textContent='.quest-page{padding-bottom:70px}.quest-hero{background:linear-gradient(135deg,#21194a,#5b43d6 58%,#ff5ca8);color:#fff;border-radius:26px;padding:26px;margin-bottom:18px;box-shadow:0 18px 42px rgba(91,67,214,.22)}.quest-hero h2{color:#fff;font-size:30px}.quest-hero p{color:rgba(255,255,255,.82);max-width:650px;line-height:1.55;font-size:13px}.quest-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}.quest-card{background:#fff;border:2px solid var(--line);border-radius:19px;padding:17px;box-shadow:0 7px 22px rgba(36,31,61,.05)}.quest-card.done{border-color:#2fd48b;background:#f5fffb}.quest-card.quest-hard{border-color:#ffb84d;background:#fffaf0}.quest-section{margin-bottom:24px}.quest-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 2px 10px;flex-wrap:wrap}.quest-section-head>div{display:flex;align-items:center;gap:8px;font-size:17px}.quest-category-icon{font-size:19px}.quest-section-subtitle{font-size:11px;color:var(--ink-soft);font-weight:700}.quest-top{display:flex;gap:10px;align-items:flex-start}.quest-icon{width:40px;height:40px;border-radius:13px;background:#f1ecff;display:grid;place-items:center;font-size:21px}.quest-card h3{font-size:15px;margin:1px 0 4px}.quest-card p{font-size:12px;color:var(--ink-soft);line-height:1.45;margin:0}.quest-bar{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin:15px 0 7px}.quest-fill{height:100%;background:linear-gradient(90deg,var(--purple),var(--pink));border-radius:99px}.quest-bottom{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;font-weight:900}.quest-reward{color:#9a7200;background:#fff5c7;border-radius:999px;padding:5px 8px}.quest-complete{color:#159b68}.quest-popup-backdrop{position:fixed;inset:0;background:rgba(23,32,51,.28);backdrop-filter:blur(3px);z-index:19000}#index-quest-popup:not(.show){display:none!important}.quest-popup-card{position:fixed;z-index:19001;top:50%;left:50%;transform:translate(-50%,-50%) scale(.94);width:min(430px,90vw);background:#fffdf8;border:2px solid #ff5c4d;border-radius:22px;padding:28px;box-shadow:0 28px 80px rgba(23,32,51,.28);text-align:center;opacity:0}.quest-popup-card h3{font-family:var(--font-display);font-size:28px;margin:5px 0}.quest-popup-card p{color:#667085;line-height:1.5;font-size:13px}.quest-popup-icon{width:58px;height:58px;border-radius:18px;margin:0 auto 10px;display:grid;place-items:center;background:#dff7e9;color:#2f805e;font:900 30px var(--font-display)}.quest-popup-eyebrow{font-size:10px;font-weight:950;letter-spacing:.15em;color:#d9473a}.quest-popup-card .btn{margin-top:8px}#index-quest-popup.show .quest-popup-card{animation:questPopIn .22s ease forwards}@keyframes questPopIn{to{opacity:1;transform:translate(-50%,-50%) scale(1)}}';
document.head.appendChild(style);
function paint(){
  // Pack artwork is owned by public/index.html. Do not overwrite it here.
}

function avatarFix(){
  const slot=document.getElementById('profile-slot');
  if(slot)slot.dataset.avatarFix='1';
}

let questAccountKey='';
const QUEST_VERSION='v6';

function dayKey(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function accountKey(){
  const a=state.account;
  return a && (a.id||a.userId||a.email) ? String(a.id||a.userId||a.email) : '';
}
function storageKey(){
  return 'index-quest-'+QUEST_VERSION+'-'+accountKey();
}
function loadQuestData(){
  if(!accountKey())return {};
  try{return JSON.parse(localStorage.getItem(storageKey())||'{}')||{};}catch(e){return {};}
}
function saveQuestData(data){
  if(!accountKey())return;
  try{localStorage.setItem(storageKey(),JSON.stringify(data));}catch(e){}
}
let questServerSaveTimer=null;
let questServerSaveInFlight=false;
let questServerSaveQueued=false;
let lastQuestServerSignature='';
function updateQuestProgressFromApp(){
  if(!state.account||!ensureQuestDay())return;
  const data=loadQuestData(),now=appSnapshot(),base=data.baseline||now;
  const next={
    login:1,
    ai:Math.max(0,now.ai-Number(base.ai||0)),
    sets:Math.max(0,now.sets-Number(base.sets||0)),
    lessons:Math.max(0,now.lessons-Number(base.lessons||0)),
    xp:Math.max(0,now.xp-Number(base.xp||0)),
    packs:Math.max(0,now.packs-Number(base.packs||0)),
    liveGames:Math.max(0,now.liveGames-Number(base.liveGames||0))
  };
  const prev=data.progress||{};
  if(JSON.stringify(prev)!==JSON.stringify(next)){
    data.progress=next;
    saveQuestData(data);
    return next;
  }
  return prev;
}
function questPayload(){
  const data=loadQuestData();
  updateQuestProgressFromApp();
  const fresh=loadQuestData();
  return {
    day:fresh.day||dayKey(),
    baseline:fresh.baseline||appSnapshot(),
    progress:fresh.progress||{},
    claimed:fresh.claimed||{},
    announced:fresh.announced||{}
  };
}
async function syncQuestToServer(keepalive=false){
  if(!state.account)return;
  if(questServerSaveInFlight){questServerSaveQueued=true;return;}
  questServerSaveInFlight=true;
  try{
    const payload={quests:questPayload()};
    const signature=JSON.stringify(payload.quests);
    const r=await fetch('/api/account/quests',{method:'PUT',headers:{'content-type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(payload),keepalive});
    if(!r.ok)throw new Error('quest sync '+r.status);
    lastQuestServerSignature=signature;
  }catch(e){}finally{
    questServerSaveInFlight=false;
    if(questServerSaveQueued){questServerSaveQueued=false;setTimeout(()=>syncQuestToServer(),0);}
  }
}
function scheduleQuestServerSave(immediate=false){
  if(!state.account)return;
  updateQuestProgressFromApp();
  const signature=JSON.stringify({quests:questPayload()});
  if(!immediate&&signature===lastQuestServerSignature)return;
  clearTimeout(questServerSaveTimer);
  questServerSaveTimer=setTimeout(()=>syncQuestToServer(),immediate?0:500);
}

async function loadQuestFromServer(){
  if(!state.account)return false;
  try{
    const r=await fetch('/api/account/quests',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)return false;
    const d=await r.json();
    if(d.quests){
      saveQuestData(d.quests);
      questAccountKey=accountKey();
      lastQuestServerSignature=JSON.stringify({quests:d.quests});
      return true;
    }
  }catch(e){}
  return false;
}
function appSnapshot(){
  return {
    ai:Array.isArray(state.chat)?state.chat.filter(function(x){return x && x.role==='user';}).length:0,
    sets:Array.isArray(state.studySets)?state.studySets.length:0,
    lessons:Array.isArray(state.progress&&state.progress.lessonsLearned)?state.progress.lessonsLearned.length:0,
    xp:Number(state.progress&&state.progress.xp||0),
    packs:Number(state.progress&&state.progress.openedPacks||0),
    liveGames:Number(state.progress&&state.progress.liveGames||0)
  };
}
function ensureQuestDay(){
  if(!state.account)return false;
  const k=accountKey(),d=dayKey(),data=loadQuestData();
  if(questAccountKey!==k||data.day!==d||!data.baseline){
    // A new Index day starts a completely new set of daily quests.
    // Never carry yesterday's claim/completion flags into today.
    saveQuestData({day:d,baseline:appSnapshot(),progress:{login:1},claimed:{},announced:{}});
    questAccountKey=k;
    scheduleQuestServerSave(true);
  }
  return true;
}
function snap(){
  if(!ensureQuestDay())return {ai:0,sets:0,lessons:0,xp:0,packs:0};
  updateQuestProgressFromApp();
  const data=loadQuestData(),saved=data.progress||{};
  return {
    login:1,
    ai:Math.max(0,Number(saved.ai)||0),
    sets:Math.max(0,Number(saved.sets)||0),
    lessons:Math.max(0,Number(saved.lessons)||0),
    xp:Math.max(0,Number(saved.xp)||0),
    packs:Math.max(0,Number(saved.packs)||0),
    liveGames:Math.max(0,Number(saved.liveGames)||0)
  };
}

const QUEST_DEFS=[
  {id:'login',category:'Daily',icon:'🌅',title:'Daily Check-In',desc:'Sign in to Index today.',goal:1,metric:'login',rewardXP:25,rewardCoins:20,rewardPackTokens:0},
  {id:'ai',category:'Daily',icon:'💬',title:'Ask the Tutor',desc:'Ask the AI Tutor 3 times today.',goal:3,metric:'ai',rewardXP:50,rewardCoins:0,rewardPackTokens:0},
  {id:'set',category:'Study',icon:'🗂️',title:'Build Your Deck',desc:'Create 1 study set today.',goal:1,metric:'sets',rewardXP:75,rewardCoins:10,rewardPackTokens:0},
  {id:'lessons',category:'Study',icon:'🎓',title:'Topic Explorer',desc:'Finish 2 topic lessons today.',goal:2,metric:'lessons',rewardXP:100,rewardCoins:0,rewardPackTokens:0},
  {id:'live',category:'Study',icon:'🎮',title:'Live Challenger',desc:'Play 1 Live Game today.',goal:1,metric:'liveGames',rewardXP:100,rewardCoins:15,rewardPackTokens:0},
  {id:'ai2',category:'Challenge',icon:'🧠',title:'Tutor Marathon',desc:'Ask the AI Tutor 6 times today.',goal:6,metric:'ai',rewardXP:75,rewardCoins:20,rewardPackTokens:0},
  {id:'lessons2',category:'Challenge',icon:'📚',title:'Topic Master',desc:'Finish 4 topic lessons today.',goal:4,metric:'lessons',rewardXP:125,rewardCoins:25,rewardPackTokens:0},
  {id:'packs2',category:'Challenge',icon:'📦',title:'Pack Collector',desc:'Open 2 Indexling packs today.',goal:2,metric:'packs',rewardXP:100,rewardCoins:25,rewardPackTokens:1},
  {id:'ai10',category:'Challenge',icon:'🔥',title:'Tutor Endurance',desc:'Ask the AI Tutor 10 times today.',goal:10,metric:'ai',rewardXP:150,rewardCoins:35,rewardPackTokens:1},
  {id:'xp',category:'Milestone',icon:'⚡',title:'Momentum',desc:'Earn 100 XP today.',goal:100,metric:'xp',rewardXP:75,rewardCoins:15,rewardPackTokens:0},
  {id:'xp2',category:'Milestone',icon:'🚀',title:'XP Rush',desc:'Earn 250 XP today.',goal:250,metric:'xp',rewardXP:150,rewardCoins:30,rewardPackTokens:1},
  {id:'lessons6',category:'Milestone',icon:'🏆',title:'Course Crusher',desc:'Finish 6 topic lessons today.',goal:6,metric:'lessons',rewardXP:200,rewardCoins:40,rewardPackTokens:1}
];
function questRewardText(q){
  const parts=[];
  if(q.rewardXP)parts.push('+'+q.rewardXP+' XP');
  if(q.rewardCoins)parts.push('+'+q.rewardCoins+' 🪙');
  if(q.rewardPackTokens)parts.push('+'+q.rewardPackTokens+' 🎁 Free Pack');
  if(q.rewardSkinCrates)parts.push('+'+q.rewardSkinCrates+' 🧰 Skin Crate'+(q.rewardSkinCrates===1?'':'s'));
  return parts.join(' · ');
}
function questSetForDay(){
  // Rotate the available quests at the same midnight-ET reset used by progress.
  // A deterministic daily shuffle means every signed-in device sees the same set.
  const day=dayKey();
  let seed=0;
  for(let i=0;i<day.length;i++) seed=((seed<<5)-seed+day.charCodeAt(i))|0;
  const list=QUEST_DEFS.slice();
  for(let i=list.length-1;i>0;i--){
    seed=(seed*1664525+1013904223)|0;
    const j=Math.abs(seed)% (i+1);
    const tmp=list[i]; list[i]=list[j]; list[j]=tmp;
  }
  // Keep the quest board varied while retaining enough choices for every category.
  const selected=[];
  ['Daily','Study','Challenge','Milestone'].forEach(function(category){
    const first=list.find(function(q){return q.category===category;});
    if(first) selected.push(first);
  });
  list.forEach(function(q){if(selected.indexOf(q)<0 && selected.length<8) selected.push(q);});
  return selected;
}
function nextQuestResetMs(){
  const now=new Date();
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=function(t){return Number(parts.find(function(x){return x.type===t;})?.value||0);};
  const tomorrow=new Date(Date.UTC(get('year'),get('month')-1,get('day')+1));
  const y=tomorrow.getUTCFullYear(),m=String(tomorrow.getUTCMonth()+1).padStart(2,'0'),d=String(tomorrow.getUTCDate()).padStart(2,'0');
  const offsetPart=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'longOffset'}).formatToParts(now).find(function(x){return x.type==='timeZoneName';});
  const offset=String(offsetPart?.value||'GMT-04:00').replace('GMT','');
  const target=Date.parse(y+'-'+m+'-'+d+'T00:00:00'+offset);
  return Number.isFinite(target)?target:Date.now()+86400000;
}
function questCountdownText(){
  const left=Math.max(0,nextQuestResetMs()-Date.now());
  const total=Math.floor(left/1000);
  const h=Math.floor(total/3600);
  const m=Math.floor((total%3600)/60);
  const sec=total%60;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}
function quests(){
  const s=snap(),p=loadQuestData();
  const defs=questSetForDay();
  return defs.map(function(def){
    const q={...def,value:Math.min(def.goal,Math.max(0,Number(s[def.metric])||0))};
    q.claimed=!!(p.claimed&&p.claimed[q.id]);
    q.done=q.value>=q.goal;
    q.reward=questRewardText(q);
    return q;
  });
}
function showQuestCompletion(q){
  let el=document.getElementById('index-quest-popup');
  if(!el){
    el=document.createElement('div');
    el.id='index-quest-popup';
    document.body.appendChild(el);
  }
  el.innerHTML='<div class="quest-popup-backdrop"></div><div class="quest-popup-card"><div class="quest-popup-icon">✓</div><div class="quest-popup-eyebrow">QUEST COMPLETE</div><h3>'+q.title+'</h3><p>You completed this quest. Claim <strong>'+q.reward+'</strong> in the Quests tab.</p><button class="btn btn-primary" data-quest-popup-close>Continue</button></div>';
  el.classList.add('show');
  const close=el.querySelector('[data-quest-popup-close]');
  if(close)close.onclick=function(){el.classList.remove('show');};
  const backdrop=el.querySelector('.quest-popup-backdrop');
  if(backdrop)backdrop.onclick=function(){el.classList.remove('show');};
  clearTimeout(showQuestCompletion._timer);
  showQuestCompletion._timer=setTimeout(function(){if(el)el.classList.remove('show');},7000);
}
function checkQuestCompletions(){
  if(!state.account||!ensureQuestDay())return;
  const data=loadQuestData(),current=quests();
  const s=snap();
  data.progress={ai:s.ai,sets:s.sets,lessons:s.lessons,xp:s.xp,packs:s.packs,liveGames:s.liveGames};
  data.announced=data.announced||{};
  let changed=false;
  current.forEach(function(q){
    if(q.done&&!q.claimed&&!data.announced[q.id]){
      data.announced[q.id]=Date.now();
      changed=true;
      showQuestCompletion(q);
    }
  });
  if(changed){saveQuestData(data);scheduleQuestServerSave(true);}
}
function renderQuests(){
  const root=document.getElementById('view-quests');
  if(!root||!state.account)return;
  const qs=quests();
  const categories=['Daily','Study','Challenge','Milestone'];
  const icons={Daily:'🌅',Study:'📚',Challenge:'🔥',Milestone:'🏆'};
  const sections=categories.map(function(category){
    const items=qs.filter(q=>q.category===category);
    return '<section class="quest-section"><div class="quest-section-head"><div><span class="quest-category-icon">'+icons[category]+'</span><strong>'+category+'</strong></div><span class="quest-section-subtitle">'+(category==='Daily'?'Quick wins that refresh every day.':category==='Study'?'Build progress through normal studying.':category==='Challenge'?'Harder goals with stronger rewards.':'Longer-term daily milestones.')+'</span></div><div class="quest-grid">'+items.map(function(q){
      const pct=Math.round(q.value/q.goal*100);
      const action=q.claimed?'<span class="quest-complete">✓ Claimed</span>':q.done?'<button class="btn btn-green btn-sm" data-action="claim-quest" data-quest="'+q.id+'">Claim '+q.reward+'</button>':'<span class="quest-reward">'+q.reward+'</span>';
      return '<div class="quest-card '+(q.done?'done':'')+' '+(q.category==='Challenge'?'quest-hard':'')+'"><div class="quest-top"><div class="quest-icon">'+q.icon+'</div><div><h3>'+q.title+'</h3><p>'+q.desc+'</p></div></div><div class="quest-bar"><div class="quest-fill" style="width:'+pct+'%"></div></div><div class="quest-bottom"><span>'+q.value+' / '+q.goal+(q.claimed?' · Claimed':'')+'</span>'+action+'</div></div>';
    }).join('')+'</div></section>';
  }).join('');
  root.innerHTML='<div class="quest-page"><div class="quest-hero"><div class="eyebrow" style="color:#ffd8ef">DAILY MISSIONS</div><h2>Quests</h2><p>Complete daily study missions, tougher challenges, and milestone quests. The whole quest board rotates when the timer reaches zero.</p><div style="display:inline-flex;align-items:center;gap:8px;margin-top:12px;padding:9px 12px;border-radius:12px;background:rgba(255,255,255,.14);font-weight:900;font-size:13px"><span>🔄 New quests in</span><span id="quest-reset-countdown">'+questCountdownText()+'</span></div></div>'+sections+'</div>';
}
function ensureView(){
  const main=document.querySelector('.main');
  if(main&&!document.getElementById('view-quests')){
    const sec=document.createElement('section');
    sec.className='view';
    sec.id='view-quests';
    main.appendChild(sec);
  }
  const nav=document.getElementById('nav');
  if(nav&&!nav.querySelector('[data-view="quests"]')){
    const b=document.createElement('button');
    b.className='nav-btn';
    b.dataset.view='quests';
    b.innerHTML='<span>🎯</span><span>Quests</span>';
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
  renderQuests();
}
function wire(){
  ensureView();
  avatarFix();
  document.addEventListener('click',function(e){
    const nav=e.target.closest('[data-view="quests"]');
    if(nav){e.preventDefault();openQuestView();return;}
    const claim=e.target.closest('[data-action="claim-quest"]');
    if(claim){
      if(!state.account){if(typeof openSignin==='function')openSignin();return;}
      const id=claim.dataset.quest,q=quests().find(function(x){return x.id===id;});
      if(q&&q.done&&!q.claimed){
        const data=loadQuestData();
        data.claimed=data.claimed||{};
        const claimTime=Date.now();
        data.claimed=data.claimed||{};
        data.claimed[id]=claimTime;
        saveQuestData(data);
        // Claim XP through one server transaction so quest completion and Battle Pass
        // XP cannot race each other or overwrite one another during sign-out/reload.
        fetch('/api/account/quest-claim',{
          method:'POST',
          headers:{'content-type':'application/json'},
          credentials:'same-origin',
          cache:'no-store',
          body:JSON.stringify({questId:id, day:data.day||dayKey(), claimedAt:claimTime, progress:data.progress||{}})
        }).then(async function(r){
          const result=await r.json().catch(function(){return {};});
          if(!r.ok) throw new Error(result.error||('claim '+r.status));
          if(result.state&&result.state.progress){
            // The server has already committed the quest XP. Apply the same
            // Battle Pass pipeline used by normal XP rewards so level-ups,
            // cosmetic unlocks, and the visible Battle Pass update immediately.
            state.progress={...state.progress,...result.state.progress,equipped:{...state.progress.equipped,...(result.state.progress.equipped||{})}};
            state.progress.skinCrates=Math.max(0,Math.floor(Number(result.state.progress.skinCrates)||0));
            state.progress.claimedSkinCrateLevels=Array.isArray(result.state.progress.claimedSkinCrateLevels)
              ? result.state.progress.claimedSkinCrateLevels.slice()
              : [];
            state.progress.skinCrates=Math.max(0,Math.floor(Number(result.state.progress.skinCrates)||0));
          }else{
            state.progress.xp=(state.progress.xp||0)+q.rewardXP;
            state.progress.skinCrates=Math.max(0,Math.floor(Number(state.progress.skinCrates)||0))+Number(q.rewardSkinCrates||0);
          }
          recordActiveToday();
          applyBattlePassRewards();
          persistProgressLocalOnly();
          // The quest-claim endpoint already committed the complete account state,
          // including Skin Crates and Battle Pass claim ledgers. Do not immediately
          // PUT the older browser snapshot back over that authoritative result.
          if(result.quests){
            saveQuestData(result.quests);
          }else{
            scheduleQuestServerSave(true);
          }
          if(typeof renderSidebarBadge==='function')renderSidebarBadge();
          if(typeof renderXP==='function')renderXP();
          if(typeof renderRewards==='function'&&state.view==='rewards')renderRewards();
          if(typeof renderDashboard==='function'&&state.view==='dashboard')renderDashboard();
          renderQuests();
          showRewardToast('🎉 Quest reward · '+(result.rewardText||q.reward));
        }).catch(function(err){
          // Do not leave a locally "claimed" quest without its server reward.
          delete data.claimed[id];
          saveQuestData(data);
          scheduleQuestServerSave(true);
          renderQuests();
          showRewardToast('Could not claim this quest yet. Please try again.');
          console.warn('Quest claim failed:',err);
        });
      }
    }
  });
  setInterval(function(){
    ensureView();avatarFix();
    if(state.account){
      updateQuestProgressFromApp();
      checkQuestCompletions();
      scheduleQuestServerSave();
      if(state.view==='quests'){
        renderQuests();
        const timer=document.getElementById('quest-reset-countdown');
        if(timer)timer.textContent=questCountdownText();
      }
    }else{
      questAccountKey='';
      lastQuestServerSignature='';
    }
  },1000);}
async function startWhenReady(){
  if(!state.account){setTimeout(startWhenReady,500);return;}
  await loadQuestFromServer();
  ensureQuestDay();
  updateQuestProgressFromApp();
  scheduleQuestServerSave();
  checkQuestCompletions();
  scheduleQuestServerSave();
  if(state.view==='quests')renderQuests();
}
window.addEventListener('pagehide',function(){if(state.account){saveQuestData(questPayload());syncQuestToServer(true);}});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&state.account){saveQuestData(questPayload());syncQuestToServer(true);}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){wire();startWhenReady();});
else {wire();startWhenReady();}
})();