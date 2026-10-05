import assert from "node:assert/strict";
import test from "node:test";

import {
  BALL_RADIUS,
  BOARD_PX,
  MAX_SPEED_PX_PER_S,
  MIN_VERTICAL_RATIO,
} from "../webview/src/core/config.js";
import { createBall } from "../webview/src/entities/ball.js";
import { createPaddle } from "../webview/src/entities/paddle.js";
import { createWall } from "../webview/src/entities/bricks.js";

const FRAME = 1 / 60;

const walls = () => ([
  { kind: "left", left: 0, right: 0, top: 0, bottom: BOARD_PX, width: 0, height: BOARD_PX },
  { kind: "right", left: BOARD_PX, right: BOARD_PX, top: 0, bottom: BOARD_PX, width: 0, height: BOARD_PX },
  { kind: "ceiling", left: 0, right: BOARD_PX, top: 0, bottom: 0, width: BOARD_PX, height: 0 },
]);

// Fires the ball downward at a known speed so a single frame's travel is exact.
function falling(speed = 300, x = BOARD_PX / 2, y = 100) {
  const ball = createBall();
  ball.setPosition(x, y);
  ball.setVelocity(0, 1, speed);
  return ball;
}

test("a ball held on the paddle sits above it and does not move", () => {
  const paddle = createPaddle();
  const ball = createBall();
  ball.holdOn(paddle);

  assert.equal(ball.held, true);
  assert.equal(ball.y + BALL_RADIUS, paddle.top);
  assert.equal(ball.speed, 0);
  assert.deepEqual(ball.step(FRAME, { walls: walls() }), []);
});

test("a held ball is aimed off vertical so the serve enters the field", () => {
  const paddle = createPaddle();
  const ball = createBall();
  ball.holdOn(paddle);

  assert.ok(Math.abs(ball.vx) > 0, "a dead vertical serve would never reach a wall");
  assert.ok(ball.vy < 0, "the serve must travel up into the brick field");
});

test("sub-stepping moves the ball exactly as far as its speed implies", () => {
  const ball = falling(300, BOARD_PX / 2, 100);
  ball.step(FRAME, { walls: walls() });

  const expected = 300 * FRAME;
  assert.ok(Math.abs(ball.y - (100 + expected)) < 1e-9);
});

test("a fast ball cannot pass through a brick in a single frame", () => {
  // The regression this whole design exists for. At the speed cap the ball covers
  // more than a brick's height per frame, so an unstepped test would land past it
  // and report a clean miss.
  const wall = createWall();
  const brick = wall.bricks[wall.bricks.length - 1];
  const ball = falling(MAX_SPEED_PX_PER_S, brick.x + brick.width / 2, brick.y - BALL_RADIUS - 1);

  const hits = ball.step(FRAME, { walls: walls(), bricks: [brick] });

  assert.ok(hits.length > 0, "a full frame at max speed must still register the brick");
  assert.equal(hits[0].kind, "brick");
  assert.ok(ball.vy < 0, "the ball must bounce off the brick rather than pass through");
});

test("the wall reflects the ball back into the field", () => {
  // Approaching the left wall with real leftward velocity. A ball spawned already
  // overlapping the wall and moving straight down has nothing to reflect, so this
  // has to travel into the wall rather than start inside it.
  const ball = createBall();
  ball.setPosition(BALL_RADIUS + 2, 200);
  ball.setVelocity(-1, 0.3, 300);

  const hits = ball.step(FRAME, { walls: walls() });

  assert.ok(hits.includes("left"));
  assert.ok(ball.vx > 0, "the ball must travel away from the left wall again");
  assert.equal(ball.speed, 300, "a reflection must not change the speed");
});

test("every wall is reflected off exactly once per frame", () => {
  for (const [name, x, y] of [["left", 1, 200], ["right", BOARD_PX - 1, 200], ["ceiling", 240, 1]]) {
    const ball = falling(300, x, y);
    const hits = ball.step(FRAME, { walls: walls() });
    assert.ok(hits.includes(name), `expected a ${name} hit`);
  }
});

