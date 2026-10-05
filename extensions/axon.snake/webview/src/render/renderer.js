"use strict";

import { CELLS, COLORS } from "../core/config.js";
import { clamp, easeInOut, lerp, roundRectPath, shade } from "../core/utils.js";

// Used only when the host does not report a pixel ratio, so a 1x fallback never
// turns into a half-size board.
const FALLBACK_PIXEL_RATIO = 1;

// All canvas painting. The snake segments are drawn between their previous and
// current grid cells so movement stays smooth even at low tick rates.
export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  // The backing store follows devicePixelRatio while the CSS box stays fixed, so
  // the board is crisp on a HiDPI screen instead of being upscaled from a
  // hardcoded pixel count. Reading the CSS box also keeps the logical size
  // correct if the stylesheet ever changes the board width.
  let logicalWidth = 0;
  let logicalHeight = 0;
  let cell = 0;
  let half = 0;
  let snakeDirection = { x: 1, y: 0 };
  let now = 0;

  resize();

  function resize() {
    const cssWidth = canvas.clientWidth || canvas.width;
    const cssHeight = canvas.clientHeight || canvas.height;
    const ratio = window.devicePixelRatio || FALLBACK_PIXEL_RATIO;

    // Assigning width or height resets the context, so the transform has to be
    // reapplied on every resize rather than once at construction.
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    logicalWidth = cssWidth;
    logicalHeight = cssHeight;
    cell = cssWidth / CELLS;
    half = cell / 2;
  }

  function drawBackground() {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    for (let y = 0; y < CELLS; y += 1) {
      for (let x = 0; x < CELLS; x += 1) {
        ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.gridEven : COLORS.gridOdd;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  function drawObstacles(blocks) {
    for (const block of blocks) {
      ctx.fillStyle = COLORS.obstacle;
      roundRectPath(
        ctx,
        block.x * cell + 1,
        block.y * cell + 1,
        cell - 2,
        cell - 2,
        4,
      );
      ctx.fill();
      ctx.strokeStyle = COLORS.obstacleEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function pulse(now, speed) {
    return 1 + Math.sin((now / 1000) * speed * Math.PI * 2) * 0.12;
  }

  function drawFood(food, now) {
    if (!food.position) return;

    const cx = food.position.x * cell + half;
    const cy = food.position.y * cell + half;
    const isBonus = food.kind === "bonus";
    const color = isBonus ? COLORS.bonus : COLORS.food;
    const highlight = isBonus ? COLORS.bonusHighlight : COLORS.foodHighlight;
    const size = cell * 0.42 * (isBonus ? 1.12 : 1) * pulse(now, isBonus ? 5 : 3);

    if (isBonus) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.fillStyle = COLORS.bonusGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = COLORS.bonus;
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 140);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -(now / 60);
      ctx.beginPath();
      ctx.arc(cx, cy, size * 1.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.arc(cx - size * 0.32, cy - size * 0.34, size * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEyes(x, y) {
    const direction = snakeDirection;
    const eyeOffset = cell * 0.18;
    const look = cell * 0.24;
    const perpendicular = { x: -direction.y, y: direction.x };
    const rotate = (vx, vy, angle) => ({
      x: vx * Math.cos(angle) - vy * Math.sin(angle),
      y: vx * Math.sin(angle) + vy * Math.cos(angle),
    });

    ctx.shadowColor = "rgba(88, 166, 255, 0.55)";
    ctx.shadowBlur = cell * 0.5;
    ctx.fillStyle = COLORS.snakeBody;
    roundRectPath(
      ctx,
      x - half + 0.5,
      y - half + 0.5,
      cell - 1,
      cell - 1,
      cell * 0.3,
    );
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#ffffff";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(
        x + perpendicular.x * eyeOffset * side,
        y + perpendicular.y * eyeOffset * side,
        2.6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.fillStyle = "#161b22";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(
        x + perpendicular.x * eyeOffset * side + direction.x * look,
        y + perpendicular.y * eyeOffset * side + direction.y * look,
        1.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    const cycle = (now / 1400) % 1;
    if (cycle < 0.4) {
      const wave = Math.sin((cycle / 0.4) * Math.PI);
      const base = {
        x: x + direction.x * cell * 0.42,
        y: y + direction.y * cell * 0.42,
      };
      const tip = {
        x: base.x + direction.x * cell * 0.38 * wave,
        y: base.y + direction.y * cell * 0.38 * wave,
      };

      ctx.strokeStyle = "#ff7b72";
      ctx.lineWidth = 1.3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();

      for (const side of [-1, 1]) {
        const fork = rotate(direction.x, direction.y, side * 0.5);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(
          tip.x + fork.x * cell * 0.13,
          tip.y + fork.y * cell * 0.13,
        );
        ctx.stroke();
      }
    }
  }

  function drawSnake(snake, renderRatio) {
    const length = snake.cells.length;
    // A head that just ate has no entry at its own index, because growth appends
    // without shifting. It arrived from the previous head, so that cell is the
    // correct origin. Falling back to the target instead makes the head jump a
    // full cell every time the snake grows.
    const grownHeadOrigin = snake.prevCells[snake.prevCells.length - 1];

    for (let index = length - 1; index >= 0; index -= 1) {
      const fromHead = length - 1 - index;
      const mix = clamp(fromHead / Math.max(1, length - 1), 0, 1);
      const target = snake.cells[index];
      const previous = snake.prevCells[index] ?? grownHeadOrigin ?? target;

      const eased = easeInOut(renderRatio);
      const x = (lerp(previous.x, target.x, eased) + 0.5) * cell;
      const y = (lerp(previous.y, target.y, eased) + 0.5) * cell;

      const isHead = index === length - 1;
      const isTail = index === 0;
      const inset = isHead ? 0.5 : isTail ? 1.6 : 0.9;

      ctx.fillStyle = shade(COLORS.snakeBody, mix * 0.5);
      roundRectPath(
        ctx,
        x - half + inset,
        y - half + inset,
        cell - inset * 2,
        cell - inset * 2,
        isHead ? 5 : 4,
      );
      ctx.fill();

      if (isHead) drawEyes(x, y);
    }
  }

  function draw(scene) {
    drawBackground();
    drawObstacles(scene.blocks);
    drawFood(scene.food, scene.time);
    snakeDirection = scene.snake.direction;
    now = scene.time;
    drawSnake(scene.snake, scene.renderRatio);
  }

  function drawParticles(particles) {
    particles.render(ctx);
  }

  // A window drag between a HiDPI and a standard display changes the pixel ratio
  // without changing the CSS box, so no resize event ever fires. Only a media
  // query on the ratio itself notices, and without one the board keeps painting
  // at the old ratio and goes soft on the new display.
  function observePixelRatio() {
    let query = null;

    function handleChange() {
      resize();
      // The query that just fired no longer matches, so a fresh one has to take
      // over the watch for the new ratio.
      watch();
    }

    function watch() {
      query?.removeEventListener("change", handleChange);
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener("change", handleChange);
    }

    watch();
    return () => query?.removeEventListener("change", handleChange);
  }

  return {
    draw,
    drawParticles,
    resize,
    observePixelRatio,
    // Read through the renderer rather than captured once, because resize()
    // can change the cell size when the window moves between displays.
    get cellPixels() {
      return cell;
    },
  };
}