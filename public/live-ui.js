/* Live Game v2 — presentation + settings layer.
   Loaded after the main script. Overrides the live-game render functions and wires extra host
   settings, new question formats (multiple choice / true-false / type-in), late join, lock, kick.
   Socket event names and legacy actions are unchanged. Creator + Library live in live-creator.js. */
(function(){
'use strict';
var LV = window.LV = { src:'mine', chosen:null, libQuery:'', libSubject:'', libSort:'new', libResults:null, libLoading:false, libErr:'', typed:'', pick:null };
var CFG_DEFAULTS = { questionCount:10, timePerQuestion:20, shuffleQuestions:true, shuffleAnswers:false, showLeaderboard:true, autoAdvance:false, autoAdvanceDelay:4, maxPlayers:50, title:'', pointsMode:'speed', allowLateJoin:false, showAnswerCounts:true, lives:1, locked:false };
var LETTERS = ['A','B','C','D'];
var SHAPES = ['▲','◆','●','■'];
var SUBJ_LABEL = { general:'General', math:'Math', science:'Science', english:'English', history:'History', languages:'Languages', cs:'Computer Science', arts:'Arts', other:'Other' };
window.LV_SUBJ_LABEL = SUBJ_LABEL;
function cfg(){ state.live.config = Object.assign({}, CFG_DEFAULTS, state.live.config||{}); return state.live.config; }
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
  if(socket){ socket.removeAllListeners('room:kicked'); socket.removeAllListeners('room:roster'); }
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
    '<div class="lv-presets"><span>Quick presets</span>'+['classroom:Classroom','speed:Speed round','review:Review','chill:Relaxed'].map(function(p){var a=p.split(':');return '<button class="lv-chip-btn" data-lv="preset" data-preset="'+a[0]+'">'+a[1]+'</button>';}).join('')+'</div>'+
    '<div class="lv-settings">'+
      slider('questionCount','Questions',1,maxQ(),1,c.questionCount,'')+
      slider('timePerQuestion','Time per question',5,120,5,c.timePerQuestion,'s')+
      segment('pointsMode','Scoring',[['speed','Speed bonus','Faster answers earn more'],['flat','Flat','Everyone earns the same'],['double','Final ×2','Speed bonus, last question doubled']],c.pointsMode)+
      slider('maxPlayers','Player limit',2,100,1,c.maxPlayers,'')+
      (state.live.mode==='elimination' ? slider('lives','Lives (Last Stand)',1,3,1,c.lives,'') : '')+
      '<div class="lv-set-card lv-wide"><label class="lv-set-lab" for="lv-title">Game title <em>optional</em></label><input id="lv-title" data-cfg="title" type="text" maxlength="70" value="'+esc(c.title)+'" placeholder="e.g. AP Gov Unit 1 Challenge"></div>'+
      '<div class="lv-set-card lv-wide"><div class="lv-toggles">'+
        toggle('shuffleQuestions','Shuffle question order','Different order each game',c.shuffleQuestions)+
        toggle('shuffleAnswers','Shuffle answer choices','Applies to multiple choice',c.shuffleAnswers)+
        toggle('showLeaderboard','Live leaderboard','Players see standings as they play',c.showLeaderboard)+
        toggle('showAnswerCounts','Show answer counts','Host screen shows how many picked each answer',c.showAnswerCounts)+
        toggle('allowLateJoin','Allow late joiners','Players can join after the game starts',c.allowLateJoin)+
        toggle('autoAdvance','Auto-advance','Move on automatically after each reveal',c.autoAdvance)+
      '</div>'+(c.autoAdvance?slider('autoAdvanceDelay','Auto-advance delay',2,15,1,c.autoAdvanceDelay,'s',true):'')+'</div>'+
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
  var mins = Math.max(1, Math.round(count*(c.timePerQuestion+4)/60));
  sum.innerHTML = '<div class="lv-sum-mode"><span>'+m.icon+'</span><b>'+esc(m.label)+'</b></div><ul>'+
    '<li><span>Questions</span><b>'+(ch?count:(LV.src==='ai'?count+' (AI)':'—'))+'</b></li>'+
    '<li><span>Time each</span><b>'+c.timePerQuestion+'s</b></li><li><span>Est. length</span><b>~'+mins+' min</b></li>'+
    '<li><span>Scoring</span><b>'+({speed:'Speed bonus',flat:'Flat',double:'Final ×2'}[c.pointsMode])+'</b></li>'+
    '<li><span>Players</span><b>up to '+c.maxPlayers+'</b></li>'+
    (state.live.mode==='elimination'?'<li><span>Lives</span><b>'+c.lives+'</b></li>':'')+
    '<li><span>Late join</span><b>'+(c.allowLateJoin?'On':'Off')+'</b></li></ul>';
  var btn = $('lv-create-btn'); if(btn) btn.disabled = !(ch || LV.src==='ai');
}
function applyPreset(name){
  var c = cfg();
  var P = { classroom:{questionCount:10,timePerQuestion:20,shuffleQuestions:true,shuffleAnswers:false,showLeaderboard:true,autoAdvance:false,pointsMode:'speed'},
    speed:{questionCount:15,timePerQuestion:10,shuffleQuestions:true,shuffleAnswers:true,showLeaderboard:true,autoAdvance:true,autoAdvanceDelay:3,pointsMode:'speed'},
    review:{questionCount:50,timePerQuestion:45,shuffleQuestions:false,shuffleAnswers:false,showLeaderboard:false,autoAdvance:false,pointsMode:'flat'},
    chill:{questionCount:10,timePerQuestion:40,shuffleQuestions:true,shuffleAnswers:false,showLeaderboard:true,autoAdvance:true,autoAdvanceDelay:6,pointsMode:'flat',allowLateJoin:true} }[name];
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
  ensureSocket();
  var c = cfg();
  socket.emit('host:create', { title:title, subjectId:subjectId, mode:state.live.mode, questions:questions, hostName:displayName()||'Host', config:c }, function(res){
    if(!res || !res.ok){ var s=$('live-setup-status'); if(s) s.innerHTML='<div class="error-note">'+esc((res&&res.error)||"Couldn't create the room.")+'</div>'; return; }
    state.live.code=res.code; state.live.hostToken=res.hostToken; state.live.role='host';
    state.live.config = Object.assign({}, CFG_DEFAULTS, c, res.config||{});
    state.live.players = []; state.live.session=null;
    wireHostListeners();
    state.live.screen='host-lobby'; renderLive(); window.scrollTo(0,0);
  });
};

/* ---------- lobby ---------- */
function summaryChips(c){
  var a = ['📝 '+c.questionCount+' questions','⏱️ '+c.timePerQuestion+'s each','👥 '+c.maxPlayers+' max'];
  a.push({speed:'⚡ Speed bonus',flat:'⚖️ Flat scoring',double:'✖️ Final ×2'}[c.pointsMode]||'');
  if(c.shuffleQuestions) a.push('🔀 Shuffled'); if(c.autoAdvance) a.push('⏩ Auto-advance'); if(c.allowLateJoin) a.push('🚪 Late join');
  if(state.live.mode==='elimination') a.push('❤️ '+c.lives+' li'+(c.lives>1?'ves':'fe'));
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

/* ---------- question body shared by host + player ---------- */
function timerHtml(s){ return '<div class="lv-timer"><div class="lv-timer-meta"><span>Time remaining</span><strong id="live-timer-text">'+Math.ceil(s.questionDurationMs/1000)+'s</strong></div><div class="live-timer-bar"><div class="live-timer-fill" id="live-timer-fill" style="width:100%"></div></div></div>'; }
function progressHtml(s){ return '<div class="lv-qprog"><span>Question '+(s.index+1)+' of '+s.total+'</span><span class="lv-qtype">'+({mc:'Multiple choice',tf:'True / False',type:'Type your answer'}[s.type||'mc'])+'</span></div>'; }
function tilesHtml(s, opts){
  opts = opts||{};
  var n = s.options.length, rev = s.status==='reveal';
  return '<div class="lv-tiles n'+n+(s.type==='tf'?' tf':'')+'">'+s.options.map(function(o,i){
    var cls = 'lv-tile t'+i+(rev?(i===s.correct?' right':' dim'):'')+(opts.pickIdx===i?' picked':'');
    var inner = '<span class="lv-shape">'+(s.type==='tf'?(i===0?'✓':'✕'):SHAPES[i])+'</span><span class="lv-tile-t">'+esc(o)+'</span>'+(rev&&s.counts&&opts.counts?'<span class="lv-tile-n">'+s.counts[i]+'</span>':'');
    if(opts.live) return '<button class="'+cls+'" data-lv="answer" data-idx="'+i+'">'+inner+'</button>';
    if(opts.locked) return '<button class="'+cls+'" disabled>'+inner+'</button>';
    return '<div class="'+cls+'">'+inner+'</div>';
  }).join('')+'</div>';
}
function countsBars(s){
  var total = s.counts.reduce(function(a,b){return a+b;},0)||1;
  var labels = s.type==='type' ? ['Correct','Not matched'] : s.options.map(function(o,i){return s.type==='tf'?o:LETTERS[i];});
  return '<div class="lv-bars">'+s.counts.map(function(n,i){var right = s.type==='type'?i===0:i===s.correct;return '<div class="lv-bar"><span class="lv-bar-fill'+(right?' right':'')+'" style="height:'+Math.max(4,Math.round(n/total*100))+'%"></span><b>'+n+'</b><i>'+esc(labels[i])+'</i></div>';}).join('')+'</div>';
}

/* ---------- host play ---------- */
function lvHostPlay(){
  var s = state.live.session; if(!s) return '<div class="loading-line"><span class="spinner"></span> Loading…</div>';
  var c = cfg(), answered = state.live.answeredCount, total = state.live.players.length, rev = s.status==='reveal', m = GAME_MODES[state.live.mode];
  var bar = '<div class="lv-hostbar"><span>'+m.icon+' '+esc(c.title||'Live Game')+'</span><span class="lv-code-mini">'+esc(state.live.code)+'</span><span class="lv-answered"><b>'+answered+'</b>/'+total+' answered</span></div>';
  var body;
  if(s.type==='type'){
    body = rev ? '<div class="lv-answer-box"><span>Accepted answer'+((s.acceptedAnswers||[]).length>1?'s':'')+'</span><b>'+esc((s.acceptedAnswers||[s.answer]).join('  /  '))+'</b></div>'+(c.showAnswerCounts?countsBars(s):'') : '<div class="lv-typein-host">Players are typing their answers…</div>';
  } else {
    body = tilesHtml(s,{counts:c.showAnswerCounts});
  }
  var expl = rev && s.explanation ? '<div class="lv-expl">💡 '+esc(s.explanation)+'</div>' : '';
  var ctrl = rev ? (s.finale ? '<button class="btn btn-pink btn-lg" data-lv="end">🏆 Crown the winner</button>' : s.index<s.total-1 ? '<button class="btn btn-primary btn-lg" data-lv="next">Next question →</button>' : '<button class="btn btn-pink btn-lg" data-lv="end">🏁 Final results</button>')+(c.autoAdvance?'<span class="lv-fine">Auto-advancing in '+c.autoAdvanceDelay+'s…</span>':'') :
    '<button class="btn btn-ghost btn-lg" data-lv="reveal">Reveal now</button><button class="btn btn-ghost btn-sm" data-lv="end-confirm">End game</button>';
  return '<div class="lv-play"><div class="lv-play-main">'+bar+progressHtml(s)+(rev?'':timerHtml(s))+'<div class="lv-question">'+esc(s.q)+'</div>'+body+expl+
    '<div class="lv-scene-slot lv-host-scene" data-scene="host"></div><div id="lv-feed" class="lv-feed" aria-live="polite"></div>'+'<div class="lv-controls">'+ctrl+'</div></div>'+lvBoardHtml()+'</div>';
}
window.lvShown = function(){ return (LV.phase==='question' && LV.snap) ? LV.snap : state.live.players; };
function lvBoardHtml(){
  if(cfg().showLeaderboard===false) return '';
  var ranked = lvShown().slice(0,10);
  return '<aside class="lv-board"><h4>🏆 Leaderboard</h4>'+(ranked.length?ranked.map(function(p,i){var you=p.id===state.live.playerId;return '<div class="lv-board-row'+(you?' you':'')+(p.alive===false?' out':'')+'"><span class="lv-rank">'+(i+1)+'</span><span class="lv-bname">'+esc(p.name)+(you?' (you)':'')+(p.alive===false?' 💀':'')+'</span><b>'+p.score+'</b></div>';}).join(''):'<p class="panel-empty">No players yet.</p>')+'</aside>';
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
  ensureSocket();
  var playerId = getPlayerId();
  socket.emit('player:join', { code:code, name:name, playerId:playerId }, function(res){
    if(!res || !res.ok){ status.innerHTML='<div class="error-note">'+esc((res&&res.error)||"Couldn't join that room.")+'</div>'; return; }
    state.profile.name = name; persistProfile(); renderProfileSlot();
    state.live.code=res.code; state.live.playerId=res.playerId||playerId; state.live.role='player'; state.live.mode=res.mode;
    state.live.config = Object.assign({}, CFG_DEFAULTS, res.config||{});
    state.live.title = res.title; state.live.hostName = res.hostName; state.live.inProgress = res.status && res.status!=='lobby';
    wirePlayerListeners();
    if(res.status==='question' && res.question){
      state.live.session = Object.assign({}, res.question, {status:'question'}); state.live.myLastAnswer=null; LV.pick=null; LV.typed='';
      state.live.screen='player-play'; startLiveTimer(res.question.startedAt, res.question.questionDurationMs);
    } else state.live.screen='player-wait';
    renderLive(); window.scrollTo(0,0);
  });
};
function lvWait(){
  var c = cfg(), m = GAME_MODES[state.live.mode]||GAME_MODES.trivia, players = state.live.players;
  return '<div class="lv-wait"><div class="lv-wait-card"><p class="lv-eyebrow">'+m.icon+' '+esc(m.label).toUpperCase()+'</p><h3>'+esc(state.live.title||'Live Game')+'</h3>'+
    '<div class="lv-code lv-code-sm">'+esc(state.live.code)+'</div>'+
    '<div class="lv-wait-msg"><span class="lv-pulse"></span> '+(state.live.inProgress?'Game in progress — you’ll jump in on the next question.':'You’re in! Waiting for '+esc(state.live.hostName||'the host')+' to start…')+'</div>'+
    '<p class="lv-fine">'+esc(m.desc)+'</p><div class="lv-chips">'+summaryChips(c)+'</div></div>'+
    '<div class="lv-roster lv-roster-c">'+players.map(function(p){return '<span class="lv-player'+(p.id===state.live.playerId?' me':'')+'">'+esc(p.name)+(p.id===state.live.playerId?' (you)':'')+'</span>';}).join('')+'</div></div>';
}

/* ---------- player play ---------- */
function myRank(){ var r = state.live.players.slice().sort(function(a,b){return b.score-a.score;}); var i = r.findIndex(function(p){return p.id===state.live.playerId;}); return i<0?null:{rank:i+1,of:r.length}; }
function lvPlayerPlay(){
  var s = state.live.session; if(!s) return '<div class="loading-line"><span class="spinner"></span> Loading…</div>';
  var me = state.live.players.find(function(p){return p.id===state.live.playerId;}) || {score:0};
  var out = me.alive===false;
  var head = '<div class="lv-pbar"><span>'+esc(me.name||displayName()||'You')+'</span>'+(state.live.mode==='elimination'&&!out?'<span class="lv-lives">'+heartStr(me.lives)+'</span>':'')+'<b class="lv-score">'+(me.score||0)+' pts</b></div>';
  var my = state.live.myLastAnswer && state.live.myLastAnswer.index===s.index ? state.live.myLastAnswer : null;
  if(s.status==='reveal'){
    var got = my && my.correct, rk = myRank();
    var title = out && !my ? 'You’re out — spectating' : (my ? (got?'Correct!':'Not quite') : 'Time’s up');
    var ico = my ? (got?'🎉':'😅') : '⌛';
    var ans = s.type==='type' ? (s.acceptedAnswers||[s.answer]).join(' / ') : s.answer;
    var chest = state.live.mode==='gold' ? (window.LVM?LVM.chestHtml(me):'') : '';
    return head+progressHtml(s)+'<div class="lv-scene-slot lv-me-scene" data-scene="me"></div><div class="lv-result '+(got?'good':'bad')+'"><div class="lv-result-ico">'+ico+'</div><h3>'+title+'</h3>'+
      '<p class="lv-pts">'+esc(modeMsg(me,s,my,got))+'</p>'+
      '<div class="lv-answer-box"><span>Correct answer</span><b>'+esc(ans||'')+'</b></div>'+
      (s.type==='type'&&my&&my.text?'<p class="lv-fine">You typed: <b>'+esc(my.text)+'</b></p>':'')+
      (s.explanation?'<div class="lv-expl">💡 '+esc(s.explanation)+'</div>':'')+
      (rk?'<p class="lv-rank-line">You’re <b>#'+rk.rank+'</b> of '+rk.of+'</p>':'')+chest+
      
      '<div class="loading-line" style="justify-content:center"><span class="spinner"></span> Waiting for the next question…</div></div>'+lvBoardHtml();
  }
  var body;
  if(out) body = '<div class="lv-locked">👻 You’re eliminated — spectate the rest of the game!</div>';
  else if(my) body = (s.type==='type' ? '<div class="lv-locked">✅ Answer sent'+(my.text?': <b>'+esc(my.text)+'</b>':'')+'</div>' : tilesHtml(s,{locked:true,pickIdx:LV.pick}))+'<div class="loading-line" style="justify-content:center"><span class="spinner"></span> Locked in — waiting for everyone…</div>';
  else if(s.type==='type') body = '<form class="lv-typein" data-lv-form="typein"><input id="lv-typed" type="text" maxlength="100" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Type your answer…" value="'+esc(LV.typed)+'" aria-label="Your answer"><button class="btn btn-primary btn-lg" type="submit">Submit</button></form>';
  else body = tilesHtml(s,{live:true});
  return head+progressHtml(s)+'<div class="lv-scene-slot lv-me-scene" data-scene="me"></div>'+(s.meta&&s.meta.storm?'<div class="lv-storm-banner">⛈️ STORM ROUND — wrong answers cost 2 floors!</div>':'')+timerHtml(s)+'<div class="lv-question">'+esc(s.q)+'</div>'+body+lvBoardHtml();
}
function modeMsg(me,s,my,got){
  var l = me && me.last && me.last.q===s.index ? me.last : null;
  if(l && l.msg) return l.msg;
  if(my) return got ? '+'+my.points+' points' : 'No points this time';
  return state.live.mode==='elimination' && me && me.alive===false ? 'You are spectating' : 'No answer recorded';
}
function heartStr(n){ n = Math.max(0, n==null?1:n); var s=''; for(var i=0;i<n;i++) s+='❤️'; return s||'💔'; }
window.liveAnswerPick = function(idx){
  var s = state.live.session; if(!s || s.status!=='question') return;
  if(state.live.myLastAnswer && state.live.myLastAnswer.index===s.index) return;
  LV.pick = idx;
  socket.emit('player:answer', { code:state.live.code, playerId:state.live.playerId, idx:idx });
  state.live.myLastAnswer = { index:s.index, correct:null, points:null, pending:true };
  renderLive();
};
function submitTyped(){
  var s = state.live.session; if(!s || s.status!=='question') return;
  if(state.live.myLastAnswer && state.live.myLastAnswer.index===s.index) return;
  var inp = $('lv-typed'); var t = (inp?inp.value:LV.typed||'').trim(); if(!t) return;
  LV.typed = t;
  socket.emit('player:answer', { code:state.live.code, playerId:state.live.playerId, text:t });
  state.live.myLastAnswer = { index:s.index, correct:null, points:null, pending:true, text:t };
  renderLive();
}

/* ---------- ended ---------- */
function lvEnded(){
  var ranked = state.live.players.slice().sort(function(a,b){return b.score-a.score;});
  var top = ranked.slice(0,3), order = top.length===3 ? [top[1],top[0],top[2]] : top;
  var me = ranked.find(function(p){return p.id===state.live.playerId;});
  var rk = myRank(), isHost = state.live.role==='host';
  var medals = ['🥇','🥈','🥉'];
  var total = state.live.session ? state.live.session.total : 0;
  return '<div class="lv-ended"><p class="lv-eyebrow">FINAL RESULTS</p><h2>'+(isHost?'Game over — great session!':(rk&&rk.rank===1?'You won! 🏆':'Great game!'))+'</h2>'+
  '<div class="lv-podium">'+order.map(function(p){var r=top.indexOf(p);return '<div class="lv-pod p'+(r+1)+'"><span class="lv-pod-medal">'+medals[r]+'</span><b>'+esc(p.name)+'</b><span>'+p.score+' pts</span><div class="lv-pod-bar"></div></div>';}).join('')+'</div>'+
  (me&&!isHost?'<div class="lv-stats"><div><b>#'+(rk?rk.rank:'–')+'</b><span>Your rank</span></div><div><b>'+me.score+'</b><span>Points</span></div><div><b>'+me.correctCount+(total?'/'+total:'')+'</b><span>Correct</span></div></div>':'')+
  '<h4 class="lv-full-h">Full leaderboard</h4><div class="lv-full">'+(ranked.map(function(p,i){return '<div class="lv-board-row'+(p.id===state.live.playerId?' you':'')+'"><span class="lv-rank">'+(i+1)+'</span><span class="lv-bname">'+esc(p.name)+(p.id===state.live.playerId?' (you)':'')+'</span><span class="lv-fine">'+p.correctCount+' correct</span><b>'+p.score+'</b></div>';}).join('')||'<p class="panel-empty">No players joined.</p>')+'</div>'+
  '<div class="lv-end-actions"><button class="btn btn-primary btn-lg" data-lv="exit">Done</button></div></div>';
}

/* ---------- socket listeners ---------- */
function lvEvents(d){ if(window.LVM&&d&&d.events) d.events.forEach(function(ev){ LVM.pushFeed(ev.text,ev.type); }); }
function commonListeners(){
  socket.removeAllListeners('room:intro'); socket.removeAllListeners('room:event');
  socket.on('room:intro', function(d){ if(window.LVM) LVM.showIntro(d); });
  socket.on('room:event', function(d){ if(window.LVM) LVM.pushFeed(d.text,d.type); });
  socket.removeAllListeners('room:roster'); socket.removeAllListeners('room:question'); socket.removeAllListeners('room:reveal'); socket.removeAllListeners('room:ended'); socket.removeAllListeners('room:answered-count'); socket.removeAllListeners('room:kicked');
}
window.wireHostListeners = function(){
  commonListeners();
  socket.on('room:roster', function(d){ state.live.players=d.players; if(d.config) state.live.config=Object.assign({},state.live.config,d.config); if(state.live.screen==='host-lobby') lvKeep(); else if(state.live.screen==='host-play' && LV.phase==='reveal') renderLive(); });
  socket.on('room:question', function(q){
    if(window.LVM) LVM.feed=[]; LV.snap = JSON.parse(JSON.stringify(state.live.players)); LV.phase='question'; if(q.meta&&q.meta.trackLength&&window.LVM) LVM.track=q.meta.trackLength;
    state.live.session = Object.assign({}, q, {status:'question'}); state.live.answeredCount=0; state.live.screen='host-play';
    startLiveTimer(q.startedAt, q.questionDurationMs); renderLive();
  });
  socket.on('room:answered-count', function(d){ state.live.answeredCount=d.count; if(d.players) state.live.players=d.players; if(state.live.screen==='host-play') renderLive(); });
  socket.on('room:reveal', function(d){ stopLiveTimer(); LV.phase='reveal'; state.live.session = Object.assign({}, state.live.session, {status:'reveal', correct:d.correct, answer:d.answer, acceptedAnswers:d.acceptedAnswers, explanation:d.explanation, counts:d.counts, type:d.type||state.live.session.type, finale:d.finale, events:d.events, meta:d.meta||state.live.session.meta}); state.live.players=d.players; renderLive(); lvEvents(d); });
  socket.on('room:ended', function(d){ stopLiveTimer(); LV.phase='ended'; state.live.players=d.players; state.live.screen='ended'; celebrate(); renderLive(); });
};
window.wirePlayerListeners = function(){
  commonListeners();
  ['answer:ack','chest:result','live:reward'].forEach(function(e){ socket.removeAllListeners(e); });
  socket.on('room:roster', function(d){ state.live.players=d.players; if(d.config) state.live.config=Object.assign({},state.live.config,d.config); if(state.live.screen==='player-wait' || (state.live.screen==='player-play' && LV.phase==='reveal')) renderLive(); });
  socket.on('room:question', function(q){
    if(window.LVM) LVM.feed=[]; LV.snap = JSON.parse(JSON.stringify(state.live.players)); LV.phase='question'; if(q.meta&&q.meta.trackLength&&window.LVM) LVM.track=q.meta.trackLength; if(window.LVM) LVM.chest=null;
    state.live.session = Object.assign({}, q, {status:'question'}); state.live.myLastAnswer=null; state.live.myChest=null; LV.pick=null; LV.typed='';
    state.live.inProgress=false; state.live.screen='player-play'; startLiveTimer(q.startedAt, q.questionDurationMs); renderLive();
  });
  socket.on('answer:ack', function(d){
    var prev = state.live.myLastAnswer || {};
    state.live.myLastAnswer = { index:d.index, correct:d.correct, points:d.points, text:prev.text, msg:d.msg };
    var me = state.live.players.find(function(p){return p.id===state.live.playerId;});
    if(me){ me.score=d.myScore; if(d.lives!=null) me.lives=d.lives; if(d.alive===false) me.alive=false; }
    renderLive();
  });
  socket.on('room:answered-count', function(d){ if(d.players) state.live.players=d.players; });
  socket.on('room:reveal', function(d){ stopLiveTimer(); LV.phase='reveal'; state.live.session = Object.assign({}, state.live.session, {status:'reveal', correct:d.correct, answer:d.answer, acceptedAnswers:d.acceptedAnswers, explanation:d.explanation, counts:d.counts, type:d.type||(state.live.session&&state.live.session.type), finale:d.finale, events:d.events, meta:d.meta||(state.live.session&&state.live.session.meta)}); state.live.players=d.players; renderLive(); lvEvents(d); });
  socket.on('room:ended', function(d){ stopLiveTimer(); LV.phase='ended'; state.live.players=d.players; state.live.screen='ended'; celebrate(); renderLive(); });
  socket.on('room:kicked', function(){ liveTeardown(); renderLive(); alert('The host removed you from this game.'); });
  socket.on('live:reward', function(d){ if(!d || d.playerId!==state.live.playerId) return; addXP(d.xp||0); addCoins(d.coins||0,'Live Game'); state.progress.liveGames=(state.progress.liveGames||0)+1; persistProgress(); showRewardToast('🏁 Live Game complete · +'+(d.xp||0)+' XP · +'+(d.coins||0)+' coins'); });
  socket.on('chest:result', function(d){ state.live.myChest=d.bonus; if(window.LVM) LVM.onChest(d); else renderLive(); });
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
  else if(a==='reveal'){ liveReveal(); }
  else if(a==='next'){ liveNextQuestion(); }
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
    if(t.getAttribute('data-bool')){ c[key] = t.checked; if(key==='autoAdvance') window.lvRerender(); else lvSetupRefresh(); return; }
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
