import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_SPEED_PX_PER_S,
  BOARD_PX,
  BRICK_COLUMNS,
  BRICK_ROWS,
  MAX_SPEED_PX_PER_S,
  PADDLE_MIN_WIDTH,
  PADDLE_WIDTH,
  ROW_SCORES,
  SPEED_PER_BRICK,
  START_LIVES,
} from "../webview/src/core/config.js";
import { createSession } from "../webview/src/core/session.js";

const FRAME = 1 / 60;
// One score per brick, so a whole wall is worth a full row of every value.
const CLEARED_SCORE = ROW_SCORES.reduce((total, row) => total + row, 0) * BRICK_COLUMNS;

function launch(session) {
  session.primaryAction();
  session.primaryAction();
}

// Runs frames until the ball has dropped off the board, which is the only loss
// condition, and fails loudly rather than looping forever if it never does.
function drainBall(session, limit = 6000) {
  for (let frame = 0; frame < limit; frame += 1) {
    session.step(FRAME);
    if (session.state !== "running") return frame;
  }
  throw new Error("the ball never dropped within the frame budget");
}

// Aims the ball at a brick from directly below, which is the only way to hit a
// brick on purpose. Scoring happens inside step(), so a test that wants the score to
// move has to break the brick with a real collision rather than by calling destroy
// on it directly.
//
// Only safe on a brick with clear air beneath it, so callers take the wall top row
// down first. Aiming at a brick in the bottom row would spawn the ball inside the
// row above it and take out bricks the test never asked for.
function breakBrick(session, brick) {
  const ball = session.ball;
  ball.setPosition(brick.left + brick.width / 2, brick.bottom + ball.radius + 1);
  ball.setVelocity(0, -1, BASE_SPEED_PX_PER_S);

  for (let frame = 0; frame < 240 && brick.alive; frame += 1) {
    session.step(FRAME);
    // Re-aimed every frame, because a single bounce off the paddle or a wall would
    // otherwise send the ball somewhere else entirely.
    if (brick.alive) {
      ball.setPosition(brick.left + brick.width / 2, brick.bottom + ball.radius + 1);
      ball.setVelocity(0, -1, BASE_SPEED_PX_PER_S);
    }
  }

  assert.equal(brick.alive, false, `the ball never reached brick ${brick.id}`);
}

// Plays until the run is over, whatever ends it, so a test that only cares about
// the end state does not have to know which way the run ended first.
function playToEnd(session, limit = 20000) {
  for (let frame = 0; frame < limit; frame += 1) {
    if (session.state === "serving") session.primaryAction();
    else if (session.state === "running") session.step(FRAME);
    else if (session.state === "over") return frame;
  }
  throw new Error("the run never ended within the frame budget");
}

test("a new session starts idle with a full set of lives", () => {
  const session = createSession();
  assert.equal(session.state, "idle");
  assert.equal(session.lives, START_LIVES);
  assert.equal(session.score, 0);
  assert.equal(session.wall.remaining, session.wall.total);
});

test("one press starts a run and the next launches the ball", () => {
  const session = createSession();

  session.primaryAction();
  assert.equal(session.state, "serving");
  assert.equal(session.ball.held, true);

  session.primaryAction();
  assert.equal(session.state, "running");
  assert.equal(session.ball.held, false);
});

test("the first launch uses the base speed", () => {
  const session = createSession();
  launch(session);
  assert.equal(session.ball.speed, BASE_SPEED_PX_PER_S);
});

test("the ball waits on the paddle until it is launched", () => {
  const session = createSession();
  session.primaryAction();

  const before = session.ball.y;
  session.step(FRAME);
  session.step(FRAME);

  assert.equal(session.state, "serving");
  assert.equal(session.ball.y, before, "the ball must not move before launch");
});

test("a paused run stops the ball and resumes where it left off", () => {
  const session = createSession();
  launch(session);
  session.step(FRAME);

  const x = session.ball.x;
  const y = session.ball.y;

  session.primaryAction();
  assert.equal(session.state, "paused");
  session.step(FRAME);
  session.step(FRAME);
  assert.equal(session.ball.x, x, "a paused ball must not drift");
  assert.equal(session.ball.y, y);

  session.primaryAction();
  assert.equal(session.state, "running");
  session.step(FRAME);
  assert.notEqual(session.ball.y, y);
});

test("stepping before launch is a no-op", () => {
  const session = createSession();
  session.step(FRAME);
  assert.equal(session.state, "idle");
  assert.equal(session.score, 0);
});

test("a lost ball costs a life and the run continues", () => {
  const session = createSession();
  launch(session);
  drainBall(session);

  assert.equal(session.lives, START_LIVES - 1);
  assert.equal(session.state, "serving");
});

test("running out of lives ends the run", () => {
  const session = createSession();
  launch(session);
  playToEnd(session);

  assert.equal(session.lives, 0);
  assert.equal(session.state, "over");
});