test("a shallow bounce is steered back into a playable cone", () => {
  // The classic stall: a ball travelling almost flat into a side wall reflects to
  // an almost flat outgoing angle and then skims the ceiling for seconds, so the
  // run stops progressing while the player has nothing to do.
  // Placed one frame's travel from the right wall so the reflection actually
  // happens inside this frame.
  const ball = createBall();
  ball.setPosition(BOARD_PX - BALL_RADIUS - 1, 200);
  ball.setVelocity(1, -0.01, 300);

  const hits = ball.step(FRAME, { walls: walls() });

  assert.ok(hits.includes("right"), "the ball should have reached the right wall");
  const speed = Math.hypot(ball.vx, ball.vy);
  assert.ok(Math.abs(ball.vy) >= MIN_VERTICAL_RATIO * speed - 1e-9,
    `vertical component ${ball.vy} was too small to keep the run moving`);
  assert.ok(ball.vy < 0, "the ball must still be heading toward the ceiling, not down");
});

test("the cone correction preserves speed", () => {
  const ball = falling(420, BOARD_PX / 2, 200);
  ball.setVelocity(1, 0.01, 420);

  ball.step(FRAME, { walls: walls() });

  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - 420) < 1e-6);
});

test("a paddle hit redirects by where the ball struck", () => {
  const paddle = createPaddle();
  const ball = createBall();
  ball.setPosition(paddle.center, paddle.top - BALL_RADIUS - 1);
  ball.setVelocity(0, 1, 300);

  const hits = ball.step(FRAME, { walls: walls(), paddle: paddle.bounds });

  const paddleHit = hits.find((hit) => hit.kind === "paddle");
  assert.ok(paddleHit, "the paddle should have been hit");
  assert.ok(ball.vy < 0, "the ball must leave the paddle travelling upward");
});

test("steering from the paddle tip sends the ball that way", () => {
  const ball = createBall();
  ball.setVelocity(0, 1, 300);

  // steerFromPaddle takes -1 at the left tip through to 1 at the right, so the
  // extreme is the one-cell-from-the-edge case. Asking for a dead-horizontal 90
  // degrees would produce a ball with no vertical component at all, which the
  // cone correction deliberately prevents.
  ball.steerFromPaddle(-0.99);
  assert.ok(ball.vx < 0, "a left-tip hit must send the ball left");
  assert.ok(ball.vy < 0, "every paddle hit must leave travelling upward");

  ball.steerFromPaddle(0.99);
  assert.ok(ball.vx > 0, "a right-tip hit must send the ball right");

  ball.steerFromPaddle(0);
  assert.ok(Math.abs(ball.vx) < 1e-9, "a center hit must go straight up");
});

test("a paddle hit can never launch the ball flat", () => {
  const ball = createBall();
  ball.setVelocity(0, 1, 300);

  ball.steerFromPaddle(-1);

  const speed = Math.hypot(ball.vx, ball.vy);
  assert.ok(Math.abs(ball.vy) >= MIN_VERTICAL_RATIO * speed - 1e-9,
    "a dead-flat paddle hit would bounce along the floor forever");
});

test("steering from the paddle keeps the speed it arrived with", () => {
  const ball = createBall();
  ball.setVelocity(0.3, 0.9, 420);

  ball.steerFromPaddle(0.5);

  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - 420) < 1e-6);
});

test("setSpeed keeps the direction and the magnitude consistent", () => {
  const ball = createBall();
  ball.setVelocity(3, 4, 100);
  assert.ok(Math.abs(ball.speed - 100) < 1e-9);
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - 100) < 1e-9);

  ball.setSpeed(250);
  assert.ok(ball.vx > 0 && ball.vy > 0, "the direction must survive a speed change");
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - 250) < 1e-9);
});

test("the loss line is below the paddle, not its top", () => {
  const paddle = createPaddle();
  const ball = createBall();

  ball.setPosition(paddle.center, paddle.top - BALL_RADIUS);
  assert.equal(ball.isLost(paddle.bottom), false);

  ball.setPosition(paddle.center, BOARD_PX + BALL_RADIUS + 1);
  assert.equal(ball.isLost(BOARD_PX), true);
});

test("a zero speed ball never reports a hit", () => {
  const ball = createBall();
  ball.holdOn(createPaddle());
  const brick = createWall().bricks[0];
  assert.deepEqual(ball.step(FRAME, { walls: walls(), bricks: [brick] }), []);
});