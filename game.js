(() => {
"use strict";
const canvas=document.getElementById("gameCanvas"),ctx=canvas.getContext("2d"),$=id=>document.getElementById(id);
ctx.imageSmoothingEnabled=false;

const ui={
 menu:$("menu"),pause:$("pause"),controls:$("controls"),difficulty:$("difficulty"),
 hpBar:$("hpBar"),hpText:$("hpText"),stBar:$("stBar"),stText:$("stText"),
 bossBar:$("bossBar"),bossPhase:$("bossPhase"),souls:$("souls"),deaths:$("deaths"),
 relics:$("relics"),combo:$("combo"),notice:$("notice"),continueGame:$("continueGame"),
 comboFlash:$("comboFlash")
};

const keys=new Set(),WORLD=9000,GROUND=455,checkpoints=[120,2250,4700,7000];
let mode="menu",difficulty="normal",souls=0,deaths=0,checkpoint=0,cameraX=0,last=0;
let relicCount=0,victory=false,assetsReady=false,noticeTimer=0,shake=0,comboCount=0,comboTimer=0;
const images={},sources={
 kael:"kael-v5.png",soldier:"soldato-v5.png",hound:"segugio-v5.png",cultist:"cultista-v5.png",
 boss:"custode-v5.png",background:"bosco-v5.png",tiles:"tiles-v5.png",relics:"reliquie-v5.png"
};

const P={
 x:120,y:407,w:32,h:48,vx:0,vy:0,speed:290,jump:680,gravity:1850,onGround:false,
 baseHp:120,maxHp:120,hp:120,maxSt:100,st:100,facing:1,attack:0,attackCd:0,
 dodge:0,dodgeCd:0,block:0,inv:0,coyote:0,jumpBuffer:0,anim:0,skillCd:0,
 comboStep:0,comboWindow:0,airAttack:false,landTimer:0
};

const platforms=[
[0,455,1050,100],[1120,455,700,100],[1900,455,960,100],[2940,455,610,100],
[3630,455,1150,100],[4860,455,820,100],[5760,455,970,100],[6810,455,2190,100],
[530,355,250,28],[1260,330,230,28],[1550,270,190,28],[2380,345,270,28],
[3120,330,210,28],[3860,350,270,28],[4280,285,240,28],[5130,330,280,28],
[6030,335,300,28],[7210,350,240,28],[7740,300,210,28],[8200,250,190,28]
].map(a=>({x:a[0],y:a[1],w:a[2],h:a[3]}));

const enemies=[],pickups=[],particles=[],projectiles=[];

function loadAssets(done){
 let n=0,entries=Object.entries(sources);
 entries.forEach(([k,src])=>{
  const im=new Image();
  im.onload=()=>{images[k]=im;if(++n===entries.length){assetsReady=true;done()}};
  im.onerror=()=>note("ERRORE FILE: "+src);
  im.src=src;
 });
}

function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}

function enemy(x,type="soldier"){
 const boss=type==="boss",hound=type==="hound",cult=type==="cultist";
 const hp=boss?(difficulty==="fractured"?1200:850):(cult?65:hound?55:85);
 return{
  type,x,y:GROUND-(boss?112:hound?32:48),w:boss?80:hound?40:32,h:boss?112:hound?32:48,
  vx:0,vy:0,maxHp:hp,hp,damage:boss?22:cult?11:hound?10:14,phase:1,dir:-1,
  attackCd:0,hurt:0,dead:false,onGround:false,anim:0
 };
}

function reset(){
 enemies.length=0;
 [760,1420,2510,3250,3970,5210,6210].forEach(x=>enemies.push(enemy(x)));
 [1710,3480,4450,6490].forEach(x=>enemies.push(enemy(x,"hound")));
 [2070,4570,5570].forEach(x=>enemies.push(enemy(x,"cultist")));
 enemies.push(enemy(8250,"boss"));
 pickups.length=0;
 pickups.push(
  {x:1580,y:235,w:24,h:24,type:0,taken:false},
  {x:4310,y:250,w:24,h:24,type:1,taken:false},
  {x:6150,y:300,w:24,h:24,type:2,taken:false},
  {x:7770,y:265,w:24,h:24,type:3,taken:false}
 );
 projectiles.length=0;
}

function frag(){
 const loss=difficulty==="fractured"?Math.min(.70,deaths*.05):0;
 P.maxHp=Math.max(36,Math.round(P.baseHp*(1-loss)));P.hp=P.maxHp;
}

function save(){
 localStorage.setItem("eclipseV5",JSON.stringify({difficulty,souls,deaths,checkpoint,relicCount}));
 ui.continueGame.disabled=false;
}

function load(){
 try{
  const d=JSON.parse(localStorage.getItem("eclipseV5")||"null");
  if(!d)return false;
  difficulty=d.difficulty||"normal";souls=d.souls||0;deaths=d.deaths||0;
  checkpoint=d.checkpoint||0;relicCount=d.relicCount||0;ui.difficulty.value=difficulty;return true;
 }catch{return false}
}

function note(t){
 ui.notice.textContent=t;ui.notice.classList.add("on");
 clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>ui.notice.classList.remove("on"),1800);
}

