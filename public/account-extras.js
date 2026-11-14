/* Saves Tutor chats and Learn lessons to the signed-in account (not just this device).
   It watches the two localStorage keys those features already use, stamps when they change, and
   adds them to the account snapshot that Index already syncs. The newer copy wins; if this device
   has newer unsynced changes they are merged into the account copy instead of overwriting it. */
(function(){
'use strict';
var KEYS={tutor:'index-tutor-chats',learn:'index-learn-v2'}, AT='index-extras-at';
var TUTOR_MAX=280000, LEARN_MAX=190000;
var rawSet=Storage.prototype.setItem, muted=false, timer=0;
function jget(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
function atGet(){ var o=jget(AT,{}); return o&&typeof o==='object'?o:{}; }
function atSet(o){ muted=true; try{ rawSet.call(localStorage,AT,JSON.stringify(o)); }catch(e){} muted=false; }
function rawWrite(k,v){ muted=true; try{ rawSet.call(localStorage,k,JSON.stringify(v)); }catch(e){} muted=false; }
function signedIn(){ try{ return typeof state!=='undefined'&&!!state.account; }catch(e){ return false; } }
function push(){ try{ if(signedIn()&&typeof scheduleAccountStateSync==='function') scheduleAccountStateSync(); }catch(e){} }
function queue(){ clearTimeout(timer); timer=setTimeout(push,4000); }

Storage.prototype.setItem=function(k,v){
  rawSet.apply(this,arguments);
  if(this===window.localStorage&&!muted&&(k===KEYS.tutor||k===KEYS.learn)){
    var a=atGet(); a[k===KEYS.tutor?'tutor':'learn']=Date.now(); atSet(a); queue();
  }
};

function trimChats(list){
  var chats=(Array.isArray(list)?list:[]).filter(function(c){return c&&c.id&&Array.isArray(c.msgs)&&c.msgs.length;}).map(function(c){
    return {id:c.id,title:c.title,t:c.t||0,pin:!!c.pin,custom:!!c.custom,ai:!!c.ai,subject:c.subject||'',msgs:c.msgs.slice(-80).map(function(m){return {role:m.role,text:String(m.text||'').slice(0,6000)};})};
  });
  chats.sort(function(a,b){return ((b.pin?1:0)-(a.pin?1:0))||(b.t-a.t);});
  var out=[], bytes=2;
  chats.slice(0,40).forEach(function(c){ var n=JSON.stringify(c).length+1; if(bytes+n<=TUTOR_MAX){ out.push(c); bytes+=n; } });
  return out;
}
function trimLearn(st){
  if(!st||!Array.isArray(st.lessons)) return null;
  var ls=st.lessons.filter(function(l){return l&&l.id;}).sort(function(a,b){return (b.updatedAt||0)-(a.updatedAt||0);});
  var out=[], bytes=100;
  ls.slice(0,30).forEach(function(l){ var n; try{ n=JSON.stringify(l).length+1; }catch(e){ return; } if(bytes+n<=LEARN_MAX){ out.push(l); bytes+=n; } });
  return {v:1,activeId:out.some(function(l){return l.id===st.activeId;})?st.activeId:null,lessons:out};
}

function payload(){
  var at=atGet(), tutor=jget(KEYS.tutor,null), learn=jget(KEYS.learn,null), o={};
  try{ var rl=localStorage.getItem('index-role'); if(rl==='student'||rl==='teacher') o.role=rl; }catch(e){}
  if(Array.isArray(tutor)){ o.tutorChats=trimChats(tutor); o.tutorChatsAt=at.tutor||Date.now(); }
  if(learn&&Array.isArray(learn.lessons)){ o.learnStore=trimLearn(learn); o.learnAt=at.learn||Date.now(); }
  return o;
}

function apply(a){
  if(!a||typeof a!=='object') return;
  try{ if((a.role==='student'||a.role==='teacher')&&!localStorage.getItem('index-role-pending')){ localStorage.setItem('index-role',a.role); document.body.setAttribute('data-role',a.role); localStorage.setItem('index-welcome-v1','1'); } }catch(e){}
  var at=atGet(), pushNeeded=false;
  // Tutor chats
  var localChats=jget(KEYS.tutor,null), lat=at.tutor||0, sat=Number(a.tutorChatsAt)||0;
  if(sat&&Array.isArray(a.tutorChats)){
    if(sat>lat){
      rawWrite(KEYS.tutor,a.tutorChats); at.tutor=sat;
      try{ window.TutorHistory&&TutorHistory.reload&&TutorHistory.reload(); }catch(e){}
    }else if(sat<lat&&Array.isArray(localChats)&&localChats.length){
      var byId={}; a.tutorChats.concat(localChats).forEach(function(c){ if(c&&c.id&&(!byId[c.id]||(c.t||0)>(byId[c.id].t||0))) byId[c.id]=c; });
      var merged=Object.keys(byId).map(function(k){return byId[k];}).sort(function(x,y){return (y.t||0)-(x.t||0);});
      rawWrite(KEYS.tutor,merged); at.tutor=Date.now(); pushNeeded=true;
      try{ window.TutorHistory&&TutorHistory.reload&&TutorHistory.reload(); }catch(e){}
    }
  }else if(Array.isArray(localChats)&&localChats.length){ at.tutor=at.tutor||Date.now(); pushNeeded=true; }
  // Learn lessons
  var localLearn=jget(KEYS.learn,null), llat=at.learn||0, slat=Number(a.learnAt)||0, changedLearn=false;
  if(slat&&a.learnStore&&Array.isArray(a.learnStore.lessons)){
    if(slat>llat){ rawWrite(KEYS.learn,a.learnStore); at.learn=slat; changedLearn=true; }
    else if(slat<llat&&localLearn&&Array.isArray(localLearn.lessons)&&localLearn.lessons.length){
      var byL={}; a.learnStore.lessons.concat(localLearn.lessons).forEach(function(l){ if(l&&l.id&&(!byL[l.id]||(l.updatedAt||0)>(byL[l.id].updatedAt||0))) byL[l.id]=l; });
      var ml=Object.keys(byL).map(function(k){return byL[k];}).sort(function(x,y){return (y.updatedAt||0)-(x.updatedAt||0);});
      rawWrite(KEYS.learn,{v:1,activeId:localLearn.activeId||a.learnStore.activeId||null,lessons:ml}); at.learn=Date.now(); pushNeeded=true; changedLearn=true;
    }
  }else if(localLearn&&Array.isArray(localLearn.lessons)&&localLearn.lessons.length){ at.learn=at.learn||Date.now(); pushNeeded=true; }
  atSet(at);
  if(changedLearn){ try{ window.dispatchEvent(new StorageEvent('storage',{key:KEYS.learn})); }catch(e){} }
  if(pushNeeded) queue();
}

function clearLocal(){ [KEYS.tutor,KEYS.learn,AT].forEach(function(k){ try{ localStorage.removeItem(k); }catch(e){} }); try{ window.TutorHistory&&TutorHistory.reload&&TutorHistory.reload(); }catch(e){} try{ window.dispatchEvent(new StorageEvent('storage',{key:KEYS.learn})); }catch(e){} }

window.AccountExtras={payload:payload,apply:apply,clearLocal:clearLocal,touchRole:push};
})();
