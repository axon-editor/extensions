import assert from "node:assert/strict";
import test from "node:test";

import { CELLS, COLORS } from "../webview/src/core/config.js";
import { createRenderer } from "../webview/src/render/renderer.js";
import { createSnake } from "../webview/src/entities/snake.js";

// The renderer only needs a 2d context, so every method is recorded through a
// proxy instead of a real canvas. That keeps the tests runnable in node while
// still asserting the exact geometry the snake is painted at.
function recordingCanvas({ cssSize = 480, pixelRatio = 2 } = {}) {
  const calls = [];
  const store = {};
  const ctx = new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== "string") return undefined;
      return (...args) => { calls.push({ method: prop, args }); };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });

  const canvas = {
    clientWidth: cssSize,
    clientHeight: cssSize,
    width: cssSize,
    height: cssSize,
    getContext: () => ctx,
  };

  return { canvas, calls };
}

function withWindow(pixelRatio, run) {
  const original = globalThis.window;
  globalThis.window = { devicePixelRatio: pixelRatio };
  try {
    return run();
  } finally {
    globalThis.window = original;
  }
}

const straightSnake = () => createSnake([
  { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 },
]);

const roundRects = (calls) =>
  calls.filter((call) => call.method === "roundRect").map((call) => call.args);

// Head x in canvas pixels at a given interpolation ratio, derived from the same
// cell math the renderer uses so the assertion does not hardcode a layout.
function headX(renderRatio, previousX, targetX, cellSize) {
  const eased = renderRatio < 0.5
    ? 2 * renderRatio * renderRatio
    : 1 - Math.pow(-2 * renderRatio + 2, 2) / 2;
  const lerp = previousX + (targetX - previousX) * eased;
  return (lerp + 0.5) * cellSize - cellSize / 2 + 0.5;
}

test("every color the renderer reads is defined", () => {
  // bonusHighlight was read but never declared, which left the specular dot on
  // the bonus apple painting in the apple's own color.
  const read = [
    "background", "gridEven", "gridOdd", "obstacle", "obstacleEdge",
    "food", "foodHighlight", "bonus", "bonusHighlight", "bonusGlow",
    "snakeBody", "particle", "particleBonus",
  ];
  for (const key of read) {
    assert.equal(typeof COLORS[key], "string", `COLORS.${key} must be a string`);
  }
});

test("the backing store follows the device pixel ratio", () => {
  withWindow(2, () => {
    const { canvas } = recordingCanvas({ cssSize: 480, pixelRatio: 2 });
    createRenderer(canvas);
    assert.equal(canvas.width, 960);
    assert.equal(canvas.height, 960);
  });
});

test("the board keeps its css size when the ratio changes", () => {
  withWindow(1, () => {
    const { canvas, calls } = recordingCanvas({ cssSize: 480 });
    const renderer = createRenderer(canvas);
    assert.equal(canvas.width, 480);
    assert.equal(renderer.cellPixels, 480 / CELLS);

    // Moving the window to a HiDPI display re-sizes the backing store and has to
    // recompute the cell size, or every later particle lands on the wrong cell.
    globalThis.window = { devicePixelRatio: 3 };
    renderer.resize();
    assert.equal(canvas.width, 1440);
    assert.equal(renderer.cellPixels, 480 / CELLS);

    const transforms = calls.filter((call) => call.method === "setTransform");
    assert.equal(transforms.length, 2, "the transform must be reapplied per resize");
    assert.deepEqual(transforms[1].args, [3, 0, 0, 3, 0, 0]);
  });
});

test("the head interpolates from the previous head while the body grows", () => {
  withWindow(1, () => {
    const { canvas, calls } = recordingCanvas({ cssSize: 480 });
    const renderer = createRenderer(canvas);
    const snake = straightSnake();

    // Growth appends a head without shifting the body, so the new head has no
    // entry at its own index in prevCells.
    snake.step({ x: 6, y: 5 }, true);
    renderer.draw({ snake, food: { position: null, kind: "regular" }, blocks: [], renderRatio: 0, time: 0 });

    const cellSize = 480 / CELLS;
    assert.ok(roundRects(calls).some((args) => args[0] === headX(0, 5, 6, cellSize)));
    assert.ok(
      !roundRects(calls).some((args) => args[0] === headX(1, 5, 6, cellSize)),
      "the head must not snap to its destination cell on the tick it grows",
    );
  });
});

test("a steady tick still interpolates across the cell it travelled", () => {
  withWindow(1, () => {
    const { canvas, calls } = recordingCanvas({ cssSize: 480 });
    const renderer = createRenderer(canvas);
    const snake = straightSnake();

    snake.step({ x: 6, y: 5 }, false);
    renderer.draw({ snake, food: { position: null, kind: "regular" }, blocks: [], renderRatio: 1, time: 0 });

    const cellSize = 480 / CELLS;
    assert.ok(roundRects(calls).some((args) => args[0] === headX(1, 5, 6, cellSize)));
  });
});

test("the pixel ratio is watched even when no resize event fires", () => {
  // Dragging a window between displays changes the ratio without changing the
  // CSS box, so nothing else in the page would notice.
  const listeners = new Map();
  const queries = [];
  let ratio = 1;
  const originalWindow = globalThis.window;

  globalThis.window = {
    get devicePixelRatio() { return ratio; },
    matchMedia: (query) => {
      const media = {
        query,
        addEventListener: (type, fn) => listeners.set(`${query}:${type}`, fn),
        removeEventListener: (type) => listeners.delete(`${query}:${type}`),
      };
      queries.push(media);
      return media;
    },
  };

  try {
    const { canvas } = recordingCanvas({ cssSize: 480 });
    const renderer = createRenderer(canvas);
    const stop = renderer.observePixelRatio();
    assert.equal(canvas.width, 480);
    assert.deepEqual(queries[0].query, "(resolution: 1dppx)");

    // The window lands on a HiDPI display and the stale query fires.
    ratio = 2;
    listeners.get("(resolution: 1dppx):change")();
    assert.equal(canvas.width, 960, "the board must follow the ratio without a resize");

    // A second change has to be caught by a fresh query, since the old one has
    // stopped matching.
    ratio = 3;
    listeners.get("(resolution: 2dppx):change")();
    assert.equal(canvas.width, 1440);

    stop();
    assert.equal(listeners.size, 0, "the watcher must be removable");
  } finally {
    globalThis.window = originalWindow;
  }
});