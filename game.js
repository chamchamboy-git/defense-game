const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const startScreen = document.querySelector('#startScreen');
const gameOverScreen = document.querySelector('#gameOver');
const finalScore = document.querySelector('#finalScore');
const victoryScreen = document.querySelector('#victoryScreen');
const victoryScore = document.querySelector('#victoryScore');
const pauseScreen = document.querySelector('#pauseScreen');
const pauseButton = document.querySelector('#pauseButton');
let W=0,H=0,DPR=1, playing=false, paused=false, last=0, elapsed=0, spawnClock=0, distance=0, score=0, shake=0;
let stage=1,wave=0,stagePhase='waves',stageDelay=0,stageBanner=0;
const wavesPerStage=[4,5,6];
let audioOn=true, audioCtx=null, musicClock=0, musicStep=0, worldSpeed=1;
const state = { playerX:0, targetX:0, soldiers:3, weaponType:'RIFLE', weaponLevel:0, hp:100, fireClock:0, objects:[], bullets:[], enemyBullets:[], particles:[], popups:[], laneFlash:[0,0] };
const laneX = i => W * (i ? .69 : .31);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const rand = (a,b) => a+Math.random()*(b-a);

function resize(){
  const r=canvas.getBoundingClientRect(); DPR=Math.min(devicePixelRatio||1,2); W=r.width; H=r.height;
  canvas.width=W*DPR; canvas.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0);
  if(!state.playerX) state.playerX=state.targetX=laneX(0);
}
addEventListener('resize',resize); resize();

function reset(){
  Object.assign(state,{playerX:laneX(0),targetX:laneX(0),soldiers:3,weaponType:'RIFLE',weaponLevel:0,hp:100,fireClock:0,objects:[],bullets:[],enemyBullets:[],particles:[],popups:[],laneFlash:[0,0]});
  elapsed=spawnClock=distance=score=shake=musicClock=musicStep=0;stage=1;wave=0;stagePhase='waves';stageDelay=0;stageBanner=2.4;playing=true;paused=false;last=performance.now();
  ensureAudio();
}
async function begin(){reset();startScreen.classList.add('hidden');gameOverScreen.classList.add('hidden');victoryScreen.classList.add('hidden');pauseScreen.classList.add('hidden');pauseButton.textContent='Ⅱ';await ensureAudio();playAdventureChord();requestAnimationFrame(loop);}
document.querySelector('#startButton').onclick=begin;document.querySelector('#retryButton').onclick=begin;document.querySelector('#victoryRetryButton').onclick=begin;
document.querySelector('#soundButton').onclick=()=>{audioOn=!audioOn;ensureAudio();document.querySelector('#soundButton').textContent=audioOn?'♪':'×';};
const speedChoices=[...document.querySelectorAll('.speedChoice')];
function setWorldSpeed(next){worldSpeed=clamp(next,1,3);speedChoices.forEach(button=>button.classList.toggle('active',Number(button.dataset.speed)===worldSpeed));}
speedChoices.forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();setWorldSpeed(Number(button.dataset.speed));}));
setWorldSpeed(1);

function togglePause(){
  if(!playing)return;paused=!paused;pauseScreen.classList.toggle('hidden',!paused);pauseButton.textContent=paused?'▶':'Ⅱ';last=performance.now();
  if(!paused){ensureAudio();musicClock=0;}
}
pauseButton.addEventListener('click',e=>{e.stopPropagation();togglePause();});

async function ensureAudio(){
  if(!audioOn)return; audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended')await audioCtx.resume();
}

