(function(){
'use strict';
if(window.__indexCommanderRuntimeV14)return;
window.__indexCommanderRuntimeV14=true;

var raf=null;
function game(){try{return typeof state!=='undefined'&&state&&state.games?state.games:null;}catch(e){return null;}}
function mapFor(g){try{return Array.isArray(COMMANDER_MAPS_FINAL)?COMMANDER_MAPS_FINAL.find(function(m){return m&&m.id===g.mapId;}):null;}catch(e){return null;}}
function stop(){if(raf!=null){cancelAnimationFrame(raf);raf=null;}}
function lock(locked){document.querySelectorAll('#commander-pack-v4-start,#commander-auth-start-wave,.commander-auth-start,[data-commander-start-wave]').forEach(function(b){if(!b)return;b.disabled=!!locked;b.style.pointerEvents=locked?'none':'auto';b.textContent=locked?'▣ Wave In Progress':'▶ Start Wave';});}
function updateHud(g){
  var hud=document.getElementById('commander-live-hud');
  if(hud)hud.textContent='ROUND '+Math.max(1,Number(g.wave)||1)+'  •  ENEMIES '+(g.enemies||[]).length+'  •  SPAWNED '+(g.spawnCount||0)+' / '+(g.spawnTotal||0)+'  •  BASE '+Math.max(0,Math.floor(Number(g.base)||0));
  var left=document.querySelector('#games-stage .commander-auth-side-left .commander-auth-wallet');
  if(left){var p=null;try{p=typeof commanderFinalProfile==='function'?commanderFinalProfile():null;}catch(e){}left.innerHTML='<div><b>🪙 '+Math.floor(Number(p&&p.coins)||0)+'</b><span>Persistent Coins</span></div><div><b>♥ '+Math.max(0,Math.floor(Number(g.base)||0))+'</b><span>Base</span></div>';}
}
function terrain(m,w,h,dpr){
  var c=document.createElement('canvas');c.width=Math.max(1,Math.floor(w*dpr));c.height=Math.max(1,Math.floor(h*dpr));
  var x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.fillStyle=m.land||'#68a463';x.fillRect(0,0,w,h);
  var grd=x.createRadialGradient(w*.48,h*.42,30,w*.48,h*.42,Math.max(w,h)*.9);grd.addColorStop(0,'rgba(255,255,255,.09)');grd.addColorStop(1,'rgba(15,42,29,.16)');x.fillStyle=grd;x.fillRect(0,0,w,h);
  (Array.isArray(m.detail)?m.detail:[]).forEach(function(line){if(!Array.isArray(line)||line.length<2)return;x.save();x.strokeStyle='rgba(39,87,55,.4)';x.lineWidth=8;x.lineCap='round';x.lineJoin='round';x.beginPath();line.forEach(function(p,i){var a=p[0]*w,b=p[1]*h;i?x.lineTo(a,b):x.moveTo(a,b);});x.stroke();x.strokeStyle='rgba(187,220,160,.13)';x.lineWidth=2;x.stroke();x.restore();});
  (Array.isArray(m.rocks)?m.rocks:[]).forEach(function(o){if(!o||o.length<3)return;var a=o[0]*w,b=o[1]*h,r=Math.max(8,o[2]*w);x.fillStyle='rgba(13,27,21,.2)';x.beginPath();x.ellipse(a+3,b+5,r,r*.88,0,0,Math.PI*2);x.fill();x.fillStyle='#65745f';x.strokeStyle='rgba(25,48,39,.55)';x.lineWidth=2;x.beginPath();x.arc(a,b,r,0,Math.PI*2);x.fill();x.stroke();});
  (Array.isArray(m.water)?m.water:[]).forEach(function(o){if(!o||o.length<3)return;var a=o[0]*w,b=o[1]*h,rx=o[2]*w,ry=(o[3]||o[2]*.62)*h;x.fillStyle='#4bb0cf';x.beginPath();x.ellipse(a,b,rx,ry,0,0,Math.PI*2);x.fill();});
  var pts=(m.route||[]).map(function(p){return{x:Number(p[0])*w,y:Number(p[1])*h};});
  if(pts.length>=2){x.save();x.lineCap='round';x.lineJoin='round';x.strokeStyle='rgba(255,255,255,.28)';x.lineWidth=72;x.beginPath();pts.forEach(function(p,i){i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});x.stroke();x.strokeStyle='rgba(200,163,120,.44)';x.lineWidth=54;x.beginPath();pts.forEach(function(p,i){i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});x.stroke();x.strokeStyle=m.path||'#a88a61';x.lineWidth=44;x.beginPath();pts.forEach(function(p,i){i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});x.stroke();x.strokeStyle='rgba(255,241,204,.5)';x.lineWidth=3;x.setLineDash([18,14]);x.beginPath();pts.forEach(function(p,i){i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});x.stroke();x.setLineDash([]);x.restore();var st=pts[0],en=pts[pts.length-1];x.fillStyle='#35d59c';x.beginPath();x.arc(st.x,st.y,28,0,Math.PI*2);x.fill();x.fillStyle='#ef6473';x.beginPath();x.roundRect(en.x-30,en.y-30,60,60,10);x.fill();x.fillStyle='#fff';x.font='950 10px Arial';x.textAlign='center';x.fillText('BASE',en.x,en.y+4);}
  return c;
}
var cache={key:'',canvas:null};
function draw(g){
  var m=mapFor(g),cv=document.getElementById('commander-auth-canvas');if(!g||!m||!cv)return;
  var r=cv.getBoundingClientRect();if(!r.width||!r.height)return;var w=Math.floor(r.width),h=Math.floor(r.height),d=Math.min(2,window.devicePixelRatio||1);if(cv.width!==Math.floor(w*d)||cv.height!==Math.floor(h*d)){cv.width=Math.floor(w*d);cv.height=Math.floor(h*d);}
  var ctx=cv.getContext('2d');ctx.setTransform(d,0,0,d,0,0);var key=m.id+'|'+w+'|'+h+'|'+d;if(cache.key!==key)cache={key:key,canvas:terrain(m,w,h,d)};ctx.clearRect(0,0,w,h);ctx.drawImage(cache.canvas,0,0,w,h);
  var now=performance.now();
  if(g.selectedTroop&&g.cursor&&!g.running){try{var lvl=Math.max(1,Number((commanderFinalProfile().levels||{})[g.selectedTroop])||1),st=commanderFinalStats(g.selectedTroop,lvl),rad=Math.min(Number(st.range||120)/850*w,w*.45);ctx.fillStyle=g.cursor.valid?'rgba(49,211,143,.14)':'rgba(234,91,103,.14)';ctx.beginPath();ctx.arc(g.cursor.x*w,g.cursor.y*h,rad,0,Math.PI*2);ctx.fill();ctx.strokeStyle=g.cursor.valid?'#31d38f':'#ea5b67';ctx.lineWidth=3;ctx.stroke();}catch(e){}}
  (g.projectiles||[]).forEach(function(q){try{if(window.projectileDraw)window.projectileDraw(ctx,q,{width:w,height:h},now);}catch(e){};var x=q.x*w,y=q.y*h,px=(q.prevX==null?q.x:q.prevX)*w,py=(q.prevY==null?q.y:q.prevY)*h,type=String(q.type||'basic');ctx.save();ctx.lineCap='round';ctx.lineJoin='round';if(type==='flame'){ctx.strokeStyle=q.blue?'#8eeaff':'#ff8a3d';ctx.lineWidth=8;ctx.globalAlpha=.9;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle='#ffd166';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();}else if(type==='frost'){ctx.fillStyle='#9fe8ff';ctx.strokeStyle='#eafaff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-8);ctx.lineTo(x+8,y);ctx.lineTo(x,y+8);ctx.lineTo(x-8,y);ctx.closePath();ctx.fill();ctx.stroke();}else if(type==='poison'){ctx.fillStyle='#62e66f';ctx.shadowColor='#62e66f';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();}else if(type==='rocket'||type==='cannon'){ctx.fillStyle=type==='rocket'?'#ff765f':'#ffc94d';ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();}else if(type==='sniper'){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.globalAlpha=.85;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();}else if(type==='chain'){ctx.fillStyle='#c08cff';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();}else if(type==='comet'||type==='supernova'){ctx.fillStyle=type==='supernova'?'#ff78c8':'#fff2a8';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=14;ctx.beginPath();ctx.arc(x,y,type==='supernova'?8:6,0,Math.PI*2);ctx.fill();}else{ctx.fillStyle=q.color||'#9fe8ff';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}ctx.restore();});
  (g.enemies||[]).forEach(function(en){var x=en.x*w,y=en.y*h,s=Math.max(12,Number(en.size)||18);try{if(window.commanderDrawEnemyFinal)window.commanderDrawEnemyFinal(ctx,Object.assign({},en,{x:x,y:y}));else{ctx.fillStyle=en.color||'#d85d70';ctx.beginPath();ctx.arc(x,y,s,0,Math.PI*2);ctx.fill();}}catch(e){}ctx.fillStyle='rgba(10,20,28,.75)';ctx.roundRect(x-s,y-s-12,s*2,6,3);ctx.fill();ctx.fillStyle='#55e6a5';ctx.roundRect(x-s,y-s-12,s*2*Math.max(0,Math.min(1,en.hp/en.maxHp)),6,3);ctx.fill();});
  if(g.waveBannerUntil&&g.waveBannerUntil>Date.now()){ctx.save();ctx.globalAlpha=Math.min(.94,(g.waveBannerUntil-Date.now())/220);ctx.fillStyle='rgba(5,16,29,.84)';ctx.roundRect(w*.5-120,18,240,42,14);ctx.fill();ctx.fillStyle='#e9fbff';ctx.font='950 15px Arial';ctx.textAlign='center';ctx.fillText(g.waveBanner||('ROUND '+g.wave),w*.5,45);ctx.restore();}
  updateHud(g);
}
function spawn(g,m){
  var i=Number(g.spawnCount)||0,defs=Array.isArray(COMMANDER_ENEMIES_FINAL)?COMMANDER_ENEMIES_FINAL:[],cycle=['runner','raider','flier','splitter','caster','elite','warden','brute'],kind=cycle[i%cycle.length],d=defs.find(function(x){return x&&x.id===kind;})||defs[0]||{hp:25,speed:.8,size:18,color:'#d85d70',baseDamage:3},p=m.route[0],n=m.route[1]||p,hp=Math.max(10,Math.round((d.hp||25)*(1+(Number(g.wave)||1)*.11)));
  g.enemies.push({id:'v14-'+Date.now()+'-'+i,kind:kind,shape:d.shape||kind,wp:0,x:p[0],y:p[1],hp:hp,maxHp:hp,speed:(d.speed||.8)*m.speed,baseDamage:d.baseDamage||3,size:d.size||18,color:d.color||'#d85d70',rot:Math.atan2(n[1]-p[1],n[0]-p[0]),slow:1,slowUntil:0,hit:0});g.spawnCount=i+1;
}
function fallbackProjectile(g,t,target,stats,now){if(!target)return false;g.projectiles.push({type:'v14-basic',x:t.x,y:t.y,prevX:t.x,prevY:t.y,tx:target.id,speed:.75,damage:Math.max(1,Number(stats.damage)||5),color:stats.shot||'#9fe8ff',life:1200});t.cool=Math.max(350,Number(stats.rate)||900);t.recoil=now+100;return true;}
function updateFallbackProjectile(g,q,dt){if(q.type!=='v14-basic')return false;var e=(g.enemies||[]).find(function(x){return x.id===q.tx&&x.hp>0;});if(!e){q.life=0;return true;}q.prevX=q.x;q.prevY=q.y;var dx=e.x-q.x,dy=e.y-q.y,d=Math.hypot(dx,dy)||1,step=q.speed*dt;if(d<=step){e.hp-=q.damage;e.hit=150;q.life=0;}else{q.x+=dx/d*step;q.y+=dy/d*step;}q.life-=dt*1000;return true;}
function launchWave(e){
  if(e&&e.preventDefault)e.preventDefault();if(e&&e.stopPropagation)e.stopPropagation();if(e&&e.stopImmediatePropagation)e.stopImmediatePropagation();
  var g=game();if(!g||g.active!=='commander'||g.phase!=='battle'||g.questionGateOpen||g.finished)return false;
  if(g.__v14WaveOwner&&g.running)return false;
  var m=mapFor(g);if(!m||!Array.isArray(m.route)||m.route.length<2)return false;
  if(g.frame){try{cancelAnimationFrame(g.frame);}catch(err){}g.frame=null;}
  g.__commanderStandaloneWave=true;g.__v14WaveOwner=true;g.__commanderWaveStartLock=true;
  if(!g.running)g.wave=Math.max(0,Number(g.wave)||0)+1;
  g.running=true;g.spawnCount=0;g.spawnTotal=8+Math.min(20,(Number(g.wave)||1)*2);g.enemies=[];g.projectiles=[];g.effects=[];g.nextSpawnAt=performance.now()+180;g.lastFrame=performance.now();g.waveBanner='ROUND '+g.wave;g.waveBannerUntil=Date.now()+900;
  try{if(window.v6Save)window.v6Save(g);}catch(err){}lock(true);draw(g);
  function step(now){
    if(game()!==g||!g.__v14WaveOwner||!g.running||g.finished||g.questionGateOpen){stop();if(g)g.__v14WaveOwner=false;lock(false);return;}
    try{
      var dt=Math.min(.05,Math.max(0,(now-(g.lastFrame||now))/1000));g.lastFrame=now;var m2=mapFor(g);if(!m2)throw new Error('Map unavailable');
      while(g.spawnCount<g.spawnTotal&&now>=g.nextSpawnAt){spawn(g,m2);g.nextSpawnAt+=Math.max(420,Number(m2.spawn)||900);}
      (g.enemies||[]).forEach(function(en){var tar=m2.route[Math.min(en.wp+1,m2.route.length-1)];if(!tar)return;var speed=Math.max(.25,Number(en.speed)||.8)*(en.slowUntil>Date.now()?(en.slow||.5):1),mv=speed*dt*.18,dx=tar[0]-en.x,dy=tar[1]-en.y,d=Math.hypot(dx,dy)||1;if(d<=mv){en.x=tar[0];en.y=tar[1];en.wp++;if(en.wp>=m2.route.length-1){en.hp=0;g.base=Math.max(0,Number(g.base||0)-(Number(en.baseDamage)||3));}}else{en.x+=dx/d*mv;en.y+=dy/d*mv;}en.hit=Math.max(0,(en.hit||0)-dt*1000);});
      (g.towers||[]).forEach(function(t){try{var stats=window.richStats?window.richStats(t.id,t.level):{range:150,rate:1000,damage:5,shot:'#9fe8ff'};var td=window.tdef?window.tdef(t.id):{};if(!t.attackType)t.attackType=td.attackType||td.ability||'basic';t.cool=Math.max(0,(Number(t.cool)||0)-dt*1000);if(t.cool>0)return;var target=null,best=Infinity,maxR=Math.max(.2,Number(stats.range||150)/700),maxR2=maxR*maxR;(g.enemies||[]).forEach(function(en){if(en.hp<=0)return;var dx=en.x-t.x,dy=en.y-t.y,dd=dx*dx+dy*dy;if(dd<=maxR2&&dd<best){target=en;best=dd;}});if(!target)return;var before=(g.projectiles||[]).length,ok=false;try{if(window.fireV6)ok=window.fireV6(g,t,target,stats,now)===true;}catch(err){}if(!ok&&g.projectiles.length===before)fallbackProjectile(g,t,target,stats,now);}catch(err){console.error('[Commander V14] tower error',err);}});
      (g.projectiles||[]).forEach(function(q){
        var target=null,beforeHp=null;
        try{
          if(q&&q.tx!=null){
            target=(g.enemies||[]).find(function(en){return en.id===q.tx&&en.hp>0;})||null;
            beforeHp=target?Number(target.hp):null;
          }
          if(q.type==='v14-basic')updateFallbackProjectile(g,q,dt);
          else if(window.updateProjectile)window.updateProjectile(g,q,dt);
          else q.life=0;
        }catch(err){q.life=0;}
        /*
         * Last-resort hit confirmation: if the projectile expires without
         * changing its still-living target's HP, register its stored damage.
         * Normal impacts are unaffected and are never double-counted.
         */
        if(q&&Number(q.life)<=0&&target&&target.hp>0&&beforeHp!==null&&
           Number(target.hp)>=beforeHp-0.001&&Number(q.damage)>0){
          target.hp=Math.max(0,Number(target.hp)-Math.max(1,Number(q.damage)||5));
          target.hit=150;
        }
      });
      (g.enemies||[]).forEach(function(en){if(en.burnUntil>Date.now())en.hp-=Number(en.burnDps||0)*dt;if(en.poisonUntil>Date.now())en.hp-=Number(en.poisonDps||0)*dt;});
      g.projectiles=(g.projectiles||[]).filter(function(q){return q.life>0;});g.enemies=(g.enemies||[]).filter(function(en){return en.hp>0;});
      if(g.base<=0){g.base=0;g.running=false;g.finished=true;g.__v14WaveOwner=false;g.__commanderStandaloneWave=false;g.__commanderWaveStartLock=false;stop();lock(false);try{window.v6Save(g);}catch(e){}draw(g);return;}
      if(g.spawnCount>=g.spawnTotal&&g.enemies.length===0){g.running=false;g.__v14WaveOwner=false;g.__commanderStandaloneWave=false;g.__commanderWaveStartLock=false;stop();lock(false);g.questionGateOpen=true;g.waveCoins=0;g.questionFeedback=null;g.questionCorrectCount=0;g.questionAskedCount=0;try{window.v6Save(g);}catch(e){}if(typeof window.commanderAdvanceToNextQuestion==='function')window.commanderAdvanceToNextQuestion(g);else if(typeof renderBattle==='function')renderBattle(g);return;}
      draw(g);if(game()===g&&g.running&&!g.finished&&!g.questionGateOpen){raf=requestAnimationFrame(step);g.frame=raf;}else{g.frame=null;}
    }catch(err){console.error('[Commander V14] loop error',err);g.running=false;g.__v14WaveOwner=false;g.__commanderStandaloneWave=false;g.__commanderWaveStartLock=false;g.frame=null;stop();lock(false);try{window.v6Save(g);}catch(e){}try{if(typeof renderBattle==='function')renderBattle(g);}catch(e){}try{if(typeof showRewardToast==='function')showRewardToast('Wave stopped safely. Please start the wave again.');}catch(e){}}
  }
  raf=requestAnimationFrame(step);g.frame=raf;return false;
}
window.__commanderRuntimeStartWaveV14=launchWave;window.__commanderStartWaveAuthoritative=launchWave;window.__commanderStartWaveFinal=launchWave;window.__commanderStartWaveReliable=launchWave;
document.addEventListener('click',function(e){var el=e.target&&e.target.closest?e.target.closest('#commander-pack-v4-start,#commander-auth-start-wave,[data-commander-start-wave],.commander-auth-start'):null;if(!el)return;var g=game();if(!g||g.active!=='commander'||g.phase!=='battle'||g.questionGateOpen||g.finished)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();if(g.__v14WaveOwner&&g.running)return;launchWave(e);},true);

var style=document.createElement('style');style.id='commander-v14-ui-fix';style.textContent='.commander-auth-question h2,.commander-gate-question-v8 h2{color:#fff!important;text-shadow:0 1px 2px rgba(0,0,0,.45)!important;opacity:1!important;visibility:visible!important;display:block!important}.commander-auth-ai-badge{color:#d7f8ff!important;opacity:1!important}.commander-auth-question{color:#fff!important}.commander-auth-option{color:#fff!important}.commander-auth-active-actions{position:relative!important;z-index:200!important;pointer-events:auto!important}.commander-auth-active-actions button{position:relative!important;z-index:201!important;pointer-events:auto!important;cursor:pointer!important}';document.head.appendChild(style);

window.__commanderUpgradeActiveFinal=function(i,e){if(e){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}var g=game(),t=g&&g.towers&&g.towers[i];if(!g||!t||g.questionGateOpen)return false;var td=window.tdef?window.tdef(t.id):null,cost=Math.round(Math.max(8,Number(td&&td.cost)||8)*(1+Math.max(0,(Number(t.level)||1)-1)*.65));if(Number(g.waveCoins||0)<cost){if(window.showRewardToast)showRewardToast('Need '+cost+' deployment coins to upgrade '+((td&&td.name)||'this Indexling')+'.');return false;}if(Number(t.level)>=10)return false;g.waveCoins-=cost;t.level=Math.min(10,(Number(t.level)||1)+1);t.maxHp=Number(t.maxHp||100)+18;t.hp=t.maxHp;try{var p=window.commanderFinalProfile&&window.commanderFinalProfile();if(p&&p.levels)p.levels[t.id]=Math.max(Number(p.levels[t.id])||1,t.level);}catch(err){}try{window.v6Save&&window.v6Save(g);}catch(err){}if(window.renderBattle)window.renderBattle(g);return false;};
window.__commanderSellFinal=function(i,e){if(e){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}var g=game(),t=g&&g.towers&&g.towers[i];if(!g||!t||g.questionGateOpen)return false;var td=window.tdef?window.tdef(t.id):null,refund=Math.max(3,Math.floor((Number(td&&td.cost)||8)*.6));g.waveCoins=Number(g.waveCoins||0)+refund;g.towers.splice(i,1);g.selectedTowerIndex=-1;try{window.v6Save&&window.v6Save(g);}catch(err){}if(window.renderBattle)window.renderBattle(g);return false;};
window.__commanderHealFinal=function(i,e){if(e){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}var g=game(),t=g&&g.towers&&g.towers[i];if(!g||!t||g.questionGateOpen||Number(g.waveCoins||0)<10)return false;g.waveCoins-=10;t.hp=Math.min(Number(t.maxHp||100),Number(t.hp||0)+Math.max(20,Number(t.maxHp||100)*.35));try{window.v6Save&&window.v6Save(g);}catch(err){}if(window.renderBattle)window.renderBattle(g);return false;};

var oldAnswer=window.__commanderAnswerV6;if(typeof oldAnswer==='function')window.__commanderAnswerV6=function(i,e){var r=oldAnswer.call(this,i,e),g=game();if(g&&g.questionFeedback&&g.questionFeedback.correct)setTimeout(function(){try{if(window.renderBattle&&state.games===g)window.renderBattle(g);}catch(err){}},0);return r;};

window.addEventListener('beforeunload',stop);
setInterval(function(){var g=game();if(g&&g.active==='commander'&&g.phase==='battle'&&!g.questionGateOpen){updateHud(g);if(g.selectedTroop&&g.cursor&&window.syncLayers)try{window.syncLayers();}catch(e){}}},250);
})();