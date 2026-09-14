const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const KEY="arrowlock_v7_picture";
let state=JSON.parse(localStorage.getItem(KEY)||'{"coins":50,"solved":0,"best":0,"level":1,"sound":true,"haptics":true}');
let board={size:3,paths:[]},history=[],seconds=0,timerId=null,daily=false,hearts=3;

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
  $("#toast").textContent=t;
  $("#toast").classList.add("show");
  clearTimeout(window.__toast);
  window.__toast=setTimeout(()=>$("#toast").classList.remove("show"),1700);
}
function show(id){
  $$(".screen").forEach(x=>x.classList.remove("active"));
  $("#"+id).classList.add("active");
  $$(".bottom-nav button").forEach(x=>x.classList.remove("nav-active"));
  const n=document.querySelector(`[data-screen="${id}"]`);
  if(n)n.classList.add("nav-active");
  updateUI();
}
function levelSize(){
  if(state.level<=5) return 3;
  if(state.level<=20) return 4;
  if(state.level<=50) return 5;
  if(state.level<=100) return 6;
  if(state.level<=180) return 7;
  if(state.level<=300) return 8;
  return Math.min(12,9+Math.floor((state.level-301)/120));
}
function dirs(){return ["up","right","down","left"]}

function buildGuaranteedBoard(size){
  /*
    Every arrow points to a nearest outer border. Therefore arrows farther
    from the border are never required before the arrows closer to it.
    This guarantees that at least one move is available until the board
    is completely cleared.
  */
  const result=Array.from({length:size},()=>Array.from({length:size},()=>({dir:"right",alive:true})));
  for(let r=0;r<size;r++){
    for(let c=0;c<size;c++){
      const d={up:r,down:size-1-r,left:c,right:size-1-c};
      const min=Math.min(d.up,d.down,d.left,d.right);
      let options=[];
      if(d.up===min)options.push("up");
      if(d.right===min)options.push("right");
      if(d.down===min)options.push("down");
      if(d.left===min)options.push("left");

      // Small controlled randomization while keeping the guarantee.
      if(Math.random()<0.22){
        const safeOptions=options.filter(x=>{
          if(x==="up")return r>0;
          if(x==="down")return r<size-1;
          if(x==="left")return c>0;
          return c<size-1;
        });
        if(safeOptions.length)options=safeOptions;
      }
      result[r][c].dir=options[Math.floor(Math.random()*options.length)];
      result[r][c].variant=Math.floor(Math.random()*5);
    }
  }
  return result;
}

