const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const startScreen = document.querySelector('#startScreen');
const gameOverScreen = document.querySelector('#gameOver');
const finalScore = document.querySelector('#finalScore');
const pauseScreen = document.querySelector('#pauseScreen');
const pauseButton = document.querySelector('#pauseButton');
let W=0,H=0,DPR=1, playing=false, paused=false, last=0, elapsed=0, spawnClock=0, distance=0, score=0, shake=0;
let audioOn=true, audioCtx=null, musicClock=0, musicStep=0, worldSpeed=1;
const state = { playerX:0, targetX:0, soldiers:3, weaponType:'RIFLE', weaponLevel:0, hp:100, fireClock:0, objects:[], bullets:[], particles:[], popups:[], laneFlash:[0,0] };
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
  Object.assign(state,{playerX:laneX(0),targetX:laneX(0),soldiers:3,weaponType:'RIFLE',weaponLevel:0,hp:100,fireClock:0,objects:[],bullets:[],particles:[],popups:[],laneFlash:[0,0]});
  elapsed=spawnClock=distance=score=shake=musicClock=musicStep=0; playing=true; paused=false; last=performance.now();
  ensureAudio();
}
async function begin(){ reset(); startScreen.classList.add('hidden'); gameOverScreen.classList.add('hidden');pauseScreen.classList.add('hidden');pauseButton.textContent='Ⅱ';await ensureAudio();playAdventureChord();requestAnimationFrame(loop); }
document.querySelector('#startButton').onclick=begin; document.querySelector('#retryButton').onclick=begin;
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
  const rank=weaponRanks[state.weaponType],armyPressure=Math.max(0,state.soldiers-3),upgradePressure=1+state.weaponLevel*.18;
  if(type==='enemy'){const armor=12+Math.floor(elapsed*1.5)+Math.floor(armyPressure*5*(1+rank*.2)*upgradePressure);Object.assign(data,{hp:armor,maxHp:armor,r:18,speed:46+elapsed*.3});}
  if(type==='boss'){const armor=160+Math.floor(elapsed*5)+Math.floor(state.soldiers*18*(1+rank*.15)*upgradePressure);Object.assign(data,{hp:armor,maxHp:armor,r:33,speed:27});}
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
    const swarm=10+Math.min(10,Math.floor(elapsed/25));
    for(let i=0;i<swarm;i++)addObject(danger,i%7===6?'boss':'enemy',-55-i*39);
    popup(W/2,H*.24,'強武器か、大群撃破か！','#ffca48');
  }
  else if(roll<.28){addObject(safe,'monument'); for(let i=0;i<4;i++)addObject(danger,'enemy', -70-i*52);}
  else if(roll<.45){addObject(safe,'weapon'); addObject(danger,Math.random()<.35?'boss':'enemy');}
  else if(roll<.53){addObject(safe,'plus');addObject(danger,Math.random()<.7?'minus':'enemy');}
  else {for(let i=0;i<Math.min(6,2+Math.floor(elapsed/28));i++)addObject(danger,'enemy', -55-i*52); if(Math.random()<.22)addObject(safe,'plus');}
}
function burst(x,y,color,n=10){for(let i=0;i<n;i++)state.particles.push({x,y,vx:rand(-90,90),vy:rand(-90,60),life:rand(.25,.6),color,size:rand(2,5)});}
function popup(x,y,text,color='#fff'){state.popups.push({x,y,text,color,life:1});}
function shoot(){
  const machine=state.weaponType==='MACHINEGUN',laser=state.weaponType==='LASER',plasma=state.weaponType==='PLASMA';
  const guns=Math.min(state.soldiers,60), cols=Math.min(guns,10); for(let i=0;i<guns;i++){
    const col=i%cols,row=Math.floor(i/cols),off=(col-(Math.min(cols,guns-row*cols)-1)/2)*7;
    const base=(machine?1.05:laser?2.8:plasma?3.2:1.15)*(1+state.weaponLevel*.22);
    state.bullets.push({x:state.playerX+off,y:H-105-row*5,vy:laser?-720:plasma?-650:-580,damage:base*(state.soldiers>20?1.2:1),pierce:laser?4:plasma?2+state.weaponLevel:1,level:state.weaponLevel,weapon:state.weaponType});
  }
  tone(115,.012,'sawtooth');
}
function destroy(o){
  o.dead=true; score+=o.type==='boss'?250:o.type==='enemy'?35:100;
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
  burst(o.x,o.y,o.type==='enemy'||o.type==='boss'?'#ff765f':'#68f2cc',o.r); shake=o.type==='boss'?10:4;
}
function collidePlayer(o){
  if(Math.abs(o.x-state.playerX)>W*.18)return;
  if(o.type==='plus'||o.type==='minus'){
    state.soldiers=clamp(state.soldiers+o.value,1,60);popup(o.x,H-150,`${o.value>0?'+':''}${o.value} 兵士`,o.value>0?'#75ffc9':'#ff6572');tone(o.value>0?640:140,.06);o.dead=true;burst(o.x,o.y,o.value>0?'#75ffc9':'#ff6572',14);
  } else {
    const damage=o.type==='boss'?35:12;state.hp-=damage;state.soldiers=Math.max(1,state.soldiers-(o.type==='boss'?2:1));popup(o.x,H-155,`-${damage} 防衛力`,'#ff626d');o.dead=true;shake=14;tone(70,.11,'sawtooth');
  }
}
function breach(o){
  if(o.dead||!['enemy','boss'].includes(o.type))return;
  const damage=o.type==='boss'?28:8;state.hp-=damage;o.dead=true;shake=9;
  popup(o.x,H-55,`突破！ -${damage}`,'#ff626d');burst(o.x,H-30,'#ff4c5d',12);tone(75,.1,'sawtooth');
}
function update(dt){
  elapsed+=dt;distance+=dt*7;spawnClock-=dt;shake*=.86; state.playerX+=(state.targetX-state.playerX)*Math.min(1,dt*12);updateMusic(dt);
  state.fireClock-=dt; if(state.fireClock<=0){shoot();const weaponRate=state.weaponType==='MACHINEGUN'?.48:state.weaponType==='LASER'?1.18:1;state.fireClock=Math.max(.065,(.25-state.soldiers*.0065)*weaponRate);}
  if(spawnClock<=0){spawnWave();spawnClock=Math.max(2.05,3.7-elapsed*.01);}
  state.laneFlash=state.laneFlash.map(v=>Math.max(0,v-dt));
  for(const b of state.bullets){b.y+=b.vy*dt;for(const o of state.objects){if(o.dead||['plus','minus'].includes(o.type))continue;if(Math.abs(b.x-o.x)<o.r&&Math.abs(b.y-o.y)<o.r){o.hp-=b.damage;o.hit=.08;b.pierce--;if(b.pierce<=0)b.dead=true;burst(b.x,b.y,b.level?'#6de7ff':'#ffe491',b.level?4:2);if(o.hp<=0)destroy(o);if(b.dead)break;}}}
  state.bullets=state.bullets.filter(b=>!b.dead&&b.y>-20);
  for(const o of state.objects){o.y+=o.speed*dt;o.hit=Math.max(0,o.hit-dt);if(o.y>H-130)collidePlayer(o);if(o.y>H+12)breach(o);}
  state.objects=state.objects.filter(o=>!o.dead&&o.y<H+80);
  for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=130*dt;p.life-=dt;} state.particles=state.particles.filter(p=>p.life>0);
  for(const p of state.popups){p.y-=28*dt;p.life-=dt;}state.popups=state.popups.filter(p=>p.life>0);
  if(state.hp<=0){playing=false;finalScore.textContent=`到達距離 ${Math.floor(distance)}m ・ スコア ${score}`;gameOverScreen.classList.remove('hidden');}
}
function rect(x,y,w,h,r=8){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawRoad(){
  const horizon=H*.09, bottom=H*1.05;ctx.fillStyle='#08151d';ctx.fillRect(0,0,W,H);
  const sky=ctx.createLinearGradient(0,0,0,H*.45);sky.addColorStop(0,'#17303a');sky.addColorStop(1,'#08151d');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H*.48);
  ctx.fillStyle='#112931';for(let i=0;i<9;i++){const x=(i*83-distance*3)% (W+100)-50;ctx.beginPath();ctx.moveTo(x,horizon+40);ctx.lineTo(x+30,horizon-20);ctx.lineTo(x+60,horizon+40);ctx.fill();}
  for(let lane=0;lane<2;lane++){
    const cx=laneX(lane);ctx.beginPath();ctx.moveTo(cx-W*.12,horizon);ctx.lineTo(cx-W*.24,bottom);ctx.lineTo(cx+W*.24,bottom);ctx.lineTo(cx+W*.12,horizon);ctx.closePath();ctx.fillStyle=lane?'#18282e':'#1b2c32';ctx.fill();
    ctx.strokeStyle='rgba(115,184,187,.12)';ctx.lineWidth=2;for(let i=0;i<9;i++){const t=((i/9+distance*.006)%1);const y=horizon+(bottom-horizon)*t*t;const half=W*(.12+.12*t);ctx.beginPath();ctx.moveTo(cx-half,y);ctx.lineTo(cx+half,y);ctx.stroke();}
    ctx.strokeStyle='rgba(152,217,214,.34)';ctx.setLineDash([18,18]);ctx.beginPath();ctx.moveTo(cx,horizon);ctx.lineTo(cx,bottom);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.fillStyle='rgba(2,8,12,.6)';ctx.fillRect(W*.49,horizon,2,H);
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
  if(o.type==='enemy'||o.type==='boss'){
    drawMonster(o,flash);
  } else if(o.type==='plus'||o.type==='minus'){
    const good=o.type==='plus';ctx.shadowBlur=22;ctx.shadowColor=good?'#43f1b0':'#ff435f';ctx.fillStyle=good?'#28c98f':'#df3c55';rect(-W*.16,-25,W*.32,50,6);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font='900 25px Noto Sans JP';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`${good?'+':''}${o.value} 兵士`,0,0);
  } else {
    ctx.fillStyle=flash?'#fff':o.type==='monument'?'#26aeb1':'#d9962c';rect(-o.r,-o.r,o.r*2,o.r*2,8);ctx.fill();ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(-o.r+7,-o.r+7,o.r*2-14,o.r*2-14);ctx.fillStyle='#eafdf8';ctx.font='900 10px Noto Sans JP';ctx.textAlign='center';ctx.fillText(o.label,0,-8);ctx.font='900 21px Noto Sans JP';ctx.fillText(Math.max(0,Math.ceil(o.hp)),0,14);
  }
  if(!['plus','minus'].includes(o.type)){
    ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(-o.r,-o.r-12,o.r*2,5);ctx.fillStyle=o.type==='enemy'||o.type==='boss'?'#ff595c':'#5ef0c0';ctx.fillRect(-o.r,-o.r-12,o.r*2*clamp(o.hp/o.maxHp,0,1),5);
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
  ctx.textAlign='right';ctx.fillStyle='#ffca48';ctx.font='900 17px Noto Sans JP';ctx.fillText(`${Math.floor(distance)}m`,W-18,40);ctx.fillStyle='#829ba0';ctx.font='700 10px Noto Sans JP';ctx.fillText(`SCORE ${score}`,W-18,60);ctx.textAlign='left';
}
function draw(){
  ctx.save();drawRoad();
  const select=state.targetX<W/2?0:1;ctx.fillStyle='rgba(68,238,190,.035)';ctx.fillRect(select?W/2:0,0,W/2,H);
  for(const o of state.objects.sort((a,b)=>a.y-b.y))drawObject(o);
  for(const b of state.bullets){
    const energy=b.weapon==='LASER'||b.weapon==='PLASMA',machine=b.weapon==='MACHINEGUN';ctx.fillStyle=energy?'#68e8ff':machine?'#ffc95f':'#ffe98e';ctx.shadowBlur=energy?9:0;ctx.shadowColor='#57dfff';
    ctx.fillRect(b.x-(energy?2:1),b.y,energy?5:3,b.weapon==='LASER'?25:energy?17:12);
  }ctx.shadowBlur=0;
  const count=Math.min(state.soldiers,60), columns=count<=8?count:count<=16?8:count<=36?12:15;
  const unitScale=count<=12?.9:count<=24?.72:count<=40?.6:.5, gapX=18*unitScale, gapY=17*unitScale;
  for(let i=count-1;i>=0;i--){const row=Math.floor(i/columns),col=i%columns,cols=Math.min(columns,count-row*columns);drawUnit(state.playerX+(col-(cols-1)/2)*gapX,H-67-row*gapY,unitScale);}
  for(const p of state.particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);}ctx.globalAlpha=1;
  for(const p of state.popups){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.font='900 18px Noto Sans JP';ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y);}ctx.globalAlpha=1;ctx.textAlign='left';drawHUD();ctx.restore();
}
function loop(now){if(!playing)return;const realDt=Math.min(.033,(now-last)/1000),gameDt=realDt*worldSpeed*1.25;last=now;if(!paused)update(gameDt);draw();if(playing)requestAnimationFrame(loop);}
draw();
