/* Lucky Spins: server-owned tokens. Spending one next to "Open pack" boosts the odds of that single opening (rarer Indexlings, still never guaranteed).
   Earned from the Battle Pass, study streaks, live games and paid memberships (the server counts them: see /api/spins). */
(function(){
'use strict';
if(window.LuckySpin) return;
var BOOST=1.5, S={n:0,earn:[],loaded:false}, armed=false, busy=false, lastFetch=0;
function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function signed(){ try{ return !!(state.account&&state.account.id); }catch(e){ return false; } }
function toast(m){ try{ showRewardToast(m); }catch(e){} }
function api(path,post){ return fetch(path,{method:post?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:post?{'Content-Type':'application/json'}:{},body:post?'{}':undefined}).then(function(r){ return r.json().catch(function(){return {};}).then(function(d){ d._s=r.status; return d; }); }); }
function apply(d){ if(d&&d.ok!==false&&typeof d.n==='number'){ S.n=d.n; if(d.earn) S.earn=d.earn; S.loaded=true; } decorate(); }
function sync(force){ if(!signed()) return Promise.resolve(); if(!force&&Date.now()-lastFetch<20000) return Promise.resolve(); lastFetch=Date.now(); return api('/api/spins').then(function(d){ if(d.gained>0) toast('🍀 You earned '+d.gained+' Lucky Spin'+(d.gained>1?'s':'')+'!'); apply(d); }).catch(function(){}); }
window.LuckySpin={
  mult:function(kind){ if(kind==='pack'&&armed){ armed=false; return BOOST; } return 1; },
  count:function(){ return S.n; }, sync:sync
};
function earnHtml(){
  var rows=(S.earn.length?S.earn:[{label:'Battle Pass',desc:'1 Lucky Spin every 5th level'},{label:'Study streak',desc:'1 for every 7 active days'},{label:'Live games',desc:'1 for every 5 live games'},{label:'Membership',desc:'Gold 1, Platinum 2, Diamond 4 per week'}]);
  return '<details class="ls-earn"><summary>How do I get Lucky Spins?</summary><ul>'+rows.map(function(r){ return '<li><b>'+esc(r.label)+'</b> — '+esc(r.desc)+'</li>'; }).join('')+'</ul><p>A Lucky Spin makes one pack opening about '+Math.round((BOOST-1)*100)+'% friendlier to Rare, Epic and Legendary Indexlings. It does not replace the pack cost.</p></details>';
}
function decorate(){
  var head=document.querySelector('.pack-showcase-head');
  if(head){
    var pill=head.querySelector('.ls-pill');
    if(!pill){ var holder=head.querySelector('div[style*="flex"]')||head; pill=document.createElement('div'); pill.className='coin-pill ls-pill'; holder.appendChild(pill); }
    pill.innerHTML='🍀 <span>'+S.n+'</span> Lucky Spin'+(S.n===1?'':'s');
    if(!head.parentNode.querySelector('.ls-earn')){ var w=document.createElement('div'); w.innerHTML=earnHtml(); head.parentNode.insertBefore(w.firstChild,head.nextSibling); }
  }
  document.querySelectorAll('.pack-option').forEach(function(card){
    var kind=card.getAttribute('data-pack'), open=card.querySelector('[data-action="open-pack"]'); if(!open||!kind) return;
    var b=card.querySelector('.ls-btn');
    if(!b){ b=document.createElement('button'); b.type='button'; b.className='btn btn-ghost ls-btn'; b.setAttribute('data-lucky-pack',kind); open.insertAdjacentElement('afterend',b); }
    b.disabled=open.disabled||S.n<1||busy; b.innerHTML='🍀 Lucky Spin <span class="ls-n">×'+S.n+'</span>'; b.title=S.n<1?'You have no Lucky Spins. Open "How do I get Lucky Spins?" above.':'Spend 1 Lucky Spin to boost the odds of this pack';
  });
}
document.addEventListener('click',function(e){
  var b=e.target&&e.target.closest&&e.target.closest('[data-lucky-pack]'); if(!b) return; e.preventDefault(); e.stopPropagation();
  var kind=b.getAttribute('data-lucky-pack'); if(busy||b.disabled) return;
  try{ if(state.rewardPackOpening) return; var cfg=packConfig(kind), tokens=Number(state.progress.freePackTokens)||0; if(tokens<=0&&(state.progress.coins||0)<cfg.cost){ toast('You need coins or a free pack token to open this pack.'); return; } if(packExpired(kind)){ toast('This limited-time pack has ended.'); return; } }catch(x){}
  busy=true; decorate();
  api('/api/spins/use',true).then(function(d){
    busy=false;
    if(d._s===200&&d.ok!==false){ apply(d); armed=true; toast('🍀 Lucky Spin! Better odds on this pack.'); try{ openRewardPack(kind); }catch(x){ armed=false; } setTimeout(function(){ armed=false; },2500); }
    else { apply(d); toast(d.error||'Could not use a Lucky Spin.'); }
  }).catch(function(){ busy=false; decorate(); toast('Could not reach the server. Try again.'); });
},true);
var raf=0; new MutationObserver(function(){ if(raf) return; raf=requestAnimationFrame(function(){ raf=0; if(document.querySelector('.pack-showcase-head')) decorate(); }); }).observe(document.documentElement,{childList:true,subtree:true});
setInterval(function(){ if(!document.hidden) sync(false); },60000);
var tries=0, iv=setInterval(function(){ if(signed()){ sync(true); clearInterval(iv); } else if(++tries>60) clearInterval(iv); },1000);
var st=document.createElement('style'); st.textContent='.ls-btn{margin-top:6px;width:100%;border-color:#3cc48f!important;color:#3cc48f!important;font-weight:800}.ls-btn:disabled{opacity:.5}.ls-n{opacity:.8}.ls-pill{color:#3cc48f}.ls-earn{margin:10px 0 0;padding:10px 14px;border-radius:12px;background:rgba(60,196,143,.1);font-size:13px;color:#d8f5e8}.ls-earn summary{cursor:pointer;font-weight:800}.ls-earn ul{margin:8px 0 6px 18px;padding:0}.ls-earn p{margin:4px 0 0;opacity:.85}'; document.head.appendChild(st);
})();