function activeCells(size){
  const out=[];
  for(let r=0;r<size;r++){
    for(let c=0;c<size;c++){
      if(size<=5){out.push([r,c]);continue;}
      const x=(c-(size-1)/2)/((size-1)/2), y=(r-(size-1)/2)/((size-1)/2);
      const central=Math.abs(x)<0.55&&Math.abs(y)<0.55;
      const lobes=[[-0.62,0], [0.62,0], [0,-0.62], [0,0.62]].some(([lx,ly])=>((x-lx)**2+(y-ly)**2)<0.36**2);
      if(central||lobes)out.push([r,c]);
    }
  }
  return out;
}
function levelSize(){
  if(state.level<=5) return 3;
  if(state.level<=20) return 4;
  if(state.level<=50) return 5;
  if(state.level<=60) return 6;
  if(state.level<=75) return 7;
  if(state.level<=100) return 8;
  if(state.level<=135) return 9;
  if(state.level<=175) return 10;
  if(state.level<=230) return 11;
  return Math.min(13,11+Math.floor((state.level-201)/140));
}
function neighbors([r,c],size,used){
  const all=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
  return all.filter(([nr,nc])=>nr>=0&&nr<size&&nc>=0&&nc<size&&used.has(`${nr},${nc}`));
}
function buildMazePaths(size){
  const cells=activeCells(size);
  const available=new Set(cells.map(([r,c])=>`${r},${c}`));
  const paths=[];
  const dirs=[[ -1,0],[1,0],[0,-1],[0,1]];
  // Make many compact snakes. Each later path can be blocked only by paths created earlier.
  while(available.size){
    const keys=[...available];
    const key=keys[Math.floor(Math.random()*keys.length)];
    let [r,c]=key.split(',').map(Number);
    let cellsPath=[[r,c]];
    available.delete(key);
    const target=2+Math.floor(Math.random()*3);
    for(let step=1;step<target;step++){
      const cand=dirs.map(([dr,dc])=>[r+dr,c+dc]).filter(([nr,nc])=>available.has(`${nr},${nc}`));
      if(!cand.length)break;
      const [nr,nc]=cand[Math.floor(Math.random()*cand.length)];
      r=nr;c=nc;cellsPath.push([r,c]);available.delete(`${r},${c}`);
    }
    paths.push({cells:cellsPath,alive:true});
  }
  return paths;
}
function cellCenter(r,c,size){return {x:(c+.5)*100/size,y:(r+.5)*100/size}}
function dirFrom(a,b){const dr=b[0]-a[0],dc=b[1]-a[1];if(dr<0)return'up';if(dr>0)return'down';if(dc<0)return'left';return'right'}
function rayCells(cell,dir,size){
  let [r,c]=cell, out=[];
  while(true){if(dir==='up')r--;else if(dir==='down')r++;else if(dir==='left')c--;else c++;if(r<0||r>=size||c<0||c>=size)break;out.push(`${r},${c}`)}
  return out;
}
function pathPoints(p,size){
  const pts=p.cells.map(([r,c])=>cellCenter(r,c,size));
  if(pts.length===1){
    const d=['up','right','down','left'][Math.floor(Math.random()*4)];
    const q=pts[0], off=14; pts.unshift({x:q.x+(d==='left'?-off:d==='right'?off:0),y:q.y+(d==='up'?-off:d==='down'?off:0)});
  }
  return pts;
}
function svgPath(points){
  return points.map((p,i)=>(i?'L':'M')+` ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}
function arrowEnd(dir,p){
  const s=4.5, t=8;
  if(dir==='right') return `${p.x+t},${p.y} ${p.x},${p.y-s} ${p.x},${p.y+s}`;
  if(dir==='left') return `${p.x-t},${p.y} ${p.x},${p.y-s} ${p.x},${p.y+s}`;
  if(dir==='down') return `${p.x},${p.y+t} ${p.x-s},${p.y} ${p.x+s},${p.y}`;
  return `${p.x},${p.y-t} ${p.x-s},${p.y} ${p.x+s},${p.y}`;
}
function generate(){
  const size=levelSize();
  const paths=buildMazePaths(size);
  // Dependencies are determined by the final arrow segment. Because paths are created
  // sequentially, any blocker can only be an earlier path: the puzzle is always solvable.
  for(let i=0;i<paths.length;i++){
    const p=paths[i], pts=pathPoints(p,size);
    const tail=p.cells[Math.max(0,p.cells.length-2)], head=p.cells[p.cells.length-1];
    p.points=pts; p.dir=dirFrom(tail,head); p.blockers=rayCells(head,p.dir,size).filter(key=>paths.some((q,j)=>j<i && q.cells.some(([r,c])=>`${r},${c}`===key)));
  }
  board={size,paths};
  history=[];
  hearts=3;
  renderBoard();
}
function renderBoard(){
  const size=board.size;
  $('#levelTitle').textContent=`Level ${state.level}`;
  $('#gridBadge').textContent=`${size}×${size}`;
  const total=board.paths.length;
  const removed=board.paths.filter(p=>!p.alive).length;
  $('#moveCount').textContent=`${removed}/${total}`;
  $('#board').innerHTML='<svg id="puzzleSvg" viewBox="0 0 100 100" aria-label="Arrow maze puzzle"></svg>';
  const svg=$('#puzzleSvg');
  // Uniform subtle dot grid; for larger levels it forms a clover silhouette.
  const dots=activeCells(size);
  dots.forEach(([r,c])=>{const p=cellCenter(r,c,size);const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',size>=9?'0.85':'1.05');circle.setAttribute('class','dot');svg.appendChild(circle)});
  board.paths.forEach((p,i)=>{
    if(!p.alive)return;
    const d=svgPath(p.points);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',d);path.setAttribute('class','arrow-path');path.dataset.i=i;
    const hit=document.createElementNS('http://www.w3.org/2000/svg','path');
    hit.setAttribute('d',d);hit.setAttribute('class','arrow-hit');hit.dataset.i=i;
    const end=p.points[p.points.length-1];
    const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');poly.setAttribute('points',arrowEnd(p.dir,end));poly.setAttribute('fill','#2f3444');poly.dataset.i=i;poly.style.pointerEvents='none';
    const handler=()=>movePath(i);
    path.addEventListener('click',handler);hit.addEventListener('click',handler);
    svg.appendChild(path);svg.appendChild(hit);svg.appendChild(poly);
  });
  renderHearts();
}
function clearTargetVisible(i){
  const svg=$('#puzzleSvg');
  svg.querySelectorAll(`[data-i="${i}"]`).forEach(el=>el.classList.add('clear'));
  const poly=svg.querySelector(`polygon[data-i="${i}"]`);if(poly)poly.style.opacity='0';
}
function blockedByAlive(p){
  return p.blockers.some(key=>board.paths.some(q=>q.alive&&q.cells.some(([r,c])=>`${r},${c}`===key)));
}
function renderHearts(){
  $$('#lives span').forEach((el,i)=>{el.classList.toggle('lost',i>=hearts)});
}
function wrongMove(){
  hearts=Math.max(0,hearts-1);renderHearts();
  if(state.haptics&&navigator.vibrate)navigator.vibrate([20,40,20]);
  toast(hearts?`Wrong move! ${hearts} heart${hearts===1?'':'s'} left`:'No hearts left!');
  if(hearts===0)showGameOver();
}
function movePath(i){
  const p=board.paths[i]; if(!p||!p.alive)return;
  if(blockedByAlive(p)){wrongMove();return}
  history.push(JSON.stringify(board.paths.map(x=>({cells:x.cells,alive:x.alive,points:x.points,dir:x.dir,blockers:x.blockers}))));
  p.alive=false;
  clearTargetVisible(i);
  if(state.haptics&&navigator.vibrate)navigator.vibrate(8);
  setTimeout(()=>{renderBoard();if(board.paths.every(x=>!x.alive))complete()},150);
}
function showGameOver(){
  clearInterval(timerId);
  const wrap=document.createElement('div');wrap.className='game-over';wrap.innerHTML='<div class="game-over-card"><h3>Out of Hearts</h3><p>Restart this level and try a safer move.</p><button id="gameOverRestart">Restart Level</button></div>';
  $('#boardWrap').appendChild(wrap);$('#gameOverRestart').onclick=()=>{wrap.remove();start(state.level,daily)};
}
function complete(){
  clearInterval(timerId);
  const score=Math.max(100,1400-seconds*6+Math.min(300,state.level));
  state.solved=Math.max(state.solved,state.level);
  state.best=Math.max(state.best,score);
  state.coins+=25;
  save();
  toast("Level complete! +25 coins");
  setTimeout(()=>{show("levelsScreen");renderLevels()},650);
}
function start(n=state.level,isDaily=false){
  daily=isDaily;state.level=Math.max(1,Math.min(1500,n));show("gameScreen");generate();
  clearInterval(timerId);seconds=0;$("#timer").textContent="00:00";
  timerId=setInterval(()=>{seconds++;$("#timer").textContent=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`},1000);
}
function renderLevels(){
  const g=$("#levelGrid");g.innerHTML="";
  for(let i=1;i<=40;i++){
    const b=document.createElement("button");
    const done=i<=state.solved,locked=i>state.solved+1;
    b.className=`level ${locked?"locked":""} ${done?"done":""}`;
    b.innerHTML=`<b>${i}</b><div class="stars">${done?"★★★":"☆ ☆ ☆"}</div>`;
    b.onclick=()=>locked?toast("Complete previous levels first"):start(i);
    g.appendChild(b);
  }
}
function buy(type){
  const cost={hint:50,undo:75,heart:100}[type];
  if(state.coins<cost)return toast("Not enough coins");
  state.coins-=cost;save();toast(type==="hint"?"Hint added":type==="undo"?"Undo added":"Heart restored");
}
function syncSettings(){
  const a=$("#soundToggle .check-dot"),b=$("#hapticToggle .check-dot");
  a.classList.toggle("off",!state.sound);a.textContent=state.sound?"✓":"";
  b.classList.toggle("off",!state.haptics);b.textContent=state.haptics?"✓":"";
}

