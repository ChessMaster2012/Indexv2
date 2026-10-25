/* Live Game v2 — presentation + settings layer.
   Loaded after the main script. Overrides the live-game render functions and wires extra host
   settings, new question formats (multiple choice / true-false / type-in), late join, lock, kick.
   Socket event names and legacy actions are unchanged. Creator + Library live in live-creator.js. */
(function(){
'use strict';
var LV = window.LV = { q:null, lock:null, pending:false, done:null, endsAt:0, durMs:0, clockTimer:null, src:'mine', chosen:null, libQuery:'', libSubject:'', libSort:'new', libResults:null, libLoading:false, libErr:'', typed:'', pick:null };
var CFG_DEFAULTS = { questionCount:10, durationMin:5, wrongPauseSec:2, shuffleQuestions:true, shuffleAnswers:false, showLeaderboard:true, maxPlayers:50, title:'', pointsMode:'speed', allowLateJoin:false, lives:1, locked:false };
var LETTERS = ['A','B','C','D'];
var SHAPES = ['▲','◆','●','■'];
var SUBJ_LABEL = { general:'General', math:'Math', science:'Science', english:'English', history:'History', languages:'Languages', cs:'Computer Science', arts:'Arts', other:'Other' };
window.LV_SUBJ_LABEL = SUBJ_LABEL;
function cfg(){ var c = state.live.config = Object.assign({}, CFG_DEFAULTS, state.live.config||{}); if(c.wrongPauseMs) c.wrongPauseSec = c.wrongPauseMs/1000; return c; }
function $(id){ return document.getElementById(id); }
function keepScroll(fn){ var y = window.scrollY; fn(); window.scrollTo(0, y); }
window.lvRerender = function(){ keepScroll(function(){ renderLive(); }); };
function fmtTypes(list){ var n={mc:'Multiple choice',tf:'True / False',type:'Type-in'}; return (list||[]).map(function(t){return n[t]||t;}).join(' · '); }
function typeOf(q){ return (q && q.type) || 'mc'; }
function formatsOf(qs){ var s={}; (qs||[]).forEach(function(q){ s[typeOf(q)]=1; }); return Object.keys(s); }
window.lvFmtTypes = fmtTypes; window.lvFormatsOf = formatsOf;

/* ---------- teardown / exit ---------- */
var _teardown = window.liveTeardown;
window.liveTeardown = function(){
  _teardown();
  stopClock();
  if(socket){ ['room:kicked','room:roster','room:started','room:tick','room:board','room:state','player:question','player:state','answer:result','room:intro','room:event'].forEach(function(e){ socket.removeAllListeners(e); }); }
  LV.q=null; LV.lock=null; LV.pending=false; LV.done=null;
  state.live.config = Object.assign({}, CFG_DEFAULTS);
  LV.typed=''; LV.pick=null; LV.chosen=null;
};

/* ---------- render router ---------- */
window.renderLive = function(){
  var stage = $('live-stage'); if(!stage) return;
  var scr = state.live.screen;
  var exitBtn = $('live-exit-btn');
  if(exitBtn){ exitBtn.classList.toggle('hidden', scr==='hub'); exitBtn.textContent = (scr==='host-lobby'||scr==='host-play'||scr==='player-wait'||scr==='player-play') ? 'Leave game' : '← Hub'; }
  stage.className = 'lv lv-'+scr;
  var map = {
    'hub':lvHub, 'host-setup':lvSetup, 'host-lobby':lvLobby, 'host-play':lvHostPlay, 'join-form':lvJoin,
    'player-wait':lvWait, 'player-play':lvPlayerPlay, 'ended':lvEnded
  };
  var fn = map[scr] || (window.lvCreatorScreens && window.lvCreatorScreens[scr]);
  stage.innerHTML = fn ? fn() : lvHub();
  if(scr==='host-setup') lvSetupRefresh();
  if(window.lvAfterRender) window.lvAfterRender(scr);
};

/* ---------- hub ---------- */
function lvHub(){
  var sets = (state.customSets||[]).length;
  return '<div class="lv-hero"><div class="lv-hero-text"><p class="lv-eyebrow">LIVE ARENA</p><h2>Play together. Learn faster.</h2><p>Host a real-time quiz for your class or study group, or join one with a code — no account needed to play.</p></div>'+
  '<form class="lv-quickjoin" data-lv-form="quickjoin"><label for="lv-qj-code">Have a code?</label><div class="lv-qj-row"><input id="lv-qj-code" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="ABCDE" aria-label="Room code"><button class="btn btn-green" type="submit">Join</button></div></form></div>'+
  '<div class="lv-cards">'+
    hubCard('host','🎤','Host a game','Pick a mode, choose or create questions, tune the rules, and share a code.','host-setup')+
    hubCard('join','🎮','Join a game','Enter a room code and your nickname to jump into a live round.','join-form')+
    hubCard('create','✍️','Create a question set','Build your own questions: multiple choice, true/false and type-in answers.','creator-list','<span class="lv-badge">'+sets+' saved</span>')+
    hubCard('library','🌍','Browse the library','Discover sets published by other students. Host one in a click.','library')+
  '</div>'+
  '<div class="lv-modes-strip"><h3>Game modes</h3><div class="lv-modes-row">'+Object.keys(GAME_MODES).map(function(k){var m=GAME_MODES[k];return '<div class="lv-mode-pill" title="'+esc(m.desc)+'"><span>'+m.icon+'</span><b>'+esc(m.label)+'</b></div>';}).join('')+'</div></div>';
}
function hubCard(cls,icon,title,text,go,extra){
  return '<button class="lv-card lv-card-'+cls+'" data-lv="goto" data-screen="'+go+'"><span class="lv-card-ico">'+icon+'</span><span class="lv-card-body"><b>'+title+'</b><span>'+text+'</span></span>'+(extra||'')+'<span class="lv-card-arrow" aria-hidden="true">→</span></button>';
}

/* ---------- host setup ---------- */
function lvSetup(){
  var c = cfg();
  var quizSets = state.studySets.filter(function(s){return s.type==='quiz';});
  var tabs = [['mine','My quizzes',quizSets.length],['custom','My sets',(state.customSets||[]).length],['library','Library',null],['ai','Generate with AI',null]];
  return '<button class="btn btn-ghost btn-sm lv-back" data-lv="goto" data-screen="hub">← Back</button>'+
  '<div class="lv-setup"><div class="lv-setup-main">'+
  '<header class="lv-page-head"><p class="lv-eyebrow">HOST STUDIO</p><h3>Build your live game</h3><p>Choose a mode, pick your questions, then fine-tune the rules.</p></header>'+
  '<section class="lv-panel"><h4><span class="lv-step">1</span> Game mode</h4><div class="lv-mode-grid">'+
    Object.keys(GAME_MODES).map(function(k){var m=GAME_MODES[k];return '<button class="lv-mode '+(state.live.mode===k?'on':'')+'" data-lv="mode" data-mode="'+k+'" aria-pressed="'+(state.live.mode===k)+'"><span class="lv-mode-ico">'+m.icon+'</span><b>'+esc(m.label)+'</b><span>'+esc(m.desc)+'</span></button>';}).join('')+
  '</div></section>'+
  '<section class="lv-panel"><h4><span class="lv-step">2</span> Questions</h4>'+
    '<div class="lv-chosen" id="lv-chosen">'+chosenHtml()+'</div>'+
    '<div class="lv-tabs" role="tablist">'+tabs.map(function(t){return '<button role="tab" class="lv-tab '+(LV.src===t[0]?'on':'')+'" data-lv="src" data-src="'+t[0]+'" aria-selected="'+(LV.src===t[0])+'">'+t[1]+(t[2]!==null?' <i>'+t[2]+'</i>':'')+'</button>';}).join('')+'</div>'+
    '<div class="lv-src" id="lv-src">'+srcHtml(quizSets)+'</div></section>'+
  '<section class="lv-panel"><h4><span class="lv-step">3</span> Rules & settings</h4>'+
    '<div class="lv-presets"><span>Quick presets</span>'+['classroom:Classroom','sprint:Sprint','review:Study session','chill:Relaxed'].map(function(p){var a=p.split(':');return '<button class="lv-chip-btn" data-lv="preset" data-preset="'+a[0]+'">'+a[1]+'</button>';}).join('')+'</div>'+
    '<div class="lv-settings">'+
      slider('durationMin','Game length',1,30,1,c.durationMin,' min')+
      slider('wrongPauseSec','Wrong-answer pause',1,5,1,c.wrongPauseSec,'s')+
      slider('questionCount','Questions in the pool',1,maxQ(),1,c.questionCount,'')+
      slider('maxPlayers','Player limit',2,100,1,c.maxPlayers,'')+
      (['zombie','gems','elimination'].indexOf(state.live.mode)>=0 ? '' : segment('pointsMode','Scoring',[['speed','Speed bonus','Faster answers earn more'],['flat','Flat','Every correct answer is worth the same'],['finale','Final minute ×2','Speed bonus, last minute doubled']],c.pointsMode))+
      '<div class="lv-set-card lv-wide"><label class="lv-set-lab" for="lv-title">Game title <em>optional</em></label><input id="lv-title" data-cfg="title" type="text" maxlength="70" value="'+esc(c.title)+'" placeholder="e.g. AP Gov Unit 1 Challenge"></div>'+
      '<div class="lv-set-card lv-wide"><p class="lv-fine lv-pace-note">⏱️ Everyone plays at their own pace on one shared game clock. Each player gets their own question stream — a wrong answer freezes just that player for the pause, and questions repeat if someone runs through the whole pool.</p><div class="lv-toggles">'+
        toggle('shuffleQuestions','Shuffled question order','Each player gets their own random order. Off = everyone goes in order',c.shuffleQuestions)+
        toggle('shuffleAnswers','Shuffle answer choices','Applies to multiple choice, different for each player',c.shuffleAnswers)+
        toggle('showLeaderboard','Live leaderboard for players','The host screen always shows standings',c.showLeaderboard)+
        toggle('allowLateJoin','Allow late joiners','Players can hop in after the game starts',c.allowLateJoin)+
      '</div></div>'+
    '</div></section></div>'+
  '<aside class="lv-setup-side"><div class="lv-summary-card"><h4>Your game</h4><div id="lv-sum"></div><div id="live-setup-status"></div><button class="btn btn-primary btn-lg lv-create" data-lv="create" id="lv-create-btn">🚀 Create room</button><p class="lv-fine">Players join with a 5-letter code. Names and questions are filtered for school-appropriate language.</p></div></aside></div>';
}
function maxQ(){ return Math.max(1, Math.min(50, LV.chosen ? LV.chosen.questions.length : 50)); }
function chosenHtml(){
  var ch = LV.chosen;
  if(!ch) return '<div class="lv-chosen-empty">No questions selected yet — choose a set below.</div>';
  return '<div class="lv-chosen-ok"><span class="lv-check">✓</span><div><b>'+esc(ch.title)+'</b><span>'+ch.questions.length+' question'+(ch.questions.length===1?'':'s')+' · '+esc(fmtTypes(formatsOf(ch.questions)))+'</span></div><button class="btn btn-ghost btn-sm" data-lv="clear-chosen">Change</button></div>';
}
function srcHtml(quizSets){
  if(LV.src==='mine'){
    if(!quizSets.length) return '<p class="lv-empty">You have no AI quizzes yet. Try “Generate with AI”, or build your own in “My sets”.</p>';
    return '<div class="lv-pick-list">'+quizSets.map(function(s){var subj=subjectById(s.subjectId);return '<button class="lv-pick '+(LV.chosen&&LV.chosen.id==='q:'+s.id?'on':'')+'" data-lv="pick-quiz" data-id="'+s.id+'"><b>'+esc(s.title)+'</b><span>'+(subj?esc(subj.name)+' · ':'')+s.questions.length+' questions</span></button>';}).join('')+'</div>';
  }
  if(LV.src==='custom'){
    var cs = state.customSets||[];
    var list = cs.length ? '<div class="lv-pick-list">'+cs.map(function(s){return '<button class="lv-pick '+(LV.chosen&&LV.chosen.id==='c:'+s.id?'on':'')+'" data-lv="pick-custom" data-id="'+s.id+'"><b>'+esc(s.title)+'</b><span>'+s.questions.length+' questions · '+esc(fmtTypes(formatsOf(s.questions)))+'</span></button>';}).join('')+'</div>' : '<p class="lv-empty">You haven’t made any sets yet.</p>';
    return list+'<button class="btn btn-ghost btn-sm" data-lv="goto" data-screen="creator-list">✍️ Manage / create sets</button>';
  }
  if(LV.src==='library') return window.lvLibraryPicker ? window.lvLibraryPicker() : '';
  var subjId = state.live.hostSubjectId || SUBJECTS[0].id;
  return '<div class="lv-ai"><div class="builder-row"><div class="field"><label>Course</label><select id="live-topic-subject">'+SUBJECTS.map(function(s){return '<option value="'+s.id+'" '+(s.id===subjId?'selected':'')+'>'+esc(s.name)+'</option>';}).join('')+'</select></div>'+
    '<div class="field"><label>Suggested topic</label><select id="live-topic-preset"><option value="">Choose a topic…</option>'+liveTopicOptionsHtml(subjId)+'</select></div></div>'+
    '<div class="field"><label>Or type your own topic</label><input type="text" id="live-topic-input" placeholder="e.g. The Cold War"></div>'+
    '<p class="lv-fine">The AI builds a multiple-choice quiz when you press Create room.</p></div>';
}
function slider(key,label,min,max,step,val,suffix,inline){
  return '<div class="lv-set-card'+(inline?' lv-inline':'')+'"><label class="lv-set-lab" for="lv-'+key+'"><span>'+label+'</span><b data-cfgval="'+key+'">'+val+suffix+'</b></label><input id="lv-'+key+'" type="range" data-cfg="'+key+'" data-num="1" data-suffix="'+suffix+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+Math.min(val,max)+'"></div>';
}
function segment(key,label,opts,val){
  return '<div class="lv-set-card lv-wide"><div class="lv-set-lab"><span>'+label+'</span></div><div class="lv-seg" role="radiogroup" aria-label="'+label+'">'+opts.map(function(o){return '<button role="radio" aria-checked="'+(val===o[0])+'" class="lv-seg-btn '+(val===o[0]?'on':'')+'" data-lv="seg" data-key="'+key+'" data-val="'+o[0]+'"><b>'+o[1]+'</b><span>'+o[2]+'</span></button>';}).join('')+'</div></div>';
}
function toggle(key,label,hint,on){
  return '<label class="lv-toggle"><input type="checkbox" data-cfg="'+key+'" data-bool="1" '+(on?'checked':'')+'><span class="lv-switch" aria-hidden="true"></span><span class="lv-toggle-t"><b>'+label+'</b><em>'+hint+'</em></span></label>';
}
function lvSetupRefresh(){
  var c = cfg(), sum = $('lv-sum'); if(!sum) return;
  var m = GAME_MODES[state.live.mode], ch = LV.chosen;
  var count = ch ? Math.min(c.questionCount, ch.questions.length) : (LV.src==='ai'?c.questionCount:0);
  sum.innerHTML = '<div class="lv-sum-mode"><span>'+m.icon+'</span><b>'+esc(m.label)+'</b></div><ul>'+
    '<li><span>Game length</span><b>'+c.durationMin+' min</b></li>'+
    '<li><span>Question pool</span><b>'+(ch?count:(LV.src==='ai'?count+' (AI)':'—'))+'</b></li>'+
    '<li><span>Order</span><b>'+(c.shuffleQuestions?'Shuffled per player':'In order')+'</b></li>'+
    '<li><span>Wrong answer</span><b>'+c.wrongPauseSec+'s pause</b></li>'+
    '<li><span>Scoring</span><b>'+({speed:'Speed bonus',flat:'Flat',finale:'Final min ×2'}[c.pointsMode])+'</b></li>'+
    '<li><span>Players</span><b>up to '+c.maxPlayers+'</b></li>'+
    '<li><span>Late join</span><b>'+(c.allowLateJoin?'On':'Off')+'</b></li></ul>';
  var btn = $('lv-create-btn'); if(btn) btn.disabled = !(ch || LV.src==='ai');
}
function applyPreset(name){
  var c = cfg();
  var P = { classroom:{durationMin:8,wrongPauseSec:2,shuffleQuestions:true,shuffleAnswers:false,showLeaderboard:true,pointsMode:'speed',allowLateJoin:false},
    sprint:{durationMin:3,wrongPauseSec:2,shuffleQuestions:true,shuffleAnswers:true,showLeaderboard:true,pointsMode:'finale'},
    review:{durationMin:15,wrongPauseSec:1,shuffleQuestions:false,shuffleAnswers:false,showLeaderboard:false,pointsMode:'flat'},
    chill:{durationMin:10,wrongPauseSec:1,shuffleQuestions:true,shuffleAnswers:false,showLeaderboard:true,pointsMode:'flat',allowLateJoin:true} }[name];
  Object.assign(c, P); c.questionCount = Math.min(c.questionCount, maxQ());
}
window.lvChoose = function(id,title,questions,subjectId){
  LV.chosen = { id:id, title:title, questions:questions, subjectId:subjectId||'' };
  var c = cfg(); c.questionCount = Math.min(Math.max(c.questionCount,1), questions.length);
  if(!c.title) c.title = '';
};
/* host a set directly from creator / library */
window.lvHostSet = function(id,title,questions,subjectId){
  window.lvChoose(id,title,questions,subjectId); LV.src = id.charAt(0)==='l'?'library':(id.charAt(0)==='c'?'custom':'mine');
  state.live.screen='host-setup'; renderLive(); window.scrollTo(0,0);
};

/* ---------- create room ---------- */
async function lvCreate(){
  var c = cfg(), status = $('live-setup-status');
  if(LV.src==='ai' && !LV.chosen){
    var subjectId = $('live-topic-subject').value, preset = $('live-topic-preset').value, topic = preset || $('live-topic-input').value.trim();
    if(!topic){ status.innerHTML='<div class="error-note">Enter a topic first.</div>'; return; }
    if(!state.aiEnabled){ status.innerHTML='<div class="error-note">'+esc(localAiUnavailableMessage)+' Pick a set instead.</div>'; return; }
    status.innerHTML='<div class="loading-line"><span class="spinner"></span> Building your quiz…</div>';
    try{
      var set = await buildStudySet({subjectId:subjectId, topic:topic, type:'quiz', count:Math.min(30,Math.max(1,c.questionCount)), sourceText:null});
      renderStudySets();
      liveCreateRoom(set.questions, set.subjectId, c.title || set.title);
    }catch(e){ status.innerHTML='<div class="error-note">'+esc(explainAiError(e,'Quiz generation'))+'</div>'; }
    return;
  }
  if(!LV.chosen){ status.innerHTML='<div class="error-note">Choose a question set first.</div>'; return; }
  if(LV.chosen.id.charAt(0)==='l' && window.lvCountPlay) window.lvCountPlay(LV.chosen.id.slice(2));
  liveCreateRoom(LV.chosen.questions, LV.chosen.subjectId, c.title || LV.chosen.title);
}
window.readLiveConfig = function(){ /* config is updated live by input handlers */ };
window.liveCreateRoom = function(questions, subjectId, title){
  ensureSocket(); bindReconnect();
  var c = cfg();
  socket.emit('host:create', { title:title, subjectId:subjectId, mode:state.live.mode, questions:questions, hostName:displayName()||'Host', config:c }, function(res){
    if(!res || !res.ok){ var s=$('live-setup-status'); if(s) s.innerHTML='<div class="error-note">'+esc((res&&res.error)||"Couldn't create the room.")+'</div>'; return; }
    state.live.code=res.code; state.live.hostToken=res.hostToken; state.live.role='host';
    state.live.config = Object.assign({}, CFG_DEFAULTS, c, res.config||{});
    state.live.players = []; state.live.session=null; state.live.board=[]; state.live.me=null;
    wireHostListeners();
    state.live.screen='host-lobby'; renderLive(); window.scrollTo(0,0);
  });
};

/* ---------- lobby ---------- */
function summaryChips(c){
  var a = ['⏱️ '+c.durationMin+' min','📝 '+c.questionCount+' questions','⏸️ '+c.wrongPauseSec+'s wrong pause','👥 '+c.maxPlayers+' max'];
  a.push({speed:'⚡ Speed bonus',flat:'⚖️ Flat scoring',finale:'✖️ Final minute ×2'}[c.pointsMode]||'');
  a.push(c.shuffleQuestions?'🔀 Shuffled order':'🔢 In order'); if(c.allowLateJoin) a.push('🚪 Late join');
  return a.filter(Boolean).map(function(t){return '<span class="lv-chip">'+t+'</span>';}).join('');
}
function lvLobby(){
  var c = cfg(), players = state.live.players, m = GAME_MODES[state.live.mode];
  return '<div class="lv-lobby"><div class="lv-lobby-main"><p class="lv-eyebrow">'+m.icon+' '+esc(m.label).toUpperCase()+'</p><h3 class="lv-lobby-title">'+esc(c.title||'Live Game')+'</h3>'+
    '<div class="lv-code-wrap"><span class="lv-code-lab">Room code</span><div class="lv-code" id="lv-code" aria-live="polite">'+esc(state.live.code)+'</div>'+
    '<div class="lv-code-actions"><button class="btn btn-ghost btn-sm" data-lv="copy-code">📋 Copy code</button><button class="btn btn-ghost btn-sm" data-lv="copy-link">🔗 Copy invite text</button></div>'+
    '<p class="lv-join-hint">Players open <b>'+esc(location.host)+'</b> → Live Game → Join, then enter the code.</p></div>'+
    '<div class="lv-chips">'+summaryChips(c)+'</div></div>'+
  '<div class="lv-lobby-roster"><div class="lv-roster-head"><h4>Players <span class="lv-count">'+players.length+'</span></h4>'+
    '<label class="lv-toggle lv-toggle-sm"><input type="checkbox" data-lv-lock="1" '+(c.locked?'checked':'')+'><span class="lv-switch"></span><span class="lv-toggle-t"><b>Lock room</b></span></label></div>'+
    '<div class="lv-roster">'+(players.length?players.map(function(p){return '<span class="lv-player'+(p.online===false?' off':'')+'">'+esc(p.name)+'<button class="lv-kick" data-lv="kick" data-id="'+esc(p.id)+'" aria-label="Remove '+esc(p.name)+'" title="Remove player">×</button></span>';}).join(''):'<p class="lv-waiting"><span class="lv-pulse"></span> Waiting for players to join…</p>')+'</div>'+
    '<button class="btn btn-primary btn-lg lv-start" data-lv="start" '+(players.length?'':'disabled')+'>▶ Start game'+(players.length?' ('+players.length+')':'')+'</button></div></div>';
}

/* ---------- game clock (shared by host + players) ---------- */
function fmtClock(ms){ var t=Math.max(0,Math.ceil(ms/1000)); return Math.floor(t/60)+':'+('0'+(t%60)).slice(-2); }
function setClock(remMs, durMs){ LV.endsAt = Date.now()+remMs; if(durMs) LV.durMs = durMs; if(!LV.clockTimer) LV.clockTimer = setInterval(clockTick, 200); clockTick(); }
function stopClock(){ if(LV.clockTimer){ clearInterval(LV.clockTimer); LV.clockTimer=null; } }
function clockTick(){
  var rem = Math.max(0, LV.endsAt-Date.now());
  var t=$('lv-gclock-text'); if(t) t.textContent = fmtClock(rem);
  var f=$('lv-gclock-fill'); if(f) f.style.width = (LV.durMs?Math.min(100,rem/LV.durMs*100):0)+'%';
  var box=$('lv-gclock'); if(box) box.classList.toggle('low', rem>0 && rem<=30000);
  if(LV.lock){ var l=Math.max(0,LV.lock.until-Date.now()); var n=$('lv-lock-n'); if(n) n.textContent=(l/1000).toFixed(1); var lf=$('lv-lock-fill'); if(lf) lf.style.width=(LV.lock.ms?l/LV.lock.ms*100:0)+'%'; }
}
function clockHtml(){ return '<div class="lv-gclock" id="lv-gclock"><span class="lv-gclock-lab">⏱️ Time left</span><strong id="lv-gclock-text">'+fmtClock(LV.endsAt-Date.now())+'</strong><div class="live-timer-bar"><div class="live-timer-fill" id="lv-gclock-fill" style="width:100%"></div></div></div>'; }
function flash(text, cls){
  var f=document.createElement('div'); f.className='lv-flash '+(cls||''); f.textContent=text; document.body.appendChild(f);
  setTimeout(function(){ if(f.parentNode) f.parentNode.removeChild(f); }, 1300);
}

/* ---------- scoreboard bits ---------- */
var ARENA_MODES = ['zombie','gems','elimination'];
function isArena(){ return ARENA_MODES.indexOf(state.live.mode)>=0; }
function statOf(p){
  var m = state.live.mode;
  if(m==='rocket') return p.finish ? '🏁 #'+p.finish : Math.round(p.dist||0)+' km';
  if(m==='tower') return (p.floors||0)+(p.floors===1?' floor':' floors');
  if(m==='zombie') return p.down ? '💀 down' : '🔫 '+(p.ammo||0);
  if(m==='gems') return '💎 '+(p.carry||0)+' carried';
  if(m==='elimination') return p.alive===false ? '💀 out' : '❤ '+(p.lives==null?1:p.lives);
  return (p.correctCount||0)+' ✓';
}
var BOARD_TITLE = { zombie:'☠ Most kills', gems:'🏦 Gems banked', elimination:'☄️ Survivors' };
function rowHtml(p, rank, you){
  return '<div class="lv-board-row'+(you?' you':'')+(p.alive===false?' out':'')+(p.online===false?' off':'')+'"><span class="lv-rank">'+rank+'</span><span class="lv-bname">'+esc(p.name)+(you?' (you)':'')+'</span><span class="lv-bstat">'+esc(statOf(p))+'</span><b>'+p.score+'</b></div>';
}
function lvBoardHtml(){
  var L = state.live, host = L.role==='host';
  if(!host && cfg().showLeaderboard===false) return '';
  var list = host ? L.players : (L.board||[]), n = host ? 14 : 8, shown = list.slice(0,n), rows;
  var meId = L.playerId;
  rows = shown.map(function(p,i){ return rowHtml(p,i+1,p.id===meId); }).join('');
  if(!host && L.me && !shown.some(function(p){return p.id===L.me.id;}) && L.ranks && L.ranks[L.me.id]) rows += '<div class="lv-board-gap">⋯</div>'+rowHtml(L.me, L.ranks[L.me.id], true);
  return '<aside class="lv-board" id="lv-board"><h4>'+(BOARD_TITLE[state.live.mode]||'🏆 Leaderboard')+(L.count?' <i>'+L.count+' playing</i>':(host?' <i>'+list.length+' playing</i>':''))+'</h4>'+(rows||'<p class="panel-empty">Waiting for answers…</p>')+'</aside>';
}
window.lvShown = function(){
  var L = state.live; if(L.role==='host') return L.players;
  var list = (L.board||[]).slice(); if(L.me && !list.some(function(p){return p.id===L.me.id;})) list.push(L.me); return list;
};
function mergeMe(){ var L=state.live; if(!L.me) return; if(L.role==='host') return; var i=(L.board||[]).findIndex(function(p){return p.id===L.me.id;}); if(i>=0) L.board[i]=L.me; }
window.lvMergeMe = mergeMe;
function refreshLive(){
  var scr = state.live.screen;
  if(scr==='host-play'){ var b=$('lv-board'); if(b) b.outerHTML = lvBoardHtml(); var st=$('lv-hstats'); if(st) st.innerHTML = hostStats(); }
  else if(scr==='player-play'){ var pb=$('lv-board'); if(pb) pb.outerHTML = lvBoardHtml(); updateMeBar(); }
  if(window.LVM) window.LVM.refresh();
}
window.lvRefreshLive = refreshLive;

/* ---------- host play: the mode scene fills the screen, no questions ---------- */
function hostStats(){
  var ps = state.live.players, ans=0, cor=0, on=0;
  ps.forEach(function(p){ ans+=p.answered||0; cor+=p.correctCount||0; if(p.online!==false) on++; });
  return '<b>'+on+'</b> playing · <b>'+ans+'</b> answers · <b>'+(ans?Math.round(cor/ans*100):0)+'%</b> correct';
}
function lvHostPlay(){
  var c = cfg(), m = GAME_MODES[state.live.mode];
  return '<div class="lv-play lv-hostfull"><div class="lv-play-main">'+
    '<div class="lv-hostbar"><span>'+m.icon+' '+esc(c.title||'Live Game')+'</span><span class="lv-code-mini">'+esc(state.live.code)+'</span><span class="lv-answered" id="lv-hstats">'+hostStats()+'</span></div>'+
    clockHtml()+
    '<div class="lv-scene-slot lv-host-scene" data-scene="host"></div><div id="lv-feed" class="lv-feed" aria-live="polite"></div>'+
    '<div class="lv-controls"><button class="btn btn-ghost btn-sm" data-lv="end-confirm">End game now</button></div></div>'+lvBoardHtml()+'</div>';
}

/* ---------- join ---------- */
function lvJoin(){
  return '<button class="btn btn-ghost btn-sm lv-back" data-lv="goto" data-screen="hub">← Back</button>'+
  '<div class="lv-join"><div class="lv-join-card"><div class="lv-join-ico">🎮</div><h3>Join a game</h3><p>Ask your host for the 5-letter room code.</p>'+
    '<form data-lv-form="join"><label class="lv-lab" for="live-join-code">Room code</label><input type="text" id="live-join-code" class="lv-code-input" placeholder="ABCDE" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" value="'+esc(LV.prefillCode||'')+'">'+
    '<label class="lv-lab" for="live-join-name">Your nickname</label><input type="text" id="live-join-name" placeholder="Nickname" value="'+esc(displayName())+'" maxlength="24" autocomplete="nickname">'+
    '<p class="lv-fine">Keep it friendly — inappropriate names are blocked.</p><div id="live-join-status" role="status"></div>'+
    '<button class="btn btn-green btn-lg lv-join-btn" type="submit">Join game 🚀</button></form></div></div>';
}
window.liveJoinSubmit = function(){
  var code = ($('live-join-code').value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  var name = ($('live-join-name').value||'').trim();
  var status = $('live-join-status');
  if(code.length!==5 || !name){ status.innerHTML='<div class="error-note">Enter the 5-letter room code and your nickname.</div>'; return; }
  status.innerHTML='<div class="loading-line"><span class="spinner"></span> Joining…</div>';
  ensureSocket(); bindReconnect();
  var playerId = getPlayerId();
  socket.emit('player:join', { code:code, name:name, playerId:playerId, ling:myLing(), skin:mySkin() }, function(res){
    if(!res || !res.ok){ status.innerHTML='<div class="error-note">'+esc((res&&res.error)||"Couldn't join that room.")+'</div>'; return; }
    if(res.status==='ended'){ status.innerHTML='<div class="error-note">That game has already ended.</div>'; return; }
    state.profile.name = name; persistProfile(); renderProfileSlot();
    var L = state.live;
    L.code=res.code; L.playerId=res.playerId||playerId; L.role='player'; L.mode=res.mode; L.myName=name;
    L.config = Object.assign({}, CFG_DEFAULTS, res.config||{});
    L.title = res.title; L.hostName = res.hostName; L.me = res.me||null; L.board=[]; L.ranks=null; L.count=0; L.players=[];
    LV.q=null; LV.lock=null; LV.pending=false; LV.done=null;
    if(window.LVM){ LVM.track = res.meta&&res.meta.trackLength; LVM.storm = !!(res.meta&&res.meta.storm); }
    wirePlayerListeners();
    if(res.status==='running'){ L.screen='player-play'; setClock(res.remainingMs, res.meta&&res.meta.durationMs); if(res.me&&res.me.alive===false) LV.done='out'; else if(res.me&&res.me.finished) LV.done='finished'; }
    else { L.screen='player-wait'; L.inProgress = res.status==='intro'; }
    renderLive(); window.scrollTo(0,0);
  });
};
function myLing(){ try{ return (state.progress.equipped&&state.progress.equipped.indexling)||'ling-sugarbug'; }catch(e){ return ''; } }
function mySkin(){ try{ return (typeof getEquippedSkinId==='function'&&getEquippedSkinId(myLing()))||''; }catch(e){ return ''; } }
function lvWait(){
  var c = cfg(), m = GAME_MODES[state.live.mode]||GAME_MODES.trivia, players = state.live.players;
  return '<div class="lv-wait"><div class="lv-wait-card"><p class="lv-eyebrow">'+m.icon+' '+esc(m.label).toUpperCase()+'</p><h3>'+esc(state.live.title||'Live Game')+'</h3>'+
    '<div class="lv-code lv-code-sm">'+esc(state.live.code)+'</div>'+
    '<div class="lv-wait-msg"><span class="lv-pulse"></span> '+(state.live.inProgress?'Get ready — the game is about to start…':'You’re in! Waiting for '+esc(state.live.hostName||'the host')+' to start…')+'</div>'+
    '<p class="lv-fine">'+esc(m.desc)+'</p><div class="lv-chips">'+summaryChips(c)+'</div></div>'+
    '<div class="lv-roster lv-roster-c">'+players.map(function(p){return '<span class="lv-player'+(p.id===state.live.playerId?' me':'')+'">'+esc(p.name)+(p.id===state.live.playerId?' (you)':'')+'</span>';}).join('')+'</div></div>';
}

/* ---------- player play ---------- */
function myRank(){ var L=state.live; if(!L.me) return null; if(L.screen==='ended'){ var i=L.players.findIndex(function(p){return p.id===L.playerId;}); return i<0?null:{rank:i+1,of:L.players.length}; } var r=L.ranks&&L.ranks[L.me.id]; return r?{rank:r,of:L.count||r}:null; }
function heartStr(n){ n = Math.max(0, n==null?1:n); var s=''; for(var i=0;i<n;i++) s+='❤️'; return s||'💔'; }
function meBarHtml(){
  var me = state.live.me || {score:0}, out = me.alive===false, rk = myRank();
  return '<div class="lv-pbar" id="lv-pbar"><span>'+esc(me.name||displayName()||'You')+(rk?' <i class="lv-prank">#'+rk.rank+'</i>':'')+'</span>'+(state.live.mode==='elimination'&&!out?'<span class="lv-lives">'+heartStr(me.lives)+'</span>':'')+'<b class="lv-score">'+(me.score||0)+' pts</b></div>';
}
function updateMeBar(){ var b=$('lv-pbar'); if(b) b.outerHTML = meBarHtml(); }
function typeLabel(t){ return {mc:'Multiple choice',tf:'True / False',type:'Type your answer'}[t||'mc']; }
function lockedNow(){ return !!(LV.lock && Date.now() < LV.lock.until); }
function tilesHtml(q){
  var n=q.options.length, tf=q.type==='tf';
  return '<div class="lv-tiles n'+n+(tf?' tf':'')+'">'+q.options.map(function(o,i){
    var cls='lv-tile t'+i+(LV.pick===i?' picked':'');
    return '<button class="'+cls+'" data-lv="answer" data-idx="'+i+'"'+(LV.pending?' disabled':'')+'><span class="lv-shape">'+(tf?(i===0?'✓':'✕'):SHAPES[i])+'</span><span class="lv-tile-t">'+esc(o)+'</span><kbd>'+(i+1)+'</kbd></button>';
  }).join('')+'</div>';
}
function answerBoxHtml(){ return LV.lock&&LV.lock.ans ? '<div class="lv-answer-box"><span>Correct answer</span><b>'+esc(LV.lock.ans)+'</b></div>'+(LV.lock.expl?'<div class="lv-expl">💡 '+esc(LV.lock.expl)+'</div>':'') : ''; }
function qAreaHtml(){
  var L = state.live;
  if(LV.done==='out') return '<div class="lv-donepanel out"><div class="lv-done-ico">👻</div><h3>You’re eliminated</h3><p>Stay and watch the finale — the leaderboard keeps moving.</p>'+answerBoxHtml()+'</div>';
  if(LV.done==='finished') return '<div class="lv-donepanel fin"><div class="lv-done-ico">🏁</div><h3>You crossed the finish line!</h3><p>Watch the rest of the race finish.</p></div>';
  if(lockedNow()){
    var lk = LV.lock;
    return '<div class="lv-lockpanel"><div class="lv-lock-ico">⏳</div><h3>Not quite!</h3>'+(lk.msg?'<p class="lv-lock-msg">'+esc(lk.msg)+'</p>':'')+answerBoxHtml()+
      '<div class="lv-lock-bar"><i id="lv-lock-fill" style="width:100%"></i></div><p class="lv-lock-sub">Next question in <b id="lv-lock-n">'+(Math.max(0,lk.until-Date.now())/1000).toFixed(1)+'</b>s</p></div>';
  }
  var q = LV.q;
  if(!q) return '<div class="loading-line" style="justify-content:center"><span class="spinner"></span> Get ready…</div>';
  var body;
  if(q.type==='type') body = '<form class="lv-typein" data-lv-form="typein"><input id="lv-typed" type="text" maxlength="100" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Type your answer…" value="'+esc(LV.typed)+'"'+(LV.pending?' disabled':'')+' aria-label="Your answer"><button class="btn btn-primary btn-lg" type="submit"'+(LV.pending?' disabled':'')+'>Submit</button></form>';
  else body = tilesHtml(q);
  return '<div class="lv-qprog"><span>Question '+q.n+'</span><span class="lv-qtype">'+typeLabel(q.type)+'</span></div><div class="lv-question">'+esc(q.q)+'</div>'+body;
}
function renderQ(){
  var a=$('lv-qarea'); if(!a) return; var had = document.activeElement && document.activeElement.id==='lv-typed';
  a.innerHTML = qAreaHtml(); a.classList.toggle('locked', lockedNow());
  var i=$('lv-typed'); if(i && (had||!LV.pending) && !lockedNow()){ try{ i.focus({preventScroll:true}); }catch(e){} }
}
function lvPlayerPlay(){
  var c = cfg();
  return meBarHtml()+clockHtml()+'<div class="lv-scene-slot lv-me-scene" data-scene="me"></div>'+
    '<div class="lv-storm-banner" id="lv-storm" style="'+(window.LVM&&LVM.storm?'':'display:none')+'">⛈️ STORM — wrong answers cost 2 floors!</div>'+
    '<div id="lv-qarea" class="lv-qarea">'+qAreaHtml()+'</div>'+(c.showLeaderboard===false?'':lvBoardHtml());
}
window.liveAnswerPick = function(idx){
  if(state.live.screen!=='player-play' || !LV.q || LV.q.type==='type' || LV.pending || lockedNow() || LV.done) return;
  LV.pick = idx; LV.pending = true;
  socket.emit('player:answer', { code:state.live.code, playerId:state.live.playerId, seq:LV.q.seq, idx:idx });
  pendingGuard(); renderQ();
};
function submitTyped(){
  if(!LV.q || LV.q.type!=='type' || LV.pending || lockedNow() || LV.done) return;
  var inp = $('lv-typed'); var t = (inp?inp.value:LV.typed||'').trim(); if(!t) return;
  LV.typed = ''; LV.pending = true;
  socket.emit('player:answer', { code:state.live.code, playerId:state.live.playerId, seq:LV.q.seq, text:t });
  pendingGuard(); renderQ();
}
var pendTimer=null;
function pendingGuard(){ clearTimeout(pendTimer); pendTimer=setTimeout(function(){ if(LV.pending){ LV.pending=false; LV.pick=null; renderQ(); } }, 3500); }
document.addEventListener('keydown', function(e){
  if(state.view!=='live' || state.live.screen!=='player-play' || e.ctrlKey||e.metaKey||e.altKey) return;
  var tag = (e.target&&e.target.tagName)||''; if(tag==='INPUT'||tag==='TEXTAREA') return;
  var i = '1234'.indexOf(e.key); if(i<0 && !isArena()) i = {a:0,b:1,c:2,d:3}[(e.key||'').toLowerCase()]; if(i==null||i<0) return;
  if(LV.q && i<LV.q.options.length){ e.preventDefault(); window.liveAnswerPick(i); }
});

/* ---------- ended ---------- */
function lvEnded(){
  var ranked = state.live.players;
  var top = ranked.slice(0,3), order = top.length===3 ? [top[1],top[0],top[2]] : top;
  var me = ranked.find(function(p){return p.id===state.live.playerId;});
  var rk = myRank(), isHost = state.live.role==='host';
  var medals = ['🥇','🥈','🥉'];
  var acc = me && me.answered ? Math.round(me.correctCount/me.answered*100) : 0;
  return '<div class="lv-ended"><p class="lv-eyebrow">FINAL RESULTS</p><h2>'+(isHost?'Game over — great session!':(rk&&rk.rank===1?'You won! 🏆':'Great game!'))+'</h2>'+
  '<div class="lv-podium">'+order.map(function(p){var r=top.indexOf(p);return '<div class="lv-pod p'+(r+1)+'"><span class="lv-pod-medal">'+medals[r]+'</span><b>'+esc(p.name)+'</b><span>'+p.score+' pts</span><div class="lv-pod-bar"></div></div>';}).join('')+'</div>'+
  (me&&!isHost?'<div class="lv-stats"><div><b>#'+(rk?rk.rank:'–')+'</b><span>Your rank</span></div><div><b>'+me.score+'</b><span>Points</span></div><div><b>'+me.correctCount+'/'+(me.answered||0)+'</b><span>Correct</span></div><div><b>'+acc+'%</b><span>Accuracy</span></div></div>':'')+
  '<h4 class="lv-full-h">Full leaderboard</h4><div class="lv-full">'+(ranked.map(function(p,i){return '<div class="lv-board-row'+(p.id===state.live.playerId?' you':'')+'"><span class="lv-rank">'+(i+1)+'</span><span class="lv-bname">'+esc(p.name)+(p.id===state.live.playerId?' (you)':'')+'</span><span class="lv-fine">'+p.correctCount+'/'+(p.answered||0)+' correct</span><b>'+p.score+'</b></div>';}).join('')||'<p class="panel-empty">No players joined.</p>')+'</div>'+
  '<div class="lv-end-actions"><button class="btn btn-primary btn-lg" data-lv="exit">Done</button></div></div>';
}

/* ---------- reconnect (polling sockets can drop) ---------- */
function bindReconnect(){
  if(!socket || socket.__lvRe) return; socket.__lvRe=1; socket.__lvSeen = socket.connected?1:0;
  socket.on('connect', function(){
    if(!socket.__lvSeen){ socket.__lvSeen=1; return; }
    var L=state.live; if(!L.code) return;
    if(L.role==='player') socket.emit('player:join', { code:L.code, name:L.myName||displayName()||'Player', playerId:L.playerId }, function(res){ if(res&&res.ok&&res.status==='running'){ setClock(res.remainingMs, res.meta&&res.meta.durationMs); if(res.me){ L.me=res.me; mergeMe(); } renderQ(); updateMeBar(); } });
    else if(L.role==='host') socket.emit('host:sync', { code:L.code, hostToken:L.hostToken }, function(res){ if(res&&res.ok){ L.players=res.players||L.players; if(res.status==='running') setClock(res.remainingMs, res.meta&&res.meta.durationMs); refreshLive(); } });
  });
}

/* ---------- socket listeners ---------- */
function commonListeners(){
  ['room:intro','room:event','room:roster','room:started','room:tick','room:ended','room:kicked','room:board','room:state'].forEach(function(e){ socket.removeAllListeners(e); });
  if(window.LVA) LVA.wire(socket);
  socket.on('room:intro', function(d){ if(window.LVM) LVM.showIntro(d); });
  socket.on('room:event', function(d){ if(window.LVM) LVM.pushFeed(d.text,d.type); });
  socket.on('room:tick', function(d){
    LV.endsAt = Date.now()+d.remainingMs;
    var st = !!d.storm; if(window.LVM && !!LVM.storm!==st){ LVM.storm=st; var b=$('lv-storm'); if(b) b.style.display=st?'':'none'; }
    if(window.LVM) LVM.refresh();
  });
  socket.on('room:ended', function(d){ stopClock(); state.live.players=d.players; state.live.screen='ended'; celebrate(); renderLive(); });
}
window.wireHostListeners = function(){
  commonListeners(); bindReconnect();
  socket.on('room:roster', function(d){ state.live.players=d.players; if(d.config) state.live.config=Object.assign({},state.live.config,d.config); if(state.live.screen==='host-lobby') lvKeep(); });
  socket.on('room:started', function(d){ var L=state.live; if(window.LVM){ LVM.track=d.meta&&d.meta.trackLength; LVM.storm=false; LVM.feed=[]; } setClock(d.remainingMs, d.meta&&d.meta.durationMs); L.screen='host-play'; renderLive(); window.scrollTo(0,0); });
  socket.on('room:state', function(d){ state.live.players=d.players; refreshLive(); });
};
window.wirePlayerListeners = function(){
  commonListeners(); bindReconnect();
  ['answer:result','chest:result','live:reward','player:question','player:state'].forEach(function(e){ socket.removeAllListeners(e); });
  socket.on('room:roster', function(d){ if(state.live.screen==='player-wait'){ state.live.players=d.players; if(d.config) state.live.config=Object.assign({},state.live.config,d.config); renderLive(); } });
  socket.on('room:started', function(d){
    var L=state.live; L.inProgress=false; LV.q=null; LV.lock=null; LV.pending=false; LV.done=null; LV.pick=null; LV.typed='';
    if(window.LVM){ LVM.track=d.meta&&d.meta.trackLength; LVM.storm=false; LVM.feed=[]; }
    setClock(d.remainingMs, d.meta&&d.meta.durationMs); L.screen='player-play'; renderLive(); window.scrollTo(0,0);
  });
  socket.on('player:question', function(q){
    var L=state.live; LV.q=q; LV.lock=null; LV.pending=false; LV.pick=null; LV.typed='';
    if(L.screen!=='player-play'){ L.screen='player-play'; renderLive(); } else { renderQ(); }
  });
  socket.on('player:state', function(d){
    var L=state.live; L.me=d.me; mergeMe();
    if(d.me.alive===false) LV.done='out'; else if(d.me.finished) LV.done='finished';
    if(d.out || LV.done) renderQ(); refreshLive();
  });
  socket.on('answer:result', function(d){
    var L=state.live; clearTimeout(pendTimer); LV.pending=false; L.me=d.me; mergeMe();
    if(d.correct){ flash((d.points?'+'+d.points+'  ·  ':'')+(d.msg||'Correct!'), 'good'); LV.pick=null; }
    else { LV.lock = { until:Date.now()+d.lockMs, ms:d.lockMs, ans:d.correctAnswer, expl:d.explanation, msg:d.msg }; }
    if(d.out) LV.done='out'; else if(d.finished) LV.done='finished';
    renderQ(); updateMeBar(); if(window.LVM) LVM.refresh();
  });
  socket.on('room:board', function(d){ var L=state.live; L.board=d.top; L.count=d.count; L.alive=d.alive; L.ranks=d.ranks; if(L.me){ var mine=d.top.find(function(p){return p.id===L.me.id;}); if(mine && (mine.answered||0)>=(L.me.answered||0)) L.me=mine; } refreshLive(); });
  socket.on('room:kicked', function(){ liveTeardown(); renderLive(); alert('The host removed you from this game.'); });
  socket.on('live:reward', function(d){ if(!d || d.playerId!==state.live.playerId) return; addXP(d.xp||0); addCoins(d.coins||0,'Live Game'); state.progress.liveGames=(state.progress.liveGames||0)+1; persistProgress(); showRewardToast('🏁 Live Game complete · +'+(d.xp||0)+' XP · +'+(d.coins||0)+' coins'); });
};
function lvKeep(){ var a=document.activeElement; var id=a&&a.id; renderLive(); if(id){ var e=$(id); if(e) e.focus(); } }


/* ---------- events ---------- */
var stageClick = function(e){
  var t = e.target.closest ? e.target.closest('[data-lv]') : null; if(!t) return;
  var a = t.getAttribute('data-lv'), L = state.live;
  if(a==='goto'){ L.screen = t.getAttribute('data-screen'); if(L.screen==='library' && window.lvLibLoad) window.lvLibLoad(); renderLive(); window.scrollTo(0,0); }
  else if(a==='mode'){ L.mode = t.getAttribute('data-mode'); window.lvRerender(); }
  else if(a==='src'){ LV.src = t.getAttribute('data-src'); if(LV.src==='library' && window.lvLibLoad) window.lvLibLoad(); window.lvRerender(); }
  else if(a==='pick-quiz'){ var s=state.studySets.find(function(x){return x.id===t.getAttribute('data-id');}); if(s){ window.lvChoose('q:'+s.id,s.title,s.questions.map(function(q){return Object.assign({type:'mc'},q);}),s.subjectId); window.lvRerender(); } }
  else if(a==='pick-custom'){ var cs=(state.customSets||[]).find(function(x){return x.id===t.getAttribute('data-id');}); if(cs){ window.lvChoose('c:'+cs.id,cs.title,cs.questions,cs.subject); window.lvRerender(); } }
  else if(a==='clear-chosen'){ LV.chosen=null; window.lvRerender(); }
  else if(a==='seg'){ cfg()[t.getAttribute('data-key')] = t.getAttribute('data-val'); window.lvRerender(); }
  else if(a==='preset'){ applyPreset(t.getAttribute('data-preset')); window.lvRerender(); }
  else if(a==='create'){ lvCreate(); }
  else if(a==='copy-code'){ copyText(L.code, t, '✓ Copied'); }
  else if(a==='copy-link'){ copyText('Join my Index live game! Go to '+location.origin+' → Live Game → Join, and enter code '+L.code, t, '✓ Copied'); }
  else if(a==='kick'){ socket.emit('host:kick', {code:L.code, hostToken:L.hostToken, playerId:t.getAttribute('data-id')}); }
  else if(a==='start'){ liveStartGame(); }
  else if(a==='end'){ liveEndGame(); }
  else if(a==='end-confirm'){ if(confirm('End the game now and show final results?')) liveEndGame(); }
  else if(a==='answer'){ liveAnswerPick(parseInt(t.getAttribute('data-idx'),10)); }
  else if(a==='chest'){ liveOpenChest(); }
  else if(a==='exit'){ liveExit(); }
};
function copyText(text, btn, done){
  var old = btn.textContent;
  function ok(){ btn.textContent = done; setTimeout(function(){ btn.textContent = old; }, 1400); }
  try{ navigator.clipboard.writeText(text).then(ok, function(){ ok(); }); }catch(e){ ok(); }
}
function stageInput(e){
  var t = e.target; if(!t.getAttribute) return;
  var key = t.getAttribute('data-cfg');
  if(key){
    var c = cfg();
    if(t.getAttribute('data-bool')){ c[key] = t.checked; lvSetupRefresh(); return; }
    if(t.getAttribute('data-num')){ c[key] = parseInt(t.value,10)||0; var v=document.querySelector('[data-cfgval="'+key+'"]'); if(v) v.textContent = c[key]+(t.getAttribute('data-suffix')||''); lvSetupRefresh(); return; }
    c[key] = t.value; return;
  }
  if(t.id==='lv-typed') LV.typed = t.value;
  if(t.id==='live-join-code') t.value = t.value.toUpperCase().replace(/[^A-Za-z0-9]/g,'');
}
function stageChange(e){
  var t = e.target;
  if(t.getAttribute && t.getAttribute('data-lv-lock')) socket.emit('host:lock', {code:state.live.code, hostToken:state.live.hostToken, locked:t.checked});
  if(t.id==='live-topic-subject'){ state.live.hostSubjectId = t.value; window.lvRerender(); }
}
function stageSubmit(e){
  var f = e.target.getAttribute && e.target.getAttribute('data-lv-form'); if(!f) return;
  e.preventDefault();
  if(f==='join') window.liveJoinSubmit();
  else if(f==='typein') submitTyped();
  else if(f==='quickjoin'){ LV.prefillCode = ($('lv-qj-code').value||'').toUpperCase(); state.live.screen='join-form'; renderLive(); var n=$('live-join-name'); if(n && LV.prefillCode.length===5) n.focus(); }
}
function bind(){
  var stage = $('live-stage'); if(!stage || stage.__lv) return; stage.__lv = 1;
  stage.addEventListener('click', stageClick); stage.addEventListener('input', stageInput);
  stage.addEventListener('change', stageChange); stage.addEventListener('submit', stageSubmit);
  var ex = $('live-exit-btn');
  if(ex) ex.addEventListener('click', function(e){ if(state.live.screen==='host-lobby'||state.live.screen==='host-play'||state.live.screen==='player-play'||state.live.screen==='player-wait'){ if(!confirm('Leave this game?')){ e.stopImmediatePropagation(); } } }, true);
  if(state.view==='live') renderLive();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
