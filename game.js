const TOTAL_LEVELS = 500;
const STARTING_LIVES = 3;
const GRID_SIZE = 5;

const DIRS = {
  up: { dx: 0, dy: -1, symbol: "↑" },
  down: { dx: 0, dy: 1, symbol: "↓" },
  left: { dx: -1, dy: 0, symbol: "←" },
  right: { dx: 1, dy: 0, symbol: "→" }
};

const DIRECTIONS = Object.keys(DIRS);

const state = {
  level: 1,
  lives: STARTING_LIVES,
  moves: 0,
  coins: Number(localStorage.getItem("arrowCoins")) || 100,
  best: Number(localStorage.getItem("arrowBest")) || 0,
  unlocked: Number(localStorage.getItem("arrowUnlocked")) || 1,
  completed: JSON.parse(localStorage.getItem("arrowCompleted") || "[]"),
  board: [],
  history: [],
  hints: 0,
  undos: 0,
  gameActive: false,
  paused: false,
  lastDaily: localStorage.getItem("arrowDaily") || ""
};

const $ = id => document.getElementById(id);

function saveData() {
  localStorage.setItem("arrowCoins", state.coins);
  localStorage.setItem("arrowBest", state.best);
  localStorage.setItem("arrowUnlocked", state.unlocked);
  localStorage.setItem("arrowCompleted", JSON.stringify(state.completed));
}

function updateTopBar() {
  $("levelText").textContent = state.level;
  $("coinsText").textContent = state.coins;
  $("bestText").textContent = state.best || "—";
}

function showScreen(name) {
  ["menuScreen", "levelScreen", "gameScreen", "shopScreen"].forEach(id => {
    $(id).classList.add("hidden");
  });

  $(name + "Screen").classList.remove("hidden");
}

function difficulty(level) {
  if (level <= 50) return 1;
  if (level <= 150) return 2;
  if (level <= 300) return 3;
  return 4;
}

function getGridSize(level) {
  if (level <= 20) return 4;
  if (level <= 100) return 5;
  if (level <= 250) return 6;
  return 7;
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function inside(x, y, size) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function createGuaranteedBoard(level) {
  const size = getGridSize(level);
  const total = size * size;
  const arrows = [];

  const solution = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let choices = [];

      if (x === 0) choices.push("left");
      if (x === size - 1) choices.push("right");
      if (y === 0) choices.push("up");
      if (y === size - 1) choices.push("down");

      if (choices.length === 0) {
        choices = DIRECTIONS.slice();
      }

      const direction = randomChoice(choices);

      arrows.push({
        id: arrows.length,
        x,
        y,
        direction,
        removed: false
      });

      solution.push(arrows.length - 1);
    }
  }

  const extra = Math.min(total, 3 + difficulty(level) * 2);

  for (let i = 0; i < extra; i++) {
    const index = Math.floor(Math.random() * arrows.length);
    const arrow = arrows[index];

    if (arrow.x === 0 || arrow.x === size - 1 ||
        arrow.y === 0 || arrow.y === size - 1) {
      continue;
    }

    arrow.direction = randomChoice(DIRECTIONS);
  }

  return {
    size,
    arrows,
    solution
  };
}

function startLevel(level = state.level) {
  state.level = level;
  state.lives = STARTING_LIVES;
  state.moves = 0;
  state.history = [];
  state.hints = 0;
  state.undos = 0;
  state.paused = false;
  state.gameActive = true;

  state.board = createGuaranteedBoard(level);

  updateTopBar();
  renderGame();
  showScreen("game");
  updateStats();
}