$("#startBtn").onclick=()=>start();
$("#dailyBtn").onclick=()=>show("dailyScreen");
$("#dailyPlayBtn").onclick=()=>start(Math.max(1,state.solved+1),true);
$("#levelsBtn").onclick=()=>{show("levelsScreen");renderLevels()};
$("#spinBtn").onclick=()=>{const gain=25+Math.floor(Math.random()*76);state.coins+=gain;save();toast(`Lucky Spin: +${gain} coins`)};
$("#settingsBtn").onclick=()=>show("settingsScreen");
$("#rewardBtn").onclick=()=>{state.coins+=150;save();toast("+150 daily reward")};
$("#giftBtn").onclick=()=>{state.coins+=150;save();toast("+150 daily reward")};
$("#gameSettings").onclick=()=>show("settingsScreen");
$("#hintBtn").onclick=()=>$("#hintAction").click();

$("#hintAction").onclick=()=>{
  const idx=board.paths.findIndex(p=>p.alive&&!blockedByAlive(p));
  if(idx<0)return toast("No safe move found");
  if(state.coins<50)return toast("Not enough coins");
  state.coins-=50;save();
  const els=$$('#puzzleSvg [data-i="'+idx+'"]');
  els.forEach(e=>{if(e.classList)e.classList.add('hint-glow')});
  toast("A safe arrow is highlighted");
  setTimeout(()=>els.forEach(e=>e.classList&&e.classList.remove('hint-glow')),1200);
};

