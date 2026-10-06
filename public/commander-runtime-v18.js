(function(){
'use strict';
if(window.__indexCommanderRuntimeV18)return;
window.__indexCommanderRuntimeV18=true;

/* V18 polish/recovery layer.
 * It does not replace the existing Commander/question/economy systems.
 * It only recovers a stale wave engine, restores post-wave placement, and
 * gives each registered attack type a distinct projectile treatment.
 */
function game(){try{return typeof state!=='undefined'&&state&&state.games?state.games:null;}catch(e){return null;}}
function def(id){try{return typeof window.tdef==='function'?(window.tdef(id)||{}):{};}catch(e){return {};}}
function mapFor(g){try{return Array.isArray(COMMANDER_MAPS_FINAL)?COMMANDER_MAPS_FINAL.find(function(m){return m&&m.id===g.mapId;}):null;}catch(e){return null;}}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

/* ----------------------------------------------------------------------
 * Unique projectile art. These are deliberately vector/canvas designs so
 * there is no new dependency, asset pipeline, or external service to break.
 * ---------------------------------------------------------------------- */
var projectileDrawBase=window.projectileDraw;
function drawProjectile(ctx,q,box,now){
  var x=Number(q.x||0)*box.width,y=Number(q.y||0)*box.height;
  var px=Number(q.prevX!=null?q.prevX:q.x||0)*box.width;
  var py=Number(q.prevY!=null?q.prevY:q.y||0)*box.height;
  var type=String(q.attackType||q.type||'basic');
  var color=q.color||'#b9e8ff';
  var ang=Math.atan2(y-py,x-px);
  var pulse=.82+.18*Math.sin((now||performance.now())*.018);
  ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.globalAlpha=clamp(Number(q.opacity==null?1:q.opacity),.2,1);
  ctx.shadowBlur=10;ctx.shadowColor=color;ctx.fillStyle=color;ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=1.5;
  function circle(r){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();}
  function diamond(w,h){ctx.beginPath();ctx.moveTo(w,0);ctx.lineTo(0,h);ctx.lineTo(-w,0);ctx.lineTo(0,-h);ctx.closePath();ctx.fill();ctx.stroke();}
  function star(r){ctx.beginPath();for(var i=0;i<10;i++){var a=-Math.PI/2+i*Math.PI/5,rr=i%2?r:r*.42;var xx=Math.cos(a)*rr,yy=Math.sin(a)*rr;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.closePath();ctx.fill();ctx.stroke();}
  switch(type){
    case 'sugar-stinger': case 'pulse-beam': case 'bubble-shot': case 'pixel-bolt': case 'comet-trail':
      ctx.fillStyle=color;ctx.fillRect(-13,-3,22,6);circle(5*pulse);break;
    case 'gumdrop-bounce': case 'pearl-burst': case 'pixel-burst': case 'star-burst':
      circle(8*pulse);ctx.globalAlpha=.45;circle(13);ctx.globalAlpha=1;break;
    case 'taffy-lash': case 'caramel-arc': case 'kelp-snare': case 'nebula-pulse':
      ctx.beginPath();ctx.moveTo(-15,-5);ctx.quadraticCurveTo(-3,10,15,-4);ctx.stroke();ctx.beginPath();ctx.moveTo(-13,4);ctx.quadraticCurveTo(0,-8,13,3);ctx.stroke();break;
    case 'choco-burst': case 'mecha-rocket': case 'arcade-cannon': case 'eclipse-orb':
      diamond(9,6);ctx.fillStyle='#fff';circle(2.5);break;
    case 'jelly-spray': case 'sprinkle-storm': case 'coral-spear': case 'supernova':
      for(var j=0;j<4;j++){ctx.save();ctx.rotate((j-1.5)*.23);ctx.fillRect(1,-2,15,4);ctx.restore();}circle(4);break;
    case 'shield-boomerang': case 'circuit-arc': case 'trident-bolt': case 'joystick-pulse': case 'moon-ray':
      ctx.beginPath();ctx.arc(0,0,9,-Math.PI*.72,Math.PI*.72);ctx.stroke();ctx.beginPath();ctx.moveTo(-5,-7);ctx.lineTo(9,0);ctx.lineTo(-5,7);ctx.stroke();break;
    case 'bardic-note': case 'royal-sigil': case 'highscore-ray': case 'void-collapse':
      star(10*pulse);break;
    case 'hammer-smash': case 'servo-punch': case 'racer-boost': case 'quasar-beam':
      ctx.fillRect(-5,-10,10,20);ctx.fillRect(-11,-5,22,10);circle(3);break;
    case 'lance-thrust': case 'harpoon': case 'glitch-beam': case 'dragon-flame':
      ctx.beginPath();ctx.moveTo(15,0);ctx.lineTo(-9,-5);ctx.lineTo(-3,0);ctx.lineTo(-9,5);ctx.closePath();ctx.fill();ctx.stroke();break;
    case 'alchemy-flask': case 'kraken-tentacle': case 'arcade-blast': case 'nebula-wave':
      ctx.beginPath();ctx.moveTo(-5,-8);ctx.lineTo(5,-8);ctx.lineTo(7,7);ctx.quadraticCurveTo(0,13,-7,7);ctx.closePath();ctx.fill();ctx.stroke();circle(2);break;
    case 'dragon-flame':
      ctx.beginPath();ctx.moveTo(15,0);ctx.quadraticCurveTo(0,-13,-9,-3);ctx.quadraticCurveTo(-1,0,-9,5);ctx.quadraticCurveTo(1,13,15,0);ctx.fill();break;
    default:
      circle(6*pulse);ctx.globalAlpha=.38;circle(12);ctx.globalAlpha=1;
  }
  ctx.restore();
}
window.projectileDraw=function(ctx,q,box,now){
  try{drawProjectile(ctx,q,box,now);}catch(e){try{if(typeof projectileDrawBase==='function')projectileDrawBase(ctx,q,box,now);}catch(_){}}
};

/* Tag every projectile emitted by the existing combat implementation with
 * the actual Indexling attack type. */
try{
  var fireBase=window.fireV6;
  if(typeof fireBase==='function'&&!fireBase.__v18Tagged){
    var fireTagged=function(g,t,target,stats,now){
      var before=Array.isArray(g&&g.projectiles)?g.projectiles.length:0;
      var result=fireBase.apply(this,arguments);
      try{
        var td=def(t&&t.id),attack=(t&&t.attackType)||(td&&td.attackType)||(td&&td.ability)||'basic';
        if(Array.isArray(g&&g.projectiles)){
          for(var i=before;i<g.projectiles.length;i++){
            if(!g.projectiles[i])continue;
            g.projectiles[i].attackType=attack;
            g.projectiles[i].sourceTroop=t&&t.id;
          }
        }
      }catch(e){}
      return result;
    };
    fireTagged.__v18Tagged=true;window.fireV6=fireTagged;
  }
}catch(e){console.error('[Commander V18] projectile bridge failed',e);}

/* ----------------------------------------------------------------------
 * Stale wave recovery. Normal V14/V15/V16/V17 flow stays authoritative.
 * If a click leaves the game idle and the authoritative engine did not
 * advance the wave, a small compatibility runner starts that one wave.
 * ---------------------------------------------------------------------- */
var fallback={running:false,raf:0,last:0,acc:0,step:1/30};
function stopFallback(){if(fallback.raf)cancelAnimationFrame(fallback.raf);fallback.raf=0;fallback.running=false;}
function spawn(g,m){
  var i=Number(g.spawnCount)||0,defs=Array.isArray(COMMANDER_ENEMIES_FINAL)?COMMANDER_ENEMIES_FINAL:[];
  var ids=['runner','raider','flier','splitter','caster','elite','warden','brute'];
  var kind=ids[i%ids.length],d=defs.find(function(x){return x&&x.id===kind;})||defs[i%Math.max(1,defs.length)]||{hp:25,speed:.8,size:18,color:'#d85d70',baseDamage:3};
  var p=m.route[0]||[0,0],n=m.route[1]||p,scale=1+(Math.max(1,Number(g.wave)||1)-1)*.075,hp=Math.max(10,Math.round((Number(d.hp)||25)*scale));
  g.enemies=g.enemies||[];g.enemies.push({id:'v18-'+Date.now()+'-'+i,kind:kind,shape:d.shape||kind,wp:0,x:p[0],y:p[1],hp:hp,maxHp:hp,speed:(Number(d.speed)||.8)*m.speed,baseDamage:Number(d.baseDamage)||3,size:Number(d.size)||18,color:d.color||'#d85d70',rot:Math.atan2(n[1]-p[1],n[0]-p[0]),slow:1,slowUntil:0});
  g.spawnCount=i+1;
}
function drawWorld(){try{if(typeof window.renderBattle==='function'){var g=game();window.renderBattle(g);} }catch(e){}}
function fallbackStart(g){
  if(fallback.running||!g||g.running||g.finished||g.questionGateOpen)return false;
  var m=mapFor(g);if(!m||!Array.isArray(m.route)||m.route.length<2)return false;
  fallback.running=true;fallback.last=performance.now();fallback.acc=0;
  g.running=true;g.__commanderRuntimeWave=true;g.__commanderWaveStartLock=true;
  g.wave=Math.max(0,Number(g.wave)||0)+1;g.spawnCount=0;g.spawnTotal=8+Math.min(14,g.wave*2);g.enemies=[];g.projectiles=[];g.effects=[];g.nextSpawnAt=performance.now()+250;
  function frame(now){
    if(!fallback.running||game()!==g||!g.running||g.finished||g.questionGateOpen){stopFallback();return;}
    try{
      var dt=Math.min(.1,Math.max(0,(now-fallback.last)/1000));fallback.last=now;fallback.acc=Math.min(.2,fallback.acc+dt);
      var loops=0;
      while(fallback.acc>=fallback.step&&loops<4){
        var tnow=performance.now();
        while(g.spawnCount<g.spawnTotal&&tnow>=g.nextSpawnAt){try{if(typeof window.spawnV6==='function')window.spawnV6(g);else spawn(g,m);}catch(e){spawn(g,m);}g.nextSpawnAt+=Math.max(520,Number(m.spawn)||900);}
        (g.enemies||[]).forEach(function(en){
          var tar=m.route[Math.min(Number(en.wp)||0+1,m.route.length-1)]||m.route[m.route.length-1];
          var speed=Math.max(.25,Number(en.speed)||.8)*(en.slowUntil>tnow?(en.slow||.5):1),move=speed*fallback.step*.18,dx=tar[0]-en.x,dy=tar[1]-en.y,dist=Math.hypot(dx,dy)||1;
          if(dist<=move){en.x=tar[0];en.y=tar[1];en.wp=(Number(en.wp)||0)+1;if(en.wp>=m.route.length-1){en.hp=0;g.base=Math.max(0,g.base-(Number(en.baseDamage)||3));}}
          else{en.x+=dx/dist*move;en.y+=dy/dist*move;}
        });
        (g.towers||[]).forEach(function(t){
          try{
            var stats=window.richStats?window.richStats(t.id,t.level):{range:150,rate:1000,damage:5,shot:'#9fe8ff'};
            t.cool=Math.max(0,(Number(t.cool)||0)-fallback.step*1000);if(t.cool>0)return;
            var td=def(t.id);if(!t.attackType)t.attackType=td.attackType||td.ability||'basic';
            var maxR=Math.max(.08,(Number(stats.range)||150)/850),target=null,best=Infinity;
            (g.enemies||[]).forEach(function(en){if(en.hp<=0)return;var dx=en.x-t.x,dy=en.y-t.y,dd=dx*dx+dy*dy;if(dd<=maxR*maxR&&dd<best){best=dd;target=en;}});
            if(target&&typeof window.fireV6==='function')window.fireV6(g,t,target,stats,tnow);
            else if(target){target.hp-=Math.max(1,Number(stats.damage)||5);t.cool=Math.max(450,Number(stats.rate)||1000);}
          }catch(e){}
        });
        if(typeof window.updateProjectile==='function')(g.projectiles||[]).forEach(function(q){try{window.updateProjectile(g,q,fallback.step);}catch(e){q.life=0;}});
        (g.effects||[]).forEach(function(z){z.life-=fallback.step*1000;});
        g.effects=(g.effects||[]).filter(function(z){return z.life>0;});g.projectiles=(g.projectiles||[]).filter(function(z){return z.life>0;});g.enemies=(g.enemies||[]).filter(function(z){return z.hp>0;});
        if(g.base<=0){g.running=false;g.finished=true;g.__commanderRuntimeWave=false;g.__commanderWaveStartLock=false;stopFallback();try{window.v6Save&&window.v6Save(g);}catch(e){};drawWorld();return;}
        if(g.spawnCount>=g.spawnTotal&&g.enemies.length===0){
          g.running=false;g.__commanderRuntimeWave=false;g.__commanderWaveStartLock=false;g.questionGateOpen=true;stopFallback();
          try{window.v6Save&&window.v6Save(g);}catch(e){}
          try{if(typeof window.commanderAdvanceToNextQuestion==='function')window.commanderAdvanceToNextQuestion(g);}catch(e){}
          drawWorld();return;
        }
        fallback.acc-=fallback.step;loops++;
      }
      drawWorld();fallback.raf=requestAnimationFrame(frame);
    }catch(err){console.error('[Commander V18] fallback frame failed',err);stopFallback();g.running=false;g.__commanderRuntimeWave=false;g.__commanderWaveStartLock=false;drawWorld();}
  }
  fallback.raf=requestAnimationFrame(frame);return true;
}

/* Wrap the reliable launcher used by the existing hotfix. */
try{
  var reliable=window.__commanderStartWaveReliable;
  if(typeof reliable==='function'&&!reliable.__v18Recovery){
    var wrapped=function(ev){
      var g=game();if(!g)return false;
      var before=Number(g.wave)||0;
      var wasRunning=!!g.running;
      var result=reliable.apply(this,arguments);
      setTimeout(function(){
        var cur=game();if(!cur||cur!==g||cur.finished||cur.running||cur.questionGateOpen)return;
        if((Number(cur.wave)||0)===before&&!wasRunning&&!fallback.running){
          console.warn('[Commander V18] authoritative wave did not launch; using compatibility recovery.');
          fallbackStart(cur);
        }
      },350);
      return result;
    };
    wrapped.__v18Recovery=true;window.__commanderStartWaveReliable=wrapped;window.__commanderStartWaveFinal=wrapped;
  }
}catch(e){console.error('[Commander V18] launcher recovery failed',e);}

/* Post-wave placement polish: keep the real bridge/canvas interactive without
 * changing its geometry or economy checks. */
function hardenPlacement(){
  try{
    var g=game(),cv=document.getElementById('commander-auth-canvas');
    if(!g||!cv)return;
    cv.style.pointerEvents='auto';cv.style.touchAction='none';
    cv.style.cursor=g.selectedTroop&&!g.running&&!g.finished&&!g.questionGateOpen?'crosshair':'default';
  }catch(e){}
}
setInterval(hardenPlacement,250);hardenPlacement();

/* Final UI polish: subtle depth, clearer hierarchy, no layout/system rewrites. */
try{
  if(!document.getElementById('commander-v18-polish')){
    var s=document.createElement('style');s.id='commander-v18-polish';
    s.textContent=[
      '.commander-auth-battle{backdrop-filter:blur(10px)!important;} ',
      '.commander-auth-side-left,.commander-auth-side-right{filter:drop-shadow(0 12px 26px rgba(0,0,0,.18));}',
      '.commander-auth-active-card,.commander-pack-v4-card{box-shadow:0 8px 24px rgba(0,0,0,.16);}',
      '.commander-pack-v4-card{transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease!important;}',
      '.commander-pack-v4-card:hover{transform:translateY(-3px)!important;}',
      '.commander-auth-start,#commander-auth-start-wave,#commander-pack-v4-start{transition:transform .12s ease,filter .12s ease!important;}',
      '.commander-auth-start:hover,#commander-auth-start-wave:hover,#commander-pack-v4-start:hover{transform:translateY(-1px);filter:brightness(1.06);}',
      '.commander-auth-start:active,#commander-auth-start-wave:active,#commander-pack-v4-start:active{transform:translateY(1px);}',
      '#commander-live-hud{letter-spacing:.03em!important;text-shadow:0 2px 5px rgba(0,0,0,.35)!important;}'
    ].join('');document.head.appendChild(s);
  }
}catch(e){}
})();
