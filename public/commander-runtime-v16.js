(function(){
'use strict';
if(window.__indexCommanderRuntimeV16)return;
window.__indexCommanderRuntimeV16=true;

/* V16 final audit hardening:
   - disables the obsolete V10 watchdog from ever launching a second wave
   - corrects the gate reward so only correct answers award +10 deployment coins
   - keeps the existing question/AI provider untouched
*/
function game(){try{return typeof state!=='undefined'&&state&&state.games?state.games:null;}catch(e){return null;}}

/* V14 owns the wave lifecycle. The legacy V10 watchdog is no longer needed
   and must never become a second owner. */
try{
  if(typeof commanderWaveEngineV10!=='undefined'){
    commanderWaveEngineV10.active=true;
  }
}catch(e){}

/* The existing answer handler already records the answer, renders feedback,
   saves state, and prefetches the next question. It historically added +10
   before checking correctness. Keep all of that behavior, then reverse the
   reward on an incorrect answer. */
try{
  var previousAnswer=window.__commanderAnswerV6;
  if(typeof previousAnswer==='function'&&!previousAnswer.__v16CorrectReward){
    var answerV16=function(index,e){
      var g=game();
      var before=g?Number(g.waveCoins||0):0;
      var correct=!!(g&&g.question&&Number(index)===Number(g.question.correct));
      var result=previousAnswer.apply(this,arguments);
      g=game();
      if(g&&g.active==='commander'){
        if(!correct){
          /* previous handler awarded +10; remove exactly that reward */
          g.waveCoins=Math.max(0,Number(g.waveCoins||0)-10);
          try{if(typeof window.v6Save==='function')window.v6Save(g);}catch(err){}
          try{if(typeof window.renderBattle==='function')window.renderBattle(g);}catch(err){}
        }
      }
      return result;
    };
    answerV16.__v16CorrectReward=true;
    window.__commanderAnswerV6=answerV16;
  }
}catch(e){console.error('[Commander V16] answer hardening failed',e);}

/* Make the gate question and source badge unconditionally readable. */
try{
  var style=document.getElementById('commander-v16-final-audit');
  if(!style){
    style=document.createElement('style');
    style.id='commander-v16-final-audit';
    style.textContent=[
      '.commander-auth-question h2,.commander-gate-question-v8 h2{color:#fff!important;opacity:1!important;visibility:visible!important;text-shadow:0 1px 3px rgba(0,0,0,.65)!important;}',
      '.commander-auth-question p,.commander-auth-question .commander-auth-ai-badge{color:#eafaff!important;opacity:1!important;visibility:visible!important;}',
      '.commander-auth-option,.commander-auth-option *{opacity:1!important;visibility:visible!important;}',
      '.commander-auth-active-actions button{pointer-events:auto!important;cursor:pointer!important;}'
    ].join('');
    document.head.appendChild(style);
  }
}catch(e){}

})();