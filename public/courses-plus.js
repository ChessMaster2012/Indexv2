/* Courses tab upgrade: richer cards, search + filters, progress, fuller unit lists, and starter
   topics for the courses that used to say "Add your own topics". Wraps the existing renderers;
   open-course / topic actions / custom topics all keep working through the original handlers. */
(function(){
'use strict';
var safe=function(f,d){try{return f();}catch(e){return d;}};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
if(typeof SUBJECTS==='undefined'||typeof renderCourses!=='function') return;

/* ---------- course info: icon + what's covered ---------- */
var INFO={
biology:['🧬','Cells, genetics, evolution and ecology, from molecules up to whole ecosystems.'],
chemistry:['⚗️','Atoms, bonding, reactions, energy and equilibrium, with lots of problem solving.'],
physics1:['🎢','Algebra-based mechanics: motion, forces, energy, momentum, rotation and waves.'],
physics2:['🔌','Algebra-based fluids, thermodynamics, electricity, magnetism, optics and modern physics.'],
'physicsc-mech':['🛰️','Calculus-based mechanics: motion, Newton’s laws, energy, rotation and gravitation.'],
'physicsc-em':['⚡','Calculus-based electricity and magnetism: fields, circuits and induction.'],
calcab:['📈','Limits, derivatives and integrals, with real-world rates and accumulation.'],
calcbc:['∑','Everything in AB plus parametric, polar, vector functions and series.'],
precalc:['📐','Functions of every kind, trigonometry, polar, vectors and matrices.'],
statistics:['📊','Collecting and describing data, probability, and inference.'],
csa:['☕','Object-oriented programming in Java: classes, arrays, inheritance and recursion.'],
csp:['💻','How computing works: data, algorithms, programming, networks and impact.'],
enviro:['🌱','Ecosystems, resources, pollution and global change, and the human role in each.'],
ushistory:['🗽','From early contact through today: politics, society, economy and culture.'],
worldhistory:['🗺️','Global networks, empires, revolutions, industrialization and modern conflict.'],
euro:['🏰','Renaissance to the present: ideas, states, revolutions and wars of Europe.'],
usgov:['🏛️','How American government works: institutions, rights, ideologies and participation.'],
compgov:['⚖️','Compare how six countries organize power, elections, parties and economies.'],
psychology:['🧠','How the brain, learning, development, personality and social forces shape behavior.'],
macro:['🏦','The economy as a whole: GDP, inflation, unemployment, money and policy.'],
micro:['🛒','Individual choices, markets, firms, competition and market failure.'],
humangeo:['🌐','How people use, shape and move across space: population, culture, cities, farming.'],
africanam:['✊🏾','African American history and culture from African roots to modern movements.'],
englang:['✍️','Reading nonfiction and writing rhetorical, argument and synthesis essays.'],
englit:['📚','Close reading of fiction, poetry and drama, with literary analysis writing.'],
spanishlang:['🇪🇸','Communicating in Spanish across six themes: reading, listening, writing, speaking.'],
spanishlit:['📜','Spanish and Latin American literature across the centuries, in Spanish.'],
frenchlang:['🇫🇷','Communicating in French across six themes: reading, listening, writing, speaking.'],
germanlang:['🇩🇪','Communicating in German across six themes: reading, listening, writing, speaking.'],
italianlang:['🇮🇹','Communicating in Italian across six themes: reading, listening, writing, speaking.'],
japaneselang:['🇯🇵','Communicating in Japanese: scripts, grammar and the six course themes.'],
chineselang:['🇨🇳','Communicating in Mandarin: characters, tones, grammar and the six course themes.'],
latin:['🏺','Reading Latin: Vergil, Caesar, grammar, meter and Roman culture.'],
arthistory:['🖼️','Art across cultures and time: how to look at, compare and explain works.'],
musictheory:['🎼','Notes, rhythm, scales, chords, voice leading and ear training.'],
art2d:['🎨','Two-dimensional design: composition, color, media and a portfolio.'],
art3d:['🗿','Three-dimensional design: form, space, materials and a portfolio.'],
drawing:['✏️','Mark-making, value, perspective, observation and a drawing portfolio.'],
seminar:['🧭','Analyze arguments from many perspectives, then write and present your own.'],
research:['🔬','Plan and carry out an independent investigation, then defend it.']
};

/* ---------- starter topics ---------- */
var LANG6=['Families & Communities','Personal & Public Identities','Beauty & Aesthetics','Science & Technology','Contemporary Life','Global Challenges'];
var SKILLS=['Interpersonal Speaking (conversations)','Presentational Speaking (cultural comparison)','Interpersonal Writing (email replies)','Presentational Writing (persuasive essay)','Reading Comprehension','Listening Comprehension'];
function lang(extra){ return LANG6.concat(extra||[],SKILLS); }
var EXTRA={
compgov:['Political Systems, Regimes & Governments','Political Institutions','Political & Economic Change','Citizens, Society & the State','Political & Economic Development','Case Study: United Kingdom','Case Study: Russia','Case Study: China','Case Study: Mexico','Case Study: Iran','Case Study: Nigeria'],
africanam:['Origins of the African Diaspora','Freedom, Enslavement & Resistance','The Practice of Freedom','Movements & Debates'],
spanishlit:['Medieval Period','Renaissance & Baroque (Siglo de Oro)','18th & 19th Century: Romanticism & Realism','Early 20th Century & Generation of 1927','Latin American Literature of the 20th Century','Contemporary Voices','Poetic Devices & Literary Analysis','Writing the Literary Essay (in Spanish)'],
frenchlang:lang(['French Verb Tenses (passé composé, imparfait, futur)','The Subjunctive & Conditionals','Pronouns & Agreement']),
germanlang:lang(['Cases (nominative, accusative, dative, genitive)','Verb Position & Word Order','Separable Verbs & Modals']),
italianlang:lang(['Past Tenses (passato prossimo, imperfetto)','The Subjunctive (congiuntivo) & Conditionals','Pronouns & Prepositions']),
japaneselang:lang(['Hiragana & Katakana','Kanji Reading & Writing','Particles & Sentence Structure','Verb Forms & Politeness Levels (keigo)']),
chineselang:lang(['Pinyin & Tones','Characters: Reading & Writing','Measure Words & Sentence Patterns','Aspect, 把 and 被 Structures']),
latin:['Vergil: Aeneid (selections)','Caesar: Gallic War (selections)','Nouns, Cases & Agreement','Verbs: Tenses, Moods & Voices','Participles, Infinitives & Indirect Statement','Subordinate Clauses & Subjunctive Uses','Dactylic Hexameter & Scansion','Rhetorical & Literary Devices','Roman History, Politics & Culture','Sight Translation & Short Answers'],
musictheory:['Pitch, Clefs & Notation','Rhythm & Meter','Scales, Keys & Key Signatures','Intervals','Triads & Seventh Chords','Cadences & Phrases','Roman Numeral Analysis','Part-Writing & Voice Leading','Non-Chord Tones','Secondary Dominants & Modulation','Melody, Form & Texture','Ear Training & Sight-Singing'],
art2d:['Elements of Art','Principles of Design','Color Theory','Composition & Layout','Drawing & Painting Media','Photography & Digital Imaging','Printmaking & Collage','Sustained Investigation','Selected Works Portfolio','Critique & Artist Statements'],
art3d:['Form, Structure & Space','Additive & Subtractive Sculpture','Materials & Processes','Ceramics & Craft','Installation & Environments','Balance, Scale & Proportion','Sustained Investigation','Selected Works Portfolio','Critique & Artist Statements'],
drawing:['Line & Mark-Making','Value & Shading','Perspective & Space','Observational Drawing','Figure & Proportion','Texture & Pattern','Composition','Drawing Materials & Techniques','Sustained Investigation','Selected Works Portfolio'],
seminar:['Question & Explore','Understand & Analyze Arguments','Evaluate Multiple Perspectives','Synthesize Ideas','Team Project & Presentation','Individual Research-Based Essay','Individual Presentation','End-of-Course Exam (Stimulus Texts)'],
research:['Question & Explore','Understand & Analyze Context','Gather & Evaluate Sources','Research Methods & Design','Collect & Interpret Data','Academic Paper','Presentation & Oral Defense','Research Ethics & Integrity'],
/* thin lists: appended after the original units so existing study sets keep matching */
englang:['Rhetorical Analysis Essay','Argument Essay','Synthesis Essay','Multiple-Choice: Reading Passages','Multiple-Choice: Writing Questions','Rhetorical Devices & Fallacies','Tone, Diction & Syntax'],
englit:['Prose Fiction Analysis Essay','Poetry Analysis Essay','Literary Argument Essay','Literary Devices & Figurative Language','Character, Setting & Structure','Narration & Point of View','Multiple-Choice: Prose & Poetry Passages'],
spanishlang:SKILLS.concat(['Verb Tenses & the Subjunctive','Ser vs. Estar, Por vs. Para']),
usgov:['Foundational Documents','Required Supreme Court Cases','Federalism & the Constitution','Interest Groups, Parties & Elections','Policy Making & the Bureaucracy'],
ushistory:['Short-Answer Questions (SAQ)','Document-Based Question (DBQ)','Long Essay Question (LEQ)'],
worldhistory:['Short-Answer Questions (SAQ)','Document-Based Question (DBQ)','Long Essay Question (LEQ)'],
euro:['Short-Answer Questions (SAQ)','Document-Based Question (DBQ)','Long Essay Question (LEQ)'],
csp:['Create Performance Task','Big Idea: Programming Practice (Python/Pseudocode)'],
enviro:['Free-Response: Design an Investigation','Free-Response: Analyze an Environmental Problem'],
psychology:['Research Methods & Statistics','Free-Response Practice (FRQ)'],
statistics:['Free-Response: Investigative Task','Choosing the Right Inference Procedure'],
precalc:['Rates of Change & Average Rate','Modeling with Functions']
};
Object.keys(EXTRA).forEach(function(id){
  var s=SUBJECTS.filter(function(x){return x.id===id;})[0]; if(!s) return;
  var have={}; s.units.forEach(function(u){have[u.toLowerCase()]=1;});
  EXTRA[id].forEach(function(u){ if(!have[u.toLowerCase()]){ s.units.push(u); have[u.toLowerCase()]=1; } });
});

/* ---------- progress helpers ---------- */
function topicsOf(s){ return s.units.concat((state.customTopics&&state.customTopics[s.id])||[]); }
function progress(s){
  var tops=topicsOf(s), done=0, sets=0, next=null;
  tops.forEach(function(t){ var n=safe(function(){return setsForTopic(s.id,t).length;},0); if(n){done++;sets+=n;} else if(!next) next=t; });
  return {total:tops.length,done:done,sets:sets,next:next};
}

/* ---------- toolbar + grid ---------- */
var UI=safe(function(){return JSON.parse(localStorage.getItem('index-courses-ui')||'{}');},{})||{};
UI.q=''; UI.cat=UI.cat||'all'; UI.only=UI.only||'';
function saveUI(){ safe(function(){localStorage.setItem('index-courses-ui',JSON.stringify({cat:UI.cat,only:UI.only}));},0); }

function toolbar(){
  var v=document.getElementById('view-courses'), list=document.getElementById('courses-list'); if(!v||!list) return;
  var tb=document.getElementById('cp-toolbar');
  if(!tb){ tb=document.createElement('div'); tb.id='cp-toolbar'; tb.className='cp-toolbar'; list.parentNode.insertBefore(tb,list); }
  var chips='<button type="button" class="cp-chip'+(UI.cat==='all'?' on':'')+'" data-cp-cat="all">All</button>'+
    Object.keys(CATEGORIES).map(function(k){ return '<button type="button" class="cp-chip'+(UI.cat===k?' on':'')+'" data-cp-cat="'+k+'" style="--cp-c:'+CATEGORIES[k].color+'">'+CATEGORIES[k].icon+' '+esc(CATEGORIES[k].label)+'</button>'; }).join('');
  var q=document.getElementById('cp-q'); var keep=q?q.value:''; var focus=document.activeElement===q;
  tb.innerHTML='<div class="cp-search"><span aria-hidden="true">🔍</span><input id="cp-q" type="search" placeholder="Search courses…" autocomplete="off" aria-label="Search courses" value="'+esc(keep)+'"></div>'+
    '<div class="cp-chips" role="group" aria-label="Filter by category">'+chips+'</div>'+
    '<div class="cp-chips cp-mini"><button type="button" class="cp-chip'+(UI.only==='progress'?' on':'')+'" data-cp-only="progress">In progress</button><button type="button" class="cp-chip'+(UI.only==='new'?' on':'')+'" data-cp-only="new">Not started</button></div>';
  if(focus){ var n=document.getElementById('cp-q'); n.focus(); n.setSelectionRange(keep.length,keep.length); }
}

function card(s,catId){
  var cat=CATEGORIES[catId], c=cat.color, info=INFO[s.id]||[cat.icon,''];
  var p=progress(s), m=safe(function(){return courseMastery(s.id);},null);
  var pct=p.total?Math.round(p.done/p.total*100):0;
  var hint=!p.total?'Add your own topics':(p.next?(p.done?'Next: ':'Start with: ')+p.next:'Every topic has a study set ✓');
  return '<button class="cp-card" style="--cp-c:'+c+'" data-action="open-course" data-id="'+esc(s.id)+'">'
    +'<span class="cp-ic">'+info[0]+'</span>'
    +'<span class="cp-body"><span class="cp-name">'+esc(s.name)+'</span>'
    +(info[1]?'<span class="cp-desc">'+esc(info[1])+'</span>':'')
    +'<span class="cp-stats"><span>'+p.total+' topic'+(p.total===1?'':'s')+'</span>'+(p.sets?'<span>'+p.sets+' set'+(p.sets===1?'':'s')+'</span>':'')+(m!=null?'<span class="cp-m">'+m+'% avg</span>':'')+'</span>'
    +'<span class="cp-bar" role="img" aria-label="'+pct+'% of topics studied"><i style="width:'+pct+'%"></i></span>'
    +'<span class="cp-hint">'+esc(hint)+'</span></span></button>';
}

function matches(s){
  var q=(UI.q||'').trim().toLowerCase();
  if(q){ var hay=(s.name+' '+((INFO[s.id]||[])[1]||'')+' '+topicsOf(s).join(' ')).toLowerCase(); if(hay.indexOf(q)<0) return false; }
  if(UI.only){ var p=progress(s); if(UI.only==='progress'&&!p.done) return false; if(UI.only==='new'&&p.done) return false; }
  return true;
}

var _renderCourses=window.renderCourses;
window.renderCourses=function(){
  var list=document.getElementById('courses-list');
  if(!list) return _renderCourses.apply(this,arguments);
  toolbar();
  var html='', shown=0;
  Object.keys(CATEGORIES).forEach(function(catId){
    if(UI.cat!=='all'&&UI.cat!==catId) return;
    var subs=SUBJECTS.filter(function(s){return s.cat===catId&&matches(s);}); if(!subs.length) return;
    shown+=subs.length;
    var c=CATEGORIES[catId].color;
    html+='<div class="cat-block"><div class="cat-title"><span class="cat-swatch" style="background:'+c+'"></span>'+esc(CATEGORIES[catId].label)+' <span class="cp-count">'+subs.length+'</span></div><div class="cp-grid">'+subs.map(function(s){return card(s,catId);}).join('')+'</div></div>';
  });
  if(!shown) html='<div class="empty-state"><h3>No courses match</h3><p>Try a different search or clear the filters.</p></div>';
  list.innerHTML=html;
};

/* ---------- detail page ---------- */
var _detail=window.renderCourseDetail;
window.renderCourseDetail=function(id){
  var out=_detail.apply(this,arguments);
  safe(function(){
    var s=SUBJECTS.filter(function(x){return x.id===id;})[0]; var hero=document.querySelector('#coursedetail-body .course-hero'); if(!s||!hero) return;
    var info=INFO[id]||['',''], p=progress(s), m=courseMastery(id);
    var el=document.createElement('div'); el.id='cp-detail'; el.className='cp-detail'; el.style.setProperty('--cp-c',categoryColor(s.cat));
    el.innerHTML=(info[1]?'<p class="cp-lede">'+esc(info[1])+'</p>':'')
      +'<div class="cp-tiles"><div><b>'+p.total+'</b><span>topics</span></div><div><b>'+p.done+'</b><span>with a study set</span></div><div><b>'+p.sets+'</b><span>sets made</span></div><div><b>'+(m==null?'–':m+'%')+'</b><span>quiz average</span></div></div>'
      +'<div class="cp-bar big"><i style="width:'+(p.total?Math.round(p.done/p.total*100):0)+'%"></i></div>'
      +(p.next?'<button type="button" class="cp-next" data-cp-next="'+esc(p.next)+'">▶ '+(p.done?'Next topic: ':'Start with: ')+esc(p.next)+'</button>':'');
    hero.insertAdjacentElement('afterend',el);
  },0);
  return out;
};
document.addEventListener('click',function(e){
  var t=e.target.closest&&e.target.closest('[data-cp-next]'); if(!t) return;
  var topic=t.getAttribute('data-cp-next'); state.courseDetail.expandedTopic=topic; safe(function(){renderTopicsList();},0);
  var row=document.querySelector('#topics-list .topic-row .topic-head[data-topic="'+(window.CSS&&CSS.escape?CSS.escape(topic):topic)+'"]'); if(row) row.scrollIntoView({block:'center',behavior:'smooth'});
});

/* ---------- topic rows: show which topics already have study sets ---------- */
var _tl=window.renderTopicsList;
window.renderTopicsList=function(){
  var out=_tl.apply(this,arguments);
  safe(function(){
    var id=state.courseDetail.subjectId;
    document.querySelectorAll('#topics-list .topic-head').forEach(function(h){
      var t=h.getAttribute('data-topic'); var n=setsForTopic(id,t).length;
      var chev=h.querySelector('.topic-chevron'); if(!chev) return;
      var b=document.createElement('span'); b.className='cp-badge'+(n?' on':''); b.textContent=n?(n+' set'+(n===1?'':'s')):'new';
      h.insertBefore(b,chev);
    });
  },0);
  return out;
};

/* ---------- toolbar events ---------- */
document.addEventListener('input',function(e){ if(e.target&&e.target.id==='cp-q'){ UI.q=e.target.value; window.renderCourses(); } });
document.addEventListener('click',function(e){
  var c=e.target.closest&&e.target.closest('[data-cp-cat]'), o=e.target.closest&&e.target.closest('[data-cp-only]');
  if(c){ UI.cat=c.getAttribute('data-cp-cat'); saveUI(); window.renderCourses(); }
  else if(o){ var v=o.getAttribute('data-cp-only'); UI.only=UI.only===v?'':v; saveUI(); window.renderCourses(); }
});

safe(function(){ if(document.getElementById('courses-list')) window.renderCourses(); },0);
})();
