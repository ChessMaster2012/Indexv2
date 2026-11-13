/* Progress bar for AI generations (study sets, Learn lessons and other one-shot builds).
   It does not guess a fixed time: it learns how long each kind of build usually takes on this device
   and shows an honest estimate, plus how many requests of the current build have finished. */
(function(){
'use strict';
var KEY='index-gen-avg', DEFAULT_MS=22000;
var jobs=[], done=0, total=0, raf=0, hideT=0, failed=0, label='', el=null;
function avgs(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}')||{}; }catch(e){ return {}; } }
function saveAvg(kind,ms){ try{ var a=avgs(); a[kind]=a[kind]?Math.round(a[kind]*0.6+ms*0.4):ms; localStorage.setItem(KEY,JSON.stringify(a)); }catch(e){} }
function viewLabel(){
  var v=''; try{ v=(typeof state!=='undefined'&&state.view)||''; }catch(e){}
  if(!v){ var a=document.querySelector('.view.active'); v=a?a.id.replace('view-',''):''; }
  return ({studysets:'Building your study set',learn:'Building your lesson',notes:'Working on your notes',courses:'Building your lesson',games:'Preparing your game',lab:'Preparing your lab'})[v]||'Generating with AI';
}
function ensure(){
  if(el) return el;
  el=document.createElement('div'); el.id='gp-card'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); el.hidden=true;
  el.innerHTML='<div class="gp-top"><b id="gp-title"></b><span id="gp-pct">0%</span></div><div class="gp-bar"><i id="gp-fill"></i></div><div class="gp-sub" id="gp-sub"></div>';
  document.body.appendChild(el); return el;
}
function estimate(j){ var e=Math.max(1000,j.avg), t=Date.now()-j.start; return Math.min(0.94,1-Math.exp(-1.6*t/e)); }
function frac(){
  if(!total) return 0;
  var inflight=jobs.filter(function(j){return !j.end;}), part=0;
  inflight.forEach(function(j){ part+=estimate(j); });
  return Math.min(1,(done+part)/total);
}
function paint(){
  var c=ensure(), p=Math.round(frac()*100), inflight=jobs.filter(function(j){return !j.end;});
  c.classList.toggle('bad',failed>0&&!inflight.length);
  document.getElementById('gp-title').textContent=failed&&!inflight.length?'That build did not finish':label;
  document.getElementById('gp-pct').textContent=(failed&&!inflight.length)?'':p+'%';
  document.getElementById('gp-fill').style.width=p+'%';
  var oldest=inflight.length?Math.max.apply(null,inflight.map(function(j){return Date.now()-j.start;})):0;
  var avg=inflight.length?Math.round(inflight[0].avg/1000):0;
  var sub=total>1?(done+' of '+total+' steps finished'):(inflight.length?'Usually takes about '+avg+' seconds':'');
  if(inflight.length&&oldest>avg*1000*1.6) sub+=(sub?' · ':'')+'Taking longer than usual, still working…';
  document.getElementById('gp-sub').textContent=sub;
  if(inflight.length) raf=setTimeout(paint,250);
}
function start(kind){
  var a=avgs(), j={start:Date.now(),end:0,kind:kind,avg:a[kind]||DEFAULT_MS};
  if(!jobs.some(function(x){return !x.end;})){ jobs=[]; done=0; total=0; failed=0; label=viewLabel(); }
  jobs.push(j); total++; clearTimeout(hideT); var c=ensure(); c.hidden=false; c.classList.remove('bad','fade'); clearTimeout(raf); paint();
  return j;
}
function finish(j,ok){
  if(j.end) return; j.end=Date.now();
  if(ok){ done++; saveAvg(j.kind,j.end-j.start); } else failed++;
  var left=jobs.some(function(x){return !x.end;});
  if(!left){
    clearTimeout(raf);
    if(failed&&!done){ paint(); hideT=setTimeout(hide,6000); }
    else { done=total; paint(); hideT=setTimeout(hide,900); }
  } else paint();
}
function hide(){ if(!el) return; el.classList.add('fade'); setTimeout(function(){ if(el){ el.hidden=true; el.classList.remove('fade'); } jobs=[]; done=0; total=0; failed=0; },300); }

var realFetch=window.fetch;
window.fetch=function(input,init){
  var url=typeof input==='string'?input:(input&&input.url)||'';
  if(url.indexOf('/api/ai/chat')<0||!init||typeof init.body!=='string') return realFetch.apply(this,arguments);
  var intent=''; try{ intent=JSON.parse(init.body).intent||''; }catch(e){}
  if(intent!=='study-set') return realFetch.apply(this,arguments); // Tutor chat already streams its answer on screen
  var j=start('study-set');
  var p=realFetch.apply(this,arguments);
  p.then(function(res){ finish(j,res.ok); },function(){ finish(j,false); });
  return p;
};
window.GenProgress={start:start,finish:finish};
})();
