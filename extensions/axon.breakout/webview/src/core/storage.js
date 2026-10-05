"use strict";

import { BEST_KEY } from "./config.js";

export function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function writeBest(score) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Storage can be unavailable inside a sandboxed view; the session still
    // plays, it just cannot persist the best score.
  }
}