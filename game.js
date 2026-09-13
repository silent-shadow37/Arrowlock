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

function generate(){
  const size=levelSize();
  board=buildGuaranteedBoard(size);
  history=[];
  renderBoard();
}

function arrowSvg(dir,variant){
  // Long maze-like arrow tracks, inspired by the reference: thick dark paths,
  // several 90-degree turns, and a clean arrowhead at the exit.
  const shapes={
    right:[
      'M 8 50 H 90',
      'M 8 70 H 34 V 28 H 62 V 50 H 90',
      'M 8 26 H 30 V 72 H 55 V 42 H 72 V 50 H 90',
      'M 8 50 H 28 V 24 H 52 V 76 H 70 V 50 H 90',
      'M 8 74 H 22 V 46 H 46 V 22 H 68 V 50 H 90'
    ],
    left:[
      'M 92 50 H 10',
      'M 92 70 H 66 V 28 H 38 V 50 H 10',
      'M 92 26 H 70 V 72 H 45 V 42 H 28 V 50 H 10',
      'M 92 50 H 72 V 24 H 48 V 76 H 30 V 50 H 10',
      'M 92 74 H 78 V 46 H 54 V 22 H 32 V 50 H 10'
    ],
    down:[
      'M 50 8 V 90',
      'M 30 8 V 34 H 72 V 62 H 50 V 90',
      'M 26 8 V 30 H 74 V 55 H 42 V 72 H 50 V 90',
      'M 50 8 V 28 H 24 V 52 H 76 V 70 H 50 V 90',
      'M 74 8 V 22 H 46 V 46 H 78 V 68 H 50 V 90'
    ],
    up:[
      'M 50 92 V 10',
      'M 30 92 V 66 H 72 V 38 H 50 V 10',
      'M 74 92 V 70 H 26 V 45 H 58 V 28 H 50 V 10',
      'M 50 92 V 72 H 76 V 48 H 24 V 30 H 50 V 10',
      'M 26 92 V 78 H 54 V 54 H 22 V 32 H 50 V 10'
    ]
  };
  const d=shapes[dir][variant%5];
  const end = dir==='right'?[90,50] : dir==='left'?[10,50] : dir==='down'?[50,90] : [50,10];
  let points;
  if(dir==='right') points=`${end[0]},${end[1]} 80,43 80,57`;
  if(dir==='left') points=`${end[0]},${end[1]} 20,43 20,57`;
  if(dir==='down') points=`${end[0]},${end[1]} 43,80 57,80`;
  if(dir==='up') points=`${end[0]},${end[1]} 43,20 57,20`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${d}" fill="none" stroke="#343848" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/><polygon points="${points}" fill="#343848"/></svg>`;
}
function renderBoard(){
  $('#levelTitle').textContent=`Level ${state.level}`;
  const size=board.length;
  $('#board').style.gridTemplateColumns=`repeat(${size},1fr)`;
  $('#board').innerHTML='';
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){
    const cell=document.createElement('div');
    cell.className='cell';
    if(board[r][c].alive){
      const a=document.createElement('button');
      a.className=`arrow ${board[r][c].dir}`;
      a.dataset.r=r;a.dataset.c=c;
      a.dataset.variant=board[r][c].variant||0;
      a.innerHTML=arrowSvg(board[r][c].dir,board[r][c].variant||0);
      a.onclick=()=>move(r,c);
      cell.appendChild(a);
    }
    $('#board').appendChild(cell);
  }
}
function clearPath(r,c,dir){
  let nr=r,nc=c;
  while(true){
    if(dir==="up")nr--;
    else if(dir==="down")nr++;
    else if(dir==="left")nc--;
    else nc++;
    if(nr<0||nr>=board.length||nc<0||nc>=board.length)return true;
    if(board[nr][nc].alive)return false;
  }
}
function safe(r,c){return clearPath(r,c,board[r][c].dir)}
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
