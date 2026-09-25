"use strict";

import { CELLS } from "../core/config.js";
import { cellKey, randomInt } from "../core/utils.js";

// The current food target. A regular apple is worth 1 point; a bonus apple is
// worth more and disappears if it is not eaten within its lifetime.
export function createFood() {
  let position = null;
  let kind = "regular";
  let expiresAt = Infinity;

  return {
    get kind() {
      return kind;
    },
    get position() {
      return position;
    },

    spawn(occupiedCells, bonus, bonusLifetimeMs) {
      const occupied = new Set(occupiedCells.map(cellKey));
      if (occupied.size >= CELLS * CELLS) return false;

      let next;
      do {
        next = { x: randomInt(0, CELLS - 1), y: randomInt(0, CELLS - 1) };
      } while (occupied.has(cellKey(next)));

      position = next;
      kind = bonus ? "bonus" : "regular";
      expiresAt = bonus ? Date.now() + bonusLifetimeMs : Infinity;
      return true;
    },

    expired(now) {
      return kind === "bonus" && now >= expiresAt;
    },
  };
}