function burst(x,y,color,n=8){
 for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*300,vy:(Math.random()-.75)*280,life:.45+Math.random()*.2,color});
}

function solve(b,dt){
 b.onGround=false;b.x+=b.vx*dt;
 for(const p of platforms)if(overlap(b,p)){if(b.vx>0)b.x=p.x-b.w;else if(b.vx<0)b.x=p.x+p.w;b.vx=0}
 b.y+=b.vy*dt;
 for(const p of platforms)if(overlap(b,p)){
  if(b.vy>0){b.y=p.y-b.h;b.vy=0;b.onGround=true}else if(b.vy<0){b.y=p.y+p.h;b.vy=0}
 }
}

function damagePlayer(n,x){
 if(P.inv>0||mode!=="play")return;
 if(P.block>0&&Math.sign(x-P.x)===P.facing){
  P.st=Math.max(0,P.st-18);shake=3;burst(P.x+P.w/2,P.y+20,"#a9d3ff",8);note("PARATA");
  if(P.st<=0)P.block=0;
  return;
 }
 P.hp-=n;P.inv=.75;P.vx=(P.x<x?-1:1)*350;P.vy=-260;shake=8;
 burst(P.x+16,P.y+20,"#bd3149",12);
 if(P.hp<=0)die();
}

function registerCombo(){
 comboCount++;comboTimer=2.2;ui.combo.textContent=comboCount;
 ui.comboFlash.querySelector("b").textContent=comboCount;ui.comboFlash.classList.add("on");
}

function attack(){
 if(P.attackCd>0||mode!=="play")return;
 if(!P.onGround){
  P.airAttack=true;P.attack=.28;P.attackCd=.45;
 }else{
  if(P.comboWindow>0)P.comboStep=(P.comboStep%3)+1;else P.comboStep=1;
  P.comboWindow=.52;P.attack=.26;P.attackCd=.28;
 }
 const step=P.airAttack?4:P.comboStep;
 const reach=[0,58,66,78,62][step],dmg=[0,32,38,52,42][step];
 const hit={x:P.facing>0?P.x+P.w:P.x-reach,y:P.y+(P.airAttack?12:4),w:reach,h:P.airAttack?54:44};
 enemies.forEach(e=>{
  if(e.dead||!overlap(hit,e))return;
  e.hp-=e.type==="boss"?Math.round(dmg*.72):dmg;e.hurt=.15;e.vx=P.facing*(160+step*25);shake=step===3?7:4;
  burst(e.x+e.w/2,e.y+e.h/2,step===3?"#b5ddff":"#70b5ff",10+step*2);registerCombo();
  if(e.hp<=0){
   e.dead=true;souls+=e.type==="boss"?150:e.type==="cultist"?9:e.type==="hound"?5:8;
   if(e.type==="boss"){victory=true;mode="victory";note("IL CUSTODE È CADUTO");save()}
  }
 });
}

function dodge(){
 if(P.dodgeCd>0||P.st<25||mode!=="play")return;
 P.dodge=.26;P.dodgeCd=.65;P.inv=.38;P.st-=25;P.vx=P.facing*670;P.block=0;
}

function block(){
 if(mode!=="play"||P.st<=0)return;
 P.block=.18;P.vx*=.65;
}

function skill(){
 if(P.skillCd>0||P.st<40||mode!=="play")return;
 P.skillCd=4;P.st-=40;shake=11;burst(P.x+16,P.y+20,"#75bfff",32);
 const wave={x:P.x-135,y:P.y-75,w:302,h:185};
 enemies.forEach(e=>{
  if(!e.dead&&overlap(wave,e)){
   e.hp-=e.type==="boss"?42:62;e.hurt=.22;
   if(e.hp<=0){e.dead=true;souls+=e.type==="boss"?150:10}
  }
 });
 note("IMPULSO D'ESSENZA");
}

