"use strict";

import {
  BOARD_PX,
  PADDLE_KEYBOARD_SPEED_PX_PER_S,
  PADDLE_TAP_NUDGE_PX,
} from "../core/config.js";
import { clamp } from "../core/utils.js";

// Arrow keys and A/D are both bound because the left hand reaches for one and the
// right for the other, and neither should be a dead key on this board.
const MOVE_KEYS = {
  arrowleft: -1,
  a: -1,
  arrowright: 1,
  d: 1,
};

// Owns every input path: the pointer or a touch drag slides the paddle, the
// direction keys move it, and Space or Enter drives the state machine.
//
// Every listener is attached to the board rather than the document, unlike Snake.
// Breakout's primary control is horizontal pointer position, so a document-level
// move would drag the paddle around while the pointer was anywhere in the tab.
export function createInput() {
  let dragging = false;
  let pendingDirection = 0;
  // A keydown that arrives without its keyup having been seen by a frame yet. The
  // two OS events can both land between two frames, and without this a quick tap
  // sets the direction and clears it again before update() ever runs.
  let tapDirection = 0;
  let onPaddleMove = null;
  let onPaddleNudge = null;
  let onPrimary = null;
  let board = null;

  // The board's own rect, read fresh on each move, because the canvas is repositioned
  // when the surrounding layout reflows.
  function toBoardX(clientX) {
    const rect = board.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * BOARD_PX, 0, BOARD_PX);
  }

  // Resolved from the element rather than read off the global, so the module works
  // in any window and can be driven by a test with a stub.
  function view() {
    return board.ownerDocument.defaultView;
  }

  function handlePointerDown(event) {
    if (event.isPrimary === false) return;
    dragging = true;
    board.setPointerCapture?.(event.pointerId);
    onPaddleMove?.(toBoardX(event.clientX));
  }

  function handlePointerMove(event) {
    // Only moves, never a bare down, so a tap on the board nudges the paddle to
    // the pointer without also being read as a swipe.
    if (!dragging) return;
    onPaddleMove?.(toBoardX(event.clientX));
  }

  function handlePointerUp(event) {
    if (!dragging) return;
    dragging = false;
    board.releasePointerCapture?.(event.pointerId);
  }

  function handlePointerCancel() {
    dragging = false;
  }

  function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key === " " || key === "enter") {
      event.preventDefault();
      onPrimary?.();
      return;
    }

    const direction = MOVE_KEYS[key];
    if (direction === undefined) return;
    event.preventDefault();
    // Latched rather than applied per keypress, so holding a key sweeps the
    // paddle smoothly instead of jumping one step per OS key repeat.
    pendingDirection = direction;
    tapDirection = direction;
  }

  function handleKeyUp(event) {
    const direction = MOVE_KEYS[event.key.toLowerCase()];
    if (direction !== undefined && pendingDirection === direction) {
      pendingDirection = 0;
    }
  }

  // Called once per frame by the game loop, so held-key movement is integrated
  // with the same clock as the ball instead of on its own timer.
  //
  // dt scales the held-key movement, which is what keeps the paddle the same speed
  // regardless of refresh rate. The tap distance is a constant because it is a
  // single impulse, not a rate, so there is no frame time to scale it by.
  function update(dt = 0) {
    if (pendingDirection !== 0) {
      onPaddleNudge?.(pendingDirection, PADDLE_KEYBOARD_SPEED_PX_PER_S * dt);
      tapDirection = 0;
      return;
    }

    // The key is already up but a press was seen since the last frame, so the
    // paddle still gets the one nudge that press meant.
    if (tapDirection !== 0) {
      onPaddleNudge?.(tapDirection, PADDLE_TAP_NUDGE_PX);
      tapDirection = 0;
    }
  }

  return {
    // Named for what the game loop needs it for rather than what the browser
    // calls the event, so a caller does not have to know it is the repeat loop.
    update,

    attach(options) {
      onPaddleMove = options.onPaddleMove ?? null;
      onPaddleNudge = options.onPaddleNudge ?? null;
      onPrimary = options.onPrimary ?? null;
      board = options.element;

      board.addEventListener("pointerdown", handlePointerDown);
      board.addEventListener("pointermove", handlePointerMove);
      board.addEventListener("pointerup", handlePointerUp);
      board.addEventListener("pointercancel", handlePointerCancel);
      // On the window, not the board: the canvas is not focusable, so a key pressed
      // while the pointer is elsewhere in the tab would otherwise do nothing.
      view().addEventListener("keydown", handleKeyDown);
      view().addEventListener("keyup", handleKeyUp);
    },

    detach() {
      board.removeEventListener("pointerdown", handlePointerDown);
      board.removeEventListener("pointermove", handlePointerMove);
      board.removeEventListener("pointerup", handlePointerUp);
      board.removeEventListener("pointercancel", handlePointerCancel);
      view().removeEventListener("keydown", handleKeyDown);
      view().removeEventListener("keyup", handleKeyUp);
      board = null;
      dragging = false;
      pendingDirection = 0;
      tapDirection = 0;
    },
  };
}