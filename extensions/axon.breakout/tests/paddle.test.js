import assert from "node:assert/strict";
import test from "node:test";

import {
  BOARD_PX,
  PADDLE_HEIGHT,
  PADDLE_MARGIN_BOTTOM,
  PADDLE_MIN_WIDTH,
  PADDLE_WIDTH,
} from "../webview/src/core/config.js";
import { createPaddle } from "../webview/src/entities/paddle.js";

const PADDLE_STEP = 24;

test("the paddle starts centered", () => {
  const paddle = createPaddle();
  assert.equal(paddle.width, PADDLE_WIDTH);
  assert.equal(paddle.center, BOARD_PX / 2);
});

test("the paddle cannot be pushed past either wall", () => {
  const paddle = createPaddle();

  paddle.follow(0);
  assert.equal(paddle.x, 0, "the left edge must stop at the wall");
  assert.equal(paddle.center, paddle.width / 2);

  paddle.follow(BOARD_PX);
  assert.equal(paddle.right, BOARD_PX, "the right edge must stop at the wall");
  assert.equal(paddle.center, BOARD_PX - paddle.width / 2);
});

test("following the pointer is immediate rather than eased", () => {
  const paddle = createPaddle();
  paddle.follow(200);
  assert.equal(paddle.center, 200);
  paddle.follow(120);
  assert.equal(paddle.center, 120);
});

test("nudging moves a fixed distance per call", () => {
  // Fixed-step movement is what lets a held key and a single tap move the paddle
  // the same amount, so the keyboard cannot outrun the pointer scheme.
  const paddle = createPaddle();

  paddle.nudge(-1, PADDLE_STEP);
  assert.equal(paddle.center, BOARD_PX / 2 - PADDLE_STEP);

  paddle.nudge(1, PADDLE_STEP);
  assert.equal(paddle.center, BOARD_PX / 2);
});

test("nudging past a wall clamps instead of overshooting", () => {
  const paddle = createPaddle();
  for (let i = 0; i < 100; i += 1) paddle.nudge(-1, PADDLE_STEP);
  assert.equal(paddle.x, 0);

  for (let i = 0; i < 200; i += 1) paddle.nudge(1, PADDLE_STEP);
  assert.equal(paddle.right, BOARD_PX);
});

test("a zero direction is a no-op", () => {
  const paddle = createPaddle();
  const before = paddle.center;
  paddle.nudge(0, PADDLE_STEP);
  assert.equal(paddle.center, before);
});

test("the paddle sits above the bottom margin", () => {
  const paddle = createPaddle();
  assert.equal(paddle.bounds.bottom, BOARD_PX - PADDLE_MARGIN_BOTTOM);
  assert.equal(paddle.bounds.height, PADDLE_HEIGHT);
});

test("clearing bricks shrinks the paddle to its floor", () => {
  const paddle = createPaddle();

  paddle.setProgress(0, 60);
  assert.equal(paddle.width, PADDLE_WIDTH);

  paddle.setProgress(60, 60);
  assert.equal(paddle.width, PADDLE_MIN_WIDTH);

  // Past the end the width must not shrink further or go negative.
  paddle.setProgress(120, 60);
  assert.equal(paddle.width, PADDLE_MIN_WIDTH);
});

test("the bounds match the shrinking paddle", () => {
  // The collision box has to follow the drawn paddle. Built from the PADDLE_WIDTH
  // constant it would stay full size and hand the player a wider target than they
  // can see, which makes a late wall unhittable.
  const paddle = createPaddle();
  paddle.setProgress(60, 60);

  assert.equal(paddle.bounds.width, paddle.width);
  assert.equal(paddle.bounds.right - paddle.bounds.left, paddle.width);
});

test("shrinking keeps the paddle fully on screen", () => {
  // Narrowing while hugging a wall must never leave the paddle hanging off the
  // edge with part of it unreachable. The center is deliberately preserved rather
  // than the edge, so where the player sees the paddle stay put as it narrows.
  const paddle = createPaddle();
  paddle.follow(0);
  paddle.setProgress(60, 60);

  assert.ok(paddle.x >= 0);
  assert.ok(paddle.right <= BOARD_PX);

  paddle.follow(BOARD_PX);
  paddle.setProgress(60, 60);
  assert.ok(paddle.x >= 0);
  assert.ok(paddle.right <= BOARD_PX);
});

test("progress keeps the paddle centered where the player left it", () => {
  const paddle = createPaddle();
  paddle.follow(300);
  paddle.setProgress(30, 60);
  assert.equal(paddle.center, 300);
});

test("an empty wall does not divide by zero", () => {
  const paddle = createPaddle();
  paddle.setProgress(0, 0);
  assert.ok(Number.isFinite(paddle.width));
  assert.equal(paddle.width, PADDLE_WIDTH);
});