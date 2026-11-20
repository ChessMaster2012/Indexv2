/* Admin panel (owner only) + pickup of grants queued for this account. */
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s);};
function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function toast(m){ try{ showRewardToast(m); }catch(e){} }
function api(path,body){
  return fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},credentials:'same-origin',cache:'no-store',body:body?JSON.stringify(body):undefined})
    .then(function(r){return r.json().catch(function(){return {};}).then(function(d){d._status=r.status;return d;});});
}

/* ---------- every player: apply grants from the owner ---------- */
var applying=false;
function applyGrants(){
  if(applying||typeof state==='undefined'||!state.account||!state.progress) return;
  applying=true;
  api('/api/account/grants').then(function(d){
    var list=(d&&d.grants)||[]; if(!list.length) return;
    var p=state.progress, lines=[]; if(d.epoch!=null) p.grantEpoch=d.epoch;
    list.forEach(function(g){
      if(g.coins){ p.coins=Math.max(0,(p.coins||0)+g.coins); lines.push((g.coins>0?'+':'')+g.coins+' coins'); }
      if(g.tokens){ p.freePackTokens=Math.max(0,(p.freePackTokens||0)+g.tokens); lines.push((g.tokens>0?'+':'')+g.tokens+' pack tokens'); }
      if(g.crates){ p.skinCrates=Math.max(0,(p.skinCrates||0)+g.crates); lines.push((g.crates>0?'+':'')+g.crates+' skin crates'); }
      if(g.xp){ p.xp=Math.max(0,(p.xp||0)+g.xp); lines.push((g.xp>0?'+':'')+g.xp+' XP'); }
      if(g.resetDaily){ p.dailyCoinEarned=0; p.dailyCoinDate=''; }
      if(g.unlockAll){
        try{ p.unlockedCosmetics=Array.from(new Set((p.unlockedCosmetics||[]).concat(REWARD_COSMETICS.map(function(c){return c.id;})))); }catch(e){}
        try{ p.unlockedSkins=Array.from(new Set((p.unlockedSkins||[]).concat(INDEXLING_SKINS.map(function(c){return c.id;})))); }catch(e){}
        lines.push('every cosmetic and skin');
      }
    });
    try{ if(window.SeasonCore&&SeasonCore.apply){ SeasonCore.ensure(p); SeasonCore.apply(p); } }catch(e){}
    try{ persistProgress(); }catch(e){}
    try{ updateCoinDisplays(); }catch(e){}
    try{ if(typeof renderDashboard==='function') renderDashboard(); }catch(e){}
    return api('/api/account/grants/ack',{ids:list.map(function(g){return g.id;})}).then(function(){
      toast('Gift received: '+(lines.slice(0,4).join(', ')||'a surprise')+'!');
    });
  }).catch(function(){}).then(function(){ applying=false; });
}
setTimeout(applyGrants,3500);
setInterval(applyGrants,45000);
document.addEventListener('visibilitychange',function(){ if(!document.hidden) applyGrants(); });

/* ---------- owner: the panel ---------- */
var css=document.createElement('style');
css.textContent=
'#view-admin .ad-wrap{max-width:980px}'+
'#view-admin .ad-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}'+
'#view-admin .ad-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}'+
'#view-admin .ad-card h3{margin:0 0 12px;font-size:17px}'+
'#view-admin label{display:block;font-size:12px;font-weight:600;color:var(--ink-soft);margin:10px 0 4px}'+
'#view-admin input[type=text],#view-admin input[type=number],#view-admin select{width:100%;padding:9px 11px;border-radius:8px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink);font:inherit}'+
'#view-admin .ad-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}'+
'#view-admin .ad-find{display:flex;gap:8px}'+
'#view-admin .ad-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}'+
'#view-admin .ad-chip{padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink-soft);font-size:12px;cursor:pointer}'+
'#view-admin .ad-chip:hover{color:var(--ink);border-color:var(--ink-soft)}'+
'#view-admin .ad-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}'+
'#view-admin .ad-stat{border:1px solid var(--line);border-radius:8px;padding:8px 10px}'+
'#view-admin .ad-stat b{display:block;font-size:18px}#view-admin .ad-stat span{font-size:11px;color:var(--ink-soft)}'+
'#view-admin .ad-check{display:flex;gap:8px;align-items:center;margin:10px 0 0;font-size:13px;font-weight:500;color:var(--ink)}'+
'#view-admin .ad-msg{margin-top:10px;font-size:13px}#view-admin .ad-msg.bad{color:#ff8a7a}#view-admin .ad-msg.good{color:#8fd694}'+
'#view-admin .ad-log{font-size:13px;line-height:1.6}#view-admin .ad-log div{padding:6px 0;border-top:1px solid var(--line)}'+
'@media(max-width:820px){#view-admin .ad-grid{grid-template-columns:1fr}}';
document.head.appendChild(css);