function tone(freq=.2,vol=.025,type='square'){
  if(!audioOn)return; audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
  const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.type=type;o.frequency.value=freq;g.gain.value=vol;
  o.connect(g);g.connect(audioCtx.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.08);o.stop(audioCtx.currentTime+.09);
}
function musicTone(freq,duration=.32,vol=.018,type='triangle'){
  if(!audioOn||!playing)return;ensureAudio();const now=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(vol,now+.025);g.gain.exponentialRampToValueAtTime(.0001,now+duration);
  o.connect(g);g.connect(audioCtx.destination);o.start(now);o.stop(now+duration+.03);
}
function playAdventureChord(){
  if(!audioOn)return;[110,164.81,220,261.63].forEach((note,i)=>musicTone(note,1.25,i===0?.045:.025,i===0?'sine':'triangle'));
}
function updateMusic(dt){
  if(!audioOn)return;musicClock-=dt;if(musicClock>0)return;musicClock=.27;
  const melody=[220,261.63,329.63,293.66,220,392,329.63,293.66,196,246.94,293.66,329.63,196,369.99,329.63,246.94];
  musicTone(melody[musicStep%melody.length],.25,.032,'triangle');
  if(musicStep%4===0)musicTone([110,98,87.31,98][Math.floor(musicStep/4)%4],.85,.052,'sine');
  if(musicStep%2===0)musicTone(65,.07,.028,'square');musicStep++;
}
function chooseLane(x){ state.targetX=laneX(x<W/2?0:1); }
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);chooseLane(e.offsetX)});
canvas.addEventListener('pointermove',e=>{if(e.buttons)chooseLane(e.offsetX)});
addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();togglePause();return;}if(paused)return;if(e.key==='ArrowLeft'||e.key==='a')state.targetX=laneX(0);if(e.key==='ArrowRight'||e.key==='d')state.targetX=laneX(1)});

const weaponRanks={RIFLE:0,MACHINEGUN:1,LASER:2,PLASMA:3};
function currentWeaponName(){return state.weaponType==='MACHINEGUN'?'MACHINE GUN':state.weaponType==='LASER'?'LASER BEAM':state.weaponType==='PLASMA'?'PLASMA':'RIFLE';}

