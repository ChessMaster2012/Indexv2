(function(){
'use strict';
if(window.__indexCommanderQuestionBankV2)return;
window.__indexCommanderQuestionBankV2=true;

var modalId='commander-question-bank-modal';
var ui={tab:'ai',publicSets:[],publicLoaded:false,publicError:'',loading:false};

function game(){try{return window.state&&state.games?state.games:null;}catch(e){return null;}}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function subjName(g){try{var s=typeof subjectById==='function'?subjectById(g.subjectId):null;return s&&s.name||g.subjectId||'Biology';}catch(e){return g.subjectId||'Biology';}}
function normalizeQuestion(src){
  if(!src||typeof src!=='object')return null;
  var q=String(src.q||src.question||src.prompt||src.text||'').trim();
  if(!q)return null;
  var opts=Array.isArray(src.options)?src.options:(Array.isArray(src.choices)?src.choices:null);
  var type=String(src.type||src.format||'').toLowerCase();
  var answer=src.correctAnswer!=null?src.correctAnswer:(src.answer!=null?src.answer:src.correct);
  var correct=-1;
  if(opts&&opts.length){
    opts=opts.map(function(o){return String(o==null?'':o).trim();}).filter(Boolean).slice(0,4);
    if(typeof answer==='string'){
      correct=opts.findIndex(function(o){return o.toLowerCase()===String(answer).trim().toLowerCase();});
      if(correct<0&&/^\d+$/.test(answer))correct=Number(answer);
    }else if(typeof answer==='boolean'){
      correct=opts.findIndex(function(o){return o.toLowerCase()===(answer?'true':'false');});
    }else if(answer!=null&&Number.isFinite(Number(answer)))correct=Number(answer);
    if(correct<0&&src.correctIndex!=null)correct=Number(src.correctIndex);
  }else if(type==='tf'||type==='truefalse'||type==='true-false'||typeof answer==='boolean'){
    opts=['True','False'];
    correct=typeof answer==='boolean'?(answer?0:1):String(answer).toLowerCase()==='true'?0:1;
  }else return null;
  if(!opts||opts.length<2||correct<0||correct>=opts.length)return null;
  return {q:q,options:opts,correct:correct,explanation:String(src.explanation||src.feedback||'').slice(0,1200)};
}
function normalizeQuestions(input){
  var seen={};var out=[];
  (Array.isArray(input)?input:[]).forEach(function(q){var n=normalizeQuestion(q);if(!n)return;var k=n.q.toLowerCase().replace(/\s+/g,' ').trim();if(seen[k])return;seen[k]=true;out.push(n);});
  return out;
}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;}
function save(g){
  try{if(typeof window.v6Save==='function')window.v6Save(g);}catch(e){}
  try{if(typeof window.commanderSaveFinal==='function')window.commanderSaveFinal(g);}catch(e){}
}
function showStatus(message,isError){
  var el=document.getElementById('cqb-status');
  if(el)el.innerHTML=message?'<div class="cqb-status '+(isError?'error':'')+'">'+esc(message)+'</div>':'';
}
function activeTab(){return ui.tab;}
function setTab(tab){ui.tab=tab;renderBody();}
function modalHtml(){
 return '<div class="cqb-backdrop" role="presentation"><section class="cqb-dialog" role="dialog" aria-modal="true" aria-labelledby="cqb-title">'+
   '<div class="cqb-head"><div><div class="cqb-kicker">TROOP COMMANDER · STUDY SETUP</div><h2 id="cqb-title">Choose Your Question Bank</h2><p>Questions cycle in a shuffled order. Once the bank is used, it reshuffles until the game ends.</p></div></div>'+
   '<div class="cqb-tabs" role="tablist">'+
   '<button type="button" data-cqb-tab="ai">✦ AI Bank</button><button type="button" data-cqb-tab="mine">My Sets</button><button type="button" data-cqb-tab="public">Public Sets</button><button type="button" data-cqb-tab="builtin">Built-in</button></div>'+
   '<div id="cqb-body"></div><div id="cqb-status" aria-live="polite"></div>'+
   '<div class="cqb-foot"><span>AP focus: '+esc(subjName(game()||{}))+' · '+esc((game()||{}).unit||'Course review')+'</span><span>AI-generated banks require provider access.</span></div>'+
   '</section></div>';
}
function injectCss(){
 if(document.getElementById('cqb-styles'))return;
 var s=document.createElement('style');s.id='cqb-styles';s.textContent=[
  '#commander-question-bank-modal{position:fixed;inset:0;z-index:120000;color:#f7fbff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}',
  '.cqb-backdrop{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(3,10,20,.82);backdrop-filter:blur(9px);overflow:auto}',
  '.cqb-dialog{width:min(760px,100%);max-height:calc(100dvh - 28px);overflow:auto;border:1px solid #34556f;border-radius:22px;background:linear-gradient(155deg,#10263a,#071522 78%);box-shadow:0 28px 90px rgba(0,0,0,.56);padding:clamp(15px,3vw,28px)}',
  '.cqb-head h2{margin:5px 0 7px;font-size:clamp(24px,4vw,35px);letter-spacing:-.035em;color:#fff}.cqb-head p{margin:0;color:#b7cee0;font-size:13px;line-height:1.5;max-width:590px}',
  '.cqb-kicker{font-size:10px;letter-spacing:.15em;font-weight:950;color:#79e3bf}.cqb-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:20px 0 13px}',
  '.cqb-tabs button{border:1px solid #31516b;background:#10263a;color:#c2d6e6;border-radius:12px;padding:10px 5px;font-weight:900;font-size:12px;cursor:pointer}',
  '.cqb-tabs button.active{background:#d9fff0;border-color:#5edeb5;color:#073126;box-shadow:0 0 0 2px rgba(94,222,181,.16)}',
  '.cqb-panel{border:1px solid rgba(143,185,213,.2);background:rgba(17,43,63,.7);border-radius:16px;padding:16px}',
  '.cqb-panel h3{font-size:17px;margin:0 0 7px;color:#fff}.cqb-copy{font-size:12px;line-height:1.5;color:#b5cadd;margin:0 0 13px}',
  '.cqb-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.cqb-field label{display:block;font-size:10px;font-weight:950;letter-spacing:.06em;text-transform:uppercase;color:#94b4ca;margin:0 0 6px}',
  '.cqb-field select,.cqb-search{width:100%;border:1px solid #3c617a;background:#071a2a;color:#fff;border-radius:10px;padding:11px;font:800 13px system-ui;min-height:42px}',
  '.cqb-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.cqb-primary,.cqb-secondary{border:0;border-radius:11px;padding:12px 16px;font-size:12px;font-weight:950;cursor:pointer}.cqb-primary{background:linear-gradient(135deg,#70edbd,#28c99c);color:#04271d}.cqb-secondary{background:#203b52;border:1px solid #3c617a;color:#dcebf5}.cqb-primary:disabled{opacity:.55;cursor:wait}',
  '.cqb-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:310px;overflow:auto;padding-right:2px}',
  '.cqb-set{border:1px solid #35566d;background:#0b2032;color:#f6fbff;border-radius:12px;padding:11px;text-align:left;cursor:pointer;min-width:0}.cqb-set:hover{border-color:#63dab6;background:#143449}.cqb-set b{display:block;font-size:12px;overflow-wrap:anywhere}.cqb-set span{display:block;color:#a8c3d7;font-size:10px;line-height:1.4;margin-top:4px}.cqb-empty{padding:15px;border:1px dashed #42627a;border-radius:12px;color:#adc4d6;font-size:12px;line-height:1.5}',
  '.cqb-status{margin-top:12px;padding:10px 12px;border-radius:10px;border:1px solid #467c70;background:#0b302a;color:#c9ffeb;font-size:12px;line-height:1.5}.cqb-status.error{border-color:#81565c;background:#321a22;color:#ffe0e4}',
  '.cqb-foot{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:14px;color:#8daabe;font-size:10px;line-height:1.4}.cqb-busy{opacity:.7;pointer-events:none}',
  '@media(max-width:580px){.cqb-tabs{grid-template-columns:repeat(2,minmax(0,1fr));margin:14px 0 10px}.cqb-row,.cqb-list{grid-template-columns:1fr}.cqb-dialog{padding:13px;border-radius:16px}.cqb-head p{font-size:12px}}'
 ].join('');
 document.head.appendChild(s);
}
function currentOwnSets(){
 var g=game(),out=[],seen={};
 function add(id,title,questions,meta){
  var list=normalizeQuestions(questions);if(!list.length)return;
  var key=String(id||title||'set');if(seen[key])return;seen[key]=true;
  out.push({id:key,title:String(title||'My question set'),questions:list,meta:meta||''});
 }
 try{
  (Array.isArray(state.studySets)?state.studySets:[]).forEach(function(s,i){
   if(!s||!Array.isArray(s.questions))return;
   add('study:'+String(s.id||i),s.title||s.name||'Saved quiz',s.questions,(s.subjectId||'')+(s.unit?' · '+s.unit:''));
  });
 }catch(e){}
 try{
  (Array.isArray(state.customSets)?state.customSets:[]).forEach(function(s,i){
   if(!s||!Array.isArray(s.questions))return;
   add('custom:'+String(s.id||i),s.title||s.name||'My set',s.questions,'Created by you');
  });
 }catch(e){}
 return out;
}
async function loadPublic(){
 if(ui.publicLoaded)return;
 ui.publicLoaded=true;ui.publicError='';ui.publicSets=[];
 try{
  var r=await fetch('/api/library?sort=popular',{credentials:'same-origin',cache:'no-store'});
  var data=await r.json().catch(function(){return{};});
  if(!r.ok)throw new Error(data.error||'The public question library could not be loaded.');
  ui.publicSets=(Array.isArray(data.sets)?data.sets:[]).map(function(s){
   return {id:String(s.id||''),title:String(s.title||'Public set'),count:Number(s.count||0),subject:String(s.subject||''),author:String(s.authorName||s.author||'Student')};
  }).filter(function(s){return s.id;});
 }catch(e){ui.publicError=String(e&&e.message||'The public question library could not be loaded.');}
}
function tabButtons(){
 document.querySelectorAll('#commander-question-bank-modal [data-cqb-tab]').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-cqb-tab')===activeTab());});
}
function setButton(title,meta,attrs){
 return '<button type="button" class="cqb-set" '+attrs+'><b>'+esc(title)+'</b><span>'+esc(meta||'')+'</span></button>';
}
function renderBody(){
 var body=document.getElementById('cqb-body');if(!body)return;
 tabButtons();showStatus('',false);
 if(ui.tab==='ai'){
  body.innerHTML='<div class="cqb-panel"><h3>Generate one bank for this run</h3><p class="cqb-copy">Index generates a set once, then shuffles through that bank again and again. The selected course and unit stay fixed for the run.</p><div class="cqb-row"><div class="cqb-field"><label for="cqb-count">Questions in the bank</label><select id="cqb-count"><option value="5">5 questions</option><option value="10" selected>10 questions</option><option value="15">15 questions</option><option value="20">20 questions</option></select></div><div class="cqb-field"><label>Study focus</label><div style="padding:11px;border:1px solid #3c617a;border-radius:10px;background:#071a2a;font-size:12px;line-height:1.4;color:#dbeaf4;min-height:42px">'+esc(subjName(game()||{}))+' · '+esc((game()||{}).unit||'Course review')+((game()||{}).topic?' · '+esc((game()||{}).topic):'')+'</div></div></div><div class="cqb-actions"><button type="button" class="cqb-primary" data-cqb-generate '+(ui.loading?'disabled':'')+'>'+(ui.loading?'Preparing bank…':'✦ Generate AI Question Bank')+'</button><button type="button" class="cqb-secondary" data-cqb-use-builtin>Use built-in AP bank</button></div><p class="cqb-copy" style="margin:12px 0 0">If Vireonix has not approved automated bank generation, the request is blocked safely and no bulk request is sent. You can still choose your own or a public set.</p></div>';
 }else if(ui.tab==='mine'){
  var sets=currentOwnSets();
  body.innerHTML='<div class="cqb-panel"><h3>Your question sets</h3><p class="cqb-copy">Use an AP quiz you saved or a set you created in Live Game.</p>'+(sets.length?'<div class="cqb-list">'+sets.map(function(s,i){return setButton(s.title,s.questions.length+' compatible questions'+(s.meta?' · '+s.meta:''),'data-cqb-mine="'+i+'"');}).join('')+'</div>':'<div class="cqb-empty">No compatible personal sets were found. Create a multiple-choice or true/false set in Live Game, or use a public set.</div>')+'</div>';
 }else if(ui.tab==='public'){
  var pub=ui.publicSets;
  body.innerHTML='<div class="cqb-panel"><h3>Public question library</h3><p class="cqb-copy">Choose a set published by another student. Only compatible multiple-choice and true/false questions are used.</p>'+(ui.publicError?'<div class="cqb-empty">'+esc(ui.publicError)+' <button type="button" class="cqb-secondary" data-cqb-reload>Try again</button></div>':(!ui.publicLoaded?'<div class="cqb-empty">Loading public sets…</div>':pub.length?'<div class="cqb-list">'+pub.map(function(s,i){return setButton(s.title,(s.count||0)+' questions'+(s.subject?' · '+s.subject:'')+' · '+s.author,'data-cqb-public="'+i+'"');}).join('')+'</div>':'<div class="cqb-empty">No public question sets are available yet. Try My Sets or built-in AP questions.</div>'))+'</div>';
  if(!ui.publicLoaded)loadPublic().then(function(){if(ui.tab==='public')renderBody();});
 }else{
  body.innerHTML='<div class="cqb-panel"><h3>Built-in AP review bank</h3><p class="cqb-copy">Use Index’s local AP review questions. These work without a provider request and will be shuffled repeatedly while you play.</p><div class="cqb-actions"><button type="button" class="cqb-primary" data-cqb-use-builtin>Start with built-in AP questions</button></div></div>';
 }
}
function getSelectedBank(g){return Array.isArray(g&&g.commanderQuestionBank)?g.commanderQuestionBank:[];}
function normalizeSelectedSet(set){
 var qs=normalizeQuestions(set&&set.questions);
 if(!qs.length)throw new Error('This set has no compatible multiple-choice or true/false questions.');
 return qs;
}
function applySource(source,bank,title){
 var g=game();if(!g)return;
 var qs=Array.isArray(bank)?normalizeQuestions(bank):[];
 g.commanderQuestionSource=source;
 g.commanderQuestionSetupVersion=2;
 g.commanderQuestionBank=qs;
 g.commanderQuestionBankActive=qs.length>0;
 g.commanderQuestionDeck=[];
 g.commanderQuestionBankTitle=String(title||'');
 g.commanderQuestionBankCount=qs.length;
 g.aiPolicyBlocked=source==='builtin';
 g.aiQuestionQueue=[];
 g.aiNextQuestion=null;
 g.aiQuestionRequest=null;
 g.aiPrefetchError='';
 g.aiLastAttemptAt=0;
 try{
  g.questionFeedback=null;g.questionLoading=false;g.questionGateOpen=true;
  if(qs.length){
   var first=nextFromSelectedBank(g,'');
   if(first){g.question=first;g.questionSource='selected-bank';if(typeof window.commanderRememberQuestion==='function')window.commanderRememberQuestion(g,first);}
  }else if(source==='builtin'){
   if(!g.question&&typeof window.commanderFallbackUniqueV9==='function')g.question=window.commanderFallbackUniqueV9(g);
   if(g.question){g.questionSource='fallback';if(typeof window.commanderRememberQuestion==='function')window.commanderRememberQuestion(g,g.question);}
  }
 }catch(e){}
 save(g);
 var el=document.getElementById(modalId);if(el)el.remove();
 try{if(typeof window.renderGames==='function')window.renderGames();else if(typeof window.renderBattle==='function')window.renderBattle(g);}catch(e){}
}
function builtInQuestions(g){
 var out=[];
 try{
  if(typeof window.bank==='function'){
   var b=window.bank(g);
   if(Array.isArray(b))out=out.concat(b);
  }
 }catch(e){}
 try{
  if(typeof window.commanderQuestionPoolFinal==='function'){
   var p=window.commanderQuestionPoolFinal(g);
   if(Array.isArray(p))out=out.concat(p);
  }
 }catch(e){}
 try{
  if(typeof window.commanderQuestionPoolForLesson==='function'){
   var info=window.commanderQuestionPoolForLesson(g);
   if(info&&Array.isArray(info.pool))out=out.concat(info.pool);
   if(info&&Array.isArray(info.all))out=out.concat(info.all);
  }
 }catch(e){}
 var bank=normalizeQuestions(out);
 if(!bank.length){
  try{
   var fallback=typeof window.commanderFallbackUniqueV9==='function'?window.commanderFallbackUniqueV9(g):null;
   if(fallback)bank=normalizeQuestions([fallback]);
  }catch(e){}
 }
 return bank;
}
function useBuiltin(){
 var g=game();if(!g)return;
 var qs=builtInQuestions(g);
 if(!qs.length){
  showStatus('No built-in AP questions are available for this course and unit yet. Choose My Sets or Public Sets instead.',true);
  return;
 }
 applySource('builtin',qs,'Built-in AP questions');
 try{if(window.showRewardToast)window.showRewardToast('Built-in AP bank ready · '+qs.length+' questions will reshuffle every cycle.');}catch(e){}
}
function startSelectedSet(set,source){
 try{
  var qs=normalizeSelectedSet(set);
  applySource(source,qs,set.title);
  try{if(window.showRewardToast)window.showRewardToast('Using '+qs.length+' questions from '+(set.title||'your set')+'. The bank will reshuffle after each cycle.');}catch(e){}
 }catch(e){showStatus(String(e&&e.message||e),true);}
}
async function generateAiBank(){
 if(ui.loading)return;
 var g=game();if(!g)return;
 var countNode=document.getElementById('cqb-count');
 var count=Math.max(5,Math.min(20,Number(countNode&&countNode.value)||10));
 var btn=document.querySelector('#commander-question-bank-modal [data-cqb-generate]');
 ui.loading=true;if(btn){btn.disabled=true;btn.textContent='Preparing bank…';}
 showStatus('Requesting one '+count+'-question bank from Vireonix Auto. The same bank will be shuffled for later waves.',false);
 try{
  var subject=subjName(g);
  var response=await fetch('/api/ai/commander-bank',{
   method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},
   cache:'no-store',
   body:JSON.stringify({course:subject,unit:g.unit||'Course review',topic:g.topic||'',count:count,seed:'commander-run-'+Date.now().toString(36)})
  });
  var data=await response.json().catch(function(){return{};});
  if(!response.ok)throw new Error(data&&data.error||'The AI question bank could not be generated.');
  var bank=normalizeQuestions(data.questions);
  if(bank.length<count)throw new Error('The AI returned '+bank.length+' valid questions, but you selected '+count+'. No partial bank was loaded; choose another source or try again later.');
  applySource('ai-bank',bank.slice(0,count),'AI Question Bank');
  try{if(window.showRewardToast)window.showRewardToast('AI bank ready · '+count+' questions will reshuffle every cycle.');}catch(e){}
 }catch(e){
  ui.loading=false;
  if(btn){btn.disabled=false;btn.textContent='✦ Generate AI Question Bank';}
  showStatus(String(e&&e.message||'The AI question bank could not be generated. Choose My Sets, Public Sets, or built-in AP questions.'),true);
 }
}
function openModal(){
 if(document.getElementById(modalId))return;
 injectCss();
 var wrap=document.createElement('div');wrap.id=modalId;wrap.innerHTML=modalHtml();document.body.appendChild(wrap);
 renderBody();
}
function hasValidSelection(g){
 if(!g||Number(g.commanderQuestionSetupVersion)!==2)return false;
 var source=String(g.commanderQuestionSource||'');
 if(['ai-bank','my-set','public-set','builtin'].indexOf(source)<0)return false;
 return g.commanderQuestionBankActive===true&&getSelectedBank(g).length>0;
}
function resetToSourceSetup(g){
 if(!g)return;
 if(g.running&&!g.questionGateOpen)return false;
 if(g.running){
  g.running=false;
  try{if(g.frame!=null)cancelAnimationFrame(g.frame);}catch(e){}
  g.frame=null;g.__v14WaveOwner=false;g.__commanderStandaloneWave=false;g.__commanderWaveStartLock=false;
 }
 g.commanderQuestionSource='';
 g.commanderQuestionSetupVersion=0;
 g.commanderQuestionBank=[];g.commanderQuestionBankActive=false;g.commanderQuestionDeck=[];
 g.commanderQuestionBankTitle='';g.commanderQuestionBankCount=0;
 g.aiPolicyBlocked=false;g.aiPrefetchError='';g.aiQuestionQueue=[];g.aiNextQuestion=null;
 g.aiQuestionRequest=null;g.aiLastAttemptAt=0;g.questionFeedback=null;g.questionLoading=false;
 g.questionGateOpen=true;g.question=null;g.questionSource='';
 return true;
}
function tick(){
 var g=game();
 if(!g||g.active!=='commander'||g.phase!=='battle'||g.finished)return;
 if(hasValidSelection(g))return;
 if(g.running&&!g.questionGateOpen)return;
 if(!document.getElementById(modalId)){
  if(!resetToSourceSetup(g))return;
  save(g);
  openModal();
 }
}
document.addEventListener('click',function(e){
 var target=e.target&&e.target.closest?e.target.closest('[data-cqb-tab],[data-cqb-generate],[data-cqb-use-builtin],[data-cqb-mine],[data-cqb-public],[data-cqb-reload]'):null;
 if(!target)return;
 var modal=document.getElementById(modalId);if(!modal)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 if(target.hasAttribute('data-cqb-tab')){setTab(target.getAttribute('data-cqb-tab'));return;}
 if(target.hasAttribute('data-cqb-generate')){generateAiBank();return;}
 if(target.hasAttribute('data-cqb-use-builtin')){useBuiltin();return;}
 if(target.hasAttribute('data-cqb-reload')){ui.publicLoaded=false;ui.publicError='';loadPublic().then(function(){if(ui.tab==='public')renderBody();});return;}
 if(target.hasAttribute('data-cqb-mine')){
  var mine=currentOwnSets()[Number(target.getAttribute('data-cqb-mine'))];if(mine)startSelectedSet(mine,'my-set');return;
 }
 if(target.hasAttribute('data-cqb-public')){
  var ps=ui.publicSets[Number(target.getAttribute('data-cqb-public'))];if(!ps)return;
  target.disabled=true;showStatus('Loading '+ps.title+'…',false);
  fetch('/api/library/'+encodeURIComponent(ps.id),{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json().catch(function(){return{};}).then(function(d){if(!r.ok)throw new Error(d.error||'Could not load this public set.');return d;});}).then(function(data){
   var set=data.set||data;
   startSelectedSet({title:set.title||ps.title,questions:set.questions||[]},'public-set');
  }).catch(function(err){target.disabled=false;showStatus(String(err&&err.message||'Could not load this public set.'),true);});
 }
},true);

