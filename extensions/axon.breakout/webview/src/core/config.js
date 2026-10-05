"use strict";

// Board geometry. The playfield is square so the canvas needs only one dimension
// to size itself, and the brick wall sits in the upper band with a HUD gutter
// above it that the renderer leaves empty.
export const BOARD_PX = 480;

// Brick wall layout: BRICK_ROWS rows of BRICK_COLUMNS, inset from both walls so
// a ball travelling along the ceiling never clips a brick's side.
export const BRICK_COLUMNS = 10;
export const BRICK_ROWS = 6;
export const BRICK_INSET = 14;
export const BRICK_GAP = 5;
export const BRICK_HEIGHT = 24;
export const BRICK_TOP = 56;

// Paddle: the width shrinks as the run progresses so late game stays hard.
export const PADDLE_WIDTH = 96;
export const PADDLE_MIN_WIDTH = 62;
export const PADDLE_HEIGHT = 13;
export const PADDLE_MARGIN_BOTTOM = 34;

// Keyboard paddle movement is a velocity scaled by the frame delta rather than a
// fixed distance per frame, so the paddle crosses the board at the same speed on a
// 60Hz and a 120Hz display. Sized at roughly one board width per second, which
// tracks the ball's fastest horizontal travel without teleporting past it.
export const PADDLE_KEYBOARD_SPEED_PX_PER_S = 480;

// A tap shorter than one frame still has to move the paddle, otherwise a quick
// press registers the keydown and the keyup without a frame ever seeing the key
// held, and the paddle appears frozen while the key is being used normally.
export const PADDLE_TAP_NUDGE_PX = 18;

// Ball. BASE_SPEED_PX_PER_S climbs toward MAX_SPEED_PX_PER_S as bricks fall, and
// every bounce applies MIN_VERTICAL_RATIO to the vertical component so a ball can
// never end up skimming flat along a wall and stalling the run.
export const BALL_RADIUS = 8;
export const BASE_SPEED_PX_PER_S = 340;
export const MAX_SPEED_PX_PER_S = 620;
export const SPEED_PER_BRICK = 7;
export const MIN_VERTICAL_RATIO = 0.28;

// How many ghosts trail the ball. Short, because the trail exists to show speed and
// a long one reads as a comet rather than a ball in motion.
export const TRAIL_STEPS = 3;

// Serve: the ball leaves the paddle at this angle off vertical, aimed into the
// field rather than straight up.
export const SERVE_ANGLE_DEG = 24;

// Physics integration. The ball is moved in sub-steps no longer than
// MAX_SUBSTEP_PX so it cannot pass through a brick between two frames, however
// fast it gets.
export const MAX_SUBSTEP_PX = 4;
export const MAX_FRAME_DT = 1 / 30;

// Paddle steering: how far off center a hit steers the outgoing angle, capped so
// a hit at the very edge cannot send the ball sideways into a long stall.
export const PADDLE_STEER_MAX_RATIO = 0.85;

export const START_LIVES = 3;

export const BEST_KEY = "axon.breakout.best";

// Each brick row scores differently so clearing the wall is worth more than
// farming the bottom rows.
export const ROW_SCORES = [1, 2, 3, 4, 5, 6];

// Breakout's own palette. Deliberately disjoint from Snake's blues and reds so
// the two games read as separate products while sharing the same visual skeleton.
export const COLORS = {
  background: "#0b1020",
  backdropGlow: "rgba(124, 92, 255, 0.08)",
  playfieldEdge: "#1b2140",
  paddle: "#2dd4bf",
  paddleHighlight: "#5eead4",
  paddleGlow: "rgba(45, 212, 191, 0.4)",
  ball: "#fbbf24",
  ballHighlight: "#fde68a",
  ballGlow: "rgba(251, 191, 36, 0.45)",
  brickRow0: "#7c5cff",
  brickRow1: "#6d5bd0",
  brickRow2: "#5e4fb8",
  brickRow3: "#4f4499",
  brickRow4: "#40387a",
  brickRow5: "#322d5c",
  brickEdge: "rgba(255, 255, 255, 0.14)",
};