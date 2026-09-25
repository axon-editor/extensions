"use strict";

import {
  BASE_TICK_MS,
  BONUS_EVERY,
  BONUS_LIFETIME_MS,
  BONUS_SCORE,
  CELLS,
  COLORS,
  MIN_TICK_MS,
  PIXEL_RATIO,
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
  const cellPixels = canvas.width / PIXEL_RATIO / CELLS;

  let snake = createSnake(initialCells());
  let state = "idle";
  let score = 0;
  let applesEaten = 0;
  let tickMs = BASE_TICK_MS;
  let lastTickAt = 0;
  let lastFrameAt = 0;
  let tickTimer = null;
  let frameId = null;

  const input = createInput({
    element: canvas,
    onDirection: (direction) => snake.setDirection(direction),
    onToggleRun: () => toggleRun(),
  });

  function initialCells() {
    const center = Math.floor(CELLS / 2);
    return [
      { x: center - 2, y: center },
      { x: center - 1, y: center },
      { x: center, y: center },
    ];
  }

  function setScore(next) {
    score = next;
    elements.score.textContent = String(next);
  }

  function cellCenter(cell) {
    return {
      x: (cell.x + 0.5) * cellPixels,
      y: (cell.y + 0.5) * cellPixels,
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
    const hitWall =
      head.x < 0 || head.x >= CELLS || head.y < 0 || head.y >= CELLS;
    const hitSelf = snake.wouldHitSelf(head);
    const hitBlock = obstacles.blocks.some(
      (block) => block.x === head.x && block.y === head.y,
    );

    if (hitWall || hitSelf || hitBlock) {
      endGame();
      return;
    }

    const eatenPosition = food.position;
    const eats = eatenPosition !== null &&
      eatenPosition.x === head.x &&
      eatenPosition.y === head.y;
    snake.step(head, eats);

    if (eats) {
      const bonus = food.kind === "bonus";
      applesEaten += 1;
      setScore(score + (bonus ? BONUS_SCORE : 1));
      emitBurst(eatenPosition, bonus ? COLORS.particleBonus : COLORS.particle, bonus ? 18 : 12);
      placeFood(applesEaten % BONUS_EVERY === 0, BONUS_LIFETIME_MS);
      obstacles.sync(score, snake.cells, food.position);
    }

    scheduleTick();
  }

  function endGame() {
    state = "over";
    if (tickTimer) clearTimeout(tickTimer);

    const best = Math.max(readBest(), score);
    writeBest(best);
    elements.best.textContent = String(best);
    elements.start.textContent = "Play again";
    elements.message.textContent = `Game over. Score ${score}${score === best && score > 0 ? " — new best!" : ""}`;
    showOverlay();

    const eatenPosition = food.position;
    if (eatenPosition) emitBurst(eatenPosition, "#ff7b72", 14);
  }

  function start() {
    snake = createSnake(initialCells());
    obstacles.reset();
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
    setScore(0);
    elements.best.textContent = String(readBest());
    elements.message.textContent = IDLE_MESSAGE;
    elements.start.textContent = "Play";
    showOverlay();
    renderer.draw({ snake, food, blocks: obstacles.blocks, renderRatio: 0, time: performance.now() });
    frameId = requestAnimationFrame(frame);
  }

  function dispose() {
    if (tickTimer) clearTimeout(tickTimer);
    if (frameId) cancelAnimationFrame(frameId);
    input.detach();
  }

  return { init, dispose, toggleRun };
}