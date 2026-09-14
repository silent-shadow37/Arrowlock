const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const KEY="arrowlock_v12";
let state=JSON.parse(localStorage.getItem(KEY)||'{"coins":50,"solved":0,"best":0,"level":1,"sound":true,"haptics":true}');
let board={size:9,paths:[]},history=[],seconds=0,timerId=null,daily=false,hearts=3;

function save(){localStorage.setItem(KEY,JSON.stringify(state));updateUI()}
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
  if(state.level<=5)return "3×3";
  if(state.level<=20)return "4×4";
  if(state.level<=50)return "5×5";
  if(state.level<=100)return "6×6";
  if(state.level<=180)return "7×7";
  if(state.level<=300)return "8×8";
  return "9×9";
}
function visualSize(){
  if(state.level<=5)return 9;
  if(state.level<=20)return 11;
  if(state.level<=50)return 13;
  if(state.level<=100)return 15;
  if(state.level<=180)return 17;
  return 19;
}
function activeCells(size){
  const out=[];
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){
    const x=(c-(size-1)/2)/((size-1)/2), y=(r-(size-1)/2)/((size-1)/2);
    if(size<13){
      // Compact rounded-square field for the early levels.
      if(Math.abs(x)<=.95&&Math.abs(y)<=.95)out.push([r,c]);
      continue;
    }
    const central=Math.abs(x)<.58&&Math.abs(y)<.58;
    const lobes=[[-.62,0],[.62,0],[0,-.62],[0,.62]].some(([lx,ly])=>((x-lx)**2+(y-ly)**2)<.40**2);
    if(central||lobes)out.push([r,c]);
  }
  return out;
}
function neighbors(cell,size,available){
  const [r,c]=cell;
  return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([nr,nc])=>
    nr>=0&&nr<size&&nc>=0&&nc<size&&available.has(`${nr},${nc}`)
  );
}
function buildMazePaths(size){
  const active=activeCells(size);
  const available=new Set(active.map(([r,c])=>`${r},${c}`));
  const paths=[];
  let guard=0;
  while(available.size&&guard++<5000){
    const keys=[...available];
    const startKey=keys[Math.floor(Math.random()*keys.length)];
    let current=startKey.split(',').map(Number);
    const cells=[current];
    available.delete(startKey);
    const target=3+Math.floor(Math.random()*5); // 3–7 grid points per arrow
    while(cells.length<target){
      const candidates=neighbors(current,size,available);
      if(!candidates.length)break;
      // Prefer continuing in a direction that creates a turn later.
      const next=candidates[Math.floor(Math.random()*candidates.length)];
      current=next;cells.push(next);available.delete(`${next[0]},${next[1]}`);
    }
    if(cells.length===1 && available.size){
      // Try to attach a neighbor rather than making a tiny dot-only arrow.
      const candidates=neighbors(current,size,available);
      if(candidates.length){const n=candidates[0];cells.push(n);available.delete(`${n[0]},${n[1]}`)}
    }
    const last=cells[cells.length-1], prev=cells[Math.max(0,cells.length-2)];
    const dir=dirFrom(prev,last);
    paths.push({cells,dir,alive:true,exiting:false});
  }
  return paths;
}
function cellCenter(r,c,size){return {x:(c+.5)*100/size,y:(r+.5)*100/size}}
function dirFrom(a,b){
  const dr=b[0]-a[0],dc=b[1]-a[1];
  if(dr<0)return'up';if(dr>0)return'down';if(dc<0)return'left';return'right';
}
function rayCells(cell,dir,size){
  let [r,c]=cell,out=[];
  while(true){
    if(dir==='up')r--;else if(dir==='down')r++;else if(dir==='left')c--;else c++;
    if(r<0||r>=size||c<0||c>=size)break;
    out.push(`${r},${c}`);
  }
  return out;
}
function pathPoints(p,size){
  return p.cells.map(([r,c])=>cellCenter(r,c,size));
}
function svgPath(points){
  return points.map((p,i)=>(i?'L':'M')+` ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}
function arrowEnd(dir,p){
  const s=4.0,t=5.8;
  if(dir==='right')return `${p.x+t},${p.y} ${p.x},${p.y-s} ${p.x},${p.y+s}`;
  if(dir==='left')return `${p.x-t},${p.y} ${p.x},${p.y-s} ${p.x},${p.y+s}`;
  if(dir==='down')return `${p.x},${p.y+t} ${p.x-s},${p.y} ${p.x+s},${p.y}`;
  return `${p.x},${p.y-t} ${p.x-s},${p.y} ${p.x+s},${p.y}`;
}
function generate(){
  const size=visualSize();
  const paths=buildMazePaths(size);
  // A dependency can only point to a path created earlier. Therefore path 0 is
  // always removable, and every later path becomes safe once its earlier blockers leave.
  for(let i=0;i<paths.length;i++){
    const p=paths[i];
    const head=p.cells[p.cells.length-1];
    p.points=pathPoints(p,size);
    p.blockers=rayCells(head,p.dir,size).filter(key=>
      paths.slice(0,i).some(q=>q.cells.some(([r,c])=>`${r},${c}`===key))
    );
  }
  board={size,paths};history=[];hearts=3;
  $("#gridBadge").textContent=levelBadge();
  renderBoard();
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
    circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',size>=17?'0.55':'0.7');circle.setAttribute('class','dot');svg.appendChild(circle);
  });
  board.paths.forEach((p,i)=>{
    if(!p.alive)return;
    const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.classList.add('arrow-group');group.dataset.i=i;
    const d=svgPath(p.points);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',d);path.setAttribute('class','arrow-path');
    const hit=document.createElementNS('http://www.w3.org/2000/svg','path');
    hit.setAttribute('d',d);hit.setAttribute('class','arrow-hit');
    const end=p.points[p.points.length-1],poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points',arrowEnd(p.dir,end));poly.setAttribute('class','arrow-head');
    const handler=()=>movePath(i);
    path.addEventListener('click',handler);hit.addEventListener('click',handler);poly.addEventListener('click',handler);
    group.appendChild(path);group.appendChild(hit);group.appendChild(poly);svg.appendChild(group);
  });
  renderHearts();
}
function blockedByAlive(p){
  return p.blockers.some(key=>board.paths.some(q=>q.alive&&!q.exiting&&q.cells.some(([r,c])=>`${r},${c}`===key)));
}
function renderHearts(){
  $$("#lives span").forEach((el,i)=>{el.classList.toggle('lost',i>=hearts);el.textContent=i<hearts?'♥':'♡'});
  $("#lives").classList.toggle('heart-warning',hearts===1);
}
function wrongMove(){
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
  if(blockedByAlive(p)){wrongMove();return;}
  history.push(board.paths.map(x=>({cells:x.cells,dir:x.dir,alive:x.alive,exiting:false,points:x.points,blockers:x.blockers})));
  p.exiting=true;
  const group=$(`#puzzleSvg .arrow-group[data-i="${i}"]`);
  if(group){
    group.classList.add('arrow-exit');
    group.style.setProperty('--exit-transform',exitVector(p.dir).style);
  }
  if(state.haptics&&navigator.vibrate)navigator.vibrate(8);
  setTimeout(()=>{
    p.alive=false;p.exiting=false;
    renderBoard();
    if(board.paths.every(x=>!x.alive))complete();
  },340);
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
  state.solved=Math.max(state.solved,state.level);state.best=Math.max(state.best,score);state.coins+=25;save();
  toast('Level complete! +25 coins');
  setTimeout(()=>{show('levelsScreen');renderLevels()},700);
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
  const cost={hint:50,undo:75,heart:100}[type];
  if(state.coins<cost)return toast('Not enough coins');
  state.coins-=cost;save();toast(type==='hint'?'Hint added':type==='undo'?'Undo added':'Heart restored');
}
function syncSettings(){
  const a=$("#soundToggle .check-dot"),b=$("#hapticToggle .check-dot");
  a.classList.toggle('off',!state.sound);a.textContent=state.sound?'✓':'';b.classList.toggle('off',!state.haptics);b.textContent=state.haptics?'✓':'';
}

$("#startBtn").onclick=()=>start();$("#dailyBtn").onclick=()=>show('dailyScreen');$("#dailyPlayBtn").onclick=()=>start(Math.max(1,state.solved+1),true);
$("#levelsBtn").onclick=()=>{show('levelsScreen');renderLevels()};$("#spinBtn").onclick=()=>{const gain=25+Math.floor(Math.random()*76);state.coins+=gain;save();toast(`Lucky Spin: +${gain} coins`)};
$("#settingsBtn").onclick=()=>show('settingsScreen');$("#rewardBtn").onclick=()=>{state.coins+=150;save();toast('+150 daily reward')};$("#giftBtn").onclick=()=>{state.coins+=150;save();toast('+150 daily reward')};
$("#gameSettings").onclick=()=>show('settingsScreen');$("#hintBtn").onclick=()=>$("#hintAction").click();
$("#hintAction").onclick=()=>{
  const idx=board.paths.findIndex(p=>p.alive&&!p.exiting&&!blockedByAlive(p));
  if(idx<0)return toast('No safe move found');if(state.coins<50)return toast('Not enough coins');
  state.coins-=50;save();const els=$$('#puzzleSvg .arrow-group[data-i="'+idx+'"]');els.forEach(e=>e.classList.add('hint-glow'));toast('A safe arrow is highlighted');setTimeout(()=>els.forEach(e=>e.classList.remove('hint-glow')),1200);
};
$("#undoAction").onclick=()=>{if(!history.length)return toast('Nothing to undo');board.paths=JSON.parse(history.pop());renderBoard();toast('Move undone')};
$("#restartAction").onclick=()=>{clearInterval(timerId);start(state.level,daily)};$("#removeAdsAction").onclick=()=>toast('Ads are disabled in this demo');
$$('[data-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.buy));$$('[data-home]').forEach(b=>b.onclick=()=>show('homeScreen'));
$$('[data-levels]').forEach(b=>b.onclick=()=>{clearInterval(timerId);show('levelsScreen');renderLevels()});$$('.bottom-nav [data-screen]').forEach(b=>b.onclick=()=>{show(b.dataset.screen);if(b.dataset.screen==='levelsScreen')renderLevels()});
$("#moreBtn").onclick=()=>show('settingsScreen');$("#soundToggle").onclick=()=>{state.sound=!state.sound;save()};$("#hapticToggle").onclick=()=>{state.haptics=!state.haptics;save()};
$("#resetBtn").onclick=()=>{if(confirm('Reset all game progress?')){state={coins:50,solved:0,best:0,level:1,sound:true,haptics:true};save();toast('Progress reset')}};
$("#helpBtn").onclick=()=>toast('Clear paths first, then remove blocked arrows');
updateUI();renderLevels();
