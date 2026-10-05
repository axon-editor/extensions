"use strict";

import {
  BALL_RADIUS,
  MAX_SUBSTEP_PX,
  MIN_VERTICAL_RATIO,
  PADDLE_STEER_MAX_RATIO,
  SERVE_ANGLE_DEG,
} from "../core/config.js";
import { clamp, degToRad, normalize } from "../core/utils.js";

// The ball and its sub-stepped movement.
//
// Stepping is the reason this file owns movement instead of letting the game loop
// advance x and y directly: a ball moving fast enough to cross a brick between
// two rendered frames would otherwise pass straight through it. Movement is
// split into slices no longer than MAX_SUBSTEP_PX and each slice is resolved
// against the world on its own.
//
// Every function takes the world as an argument rather than importing it, which is
// what lets the whole file run in node with no canvas.
export function createBall() {
  const state = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
    speed: 0,
    held: true,
  };

  // Circle-versus-rectangle on the axis of least penetration. Resolving off the
  // nearest face instead sends a ball that clips a brick's corner back into the
  // wall it just came from, which is the classic breakout physics bug.
  function circleVsRect(rect) {
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const dx = state.x - (rect.left + halfWidth);
    const dy = state.y - (rect.top + halfHeight);
    const overlapX = halfWidth + state.radius - Math.abs(dx);
    const overlapY = halfHeight + state.radius - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return null;

    if (overlapX < overlapY) return { nx: dx < 0 ? -1 : 1, ny: 0, penetration: overlapX };
    return { nx: 0, ny: dy < 0 ? -1 : 1, penetration: overlapY };
  }

  // Specular reflection about the surface normal. Using the dot product instead of
  // flipping a component keeps the speed identical, so no collision can quietly
  // slow the ball down.
  function bounceOff(rect) {
    const hit = circleVsRect(rect);
    if (!hit) return false;

    state.x += hit.nx * hit.penetration;
    state.y += hit.ny * hit.penetration;

    const dot = state.vx * hit.nx + state.vy * hit.ny;
    state.vx -= 2 * dot * hit.nx;
    state.vy -= 2 * dot * hit.ny;
    constrainAngle();
    return true;
  }

  // Keeps every outgoing angle inside a usable cone. A ball that clips a brick
  // corner can otherwise leave almost horizontally and then bounce along the
  // ceiling for seconds, stalling the run.
  function constrainAngle() {
    let { vx, vy } = normalize(state.vx, state.vy);

    if (Math.abs(vy) < MIN_VERTICAL_RATIO) {
      const horizontal = Math.sqrt(Math.max(0, 1 - MIN_VERTICAL_RATIO * MIN_VERTICAL_RATIO));
      vx = (Math.sign(vx) || 1) * horizontal;
      vy = (vy < 0 ? -1 : 1) * MIN_VERTICAL_RATIO;
    }

    state.vx = vx * state.speed;
    state.vy = vy * state.speed;
  }

  return {
    get x() { return state.x; },
    get y() { return state.y; },
    get vx() { return state.vx; },
    get vy() { return state.vy; },
    get radius() { return state.radius; },
    get speed() { return state.speed; },
    get held() { return state.held; },
    get bounds() {
      return {
        left: state.x - state.radius,
        right: state.x + state.radius,
        top: state.y - state.radius,
        bottom: state.y + state.radius,
      };
    },

    // Parks the ball on the paddle aimed off vertical, so the first serve heads
    // into the field instead of straight up the middle.
    holdOn(paddle) {
      state.held = true;
      state.x = paddle.x + paddle.width / 2;
      state.y = paddle.top - state.radius;
      const angle = degToRad(SERVE_ANGLE_DEG);
      state.vx = Math.sin(angle);
      state.vy = -Math.cos(angle);
      state.speed = 0;
    },

    setPosition(x, y) {
      state.x = x;
      state.y = y;
    },

    // Direction and magnitude together, so a caller cannot set one without the
    // other and leave the ball's speed inconsistent with its direction.
    setVelocity(vx, vy, speed) {
      const unit = normalize(vx, vy);
      state.vx = unit.vx * speed;
      state.vy = unit.vy * speed;
      state.speed = speed;
    },

    setSpeed(speed) {
      const unit = normalize(state.vx, state.vy);
      state.vx = unit.vx * speed;
      state.vy = unit.vy * speed;
      state.speed = speed;
    },

    release(speed) {
      state.held = false;
      this.setSpeed(speed);
    },

    // Redirects off the point of contact on the paddle. offset is -1 at the left
    // tip and 1 at the right, so a player can aim the ball by where they catch it.
    //
    // The offset is capped short of the tip because the vertical component is
    // derived from it, and a full -1 or 1 works out to a vertical of zero. That
    // would hand the player a ball that leaves the paddle dead flat and then
    // bounces along the floor for the rest of the run.
    steerFromPaddle(offset) {
      const horizontal = clamp(offset, -PADDLE_STEER_MAX_RATIO, PADDLE_STEER_MAX_RATIO);
      const vertical = -Math.sqrt(Math.max(0, 1 - horizontal * horizontal));
      this.setVelocity(horizontal, vertical, state.speed);
    },

    // Advances the ball by dt seconds, resolving against the world on every
    // sub-step. Returns the surfaces touched in order, so the caller can score
    // each brick exactly once even when several sub-steps land inside one brick.
    step(dt, world) {
      if (state.speed === 0) return [];

      const count = Math.max(1, Math.ceil((state.speed * dt) / MAX_SUBSTEP_PX));
      const sliceDt = dt / count;
      const hits = [];

      for (let index = 0; index < count; index += 1) {
        state.x += state.vx * sliceDt;
        state.y += state.vy * sliceDt;

        for (const wall of world.walls ?? []) {
          if (bounceOff(wall)) hits.push(wall.kind);
        }

        for (const brick of world.bricks ?? []) {
          if (brick.alive && bounceOff(brick)) hits.push({ kind: "brick", brick });
        }

        const paddle = world.paddle;
        if (paddle && bounceOff(paddle)) {
          // Measured before steering so the redirect reflects where the ball
          // actually landed on the paddle face.
          const offset = (state.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
          hits.push({ kind: "paddle", offset });
        }
      }

      return hits;
    },

    // True once the ball has fallen past the paddle, which is the loss condition
    // rather than a collision test, since a ball can also drop past the side of a
    // short paddle without ever overlapping it.
    isLost(floorY) {
      return state.y - state.radius > floorY;
    },
  };
}