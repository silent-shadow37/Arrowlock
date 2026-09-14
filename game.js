const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const KEY="arrowlock_v20";
const todayKey=()=>new Date().toISOString().slice(0,10);
let state=JSON.parse(localStorage.getItem(KEY)||'{"coins":50,"solved":0,"best":0,"level":1,"sound":true,"haptics":true,"dailyGiftDay":"","spinDay":""}');
state.dailyGiftDay=state.dailyGiftDay||"";state.spinDay=state.spinDay||"";
let board={size:9,paths:[]},history=[],seconds=0,timerId=null,daily=false,hearts=3,infoTimer=null;

function save(){localStorage.setItem(KEY,JSON.stringify(state));updateUI()}
function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function dailySeed(){let str=`${todayKey()}|ARROWLOCK|${board.size}`;let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rand(){return window.__dailyRng?window.__dailyRng():Math.random()}
function updateUI(){
  $("#coinCount").textContent=state.coins;
  $("#shopCoins").textContent=state.coins;
  $("#progressText").textContent=`${state.solved} of 1,500 solved`;
  $("#completedCount").textContent=state.solved;
  $("#bestScore").textContent=state.best;
  syncSettings();
}
function toast(t){
  $("#toast").textContent=t;$("#toast").classList.add("show");
  clearTimeout(window.__toast);window.__toast=setTimeout(()=>$("#toast").classList.remove("show"),1700);
}
function show(id){
  $$(".screen").forEach(x=>x.classList.remove("active"));
  $("#"+id).classList.add("active");
  $$(".bottom-nav button").forEach(x=>x.classList.remove("nav-active"));
  const n=document.querySelector(`[data-screen="${id}"]`);if(n)n.classList.add("nav-active");
  updateUI();
}

// The badge stays 3x3 / 4x4 / 5x5 for the requested progression, while the
// internal dot-grid grows slowly so the puzzle can look like the reference maze.
function levelBadge(){
  if(daily)return "DAILY • 15×15";
  if(state.level<=5)return "3×3";
  if(state.level<=20)return "4×4";
  if(state.level<=50)return "5×5";
  if(state.level<=100)return "6×6";
  if(state.level<=180)return "7×7";
  if(state.level<=300)return "8×8";
  return "9×9";
}
function visualSize(){
  // Daily Challenge intentionally uses a much larger maze than normal early levels.
  if(daily)return 15;
  if(state.level<=5)return 7;
  if(state.level<=20)return 9;
  if(state.level<=50)return 11;
  if(state.level<=100)return 13;
  if(state.level<=180)return 15;
  if(state.level<=300)return 17;
  return 19;
}
function activeCells(size){
  const out=[];
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){
    const x=(c-(size-1)/2)/((size-1)/2), y=(r-(size-1)/2)/((size-1)/2);
    if(size<=9){
      if(Math.abs(x)<=.95&&Math.abs(y)<=.95)out.push([r,c]);
      continue;
    }
    const central=Math.abs(x)<.58&&Math.abs(y)<.58;
    const lobes=[[-.62,0],[.62,0],[0,-.62],[0,.62]].some(([lx,ly])=>((x-lx)**2+(y-ly)**2)<.42**2);
    if(central||lobes)out.push([r,c]);
  }
  return out;
}
function neighbors(cell,size,available){
  const [r,c]=cell;
  return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([nr,nc])=>nr>=0&&nr<size&&nc>=0&&nc<size&&available.has(`${nr},${nc}`));
}
function dirFrom(a,b){
  const dr=b[0]-a[0],dc=b[1]-a[1];
  if(dr<0)return'up';if(dr>0)return'down';if(dc<0)return'left';return'right';
}
function cellCenter(r,c,size){return{x:(c+.5)*100/size,y:(r+.5)*100/size}}
function pathPoints(p,size){return p.cells.map(([r,c])=>cellCenter(r,c,size))}
function svgPath(points){return points.map((p,i)=>(i?'L':'M')+` ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}
function arrowEnd(dir,p){
  const s=3.1,t=4.4;
  if(dir==='right')return `${p.x+t},${p.y} ${p.x},${p.y-s} ${p.x},${p.y+s}`;
  if(dir==='left')return `${p.x-t},${p.y} ${p.x},${p.y-s} ${p.x},${p.y+s}`;
  if(dir==='down')return `${p.x},${p.y+t} ${p.x-s},${p.y} ${p.x+s},${p.y}`;
  return `${p.x},${p.y-t} ${p.x-s},${p.y} ${p.x+s},${p.y}`;
}
function rayKeys(p,size){
  const head=p.cells[p.cells.length-1];
  let [r,c]=head,out=[];
  while(true){
    if(p.dir==='up')r--;else if(p.dir==='down')r++;else if(p.dir==='left')c--;else c++;
    if(r<0||r>=size||c<0||c>=size)break;
    out.push(`${r},${c}`);
  }
  return out;
}
function pathSelfBlocks(p,size){
  const own=new Set(p.cells.map(([r,c])=>`${r},${c}`));
  return rayKeys(p,size).some(k=>own.has(k));
}
function blockedByAlive(p,ignoreIndex=-1){
  const ray=new Set(rayKeys(p,board.size));
  return board.paths.some((q,qi)=>qi!==ignoreIndex&&q.alive&&!q.exiting&&q.cells.some(([r,c])=>ray.has(`${r},${c}`)));
}
function clearablePaths(paths,size){
  const alive=paths.map(()=>true);
  let left=paths.length;
  while(left){
    const safe=[];
    for(let i=0;i<paths.length;i++){
      if(!alive[i])continue;
      const p=paths[i],ray=new Set(rayKeys(p,size));
      let blocked=false;
      for(let j=0;j<paths.length&&!blocked;j++)if(j!==i&&alive[j]){
        blocked=paths[j].cells.some(([r,c])=>ray.has(`${r},${c}`));
      }
      if(!blocked)safe.push(i);
    }
    if(!safe.length)return false;
    safe.forEach(i=>{alive[i]=false;left--});
  }
  return true;
}
function buildMazePaths(size){
  const active=activeCells(size);
  for(let attempt=0;attempt<250;attempt++){
    const available=new Set(active.map(([r,c])=>`${r},${c}`));
    const paths=[];
    let guard=0;
    while(available.size&&guard++<8000){
      const keys=[...available],startKey=keys[Math.floor(rand()*keys.length)];
      let current=startKey.split(',').map(Number),cells=[current];
      available.delete(startKey);
      const target=2+Math.floor(rand()*Math.min(4,Math.max(2,Math.floor(size/2))));
      while(cells.length<target){
        const candidates=neighbors(current,size,available);
        if(!candidates.length)break;
        // Slight preference for turns, while keeping the path simple and non-crossing.
        let next=candidates[Math.floor(rand()*candidates.length)];
        if(cells.length>1){
          const prev=cells[cells.length-2],lastDir=dirFrom(prev,current);
          const turners=candidates.filter(n=>dirFrom(current,n)!==lastDir);
          if(turners.length&&rand()<.62)next=turners[Math.floor(rand()*turners.length)];
        }
        current=next;cells.push(current);available.delete(`${current[0]},${current[1]}`);
      }
      let made=false;
      for(const d of ['up','down','left','right'].sort(()=>rand()-.5)){
        const p={cells,dir:d,alive:true,exiting:false};
        if(!pathSelfBlocks(p,size)){paths.push(p);made=true;break;}
      }
      if(!made&&cells.length){paths.push({cells,dir:'right',alive:true,exiting:false});}
    }
    if(paths.length>=Math.max(4,Math.floor(active.length/6))&&clearablePaths(paths,size))return paths;
  }
  // Guaranteed fallback: one-cell arrows facing the nearest edge.
  return active.map(([r,c])=>{
    const d={up:r,down:size-1-r,left:c,right:size-1-c};
    const dir=Object.keys(d).sort((a,b)=>d[a]-d[b])[0];
    return {cells:[[r,c]],dir,alive:true,exiting:false};
  });
}
function generate(){
  const size=visualSize();
  window.__dailyRng=daily?mulberry32(dailySeed()):null;
  const paths=buildMazePaths(size);
  window.__dailyRng=null;
  board={size,paths};history=[];hearts=3;
  board.paths.forEach(p=>p.points=pathPoints(p,size));
  $("#gridBadge").textContent=levelBadge();renderBoard();
}
function renderHearts(){
  const el=$("#lives");
  if(!el)return;
  el.innerHTML='';
  for(let i=0;i<3;i++){
    const span=document.createElement('span');
    span.textContent='♥';
    span.className=i<hearts?'alive-heart':'lost';
    el.appendChild(span);
  }
  el.classList.toggle('heart-warning',hearts===1);
}

function renderBoard(){
  const size=board.size;
  $("#levelTitle").textContent=`Level ${state.level}`;
  $("#gridBadge").textContent=levelBadge();
  const total=board.paths.length,removed=board.paths.filter(p=>!p.alive).length;
  $("#moveCount").textContent=`${removed}/${total}`;
  $("#board").innerHTML='<svg id="puzzleSvg" viewBox="0 0 100 100" aria-label="Arrow maze puzzle"></svg>';
  const svg=$("#puzzleSvg");
  activeCells(size).forEach(([r,c])=>{
    const p=cellCenter(r,c,size),circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',size>=15?'0.45':'0.58');circle.setAttribute('class','dot');svg.appendChild(circle);
  });
  board.paths.forEach((p,i)=>{
    if(!p.alive)return;
    const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.classList.add('arrow-group');group.dataset.i=i;
    const d=svgPath(p.points);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);path.setAttribute('class','arrow-path');
    const hit=document.createElementNS('http://www.w3.org/2000/svg','path');hit.setAttribute('d',d);hit.setAttribute('class','arrow-hit');
    const end=p.points[p.points.length-1],poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');poly.setAttribute('points',arrowEnd(p.dir,end));poly.setAttribute('class','arrow-head');
    const handler=()=>movePath(i);path.addEventListener('click',handler);hit.addEventListener('click',handler);poly.addEventListener('click',handler);
    group.append(path,hit,poly);svg.appendChild(group);
  });
  renderHearts();
}

function wrongMove(){
  if(hearts<=0)return;
  hearts=Math.max(0,hearts-1);renderHearts();
  $("#lives").classList.remove('heart-shake');void $("#lives").offsetWidth;$("#lives").classList.add('heart-shake');
  if(state.haptics&&navigator.vibrate)navigator.vibrate([25,45,25]);
  toast(hearts?`Wrong move • ${hearts} heart${hearts===1?'':'s'} left`:'No hearts left!');
  if(hearts===0)showGameOver();
}
function exitVector(dir){
  if(dir==='right')return{style:'translate(34px,0)'};
  if(dir==='left')return{style:'translate(-34px,0)'};
  if(dir==='down')return{style:'translate(0,34px)'};
  return{style:'translate(0,-34px)'};
}
function movePath(i){
  const p=board.paths[i];if(!p||!p.alive||p.exiting)return;
  if(blockedByAlive(p,i)){wrongMove();return;}
  history.push(JSON.stringify(board.paths.map(x=>({cells:x.cells,dir:x.dir,alive:x.alive,exiting:false,points:x.points}))));
  p.exiting=true;
  const group=$(`#puzzleSvg .arrow-group[data-i="${i}"]`);
  if(group){
    const dist=70;
    const dx=p.dir==='right'?dist:p.dir==='left'?-dist:0;
    const dy=p.dir==='down'?dist:p.dir==='up'?-dist:0;
    group.style.setProperty('--exit-x',`${dx}px`);
    group.style.setProperty('--exit-y',`${dy}px`);
    group.classList.add('arrow-exit');
  }
  if(state.haptics&&navigator.vibrate)navigator.vibrate(8);
  setTimeout(()=>{
    p.alive=false;p.exiting=false;renderBoard();
    if(board.paths.every(x=>!x.alive))complete();
  },420);
}
function showGameOver(){
  clearInterval(timerId);
  const wrap=document.createElement('div');wrap.className='game-over';
  wrap.innerHTML='<div class="game-over-card"><div class="gameover-heart">♥</div><h3>Out of Hearts</h3><p>That move was blocked. Try the level again.</p><button id="gameOverRestart">Restart Level</button></div>';
  $("#boardWrap").appendChild(wrap);$("#gameOverRestart").onclick=()=>{wrap.remove();start(state.level,daily)};
}
function complete(){
  clearInterval(timerId);
  const score=Math.max(100,1400-seconds*6+Math.min(300,state.level));
  if(daily){ state.coins+=25; state.best=Math.max(state.best,score); save(); toast('Daily Challenge complete! +25 coins'); }
  else { state.solved=Math.max(state.solved,state.level); state.best=Math.max(state.best,score); state.coins+=10; save(); toast('Level complete! +10 coins'); }
  setTimeout(()=>{
    if(daily){
      show('dailyScreen');
    }else{
      const nextLevel=Math.min(1500,state.level+1);
      state.level=nextLevel;
      save();
      toast(`Next level: ${nextLevel}`);
      start(nextLevel,false);
    }
  },700);
}
function start(n=state.level,isDaily=false){
  daily=isDaily;state.level=Math.max(1,Math.min(1500,n));show('gameScreen');generate();
  clearInterval(timerId);seconds=0;$("#timer").textContent='00:00';
  timerId=setInterval(()=>{seconds++;$("#timer").textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`},1000);
}
function renderLevels(){
  const g=$("#levelGrid");g.innerHTML='';
  for(let i=1;i<=40;i++){
    const b=document.createElement('button'),done=i<=state.solved,locked=i>state.solved+1;
    b.className=`level ${locked?'locked':''} ${done?'done':''}`;
    b.innerHTML=`<b>${i}</b><div class="stars">${done?'★★★':'☆ ☆ ☆'}</div>`;
    b.onclick=()=>locked?toast('Complete previous levels first'):start(i);g.appendChild(b);
  }
}
function buy(type){
  const cost={hint:100,undo:175,heart:300}[type];
  if(type==='heart'&&hearts>=3)return toast('Hearts are already full');
  if(state.coins<cost)return toast('Not enough coins');
  state.coins-=cost;
  if(type==='heart'){hearts=Math.min(3,hearts+1);renderHearts();toast('+1 heart restored');}
  else toast(type==='hint'?'Hint added':'Undo added');
  save();
}
function syncSettings(){
  const a=$("#soundToggle .check-dot"),b=$("#hapticToggle .check-dot");
  a.classList.toggle('off',!state.sound);a.textContent=state.sound?'✓':'';b.classList.toggle('off',!state.haptics);b.textContent=state.haptics?'✓':'';
}

$("#startBtn").onclick=()=>start();$("#dailyBtn").onclick=()=>show('dailyScreen');$("#dailyPlayBtn").onclick=()=>start(1,true);
$("#levelsBtn").onclick=()=>{show('levelsScreen');renderLevels()};
$("#spinBtn").onclick=()=>{
  if(state.spinDay===todayKey())return toast('Lucky Spin already used today');
  state.spinDay=todayKey();const gain=25+Math.floor(Math.random()*51);state.coins+=gain;save();toast(`Lucky Spin: +${gain} coins`)
};
$("#settingsBtn").onclick=()=>show('settingsScreen');
function claimDailyGift(){
  if(state.dailyGiftDay===todayKey())return toast('Daily gift already claimed today');
  state.dailyGiftDay=todayKey();state.coins+=50;save();toast('+50 daily gift');
}
$("#rewardBtn").onclick=claimDailyGift;$("#giftBtn").onclick=claimDailyGift;
$("#gameSettings").onclick=()=>show('settingsScreen');$("#hintBtn").onclick=()=>$("#hintAction").click();
$("#hintAction").onclick=()=>{
  const idx=board.paths.findIndex(p=>p.alive&&!p.exiting&&!blockedByAlive(p));
  if(idx<0)return toast('No safe move found');if(state.coins<100)return toast('Not enough coins');
  state.coins-=100;save();const els=$$('#puzzleSvg .arrow-group[data-i="'+idx+'"]');els.forEach(e=>e.classList.add('hint-glow'));toast('A safe arrow is highlighted');setTimeout(()=>els.forEach(e=>e.classList.remove('hint-glow')),1200);
};
$("#undoAction").onclick=()=>{
  if(!history.length)return toast('Nothing to undo');
  if(state.coins<175)return toast('Undo costs 175 coins');
  state.coins-=175;save();
  board.paths=JSON.parse(history.pop());renderBoard();toast('Move undone • −175 coins');
};
$("#restartAction").onclick=()=>{
  if(state.coins<200)return toast('Restart costs 200 coins');
  state.coins-=200;save();clearInterval(timerId);start(state.level,daily);toast('Level restarted • −200 coins');
};$("#removeAdsAction").onclick=()=>toast('Ads are disabled in this demo');
$$('[data-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.buy));$$('[data-home]').forEach(b=>b.onclick=()=>show('homeScreen'));
$$('[data-levels]').forEach(b=>b.onclick=()=>{clearInterval(timerId);show('levelsScreen');renderLevels()});$$('.bottom-nav [data-screen]').forEach(b=>b.onclick=()=>{show(b.dataset.screen);if(b.dataset.screen==='levelsScreen')renderLevels()});
$("#moreBtn").onclick=()=>show('settingsScreen');$("#soundToggle").onclick=()=>{state.sound=!state.sound;save()};$("#hapticToggle").onclick=()=>{state.haptics=!state.haptics;save()};
function openInfo(title,body,icon='ⓘ'){
  $('#infoTitle').textContent=title;$('#infoBody').textContent=body;$('#infoIcon').textContent=icon;
  $('#infoModal').classList.add('show');$('#infoModal').setAttribute('aria-hidden','false');
}
function closeInfo(){$('#infoModal').classList.remove('show');$('#infoModal').setAttribute('aria-hidden','true')}
$('#closeInfo').onclick=closeInfo;$('#infoOk').onclick=closeInfo;$('#infoModal').onclick=e=>{if(e.target.id==='infoModal')closeInfo()};
$('#rateBtn').onclick=()=>openInfo('Rate Us','Thanks for supporting Arrowlock! A rating prompt will be connected when you publish the app store version.','★');
$('#shareBtn').onclick=async()=>{const text='Play Arrowlock — think, plan, solve!';try{if(navigator.share)await navigator.share({title:'Arrowlock',text});else await navigator.clipboard.writeText(text);toast(navigator.share?'Thanks for sharing!':'Share text copied')}catch(e){toast('Share cancelled')}};
$('#aboutBtn').onclick=()=>openInfo('About Arrowlock','Arrowlock is a maze-style arrow puzzle built around careful planning, limited hearts, and a controlled coin economy.','ⓘ');
$('#privacyBtn').onclick=()=>openInfo('Privacy Policy','Arrowlock keeps local game progress in this browser. No account or payment details are stored by this demo.','♢');
$('#termsBtn').onclick=()=>openInfo('Terms of Service','Play fairly, do not abuse external services, and understand that this demo economy can change before release.','▤');
$('#feedbackBtn').onclick=()=>{window.location.href='mailto:feedback@example.com?subject=Arrowlock%20Feedback';};
$('#contactBtn').onclick=()=>{window.location.href='mailto:contact@example.com?subject=Arrowlock%20Contact';};
$('#resetBtn').onclick=()=>{if(confirm('Reset all game progress?')){state={coins:50,solved:0,best:0,level:1,sound:true,haptics:true,dailyGiftDay:'',spinDay:''};save();toast('Progress reset')}};
$('#helpBtn').onclick=()=>openInfo('How to Play','Tap only an arrow with a completely clear path to the outside. A blocked move costs one heart. Clear every arrow to finish the level.','?');
updateUI();renderLevels();