function die(){
 if(mode!=="play")return;
 deaths++;frag();mode="dead";note(difficulty==="fractured"?"FRAMMENTAZIONE: VITA MASSIMA -5%":"KAEL È CADUTO");
 setTimeout(()=>{
  Object.assign(P,{x:checkpoints[checkpoint],y:407,vx:0,vy:0,hp:P.maxHp,st:100,inv:1.5,comboStep:0,comboWindow:0});
  comboCount=0;reset();mode="play";save();
 },800);
}

function start(cont=false){
 if(!assetsReady){note("ATTENDI IL CARICAMENTO");return}
 if(cont){if(!load())return}else{difficulty=ui.difficulty.value;souls=0;deaths=0;checkpoint=0;relicCount=0}
 victory=false;comboCount=0;frag();
 Object.assign(P,{x:checkpoints[checkpoint],y:407,vx:0,vy:0,st:100,inv:0,skillCd:0,comboStep:0,comboWindow:0});
 reset();mode="play";ui.menu.classList.remove("visible");note(difficulty==="fractured"?"MODALITÀ FRAMMENTATA":"IL BOSCO INFRANTO");save();
}

function updateP(dt){
 const l=keys.has("ArrowLeft")||keys.has("KeyA"),r=keys.has("ArrowRight")||keys.has("KeyD"),m=(r?1:0)-(l?1:0);
 if(m)P.facing=m;
 if(P.dodge<=0&&P.block<=0)P.vx+=(m*P.speed-P.vx)*Math.min(1,dt*12);
 P.vy+=P.gravity*dt;P.coyote=P.onGround?.11:Math.max(0,P.coyote-dt);P.jumpBuffer=Math.max(0,P.jumpBuffer-dt);
 if(P.jumpBuffer>0&&P.coyote>0){P.vy=-P.jump;P.coyote=0;P.jumpBuffer=0}
 const wasGround=P.onGround;solve(P,dt);
 if(!wasGround&&P.onGround)P.landTimer=.14;
 if(P.y>620)die();
 P.attack=Math.max(0,P.attack-dt);P.attackCd=Math.max(0,P.attackCd-dt);P.dodge=Math.max(0,P.dodge-dt);
 P.dodgeCd=Math.max(0,P.dodgeCd-dt);P.block=Math.max(0,P.block-dt);P.inv=Math.max(0,P.inv-dt);
 P.skillCd=Math.max(0,P.skillCd-dt);P.comboWindow=Math.max(0,P.comboWindow-dt);P.landTimer=Math.max(0,P.landTimer-dt);
 if(P.attack<=0)P.airAttack=false;
 P.st=Math.min(P.maxSt,P.st+(P.block>0?8:29)*dt);P.anim+=dt;

 checkpoints.forEach((x,i)=>{if(i>checkpoint&&Math.abs(P.x-x)<70){checkpoint=i;note("CHECKPOINT "+(i+1));save()}});
 pickups.forEach(p=>{if(!p.taken&&overlap(P,p)){
  p.taken=true;relicCount++;
  if(p.type===0){P.baseHp+=15;frag()}if(p.type===1)P.speed+=18;
  if(p.type===2){P.maxSt+=20;P.st=P.maxSt}if(p.type===3)P.jump+=35;
  note(["FRAMMENTO VITALE","PASSO DEL VENTO","SIGILLO D'ESSENZA","MARCHIO DEL SALTO"][p.type]);save();
 }});

 cameraX+=((P.x-canvas.width*.4)-cameraX)*Math.min(1,dt*5.6);
 cameraX=Math.max(0,Math.min(WORLD-canvas.width,cameraX));
 comboTimer=Math.max(0,comboTimer-dt);
 if(comboTimer<=0&&comboCount>0){comboCount=0;ui.combo.textContent=0;ui.comboFlash.classList.remove("on")}
}

