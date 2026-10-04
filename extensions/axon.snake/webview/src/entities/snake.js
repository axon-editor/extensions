"use strict";

import { DIRECTIONS } from "../core/config.js";
import { vecEq } from "../core/utils.js";

// The snake model. Cells are ordered tail-first, head last. `prevCells` keeps
// the snapshot from before the latest step so the renderer can interpolate
// smooth motion between ticks.
export function createSnake(startCells) {
  const state = {
    cells: startCells.map((cell) => ({ ...cell })),
    prevCells: startCells.map((cell) => ({ ...cell })),
    direction: { ...DIRECTIONS.right },
    pendingDirection: null,
  };

  return {
    get cells() {
      return state.cells;
    },
    get prevCells() {
      return state.prevCells;
    },
    get direction() {
      return state.pendingDirection ?? state.direction;
    },

    head() {
      return state.cells[state.cells.length - 1];
    },

    setDirection(next) {
      // Only the turn that the next step will actually consume may be queued.
      // Validating against the queued turn instead lets two quick presses
      // compose into a reversal, which walks the head into its own neck.
      const current = state.pendingDirection ?? state.direction;
      const reverse = { x: -current.x, y: -current.y };
      if (vecEq(next, reverse)) return;
      if (state.pendingDirection) return;
      state.pendingDirection = { x: next.x, y: next.y };
    },

    nextHead() {
      const direction = state.pendingDirection ?? state.direction;
      const head = this.head();
      return { x: head.x + direction.x, y: head.y + direction.y };
    },

    wouldHitSelf(cell, grow) {
      // The tail vacates its cell on the same tick unless the snake grows, so
      // chasing it is a legal move and only counts as a crash while growing.
      const occupied = grow ? state.cells : state.cells.slice(1);
      return occupied.some((candidate) => vecEq(candidate, cell));
    },

    step(nextHead, grow) {
      state.prevCells = state.cells.map((cell) => ({ ...cell }));
      if (state.pendingDirection) {
        state.direction = state.pendingDirection;
        state.pendingDirection = null;
      }
      state.cells.push({ x: nextHead.x, y: nextHead.y });
      if (!grow) state.cells.shift();
    },
  };
}