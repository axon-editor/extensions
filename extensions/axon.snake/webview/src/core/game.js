"use strict";

import {
  BASE_TICK_MS,
  BONUS_EVERY,
  BONUS_LIFETIME_MS,
  BONUS_PARTICLE_COUNT,
  BONUS_SCORE,
  CELLS,
  COLORS,
  CRASH_PARTICLE_COUNT,
  MIN_TICK_MS,
  PARTICLE_COUNT,
  START_LENGTH,
  TICK_STEP_MS,
} from "./config.js";
import { createFood } from "../entities/food.js";
import { createInput } from "../input/input.js";
import { createObstacleField } from "../entities/obstacles.js";
import { createParticleSystem } from "../entities/particles.js";
import { createRenderer } from "../render/renderer.js";
import { createSnake } from "../entities/snake.js";
import { readBest, writeBest } from "./storage.js";
import { clamp } from "./utils.js";

const IDLE_MESSAGE = "Chase the red squares. Avoid the walls and yourself.";
const PAUSED_MESSAGE = "Paused — press Space or tap the board to resume.";

// Orchestrates the state machine (idle, running, paused, over), the tick loop,
// scoring, friendly-speed pacing, and the DOM that shows score and overlays.
export function createGame({ canvas, elements }) {
  const renderer = createRenderer(canvas);
  const particles = createParticleSystem();
  const food = createFood();
  const obstacles = createObstacleField();

  let snake = createSnake(initialCells());
  let state = "idle";
  let score = 0;
  let applesEaten = 0;
  let tickMs = BASE_TICK_MS;
  let lastTickAt = 0;
  let lastFrameAt = 0;
  let tickTimer = null;
  let frameId = null;
  let stopPixelRatioWatch = null;

  const input = createInput({
    element: canvas,
    onDirection: (direction) => snake.setDirection(direction),
    onToggleRun: () => toggleRun(),
  });

  function initialCells() {
    const center = Math.floor(CELLS / 2);
    // Laid out behind the head so the opening move is always a straight run and
    // START_LENGTH stays the single source of truth for the starting size.
    return Array.from({ length: START_LENGTH }, (_, index) => ({
      x: center - (START_LENGTH - 1) + index,
      y: center,
    }));
  }

  function setScore(next) {
    score = next;
    elements.score.textContent = String(next);
  }

  function cellCenter(cell) {
    return {
      x: (cell.x + 0.5) * renderer.cellPixels,
      y: (cell.y + 0.5) * renderer.cellPixels,
    };
  }

  function placeFood(bonus, lifetimeMs) {
    const occupied = snake.cells.concat(obstacles.blocks);
    const placed = food.spawn(occupied, bonus, lifetimeMs);
    if (!placed) endGame();
  }

  function emitBurst(position, color, count) {
    const { x, y } = cellCenter(position);
    particles.emit(x, y, color, count);
  }

  function scheduleTick() {
    tickMs = Math.max(MIN_TICK_MS, BASE_TICK_MS - score * TICK_STEP_MS);
    lastTickAt = performance.now();
    tickTimer = setTimeout(step, tickMs);
  }

  function step() {
    if (state !== "running") return;

    const now = Date.now();
    if (food.expired(now)) {
      placeFood(false, 0);
      if (state !== "running") return;
    }

    const head = snake.nextHead();
    const eatenPosition = food.position;
    const eats = eatenPosition !== null &&
      eatenPosition.x === head.x &&
      eatenPosition.y === head.y;

    const hitWall =
      head.x < 0 || head.x >= CELLS || head.y < 0 || head.y >= CELLS;
    // The tail only counts as solid when this tick grows the snake, so the
    // collision test has to know whether food is being eaten.
    const hitSelf = snake.wouldHitSelf(head, eats);
    const hitBlock = obstacles.blocks.some(
      (block) => block.x === head.x && block.y === head.y,
    );

    if (hitWall || hitSelf || hitBlock) {
      endGame();
      return;
    }

    snake.step(head, eats);

    if (eats) {
      const bonus = food.kind === "bonus";
      applesEaten += 1;
      setScore(score + (bonus ? BONUS_SCORE : 1));
      emitBurst(
        eatenPosition,
        bonus ? COLORS.particleBonus : COLORS.particle,
        bonus ? BONUS_PARTICLE_COUNT : PARTICLE_COUNT,
      );
      placeFood(applesEaten % BONUS_EVERY === 0, BONUS_LIFETIME_MS);
      // placeFood ends the run when the board is full. Bailing out here keeps
      // scheduleTick from arming a timer for a game that is already over.
      if (state !== "running") return;
      obstacles.sync(score, snake.cells, food.position);
    }

    scheduleTick();
  }

  function endGame() {
    state = "over";
    if (tickTimer) clearTimeout(tickTimer);

    // Read before writing, otherwise tying the stored best reads as beating it.
    const previousBest = readBest();
    const best = Math.max(previousBest, score);
    writeBest(best);
    elements.best.textContent = String(best);
    const isNewBest = score > 0 && score > previousBest;
    elements.start.textContent = "Play again";
    elements.message.textContent =
      `Game over. Score ${score}${isNewBest ? " — new best!" : ""}`;
    showOverlay();

    // The crash belongs at the head, not at the apple, which is often many cells
    // away when the run ends on a wall or an obstacle.
    emitBurst(snake.head(), COLORS.foodHighlight, CRASH_PARTICLE_COUNT);
  }

  function start() {
    snake = createSnake(initialCells());
    obstacles.reset();
    particles.clear();
    applesEaten = 0;
    setScore(0);
    elements.best.textContent = String(readBest());
    elements.start.textContent = "Pause";
    placeFood(false, 0);
    state = "running";
    hideOverlay();
    scheduleTick();
  }

  function pause() {
    if (state !== "running") return;
    state = "paused";
    if (tickTimer) clearTimeout(tickTimer);
    elements.message.textContent = PAUSED_MESSAGE;
    elements.start.textContent = "Resume";
    showOverlay();
  }

  function resume() {
    if (state !== "paused") return;
    state = "running";
    elements.start.textContent = "Pause";
    hideOverlay();
    scheduleTick();
  }

  function toggleRun() {
    if (state === "running") pause();
    else if (state === "paused") resume();
    else start();
  }

  function showOverlay() {
    elements.overlay.style.display = "flex";
  }

  function hideOverlay() {
    elements.overlay.style.display = "none";
  }

  function frame(now) {
    const renderRatio =
      state === "running" ? clamp((now - lastTickAt) / tickMs, 0, 1) : 0;

    if (lastFrameAt) particles.update((now - lastFrameAt) / 1000);
    lastFrameAt = now;

    renderer.draw({
      snake,
      food,
      blocks: obstacles.blocks,
      renderRatio,
      time: now,
    });
    renderer.drawParticles(particles);

    frameId = requestAnimationFrame(frame);
  }

  function init() {
    input.attach();
    elements.start.addEventListener("click", toggleRun);
    window.addEventListener("resize", resize);
    stopPixelRatioWatch = renderer.observePixelRatio();
    setScore(0);
    elements.best.textContent = String(readBest());
    elements.message.textContent = IDLE_MESSAGE;
    elements.start.textContent = "Play";
    showOverlay();
    renderer.draw({ snake, food, blocks: obstacles.blocks, renderRatio: 0, time: performance.now() });
    frameId = requestAnimationFrame(frame);
  }

  function resize() {
    renderer.resize();
  }

  function dispose() {
    if (tickTimer) clearTimeout(tickTimer);
    if (frameId) cancelAnimationFrame(frameId);
    window.removeEventListener("resize", resize);
    stopPixelRatioWatch?.();
    elements.start.removeEventListener("click", toggleRun);
    input.detach();
  }

  return { init, dispose, toggleRun };
}