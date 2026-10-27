/* Rogue's Sanctuary v2 — a roguelike deckbuilder.
   Equipped Indexling fights with a skill deck: 3 energy, 5-card hands, enemy intents shown a turn ahead, block / strength /
   weak / vulnerable / poison / thorns, 18 cards (all upgradable), 8 relics, branching floor map (fights, elites, rests, shops,
   events, a boss every 5th floor), floating damage numbers, fullscreen on the persistent games stage.
   Overrides the arcade Rogue hooks. Progress lives in gameProgress.rogue = {floor,wins,deck,hp,run,best,...} (old saves still load).
   Coins: +20 per boss, and on a run ending, 2 per floor cleared beyond the first (max 40). Run state is saved at the start of
   every player turn and at every screen change. */
(function(){
'use strict';
var $=function(id){ return document.getElementById(id); };
function E(s){ return (typeof esc==='function')?esc(String(s==null?'':s)):String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function rnd(n){ return (Math.random()*n)|0; }
function shuf(a){ a=a.slice(); for(var i=a.length-1;i>0;i--){ var j=rnd(i+1),t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function pick(a){ return a[rnd(a.length)]; }
var AC=null;
function muted(){ try{ return localStorage.getItem('gx-mute')==='1'; }catch(e){ return false; } }
function sfx(k){ if(muted()) return; try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume();
  var P={hit:[300,90,.14,'sawtooth',.09],block:[500,700,.1,'square',.05],heal:[500,900,.25,'sine',.09],hurt:[200,70,.22,'sawtooth',.1],card:[600,820,.07,'triangle',.06],buff:[400,1000,.25,'triangle',.08],win:[440,1180,.5,'triangle',.12],lose:[330,70,.7,'sawtooth',.11],gold:[900,1400,.12,'square',.05],end:[330,260,.1,'triangle',.05]}[k]; if(!P) return;
  var o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime; o.type=P[3]; o.frequency.setValueAtTime(P[0],t); o.frequency.exponentialRampToValueAtTime(P[1],t+P[2]); g.gain.setValueAtTime(P[4],t); g.gain.exponentialRampToValueAtTime(.0001,t+P[2]); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+P[2]+.02); }catch(e){} }

function ling(){ try{ var id=(state.progress.equipped&&state.progress.equipped.indexling)||'ling-sugarbug', sid=(typeof getEquippedSkinId==='function'&&getEquippedSkinId(id))||'', l=cosmeticById(id)||cosmeticById('ling-sugarbug'), sk=sid&&typeof skinById==='function'?skinById(sid):null; if(typeof indexlingArtHtml==='function') return indexlingArtHtml(l,true,sk||{}); }catch(e){} return arcadeCharacterHtml(); }
/* ------------------------------- data ------------------------------- */
// t: a=attack s=skill p=power · c=cost · d=damage hits=n b=block h=heal draw en=energy vuln weak psn str thorns · ex=exhaust · r=rarity weight
var C={
  strike:{n:'Strike',i:'⚔️',t:'a',c:1,d:6,r:0,up:{d:9}},
  guard:{n:'Guard',i:'🛡️',t:'s',c:1,b:6,r:0,up:{b:9}},
  spark:{n:'Spark',i:'⚡',t:'a',c:1,d:4,draw:1,r:6,up:{d:6}},
  heal:{n:'Mend',i:'💚',t:'s',c:1,h:5,ex:1,r:5,up:{h:8}},
  focus:{n:'Focus',i:'✨',t:'a',c:1,d:8,r:6,up:{d:11}},
  cleave:{n:'Cleave',i:'🪓',t:'a',c:1,d:5,vuln:1,r:6,up:{d:7,vuln:2}},
  flurry:{n:'Flurry',i:'🌪️',t:'a',c:1,d:3,hits:3,r:5,up:{hits:4}},
  bash:{n:'Bash',i:'🔨',t:'a',c:2,d:10,vuln:2,r:5,up:{d:14}},
  venom:{n:'Venom Dart',i:'🧪',t:'a',c:1,d:2,psn:4,r:5,up:{psn:7}},
  execute:{n:'Execute',i:'🗡️',t:'a',c:2,d:12,x2:1,r:2,up:{d:16}},
  drain:{n:'Siphon',i:'🩸',t:'a',c:2,d:7,leech:1,r:3,up:{d:10}},
  meteor:{n:'Meteor',i:'☄️',t:'a',c:3,d:24,r:1,up:{d:32}},
  brace:{n:'Brace',i:'🧱',t:'s',c:1,b:5,draw:1,r:6,up:{b:8}},
  surge:{n:'Surge',i:'🔋',t:'s',c:0,en:2,ex:1,r:3,up:{en:3}},
  fortify:{n:'Fortify',i:'🏰',t:'s',c:2,dbl:1,r:2,up:{c:1}},
  daze:{n:'Daze',i:'💫',t:'s',c:0,weak:2,ex:1,r:4,up:{weak:3}},
  rage:{n:'Battle Rage',i:'🔥',t:'p',c:1,str:2,ex:1,r:2,up:{str:3}},
  thornb:{n:'Thorn Aura',i:'🌵',t:'p',c:1,thorns:3,ex:1,r:3,up:{thorns:5}}
};
var STARTER=['strike','strike','strike','guard','guard','spark','heal','strike'];
function cd(id){ var up=/\+$/.test(id), b=C[id.replace(/\+$/,'')]||C.strike, o={}, k; for(k in b) o[k]=b[k]; if(up){ for(k in b.up) o[k]=b.up[k]; o.n=b.n+'+'; } o.id=id; o.up2=up; return o; }
function ctext(c){ var p=[]; if(c.d!=null){ p.push('Deal '+c.d+' damage'+(c.hits?' ×'+c.hits:'')+(c.x2?' (double if enemy ≤50% HP)':'')+'.'); } if(c.b) p.push('Gain '+c.b+' block.'); if(c.dbl) p.push('Double your block.'); if(c.h) p.push('Heal '+c.h+' HP.'); if(c.vuln) p.push('Apply '+c.vuln+' Vulnerable.'); if(c.weak) p.push('Apply '+c.weak+' Weak.'); if(c.psn) p.push('Apply '+c.psn+' Poison.'); if(c.leech) p.push('Heal for damage dealt.'); if(c.draw) p.push('Draw '+c.draw+'.'); if(c.en) p.push('Gain '+c.en+' energy.'); if(c.str) p.push('Gain '+c.str+' Strength.'); if(c.thorns) p.push('Gain '+c.thorns+' Thorns.'); if(c.ex) p.push('Exhaust.'); return p.join(' '); }
var RELICS={
  ring:{n:'Iron Ring',i:'💍',d:'Start each battle with 6 block.'},
  crystal:{n:'Energy Crystal',i:'💎',d:'+1 energy on the first turn.'},
  vial:{n:'Healing Vial',i:'🧴',d:'Heal 4 HP after each fight.'},
  whet:{n:'Whetstone',i:'🔪',d:'Start each battle with +1 Strength.'},
  mail:{n:'Thorn Mail',i:'🧥',d:'Start each battle with 2 Thorns.'},
  lantern:{n:'Lantern',i:'🏮',d:'Draw 1 extra card each turn.'},
  idol:{n:'Golden Idol',i:'🗿',d:'+10 gold after each fight.'},
  feather:{n:'Phoenix Feather',i:'🪶',d:'Revive once per run at half HP.'}
};
var FOES={
  slime:{n:'Gel Slime',i:'🟢',hp:22,m:[['atk',6],['def',6],['atk',8]]},
  bat:{n:'Cave Bat',i:'🦇',hp:18,m:[['multi',3,2],['atk',5],['multi',3,3]]},
  skel:{n:'Bone Guard',i:'💀',hp:26,m:[['atk',7],['buff',1],['atk',9]]},
  spider:{n:'Web Spider',i:'🕷️',hp:24,m:[['dbf',4,2,0],['atk',8],['multi',2,4]]},
  golem:{n:'Stone Golem',i:'🗿',hp:34,m:[['def',10],['atk',11],['atk',6]]},
  wraith:{n:'Wraith',i:'👻',hp:20,m:[['dbf',5,0,2],['atk',9],['heal',6]]},
  cultist:{n:'Cultist',i:'🧙',hp:24,m:[['buff',2],['atk',6],['atk',6]]},
  knight:{n:'Hollow Knight',i:'🤺',hp:60,elite:1,m:[['def',12],['atk',14],['multi',5,3],['buff',2]]},
  warlock:{n:'Ember Warlock',i:'🔮',hp:52,elite:1,m:[['dbf',8,0,1],['atk',16],['multi',4,4],['def',10]]},
  boss1:{n:'Shadow Boss',i:'👤',hp:90,boss:1,m:[['atk',10],['def',12],['multi',5,3],['buff',2],['atk',18]]},
  boss2:{n:'Hex Dragon',i:'🐲',hp:130,boss:1,m:[['dbf',8,2,1],['multi',6,3],['def',16],['buff',3],['atk',26]]},
  boss3:{n:'Void Sovereign',i:'👑',hp:170,boss:1,m:[['atk',14],['multi',6,4],['buff',3],['def',18],['dbf',12,2,2],['atk',30]]}
};
var NORMAL=['slime','bat','skel','spider','golem','wraith','cultist'];
var EVENTS={
  altar:{i:'🗿',n:'Whispering Altar',t:'A stone altar hums. A relic rests in its palm, and the stone feels hungry.',o:[['Pray (lose 7 HP, gain a relic)','altar1'],['Leave','leave']]},
  fountain:{i:'⛲',n:'Glowing Fountain',t:'Warm light rises from the water.',o:[['Drink (heal 18 HP)','fount1'],['Bathe (+5 max HP)','fount2']]},
  gambler:{i:'🎲',n:'Dice Gambler',t:'"Double or nothing, friend. 25 gold a roll."',o:[['Bet 25 gold (50%: win 70)','bet'],['Walk away','leave']]},
  scribe:{i:'📜',n:'Lost Scribe',t:'A scribe offers to teach you, if you have the patience.',o:[['Study (upgrade a random card)','scr1'],['Take his purse (+30 gold)','scr2']]}
};

/* ------------------------------- state ------------------------------- */
var G=function(){ return state.games&&state.games.rg?state.games:null; };
function stats(){ try{ return arcadeCharacterStats()||{}; }catch(e){ return {}; } }
function maxHpBase(){ return 30+Math.round((stats().vitality||3)*2); }
function relic(g,id){ return g.relics.indexOf(id)>=0; }
function deckAll(g){ return g.deck.slice(); }
function floorTier(f){ return Math.floor((f-1)/5); }
function scaleHp(hp,f){ return Math.round(hp*(1+(f-1)*.12)); }
function scaleV(v,f){ return Math.max(1,Math.round(v*(1+(f-1)*.09))); }

function snapshot(g){
  var b=g.b, run={v:2,ph:g.ph,floor:g.floor,hp:g.hp,maxHp:g.maxHp,gold:g.gold,deck:g.deck.slice(),relics:g.relics.slice(),phx:g.phx?1:0,nodes:g.nodes||[],rewards:g.rewards||[],shop:g.shop||null,ev:g.ev||null,evText:g.evText||'',goldGain:g.goldGain||0,relicGain:g.relicGain||'',kind:g.kind||'',up:g.upMode||''};
  if(b&&g.ph==='battle'){ run.b={e:{id:b.e.id,hp:b.e.hp,max:b.e.max,block:b.e.block,str:b.e.str,weak:b.e.weak,vuln:b.e.vuln,psn:b.e.psn,mi:b.e.mi},p:{block:b.p.block,str:b.p.str,weak:b.p.weak,vuln:b.p.vuln,thorns:b.p.thorns},energy:b.energy,turn:b.turn,draw:b.draw.slice(),hand:b.hand.slice(),disc:b.disc.slice(),exh:b.exh.slice()}; }
  return run;
}
function save(g){ try{ var gp=arcadeGameProgress(); var r=gp.rogue=gp.rogue||{}; r.floor=g.floor; r.deck=g.deck.slice(); r.hp=g.hp; r.wins=g.wins; r.best=Math.max(r.best||0,g.best||0); r.gold=g.gold; r.relics=g.relics.slice(); r.maxHp=g.maxHp; r.run=(g.ph==='title'||g.ph==='dead')?null:snapshot(g); persistProgress(); }catch(e){} }
function fresh(g){ g.floor=1; g.deck=STARTER.slice(); g.relics=[]; g.gold=30; g.maxHp=maxHpBase(); g.hp=g.maxHp; g.phx=false; g.nodes=[]; g.b=null; g.ev=null; g.shop=null; g.rewards=[]; }

window.arcadeRogueStart=function(){
  clearGameTimers();
  var gp=arcadeGameProgress(), r=gp.rogue=gp.rogue||{floor:1,wins:0,deck:STARTER.slice(),hp:30,run:null};
  var g={active:'rogue',rg:1,ph:'title',busy:false,fx:[],log:[],overlay:'',best:Number(r.best)||0,wins:Number(r.wins)||0,selUp:null};
  state.games=g;
  var run=r.run;
  g.saved=null;
  if(run&&run.v===2&&run.ph&&run.ph!=='dead'){ g.saved=run; }
  g.legacyFloor=Math.max(1,Number(r.floor)||1);
  // prepare a base for "continue legacy / new"
  fresh(g);
  if(!g.saved&&g.legacyFloor>1&&Array.isArray(r.deck)&&r.deck.length){ g.legacy={floor:g.legacyFloor,deck:r.deck.filter(function(x){ return C[String(x).replace(/\+$/,'')]; }),hp:Number(r.hp)||0}; }
};

function restore(g,run){
  g.floor=run.floor; g.hp=run.hp; g.maxHp=run.maxHp||maxHpBase(); g.gold=run.gold||0; g.deck=(run.deck||[]).slice(); g.relics=(run.relics||[]).slice(); g.phx=!!run.phx; g.nodes=run.nodes||[]; g.rewards=run.rewards||[]; g.shop=run.shop||null; g.ev=run.ev||null; g.evText=run.evText||''; g.goldGain=run.goldGain||0; g.relicGain=run.relicGain||''; g.kind=run.kind||''; g.upMode=run.up||'';
  g.ph=run.ph; g.log=['Run resumed — pick up where you left off.'];
  if(run.ph==='battle'&&run.b){ var rb=run.b, fo=FOES[rb.e.id]||FOES.slime; g.b={e:{id:rb.e.id,def:fo,hp:rb.e.hp,max:rb.e.max,block:rb.e.block,str:rb.e.str,weak:rb.e.weak,vuln:rb.e.vuln,psn:rb.e.psn,mi:rb.e.mi},p:rb.p,energy:rb.energy,turn:rb.turn,draw:rb.draw,hand:rb.hand,disc:rb.disc,exh:rb.exh}; }
  else if(run.ph==='battle'){ g.ph='map'; }
}

/* ------------------------------- run flow ------------------------------- */
function newRun(g){ fresh(g); g.log=[]; g.wins=g.wins||0; genMap(g); }
function continueLegacy(g){ var l=g.legacy; fresh(g); g.floor=l.floor; g.deck=l.deck.length?l.deck:STARTER.slice(); g.hp=Math.min(g.maxHp,Math.max(l.hp||0,Math.ceil(g.maxHp*.7))); g.log=[]; genMap(g); }
function genMap(g){
  g.ph='map'; var f=g.floor;
  if(f%5===0){ g.nodes=['boss']; save(g); return; }
  var pool=['fight','fight','fight','rest','rest','shop','shop','event','event']; if(f>=3) pool.push('elite','elite');
  var kinds=['fight']; var rest=shuf(pool.filter(function(k){ return k!=='fight'; }));
  while(kinds.length<3&&rest.length){ var k=rest.shift(); if(kinds.indexOf(k)<0) kinds.push(k); }
  if(f%5===4&&kinds.indexOf('rest')<0) kinds[2]='rest';
  g.nodes=shuf(kinds); save(g);
}
function enter(g,k){
  g.kind=k;
  if(k==='fight'||k==='elite'||k==='boss'){ startBattle(g,k); return; }
  if(k==='rest'){ g.ph='rest'; g.log=[]; save(g); return; }
  if(k==='shop'){ buildShop(g); g.ph='shop'; save(g); return; }
  if(k==='event'){ var id=pick(Object.keys(EVENTS)); g.ev=id; g.evText=''; g.ph='event'; save(g); return; }
}
function nextFloor(g){ g.floor++; if(g.floor>g.best) g.best=g.floor; genMap(g); }

function startBattle(g,kind){
  var f=g.floor, id;
  if(kind==='boss') id=['boss1','boss2','boss3'][floorTier(f)%3];
  else if(kind==='elite') id=pick(['knight','warlock']);
  else id=pick(NORMAL);
  var fo=FOES[id], hp=scaleHp(fo.hp,f);
  g.ph='battle'; g.fx=[]; g.busy=false; g.log=[]; g.fxWin=0; g.lunge=0; g.overlay='';
  g.b={e:{id:id,def:fo,hp:hp,max:hp,block:0,str:0,weak:0,vuln:0,psn:0,mi:0},p:{block:0,str:0,weak:0,vuln:0,thorns:0},energy:3,turn:1,draw:shuf(g.deck.slice()),hand:[],disc:[],exh:[]};
  var b=g.b;
  if(relic(g,'ring')) b.p.block+=6;
  if(relic(g,'whet')) b.p.str+=1;
  if(relic(g,'mail')) b.p.thorns+=2;
  if(relic(g,'crystal')) b.energy+=1;
  drawCards(g,handSize(g));
  g.log.push(fo.n+' blocks your path!');
  save(g);
}
function handSize(g){ return 5+(relic(g,'lantern')?1:0); }
function drawCards(g,n){ var b=g.b; for(var i=0;i<n;i++){ if(!b.draw.length){ if(!b.disc.length) break; b.draw=shuf(b.disc); b.disc=[]; } b.hand.push(b.draw.pop()); } }

/* intents */
function move(b){ var m=b.e.def.m[b.e.mi%b.e.def.m.length]; return m; }
function foeDmg(g,b,base){ var v=scaleV(base,g.floor)+b.e.str; if(b.e.weak>0) v=Math.floor(v*.75); if(b.p.vuln>0) v=Math.floor(v*1.5); return Math.max(0,v); }
function intent(g){
  var b=g.b, m=move(b), f=g.floor;
  if(m[0]==='atk') return {i:'⚔️',v:foeDmg(g,b,m[1]),txt:'Attack'};
  if(m[0]==='multi') return {i:'⚔️',v:foeDmg(g,b,m[1]),h:m[2],txt:'Multi-attack'};
  if(m[0]==='def') return {i:'🛡️',v:scaleV(m[1],f),txt:'Defend'};
  if(m[0]==='buff') return {i:'💢',v:m[1],txt:'Gains Strength'};
  if(m[0]==='heal') return {i:'💚',v:scaleV(m[1],f),txt:'Heals'};
  if(m[0]==='dbf') return {i:'☠️',v:foeDmg(g,b,m[1]),txt:'Attack + curse'};
  return {i:'❓',v:0,txt:'?'};
}

/* floating text & effects (consumed by paint) */
function fx(g,on,txt,cls){ g.fx.push({on:on,t:txt,c:cls||''}); }
function logPush(g,s){ g.log.push(s); if(g.log.length>4) g.log.shift(); }

/* ------------------------------- card play ------------------------------- */
function dealToFoe(g,raw,leech){
  var b=g.b, e=b.e, v=raw+b.p.str; if(b.p.weak>0) v=Math.floor(v*.75); if(e.vuln>0) v=Math.floor(v*1.5); v=Math.max(0,v);
  var ab=Math.min(e.block,v); e.block-=ab; var dmg=v-ab; e.hp-=dmg;
  fx(g,'e','-'+v,ab>=v?'blocked':'dmg'); if(leech&&dmg>0){ g.hp=Math.min(g.maxHp,g.hp+dmg); fx(g,'p','+'+dmg,'heal'); }
  return dmg;
}
function playCard(g,idx){
  if(g.ph!=='battle'||g.busy) return; var b=g.b, id=b.hand[idx]; if(!id) return; var c=cd(id);
  if(b.energy<c.c){ flash(g,'Not enough energy!'); sfx('end'); return; }
  b.energy-=c.c; b.hand.splice(idx,1); sfx('card');
  if(c.d!=null){ var n=c.hits||1, raw=c.d; if(c.x2&&b.e.hp<=b.e.max/2) raw*=2; for(var h=0;h<n;h++) dealToFoe(g,raw,c.leech); sfx('hit'); }
  if(c.b){ b.p.block+=c.b; fx(g,'p','+'+c.b+' 🛡','blk'); sfx('block'); }
  if(c.dbl){ b.p.block*=2; fx(g,'p','Block ×2','blk'); sfx('block'); }
  if(c.h){ var before=g.hp; g.hp=Math.min(g.maxHp,g.hp+c.h); fx(g,'p','+'+(g.hp-before),'heal'); sfx('heal'); }
  if(c.vuln){ b.e.vuln+=c.vuln; fx(g,'e','Vulnerable','dbf'); }
  if(c.weak){ b.e.weak+=c.weak; fx(g,'e','Weak','dbf'); }
  if(c.psn){ b.e.psn+=c.psn; fx(g,'e','☠ '+c.psn,'psn'); }
  if(c.str){ b.p.str+=c.str; fx(g,'p','+'+c.str+' Strength','buff'); sfx('buff'); }
  if(c.thorns){ b.p.thorns+=c.thorns; fx(g,'p','+'+c.thorns+' Thorns','buff'); sfx('buff'); }
  if(c.en){ b.energy+=c.en; fx(g,'p','+'+c.en+' ⚡','buff'); sfx('buff'); }
  if(c.ex) b.exh.push(id); else if(c.t!=='p') b.disc.push(id); else b.exh.push(id);
  if(c.draw) drawCards(g,c.draw);
  logPush(g,'You play '+c.n+'.');
  g.lastPlayed=idx;
  if(b.e.hp<=0){ winBattle(g); return; }
  paint(g);
}
function flash(g,s){ g.flash=s; var el=$('rg-flash'); if(el){ el.textContent=s; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); } }

function endTurn(g){
  if(g.ph!=='battle'||g.busy) return; var b=g.b; g.busy=true; sfx('end');
  b.disc=b.disc.concat(b.hand); b.hand=[]; paint(g);
  setTimeout(function(){ if(G()!==g||g.ph!=='battle') return; foeTurn(g); },420);
}
function foeTurn(g){
  var b=g.b, e=b.e, m=move(b), f=g.floor;
  e.block=0;
  if(e.psn>0){ e.hp-=e.psn; fx(g,'e','-'+e.psn+' ☠','psn'); logPush(g,e.def.n+' takes '+e.psn+' poison.'); e.psn--; if(e.hp<=0){ paint(g); setTimeout(function(){ if(G()===g) winBattle(g); },500); return; } }
  var hits=0;
  g.lunge=1; paint(g);
  setTimeout(function(){
    if(G()!==g||g.ph!=='battle') return; g.lunge=0;
    function strike(v){ var ab=Math.min(b.p.block,v); b.p.block-=ab; var d=v-ab; g.hp-=d; fx(g,'p','-'+v,ab>=v?'blocked':'dmg'); if(d>0){ sfx('hurt'); } else sfx('block'); if(b.p.thorns>0){ e.hp-=b.p.thorns; fx(g,'e','-'+b.p.thorns+' 🌵','dmg'); } }
    if(m[0]==='atk'||m[0]==='dbf'||m[0]==='multi'){ var n=m[0]==='multi'?m[2]:1, v=foeDmg(g,b,m[1]); for(var i=0;i<n;i++) strike(v); logPush(g,e.def.n+' hits you for '+(v*n)+(n>1?' ('+n+'×'+v+')':'')+'.'); if(m[0]==='dbf'){ if(m[2]){ b.p.weak+=m[2]; fx(g,'p','Weak','dbf'); } if(m[3]){ b.p.vuln+=m[3]; fx(g,'p','Vulnerable','dbf'); } } }
    else if(m[0]==='def'){ var bv=scaleV(m[1],f); e.block+=bv; fx(g,'e','+'+bv+' 🛡','blk'); logPush(g,e.def.n+' raises its guard.'); sfx('block'); }
    else if(m[0]==='buff'){ e.str+=m[1]; fx(g,'e','+'+m[1]+' Strength','buff'); logPush(g,e.def.n+' grows stronger!'); sfx('buff'); }
    else if(m[0]==='heal'){ var hv=scaleV(m[1],f); e.hp=Math.min(e.max,e.hp+hv); fx(g,'e','+'+hv,'heal'); logPush(g,e.def.n+' mends itself.'); sfx('heal'); }
    // decay debuffs
    if(e.weak>0) e.weak--; if(e.vuln>0) e.vuln--; if(b.p.weak>0) b.p.weak--; if(b.p.vuln>0) b.p.vuln--;
    e.mi++;
    paint(g);
    if(g.hp<=0){ if(g.relics.indexOf('feather')>=0&&!g.phx){ g.phx=true; g.hp=Math.ceil(g.maxHp/2); fx(g,'p','🪶 Revive!','heal'); logPush(g,'The Phoenix Feather burns — you rise again!'); sfx('win'); } else { setTimeout(function(){ if(G()===g) die(g); },600); return; } }
    if(e.hp<=0){ setTimeout(function(){ if(G()===g) winBattle(g); },500); return; }
    setTimeout(function(){ if(G()!==g||g.ph!=='battle') return; newTurn(g); },620);
  },520);
}
function newTurn(g){
  var b=g.b; b.turn++; b.p.block=0; b.energy=3; g.busy=false; drawCards(g,handSize(g)); g.lastPlayed=-1; save(g); paint(g);
}

function goldFor(g,kind){ var base=kind==='boss'?60:kind==='elite'?34:14+rnd(9); base+=Math.min(15,g.floor*1); if(relic(g,'idol')) base+=10; var luck=(stats().luck||0); return Math.round(base*(1+Math.min(10,luck)*.03)); }
function winBattle(g){
  var b=g.b, kind=g.kind; g.busy=true; sfx('win');
  var gold=goldFor(g,kind); g.gold+=gold; g.goldGain=gold; g.wins++; if(relic(g,'vial')){ g.hp=Math.min(g.maxHp,g.hp+4); }
  g.relicGain='';
  if(kind==='elite'||kind==='boss'){ var pool=Object.keys(RELICS).filter(function(k){ return g.relics.indexOf(k)<0; }); if(pool.length){ var rid=pick(pool); g.relics.push(rid); g.relicGain=rid; if(rid==='vial'){} } }
  if(kind==='boss'){ g.hp=Math.min(g.maxHp,g.hp+Math.round(g.maxHp*.4)); try{ addCoins(20,"Rogue's Sanctuary boss"); }catch(e){} try{ celebrate(); }catch(e){} }
  g.rewards=cardChoices(g,kind==='elite'||kind==='boss'?3:3,kind!=='fight');
  g.fxWin=1; g.b.e.hp=0;
  paint(g);
  setTimeout(function(){ if(G()!==g) return; g.ph='reward'; g.busy=false; g.b=null; save(g); paint(g); },900);
}
function cardChoices(g,n,rich){
  var ids=Object.keys(C).filter(function(k){ return C[k].r>0; }), out=[];
  var bag=[]; ids.forEach(function(k){ var w=C[k].r; if(rich&&w<=3) w+=2; for(var i=0;i<w;i++) bag.push(k); });
  var guard=0; while(out.length<n&&guard++<200){ var k=pick(bag); if(out.indexOf(k)<0) out.push(k); }
  return out;
}
function die(g){
  g.ph='dead'; sfx('lose');
  var gp=arcadeGameProgress(), r=gp.rogue; var reached=g.floor;
  g.reached=reached; g.coinsEarned=Math.min(40,Math.max(0,(reached-1)*2));
  if(g.coinsEarned){ try{ addCoins(g.coinsEarned,"Rogue's Sanctuary run"); }catch(e){} }
  g.best=Math.max(g.best||0,reached);
  r.best=g.best; r.wins=g.wins; r.floor=1; r.deck=STARTER.slice(); r.hp=maxHpBase(); r.run=null; r.gold=0; r.relics=[]; try{ persistProgress(); }catch(e){}
  paint(g);
}

/* ------------------------------- shop ------------------------------- */
function buildShop(g){
  var cards=cardChoices(g,3,false).map(function(id){ var w=C[id].r; var p=w>=5?45:w>=3?70:105; if(rnd(4)===0&&!/\+$/.test(id)){ id=id+'+'; p+=25; } return {id:id,p:p+rnd(10)}; });
  var pool=Object.keys(RELICS).filter(function(k){ return g.relics.indexOf(k)<0; });
  g.shop={cards:cards,relic:pool.length?{id:pick(pool),p:130+rnd(30)}:null,rm:50,rmUsed:0,heal:40,healed:0};
}
function shopBuy(g,kind,i){
  var s=g.shop; if(!s) return;
  if(kind==='card'){ var it=s.cards[i]; if(!it||it.sold||g.gold<it.p) return flash(g,'Not enough gold!'); g.gold-=it.p; g.deck.push(it.id); it.sold=1; sfx('gold'); }
  else if(kind==='relic'){ var r=s.relic; if(!r||r.sold||g.gold<r.p) return flash(g,'Not enough gold!'); g.gold-=r.p; g.relics.push(r.id); r.sold=1; sfx('gold'); if(r.id==='vial'){} }
  else if(kind==='heal'){ if(s.healed||g.gold<s.heal) return flash(g,s.healed?'Already healed here.':'Not enough gold!'); g.gold-=s.heal; s.healed=1; var h=Math.round(g.maxHp*.25); g.hp=Math.min(g.maxHp,g.hp+h); sfx('heal'); }
  else if(kind==='rm'){ if(s.rmUsed||g.gold<s.rm) return flash(g,s.rmUsed?'Already removed one here.':'Not enough gold!'); g.upMode='remove'; g.ph='deckpick'; paint(g); return; }
  save(g); paint(g);
}

/* ------------------------------- rest / events / deck picking ------------------------------- */
function restHeal(g){ var h=Math.round(g.maxHp*.3); g.hp=Math.min(g.maxHp,g.hp+h); sfx('heal'); nextFloor(g); paint(g); }
function upgradeable(g){ var out=[]; g.deck.forEach(function(id,i){ if(!/\+$/.test(id)&&C[id]&&C[id].up) out.push(i); }); return out; }
function eventChoose(g,k){
  var res='';
  if(k==='leave'){ nextFloor(g); paint(g); return; }
  if(k==='altar1'){ g.hp=Math.max(1,g.hp-7); var pool=Object.keys(RELICS).filter(function(r){ return g.relics.indexOf(r)<0; }); if(pool.length){ var r=pick(pool); g.relics.push(r); res='You pay in blood. Gained '+RELICS[r].i+' '+RELICS[r].n+' (−7 HP).'; } else res='The altar is silent. You lose 7 HP for nothing.'; sfx('hurt'); }
  else if(k==='fount1'){ var b=g.hp; g.hp=Math.min(g.maxHp,g.hp+18); res='You drink deeply. +'+(g.hp-b)+' HP.'; sfx('heal'); }
  else if(k==='fount2'){ g.maxHp+=5; g.hp+=5; res='Your spirit swells. +5 max HP.'; sfx('heal'); }
  else if(k==='bet'){ if(g.gold<25){ res='You cannot cover the bet.'; } else if(Math.random()<.5){ g.gold+=45; res='The dice favor you! +45 gold net (70 won).'; sfx('gold'); } else { g.gold-=25; res='Snake eyes. −25 gold.'; sfx('hurt'); } }
  else if(k==='scr1'){ var u=upgradeable(g); if(u.length){ var ix=pick(u); var nm=C[g.deck[ix]].n; g.deck[ix]=g.deck[ix]+'+'; res='The scribe sharpens your '+nm+' → '+nm+'+.'; sfx('buff'); } else res='Nothing left for him to teach you.'; }
  else if(k==='scr2'){ g.gold+=30; res='+30 gold. The scribe sulks.'; sfx('gold'); }
  g.evText=res; g.ev=g.ev; g.ph='eventres'; save(g); paint(g);
}

/* ------------------------------- rendering ------------------------------- */
function bar(cur,max,cls){ return '<div class="rg-bar '+cls+'"><i style="width:'+Math.max(0,Math.min(100,cur/max*100))+'%"></i><span>'+Math.max(0,cur)+' / '+max+'</span></div>'; }
function chips(o,isP){ var h=''; if(o.block>0) h+='<span class="rg-chip blk">🛡 '+o.block+'</span>'; if(o.str) h+='<span class="rg-chip str">💪 '+o.str+'</span>'; if(o.weak>0) h+='<span class="rg-chip dbf">🥀 Weak '+o.weak+'</span>'; if(o.vuln>0) h+='<span class="rg-chip dbf">💔 Vuln '+o.vuln+'</span>'; if(o.psn>0) h+='<span class="rg-chip psn">☠ '+o.psn+'</span>'; if(o.thorns>0) h+='<span class="rg-chip str">🌵 '+o.thorns+'</span>'; return h; }
function cardHtml(id,opt){
  opt=opt||{}; var c=cd(id), cls='rg-card t-'+c.t+(c.up2?' up':'')+(opt.dis?' dis':'')+(opt.cls?' '+opt.cls:'');
  var attr=opt.attr||''; var tag=opt.tag||'button';
  return '<'+tag+' class="'+cls+'" '+attr+(opt.style?' style="'+opt.style+'"':'')+'><span class="rg-cost">'+c.c+'</span><span class="rg-ci">'+c.i+'</span><b class="rg-cn">'+E(c.n)+'</b><small class="rg-ct">'+E(ctext(c))+'</small><em class="rg-ctype">'+({a:'Attack',s:'Skill',p:'Power'}[c.t])+'</em></'+tag+'>';
}
function topbar(g){
  var track='';
  var f0=Math.max(1,g.floor-2); for(var f=f0;f<f0+7;f++){ track+='<span class="rg-fl '+(f<g.floor?'done':f===g.floor?'cur':'')+(f%5===0?' boss':'')+'">'+(f%5===0?'👑':f)+'</span>'; }
  var rel=g.relics.map(function(r){ return '<span class="rg-rel" title="'+E(RELICS[r].n+': '+RELICS[r].d)+'">'+RELICS[r].i+'</span>'; }).join('')||'<span class="rg-none">No relics yet</span>';
  return '<div class="rg-top"><div class="rg-track">'+track+'</div><div class="rg-relics">'+rel+'</div><div class="rg-res"><span class="rg-gold">🪙 <b>'+g.gold+'</b></span><button class="rg-tool" data-rg="deck" title="View deck (D)">🂠 '+g.deck.length+'</button><button class="rg-tool" data-rg="mute" title="Sound">'+(muted()?'🔇':'🔊')+'</button><button class="rg-tool" data-rg="fs" title="Fullscreen (F)">⛶</button></div></div>';
}
function hero(g,withBars){
  var b=g.b;
  return '<div class="rg-side p'+(g.hurt?' hurt':'')+'" id="rg-p"><div class="rg-fxanchor" id="rg-fx-p"></div><div class="rg-art">'+ling()+'</div><div class="rg-nm">'+E(stats().name||'Your Indexling')+'</div>'+bar(g.hp,g.maxHp,'hp')+(b?'<div class="rg-chips">'+chips(b.p,true)+'</div>':'')+'</div>';
}
function foeSide(g){
  var b=g.b, e=b.e, it=intent(g), cls=(g.lunge?' lunge':'')+(g.fxWin?' dead':'');
  var iv=it.v!=null&&it.txt.indexOf('Attack')>=0?(it.h?it.v+'×'+it.h:it.v):(it.txt==='Defend'||it.txt==='Heals'||it.txt==='Gains Strength'?'+'+it.v:'');
  return '<div class="rg-side e'+cls+'" id="rg-e"><div class="rg-fxanchor" id="rg-fx-e"></div><div class="rg-intent" title="'+E(it.txt)+'"><span>'+it.i+'</span><b>'+iv+'</b><small>'+E(it.txt)+'</small></div><div class="rg-foe'+(e.def.boss?' boss':'')+(e.def.elite?' elite':'')+'">'+e.def.i+'</div><div class="rg-nm">'+E(e.def.n)+(e.def.boss?' · Boss':e.def.elite?' · Elite':'')+'</div>'+bar(e.hp,e.max,'ehp')+'<div class="rg-chips">'+chips(e,false)+'</div></div>';
}
function battleHtml(g){
  var b=g.b, hand=b.hand.map(function(id,i){ var c=cd(id); return cardHtml(id,{attr:'data-rg="play" data-i="'+i+'"',dis:b.energy<c.c||g.busy,style:'--i:'+i+';--n:'+b.hand.length}); }).join('');
  var log=g.log.slice(-3).map(function(s){ return '<div>'+E(s)+'</div>'; }).join('');
  return topbar(g)+'<div class="rg-arena"><div class="rg-bg"></div>'+hero(g)+'<div class="rg-mid"><div class="rg-turn">Turn '+b.turn+'</div><div class="rg-log">'+log+'</div><div class="rg-flash" id="rg-flash"></div></div>'+foeSide(g)+'</div>'+
    '<div class="rg-hud"><div class="rg-pile" title="Draw pile">📚<b>'+b.draw.length+'</b><small>Draw</small></div><div class="rg-orb" title="Energy"><b>'+b.energy+'</b><small>/3</small></div><div class="rg-hand" id="rg-hand">'+hand+'</div><div class="rg-pile" title="Discard pile">🗑️<b>'+b.disc.length+'</b><small>Discard</small></div><button class="btn btn-primary rg-end" data-rg="end" '+(g.busy?'disabled':'')+'>End turn <kbd>E</kbd></button></div>';
}
function nodeInfo(k,f){ return {fight:['⚔️','Monster','A normal battle. Earn gold and add a card.'],elite:['👹','Elite','Tough battle. Wins a relic.'],rest:['🔥','Campfire','Heal 30% or sharpen a card.'],shop:['🛒','Merchant','Spend gold on cards, relics, cures.'],event:['❔','Mystery','Something strange waits…'],boss:['👑','Boss','Defeat the guardian of this floor.']}[k]; }
function mapHtml(g){
  var nodes=g.nodes.map(function(k,i){ var n=nodeInfo(k); return '<button class="rg-node k-'+k+'" data-rg="node" data-i="'+i+'"><span class="rg-ni">'+n[0]+'</span><b>'+n[1]+'</b><small>'+n[2]+'</small></button>'; }).join('');
  var next=g.floor%5===0?'A boss guards this floor.':'Floor '+g.floor+' — choose your path.';
  return topbar(g)+'<div class="rg-screen"><div class="rg-hero">'+ling()+'</div><h3>'+next+'</h3><div class="rg-hp">'+bar(g.hp,g.maxHp,'hp')+'</div><div class="rg-nodes">'+nodes+'</div></div>';
}
function rewardHtml(g){
  var cards=g.rewards.map(function(id,i){ return cardHtml(id,{attr:'data-rg="reward" data-i="'+i+'"',cls:'big'}); }).join('');
  var rel=g.relicGain?'<div class="rg-gain">'+RELICS[g.relicGain].i+' New relic: <b>'+E(RELICS[g.relicGain].n)+'</b> — '+E(RELICS[g.relicGain].d)+'</div>':'';
  return topbar(g)+'<div class="rg-screen"><h3>Victory! 🪙 +'+g.goldGain+' gold'+(g.kind==='boss'?' · healed 40%':'')+'</h3>'+rel+'<p class="rg-sub">Add one card to your deck:</p><div class="rg-choices">'+cards+'</div><button class="btn btn-ghost" data-rg="skip">Skip (+8 🪙)</button></div>';
}
function restHtml(g){
  var up=upgradeable(g).length;
  return topbar(g)+'<div class="rg-screen rest"><div class="rg-fire">🔥</div><h3>Campfire</h3><p class="rg-sub">The embers are warm. You have a moment.</p><div class="rg-hp">'+bar(g.hp,g.maxHp,'hp')+'</div><div class="rg-choices"><button class="rg-opt" data-rg="rest-heal"><span>💤</span><b>Rest</b><small>Heal '+Math.round(g.maxHp*.3)+' HP</small></button><button class="rg-opt" data-rg="rest-up" '+(up?'':'disabled')+'><span>🔨</span><b>Sharpen</b><small>'+(up?'Upgrade a card in your deck':'Nothing to upgrade')+'</small></button></div></div>';
}
function shopHtml(g){
  var s=g.shop, cards=s.cards.map(function(it,i){ return '<div class="rg-sale'+(it.sold?' sold':'')+'">'+cardHtml(it.id,{attr:'data-rg="buy-card" data-i="'+i+'"',dis:it.sold||g.gold<it.p})+'<span class="rg-price'+(g.gold<it.p&&!it.sold?' poor':'')+'">'+(it.sold?'SOLD':'🪙 '+it.p)+'</span></div>'; }).join('');
  var rl=s.relic?'<button class="rg-opt'+(s.relic.sold?' sold':'')+'" data-rg="buy-relic" '+(s.relic.sold||g.gold<s.relic.p?'disabled':'')+'><span>'+RELICS[s.relic.id].i+'</span><b>'+E(RELICS[s.relic.id].n)+'</b><small>'+E(RELICS[s.relic.id].d)+'</small><em>'+(s.relic.sold?'SOLD':'🪙 '+s.relic.p)+'</em></button>':'';
  return topbar(g)+'<div class="rg-screen shop"><h3>🛒 Wandering Merchant</h3><div class="rg-choices">'+cards+'</div><div class="rg-choices">'+rl+'<button class="rg-opt" data-rg="buy-rm" '+(s.rmUsed||g.gold<s.rm?'disabled':'')+'><span>🔥</span><b>Burn a card</b><small>Remove a card from your deck</small><em>'+(s.rmUsed?'DONE':'🪙 '+s.rm)+'</em></button><button class="rg-opt" data-rg="buy-heal" '+(s.healed||g.gold<s.heal?'disabled':'')+'><span>🧃</span><b>Tonic</b><small>Heal '+Math.round(g.maxHp*.25)+' HP</small><em>'+(s.healed?'DONE':'🪙 '+s.heal)+'</em></button></div><button class="btn btn-primary" data-rg="leave">Leave shop →</button></div>';
}
function eventHtml(g){
  var ev=EVENTS[g.ev];
  if(g.ph==='eventres') return topbar(g)+'<div class="rg-screen"><div class="rg-evi">'+ev.i+'</div><h3>'+E(ev.n)+'</h3><p class="rg-sub">'+E(g.evText)+'</p><button class="btn btn-primary" data-rg="evnext">Continue →</button></div>';
  return topbar(g)+'<div class="rg-screen"><div class="rg-evi">'+ev.i+'</div><h3>'+E(ev.n)+'</h3><p class="rg-sub">'+E(ev.t)+'</p><div class="rg-choices">'+ev.o.map(function(o,i){ var dis=(o[1]==='bet'&&g.gold<25); return '<button class="rg-opt" data-rg="ev" data-k="'+o[1]+'" '+(dis?'disabled':'')+'><b>'+E(o[0])+'</b></button>'; }).join('')+'</div></div>';
}
function deckPickHtml(g){
  var remove=g.upMode==='remove', idxs=remove?g.deck.map(function(_,i){ return i; }):upgradeable(g);
  var cards=idxs.map(function(i){ return cardHtml(g.deck[i],{attr:'data-rg="pickcard" data-i="'+i+'"'}); }).join('');
  return topbar(g)+'<div class="rg-screen"><h3>'+(remove?'Choose a card to burn':'Choose a card to sharpen')+'</h3><div class="rg-choices wrap">'+cards+'</div><button class="btn btn-ghost" data-rg="cancelpick">Cancel</button></div>';
}
function titleHtml(g){
  var st=stats(), s=g.saved, l=g.legacy, c='';
  var best=g.best?'<span class="rg-pill">🏛 Best floor <b>'+g.best+'</b></span>':'';
  if(s) c+='<button class="btn btn-primary btn-lg" data-rg="resume">▶ Continue run · Floor '+s.floor+' · '+s.hp+'/'+(s.maxHp||maxHpBase())+' HP</button>';
  else if(l) c+='<button class="btn btn-primary btn-lg" data-rg="legacy">▶ Continue climb · Floor '+l.floor+' · '+l.deck.length+'-card deck</button>';
  c+='<button class="btn '+(s||l?'btn-ghost':'btn-primary btn-lg')+'" data-rg="new">'+(s||l?'Start a new run':'⚔ Begin the climb')+'</button>';
  return '<div class="rg-title"><div class="rg-hero big">'+ling()+'</div><h2>Rogue\'s Sanctuary</h2><p>Climb the sanctuary floor by floor. Fight with a deck of skills, read enemy intents, pick your path, find relics, and defeat a boss every 5th floor.</p><div class="rg-facts"><span>❤️ '+maxHpBase()+' HP</span><span>⚡ 3 energy</span><span>🃏 5 cards / turn</span><span>🍀 Luck '+(st.luck||0)+': bonus gold</span>'+best+'</div><div class="rg-how"><span>1–5 play cards</span><span>E end turn</span><span>D deck</span><span>F fullscreen</span></div><div class="rg-tbtns">'+c+'<button class="btn btn-ghost" data-rg="fs">⛶ Fullscreen</button></div></div>';
}
function deadHtml(g){
  return '<div class="rg-title dead"><div class="rg-evi">💀</div><h2>Your climb ends on floor '+g.reached+'</h2><p>You defeated '+g.wins+' foes across all runs. Best floor: '+g.best+'.'+(g.coinsEarned?' <b>+'+g.coinsEarned+' 🪙</b>':'')+'</p><div class="rg-tbtns"><button class="btn btn-primary btn-lg" data-rg="new">Start a new run</button><button class="btn btn-ghost" data-rg="hub">Back to games</button></div></div>';
}
function deckOverlay(g){
  var sorted=g.deck.slice().sort(function(a,b){ return cd(a).n<cd(b).n?-1:1; });
  return '<div class="rg-ov"><div class="rg-ovc"><h3>Your deck · '+g.deck.length+' cards</h3><div class="rg-choices wrap">'+sorted.map(function(id){ return cardHtml(id,{tag:'div'}); }).join('')+'</div><button class="btn btn-primary" data-rg="closedeck">Close</button></div></div>';
}
function inner(g){
  var h;
  if(g.ph==='title') h=titleHtml(g);
  else if(g.ph==='dead') h=deadHtml(g);
  else if(g.ph==='battle') h=battleHtml(g);
  else if(g.ph==='map') h=mapHtml(g);
  else if(g.ph==='reward') h=rewardHtml(g);
  else if(g.ph==='rest') h=restHtml(g);
  else if(g.ph==='shop') h=shopHtml(g);
  else if(g.ph==='event'||g.ph==='eventres') h=eventHtml(g);
  else if(g.ph==='deckpick') h=deckPickHtml(g);
  else h='';
  return h+(g.overlay==='deck'?deckOverlay(g):'');
}
function paint(g){
  var root=$('rg-root'); if(!root||G()!==g) return;
  var scroll=root.scrollTop; root.innerHTML=inner(g); root.scrollTop=scroll;
  root.setAttribute('data-ph',g.ph);
  var fxs=g.fx; g.fx=[];
  fxs.forEach(function(f,i){ setTimeout(function(){ if(G()!==g) return; var a=$('rg-fx-'+f.on); if(!a) return; var s=document.createElement('span'); s.className='rg-float '+f.c; s.textContent=f.t; s.style.left=(30+(i%3)*18)+'%'; a.appendChild(s); var host=$('rg-'+f.on); if(host&&(f.c==='dmg'||f.c==='blocked')){ host.classList.remove('hit'); void host.offsetWidth; host.classList.add('hit'); } setTimeout(function(){ if(s.parentNode) s.parentNode.removeChild(s); },1300); },i*90); });
}
window.arcadeRogueHtml=function(){
  var g=state.games; if(!g||!g.rg) return '';
  var st=stats();
  var statsH='<span class="arcade-pill">🏛 Floor <b>'+g.floor+'</b></span><span class="arcade-pill">❤️ <b>'+g.hp+'/'+g.maxHp+'</b></span><span class="arcade-pill">🪙 <b>'+g.gold+'</b></span><span class="arcade-pill">🃏 <b>'+g.deck.length+'</b></span>';
  return arcadeFrame("Rogue's Sanctuary",'Build a skill deck, read enemy intents, pick your path and climb.',statsH,'<div id="rg-root" class="rg-root" data-ph="'+g.ph+'">'+inner(g)+'</div>');
};
// legacy hooks kept so any old caller keeps working
window.arcadeRogueSave=function(){ var g=G(); if(g) save(g); };
window.arcadeRoguePlay=function(){};
window.arcadeRogueChooseReward=function(){};

/* ------------------------------- input ------------------------------- */
function isFS(){ var st=$('games-stage'); return !!st&&(document.fullscreenElement===st||document.webkitFullscreenElement===st); }
function toggleFS(){ var w=$('games-stage'); if(!w) return; try{ if(isFS()) (document.exitFullscreen||document.webkitExitFullscreen).call(document); else (w.requestFullscreen||w.webkitRequestFullscreen).call(w); }catch(e){} }
function full(g){ renderGames(); }
document.addEventListener('click',function(e){
  var g=G(); if(!g) return; var t=e.target.closest&&e.target.closest('[data-rg]'); if(!t) return; var a=t.getAttribute('data-rg'), i=+t.getAttribute('data-i');
  if(t.disabled&&a!=='play') return;
  if(a==='fs'){ toggleFS(); return; }
  if(a==='mute'){ try{ localStorage.setItem('gx-mute',muted()?'0':'1'); }catch(er){} paint(g); return; }
  if(a==='deck'){ g.overlay=g.overlay==='deck'?'':'deck'; paint(g); return; }
  if(a==='closedeck'){ g.overlay=''; paint(g); return; }
  if(a==='hub'){ var b=document.querySelector('[data-action="arcade-hub"]'); if(b) b.click(); else if(typeof renderGames==='function'){ state.games={}; renderGames(); } return; }
  if(a==='play') playCard(g,i);
  else if(a==='end') endTurn(g);
  else if(a==='resume'){ restore(g,g.saved); g.saved=null; if(g.ph==='map'&&(!g.nodes||!g.nodes.length)) genMap(g); renderGames(); }
  else if(a==='legacy'){ continueLegacy(g); g.legacy=null; renderGames(); }
  else if(a==='new'){ newRun(g); g.saved=null; g.legacy=null; renderGames(); }
  else if(a==='node'){ enter(g,g.nodes[i]); paint(g); }
  else if(a==='reward'){ var id=g.rewards[i]; if(id){ g.deck.push(id); sfx('gold'); } nextFloor(g); paint(g); }
  else if(a==='skip'){ g.gold+=8; nextFloor(g); paint(g); }
  else if(a==='rest-heal') restHeal(g);
  else if(a==='rest-up'){ g.upMode='up'; g.ph='deckpick'; paint(g); }
  else if(a==='pickcard'){ if(g.upMode==='remove'){ g.deck.splice(i,1); g.gold-=g.shop.rm; g.shop.rmUsed=1; g.ph='shop'; sfx('hurt'); } else { g.deck[i]=g.deck[i]+'+'; sfx('buff'); g.upMode=''; nextFloor(g); } if(g.ph==='shop') save(g); paint(g); }
  else if(a==='cancelpick'){ if(g.upMode==='remove'){ g.ph='shop'; } else g.ph='rest'; g.upMode=''; paint(g); }
  else if(a==='buy-card') shopBuy(g,'card',i);
  else if(a==='buy-relic') shopBuy(g,'relic');
  else if(a==='buy-rm') shopBuy(g,'rm');
  else if(a==='buy-heal') shopBuy(g,'heal');
  else if(a==='leave'){ nextFloor(g); paint(g); }
  else if(a==='ev') eventChoose(g,t.getAttribute('data-k'));
  else if(a==='evnext'){ nextFloor(g); paint(g); }
});
document.addEventListener('keydown',function(e){
  var g=G(); if(!g||state.view!=='games') return; var k=e.key.toLowerCase(); if(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if(k==='f'){ toggleFS(); return; }
  if(k==='d'&&g.ph!=='title'&&g.ph!=='dead'){ g.overlay=g.overlay==='deck'?'':'deck'; paint(g); return; }
  if(g.ph==='battle'&&!g.busy){ if(k==='e'||k==='enter'){ endTurn(g); e.preventDefault(); } else if(k>='1'&&k<='9'){ var n=+k-1; if(n<g.b.hand.length) playCard(g,n); } }
},true);
window.__rg={get:function(){ return G(); },playCard:playCard,endTurn:endTurn,enter:enter,newRun:newRun,genMap:genMap,die:die,cd:cd,C:C,RELICS:RELICS,intent:intent,startBattle:startBattle,winBattle:winBattle,save:save,shopBuy:shopBuy};
})();
