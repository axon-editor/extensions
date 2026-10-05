"use strict";

// Board and pacing.
export const CELLS = 24;
export const BASE_TICK_MS = 150;
export const MIN_TICK_MS = 70;
export const TICK_STEP_MS = 4;

// Food rules: every BONUS_EVERY apple the next one is a golden bonus worth
// BONUS_SCORE points, and it disappears after BONUS_LIFETIME_MS.
export const BONUS_EVERY = 5;
export const BONUS_SCORE = 5;
export const BONUS_LIFETIME_MS = 8000;

// Obstacle rules: one wall block every OBSTACLE_EVERY score points. A block is
// kept OBSTACLE_HEAD_CLEARANCE cells away from the head on both axes so it can
// never spawn on the snake, and OBSTACLE_PLACEMENT_ATTEMPTS random rolls give
// up quietly when the board has no legal cell left.
export const OBSTACLE_EVERY = 6;
export const OBSTACLE_HEAD_CLEARANCE = 2;
export const OBSTACLE_PLACEMENT_ATTEMPTS = 200;

// Effects: burst sizes for an ordinary apple, a bonus apple, and a crash.
export const PARTICLE_COUNT = 12;
export const BONUS_PARTICLE_COUNT = 18;
export const CRASH_PARTICLE_COUNT = 14;

export const START_LENGTH = 3;

export const BEST_KEY = "axon.snake.best";

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const COLORS = {
  background: "#010409",
  gridEven: "rgba(255,255,255,0.014)",
  gridOdd: "rgba(255,255,255,0.008)",
  snakeBody: "#58a6ff",
  food: "#f85149",
  foodHighlight: "#ff7b72",
  bonus: "#f2cc60",
  bonusHighlight: "#ffe9a3",
  bonusGlow: "rgba(242,204,96,0.35)",
  obstacle: "#2d333b",
  obstacleEdge: "#444c56",
  particle: "#8bcbff",
  particleBonus: "#ffe08a",
};