/* Commander uses its existing question endpoint for individual waves. Once a
   run selects a local question source, the source must own the full question
   sequence and must not trigger provider calls between waves. */
try{window.__commanderWarmAiQuestion=function(){return Promise.resolve(null);};}catch(e){}
var previousQuestionRequest=window.commanderRequestAiQuestionV9;
if(typeof previousQuestionRequest==='function'&&!previousQuestionRequest.__cqbGuarded){
 var guardedQuestionRequest=function(g,background){
  if(!g)return Promise.resolve(null);
  if(!hasValidSelection(g)){
   if(!g.running||g.questionGateOpen)tick();
   return Promise.resolve(null);
  }
  // A selected bank is the sole source for the whole run. Never make a fresh
  // single-question provider call between waves, including for built-in mode.
  return Promise.resolve(g.question||null);
 };
 guardedQuestionRequest.__cqbGuarded=true;window.commanderRequestAiQuestionV9=guardedQuestionRequest;
}
var previousAdvance=window.commanderAdvanceToNextQuestion;
function nextFromSelectedBank(g,exclude){
 var bank=getSelectedBank(g);if(!g||!g.commanderQuestionBankActive||!bank.length)return null;
 var deck=Array.isArray(g.commanderQuestionDeck)?g.commanderQuestionDeck.slice():[];
 var valid=deck.length&&deck.every(function(i){return Number.isInteger(i)&&i>=0&&i<bank.length;});
 if(!valid){
  deck=[];for(var i=0;i<bank.length;i++)deck.push(i);shuffle(deck);
  if(bank.length>1&&String(bank[deck[0]]&&bank[deck[0]].q||'')===String(exclude||'')){
   var swap=deck.findIndex(function(i){return String(bank[i]&&bank[i].q||'')!==String(exclude||'');});
   if(swap>0){var tmp=deck[0];deck[0]=deck[swap];deck[swap]=tmp;}
  }
 }
 var ix=deck.shift();g.commanderQuestionDeck=deck;
 var q=normalizeQuestion(bank[ix]);if(!q)return null;
 return {q:q.q,options:q.options.slice(),correct:q.correct,explanation:q.explanation||''};
}
if(typeof previousAdvance==='function'&&!previousAdvance.__cqbWrapped){
 var advance=function(g){
  if(g&&g.active==='commander'&&g.phase==='battle'&&!g.finished&&!hasValidSelection(g)){
   if((!g.running||g.questionGateOpen)&&!document.getElementById(modalId)){
    if(resetToSourceSetup(g)){save(g);openModal();}
   }
   return null;
  }
  if(g&&hasValidSelection(g)&&g.commanderQuestionBankActive){
   g.questionFeedback=null;g.aiPrefetchError='';g.questionLoading=false;
   g.aiQuestionQueue=[];g.aiNextQuestion=null;g.aiQuestionRequest=null;
   var q=nextFromSelectedBank(g,g.question&&g.question.q);
   if(q){
    g.question=q;g.questionSource='selected-bank';g.questionGateOpen=true;
    try{if(typeof window.commanderRememberQuestion==='function')window.commanderRememberQuestion(g,q);}catch(e){}
    try{if(typeof window.renderBattle==='function')window.renderBattle(g);}catch(e){}
    save(g);return q;
   }
  }
  return previousAdvance.apply(this,arguments);
 };
 advance.__cqbWrapped=true;window.commanderAdvanceToNextQuestion=advance;
}
/* For a selected set, questionPoolForRun must not append unrelated safety-bank
   items. Patch the external helper's source once, using a small guarded hook. */
function activatePoolHook(g){
 if(!g||!g.commanderQuestionBankActive)return;
 if(typeof window.commanderQuestionPoolForLesson==='function'){
  var prev=window.commanderQuestionPoolForLesson;
  if(!prev.__cqbPoolWrapped){
   var wrapped=function(gg){
    if(gg&&gg.commanderQuestionBankActive&&Array.isArray(gg.commanderQuestionBank))return {all:gg.commanderQuestionBank,pool:gg.commanderQuestionBank};
    return prev.apply(this,arguments);
   };
   wrapped.__cqbPoolWrapped=true;window.commanderQuestionPoolForLesson=wrapped;
  }
 }
}
setInterval(function(){var g=game();if(g&&g.commanderQuestionBankActive)activatePoolHook(g);tick();},350);
})();