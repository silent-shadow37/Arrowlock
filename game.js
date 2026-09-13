const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const KEY="arrowlock_v7_picture";
let state=JSON.parse(localStorage.getItem(KEY)||'{"coins":50,"solved":0,"best":0,"level":1,"sound":true,"haptics":true}');
let board=[],history=[],seconds=0,timerId=null,daily=false;

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
function levelSize(){return Math.min(14,7+Math.floor((state.level-1)/50))}
function dirs(){return ["up","right","down","left"]}
function makeSolvableBoard(size){
  const cells=[];
  for(let r=0;r<size;r++)for(let c=0;c<size;c++)cells.push([r,c]);
  for(let i=cells.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]]}
  const result=Array.from({length:size},()=>Array.from({length:size},()=>({dir:"right",alive:true})));
  for(let i=0;i<cells.length;i++){
    const [r,c]=cells[i];
    if(i===cells.length-1){result[r][c].dir=dirs()[Math.floor(Math.random()*4)];continue}
    const [nr,nc]=cells[i+1];
    if(nr===r-1) result[r][c].dir="up";
    else if(nr===r+1) result[r][c].dir="down";
    else if(nc===c-1) result[r][c].dir="left";
    else if(nc===c+1) result[r][c].dir="right";
    else result[r][c].dir=nearestDir(r,c,nr,nc,size);
  }
  return result;
}
function nearestDir(r,c,nr,nc,size){
  const candidates=[];
  if(nr<r)candidates.push("up"); if(nr>r)candidates.push("down");
  if(nc<c)candidates.push("left"); if(nc>c)candidates.push("right");
  const d=candidates[Math.floor(Math.random()*candidates.length)]||"right";
  const out=(r===0&&d==="up")||(r===size-1&&d==="down")||(c===0&&d==="left")||(c===size-1&&d==="right");
  if(!out)return d;
  return candidates.find(x=>x!==d)||d;
}
function generate(){
  const size=levelSize();
  board=makeSolvableBoard(size);
  history=[];
  renderBoard();
}
function renderBoard(){
  $("#levelTitle").textContent=`Level ${state.level}`;
  const size=board.length;
  $("#board").style.gridTemplateColumns=`repeat(${size},1fr)`;
  $("#board").innerHTML="";
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){
    const cell=document.createElement("div");
    cell.className="cell";
    if(board[r][c].alive){
      const a=document.createElement("button");
      a.className=`arrow ${board[r][c].dir}`;
      a.dataset.r=r;a.dataset.c=c;
      a.onclick=()=>move(r,c);
      cell.appendChild(a);
    }
    $("#board").appendChild(cell);
  }
}
function blocked(r,c,dir){
  const [dr,dc]=dir==="up"?[-1,0]:dir==="down"?[1,0]:dir==="left"?[0,-1]:[0,1];
  const nr=r+dr,nc=c+dc;
  return nr>=0&&nr<board.length&&nc>=0&&nc<board.length&&board[nr][nc].alive;
}
function safe(r,c){return !blocked(r,c,board[r][c].dir)}
function move(r,c){
  if(!board[r][c].alive)return;
  if(!safe(r,c)){toast("That arrow is blocked");return}
  history.push(board.map(row=>row.map(x=>({...x}))));
  board[r][c].alive=false;
  const el=document.querySelector(`.arrow[data-r="${r}"][data-c="${c}"]`);
  const cell=el?.parentElement;
  cell?.classList.add("clear");
  if(state.haptics && navigator.vibrate)navigator.vibrate(10);
  setTimeout(()=>{renderBoard();if(board.flat().every(x=>!x.alive))complete()},170);
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
  const idx=board.flat().findIndex((a,i)=>a.alive&&safe(Math.floor(i/board.length),i%board.length));
  if(idx<0)return toast("No safe move found");
  if(state.coins<50)return toast("Not enough coins");
  state.coins-=50;save();
  const r=Math.floor(idx/board.length),c=idx%board.length;
  const a=document.querySelector(`.arrow[data-r="${r}"][data-c="${c}"]`);
  if(a){a.style.filter="drop-shadow(0 0 4px #f5b01a)";a.style.transform="scale(1.15)";setTimeout(()=>{a.style.filter="";a.style.transform=""},1200)}
  toast("A safe move is highlighted");
};

$("#undoAction").onclick=()=>{
  if(!history.length)return toast("Nothing to undo");
  board=history.pop();renderBoard();toast("Move undone");
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
