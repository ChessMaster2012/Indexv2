(function(){
'use strict';
if(window.__indexCommanderRuntimeV13)return;
window.__indexCommanderRuntimeV13=true;

var engine={
  active:false,
  raf:null,
  last:0,
  acc:0,
  step:1/30,
  cache:{key:'',canvas:null,w:0,h:0,dpr:1}
};

function game(){try{return typeof state!=='undefined'&&state&&state.games?state.games:null;}catch(e){return null;}}
function mapFor(g){try{return Array.isArray(COMMANDER_MAPS_FINAL)?COMMANDER_MAPS_FINAL.find(function(m){return m&&m.id===g.mapId;}):null;}catch(e){return null;}}
function stopRaf(){if(engine.raf!=null){cancelAnimationFrame(engine.raf);engine.raf=null;}}
function lockButtons(locked){
  document.querySelectorAll('#commander-pack-v4-start,#commander-auth-start-wave,.commander-auth-start,[data-commander-start-wave]').forEach(function(btn){
    if(!btn)return;
    btn.disabled=!!locked;
    btn.style.pointerEvents=locked?'none':'auto';
    btn.textContent=locked?'▣ Wave In Progress':'▶ Start Wave';
  });
}
function terrain(m,w,h,dpr){
  var c=document.createElement('canvas');c.width=Math.max(1,Math.floor(w*dpr));c.height=Math.max(1,Math.floor(h*dpr));
  var x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);
  x.fillStyle=m.land||'#68a463';x.fillRect(0,0,w,h);
  var grd=x.createRadialGradient(w*.48,h*.42,30,w*.48,h*.42,Math.max(w,h)*.9);
  grd.addColorStop(0,'rgba(255,255,255,.09)');grd.addColorStop(1,'rgba(15,42,29,.16)');
  x.fillStyle=grd;x.fillRect(0,0,w,h);
  (Array.isArray(m.detail)?m.detail:[]).forEach(function(line){
    if(!Array.isArray(line)||line.length<2)return;
    x.save();x.strokeStyle='rgba(39,87,55,.4)';x.lineWidth=8;x.lineCap='round';x.lineJoin='round';x.beginPath();
    line.forEach(function(p,i){var a=p[0]*w,b=p[1]*h;i?x.lineTo(a,b):x.moveTo(a,b);});x.stroke();
    x.strokeStyle='rgba(187,220,160,.13)';x.lineWidth=2;x.stroke();x.restore();
  });
  (Array.isArray(m.rocks)?m.rocks:[]).forEach(function(o){
    if(!o||o.length<3)return;var a=o[0]*w,b=o[1]*h,r=Math.max(8,o[2]*w);
    x.fillStyle='rgba(13,27,21,.2)';x.beginPath();x.ellipse(a+3,b+5,r,r*.88,0,0,Math.PI*2);x.fill();
    x.fillStyle='#65745f';x.strokeStyle='rgba(25,48,39,.55)';x.lineWidth=2;x.beginPath();x.arc(a,b,r,0,Math.PI*2);x.fill();x.stroke();
    x.fillStyle='rgba(255,255,255,.09)';x.beginPath();x.arc(a-r*.28,b-r*.28,r*.4,0,Math.PI*2);x.fill();
  });
  (Array.isArray(m.water)?m.water:[]).forEach(function(o){
    if(!o||o.length<3)return;var a=o[0]*w,b=o[1]*h,rx=o[2]*w,ry=(o[3]||o[2]*.62)*h;
    x.fillStyle='#4bb0cf';x.beginPath();x.ellipse(a,b,rx,ry,0,0,Math.PI*2);x.fill();
    x.strokeStyle='rgba(225,250,255,.32)';x.lineWidth=2;x.beginPath();x.moveTo(a-rx*.5,b);x.quadraticCurveTo(a,b-ry*.3,a+rx*.5,b);x.stroke();
  });
  var pts=(m.route||[]).map(function(p){return{x:Number(p[0])*w,y:Number(p[1])*h};});
  if(pts.length>=2){
    x.save();x.lineCap='round';x.lineJoin='round';
    x.strokeStyle='rgba(255,255,255,.28)';x.lineWidth=72;x.beginPath();pts.forEach(function(p,i){i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});x.stroke();
    x.strokeStyle='rgba(200,163,120,.44)';x.lineWidth=54;x.beginPath();pts.forEach(function(p,i){i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});x.stroke();
    x.strokeStyle=m.path||'#a88a61';x.lineWidth=44;x.beginPath();pts.forEach(function(p,i){i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});x.stroke();
    x.strokeStyle='rgba(255,241,204,.5)';x.lineWidth=3;x.setLineDash([18,14]);x.beginPath();pts.forEach(function(p,i){i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});x.stroke();x.setLineDash([]);
    x.restore();
    var st=pts[0],en=pts[pts.length-1];
    x.fillStyle='rgba(8,27,27,.24)';x.beginPath();x.arc(st.x+3,st.y+5,35,0,Math.PI*2);x.fill();
    x.fillStyle='#35d59c';x.beginPath();x.arc(st.x,st.y,28,0,Math.PI*2);x.fill();x.strokeStyle='#effff9';x.lineWidth=4;x.stroke();
    x.fillStyle='#ef6473';x.beginPath();x.roundRect(en.x-30,en.y-30,60,60,10);x.fill();x.fillStyle='#fff';x.font='950 10px Arial';x.textAlign='center';x.fillText('BASE',en.x,en.y+4);
  }
  return c;
}
function draw(){
  var g=game(),m=g&&mapFor(g),cv=document.getElementById('commander-auth-canvas');
  if(!g||!m||!cv)return;
  var r=cv.getBoundingClientRect();if(!r.width||!r.height)return;
  var w=Math.floor(r.width),h=Math.floor(r.height),d=Math.min(2,window.devicePixelRatio||1),pw=Math.floor(w*d),ph=Math.floor(h*d);
  if(cv.width!==pw||cv.height!==ph){cv.width=pw;cv.height=ph;}
  var ctx=cv.getContext('2d');ctx.setTransform(d,0,0,d,0,0);
  var key=m.id+'|'+w+'|'+h+'|'+d;
  if(engine.cache.key!==key)engine.cache={key:key,canvas:terrain(m,w,h,d),w:w,h:h,dpr:d};
  ctx.clearRect(0,0,w,h);ctx.drawImage(engine.cache.canvas,0,0,w,h);
  var now=performance.now();
  (g.towers||[]).forEach(function(t){
    try{
      var x=t.x*w,y=t.y*h;
      if(typeof commanderDrawTowerFinal==='function')commanderDrawTowerFinal(ctx,t,x,y);
      else{
        var sz=24;ctx.save();ctx.fillStyle='#d9f3ff';ctx.strokeStyle='#173249';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,sz,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle='#173249';ctx.beginPath();ctx.arc(x,y-3,7,0,Math.PI*2);ctx.fill();ctx.restore();
      }
    }catch(e){}
  });
  (g.projectiles||[]).forEach(function(q){try{window.projectileDraw&&window.projectileDraw(ctx,q,{width:w,height:h},now);}catch(e){}});
  (g.effects||[]).forEach(function(z){var life=Math.max(0,Number(z.life)||0),max=Math.max(1,Number(z.maxLife)||1);ctx.globalAlpha=Math.max(.05,life/max);ctx.fillStyle=z.color||'#fff';ctx.beginPath();ctx.arc(z.x*w,z.y*h,(z.radius||.04)*w,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});
  (g.enemies||[]).forEach(function(en){
    var x=en.x*w,y=en.y*h,s=Math.max(12,Number(en.size)||18);
    try{if(window.commanderDrawEnemyFinal)window.commanderDrawEnemyFinal(ctx,Object.assign({},en,{x:x,y:y}));else{ctx.fillStyle=en.color||'#d85d70';ctx.beginPath();ctx.arc(x,y,s,0,Math.PI*2);ctx.fill();}}
    catch(e){ctx.fillStyle=en.color||'#d85d70';ctx.beginPath();ctx.arc(x,y,s,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='rgba(10,20,28,.75)';ctx.roundRect(x-s,y-s-12,s*2,6,3);ctx.fill();
    ctx.fillStyle='#55e6a5';ctx.roundRect(x-s,y-s-12,s*2*Math.max(0,Math.min(1,en.hp/en.maxHp)),6,3);ctx.fill();
  });
  var hud=document.getElementById('commander-live-hud');
  if(hud)hud.textContent='ROUND '+Math.max(1,g.wave)+'  •  ENEMIES '+(g.enemies||[]).length+'  •  SPAWNED '+(g.spawnCount||0)+' / '+(g.spawnTotal||0)+'  •  BASE '+Math.max(0,Math.floor(g.base));
}
function spawnFallback(g,m){
  var i=Number(g.spawnCount)||0,defs=Array.isArray(COMMANDER_ENEMIES_FINAL)?COMMANDER_ENEMIES_FINAL:[],kinds=['runner','raider','flier','splitter','caster','elite','warden','brute'];
  var kind=kinds[i%kinds.length],d=defs.find(function(x){return x&&x.id===kind;})||defs[0]||{hp:25,speed:.8,size:18,color:'#d85d70',baseDamage:3};
  var p=m.route[0],n=m.route[1]||p,hp=Math.max(10,Math.round((d.hp||25)*(1+(Number(g.wave)||1)*.075)));
  g.enemies.push({id:'runtime-'+Date.now()+'-'+i,kind:kind,shape:d.shape||kind,wp:0,x:p[0],y:p[1],hp:hp,maxHp:hp,speed:(d.speed||.8)*m.speed,baseDamage:d.baseDamage||3,size:d.size||18,color:d.color||'#d85d70',rot:Math.atan2(n[1]-p[1],n[0]-p[0]),slow:1,slowUntil:0});
  g.spawnCount=i+1;
}
function startWave(ev){
  if(ev&&ev.preventDefault)ev.preventDefault();
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  if(ev&&ev.stopImmediatePropagation)ev.stopImmediatePropagation();
  var g=game();if(!g||g.active!=='commander'||g.phase!=='battle'||g.questionGateOpen||g.finished||g.running||engine.active)return false;
  var m=mapFor(g);if(!m||!Array.isArray(m.route)||m.route.length<2)return false;

  engine.active=true;engine.last=performance.now();engine.acc=0;
  g.running=true;g.__commanderRuntimeWave=true;g.__commanderRuntimeWaveId=(g.__commanderRuntimeWaveId||0)+1;
  g.wave=Math.max(0,Number(g.wave)||0)+1;
  g.spawnCount=0;g.spawnTotal=8+Math.min(14,g.wave*2);
  g.enemies=[];g.projectiles=[];g.effects=[];g.nextSpawnAt=performance.now()+250;g.waveBanner='ROUND '+g.wave;g.waveBannerUntil=Date.now()+1000;
  g.__commanderWaveStartLock=true;lockButtons(true);draw();

  function step(now){
    if(game()!==g||!g.__commanderRuntimeWave||!g.running||g.finished||g.questionGateOpen){engine.active=false;stopRaf();lockButtons(false);if(g)g.__commanderRuntimeWave=false;return;}
    try{
      var elapsed=Math.min(.1,Math.max(0,(now-engine.last)/1000));engine.last=now;engine.acc=Math.min(.2,engine.acc+elapsed);
      var loops=0;
      while(engine.acc>=engine.step&&loops<4){
        var tnow=performance.now();
        while(g.spawnCount<g.spawnTotal&&tnow>=g.nextSpawnAt){
          try{
            if(typeof window.spawnV6==='function')window.spawnV6(g);
            else spawnFallback(g,m);
          }catch(e2){spawnFallback(g,m);}
          g.nextSpawnAt+=Math.max(520,Number(m.spawn)||900);
        }

        (g.enemies||[]).forEach(function(en){
          var tar=m.route[Math.min(en.wp+1,m.route.length-1)];if(!tar)return;
          var speed=Math.max(.25,Number(en.speed)||.8)*(en.slowUntil>tnow?(en.slow||.5):1);
          var move=speed*engine.step*.18,dx=tar[0]-en.x,dy=tar[1]-en.y,dist=Math.hypot(dx,dy)||1;
          if(dist<=move){en.x=tar[0];en.y=tar[1];en.wp++;if(en.wp>=m.route.length-1){en.hp=0;g.base=Math.max(0,g.base-(Number(en.baseDamage)||3));}}
          else{en.x+=dx/dist*move;en.y+=dy/dist*move;}
          en.hit=Math.max(0,(en.hit||0)-engine.step*1000);
        });

        var towers=g.towers||[];
        towers.forEach(function(t){
          try{
            var stats=window.richStats?window.richStats(t.id,t.level):{range:150,rate:1000,damage:5,shot:'#9fe8ff'};
            var td=window.tdef?window.tdef(t.id):{};
            t.cool=Math.max(0,(Number(t.cool)||0)-engine.step*1000);
            if(t.cool>0)return;
            var target=null,best=Infinity,maxR=Math.max(.08,(Number(stats.range)||150)/850),maxR2=maxR*maxR;
            (g.enemies||[]).forEach(function(en){if(en.hp<=0)return;var dx=en.x-t.x,dy=en.y-t.y,dd=dx*dx+dy*dy;if(dd<=maxR2&&dd<best){target=en;best=dd;}});
            if(target&&window.fireV6){window.fireV6(g,t,target,stats,tnow);}
            else if(target){
              target.hp-=Math.max(1,Number(stats.damage)||5);target.hit=160;
              t.cool=Math.max(450,Number(stats.rate)||1000);
            }
          }catch(e3){}
        });

        if(window.updateProjectile){
          (g.projectiles||[]).forEach(function(q){try{window.updateProjectile(g,q,engine.step);}catch(e4){q.life=0;}});
        }else{
          (g.projectiles||[]).forEach(function(q){q.life=0;});
        }
        (g.effects||[]).forEach(function(z){z.life-=engine.step*1000;});
        g.effects=(g.effects||[]).filter(function(z){return z.life>0;});
        g.projectiles=(g.projectiles||[]).filter(function(z){return z.life>0;});
        g.enemies=(g.enemies||[]).filter(function(z){return z.hp>0;});

        if(g.base<=0){
          g.running=false;g.finished=true;g.__commanderRuntimeWave=false;g.__commanderWaveStartLock=false;engine.active=false;stopRaf();lockButtons(false);if(window.v6Save)try{window.v6Save(g);}catch(e){};draw();return;
        }
        if(g.spawnCount>=g.spawnTotal&&g.enemies.length===0){
          g.running=false;g.questionGateOpen=true;g.__commanderRuntimeWave=false;g.__commanderWaveStartLock=false;engine.active=false;stopRaf();lockButtons(false);
          if(window.v6Save)try{window.v6Save(g);}catch(e){}
          if(typeof window.commanderAdvanceToNextQuestion==='function')window.commanderAdvanceToNextQuestion(g);else{g.questionGateOpen=true;draw();}
          return;
        }
        engine.acc-=engine.step;loops++;
      }
      draw();
      lockButtons(true);
      engine.raf=requestAnimationFrame(step);
    }catch(err){
      console.error('[Commander Runtime V13] frame error',err);
      /* Do not increment another wave or clear the running state because of a
         drawing/combat-side exception. The engine remains owned by this wave. */
      draw();
      engine.raf=requestAnimationFrame(step);
    }
  }
  engine.raf=requestAnimationFrame(step);
  return false;
}
window.__commanderRuntimeStartWave=startWave;
window.__commanderStartWaveAuthoritative=startWave;
window.__commanderStartWaveFinal=startWave;
window.__commanderStartWaveReliable=startWave;

/* This is deliberately a capture listener registered after the original
   Commander scripts. The final inline listener now delegates to
   window.__commanderStartWaveAuthoritative, so this function is the sole
   owner of the wave start. */
document.addEventListener('click',function(e){
  var el=e.target&&e.target.closest?e.target.closest('#commander-pack-v4-start,#commander-auth-start-wave,[data-commander-start-wave],.commander-auth-start'):null;
  if(!el)return;
  var g=game();
  if(!g||g.active!=='commander'||g.phase!=='battle'||g.questionGateOpen||g.finished)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  startWave(e);
},true);

window.addEventListener('beforeunload',function(){stopRaf();});
})();