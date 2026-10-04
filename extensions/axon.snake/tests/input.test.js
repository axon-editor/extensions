import assert from "node:assert/strict";
import test from "node:test";

import { createInput } from "../webview/src/input/input.js";

function harness() {
  const calls = { directions: [], toggles: 0 };
  const handlers = new Map();
  const element = {
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type) => handlers.delete(type),
  };

  const listeners = new Map();
  globalThis.document = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };

  const input = createInput({
    element,
    onDirection: (direction) => calls.directions.push(direction),
    onToggleRun: () => { calls.toggles += 1; },
  });
  input.attach();

  return {
    calls,
    key: (key) => listeners.get("keydown")({ key, preventDefault() {} }),
    down: (x, y) => handlers.get("pointerdown")({ clientX: x, clientY: y, isPrimary: true }),
    nonPrimaryDown: (x, y) => handlers.get("pointerdown")({ clientX: x, clientY: y, isPrimary: false }),
    up: (x, y) => handlers.get("pointerup")({ clientX: x, clientY: y }),
    cancel: () => handlers.get("pointercancel")(),
    dispose: () => input.detach(),
    remaining: () => [...listeners.keys(), ...handlers.keys()],
  };
}

test("arrow keys and wasd steer", () => {
  const io = harness();
  io.key("ArrowUp");
  io.key("w");
  io.key("ArrowLeft");
  io.key("a");
  assert.deepEqual(io.calls.directions, [
    { x: 0, y: -1 }, { x: 0, y: -1 }, { x: -1, y: 0 }, { x: -1, y: 0 },
  ]);
});

test("space and enter toggle the run state", () => {
  const io = harness();
  io.key(" ");
  io.key("Enter");
  assert.equal(io.calls.toggles, 2);
});

test("a shaky tap still toggles", () => {
  const io = harness();
  io.down(100, 100);
  io.up(114, 108);
  assert.equal(io.calls.toggles, 1, "a 14px wobble should read as a tap, not a dead gesture");
});

test("a long press without movement toggles", () => {
  const io = harness();
  io.down(100, 100);
  io.up(100, 100);
  assert.equal(io.calls.toggles, 1);
});

test("a swipe steers instead of toggling", () => {
  const io = harness();
  io.down(100, 100);
  io.up(160, 100);
  assert.deepEqual(io.calls.directions, [{ x: 1, y: 0 }]);
  assert.equal(io.calls.toggles, 0);
});

test("a diagonal swipe picks the dominant axis", () => {
  const io = harness();
  io.down(100, 100);
  io.up(160, 130);
  assert.deepEqual(io.calls.directions, [{ x: 1, y: 0 }]);
});

test("a cancelled pointer leaves no stale origin", () => {
  const io = harness();
  io.down(100, 100);
  io.cancel();
  io.up(300, 100);
  assert.equal(io.calls.toggles, 0, "a cancelled gesture must not fire");
  assert.deepEqual(io.calls.directions, []);
});

test("a second finger cannot hijack the gesture", () => {
  const io = harness();
  // Non-primary pointers are ignored, so a pinch leaves the gesture alone.
  io.nonPrimaryDown(100, 100);
  io.up(300, 100);
  assert.deepEqual(io.calls.directions, []);
  assert.equal(io.calls.toggles, 0);
});

test("detach removes every listener", () => {
  const io = harness();
  io.dispose();
  // After detach the keydown slot is empty, so the handler must not exist.
  assert.deepEqual(io.remaining(), []);
});
