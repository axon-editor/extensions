"use strict";

import {
  BASE_SPEED_PX_PER_S,
  BOARD_PX,
  MAX_SPEED_PX_PER_S,
  SPEED_PER_BRICK,
  START_LIVES,
} from "./config.js";
import { createBall } from "../entities/ball.js";
import { createPaddle } from "../entities/paddle.js";
import { createWall } from "../entities/bricks.js";

// The rules of the game, with no canvas, no DOM and no clock of its own.
//
// It is separate from game.js because everything interesting here is a decision
// that can be checked by calling step() with a fixed dt: how a life is lost, when
// the run ends, how the speed ramps, what a brick is worth. Keeping that away from
// requestAnimationFrame is the only way it can be tested at all.
//
// state is one of: idle, serving, running, paused, over.
export function createSession({ onScore, onLives, onState } = {}) {
  const paddle = createPaddle();
  const wall = createWall();
  const ball = createBall();

  // Zero-thickness rects sitting exactly on the playfield edges. Built here rather
  // than exported from config so the physics owns the same numbers the board does.
  const walls = [
    { kind: "left", x: 0, y: 0, left: 0, top: 0, right: 0, bottom: BOARD_PX, width: 0, height: BOARD_PX },
    { kind: "right", x: BOARD_PX, y: 0, left: BOARD_PX, top: 0, right: BOARD_PX, bottom: BOARD_PX, width: 0, height: BOARD_PX },
    { kind: "ceiling", x: 0, y: 0, left: 0, top: 0, right: BOARD_PX, bottom: 0, width: BOARD_PX, height: 0 },
  ];

  let state = "idle";
  let lives = START_LIVES;
  let score = 0;

  function setState(next) {
    if (next === state) return;
    state = next;
    onState?.(next);
  }

  function setScore(next) {
    score = next;
    onScore?.(score);
  }

  function setLives(next) {
    lives = next;
    onLives?.(lives);
  }

  // Derived from bricks cleared rather than from the score, so grinding the cheap
  // bottom row speeds the ball up more than landing the valuable top row does.
  function currentSpeed() {
    const cleared = wall.total - wall.remaining;
    return Math.min(MAX_SPEED_PX_PER_S, BASE_SPEED_PX_PER_S + cleared * SPEED_PER_BRICK);
  }

  function serve() {
    ball.holdOn(paddle);
    setState("serving");
  }

  function start() {
    wall.reset();
    paddle.setProgress(0, wall.total);
    setScore(0);
    setLives(START_LIVES);
    serve();
  }

  function launch() {
    if (state !== "serving") return false;
    ball.release(currentSpeed());
    setState("running");
    return true;
  }

  function pause() {
    if (state !== "running") return false;
    setState("paused");
    return true;
  }

  function resume() {
    if (state !== "paused") return false;
    setState("running");
    return true;
  }

  function loseLife() {
    setLives(lives - 1);

    if (lives <= 0) {
      setState("over");
      return;
    }

    serve();
  }

  // Advances the simulation by dt seconds. A no-op unless the ball is in play, so a
  // caller can drive this every frame without checking the state first.
  function step(dt) {
    if (state !== "running") return;

    const hits = ball.step(dt, { walls, bricks: wall.bricks, paddle: paddle.bounds });

    for (const hit of hits) {
      if (hit.kind === "brick") {
        const gained = wall.destroy(hit.brick);
        if (gained === 0) continue;

        setScore(score + gained);
        // Shrinking the paddle as the wall comes down is what keeps a cleared run
        // interesting instead of a formality.
        paddle.setProgress(wall.total - wall.remaining, wall.total);
        ball.setSpeed(currentSpeed());

        if (wall.isCleared) {
          setState("over");
          return;
        }
      } else if (hit.kind === "paddle") {
        ball.steerFromPaddle(hit.offset);
      }
    }

    // Checked after the hits are resolved rather than before, so a ball that clears
    // the paddle on the same frame it is hit does not cost a life.
    if (ball.isLost(BOARD_PX)) loseLife();
  }

  // One toggle rather than two modes the player has to learn: launch a waiting ball,
  // pause a live one, resume a paused one, or start a fresh run.
  function primaryAction() {
    if (state === "serving") return launch();
    if (state === "running") return pause();
    if (state === "paused") return resume();
    start();
    return true;
  }

  return {
    step,
    primaryAction,
    start,

    get state() { return state; },
    get lives() { return lives; },
    get score() { return score; },
    get wall() { return wall; },
    get ball() { return ball; },
    get paddle() { return paddle; },
  };
}