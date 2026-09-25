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
style.textContent='.quest-page{padding-bottom:70px}.quest-hero{background:linear-gradient(135deg,#21194a,#5b43d6 58%,#ff5ca8);color:#fff;border-radius:26px;padding:26px;margin-bottom:18px;box-shadow:0 18px 42px rgba(91,67,214,.22)}.quest-hero h2{color:#fff;font-size:30px}.quest-hero p{color:rgba(255,255,255,.82);max-width:650px;line-height:1.55;font-size:13px}.quest-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}.quest-card{background:#fff;border:2px solid var(--line);border-radius:19px;padding:17px;box-shadow:0 7px 22px rgba(36,31,61,.05)}.quest-card.done{border-color:#2fd48b;background:#f5fffb}.quest-top{display:flex;gap:10px;align-items:flex-start}.quest-icon{width:40px;height:40px;border-radius:13px;background:#f1ecff;display:grid;place-items:center;font-size:21px}.quest-card h3{font-size:15px;margin:1px 0 4px}.quest-card p{font-size:12px;color:var(--ink-soft);line-height:1.45;margin:0}.quest-bar{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin:15px 0 7px}.quest-fill{height:100%;background:linear-gradient(90deg,var(--purple),var(--pink));border-radius:99px}.quest-bottom{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;font-weight:900}.quest-reward{color:#9a7200;background:#fff5c7;border-radius:999px;padding:5px 8px}.quest-complete{color:#159b68}.quest-popup-backdrop{position:fixed;inset:0;background:rgba(23,32,51,.28);backdrop-filter:blur(3px);z-index:19000}#index-quest-popup:not(.show){display:none!important}.quest-popup-card{position:fixed;z-index:19001;top:50%;left:50%;transform:translate(-50%,-50%) scale(.94);width:min(430px,90vw);background:#fffdf8;border:2px solid #ff5c4d;border-radius:22px;padding:28px;box-shadow:0 28px 80px rgba(23,32,51,.28);text-align:center;opacity:0}.quest-popup-card h3{font-family:var(--font-display);font-size:28px;margin:5px 0}.quest-popup-card p{color:#667085;line-height:1.5;font-size:13px}.quest-popup-icon{width:58px;height:58px;border-radius:18px;margin:0 auto 10px;display:grid;place-items:center;background:#dff7e9;color:#2f805e;font:900 30px var(--font-display)}.quest-popup-eyebrow{font-size:10px;font-weight:950;letter-spacing:.15em;color:#d9473a}.quest-popup-card .btn{margin-top:8px}#index-quest-popup.show .quest-popup-card{animation:questPopIn .22s ease forwards}@keyframes questPopIn{to{opacity:1;transform:translate(-50%,-50%) scale(1)}}';
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
    ai:Math.max(0,now.ai-Number(base.ai||0)),
    sets:Math.max(0,now.sets-Number(base.sets||0)),
    lessons:Math.max(0,now.lessons-Number(base.lessons||0)),
    xp:Math.max(0,now.xp-Number(base.xp||0)),
    packs:Math.max(0,now.packs-Number(base.packs||0))
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
    packs:Number(state.progress&&state.progress.openedPacks||0)
  };
}
function ensureQuestDay(){
  if(!state.account)return false;
  const k=accountKey(),d=dayKey(),data=loadQuestData();
  if(questAccountKey!==k||data.day!==d||!data.baseline){
    // A new Index day starts a completely new set of daily quests.
    // Never carry yesterday's claim/completion flags into today.
    saveQuestData({day:d,baseline:appSnapshot(),progress:{},claimed:{},announced:{}});
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
    ai:Math.max(0,Number(saved.ai)||0),
    sets:Math.max(0,Number(saved.sets)||0),
    lessons:Math.max(0,Number(saved.lessons)||0),
    xp:Math.max(0,Number(saved.xp)||0),
    packs:Math.max(0,Number(saved.packs)||0)
  };
}

function quests(){
  const s=snap(),p=loadQuestData();
  return [
    {id:'ai',icon:'💬',title:'Ask the Tutor',desc:'Ask the AI Tutor 3 times today.',goal:3,value:s.ai,rewardXP:15},
    {id:'set',icon:'🗂️',title:'Build Your Deck',desc:'Create 1 study set today.',goal:1,value:s.sets,rewardXP:10},
    {id:'lessons',icon:'🎓',title:'Topic Explorer',desc:'Finish 2 topic lessons today.',goal:2,value:s.lessons,rewardXP:20},
    {id:'xp',icon:'⚡',title:'Momentum',desc:'Earn 50 XP today.',goal:50,value:s.xp,rewardXP:25},
    {id:'packs',icon:'✦',title:'Open a Pack',desc:'Open 1 Indexling pack today.',goal:1,value:s.packs,rewardXP:15}
  ].map(function(q){
    q.value=Math.min(q.goal,Math.max(0,Number(q.value)||0));
    q.claimed=!!(p.claimed&&p.claimed[q.id]);
    q.done=q.value>=q.goal;
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
  el.innerHTML='<div class="quest-popup-backdrop"></div><div class="quest-popup-card"><div class="quest-popup-icon">✓</div><div class="quest-popup-eyebrow">QUEST COMPLETE</div><h3>'+q.title+'</h3><p>You completed this quest. Claim <strong>+'+q.rewardXP+' XP</strong> in the Quests tab.</p><button class="btn btn-primary" data-quest-popup-close>Continue</button></div>';
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
  data.progress={ai:s.ai,sets:s.sets,lessons:s.lessons,xp:s.xp,packs:s.packs};
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
  root.innerHTML='<div class="quest-page"><div class="quest-hero"><div class="eyebrow" style="color:#ffd8ef">DAILY STUDY MISSIONS</div><h2>Quests</h2><p>Complete actions in Index today to fill these missions. Nothing is marked complete from your existing progress when a new day starts.</p></div><div class="quest-grid">'+qs.map(function(q){
    return '<div class="quest-card '+(q.done?'done':'')+'"><div class="quest-top"><div class="quest-icon">'+q.icon+'</div><div><h3>'+q.title+'</h3><p>'+q.desc+'</p></div></div><div class="quest-bar"><div class="quest-fill" style="width:'+Math.round(q.value/q.goal*100)+'%"></div></div><div class="quest-bottom"><span>'+q.value+' / '+q.goal+(q.claimed?' · Claimed':'')+'</span>'+(q.claimed?'<span class="quest-complete">✓ Claimed</span>':q.done?'<button class="btn btn-green btn-sm" data-action="claim-quest" data-quest="'+q.id+'">Claim +'+q.rewardXP+' XP</button>':'<span class="quest-reward">+'+q.rewardXP+' XP</span>')+'</div></div>';
  }).join('')+'</div></div>';
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
        data.claimed[id]=Date.now();
        saveQuestData(data); scheduleQuestServerSave(true);
        state.progress.xp=(state.progress.xp||0)+q.rewardXP; syncQuestToServer(true);
        if(typeof persistProgress==='function')persistProgress();
        if(typeof renderSidebarBadge==='function')renderSidebarBadge();
        if(typeof renderXP==='function')renderXP();
        renderQuests();
      }
    }
  });
  setInterval(function(){
    ensureView();avatarFix();
    if(state.account){
      updateQuestProgressFromApp();
      checkQuestCompletions();
      scheduleQuestServerSave();
      if(state.view==='quests')renderQuests();
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