import assert from "node:assert/strict";
import test from "node:test";

import { PADDLE_KEYBOARD_SPEED_PX_PER_S, PADDLE_TAP_NUDGE_PX } from "../webview/src/core/config.js";
import { createInput } from "../webview/src/input/input.js";

// A representative 60Hz frame, so a held key's nudge can be asserted as a distance.
const FRAME_DT = 1 / 60;

// A stand-in for the canvas and window, so input can be tested without a browser.
// Only the pieces input.js actually touches are implemented; anything else it
// reaches for is a bug worth failing on rather than silently returning undefined.
function fakeDom() {
  const listeners = new Map();

  // Keyed by target name and event type, which is the pair a test needs to fire one
  // specific listener without knowing anything about the handlers themselves.
  function addListener(name, type, handler) {
    const key = `${name}:${type}`;
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(handler);
  }

  function makeTarget(name) {
    return {
      name,
      captured: [],
      rect: { left: 100, top: 0, width: 480, height: 480 },
      getBoundingClientRect() { return this.rect; },
      addEventListener: (type, handler) => addListener(name, type, handler),
      removeEventListener: (type) => { listeners.set(`${name}:${type}`, []); },
      setPointerCapture(id) { this.captured.push(id); },
      releasePointerCapture(id) { this.captured = this.captured.filter((held) => held !== id); },
    };
  }

  const board = makeTarget("board");
  const windowTarget = makeTarget("window");
  board.ownerDocument = { defaultView: windowTarget };

  // Distances are recorded alongside the directions because the distance is the part
  // that carries the bug: a per-frame step instead of a scaled one makes the paddle
  // speed depend on the refresh rate.
  const recorded = { moves: [], nudges: [], distances: [], primaries: 0 };

  const input = createInput();
  input.attach({
    element: board,
    onPaddleMove: (x) => recorded.moves.push(x),
    onPaddleNudge: (direction, distance) => {
      recorded.nudges.push(direction);
      recorded.distances.push(distance);
    },
    onPrimary: () => { recorded.primaries += 1; },
  });

  function fire(target, type, event) {
    for (const handler of listeners.get(`${target.name}:${type}`) ?? []) handler(event);
  }

  return { board, windowTarget, recorded, input, fire };
}

test("a press on the board moves the paddle there immediately", () => {
  const { board, recorded, fire } = fakeDom();
  fire(board, "pointerdown", { pointerId: 1, clientX: 340, isPrimary: true });
  assert.deepEqual(recorded.moves, [240]);
});

test("the pointer position is scaled from CSS pixels to board units", () => {
  // The canvas is laid out at whatever size the window allows, so the pointer's CSS
  // offset has to be divided by the board's width before it means anything.
  const { board, recorded, fire } = fakeDom();
  board.rect = { left: 0, top: 0, width: 960, height: 960 };

  fire(board, "pointerdown", { pointerId: 1, clientX: 480, isPrimary: true });
  assert.deepEqual(recorded.moves, [240]);
});

test("the paddle does not move until the pointer is pressed", () => {
  const { board, recorded, fire } = fakeDom();
  fire(board, "pointermove", { pointerId: 1, clientX: 340, isPrimary: true });
  assert.deepEqual(recorded.moves, []);
});

test("dragging keeps steering and releasing stops it", () => {
  const { board, recorded, fire } = fakeDom();

  fire(board, "pointerdown", { pointerId: 1, clientX: 200, isPrimary: true });
  fire(board, "pointermove", { pointerId: 1, clientX: 260, isPrimary: true });
  fire(board, "pointerup", { pointerId: 1, clientX: 260, isPrimary: true });
  fire(board, "pointermove", { pointerId: 1, clientX: 340, isPrimary: true });

  assert.deepEqual(recorded.moves, [100, 160]);
});

test("a second finger does not hijack the paddle", () => {
  // Without this, a two-finger gesture on a trackpad steers with whichever finger
  // landed last, and the paddle jumps.
  const { board, recorded, fire } = fakeDom();
  fire(board, "pointerdown", { pointerId: 1, clientX: 200, isPrimary: true });
  fire(board, "pointerdown", { pointerId: 2, clientX: 400, isPrimary: false });
  assert.deepEqual(recorded.moves, [100]);
});