function renderGame() {
  const board = $("board");
  const size = state.board.size;

  board.innerHTML = "";
  board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${size}, 1fr)`;

  const map = new Map();

  state.board.arrows.forEach(arrow => {
    if (!arrow.removed) {
      map.set(`${arrow.x},${arrow.y}`, arrow);
    }
  });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";

      const arrow = map.get(`${x},${y}`);

      if (!arrow) {
        cell.classList.add("empty");
      } else {
        const icon = document.createElement("div");
        icon.className = `arrow ${arrow.direction}`;
        icon.textContent = DIRS[arrow.direction].symbol;

        cell.appendChild(icon);
        cell.addEventListener("click", () => moveArrow(arrow.id));
      }

      board.appendChild(cell);
    }
  }
}

function updateStats() {
  $("gameLevel").textContent = state.level;
  $("movesText").textContent = state.moves;
  $("heartsText").textContent = "♥".repeat(state.lives) + "♡".repeat(STARTING_LIVES - state.lives);

  const completed = state.completed.includes(state.level);
  $("starsText").textContent = completed ? "★★★" : "☆☆☆";

  $("hintButton").textContent = state.hints > 0 ? `Hint (${state.hints})` : "Hint";
  $("undoButton").textContent = state.undos > 0 ? `Undo (${state.undos})` : "Undo";
}

function canEscape(arrow) {
  const size = state.board.size;
  const dir = DIRS[arrow.direction];

  let x = arrow.x + dir.dx;
  let y = arrow.y + dir.dy;

  while (inside(x, y, size)) {
    const blocker = state.board.arrows.find(item =>
      !item.removed && item.x === x && item.y === y
    );

    if (blocker) return false;

    x += dir.dx;
    y += dir.dy;
  }

  return true;
}

function moveArrow(id) {
  if (!state.gameActive || state.paused) return;

  const arrow = state.board.arrows.find(item => item.id === id);
  if (!arrow || arrow.removed) return;

  if (!canEscape(arrow)) {
    wrongMove();
    return;
  }

  state.history.push(JSON.stringify(state.board.arrows));
  arrow.removed = true;
  state.moves++;

  state.coins += 2;

  saveData();
  updateTopBar();
  renderGame();
  updateStats();

  checkWin();
}

function wrongMove() {
  state.lives--;
  state.coins = Math.max(0, state.coins - 1);

  $("messageText").textContent = "Wrong move! A heart has been lost.";
  updateStats();
  updateTopBar();

  if (state.lives <= 0) {
    setTimeout(() => {
      gameOver();
    }, 350);
  }
}

function checkWin() {
  const remaining = state.board.arrows.filter(arrow => !arrow.removed);

  if (remaining.length > 0) return;

  const reward = 50 + difficulty(state.level) * 10;
  state.coins += reward;

  if (!state.completed.includes(state.level)) {
    state.completed.push(state.level);
  }

  if (state.level === state.unlocked && state.unlocked < TOTAL_LEVELS) {
    state.unlocked++;
  }

  if (state.moves > 0 && (state.best === 0 || state.moves < state.best)) {
    state.best = state.moves;
  }

  saveData();
  updateTopBar();

  $("modalTitle").textContent = "Level Complete!";
  $("modalMessage").textContent = `You earned ${reward} coins.`;
  $("modalPrimary").textContent = state.level < TOTAL_LEVELS ? "Next Level" : "Finish";
  $("modalSecondary").textContent = "Levels";

  $("modalPrimary").onclick = () => {
    closeModal();

    if (state.level < TOTAL_LEVELS) {
      startLevel(state.level + 1);
    } else {
      showLevels();
    }
  };

  $("modalSecondary").onclick = () => {
    closeModal();
    showLevels();
  };

  $("modal").classList.remove("hidden");
}

function gameOver() {
  state.gameActive = false;

  $("modalTitle").textContent = "Out of Hearts";
  $("modalMessage").textContent = "All three hearts are gone. Restart this level from the beginning.";
  $("modalPrimary").textContent = "Retry Level";
  $("modalSecondary").textContent = "Levels";

  $("modalPrimary").onclick = () => {
    closeModal();
    startLevel(state.level);
  };

  $("modalSecondary").onclick = () => {
    closeModal();
    showLevels();
  };

  $("modal").classList.remove("hidden");
}

function useHint() {
  if (!state.gameActive || state.paused) return;

  if (state.hints <= 0) {
    if (state.coins < 20) {
      $("messageText").textContent = "You need 20 coins for a hint.";
      return;
    }

    state.coins -= 20;
  } else {
    state.hints--;
  }

  const safe = state.board.arrows.find(arrow =>
    !arrow.removed && canEscape(arrow)
  );

  if (safe) {
    $("messageText").textContent = `Safe move: ${DIRS[safe.direction].symbol}`;
  } else {
    $("messageText").textContent = "No safe move is currently available.";
  }

  saveData();
  updateTopBar();
  updateStats();
}

function undoMove() {
  if (!state.gameActive || state.paused) return;

  if (state.history.length === 0) {
    $("messageText").textContent = "There is no move to undo.";
    return;
  }

  if (state.undos <= 0) {
    $("messageText").textContent = "You need an Undo item.";
    return;
  }

  state.board.arrows = JSON.parse(state.history.pop());
  state.moves = Math.max(0, state.moves - 1);
  state.undos--;

  renderGame();
  updateStats();
}

function openPause() {
  if (!state.gameActive) return;

  state.paused = true;

  $("modalTitle").textContent = "Paused";
  $("modalMessage").textContent = "The game is paused.";
  $("modalPrimary").textContent = "Continue";
  $("modalSecondary").textContent = "Restart";

  $("modalPrimary").onclick = () => {
    state.paused = false;
    closeModal();
  };

  $("modalSecondary").onclick = () => {
    closeModal();
    startLevel(state.level);
  };

  $("modal").classList.remove("hidden");
}

function closeModal() {
  $("modal").classList.add("hidden");
}

function showLevels() {
  state.gameActive = false;
  showScreen("level");
  renderLevels();
}

function renderLevels() {
  const grid = $("levelGrid");
  grid.innerHTML = "";

  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    const button = document.createElement("button");
    button.className = "level-btn";

    if (state.completed.includes(i)) {
      button.classList.add("completed");
      button.textContent = `${i} ★`;
    } else if (i <= state.unlocked) {
      button.classList.add("unlocked");
      button.textContent = i;
    } else {
      button.classList.add("locked");
      button.textContent = "🔒";
      button.disabled = true;
    }

    if (i <= state.unlocked) {
      button.addEventListener("click", () => startLevel(i));
    }

    grid.appendChild(button);
  }
}

function showShop() {
  state.gameActive = false;
  showScreen("shop");
  updateTopBar();
}

function buyItem(type) {
  if (type === "hint") {
    if (state.coins < 20) return showMessage("Not enough coins.");
    state.coins -= 20;
    state.hints++;
    showMessage("Hint added.");
  }

  if (type === "undo") {
    if (state.coins < 30) return showMessage("Not enough coins.");
    state.coins -= 30;
    state.undos++;
    showMessage("Undo added.");
  }

  if (type === "heart") {
    if (!state.gameActive) return showMessage("Start a level first.");
    if (state.lives >= STARTING_LIVES) return showMessage("Your hearts are already full.");
    if (state.coins < 25) return showMessage("Not enough coins.");

    state.coins -= 25;
    state.lives++;
    updateStats();
    showMessage("One heart restored.");
  }

  saveData();
  updateTopBar();
}

function showMessage(text) {
  $("messageText").textContent = text;
}

function dailyReward() {
  const today = new Date().toISOString().slice(0, 10);

  if (state.lastDaily === today) {
    $("modalTitle").textContent = "Daily Reward";
    $("modalMessage").textContent = "You have already claimed today's reward.";
  } else {
    state.lastDaily = today;
    state.coins += 75;
    state.hints++;
    saveData();
    updateTopBar();

    $("modalTitle").textContent = "Daily Reward Claimed!";
    $("modalMessage").textContent = "You received 75 coins and 1 hint.";
  }

  $("modalPrimary").textContent = "Continue";
  $("modalSecondary").textContent = "Close";

  $("modalPrimary").onclick = closeModal;
  $("modalSecondary").onclick = closeModal;

  $("modal").classList.remove("hidden");
}

$("playButton").addEventListener("click", () => startLevel(state.unlocked));
$("levelsButton").addEventListener("click", showLevels);
$("shopButton").addEventListener("click", showShop);
$("dailyButton").addEventListener("click", dailyReward);

$("backButton").addEventListener("click", () => showScreen("menu"));
$("shopBackButton").addEventListener("click", () => showScreen("menu"));

$("hintButton").addEventListener("click", useHint);
$("undoButton").addEventListener("click", undoMove);
$("restartButton").addEventListener("click", () => startLevel(state.level));
$("pauseButton").addEventListener("click", openPause);

$("buyHintButton").addEventListener("click", () => buyItem("hint"));
$("buyUndoButton").addEventListener("click", () => buyItem("undo"));
$("buyHeartButton").addEventListener("click", () => buyItem("heart"));

updateTopBar();
showScreen("menu");