$("#undoAction").onclick=()=>{
  if(!history.length)return toast("Nothing to undo");
  board.paths=JSON.parse(history.pop());
  renderBoard();toast("Move undone");
};
$("#restartAction").onclick=()=>{clearInterval(timerId);start(state.level,daily)};
$("#removeAdsAction").onclick=()=>toast("Ads are disabled in this demo");

$$("[data-buy]").forEach(b=>b.onclick=()=>buy(b.dataset.buy));
$$("[data-home]").forEach(b=>b.onclick=()=>show("homeScreen"));
$$("[data-levels]").forEach(b=>b.onclick=()=>{clearInterval(timerId);show("levelsScreen");renderLevels()});
$$(".bottom-nav [data-screen]").forEach(b=>b.onclick=()=>{show(b.dataset.screen);if(b.dataset.screen==="levelsScreen")renderLevels()});
$("#moreBtn").onclick=()=>show("settingsScreen");
$("#soundToggle").onclick=()=>{state.sound=!state.sound;save()};
$("#hapticToggle").onclick=()=>{state.haptics=!state.haptics;save()};
$("#resetBtn").onclick=()=>{
  if(confirm("Reset all game progress?")){
    state={coins:50,solved:0,best:0,level:1,sound:true,haptics:true};
    save();toast("Progress reset");
  }
};
$("#helpBtn").onclick=()=>toast("Remove arrows only when their path is clear");

updateUI();
renderLevels();
