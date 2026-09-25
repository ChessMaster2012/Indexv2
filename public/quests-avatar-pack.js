(function(){
'use strict';

const LOGOS={
  study:['#6d5dfc','#9b8cff','✎','STUDY'],
  focus:['#4da3ff','#7de0ff','◒','FOCUS'],
  candy:['#ff5ca8','#ffc0d8','◆','CANDY'],
  mastery:['#ff8a3d','#ffd166','★','MASTERY'],
  scholar:['#8b6cff','#cdbdff','⌘','SCHOLAR'],
  tech:['#20c997','#8cf0d0','<>','TECH'],
  legend:['#a855f7','#f5d0fe','✦','LEGEND']
};

const style=document.createElement('style');
style.textContent='.index-pack-logo{width:126px;height:126px;margin:0 auto 12px;position:relative;display:grid;place-items:center;filter:drop-shadow(0 14px 18px rgba(20,16,50,.24))}.index-pack-logo .ring{position:absolute;width:94px;height:94px;border-radius:28px;transform:rotate(7deg);background:linear-gradient(145deg,var(--b),var(--a));box-shadow:inset 0 3px 0 rgba(255,255,255,.55),inset 0 -8px 0 rgba(0,0,0,.12)}.index-pack-logo .core{position:relative;z-index:2;width:67px;height:67px;border-radius:21px;background:#fff;display:grid;place-items:center;font:900 30px/1 var(--font-display);color:var(--a);box-shadow:0 8px 16px rgba(0,0,0,.16);border:4px solid rgba(255,255,255,.8)}.index-pack-logo .label{position:absolute;z-index:3;bottom:5px;left:50%;transform:translateX(-50%);padding:4px 8px;border-radius:999px;background:#241f3d;color:#fff;font:900 8px/1 var(--font-ui);letter-spacing:.12em}.pack-option .pack-box{background:transparent!important;box-shadow:none!important;font-size:0!important}.quest-page{padding-bottom:70px}.quest-hero{background:linear-gradient(135deg,#21194a,#5b43d6 58%,#ff5ca8);color:#fff;border-radius:26px;padding:26px;margin-bottom:18px;box-shadow:0 18px 42px rgba(91,67,214,.22)}.quest-hero h2{color:#fff;font-size:30px}.quest-hero p{color:rgba(255,255,255,.82);max-width:650px;line-height:1.55;font-size:13px}.quest-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}.quest-card{background:#fff;border:2px solid var(--line);border-radius:19px;padding:17px;box-shadow:0 7px 22px rgba(36,31,61,.05)}.quest-card.done{border-color:#2fd48b;background:#f5fffb}.quest-top{display:flex;gap:10px;align-items:flex-start}.quest-icon{width:40px;height:40px;border-radius:13px;background:#f1ecff;display:grid;place-items:center;font-size:21px}.quest-card h3{font-size:15px;margin:1px 0 4px}.quest-card p{font-size:12px;color:var(--ink-soft);line-height:1.45;margin:0}.quest-bar{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin:15px 0 7px}.quest-fill{height:100%;background:linear-gradient(90deg,var(--purple),var(--pink));border-radius:99px}.quest-bottom{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;font-weight:900}.quest-reward{color:#9a7200;background:#fff5c7;border-radius:999px;padding:5px 8px}.quest-complete{color:#159b68}';
document.head.appendChild(style);

function logo(pack){
  const p=LOGOS[pack]||LOGOS.study;
  return '<div class="index-pack-logo" style="--a:'+p[0]+';--b:'+p[1]+'"><div class="ring"></div><div class="core">'+p[2]+'</div><div class="label">'+p[3]+'</div></div>';
}
function paint(){
  document.querySelectorAll('.pack-option[data-pack]').forEach(function(el){
    const box=el.querySelector('.pack-box');
    if(box) box.innerHTML=logo(el.dataset.pack);
  });
}

function avatarFix(){
  const slot=document.getElementById('profile-slot');
  if(!slot || slot.dataset.avatarFix) return;
  slot.dataset.avatarFix='1';
  slot.addEventListener('click',function(e){
    if(e.target.closest('.profile-btn,.signin-btn')){
      e.preventDefault();
      e.stopImmediatePropagation();
      if(typeof openSignin==='function') openSignin();
    }
  },true);
}

const KEY='index-quest-progress-v1';
function load(){
  try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){return {};}
}
function save(x){
  try{localStorage.setItem(KEY,JSON.stringify(x));}catch(e){}
}
function snap(){
  const p=load();
  return {
    ai:Array.isArray(state.chat)?state.chat.filter(function(x){return x.role==='user';}).length:0,
    sets:Array.isArray(state.studySets)?state.studySets.length:0,
    lessons:Array.isArray(state.progress&&state.progress.lessonsLearned)?state.progress.lessonsLearned.length:0,
    practice:Number(p.practice||0),
    xp:Number(state.progress&&state.progress.xp||0)
  };
}
function quests(){
  const s=snap(), p=load(), set=state.studySets&&state.studySets[0];
  return [
    {id:'ai',icon:'💬',title:'Ask the Tutor',desc:'Ask the AI Tutor 3 study questions.',goal:3,value:s.ai,reward:15},
    {id:'practice',icon:'🧠',title:'Practice Run',desc:set?'Practice a study set 5 times.':'Create a study set, then practice it 5 times.',goal:5,value:s.practice,reward:20},
    {id:'lessons',icon:'🎓',title:'Topic Explorer',desc:'Finish 2 topic lessons.',goal:2,value:s.lessons,reward:20},
    {id:'set',icon:'🗂️',title:'Build Your Deck',desc:'Create a study set.',goal:1,value:s.sets,reward:10},
    {id:'xp',icon:'⚡',title:'Momentum',desc:'Earn 50 XP from studying.',goal:50,value:s.xp,reward:25}
  ].map(function(q){
    q.value=Math.min(q.goal,q.value);
    q.claimed=!!(p.claimed&&p.claimed[q.id]);
    q.done=q.value>=q.goal;
    return q;
  });
}
function renderQuests(){
  const root=document.getElementById('view-quests');
  if(!root)return;
  const qs=quests();
  root.innerHTML='<div class="quest-page"><div class="quest-hero"><div class="eyebrow" style="color:#ffd8ef">DAILY STUDY MISSIONS</div><h2>Quests</h2><p>Your quests react to what you actually do in Index: study sets, topic lessons, AI Tutor questions, and XP.</p></div><div class="quest-grid">'+qs.map(function(q){
    return '<div class="quest-card '+(q.done?'done':'')+'"><div class="quest-top"><div class="quest-icon">'+q.icon+'</div><div><h3>'+q.title+'</h3><p>'+q.desc+'</p></div></div><div class="quest-bar"><div class="quest-fill" style="width:'+Math.round(q.value/q.goal*100)+'%"></div></div><div class="quest-bottom"><span>'+q.value+' / '+q.goal+(q.claimed?' · Claimed':'')+'</span>'+(q.claimed?'<span class="quest-complete">✓ Complete</span>':q.done?'<button class="btn btn-green btn-sm" data-action="claim-quest" data-quest="'+q.id+'">Claim +'+q.reward+' 🪙</button>':'<span class="quest-reward">+'+q.reward+' 🪙</span>')+'</div></div>';
  }).join('')+'</div></div>';
}
function ensureView(){
  const main=document.querySelector('.main');
  if(main && !document.getElementById('view-quests')){
    const sec=document.createElement('section');
    sec.className='view';
    sec.id='view-quests';
    main.appendChild(sec);
  }
  const nav=document.getElementById('nav');
  if(nav && !nav.querySelector('[data-view="quests"]')){
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
  state.view='quests';
  document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active');});
  document.getElementById('view-quests').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.toggle('active',b.dataset.view==='quests');});
  renderQuests();
}
function wire(){
  ensureView();
  avatarFix();
  paint();
  document.addEventListener('click',function(e){
    const nav=e.target.closest('[data-view="quests"]');
    if(nav){e.preventDefault();openQuestView();return;}
    const claim=e.target.closest('[data-action="claim-quest"]');
    if(claim){
      const id=claim.dataset.quest, q=quests().find(function(x){return x.id===id;});
      if(q&&q.done&&!q.claimed){
        const p=load();p.claimed=p.claimed||{};p.claimed[id]=Date.now();save(p);
        state.progress.coins=(state.progress.coins||0)+q.reward;
        if(typeof persistProgress==='function')persistProgress();
        if(typeof renderSidebarBadge==='function')renderSidebarBadge();
        if(typeof showRewardToast==='function')showRewardToast('🪙 +'+q.reward+' coins · Quest complete!');
        renderQuests();
      }
    }
  },true);
  setInterval(function(){
    avatarFix();ensureView();paint();
    if(state.view==='quests')renderQuests();
  },1200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();