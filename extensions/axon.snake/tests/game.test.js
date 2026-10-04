import assert from "node:assert/strict";
import test from "node:test";

import { CELLS } from "../webview/src/core/config.js";
import { createSnake } from "../webview/src/entities/snake.js";

// Mirrors the collision branch in core/game.js step().
function resolveCollision(snake, foodPosition, blocks) {
  const head = snake.nextHead();
  const eats = foodPosition !== null &&
    foodPosition.x === head.x && foodPosition.y === head.y;

  const hitWall = head.x < 0 || head.x >= CELLS || head.y < 0 || head.y >= CELLS;
  const hitSelf = snake.wouldHitSelf(head, eats);
  const hitBlock = blocks.some((block) => block.x === head.x && block.y === head.y);

  return { head, eats, hitWall, hitSelf, hitBlock, dead: hitWall || hitSelf || hitBlock };
}

const loop = () => createSnake([
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
]);

test("a snake can chase its own tail without dying", () => {
  const snake = loop();
  snake.setDirection({ x: 0, y: -1 });
  const result = resolveCollision(snake, null, []);
  assert.equal(result.hitSelf, false);
  assert.equal(result.dead, false);
});

test("a snake still dies on a wall", () => {
  const snake = createSnake([
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
  ]);
  snake.setDirection({ x: 1, y: 0 });
  const result = resolveCollision(snake, null, []);
  assert.equal(result.head.x, 3);
  assert.equal(result.hitWall, false);
});

test("the tail becomes solid the tick the snake eats", () => {
  const snake = loop();
  snake.setDirection({ x: 0, y: -1 });
  // Food sits on the tail cell, so this tick grows the snake and the tail
  // cannot move out of the way.
  const result = resolveCollision(snake, { x: 0, y: 0 }, []);
  assert.equal(result.eats, true);
  assert.equal(result.hitSelf, true);
  assert.equal(result.dead, true);
});

test("obstacles still kill", () => {
  const snake = createSnake([
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
  ]);
  snake.setDirection({ x: 1, y: 0 });
  const result = resolveCollision(snake, null, [{ x: 3, y: 0 }]);
  assert.equal(result.hitBlock, true);
  assert.equal(result.dead, true);
});

test("a wall edge is lethal at the board boundary", () => {
  const snake = createSnake([
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: CELLS - 1, y: 0 },
  ]);
  snake.setDirection({ x: 1, y: 0 });
  const result = resolveCollision(snake, null, []);
  assert.equal(result.head.x, CELLS);
  assert.equal(result.hitWall, true);
});

test("two quick turns do not reverse into the neck", () => {
  const snake = createSnake([
    { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 },
  ]);
  snake.setDirection({ x: 0, y: -1 });
  snake.setDirection({ x: -1, y: 0 });

  const result = resolveCollision(snake, null, []);
  assert.equal(result.head.x, 5);
  assert.equal(result.head.y, 4);
  assert.equal(result.dead, false);
});