function updateE(dt){
 enemies.forEach(e=>{
  if(e.dead)return;e.attackCd=Math.max(0,e.attackCd-dt);e.hurt=Math.max(0,e.hurt-dt);e.anim+=dt;
  const d=P.x-e.x;
  if(e.type==="boss"){
   if(difficulty==="fractured"){const r=e.hp/e.maxHp;e.phase=r>.66?1:r>.33?2:3}else e.phase=e.hp/e.maxHp>.5?1:2;
   e.dir=Math.sign(d)||-1;if(Math.abs(d)>125)e.vx=e.dir*[0,108,160,220][e.phase];else e.vx*=.8;
   if(e.attackCd<=0&&Math.abs(d)<200){
    e.attackCd=[0,1.5,1.0,.68][e.phase];const reach=e.phase===3?235:170;
    const hit={x:e.dir>0?e.x+e.w:e.x-reach,y:e.y+25,w:reach,h:82};
    if(overlap(hit,P))damagePlayer(16+e.phase*6,e.x);
    burst(e.x+40,e.y+50,e.phase===3?"#cf8cff":"#895faf",14+e.phase*4);
   }
  }else if(e.type==="hound"){
   if(Math.abs(d)<620){e.dir=Math.sign(d)||e.dir;e.vx=e.dir*150}else e.vx*=.85;
   if(Math.abs(d)<50&&e.attackCd<=0){e.attackCd=.88;damagePlayer(e.damage,e.x)}
  }else if(e.type==="cultist"){
   if(Math.abs(d)<480&&e.attackCd<=0){
    e.attackCd=1.7;projectiles.push({x:e.x+16,y:e.y+18,w:8,h:8,vx:Math.sign(d)*250,life:3});
   }
   e.vx*=.9;
  }else{
   if(Math.abs(d)<560){e.dir=Math.sign(d)||e.dir;e.vx=e.dir*90}else e.vx*=.82;
   if(Math.abs(d)<58&&e.attackCd<=0){e.attackCd=1.12;damagePlayer(e.damage,e.x)}
  }
  e.vy+=1700*dt;solve(e,dt);
 });
}

function updateProjectiles(dt){
 for(let i=projectiles.length-1;i>=0;i--){
  const p=projectiles[i];p.x+=p.vx*dt;p.life-=dt;
  if(overlap(p,P)){damagePlayer(11,p.x);projectiles.splice(i,1);continue}
  if(p.life<=0)projectiles.splice(i,1);
 }
}

function updateParticles(dt){
 for(let i=particles.length-1;i>=0;i--){
  const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue}
  p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=560*dt;
 }
}

function drawP(){
 if(P.inv>0&&Math.floor(P.inv*12)%2===0)return;
 let f=0;
 if(Math.abs(P.vx)>25)f=2+(Math.floor(P.anim*8)%2);
 if(!P.onGround)f=P.vy<0?4:5;
 if(P.attack>0){
  if(P.airAttack)f=9;
  else f=[0,6,7,8][P.comboStep]||6;
 }
 if(P.dodge>0)f=10;if(P.block>0)f=11;if(P.skillCd>3.65)f=12;if(P.landTimer>0)f=14;
 ctx.save();ctx.translate(P.x+16,P.y);ctx.scale(P.facing,1);ctx.drawImage(images.kael,f*32,0,32,48,-16,0,32,48);ctx.restore();
}

function drawE(e){
 if(e.hurt>0)ctx.globalAlpha=.5;
 if(e.type==="boss")ctx.drawImage(images.boss,(e.phase-1)*80,0,80,112,e.x,e.y,80,112);
 else if(e.type==="hound"){const f=Math.floor(e.anim*8)%4;ctx.drawImage(images.hound,f*40,0,40,32,e.x,e.y,40,32)}
 else if(e.type==="cultist"){const f=Math.floor(e.anim*5)%4;ctx.drawImage(images.cultist,f*32,0,32,48,e.x,e.y,32,48)}
 else{const f=Math.floor(e.anim*7)%4;ctx.drawImage(images.soldier,f*32,0,32,48,e.x,e.y,32,48)}
 ctx.globalAlpha=1;
}

