import assert from "node:assert/strict";
import test from "node:test";

import { createSnake } from "../webview/src/entities/snake.js";

// Cells are ordered tail-first, so the head is the last entry at {5,5} and the
// snake starts travelling right.
const horizontal = [{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }];
const up = { x: 0, y: -1 };
const down = { x: 0, y: 1 };
const left = { x: -1, y: 0 };
const right = { x: 1, y: 0 };

test("a single queued turn is honored", () => {
  const snake = createSnake(horizontal);
  snake.setDirection(up);
  assert.deepEqual(snake.nextHead(), { x: 5, y: 4 });
});

test("a direct reversal is rejected", () => {
  const snake = createSnake(horizontal);
  snake.setDirection(left);
  assert.deepEqual(snake.nextHead(), { x: 6, y: 5 });
});

test("two quick turns cannot compose into a reversal", () => {
  const snake = createSnake(horizontal);
  snake.setDirection(up);
  snake.setDirection(left);
  snake.setDirection(down);

  // Only the first turn may be queued, so the head still moves up rather than
  // doubling back into the neck.
  assert.deepEqual(snake.nextHead(), { x: 5, y: 4 });
});

test("a reversal is still rejected after a turn was queued", () => {
  const snake = createSnake(horizontal);
  snake.setDirection(up);
  snake.setDirection(down);
  assert.deepEqual(snake.nextHead(), { x: 5, y: 4 });
});

test("the queue clears once a step consumes it", () => {
  const snake = createSnake(horizontal);
  snake.setDirection(up);
  snake.step(snake.nextHead(), false);
  assert.deepEqual(snake.direction, up);

  // The head is now at {5,4}, so a left turn steps to {4,4}.
  snake.setDirection(left);
  assert.deepEqual(snake.nextHead(), { x: 4, y: 4 });
});

test("chasing the tail is not a crash", () => {
  // A closed 2x2 loop. Tail is {0,0}, head is {0,1}, and the head moving up
  // enters the cell the tail is leaving on the same tick.
  const loop = createSnake([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]);
  loop.setDirection(up);

  const target = loop.nextHead();
  assert.deepEqual(target, loop.cells[0]);
  assert.equal(loop.wouldHitSelf(target, false), false);
});

test("the tail is solid when the snake grows", () => {
  const loop = createSnake([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]);
  loop.setDirection(up);
  assert.equal(loop.wouldHitSelf(loop.nextHead(), true), true);
});

test("the neck is always solid", () => {
  const loop = createSnake([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]);
  // Moving right from the head enters the neck at {1,1} on a closed loop.
  loop.setDirection(right);
  assert.equal(loop.wouldHitSelf(loop.nextHead(), false), true);
});

test("growing keeps the tail cell occupied", () => {
  const snake = createSnake(horizontal);
  const before = snake.cells.length;
  snake.step({ x: 6, y: 5 }, true);
  assert.equal(snake.cells.length, before + 1);

  // Not eating appends the new head and drops the tail, so the length holds.
  const steady = createSnake(horizontal);
  const size = steady.cells.length;
  steady.step({ x: 6, y: 5 }, false);
  assert.equal(steady.cells.length, size);
});