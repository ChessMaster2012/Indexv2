/* Host-a-game makeover: illustrated mode cards, stats meters, a mode showcase on the hub, a hero banner and
   preset cards in Host Studio. Works by decorating the screens live-ui.js renders (all data-lv hooks stay intact). */
(function(){
'use strict';
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
var SV='<svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">';
var ART={
 trivia:SV+'<g opacity=".25" fill="#fff"><circle cx="30" cy="30" r="40"/><circle cx="220" cy="100" r="50"/></g><rect x="62" y="74" width="34" height="46" rx="5" fill="#fff" opacity=".85"/><rect x="103" y="56" width="34" height="64" rx="5" fill="#ffe27a"/><rect x="144" y="86" width="34" height="34" rx="5" fill="#fff" opacity=".7"/><path d="M127 6 108 40h14l-6 26 24-38h-15z" fill="#fff" stroke="#ffe27a" stroke-width="3" stroke-linejoin="round"/></svg>',
 rocket:SV+'<g fill="#fff" opacity=".8"><circle cx="30" cy="22" r="2"/><circle cx="90" cy="14" r="1.6"/><circle cx="200" cy="26" r="2.2"/><circle cx="160" cy="70" r="1.5"/><circle cx="50" cy="90" r="1.8"/></g><path d="M0 104Q90 96 150 70T240 24" stroke="#fff" stroke-opacity=".4" stroke-width="6" fill="none" stroke-dasharray="10 9"/><g transform="translate(138 24) rotate(32 40 36)"><path d="M40 0c18 12 20 34 14 58H26C20 34 22 12 40 0z" fill="#fff"/><circle cx="40" cy="26" r="9" fill="#5fb7ff" stroke="#e8f4ff" stroke-width="3"/><path d="M26 44 10 62l16-4zM54 44l16 18-16-4z" fill="#ffd45c"/><path d="M32 58h16l-8 24z" fill="#ff8a4c"/></g></svg>',
 tower:SV+'<g opacity=".22" fill="#fff"><circle cx="40" cy="90" r="46"/></g><rect x="92" y="90" width="56" height="26" rx="4" fill="#fff"/><rect x="98" y="62" width="44" height="26" rx="4" fill="#ffe27a"/><rect x="104" y="36" width="32" height="24" rx="4" fill="#fff" opacity=".85"/><rect x="110" y="12" width="20" height="22" rx="4" fill="#ffb86b"/><path d="M120 0v12" stroke="#fff" stroke-width="3"/><path d="M120 0l16 5-16 5z" fill="#ff5a7a"/><rect x="26" y="98" width="30" height="18" rx="3" fill="#fff" opacity=".5"/><rect x="186" y="96" width="34" height="20" rx="3" fill="#fff" opacity=".5"/></svg>',
 zombie:SV+'<g opacity=".18" fill="#000"><circle cx="40" cy="30" r="34"/><circle cx="210" cy="90" r="44"/></g><rect x="84" y="20" width="72" height="80" rx="22" fill="#9bd36b"/><circle cx="106" cy="52" r="10" fill="#fff"/><circle cx="136" cy="50" r="12" fill="#fff"/><circle cx="108" cy="54" r="4.5" fill="#2a3a1a"/><circle cx="137" cy="52" r="5" fill="#2a3a1a"/><path d="M100 80h40M108 76v10M120 76v10M132 76v10" stroke="#2a3a1a" stroke-width="4" stroke-linecap="round"/><path d="M96 24l14 14M146 20l-10 16" stroke="#6aa13f" stroke-width="5" stroke-linecap="round"/><g fill="#ffe27a"><circle cx="30" cy="70" r="5"/><circle cx="48" cy="70" r="5" opacity=".6"/><circle cx="64" cy="70" r="5" opacity=".3"/></g></svg>',
 gems:SV+'<g opacity=".2" fill="#fff"><circle cx="200" cy="30" r="50"/></g><g stroke="#fff" stroke-width="3" stroke-linejoin="round"><path d="M96 52h48l22 26-46 36-46-36z" fill="#7be0ff"/><path d="M96 52l22 26M144 52l-22 26M74 78h92M118 78l-4 36M118 78l4 36" fill="none" opacity=".9"/></g><path d="M40 30l9 12-9 12-9-12z" fill="#ffe27a" stroke="#fff" stroke-width="2"/><path d="M196 70l8 10-8 10-8-10z" fill="#ff8ad0" stroke="#fff" stroke-width="2"/><g fill="#fff"><circle cx="190" cy="24" r="2.4"/><circle cx="60" cy="98" r="2"/><circle cx="170" cy="100" r="1.8"/></g></svg>',
 elimination:SV+'<g fill="#fff" opacity=".7"><circle cx="30" cy="20" r="1.8"/><circle cx="120" cy="12" r="1.4"/><circle cx="210" cy="60" r="2"/></g><g><path d="M34 4 96 66" stroke="#ffb86b" stroke-width="10" stroke-linecap="round" opacity=".5"/><circle cx="98" cy="68" r="15" fill="#ff7a4d"/><circle cx="93" cy="63" r="5" fill="#ffb86b"/></g><g><path d="M170 0l36 40" stroke="#ffb86b" stroke-width="7" stroke-linecap="round" opacity=".5"/><circle cx="208" cy="42" r="10" fill="#ff7a4d"/></g><path d="M120 70c18 0 30-6 38-14 2 22-8 46-38 60-30-14-40-38-38-60 8 8 20 14 38 14z" fill="#7aa7ff" stroke="#fff" stroke-width="4" stroke-linejoin="round" transform="translate(0 -6) scale(1 .92)"/><path d="m108 76 9 9 17-18" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
var META={
 trivia:{g:['#ff9a4d','#e2453f'],tag:'SPEED QUIZ',best:'Quick reviews',st:[['Speed',5],['Strategy',1],['Chaos',1]]},
 rocket:{g:['#5b6dff','#9d4dff'],tag:'RACE',best:'Competitive classes',st:[['Speed',4],['Strategy',2],['Chaos',2]]},
 tower:{g:['#f2a93b','#d9643a'],tag:'BUILD',best:'Steady practice',st:[['Speed',3],['Strategy',4],['Chaos',2]]},
 zombie:{g:['#4fa86a','#1f6b4a'],tag:'ARENA',best:'High energy review',st:[['Speed',3],['Strategy',3],['Chaos',5]]},
 gems:{g:['#27b7d6','#3a63d8'],tag:'ARENA',best:'Risk and reward',st:[['Speed',3],['Strategy',5],['Chaos',4]]},
 elimination:{g:['#8a5bd6','#c2417a'],tag:'SURVIVAL',best:'Finals and reviews',st:[['Speed',3],['Strategy',3],['Chaos',5]]}
};
function modes(){try{return GAME_MODES;}catch(e){return {};}}
function meters(k){return '<div class="lvh-meters">'+META[k].st.map(function(s){var d='';for(var i=1;i<=5;i++)d+='<i'+(i<=s[1]?' class="on"':'')+'></i>';return '<span><em>'+s[0]+'</em><b>'+d+'</b></span>';}).join('')+'</div>';}
function card(k,on,attr){
  var m=modes()[k],mt=META[k]; if(!m||!mt) return '';
  return '<button type="button" class="lvh-mode'+(on?' on':'')+'" '+attr+' aria-pressed="'+!!on+'" style="--g1:'+mt.g[0]+';--g2:'+mt.g[1]+'"><div class="lvh-art">'+ART[k]+'<span class="lvh-tag">'+mt.tag+'</span>'+(on?'<span class="lvh-check">✓ Selected</span>':'')+'</div><div class="lvh-body"><b>'+esc(m.label)+'</b><p>'+esc(m.desc)+'</p>'+meters(k)+'<span class="lvh-best">Best for: '+esc(mt.best)+'</span></div></button>';
}
var PRESETS={classroom:['Classroom','5 min, steady pace, speed bonus'],sprint:['Sprint','Short and fast, 3 minutes'],review:['Study session','Longer, flat scoring, calm'],chill:['Relaxed','No pressure, long pauses']};
function decorate(scr){
  var stage=$('live-stage'); if(!stage) return; var L=state.live;
  if(scr==='hub'){
    var strip=stage.querySelector('.lv-modes-strip');
    if(strip){ strip.className='lvh-show'; strip.innerHTML='<div class="lvh-show-h"><div><p class="lv-eyebrow">PICK A GAME MODE</p><h3>Six ways to play together</h3></div><button type="button" class="btn btn-primary" data-lv="goto" data-screen="host-setup">🎤 Host a game</button></div><div class="lvh-grid">'+Object.keys(modes()).map(function(k){return card(k,false,'data-lvh-host="'+k+'"');}).join('')+'</div>'; }
    var hh=stage.querySelector('.lv-hero-text');
    if(hh&&!hh.querySelector('.lvh-cta')) hh.insertAdjacentHTML('beforeend','<div class="lvh-cta"><button type="button" class="btn btn-primary btn-lg" data-lv="goto" data-screen="host-setup">🎤 Host a game</button><span>Pick a mode, add questions, share a 5-letter code.</span></div>');
  }
  if(scr==='host-setup'){
    var k=L.mode||'trivia', mt=META[k]||META.trivia, m=modes()[k]||{label:'',desc:''};
    var head=stage.querySelector('.lv-page-head');
    if(head){ head.className='lvh-hero'; head.style.cssText='--g1:'+mt.g[0]+';--g2:'+mt.g[1]; head.innerHTML='<div class="lvh-hero-t"><p class="lv-eyebrow">HOST STUDIO</p><h3>Build your live game</h3><p>Three quick steps: choose a mode, pick questions, set the rules. Your students join with a code.</p><div class="lvh-steps"><span><i>1</i>Mode</span><span><i>2</i>Questions</span><span><i>3</i>Rules</span></div></div><div class="lvh-hero-a">'+ART[k]+'</div>'; }
    var grid=stage.querySelector('.lv-mode-grid');
    if(grid){ grid.className='lvh-grid lvh-grid-setup'; grid.innerHTML=Object.keys(modes()).map(function(x){return card(x,L.mode===x,'data-lv="mode" data-mode="'+x+'"');}).join(''); }
    var pre=stage.querySelector('.lv-presets');
    if(pre){ pre.className='lvh-presets'; pre.innerHTML='<span>Quick presets</span><div>'+Object.keys(PRESETS).map(function(p){return '<button type="button" class="lvh-preset" data-lv="preset" data-preset="'+p+'"><b>'+PRESETS[p][0]+'</b><small>'+PRESETS[p][1]+'</small></button>';}).join('')+'</div>'; }
    var side=stage.querySelector('.lv-summary-card');
    if(side&&!side.querySelector('.lvh-side-art')) side.insertAdjacentHTML('afterbegin','<div class="lvh-side-art" style="--g1:'+mt.g[0]+';--g2:'+mt.g[1]+'">'+ART[k]+'<b>'+esc(m.label)+'</b></div>');
  }
}
document.addEventListener('click',function(e){
  var t=e.target&&e.target.closest&&e.target.closest('[data-lvh-host]'); if(!t) return;
  state.live.mode=t.getAttribute('data-lvh-host'); state.live.screen='host-setup'; renderLive(); window.scrollTo(0,0);
},true);
var prev=window.lvAfterRender;
window.lvAfterRender=function(scr){ if(prev) prev.apply(this,arguments); try{decorate(scr);}catch(e){console.error('host makeover',e);} };
})();
