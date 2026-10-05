import assert from "node:assert/strict";
import test from "node:test";

import { OBSTACLE_EVERY, OBSTACLE_HEAD_CLEARANCE } from "../webview/src/core/config.js";
import { createObstacleField } from "../webview/src/entities/obstacles.js";

// randomInt draws Math.random once per axis, so a scripted sequence pins the
// exact candidate cells the field tries. That is what makes the clearance square
// and the milestone pacing assertable without flaking.
function withRandom(values, run) {
  const original = Math.random;
  let index = 0;
  Math.random = () => values[index++ % values.length];
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

// A value that makes randomInt(0, CELLS - 1) land on the requested cell.
const roll = (cell) => (cell + 0.5) / 24;

const straightSnake = () => [{ x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }];

test("a block is kept clear of the head on every axis", () => {
  const field = createObstacleField();
  const snake = straightSnake();
  const head = snake[snake.length - 1];

  // The first candidate sits inside the clearance square and must be refused,
  // even though it is nowhere near the snake body.
  const insideX = head.x - OBSTACLE_HEAD_CLEARANCE;
  const insideY = head.y - OBSTACLE_HEAD_CLEARANCE;

  withRandom(
    [roll(insideX), roll(insideY), roll(20), roll(20)],
    () => field.sync(OBSTACLE_EVERY, snake, null),
  );

  assert.equal(field.blocks.length, 1);
  assert.deepEqual(field.blocks[0], { x: 20, y: 20 });
});

test("a block never spawns on the snake or on the food", () => {
  const field = createObstacleField();
  const snake = straightSnake();

  // Try the neck, then the food, then a cell that is neither.
  withRandom(
    [roll(5), roll(5), roll(20), roll(20), roll(21), roll(21)],
    () => field.sync(OBSTACLE_EVERY, snake, { x: 20, y: 20 }),
  );

  assert.equal(field.blocks.length, 1);
  assert.deepEqual(field.blocks[0], { x: 21, y: 21 });
});

test("blocks arrive one per milestone and never before the first one", () => {
  const field = createObstacleField();
  const snake = straightSnake();

  withRandom([roll(20), roll(20)], () => field.sync(OBSTACLE_EVERY - 1, snake, null));
  assert.equal(field.blocks.length, 0, "no block before the first milestone");

  // A jumped score still owes one block per milestone it skipped over.
  const milestones = 3;
  const rolls = [];
  for (let index = 0; index < milestones; index += 1) rolls.push(roll(20 + index), roll(20 + index));

  withRandom(rolls, () => field.sync(OBSTACLE_EVERY * milestones, snake, null));
  assert.equal(field.blocks.length, milestones);
});

test("reset clears the blocks and the milestone", () => {
  const field = createObstacleField();
  const snake = straightSnake();

  withRandom([roll(20), roll(20)], () => field.sync(OBSTACLE_EVERY, snake, null));
  assert.equal(field.blocks.length, 1);

  field.reset();
  assert.equal(field.blocks.length, 0);

  // After a reset the next score must place a fresh block rather than assuming
  // the previous run's milestone was already paid out.
  withRandom([roll(19), roll(19)], () => field.sync(OBSTACLE_EVERY, snake, null));
  assert.deepEqual(field.blocks, [{ x: 19, y: 19 }]);
});

test("a crowded board gives up instead of looping forever", () => {
  const field = createObstacleField();
  // Every cell is taken, so no candidate can ever be legal.
  const full = [];
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) full.push({ x, y });
  }

  withRandom([roll(10), roll(10)], () => field.sync(OBSTACLE_EVERY, full, null));
  assert.equal(field.blocks.length, 0);
});