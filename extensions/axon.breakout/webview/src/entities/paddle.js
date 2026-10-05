"use strict";

import {
  BOARD_PX,
  PADDLE_HEIGHT,
  PADDLE_MARGIN_BOTTOM,
  PADDLE_MIN_WIDTH,
  PADDLE_WIDTH,
} from "../core/config.js";
import { clamp } from "../core/utils.js";

// The paddle. Movement is expressed as a target center rather than a velocity, so
// the same object serves a pointer that teleports the paddle and a key that steps
// it a given distance, and both end up clamped to the walls.
export function createPaddle() {
  const state = {
    x: BOARD_PX / 2 - PADDLE_WIDTH / 2,
    width: PADDLE_WIDTH,
    targetCenter: BOARD_PX / 2,
  };

  function clampCenter(center) {
    return clamp(center, state.width / 2, BOARD_PX - state.width / 2);
  }

  // Built from state.width rather than the PADDLE_WIDTH constant, because the
  // paddle shrinks as the wall comes down and a bounds built from the constant
  // would hand the ball a collision box wider than the paddle actually drawn.
  function getBounds() {
    const top = BOARD_PX - PADDLE_MARGIN_BOTTOM - PADDLE_HEIGHT;
    return {
      x: state.x,
      y: top,
      left: state.x,
      right: state.x + state.width,
      top,
      bottom: top + PADDLE_HEIGHT,
      width: state.width,
      height: PADDLE_HEIGHT,
    };
  }

  // Shrinking the paddle as the wall comes down is what turns a cleared run into
  // a skill test, and it is why the width is derived from progress rather than
  // being a constant.
  function setProgress(cleared, total) {
    const ratio = total === 0 ? 0 : clamp(cleared / total, 0, 1);
    state.width = PADDLE_WIDTH - (PADDLE_WIDTH - PADDLE_MIN_WIDTH) * ratio;
    // The center is preserved rather than the nearest edge, so the paddle stays
    // under the player's aim as it narrows instead of sliding out from under it.
    state.x = clampCenter(state.targetCenter) - state.width / 2;
    state.targetCenter = state.x + state.width / 2;
  }

  return {
    get x() { return state.x; },
    get right() { return state.x + state.width; },
    get width() { return state.width; },
    get center() { return state.x + state.width / 2; },
    get top() { return getBounds().top; },
    get bounds() { return getBounds(); },

    // Pointer input: the paddle centers on the pointer, clamped to the walls.
    follow(pointerX) {
      state.targetCenter = clampCenter(pointerX);
      state.x = state.targetCenter - state.width / 2;
    },

    // Keyboard input: a caller-decided distance per call. input.js passes speed times
    // frame delta while a key is held and a single impulse for a tap, so a tap is
    // always worth the same amount regardless of how long the frame took.
    nudge(direction, distance) {
      if (direction === 0) return;
      state.targetCenter = clampCenter(state.targetCenter + direction * distance);
      state.x = state.targetCenter - state.width / 2;
    },

    setProgress,
  };
}