"use strict";

import { DIRECTIONS } from "../core/config.js";

const MOVE_KEYS = {
  arrowup: DIRECTIONS.up,
  w: DIRECTIONS.up,
  arrowdown: DIRECTIONS.down,
  s: DIRECTIONS.down,
  arrowleft: DIRECTIONS.left,
  a: DIRECTIONS.left,
  arrowright: DIRECTIONS.right,
  d: DIRECTIONS.right,
};

const SWIPE_THRESHOLD_PX = 24;

// Owns every input path: arrow keys and WASD steer, Space/Enter (or a tap)
// starts, pauses, and resumes, and swipe gestures drive the snake.
export function createInput({ onDirection, onToggleRun, element }) {
  let pointerOrigin = null;

  function handleKey(event) {
    const key = event.key.toLowerCase();
    if (key === " " || key === "enter") {
      event.preventDefault();
      onToggleRun();
      return;
    }
    const next = MOVE_KEYS[key];
    if (!next) return;
    event.preventDefault();
    onDirection({ x: next.x, y: next.y });
  }

  function handlePointerDown(event) {
    if (event.isPrimary === false) return;
    pointerOrigin = { x: event.clientX, y: event.clientY };
  }

  function handlePointerCancel() {
    pointerOrigin = null;
  }

  function handlePointerUp(event) {
    if (!pointerOrigin) return;
    const deltaX = event.clientX - pointerOrigin.x;
    const deltaY = event.clientY - pointerOrigin.y;
    pointerOrigin = null;

    const magnitude = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    // Anything short of a swipe counts as a tap. An earlier minimum distance
    // left a dead band where a slightly shaky click did nothing at all.
    if (magnitude < SWIPE_THRESHOLD_PX) {
      onToggleRun();
      return;
    }

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      onDirection({ x: deltaX > 0 ? 1 : -1, y: 0 });
    } else {
      onDirection({ x: 0, y: deltaY > 0 ? 1 : -1 });
    }
  }

  return {
    attach() {
      document.addEventListener("keydown", handleKey);
      element.addEventListener("pointerdown", handlePointerDown);
      element.addEventListener("pointerup", handlePointerUp);
      element.addEventListener("pointercancel", handlePointerCancel);
    },
    detach() {
      document.removeEventListener("keydown", handleKey);
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointerup", handlePointerUp);
      element.removeEventListener("pointercancel", handlePointerCancel);
    },
  };
}