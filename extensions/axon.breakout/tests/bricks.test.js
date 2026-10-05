import assert from "node:assert/strict";
import test from "node:test";

import {
  BOARD_PX,
  BRICK_COLUMNS,
  BRICK_GAP,
  BRICK_HEIGHT,
  BRICK_ROWS,
  ROW_SCORES,
} from "../webview/src/core/config.js";
import { createWall } from "../webview/src/entities/bricks.js";

test("the wall fills every cell of the grid", () => {
  const wall = createWall();
  assert.equal(wall.bricks.length, BRICK_COLUMNS * BRICK_ROWS);
  assert.equal(wall.total, BRICK_COLUMNS * BRICK_ROWS);
});

test("the wall starts fully intact", () => {
  const wall = createWall();
  assert.equal(wall.remaining, wall.total);
  assert.equal(wall.isCleared, false);
});

test("every brick sits inside the playfield", () => {
  const wall = createWall();
  for (const brick of wall.bricks) {
    assert.ok(brick.left >= 0, `brick ${brick.id} starts left of the wall`);
    assert.ok(brick.right <= BOARD_PX, `brick ${brick.id} runs past the right wall`);
    assert.ok(brick.width > 0 && brick.height > 0, `brick ${brick.id} has no area`);
  }
});

test("no two bricks overlap", () => {
  // Overlapping bricks make the wall unsolvable in the overlap, since one hit
  // takes out the space of two and the layout looks broken rather than hard.
  const wall = createWall();
  for (let i = 0; i < wall.bricks.length; i += 1) {
    for (let j = i + 1; j < wall.bricks.length; j += 1) {
      const a = wall.bricks[i];
      const b = wall.bricks[j];
      const overlap = a.left < b.right && a.right > b.left &&
        a.top < b.bottom && a.bottom > b.top;
      assert.equal(overlap, false, `bricks ${a.id} and ${b.id} overlap`);
    }
  }
});

test("the gap between bricks is the configured gap", () => {
  const wall = createWall();
  const first = wall.bricks[0];
  const second = wall.bricks[1];
  const horizontal = second.left - first.right;

  assert.ok(Math.abs(horizontal - BRICK_GAP) < 1e-9);
  assert.ok(Math.abs(wall.bricks[BRICK_COLUMNS].top - first.bottom - BRICK_GAP) < 1e-9);
});

test("a brick's bounds agree with its draw position", () => {
  // Collision and rendering both read these, so a mismatch would mean the ball
  // bounces off a brick the player cannot see.
  const wall = createWall();
  for (const brick of wall.bricks) {
    assert.ok(Math.abs(brick.right - (brick.x + brick.width)) < 1e-9);
    assert.ok(Math.abs(brick.bottom - (brick.y + brick.height)) < 1e-9);
    assert.ok(Math.abs(brick.top - brick.y) < 1e-9);
    assert.ok(Math.abs(brick.left - brick.x) < 1e-9);
  }
});

test("every row scores differently and the bottom row is worth the most", () => {
  // Scoring by row is what makes the top of the wall worth clearing rather than
  // letting a player farm the nearest row forever.
  const wall = createWall();
  for (let row = 1; row < BRICK_ROWS; row += 1) {
    assert.ok(ROW_SCORES[row] > ROW_SCORES[row - 1], `row ${row} must outscore row ${row - 1}`);
  }
});

test("breaking a brick scores it and removes it", () => {
  const wall = createWall();
  const brick = wall.bricks[BRICK_COLUMNS * (BRICK_ROWS - 1)];

  assert.equal(wall.destroy(brick), ROW_SCORES[BRICK_ROWS - 1]);
  assert.equal(brick.alive, false);
  assert.equal(wall.remaining, wall.total - 1);
});

test("breaking the same brick twice scores nothing the second time", () => {
  // A single frame can produce two sub-steps inside the same brick. Scoring it
  // twice would inflate the total without the player having done anything extra.
  const wall = createWall();
  const brick = wall.bricks[0];

  assert.equal(wall.destroy(brick), ROW_SCORES[0]);
  assert.equal(wall.destroy(brick), 0);
  assert.equal(wall.destroy(brick), 0);
  assert.equal(wall.remaining, wall.total - 1);
});

test("clearing the whole wall wins", () => {
  const wall = createWall();
  for (const brick of wall.bricks) wall.destroy(brick);

  assert.equal(wall.remaining, 0);
  assert.equal(wall.isCleared, true);
});

test("reset restores every brick", () => {
  const wall = createWall();
  for (const brick of wall.bricks.slice(0, 5)) wall.destroy(brick);
  assert.equal(wall.remaining, wall.total - 5);

  wall.reset();

  assert.equal(wall.remaining, wall.total);
  assert.equal(wall.isCleared, false);
  assert.ok(wall.bricks.every((brick) => brick.alive));
});

test("reset rebuilds the same layout", () => {
  // A reset that shifted the wall would let a player farm a different brick order
  // on the next attempt than the one they had learned.
  const before = createWall().bricks.map(({ x, y, width, height }) => ({ x, y, width, height }));
  const wall = createWall();
  wall.destroy(wall.bricks[0]);
  wall.reset();
  const after = wall.bricks.map(({ x, y, width, height }) => ({ x, y, width, height }));

  assert.deepEqual(after, before);
});

test("bricks are stacked top to bottom in row order", () => {
  const wall = createWall();
  for (let row = 0; row < BRICK_ROWS; row += 1) {
    const brick = wall.bricks[row * BRICK_COLUMNS];
    assert.equal(brick.row, row);
    assert.ok(Math.abs(brick.y - (wall.bricks[0].y + row * (BRICK_HEIGHT + BRICK_GAP))) < 1e-9);
  }
});