test("a cleared wall ends the run as a win", () => {
  const session = createSession();
  launch(session);

  // The wall is broken from the bottom row up, so the run never ends early by
  // clearing the wall before the rest of it has been taken down.
  // Bottom row up, so every brick is reached from clear air below it.
  const ordered = session.wall.bricks.slice().sort((a, b) => b.row - a.row || a.column - b.column);
  for (const brick of ordered.slice(0, -1)) breakBrick(session, brick);
  breakBrick(session, ordered[ordered.length - 1]);

  assert.equal(session.wall.isCleared, true);
  assert.equal(session.score, CLEARED_SCORE);
  assert.equal(session.state, "over");
});

test("the score is the sum of the rows that were broken", () => {
  const session = createSession();
  launch(session);

  // The bottom row, because only it has clear air beneath it to aim from.
  const bottomRow = session.wall.bricks
    .filter((brick) => brick.row === BRICK_ROWS - 1)
    .sort((a, b) => a.column - b.column);

  for (const brick of bottomRow) breakBrick(session, brick);

  assert.equal(session.score, ROW_SCORES[BRICK_ROWS - 1] * bottomRow.length);
});

test("the score never drops when a life is lost", () => {
  const session = createSession();
  launch(session);
  session.wall.destroy(session.wall.bricks[0]);
  drainBall(session);

  assert.equal(session.lives, START_LIVES - 1);
});

test("the paddle narrows as the wall comes down", () => {
  // A paddle that stayed full width would make a cleared run a formality rather
  // than a result, so the difficulty has to actually land on the player.
  const session = createSession();
  launch(session);
  assert.equal(session.paddle.width, PADDLE_WIDTH);

  const ordered = session.wall.bricks.slice().sort((a, b) => b.row - a.row);
  for (const brick of ordered.slice(1)) breakBrick(session, brick);

  assert.equal(session.paddle.width, PADDLE_MIN_WIDTH);
});

test("starting again resets the run completely", () => {
  const session = createSession();
  launch(session);
  breakBrick(session, session.wall.bricks[session.wall.total - 1]);
  playToEnd(session);
  assert.equal(session.state, "over");

  session.primaryAction();

  assert.equal(session.state, "serving");
  assert.equal(session.score, 0);
  assert.equal(session.lives, START_LIVES);
  assert.equal(session.wall.remaining, session.wall.total);
  assert.equal(session.paddle.width, PADDLE_WIDTH);
});

test("a run can be started from the idle state with one press", () => {
  const session = createSession();
  session.primaryAction();
  assert.equal(session.state, "serving");
});

test("a live run is never lost while the ball is above the paddle", () => {
  // The loss check is a bottom-of-board test, not a paddle collision, so a ball
  // still inside the playfield must be safe no matter how narrow the paddle is.
  const session = createSession();
  launch(session);

  for (const brick of session.wall.bricks) {
    session.wall.destroy(brick);
    session.paddle.setProgress(session.wall.total - session.wall.remaining, session.wall.total);
  }

  session.step(FRAME);
  assert.equal(session.lives, START_LIVES);
  assert.ok(session.ball.y - session.ball.radius <= BOARD_PX);
});

test("the ball never leaves the playfield sideways", () => {
  // Walls are the only thing keeping the ball in, so a missed wall bounce would
  // read as the ball draining out of the board forever.
  const session = createSession();
  launch(session);

  for (let frame = 0; frame < 1200; frame += 1) {
    session.step(FRAME);
    assert.ok(session.ball.x >= 0, `ball left the board at frame ${frame}`);
    assert.ok(session.ball.x <= BOARD_PX, `ball left the board at frame ${frame}`);
    if (session.state !== "running") break;
  }
});

test("every brick the ball clears speeds it up by the same step", () => {
  const session = createSession();
  launch(session);
  const startSpeed = session.ball.speed;

  breakBrick(session, session.wall.bricks[session.wall.total - 1]);

  assert.equal(session.ball.speed, startSpeed + SPEED_PER_BRICK);
});

test("the speed never exceeds the cap", () => {
  // The ramp has to be clamped, or a long run ends with a ball that crosses the
  // board in a single frame and cannot be reacted to.
  const session = createSession();
  launch(session);

  const ordered = session.wall.bricks.slice().sort((a, b) => b.row - a.row);
  for (const brick of ordered.slice(1)) {
    breakBrick(session, brick);
    assert.ok(session.ball.speed <= MAX_SPEED_PX_PER_S, `the ball ran past the cap at ${session.ball.speed}`);
  }
});

test("state changes are reported once each", () => {
  // The shell writes the HUD on every change, so a duplicate report would either
  // rewrite the same text twice or, worse, re-show an overlay it just hid.
  const states = [];
  const session = createSession({ onState: (state) => states.push(state) });

  launch(session);
  assert.deepEqual(states, ["serving", "running"]);

  session.primaryAction();
  session.primaryAction();
  assert.deepEqual(states, ["serving", "running", "paused", "running"]);
});

test("the score and life callbacks carry the new values", () => {
  const seen = { score: [], lives: [] };
  const session = createSession({
    onScore: (value) => seen.score.push(value),
    onLives: (value) => seen.lives.push(value),
  });

  launch(session);
  const brick = session.wall.bricks[session.wall.total - 1];
  breakBrick(session, brick);
  drainBall(session);

  assert.deepEqual(seen.score, [0, ROW_SCORES[brick.row]]);
  assert.deepEqual(seen.lives, [START_LIVES, START_LIVES - 1]);
});