test("a cancelled drag releases the paddle", () => {
  // A pointercancel mid-drag would otherwise leave the paddle stuck to the cursor
  // for the rest of the session.
  const { board, recorded, fire } = fakeDom();

  fire(board, "pointerdown", { pointerId: 1, clientX: 200, isPrimary: true });
  fire(board, "pointercancel", { pointerId: 1 });
  fire(board, "pointermove", { pointerId: 1, clientX: 400, isPrimary: true });

  assert.deepEqual(recorded.moves, [100]);
});

test("space and enter both trigger the primary action", () => {
  const { windowTarget, recorded, fire } = fakeDom();
  fire(windowTarget, "keydown", { key: " ", preventDefault() {} });
  fire(windowTarget, "keydown", { key: "Enter", preventDefault() {} });
  assert.equal(recorded.primaries, 2);
});

test("a held arrow key latches and releases cleanly", () => {
  // Latched rather than applied per keypress, so holding a key sweeps the paddle
  // instead of jumping one step per the OS key repeat rate.
  const { windowTarget, recorded, input, fire } = fakeDom();

  fire(windowTarget, "keydown", { key: "ArrowLeft", preventDefault() {} });
  input.update(FRAME_DT);
  input.update(FRAME_DT);
  assert.deepEqual(recorded.nudges, [-1, -1]);

  fire(windowTarget, "keyup", { key: "ArrowLeft" });
  input.update(FRAME_DT);
  assert.deepEqual(recorded.nudges, [-1, -1]);
});

test("a held key moves the paddle by speed scaled to the frame", () => {
  // The distance has to come from the frame delta. A fixed step per frame would move
  // the paddle twice as fast on a 120Hz display as on a 60Hz one.
  const { windowTarget, recorded, input, fire } = fakeDom();

  fire(windowTarget, "keydown", { key: "ArrowRight", preventDefault() {} });
  input.update(FRAME_DT);

  assert.equal(recorded.distances[0], PADDLE_KEYBOARD_SPEED_PX_PER_S * FRAME_DT);
});

test("the paddle covers the same distance per second at any frame rate", () => {
  // Two half-length frames and one full-length frame describe the same second, so the
  // distances they add up to have to match.
  const fast = fakeDom();
  fast.fire(fast.windowTarget, "keydown", { key: "ArrowRight", preventDefault() {} });
  for (let i = 0; i < 120; i += 1) fast.input.update(1 / 120);

  const slow = fakeDom();
  slow.fire(slow.windowTarget, "keydown", { key: "ArrowRight", preventDefault() {} });
  for (let i = 0; i < 60; i += 1) slow.input.update(1 / 60);

  const total = (rec) => rec.distances.reduce((sum, value) => sum + value, 0);
  assert.ok(
    Math.abs(total(fast.recorded) - total(slow.recorded)) < 1e-9,
    "one second of held input travels the same distance at 60Hz and 120Hz",
  );
});

test("a tap shorter than one frame still nudges the paddle", () => {
  // The keydown and the keyup can both land between two frames. Clearing the latch on
  // the keyup meant the paddle never moved at all, so a quick press did nothing.
  const { windowTarget, recorded, input, fire } = fakeDom();

  fire(windowTarget, "keydown", { key: "ArrowRight", preventDefault() {} });
  fire(windowTarget, "keyup", { key: "ArrowRight" });
  input.update(FRAME_DT);

  assert.deepEqual(recorded.nudges, [1]);
  assert.equal(recorded.distances[0], PADDLE_TAP_NUDGE_PX);
});

test("a tap only nudges once, then stops", () => {
  // The queued tap is consumed by the first frame, so a quick press cannot double up
  // into a tap plus a held step.
  const { windowTarget, recorded, input, fire } = fakeDom();

  fire(windowTarget, "keydown", { key: "ArrowLeft", preventDefault() {} });
  fire(windowTarget, "keyup", { key: "ArrowLeft" });
  input.update(FRAME_DT);
  input.update(FRAME_DT);

  assert.deepEqual(recorded.nudges, [-1]);
});