var target=null;
function ensure(){
  var main=document.querySelector('.main'), nav=document.getElementById('nav');
  if(!main||!nav) return false;
  var ex=$('#view-admin'); if(ex&&!$('.ad-wrap',ex)){ ex.remove(); }
  if(!$('#view-admin')){
    var sec=document.createElement('section'); sec.className='view'; sec.id='view-admin'; var foot=main.querySelector('.app-footer'); if(foot&&foot.parentNode) foot.parentNode.insertBefore(sec,foot); else main.appendChild(sec);
    sec.innerHTML='<div class="ad-wrap"><h2 style="font-size:24px;font-weight:600;margin:0">Admin panel</h2>'+
      '<p class="lede" style="margin:4px 0 18px">Only your account can see this. Find a player by email or username, then give or take items.</p>'+
      '<div class="ad-grid"><div>'+
      '<div class="ad-card"><h3>1. Find a player</h3><div class="ad-find"><input type="text" id="ad-q" placeholder="email or username" autocomplete="off"><button class="btn btn-primary" id="ad-find" type="button">Find</button></div><div id="ad-user"></div><div class="ad-msg" id="ad-findmsg"></div></div>'+
      '<div class="ad-card" style="margin-top:16px"><h3>Recent actions</h3><div class="ad-log" id="ad-log">Nothing yet this session.</div></div>'+
      '<div class="ad-card" style="margin-top:16px"><h3>StudentVUE check</h3><p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 6px">Signs in through StudentVUE’s newer app connection and shows the shape of what comes back (your own grades only). Nothing is saved. Use your own account.</p><input type="text" id="ad-svu" placeholder="https://md-mcps-psv.edupoint.com" value="https://md-mcps-psv.edupoint.com"><div class="ad-row"><input type="text" id="ad-svi" placeholder="Student ID" autocomplete="off"><input type="password" id="ad-svp" placeholder="Password" autocomplete="off"></div><div style="margin-top:10px"><button class="btn btn-ghost" id="ad-svgo" type="button">Run check</button></div><textarea id="ad-svout" readonly style="display:none;width:100%;height:220px;margin-top:10px;background:rgba(255,255,255,.04);color:var(--ink);border:1px solid var(--line);border-radius:8px;font:12px/1.4 monospace;padding:8px"></textarea></div>'+
      '<div class="ad-card" style="margin-top:16px"><h3>Anti-cheat alerts</h3><div class="ad-log" id="ad-sec">Loading…</div></div>'+
      '</div><div class="ad-card"><h3>2. Give or take</h3>'+
      '<p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 4px">Use a negative number to take items away. They arrive the next time the player is online.</p>'+
      '<div class="ad-row"><div><label>Coins</label><input type="number" id="ad-coins" placeholder="0"></div><div><label>Free pack tokens</label><input type="number" id="ad-tokens" placeholder="0"></div></div>'+
      '<div class="ad-row"><div><label>Skin crates</label><input type="number" id="ad-crates" placeholder="0"></div><div><label>XP</label><input type="number" id="ad-xp" placeholder="0"></div></div>'+
      '<div class="ad-row"><div><label>AI Tutor credits</label><input type="number" id="ad-credits" placeholder="0"></div><div><label>Note (optional)</label><input type="text" id="ad-note" maxlength="120" placeholder="shown only in your log"></div></div>'+
      '<div class="ad-chips" id="ad-quick"><button class="ad-chip" data-f="coins" data-v="1000">+1,000 coins</button><button class="ad-chip" data-f="coins" data-v="10000">+10,000 coins</button><button class="ad-chip" data-f="tokens" data-v="5">+5 tokens</button><button class="ad-chip" data-f="crates" data-v="5">+5 crates</button><button class="ad-chip" data-f="credits" data-v="50">+50 credits</button></div>'+
      '<label>Membership</label><div class="ad-row"><select id="ad-tier"><option value="">No change</option><option value="gold">Gold</option><option value="platinum">Platinum</option><option value="diamond">Diamond</option><option value="free">Remove membership</option></select>'+
      '<select id="ad-days"><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="life">Lifetime</option></select></div>'+
      '<label>Badge</label><select id="ad-badge"><option value="">No change</option><option value="gold">Give Gold badge</option><option value="platinum">Give Platinum badge</option><option value="diamond">Give Diamond badge</option><option value="remove">Remove badge</option></select>'+
      '<label>Account type</label><select id="ad-role"><option value="">No change</option><option value="student">Student</option><option value="teacher">Teacher</option></select>'+
      '<label class="ad-check"><input type="checkbox" id="ad-unlock"> Unlock every cosmetic and Indexling skin</label>'+
      '<label class="ad-check"><input type="checkbox" id="ad-reset"> Reset their daily coin cap</label>'+
      '<div style="margin-top:14px;display:flex;gap:8px"><button class="btn btn-primary" id="ad-send" type="button">Send to player</button><button class="btn btn-ghost" id="ad-clear" type="button">Clear</button></div>'+
      '<div class="ad-msg" id="ad-msg"></div></div></div></div>';
    wire(sec);
  }
  if(!nav.querySelector('[data-view="admin"]')){
    var b=document.createElement('button'); b.className='nav-btn'; b.dataset.view='admin'; b.type='button';
    b.innerHTML='<span></span><span>Admin</span>';
    var last=nav.querySelector('[data-view="rewards"]'); nav.insertBefore(b,last?last.nextSibling:null);
    b.addEventListener('click',function(){ setTimeout(function(){ try{ ensure(); var v=$('#view-admin'); if(v&&!v.classList.contains('active')){ document.querySelectorAll('.view').forEach(function(x){x.classList.remove('active');}); v.classList.add('active'); } }catch(err){ var vv=$('#view-admin'); if(vv) vv.innerHTML='<p style="padding:20px">Admin panel error: '+esc(err.message)+'</p>'; } refreshLog(); $('#ad-q')&&$('#ad-q').focus(); },60); });
    try{ if(window.IX&&IX.icon){ b.firstElementChild.className='ix-nav'; b.firstElementChild.innerHTML=IX.icon('shield-check',19); } }catch(e){}
  }
  return true;
}
function stat(l,v){ return '<div class="ad-stat"><b>'+esc(v)+'</b><span>'+esc(l)+'</span></div>'; }
function renderUser(u){
  target=u; var el=$('#ad-user'); if(!el) return;
  if(!u){ el.innerHTML=''; return; }
  var m=u.membership||{};
  el.innerHTML='<div style="margin-top:14px"><div style="font-weight:700;font-size:16px">'+esc(u.username||'(no username)')+(u.owner?' · owner':'')+'</div>'+
    '<div style="font-size:13px;color:var(--ink-soft)">'+esc(u.email)+' · '+esc(u.role)+(u.hasData?'':' · has not opened the app yet')+'</div>'+
    '<div style="font-size:13px;margin-top:6px">Plan: <b>'+esc(m.tier)+'</b>'+(m.daysLeft?' · '+m.daysLeft+' days left':'')+(m.badge?' · '+esc(m.badge)+' badge':'')+'</div>'+
    '<div class="ad-stats">'+stat('Coins',u.coins.toLocaleString())+stat('Pack tokens',u.tokens)+stat('Skin crates',u.crates)+stat('XP',u.xp.toLocaleString())+stat('Packs opened',u.openedPacks)+stat('Notes / sets',u.notes+' / '+u.studySets)+'</div>'+
    (u.banned?'<div class="ad-msg bad" style="font-weight:600">BANNED ('+esc(u.banned.by||'')+'): '+esc(u.banned.reason||'')+'</div>':'')+
    (u.strikes?'<div style="font-size:12px;color:#ffb36b;margin-top:6px">'+u.strikes+' anti-cheat flag(s) in the last 7 days</div>':'')+
    '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><input type="text" id="ad-banreason" placeholder="Ban reason" style="flex:1;min-width:150px">'+(u.banned?'<button class="btn btn-primary" id="ad-unban" type="button">Unban</button>':'<button class="btn btn-ghost" id="ad-ban" type="button" style="color:#ff8a7a;border-color:#ff8a7a">Ban player</button>')+'</div>'+
    (u.owner?'<div class="ad-msg bad" style="margin-top:10px">This is an owner account. Owner accounts always have unlimited coins, tokens and crates, so gifts to it will not show an exact amount. To test the amounts, send them to a normal player account.</div>':'')+
    '<div style="font-size:12px;color:var(--ink-soft);margin-top:8px">The numbers above are the last saved copy. A gift reaches a player when their browser next checks (within about a minute, or when they open Index) and then shows exactly.'+(u.pendingGrants?' <b>'+u.pendingGrants+' gift(s) waiting.</b>':'')+'</div></div>';
}
function say(id,txt,cls){ var e=$(id); if(e){ e.textContent=txt||''; e.className='ad-msg'+(cls?' '+cls:''); } }
function find(){
  var q=($('#ad-q').value||'').trim(); if(!q){ say('#ad-findmsg','Type an email or username.','bad'); return Promise.resolve(); }
  say('#ad-findmsg','Looking…');
  return api('/api/admin/lookup',{q:q}).then(function(d){
    if(!d.ok){ renderUser(null); say('#ad-findmsg',d.error||'Not found.','bad'); return; }
    say('#ad-findmsg',''); renderUser(d.user);
  });
}
function num(id){ var v=$(id).value; return v===''?0:Math.trunc(Number(v)||0); }
function clearForm(){ ['#ad-coins','#ad-tokens','#ad-crates','#ad-xp','#ad-credits','#ad-note'].forEach(function(s){$(s).value='';}); $('#ad-tier').value=''; $('#ad-badge').value=''; $('#ad-role').value=''; $('#ad-unlock').checked=false; $('#ad-reset').checked=false; }
function send(){
  if(!target){ say('#ad-msg','Find a player first.','bad'); return; }
  var tier=$('#ad-tier').value, days=$('#ad-days').value;
  var body={q:target.email||target.username,coins:num('#ad-coins'),tokens:num('#ad-tokens'),crates:num('#ad-crates'),xp:num('#ad-xp'),credits:num('#ad-credits'),
    note:$('#ad-note').value,unlockAll:$('#ad-unlock').checked,resetDaily:$('#ad-reset').checked};
  if(tier) body.membership=tier==='free'?{tier:'free'}:{tier:tier,days:days==='life'?30:Number(days),lifetime:days==='life'};
  if($('#ad-badge').value) body.badge=$('#ad-badge').value;
  if($('#ad-role').value) body.role=$('#ad-role').value;
  var big=Math.abs(body.coins)>=1000000||Math.abs(body.crates)>=1000;
  if(big&&!confirm('That is a large amount. Send it to '+(target.username||target.email)+'?')) return;
  say('#ad-msg','Sending…'); $('#ad-send').disabled=true;
  api('/api/admin/grant',body).then(function(d){
    $('#ad-send').disabled=false;
    if(!d.ok){ say('#ad-msg',d.error||'Failed.','bad'); return; }
    say('#ad-msg','Sent: '+d.done.join(', ')+'.','good'); renderUser(d.user); clearForm(); refreshLog();
  }).catch(function(){ $('#ad-send').disabled=false; say('#ad-msg','Network problem. Try again.','bad'); });
}
function refreshLog(){
  refreshSec();
  api('/api/admin/log').then(function(d){
    var el=$('#ad-log'); if(!el||!d.ok) return;
    el.innerHTML=d.log.length?d.log.map(function(x){ return '<div><b>'+esc(x.to)+'</b>: '+esc(x.did)+(x.note?' — '+esc(x.note):'')+'<br><span style="color:var(--ink-soft);font-size:12px">'+new Date(x.t).toLocaleTimeString()+'</span></div>'; }).join(''):'Nothing yet since the last server restart.';
  });
}
function banAction(kind){
  if(!target) return;
  var reason=($('#ad-banreason')&&$('#ad-banreason').value||'').trim();
  if(kind==='ban'&&!confirm('Ban '+(target.username||target.email)+'? They are signed out immediately.')) return;
  api('/api/admin/'+kind,{q:target.email||target.username,reason:reason||'Banned by the Index owner'}).then(function(d){
    if(!d.ok){ say('#ad-findmsg',d.error||'Failed.','bad'); return; }
    say('#ad-findmsg',kind==='ban'?'Banned.':'Unbanned.','good'); renderUser(d.user); refreshLog();
  });
}
function refreshSec(){
  api('/api/admin/security-log').then(function(d){
    var el=$('#ad-sec'); if(!el||!d.ok) return;
    el.innerHTML=d.log.length?d.log.slice(0,15).map(function(x){ return '<div><b>'+esc(x.user)+'</b> · '+esc(x.kind)+'<br><span style="color:var(--ink-soft);font-size:12px">'+esc(x.detail)+' · '+new Date(x.t).toLocaleTimeString()+'</span></div>'; }).join(''):'No flags since the last server restart.';
  });
}
function wire(sec){
  sec.addEventListener('click',function(e){ if(e.target.id==='ad-svgo'){ var o=$('#ad-svout'); o.style.display='block'; o.value='Running…'; api('/api/admin/sv-probe',{url:$('#ad-svu').value,username:$('#ad-svi').value,password:$('#ad-svp').value}).then(function(d){ o.value=d.ok?d.report:(d.error||'Failed'); $('#ad-svp').value=''; o.select(); }); }
    if(e.target.id==='ad-ban') banAction('ban'); if(e.target.id==='ad-unban') banAction('unban'); });
  $('#ad-find',sec).addEventListener('click',find);
  $('#ad-q',sec).addEventListener('keydown',function(e){ if(e.key==='Enter') find(); });
  $('#ad-send',sec).addEventListener('click',send);
  $('#ad-clear',sec).addEventListener('click',clearForm);
  $('#ad-quick',sec).addEventListener('click',function(e){
    var b=e.target.closest('[data-f]'); if(!b) return;
    var inp=$('#ad-'+b.dataset.f); inp.value=(Number(inp.value)||0)+Number(b.dataset.v);
  });
}
document.addEventListener('click',function(e){
  var b=e.target&&e.target.closest&&e.target.closest('.nav-btn[data-view="admin"]');
  if(b){ try{ ensure(); }catch(err){} if(!$('#view-admin')){ e.stopPropagation(); e.preventDefault(); } }
},true);
var tries=0, iv=setInterval(function(){
  tries++;
  if(window.OwnerMode&&OwnerMode.active()){ if(ensure()) clearInterval(iv); }
  if(tries>240) clearInterval(iv);
},1500);
})();