function addObject(lane,type,y=-80){
  const data={lane,type,x:laneX(lane),y,hit:0,dead:false};
  const rank=weaponRanks[state.weaponType],armyPressure=Math.max(0,state.soldiers-3),upgradePressure=1+state.weaponLevel*.18,stageFactor=1+(stage-1)*.3;
  if(type==='swarm'){const armor=Math.floor((4+elapsed*.21+armyPressure*.98*upgradePressure)*stageFactor);Object.assign(data,{hp:armor,maxHp:armor,r:12,speed:55+(stage-1)*3+elapsed*.1});}
  if(type==='enemy'){const armor=Math.floor((11+elapsed*.78+armyPressure*3.8*(1+rank*.2)*upgradePressure)*stageFactor);Object.assign(data,{hp:armor,maxHp:armor,r:18,speed:41+(stage-1)*3+elapsed*.15});}
  if(type==='boss'){const armor=Math.floor((350+elapsed*6+state.soldiers*27*(1+rank*.2)*upgradePressure)*stageFactor);Object.assign(data,{hp:armor,maxHp:armor,r:46,speed:22});}
  if(type==='weapon'){
    const next=rank===0?'MACHINEGUN':rank===1?'LASER':'PLASMA';
    const armor=next==='MACHINEGUN'?95:next==='LASER'?180:300+state.weaponLevel*90;
    Object.assign(data,{hp:armor,maxHp:armor,r:next==='PLASMA'?40:34,speed:35,label:next==='MACHINEGUN'?'M-GUN':next,weapon:next,weaponRank:weaponRanks[next]});
  }
  if(type==='monument')Object.assign(data,{hp:60+Math.floor(elapsed*.7),maxHp:60+Math.floor(elapsed*.7),r:40,speed:30,label:'ARSENAL'});
  if(type==='superweapon')Object.assign(data,{hp:300,maxHp:300,r:44,speed:24,label:'PLASMA',super:true});
  if(type==='plus')Object.assign(data,{hp:1,maxHp:1,r:28,speed:50,value:Math.random()<.08?2:1});
  if(type==='minus')Object.assign(data,{hp:1,maxHp:1,r:28,speed:50,value:-1});
  state.objects.push(data);
}
function spawnWave(){
  const safe=Math.random()<.5?0:1, danger=1-safe, roll=Math.random();
  if(elapsed>25&&roll<.14){
    addObject(safe,'superweapon',-70);
    const swarm=18+Math.min(16,Math.floor(elapsed/16));
    for(let i=0;i<swarm;i++)addObject(danger,i%5===4?'enemy':'swarm',-45-i*27);
    popup(W/2,H*.24,'強武器か、大群撃破か！','#ffca48');
  }
  else if(roll<.28){addObject(safe,'monument');for(let i=0;i<12+Math.min(8,Math.floor(elapsed/25));i++)addObject(danger,i%6===5?'enemy':'swarm',-50-i*29);}
  else if(roll<.45){addObject(safe,'weapon');for(let i=0;i<10+Math.min(8,Math.floor(elapsed/30))+(stage-1)*2;i++)addObject(danger,i%5===4?'enemy':'swarm',-48-i*31);}
  else if(roll<.53){addObject(safe,'plus');addObject(danger,Math.random()<.7?'minus':'enemy');}
  else {
    const mainCount=11+Math.min(15,Math.floor(elapsed/15))+(stage-1)*3;
    for(let i=0;i<mainCount;i++)addObject(danger,i%8===7?'enemy':'swarm',-45-i*28);
    const sideCount=3+Math.min(6,Math.floor(elapsed/35));for(let i=0;i<sideCount;i++)addObject(safe,'swarm',-90-i*42);
    if(Math.random()<.15)addObject(safe,'plus',-65-sideCount*42);
  }
}
function livingThreats(){return state.objects.some(o=>!o.dead&&['swarm','enemy','boss'].includes(o.type));}
function spawnStageBoss(){
  const lane=Math.random()<.5?0:1;addObject(lane,'boss',-95);const boss=state.objects.at(-1),multipliers=[1.8,2.7,4.1];
  boss.stageBoss=true;boss.hp=Math.floor(boss.hp*multipliers[stage-1]);boss.maxHp=boss.hp;boss.r=52+stage*7;boss.y=-boss.r*.18;boss.speed=15+stage;boss.attackClock=1.65;boss.spawnShield=1;
  stagePhase='boss';stageBanner=2.2;popup(W/2,H*.28,`WARNING — BOSS 1-${stage}`,'#ff625f');tone(58,.14,'sawtooth');
  shootBossFireball(boss);
}
function finishStage(){
  score+=stage*1000;state.bullets=[];state.enemyBullets=[];stageBanner=2.7;
  if(stage===3){playAdventureChord();playing=false;victoryScore.textContent=`全3ステージ制覇 ・ スコア ${score}`;victoryScreen.classList.remove('hidden');return;}
  stagePhase='transition';stageDelay=2.7;popup(W/2,H*.31,`STAGE 1-${stage} CLEAR`,'#68efbf');tone(760,.1,'triangle');
}
function startNextStage(){
  stage++;wave=0;stagePhase='waves';spawnClock=1.35;stageBanner=2.4;state.hp=Math.min(100,state.hp+30);state.objects=[];state.bullets=[];state.enemyBullets=[];playAdventureChord();
}
function burst(x,y,color,n=10){for(let i=0;i<n;i++)state.particles.push({x,y,vx:rand(-90,90),vy:rand(-90,60),life:rand(.25,.6),color,size:rand(2,5)});}
function popup(x,y,text,color='#fff'){state.popups.push({x,y,text,color,life:1});}
function shoot(){
  const machine=state.weaponType==='MACHINEGUN',laser=state.weaponType==='LASER',plasma=state.weaponType==='PLASMA';
  const guns=Math.min(state.soldiers,60), cols=guns<=6?2:guns<=12?3:guns<=24?6:10; for(let i=0;i<guns;i++){
    const col=i%cols,row=Math.floor(i/cols),off=(col-(Math.min(cols,guns-row*cols)-1)/2)*7;
    const base=(machine?1.05:laser?2.8:plasma?3.2:1.15)*(1+state.weaponLevel*.22);
    state.bullets.push({x:state.playerX+off,y:H-105-row*5,vy:laser?-720:plasma?-650:-580,damage:base*(state.soldiers>20?1.2:1),pierce:laser?4:plasma?2+state.weaponLevel:1,level:state.weaponLevel,weapon:state.weaponType});
  }
  tone(115,.012,'sawtooth');
}
function shootBossFireball(boss){
  const startY=boss.y+boss.r*.55,targetY=H-72,travelTime=Math.max(.85,(targetY-startY)/(230+stage*18));
  const vx=clamp((state.playerX-boss.x)/travelTime,-175,175);
  state.enemyBullets.push({x:boss.x,y:startY,vx,vy:230+stage*18,r:10+stage,life:4,damage:5+stage*2});
  popup(boss.x,boss.y-boss.r,'火炎弾！','#ff9b45');burst(boss.x,startY,'#ff7138',18);tone(92,.12,'sawtooth');
}
function destroy(o){
  o.dead=true; score+=o.type==='boss'?250:o.type==='enemy'?35:o.type==='swarm'?12:100;
  if(o.stageBoss){burst(o.x,o.y,'#ff765f',80);finishStage();return;}
  if(o.type==='superweapon'){
    const wasPlasma=state.weaponType==='PLASMA';
    state.weaponType='PLASMA';state.weaponLevel=wasPlasma?clamp(state.weaponLevel+1,1,8):1;score+=500;
    popup(o.x,o.y,`PLASMA LV.${state.weaponLevel} 獲得！`,'#73ddff');
    playAdventureChord();burst(o.x,o.y,'#68dfff',55);shake=16;return;
  }
  if(o.type==='weapon'){
    const currentRank=weaponRanks[state.weaponType];
    if(o.weaponRank>currentRank){state.weaponType=o.weapon;state.weaponLevel=1;}
    else {state.weaponLevel=clamp(state.weaponLevel+1,1,8);}
    score+=250;const name=currentWeaponName();
    popup(o.x,o.y,`${name} LV.${state.weaponLevel}！`,state.weaponType==='MACHINEGUN'?'#ffd36d':'#6de9ff');
    burst(o.x,o.y,state.weaponType==='MACHINEGUN'?'#ffc85a':'#64e8ff',30);tone(state.weaponType==='MACHINEGUN'?420:760,.09,'sawtooth');return;
  }
  const reward=o.type==='monument'?3:0;
  if(reward){state.soldiers=clamp(state.soldiers+reward,1,60);popup(o.x,o.y,`部隊 +${reward}`,'#76f6c2');tone(520,.07,'triangle');}
  burst(o.x,o.y,['swarm','enemy','boss'].includes(o.type)?'#ff765f':'#68f2cc',o.r); shake=o.type==='boss'?10:4;
}
function collidePlayer(o){
  if(o.type==='plus'||o.type==='minus'){
    // ゲートは兵士の判定線を横切った瞬間だけ判定する。
    // 見送った後にレーン移動しても、遡って取得されないようにする。
    if(o.gateResolved)return;
    o.gateResolved=true;
    if(Math.abs(o.x-state.playerX)>W*.18)return;
    state.soldiers=clamp(state.soldiers+o.value,1,60);popup(o.x,H-150,`${o.value>0?'+':''}${o.value} 兵士`,o.value>0?'#75ffc9':'#ff6572');tone(o.value>0?640:140,.06);o.dead=true;burst(o.x,o.y,o.value>0?'#75ffc9':'#ff6572',14);
  } else {
    if(Math.abs(o.x-state.playerX)>W*.18)return;
    if(o.type==='boss'){
      state.hp=0;o.dead=true;state.enemyBullets=[];popup(o.x,H-155,'ボス侵入！ 防衛線崩壊','#ff3f50');burst(o.x,H-115,'#ff3f38',48);shake=18;tone(48,.18,'sawtooth');return;
    }
    const damage=9;state.hp-=damage;state.soldiers=Math.max(1,state.soldiers-1);popup(o.x,H-155,`-${damage} 防衛力`,'#ff626d');o.dead=true;shake=14;tone(70,.11,'sawtooth');
  }
}
function breach(o){
  if(o.dead||!['swarm','enemy','boss'].includes(o.type))return;
  if(o.type==='boss'){
    state.hp=0;o.dead=true;state.enemyBullets=[];popup(o.x,H-55,'ボス突破！ 防衛線崩壊','#ff3f50');burst(o.x,H-30,'#ff3f38',48);shake=18;tone(48,.18,'sawtooth');return;
  }
  const damage=o.type==='enemy'?6:2;state.hp-=damage;o.dead=true;shake=9;
  popup(o.x,H-55,`突破！ -${damage}`,'#ff626d');burst(o.x,H-30,'#ff4c5d',12);tone(75,.1,'sawtooth');
}
function update(dt){
  elapsed+=dt;distance+=dt*7;stageBanner=Math.max(0,stageBanner-dt);shake*=.86;state.playerX+=(state.targetX-state.playerX)*Math.min(1,dt*12);updateMusic(dt);
  state.fireClock-=dt; if(state.fireClock<=0){shoot();const weaponRate=state.weaponType==='MACHINEGUN'?.48:state.weaponType==='LASER'?1.18:1;state.fireClock=Math.max(.065,(.25-state.soldiers*.0065)*weaponRate);}
  if(stagePhase==='transition'){stageDelay-=dt;if(stageDelay<=0)startNextStage();}
  if(stagePhase==='waves'){
    spawnClock-=dt;
    if(spawnClock<=0&&wave<wavesPerStage[stage-1]){spawnWave();wave++;spawnClock=Math.max(1.9,3.5-stage*.25);}
    if(wave>=wavesPerStage[stage-1]&&!livingThreats())spawnStageBoss();
  }
  state.laneFlash=state.laneFlash.map(v=>Math.max(0,v-dt));
  for(const b of state.bullets){b.y+=b.vy*dt;for(const o of state.objects){if(o.dead||['plus','minus'].includes(o.type))continue;if(Math.abs(b.x-o.x)<o.r&&Math.abs(b.y-o.y)<o.r){if(o.spawnShield>0){b.dead=true;burst(b.x,b.y,'#8cf5ff',8);break;}o.hp-=b.damage;o.hit=.08;b.pierce--;if(b.pierce<=0)b.dead=true;burst(b.x,b.y,b.level?'#6de7ff':'#ffe491',b.level?4:2);if(o.hp<=0)destroy(o);if(b.dead)break;}}}
  state.bullets=state.bullets.filter(b=>!b.dead&&b.y>-20);
  for(const f of state.enemyBullets){
    f.x+=f.vx*dt;f.y+=f.vy*dt;f.life-=dt;
    if(f.y>H-118&&Math.abs(f.x-state.playerX)<Math.max(30,W*.075)){
      state.hp-=f.damage;f.dead=true;state.soldiers=Math.max(1,state.soldiers-(stage===3?1:0));
      popup(f.x,H-135,`火炎弾 -${f.damage}`,'#ff784f');burst(f.x,H-105,'#ff5b35',28);tone(62,.13,'sawtooth');
    } else if(f.y>H+30)f.dead=true;
  }
  state.enemyBullets=state.enemyBullets.filter(f=>!f.dead&&f.life>0);
  for(const o of state.objects){o.y+=o.speed*dt;o.hit=Math.max(0,o.hit-dt);o.spawnShield=Math.max(0,(o.spawnShield||0)-dt);if(o.y>H-130)collidePlayer(o);if(o.y>H+12)breach(o);}
  for(const o of state.objects){if(o.stageBoss&&!o.dead){o.attackClock-=dt;if(o.attackClock<=0){shootBossFireball(o);o.attackClock=Math.max(1.25,2.35-stage*.28)+Math.random()*.45;}}}
  state.objects=state.objects.filter(o=>!o.dead&&o.y<H+80);
  for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=130*dt;p.life-=dt;} state.particles=state.particles.filter(p=>p.life>0);
  for(const p of state.popups){p.y-=28*dt;p.life-=dt;}state.popups=state.popups.filter(p=>p.life>0);
  if(state.hp<=0){playing=false;finalScore.textContent=`到達距離 ${Math.floor(distance)}m ・ スコア ${score}`;gameOverScreen.classList.remove('hidden');}
}
function rect(x,y,w,h,r=8){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function hash(n){return Math.abs(Math.sin(n*91.733)*43758.5453)%1;}
function drawRoad(){
  const horizon=H*.09, bottom=H*1.05;ctx.fillStyle='#17201a';ctx.fillRect(0,0,W,H);
  const sky=ctx.createLinearGradient(0,0,0,H*.38);sky.addColorStop(0,'#405d61');sky.addColorStop(.55,'#8b8a70');sky.addColorStop(1,'#776748');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H*.38);
  ctx.fillStyle='#344432';for(let i=0;i<9;i++){const x=i*83-50;ctx.beginPath();ctx.moveTo(x,horizon+40);ctx.lineTo(x+30,horizon-20);ctx.lineTo(x+60,horizon+40);ctx.fill();}
  for(let lane=0;lane<2;lane++){
    const cx=laneX(lane);ctx.save();ctx.beginPath();ctx.moveTo(cx-W*.12,horizon);ctx.lineTo(cx-W*.24,bottom);ctx.lineTo(cx+W*.24,bottom);ctx.lineTo(cx+W*.12,horizon);ctx.closePath();ctx.clip();
    const dirt=ctx.createLinearGradient(0,horizon,0,bottom);dirt.addColorStop(0,lane?'#796344':'#806948');dirt.addColorStop(.45,lane?'#695138':'#72583b');dirt.addColorStop(1,lane?'#513a29':'#5d422c');ctx.fillStyle=dirt;ctx.fillRect(cx-W*.25,horizon,W*.5,bottom-horizon);
    // 流れる砂、小石、土の濃淡
    for(let i=0;i<62;i++){
      const t=(i*.163)%1,y=horizon+(bottom-horizon)*t*t,half=W*(.11+.13*t),x=cx+(hash(i+lane*103)*2-1)*half*.9,r=.6+t*3.4;
      ctx.fillStyle=i%5===0?'rgba(45,31,22,.42)':i%3===0?'rgba(194,157,103,.28)':'rgba(93,65,39,.30)';ctx.beginPath();ctx.ellipse(x,y,r*(1+hash(i)*1.5),r*.55,hash(i+8)*3,0,7);ctx.fill();
    }
    // 車輪や足で削れた二本の轍
    ctx.strokeStyle='rgba(54,36,25,.23)';ctx.lineWidth=Math.max(3,W*.014);for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(cx+side*W*.045,horizon);ctx.quadraticCurveTo(cx+side*W*.07,H*.55,cx+side*W*.095,bottom);ctx.stroke();}
    // 地面の横方向のひび
    ctx.strokeStyle='rgba(47,31,20,.3)';ctx.lineWidth=1;for(let i=0;i<8;i++){const t=(i*.217)%1,y=horizon+(bottom-horizon)*t*t,half=W*(.1+.12*t),x=cx+(hash(i+lane*41)*2-1)*half*.65;ctx.beginPath();ctx.moveTo(x-7*t,y);ctx.lineTo(x,y+3*t);ctx.lineTo(x+8*t,y-2*t);ctx.stroke();}
    ctx.restore();
    // 道端の草と石
    for(const side of [-1,1])for(let i=0;i<12;i++){const t=(i*.097)%1,y=horizon+(bottom-horizon)*t*t,edge=W*(.12+.12*t),x=cx+side*(edge+3+t*7);ctx.fillStyle=i%3?'#435038':'#85806a';ctx.beginPath();ctx.ellipse(x,y,1+t*4,1+t*2,0,0,7);ctx.fill();}
  }
  ctx.fillStyle='rgba(35,27,19,.48)';ctx.fillRect(W*.497,horizon,W*.006,H);
}
function drawUnit(x,y,scale=1){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.fillStyle='#102028';ctx.beginPath();ctx.arc(0,-10,5,0,7);ctx.fill();ctx.fillStyle='#58c6a6';ctx.fillRect(-5,-5,10,14);ctx.strokeStyle='#a8e8d2';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(3,-2);ctx.lineTo(10,-9);ctx.stroke();ctx.restore();
}
function drawMonster(o,flash){
  const boss=o.type==='boss',s=o.r/18,t=elapsed*7+o.x;
  ctx.save();ctx.scale(s,s);
  // 接地影と四肢
  ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(0,13,15,5,0,0,7);ctx.fill();
  ctx.strokeStyle=boss?'#39272a':'#354a37';ctx.lineWidth=5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-8,7);ctx.lineTo(-12+Math.sin(t)*2,16);ctx.moveTo(8,7);ctx.lineTo(12-Math.sin(t)*2,16);ctx.moveTo(-11,-1);ctx.lineTo(-17,7);ctx.moveTo(11,-1);ctx.lineTo(17,7);ctx.stroke();
  // 胴体の立体的なグラデーション
  const body=ctx.createRadialGradient(-5,-7,2,0,0,19);body.addColorStop(0,flash?'#fff':boss?'#9a5147':'#728b55');body.addColorStop(.55,flash?'#fff':boss?'#66322f':'#425f3e');body.addColorStop(1,boss?'#26191c':'#172c25');
  ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(0,0,13,16,0,0,7);ctx.fill();
  // 肩の骨板・大型個体の背中のトゲ
  ctx.fillStyle=boss?'#bd7960':'#879775';
  ctx.beginPath();ctx.moveTo(-11,-9);ctx.lineTo(-19,-15);ctx.lineTo(-14,-3);ctx.moveTo(11,-9);ctx.lineTo(19,-15);ctx.lineTo(14,-3);ctx.fill();
  if(boss){ctx.fillStyle='#d19a78';for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*7-3,-12);ctx.lineTo(i*7,-24-Math.abs(i)*2);ctx.lineTo(i*7+4,-12);ctx.fill();}}
  // 顔、発光する目、鼻孔
  ctx.fillStyle=boss?'#4b2627':'#2a4230';ctx.beginPath();ctx.ellipse(0,-5,11,10,0,0,7);ctx.fill();
  ctx.shadowBlur=7;ctx.shadowColor='#ff3d32';ctx.fillStyle='#ff6b42';ctx.beginPath();ctx.ellipse(-4,-7,2.2,1.4,-.2,0,7);ctx.ellipse(4,-7,2.2,1.4,.2,0,7);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#130e0e';ctx.beginPath();ctx.arc(-2,-3,1,0,7);ctx.arc(2,-3,1,0,7);ctx.fill();
  // 口と不揃いな牙
  ctx.fillStyle='#160e10';ctx.beginPath();ctx.ellipse(0,2,7,4,0,0,Math.PI);ctx.fill();ctx.fillStyle='#e4d5aa';
  for(const x of [-4,-1,3]){ctx.beginPath();ctx.moveTo(x,1);ctx.lineTo(x+1,5+Math.abs(x)%2);ctx.lineTo(x+2,1);ctx.fill();}
  ctx.restore();
}
function drawObject(o){
  const flash=o.hit>0;ctx.save();ctx.translate(o.x,o.y);
  if(['swarm','enemy','boss'].includes(o.type)){
    drawMonster(o,flash);
  } else if(o.type==='plus'||o.type==='minus'){
    const good=o.type==='plus';ctx.shadowBlur=22;ctx.shadowColor=good?'#43f1b0':'#ff435f';ctx.fillStyle=good?'#28c98f':'#df3c55';rect(-W*.16,-25,W*.32,50,6);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font='900 25px Noto Sans JP';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`${good?'+':''}${o.value} 兵士`,0,0);
  } else {
    ctx.fillStyle=flash?'#fff':o.type==='monument'?'#26aeb1':'#d9962c';rect(-o.r,-o.r,o.r*2,o.r*2,8);ctx.fill();ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(-o.r+7,-o.r+7,o.r*2-14,o.r*2-14);ctx.fillStyle='#eafdf8';ctx.font='900 10px Noto Sans JP';ctx.textAlign='center';ctx.fillText(o.label,0,-8);ctx.font='900 21px Noto Sans JP';ctx.fillText(Math.max(0,Math.ceil(o.hp)),0,14);
  }
  if(!['plus','minus'].includes(o.type)){
    ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(-o.r,-o.r-12,o.r*2,5);ctx.fillStyle=['swarm','enemy','boss'].includes(o.type)?'#ff595c':'#5ef0c0';ctx.fillRect(-o.r,-o.r-12,o.r*2*clamp(o.hp/o.maxHp,0,1),5);
  }ctx.restore();
}
function drawHUD(){
  const g=ctx.createLinearGradient(0,0,0,90);g.addColorStop(0,'rgba(2,8,12,.92)');g.addColorStop(1,'rgba(2,8,12,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,100);
  ctx.fillStyle='#9bb2b6';ctx.font='800 10px Noto Sans JP';ctx.fillText('防衛力',18,25);ctx.fillStyle='#20383e';rect(18,33,W*.33,10,5);ctx.fill();ctx.fillStyle=state.hp<30?'#ff4d5e':'#62e3b6';rect(18,33,W*.33*clamp(state.hp/100,0,1),10,5);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='900 20px Noto Sans JP';ctx.fillText(`× ${state.soldiers}`,18,70);ctx.fillStyle='#87a2a8';ctx.font='700 10px Noto Sans JP';ctx.fillText('部隊',56,68);
  if(state.weaponType!=='RIFLE'){
    const weaponName=`${currentWeaponName()} LV.${state.weaponLevel}`;
    ctx.fillStyle=state.weaponType==='MACHINEGUN'?'#ffd36d':'#73ddff';ctx.font='900 11px Noto Sans JP';ctx.fillText(weaponName,18,88);
  }
  ctx.textAlign='right';ctx.fillStyle='#ffca48';ctx.font='900 17px Noto Sans JP';ctx.fillText(`STAGE 1-${stage}`,W-18,38);ctx.fillStyle='#aec0c3';ctx.font='800 10px Noto Sans JP';const progress=stagePhase==='boss'?'BOSS':stagePhase==='transition'?'CLEAR':`WAVE ${Math.max(1,wave)}/${wavesPerStage[stage-1]}`;ctx.fillText(progress,W-18,56);ctx.fillStyle='#829ba0';ctx.fillText(`SCORE ${score}`,W-18,72);ctx.textAlign='left';
  const boss=state.objects.find(o=>o.stageBoss&&!o.dead);if(boss){ctx.fillStyle='rgba(0,0,0,.72)';rect(W*.15,101,W*.7,14,7);ctx.fill();ctx.fillStyle='#ff4d55';rect(W*.15,101,W*.7*clamp(boss.hp/boss.maxHp,0,1),14,7);ctx.fill();ctx.fillStyle='#fff';ctx.font='900 9px Noto Sans JP';ctx.textAlign='center';ctx.fillText(`BOSS 1-${stage}  ${Math.max(0,Math.ceil(boss.hp))}`,W/2,112);ctx.textAlign='left';}
}
function draw(){
  ctx.save();drawRoad();
  const select=state.targetX<W/2?0:1;ctx.fillStyle='rgba(68,238,190,.035)';ctx.fillRect(select?W/2:0,0,W/2,H);
  for(const o of state.objects.sort((a,b)=>a.y-b.y))drawObject(o);
  for(const b of state.bullets){
    const energy=b.weapon==='LASER'||b.weapon==='PLASMA',machine=b.weapon==='MACHINEGUN';ctx.fillStyle=energy?'#68e8ff':machine?'#ffc95f':'#ffe98e';ctx.shadowBlur=energy?9:0;ctx.shadowColor='#57dfff';
    const trail=b.weapon==='LASER'?36:energy?24:machine?19:16;ctx.globalAlpha=.23;ctx.fillRect(b.x-(energy?3:2),b.y,energy?7:5,trail);ctx.globalAlpha=1;ctx.fillRect(b.x-(energy?2:1),b.y,energy?5:3,trail*.65);
  }ctx.shadowBlur=0;
  for(const f of state.enemyBullets){
    const glow=ctx.createRadialGradient(f.x-3,f.y-4,1,f.x,f.y,f.r*1.8);glow.addColorStop(0,'#fff1a8');glow.addColorStop(.3,'#ff9b32');glow.addColorStop(.72,'#ef3e22');glow.addColorStop(1,'rgba(150,20,8,0)');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(f.x,f.y,f.r*1.8,0,7);ctx.fill();ctx.fillStyle='#ffdc65';ctx.beginPath();ctx.arc(f.x,f.y,f.r*.72,0,7);ctx.fill();
    ctx.globalAlpha=.45;ctx.fillStyle='#ff512c';ctx.beginPath();ctx.moveTo(f.x-f.r*.7,f.y-f.r);ctx.lineTo(f.x-f.vx*.07,f.y-f.r*3.1);ctx.lineTo(f.x+f.r*.7,f.y-f.r);ctx.fill();ctx.globalAlpha=1;
  }
  const count=Math.min(state.soldiers,60), columns=count<=6?2:count<=12?3:count<=24?6:count<=40?10:15;
  const unitScale=count<=12?.9:count<=24?.72:count<=40?.6:.5, gapX=18*unitScale, gapY=17*unitScale;
  for(let i=count-1;i>=0;i--){const row=Math.floor(i/columns),col=i%columns,cols=Math.min(columns,count-row*columns);drawUnit(state.playerX+(col-(cols-1)/2)*gapX,H-67-row*gapY,unitScale);}
  for(const p of state.particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);}ctx.globalAlpha=1;
  for(const p of state.popups){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.font='900 18px Noto Sans JP';ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y);}ctx.globalAlpha=1;ctx.textAlign='left';drawHUD();
  if(stageBanner>0){const alpha=clamp(stageBanner<.45?stageBanner/.45:1,0,1);ctx.globalAlpha=alpha;ctx.fillStyle='rgba(2,10,14,.72)';ctx.fillRect(0,H*.39,W,H*.15);ctx.fillStyle=stagePhase==='boss'?'#ff615f':'#ffca48';ctx.font='900 34px Black Ops One, Impact';ctx.textAlign='center';ctx.fillText(stagePhase==='boss'?`BOSS 1-${stage}`:stagePhase==='transition'?`1-${stage} CLEAR`:`STAGE 1-${stage}`,W/2,H*.465);ctx.globalAlpha=1;ctx.textAlign='left';}
  ctx.restore();
}
function loop(now){if(!playing)return;const realDt=Math.min(.033,(now-last)/1000),gameDt=realDt*worldSpeed*1.25;last=now;if(!paused)update(gameDt);draw();if(playing)requestAnimationFrame(loop);}
draw();