test("holding a key past the first frame does not also fire the tap", () => {
  const { windowTarget, recorded, input, fire } = fakeDom();

  fire(windowTarget, "keydown", { key: "ArrowRight", preventDefault() {} });
  input.update(FRAME_DT);
  input.update(FRAME_DT);

  assert.deepEqual(recorded.distances, [
    PADDLE_KEYBOARD_SPEED_PX_PER_S * FRAME_DT,
    PADDLE_KEYBOARD_SPEED_PX_PER_S * FRAME_DT,
  ]);
});

test("A and D move the paddle the same way as the arrows", () => {
  const { windowTarget, recorded, input, fire } = fakeDom();

  fire(windowTarget, "keydown", { key: "a", preventDefault() {} });
  input.update(FRAME_DT);
  fire(windowTarget, "keyup", { key: "a" });
  fire(windowTarget, "keydown", { key: "D", preventDefault() {} });
  input.update(FRAME_DT);

  assert.deepEqual(recorded.nudges, [-1, 1]);
});

test("the last direction pressed wins until it is released", () => {
  const { windowTarget, recorded, input, fire } = fakeDom();

  fire(windowTarget, "keydown", { key: "ArrowLeft", preventDefault() {} });
  fire(windowTarget, "keydown", { key: "ArrowRight", preventDefault() {} });
  input.update(FRAME_DT);
  assert.deepEqual(recorded.nudges, [1], "the last key pressed wins");

  // Right is still down, so the paddle keeps moving right. Releasing the left key
  // must not clear the latch and stop it, which is what would happen if the state
  // were a boolean rather than the last direction seen.
  fire(windowTarget, "keyup", { key: "ArrowLeft" });
  input.update(FRAME_DT);
  assert.deepEqual(recorded.nudges, [1, 1]);
});

test("releasing a key that is not held is harmless", () => {
  const { windowTarget, recorded, input, fire } = fakeDom();
  fire(windowTarget, "keyup", { key: "ArrowLeft" });
  input.update(FRAME_DT);
  assert.deepEqual(recorded.nudges, []);
});

test("an unrelated key is ignored", () => {
  const { windowTarget, recorded, input, fire } = fakeDom();
  fire(windowTarget, "keydown", { key: "q", preventDefault() {} });
  input.update(FRAME_DT);
  assert.deepEqual(recorded.nudges, []);
  assert.equal(recorded.primaries, 0);
});

test("the game's keys do not scroll the page", () => {
  // Space launches and the left/right arrows are the paddle, so if either reaches
  // the browser it scrolls the whole tab instead of playing.
  const { windowTarget, fire } = fakeDom();
  const prevented = [];
  const track = { preventDefault: () => prevented.push(true) };

  fire(windowTarget, "keydown", { key: " ", ...track });
  fire(windowTarget, "keydown", { key: "ArrowLeft", ...track });
  fire(windowTarget, "keydown", { key: "ArrowRight", ...track });
  fire(windowTarget, "keydown", { key: "a", ...track });
  fire(windowTarget, "keydown", { key: "d", ...track });

  assert.equal(prevented.length, 5);
});

test("an unbound key is left for the browser", () => {
  // Only the keys the game uses are swallowed. Taking the whole keyboard would
  // break reload, tab switching and every other shortcut in the host editor.
  const { windowTarget, fire } = fakeDom();
  let prevented = false;

  fire(windowTarget, "keydown", { key: "Tab", preventDefault: () => { prevented = true; } });
  fire(windowTarget, "keydown", { key: "r", preventDefault: () => { prevented = true; } });

  assert.equal(prevented, false);
});

test("detaching stops every listener and clears the held key", () => {
  const { board, windowTarget, recorded, input, fire } = fakeDom();

  fire(windowTarget, "keydown", { key: "ArrowRight", preventDefault() {} });
  input.detach();
  input.update(FRAME_DT);
  fire(board, "pointerdown", { pointerId: 1, clientX: 300, isPrimary: true });

  assert.deepEqual(recorded.nudges, []);
  assert.deepEqual(recorded.moves, []);
  assert.equal(recorded.primaries, 0);
});

test("attaching without handlers is safe", () => {
  // The shell wires all three, but a partial attach should not throw.
  const input = createInput();
  const target = {
    name: "board",
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 480 }),
    ownerDocument: { defaultView: { addEventListener() {}, removeEventListener() {} } },
  };

  assert.doesNotThrow(() => {
    input.attach({ element: target });
    input.detach();
  });
});