"use strict";

import {
  BOARD_PX,
  BRICK_COLUMNS,
  BRICK_GAP,
  BRICK_HEIGHT,
  BRICK_INSET,
  BRICK_ROWS,
  BRICK_TOP,
  ROW_SCORES,
} from "../core/config.js";

// The brick wall. Bricks are plain rectangles with an alive flag and a row index,
// which is all the ball's collision pass and the renderer each need from them.
export function createWall() {
  let bricks = [];

  function build() {
    const usable = BOARD_PX - BRICK_INSET * 2;
    const gapTotal = BRICK_GAP * (BRICK_COLUMNS - 1);
    const width = (usable - gapTotal) / BRICK_COLUMNS;

    bricks = [];
    for (let row = 0; row < BRICK_ROWS; row += 1) {
      for (let column = 0; column < BRICK_COLUMNS; column += 1) {
        bricks.push({
          id: `${row}-${column}`,
          row,
          column,
          x: BRICK_INSET + column * (width + BRICK_GAP),
          y: BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP),
          width,
          height: BRICK_HEIGHT,
          alive: true,
          left: BRICK_INSET + column * (width + BRICK_GAP),
          top: BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP),
        });
      }
    }

    // Bounds are derived rather than stored so a change to the wall layout cannot
    // leave a brick's collision box disagreeing with its draw position.
    for (const brick of bricks) {
      brick.right = brick.x + brick.width;
      brick.bottom = brick.y + brick.height;
    }
  }

  build();

  return {
    get bricks() { return bricks; },
    get remaining() { return bricks.filter((brick) => brick.alive).length; },
    get total() { return bricks.length; },
    get isCleared() { return bricks.every((brick) => !brick.alive); },

    // Returns the brick's score, or 0 if it was already down. Returning 0 for the
    // second hit is what stops one brick from being scored twice when two
    // sub-steps land inside it in the same frame.
    // Named destroy rather than break because break is reserved.
    destroy(brick) {
      if (!brick.alive) return 0;
      brick.alive = false;
      return ROW_SCORES[brick.row] ?? 1;
    },

    reset() {
      build();
    },
  };
}