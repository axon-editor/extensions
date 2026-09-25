(function () {
  "use strict";

  const canvas = document.getElementById("board");
  const scoreElement = document.getElementById("score");
  const bestElement = document.getElementById("best");
  const startButton = document.getElementById("start");
  const messageElement = document.getElementById("message");
  const overlay = document.getElementById("overlay");

  const CELLS = 24;
  const PIXEL_RATIO = 2;
  const BASE_TICK_MS = 150;
  const MIN_TICK_MS = 70;
  const TICK_STEP_MS = 4;

  const context = canvas.getContext("2d");
  context.scale(PIXEL_RATIO, PIXEL_RATIO);

  const BEST_KEY = "axon.snake.best";
  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  let snake = [];
  let food = null;
  let direction = DIRECTIONS.right;
  let pendingDirection = null;
  let score = 0;
  let running = false;
  let tickTimer = null;
  let overlayVisible = true;

  function readBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function startGame() {
    const center = Math.floor(CELLS / 2);
    snake = [
      { x: center - 2, y: center },
      { x: center - 1, y: center },
      { x: center, y: center },
    ];
    direction = DIRECTIONS.right;
    pendingDirection = null;
    score = 0;
    running = true;
    overlayVisible = false;
    overlay.style.display = "none";
    bestElement.textContent = String(readBest());
    placeFood();
    draw();
    scheduleTick();
  }

  function endGame() {
    running = false;
    if (tickTimer) clearTimeout(tickTimer);
    const best = Math.max(readBest(), score);
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Storage can be unavailable inside a sandboxed view; the session still
      // plays, it just cannot persist the best score.
    }
    bestElement.textContent = String(best);
    overlay.style.display = "flex";
    overlayVisible = true;
    messageElement.textContent = `Game over. Score ${score}${score === best ? " — new best!" : ""}`;
    startButton.textContent = "Play again";
  }

  function randomCell() {
    return {
      x: Math.floor(Math.random() * CELLS),
      y: Math.floor(Math.random() * CELLS),
    };
  }

  function placeFood() {
    const occupied = new Set(snake.map((cell) => `${cell.x},${cell.y}`));
    if (occupied.size >= CELLS * CELLS) {
      endGame();
      return;
    }
    let next;
    do {
      next = randomCell();
    } while (occupied.has(`${next.x},${next.y}`));
    food = next;
  }

  function scheduleTick() {
    if (!running) return;
    const tickMs = Math.max(MIN_TICK_MS, BASE_TICK_MS - (score - 1) * TICK_STEP_MS);
    tickTimer = setTimeout(step, tickMs);
  }

  function step() {
    if (!running) return;

    if (pendingDirection) {
      direction = pendingDirection;
      pendingDirection = null;
    }

    const head = snake[snake.length - 1];
    const nextHead = {
      x: head.x + direction.x,
      y: head.y + direction.y,
    };

    const hitWall =
      nextHead.x < 0 ||
      nextHead.x >= CELLS ||
      nextHead.y < 0 ||
      nextHead.y >= CELLS;
    const hitSelf = snake.some(
      (cell) => cell.x === nextHead.x && cell.y === nextHead.y,
    );
    if (hitWall || hitSelf) {
      endGame();
      return;
    }

    snake.push(nextHead);
    if (food && nextHead.x === food.x && nextHead.y === food.y) {
      score += 1;
      scoreElement.textContent = String(score);
      placeFood();
    } else {
      snake.shift();
    }

    draw();
    scheduleTick();
  }

  function draw() {
    context.fillStyle = "#010409";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const gridSize = canvas.width / PIXEL_RATIO / CELLS;
    for (let y = 0; y < CELLS; y += 1) {
      for (let x = 0; x < CELLS; x += 1) {
        if ((x + y) % 2 === 0) {
          context.fillStyle = "rgba(255,255,255,0.014)";
          context.fillRect(x * gridSize, y * gridSize, gridSize, gridSize);
        }
      }
    }

    if (food) {
      context.fillStyle = "#f85149";
      roundRect(
        food.x * gridSize + 2,
        food.y * gridSize + 2,
        gridSize - 4,
        gridSize - 4,
        4,
      );
      context.fill();
    }

    snake.forEach((cell, index) => {
      const fromHead = snake.length - 1 - index;
      const blend = Math.min(1, fromHead / (snake.length || 1));
      context.fillStyle = shade("#58a6ff", blend * 0.45);
      roundRect(
        cell.x * gridSize + 1,
        cell.y * gridSize + 1,
        gridSize - 2,
        gridSize - 2,
        4,
      );
      context.fill();
    });
  }

  function roundRect(x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
  }

  function shade(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const red = Math.round(((value >> 16) & 255) * (1 - amount));
    const green = Math.round(((value >> 8) & 255) * (1 - amount));
    const blue = Math.round((value & 255) * (1 - amount));
    return `rgb(${red},${green},${blue})`;
  }

  function setDirection(next) {
    const reverse =
      next.x === -direction.x && next.y === -direction.y;
    if (reverse) return;
    pendingDirection = next;
  }

  function handleKey(event) {
    const key = event.key.toLowerCase();
    const moves = {
      arrowup: DIRECTIONS.up,
      w: DIRECTIONS.up,
      arrowdown: DIRECTIONS.down,
      s: DIRECTIONS.down,
      arrowleft: DIRECTIONS.left,
      a: DIRECTIONS.left,
      arrowright: DIRECTIONS.right,
      d: DIRECTIONS.right,
    };
    const next = moves[key];
    if (next) {
      event.preventDefault();
      if (running) setDirection(next);
    } else if ((key === " " || key === "enter") && !running && !overlayVisible) {
      event.preventDefault();
      startGame();
    }
  }

  document.addEventListener("keydown", handleKey);
  startButton.addEventListener("click", startGame);

  scoreElement.textContent = "0";
  bestElement.textContent = String(readBest());
  messageElement.textContent = "Chase the red squares. Avoid the walls and yourself.";
  startButton.textContent = "Play";
  overlay.style.display = "flex";
  draw();
})();