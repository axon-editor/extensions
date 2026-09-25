"use strict";

import { createGame } from "./core/game.js";

const elements = {
  score: document.getElementById("score"),
  best: document.getElementById("best"),
  start: document.getElementById("start"),
  message: document.getElementById("message"),
  overlay: document.getElementById("overlay"),
};

const game = createGame({
  canvas: document.getElementById("board"),
  elements,
});

game.init();