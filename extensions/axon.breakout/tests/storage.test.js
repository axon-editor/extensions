import assert from "node:assert/strict";
import test from "node:test";

import { BEST_KEY } from "../webview/src/core/config.js";
import { readBest, writeBest } from "../webview/src/core/storage.js";

// storage.js reaches for the global localStorage, which does not exist in node, so
// it is installed here per test and removed again. A stub that records writes is
// enough, and it also stands in for a real storage failure.
function withStorage(impl) {
  const previous = globalThis.localStorage;
  globalThis.localStorage = impl;
  return () => {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  };
}

test("an absent best reads as zero", () => {
  const restore = withStorage({ getItem: () => null });
  try {
    assert.equal(readBest(), 0);
  } finally {
    restore();
  }
});

test("a stored best is read back", () => {
  const restore = withStorage({ getItem: () => "240" });
  try {
    assert.equal(readBest(), 240);
  } finally {
    restore();
  }
});

test("unreadable or corrupt storage reads as zero", () => {
  // A private-mode view or a corrupted entry must not stop the game from starting.
  for (const impl of [
    { getItem: () => "not a number" },
    { getItem: () => { throw new Error("denied"); } },
    undefined,
  ]) {
    const restore = withStorage(impl);
    try {
      assert.equal(readBest(), 0);
    } finally {
      restore();
    }
  }
});

test("writing a best stores it under the extension's key", () => {
  let written = null;
  const restore = withStorage({ setItem: (key, value) => { written = [key, value]; } });
  try {
    writeBest(180);
    assert.deepEqual(written, [BEST_KEY, "180"]);
  } finally {
    restore();
  }
});

test("a best round-trips through storage", () => {
  // The real flow is writeBest at game over and readBest on the next load, so the
  // two halves are checked together rather than only in isolation.
  const store = new Map();
  const restore = withStorage({
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  });
  try {
    writeBest(180);
    assert.equal(readBest(), 180);
  } finally {
    restore();
  }
});

test("storage that refuses writes is ignored", () => {
  // Storage throws in a sandboxed webview. Losing the best score is acceptable;
  // throwing out of the game-over path would leave the player on a dead board.
  const restore = withStorage({
    getItem: () => null,
    setItem: () => { throw new Error("quota exceeded"); },
  });
  try {
    assert.doesNotThrow(() => writeBest(90));
  } finally {
    restore();
  }
});
