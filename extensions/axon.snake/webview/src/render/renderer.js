"use strict";

import { CELLS, COLORS, PIXEL_RATIO } from "../core/config.js";
import { clamp, easeInOut, lerp, roundRectPath, shade } from "../core/utils.js";

// All canvas painting. The snake segments are drawn between their previous and
// current grid cells so movement stays smooth even at low tick rates.
export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);

  const logicalWidth = canvas.width / PIXEL_RATIO;
  const cell = logicalWidth / CELLS;
  const half = cell / 2;
  let snakeDirection = { x: 1, y: 0 };
  let now = 0;

  function drawBackground() {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, logicalWidth, logicalWidth);

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
    for (let index = length - 1; index >= 0; index -= 1) {
      const fromHead = length - 1 - index;
      const mix = clamp(fromHead / Math.max(1, length - 1), 0, 1);
      const target = snake.cells[index];
      const previous =
        index < snake.prevCells.length ? snake.prevCells[index] : target;

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

  return { draw, drawParticles };
}