"use strict";

import {
  CELLS,
  OBSTACLE_EVERY,
  OBSTACLE_HEAD_CLEARANCE,
  OBSTACLE_PLACEMENT_ATTEMPTS,
} from "../core/config.js";
import { cellKey, randomInt, vecEq } from "../core/utils.js";

// Static wall blocks that appear as the score climbs. A new block never touches
// the snake, the current food, or the head's clearance square, so a block cannot
// end a run the instant it spawns.
export function createObstacleField() {
  let blocks = [];
  let lastMilestone = 0;

  function placeBlock(snakeCells, foodCell) {
    const prohibited = snakeCells.map(cellKey);
    const head = snakeCells[snakeCells.length - 1];
    // The clearance is a full square around the head, not just the cells ahead
    // of it. A block is an instant loss the moment it appears, so leaving room
    // to turn in any direction is the difference between a near miss and a
    // death the player had no time to read.
    for (let dy = -OBSTACLE_HEAD_CLEARANCE; dy <= OBSTACLE_HEAD_CLEARANCE; dy += 1) {
      for (let dx = -OBSTACLE_HEAD_CLEARANCE; dx <= OBSTACLE_HEAD_CLEARANCE; dx += 1) {
        const nx = head.x + dx;
        const ny = head.y + dy;
        if (nx >= 0 && nx < CELLS && ny >= 0 && ny < CELLS) {
          prohibited.push(`${nx},${ny}`);
        }
      }
    }

    const blocked = new Set(prohibited);
    for (let attempt = 0; attempt < OBSTACLE_PLACEMENT_ATTEMPTS; attempt += 1) {
      const candidate = {
        x: randomInt(0, CELLS - 1),
        y: randomInt(0, CELLS - 1),
      };
      if (blocked.has(cellKey(candidate))) continue;
      if (foodCell && vecEq(candidate, foodCell)) continue;
      if (blocks.some((block) => vecEq(block, candidate))) continue;
      blocks.push(candidate);
      return;
    }
  }

  return {
    get blocks() {
      return blocks;
    },

    sync(score, snakeCells, foodCell) {
      const milestone = Math.floor(score / OBSTACLE_EVERY);
      while (lastMilestone < milestone) {
        lastMilestone += 1;
        placeBlock(snakeCells, foodCell);
      }
    },

    reset() {
      blocks = [];
      lastMilestone = 0;
    },
  };
}