function draw(){
 ctx.drawImage(images.background,0,0,960,540);
 const fog=(cameraX*.1)%960;ctx.globalAlpha=.08;ctx.drawImage(images.background,-fog,0,960,540);ctx.globalAlpha=1;
 ctx.save();
 if(shake>0){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.84;if(shake<.4)shake=0}
 ctx.translate(-cameraX,0);
 platforms.forEach((p,i)=>{const tx=(i%8)*16;for(let x=p.x;x<p.x+p.w;x+=16)for(let y=p.y;y<p.y+p.h;y+=16)ctx.drawImage(images.tiles,tx,0,16,16,x,y,16,16)});
 checkpoints.forEach((x,i)=>{ctx.fillStyle=i<=checkpoint?"#69adff":"#505867";ctx.fillRect(x+10,360,5,48)});
 pickups.forEach(p=>{if(!p.taken)ctx.drawImage(images.relics,p.type*24,0,24,24,p.x,p.y,24,24)});
 enemies.forEach(e=>{if(!e.dead)drawE(e)});
 projectiles.forEach(p=>{ctx.fillStyle="#b06cff";ctx.fillRect(p.x,p.y,p.w,p.h);ctx.globalAlpha=.25;ctx.fillRect(p.x-8,p.y,p.w,p.h);ctx.globalAlpha=1});
 drawP();
 particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,4,4)});
 ctx.globalAlpha=1;ctx.restore();
 if(victory){
  ctx.fillStyle="rgba(4,6,10,.78)";ctx.fillRect(0,0,960,540);ctx.textAlign="center";
  ctx.fillStyle="#eef4ff";ctx.font="bold 42px Georgia";ctx.fillText("IL BOSCO È SOPRAVVISSUTO",480,225);
  ctx.font="18px system-ui";ctx.fillStyle="#aeb9ca";ctx.fillText("La Frattura si è spezzata, ma Asterra non è ancora salva.",480,265);
  ctx.fillText("Anime: "+souls+" · Reliquie: "+relicCount+"/4",480,300);
 }
}

function hud(){
 ui.hpBar.style.width=Math.max(0,P.hp/P.maxHp*100)+"%";ui.hpText.textContent=Math.ceil(P.hp)+"/"+P.maxHp;
 ui.stBar.style.width=P.st/P.maxSt*100+"%";ui.stText.textContent=Math.ceil(P.st)+"/"+P.maxSt;
 ui.souls.textContent=souls;ui.deaths.textContent=deaths;ui.relics.textContent=relicCount;ui.combo.textContent=comboCount;
 const b=enemies.find(e=>e.type==="boss"&&!e.dead);
 if(b&&P.x>7600){ui.bossBar.style.width=b.hp/b.maxHp*100+"%";ui.bossPhase.textContent="Fase "+b.phase+"/"+(difficulty==="fractured"?3:2)}
 else{ui.bossBar.style.width="0%";ui.bossPhase.textContent="—"}
}

function loop(t){
 const dt=Math.min(.033,(t-last)/1000||0);last=t;
 if(!assetsReady){ctx.fillStyle="#07090d";ctx.fillRect(0,0,960,540);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="24px system-ui";ctx.fillText("Caricamento v5.0...",480,270);requestAnimationFrame(loop);return}
 if(mode==="play"){updateP(dt);updateE(dt);updateProjectiles(dt);updateParticles(dt);hud()}
 draw();requestAnimationFrame(loop);
}

function press(k){
 keys.add(k);if(k==="Space")P.jumpBuffer=.12;if(k==="KeyJ")attack();if(k==="KeyK")dodge();if(k==="KeyL")block();if(k==="KeyQ")skill();
 if(k==="KeyP"){if(mode==="play"){mode="pause";ui.pause.classList.add("visible")}else if(mode==="pause"){mode="play";ui.pause.classList.remove("visible")}}
}

addEventListener("keydown",e=>{if(["Space","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();press(e.code)});
addEventListener("keyup",e=>keys.delete(e.code));
document.querySelectorAll(".mobile button").forEach(b=>{
 const k=b.dataset.key;
 b.addEventListener("pointerdown",e=>{e.preventDefault();b.setPointerCapture(e.pointerId);press(k)});
 b.addEventListener("pointerup",()=>keys.delete(k));b.addEventListener("pointercancel",()=>keys.delete(k));
});

$("newGame").onclick=()=>start(false);$("continueGame").onclick=()=>start(true);
$("resume").onclick=()=>{mode="play";ui.pause.classList.remove("visible")};
$("quit").onclick=()=>{save();mode="menu";ui.pause.classList.remove("visible");ui.menu.classList.add("visible")};
$("controlsBtn").onclick=()=>{ui.menu.classList.remove("visible");ui.controls.classList.add("visible")};
$("closeControls").onclick=()=>{ui.controls.classList.remove("visible");ui.menu.classList.add("visible")};

ui.continueGame.disabled=!localStorage.getItem("eclipseV5");
reset();frag();hud();loadAssets(()=>note("PROJECT ECLIPSE v5.0 PRONTO"));requestAnimationFrame(loop);
})();