import assert from "node:assert/strict";
import test from "node:test";

import { createParticleSystem } from "../webview/src/entities/particles.js";

function countingContext() {
  const calls = { arcs: 0 };
  return {
    calls,
    ctx: new Proxy({}, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop !== "string") return undefined;
        return (...args) => { if (prop === "arc") calls.arcs += args.length > 0 ? 1 : 0; };
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }),
  };
}

test("emit fills the burst and update retires it", () => {
  const particles = createParticleSystem();
  const { calls, ctx } = countingContext();

  particles.emit(10, 20, "#8bcbff", 12);
  particles.render(ctx);
  assert.equal(calls.arcs, 12);

  // Ages every particle past its lifetime, which is what a long frame or a
  // backgrounded tab produces.
  particles.update(5);
  particles.render(ctx);
  assert.equal(calls.arcs, 12, "nothing new was drawn, the burst was already gone");
});

test("clear drops every particle so a restart starts clean", () => {
  const particles = createParticleSystem();
  const { calls, ctx } = countingContext();

  particles.emit(10, 20, "#ff7b72", 14);
  particles.render(ctx);
  assert.equal(calls.arcs, 14);

  // Without clear the crash burst from the previous run keeps drifting across
  // the board that just replaced it.
  particles.clear();
  particles.render(ctx);
  assert.equal(calls.arcs, 14, "clear left nothing behind to draw");
});

test("clear on an empty system is a no-op", () => {
  const particles = createParticleSystem();
  const { calls, ctx } = countingContext();

  particles.clear();
  particles.render(ctx);
  assert.equal(calls.arcs, 0);
});