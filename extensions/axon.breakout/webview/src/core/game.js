"use strict";

import { MAX_FRAME_DT } from "./config.js";
import { createInput } from "../input/input.js";
import { createRenderer } from "../render/renderer.js";
import { createSession } from "./session.js";
import { clamp } from "./utils.js";
import { readBest, writeBest } from "./storage.js";

// The shell around the game: canvas, HUD, input wiring and the animation loop.
// Every rule lives in session.js, so nothing here has to be understood to know
// how the game plays.
//
// The loop is continuous rather than on a fixed tick, unlike Snake. A ball has to
// move every frame or it visibly stutters, so each frame's delta time drives the
// simulation and is clamped, so a backgrounded tab cannot resume with one enormous
// step that moves the ball clean through a brick.

const MESSAGES = {
  idle: "Move with the mouse, arrows or A and D. Space to start.",
  serving: "Space to launch.",
  paused: "Paused — Space to resume.",
};

const OVER_WIN = "Wall cleared. Score";
const OVER_LOSS = "Out of lives. Score";

export function createGame({ canvas, elements }) {
  const renderer = createRenderer(canvas);
  const input = createInput();

  let frameId = null;
  let lastFrameAt = 0;
  let stopObserving = null;

  const session = createSession({
    onScore: (value) => { elements.score.textContent = String(value); },
    onLives: (value) => { elements.lives.textContent = String(value); },
    onState: (next) => renderState(next),
  });

  function renderState(state) {
    elements.message.textContent = MESSAGES[state] ?? "";

    // Every terminal state lands here, whether the run ended by clearing the wall or
    // by running out of lives, so the summary and the best score are written once.
    if (state === "over") {
      const previousBest = readBest();
      const isNewBest = session.score > 0 && session.score > previousBest;
      writeBest(Math.max(previousBest, session.score));
      elements.best.textContent = String(Math.max(previousBest, session.score));
      elements.start.textContent = "Play again";

      // Read now, while the wall still holds the finished run. Once the player
      // starts again the wall is rebuilt and this would no longer be answerable.
      const summary = session.wall.isCleared ? OVER_WIN : OVER_LOSS;
      elements.message.textContent = `${summary} ${session.score}${isNewBest ? " — new best!" : ""}`;
    }

    if (state === "running") {
      hideOverlay();
      return;
    }

    if (state === "serving") elements.start.textContent = "Launch";
    showOverlay();
  }

  // Bound once and reused: dispose has to remove the exact same reference, and an
  // inline arrow would be a different function on each call.
  const handlePrimary = () => primaryAction();

  function drawScene() {
    renderer.draw({
      ball: session.ball,
      paddle: session.paddle,
      bricks: session.wall.bricks,
    });
  }

  function primaryAction() {
    // Leaving idle or a finished run, the previous best is about to be replaced, so
    // it is read while it is still on screen rather than after the reset.
    if (session.state === "over" || session.state === "idle") showBest();

    session.primaryAction();
  }

  function showBest() {
    elements.best.textContent = String(readBest());
  }

  function showOverlay() {
    elements.overlay.style.display = "flex";
  }

  function hideOverlay() {
    elements.overlay.style.display = "none";
  }

  function frame(now) {
    const dt = lastFrameAt ? clamp((now - lastFrameAt) / 1000, 0, MAX_FRAME_DT) : 0;
    lastFrameAt = now;

    // Held-key movement runs on the same clock as the ball, so the two can never
    // disagree about how far this frame went. It is passed this frame's delta so
    // the keyboard matches the pointer's speed on any refresh rate.
    input.update(dt);

    if (session.state === "serving") {
      // The waiting ball rides the paddle, so it has to be re-seated after the
      // paddle moved this frame rather than only once when the serve began.
      session.ball.holdOn(session.paddle);
    } else {
      session.step(dt);
    }

    drawScene();
    frameId = requestAnimationFrame(frame);
  }

  function init() {
    input.attach({
      element: canvas,
      onPaddleMove: (x) => session.paddle.follow(x),
      onPaddleNudge: (direction, distance) => session.paddle.nudge(direction, distance),
      onPrimary: handlePrimary,
    });
    elements.start.addEventListener("click", handlePrimary);
    stopObserving = renderer.observe();

    // The ball has to be parked on the paddle before the first draw, or it is
    // rendered sitting at the origin in the corner of the board.
    session.ball.holdOn(session.paddle);
    elements.score.textContent = "0";
    elements.lives.textContent = String(session.lives);
    elements.message.textContent = MESSAGES.idle;
    elements.start.textContent = "Play";
    showBest();
    showOverlay();

    drawScene();
    frameId = requestAnimationFrame(frame);
  }

  function dispose() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    stopObserving?.();
    input.detach();
    elements.start.removeEventListener("click", handlePrimary);
  }

  return { init, dispose, primaryAction };
}