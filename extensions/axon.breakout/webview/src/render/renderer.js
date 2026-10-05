"use strict";

import {
  BOARD_PX,
  COLORS,
  PADDLE_HEIGHT,
  TRAIL_STEPS,
} from "../core/config.js";
import { roundRectPath } from "../core/utils.js";

// All canvas painting.
//
// The backing store is sized from devicePixelRatio while the CSS box comes from
// the stylesheet, so the board stays crisp on a HiDPI display instead of being
// upscaled from a fixed pixel count.
//
// Every dimension is expressed in board units and scaled on the way out through
// px(), so the drawing stays aligned with the physics whatever the canvas ends up
// being, and the board only has to be square for the layout to work.
const FALLBACK_PIXEL_RATIO = 1;
const BRICK_RADIUS = 4;
const EDGE_INSET = 2;

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  let cssSize = 0;
  let scale = 1;
  let previousBall = null;

  function resize() {
    // clientWidth is 0 until the board has been laid out, and the width attribute is
    // the last value this function wrote, so falling back to it would keep the board
    // at its old size forever. The attribute is only ever used as a starting guess;
    // the ResizeObserver is what guarantees the real size arrives.
    const css = canvas.clientWidth || canvas.clientHeight || canvas.width;
    const ratio = canvas.ownerDocument.defaultView.devicePixelRatio || FALLBACK_PIXEL_RATIO;

    // Assigning width or height clears the canvas and resets the transform, so both
    // the backing store and the transform are set on every resize.
    canvas.width = Math.round(css * ratio);
    canvas.height = Math.round(css * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    cssSize = css;
    scale = css / BOARD_PX;
  }

  function px(value) {
    return value * scale;
  }

  function fillRoundRect(x, y, width, height, radius, color) {
    ctx.fillStyle = color;
    roundRectPath(ctx, px(x), px(y), px(width), px(height), px(radius));
    ctx.fill();
  }

  function drawBackdrop() {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, cssSize, cssSize);

    // A wash of warmth from the top, where the wall sits, so the empty lower
    // half reads as depth rather than a flat void.
    //
    // The fade carries its own colour instead of being a literal here, because a
    // hardcoded transparent tint goes stale the moment the palette changes and
    // leaves the old hue bleeding out of the top of the board.
    const glow = ctx.createLinearGradient(0, 0, 0, cssSize);
    glow.addColorStop(0, COLORS.backdropGlow);
    glow.addColorStop(0.65, COLORS.backdropGlowFade);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cssSize, cssSize);
  }

  // Only the side walls are drawn. The ceiling edge is implied by the backdrop
  // gradient, and a visible line there would suggest something to bounce off at a
  // place where the guide line already reads as the real boundary.
  function drawWalls() {
    ctx.strokeStyle = COLORS.playfieldEdge;
    ctx.lineWidth = Math.max(1, px(1.5));
    ctx.beginPath();
    ctx.moveTo(px(0.75), 0);
    ctx.lineTo(px(0.75), cssSize);
    ctx.moveTo(cssSize - px(0.75), 0);
    ctx.lineTo(cssSize - px(0.75), cssSize);
    ctx.stroke();
  }

  function drawBricks(bricks) {
    for (const brick of bricks) {
      if (!brick.alive) continue;

      fillRoundRect(brick.x, brick.y, brick.width, brick.height, BRICK_RADIUS, COLORS[`brickRow${brick.row}`]);

      // A bright inset band along the top edge is what gives the wall its beveled
      // look, and it stays the same thickness at any canvas size.
      fillRoundRect(
        brick.x + EDGE_INSET,
        brick.y + EDGE_INSET,
        brick.width - EDGE_INSET * 2,
        3,
        1.5,
        COLORS.brickEdge,
      );
    }
  }

  function drawPaddle(paddle) {
    const height = PADDLE_HEIGHT;

    ctx.shadowColor = COLORS.paddleGlow;
    ctx.shadowBlur = px(10);
    fillRoundRect(paddle.x, paddle.top, paddle.width, height, height / 2, COLORS.paddle);
    ctx.shadowBlur = 0;

    fillRoundRect(
      paddle.x + EDGE_INSET * 2,
      paddle.top + 2.5,
      paddle.width - EDGE_INSET * 4,
      height * 0.34,
      2,
      COLORS.paddleHighlight,
    );
  }

  // A short trail behind the ball. Without it a ball at 620px/s reads as teleporting
  // between frames, and the speed is most of what makes the late wall tense.
  function drawTrail(ball) {
    if (!previousBall) return;

    const dx = ball.x - previousBall.x;
    const dy = ball.y - previousBall.y;

    for (let step = 1; step <= TRAIL_STEPS; step += 1) {
      const ratio = step / (TRAIL_STEPS + 1);
      ctx.globalAlpha = 0.3 * (1 - ratio);
      ctx.fillStyle = COLORS.ball;
      ctx.beginPath();
      ctx.arc(
        px(ball.x - dx * ratio),
        px(ball.y - dy * ratio),
        px(ball.radius) * (1 - ratio * 0.5),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  function drawBall(ball) {
    drawTrail(ball);

    ctx.shadowColor = COLORS.ballGlow;
    ctx.shadowBlur = px(12);
    ctx.fillStyle = COLORS.ball;
    ctx.beginPath();
    ctx.arc(px(ball.x), px(ball.y), px(ball.radius), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Specular dot up and to the left, the same light source as the brick bevels
    // and the paddle highlight, which is what makes the three read as one scene.
    ctx.fillStyle = COLORS.ballHighlight;
    ctx.beginPath();
    ctx.arc(px(ball.x) - px(ball.radius) * 0.3, px(ball.y) - px(ball.radius) * 0.34, px(ball.radius) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(scene) {
    drawBackdrop();
    drawWalls();
    drawBricks(scene.bricks);
    drawPaddle(scene.paddle);
    drawBall(scene.ball);

    previousBall = { x: scene.ball.x, y: scene.ball.y };
  }

  // Two separate things have to be watched, and neither alone is enough.
  //
  // The box observer catches the first real layout, which the constructor's resize
  // runs too early to see, and any later change to the CSS box. The pixel ratio
  // watch catches dragging the window between a HiDPI and a standard display, where
  // the CSS box is unchanged and so no resize ever fires.
  function observe() {
    const view = canvas.ownerDocument.defaultView;
    let query = null;

    function handleRatioChange() {
      resize();
      // The query that just fired no longer matches, so a fresh one has to take over
      // the watch or the next change is missed.
      watchRatio();
    }

    function watchRatio() {
      query?.removeEventListener("change", handleRatioChange);
      query = view.matchMedia(`(resolution: ${view.devicePixelRatio}dppx)`);
      query.addEventListener("change", handleRatioChange);
    }

    const boxObserver = new view.ResizeObserver(() => resize());
    boxObserver.observe(canvas);
    watchRatio();

    return () => {
      boxObserver.disconnect();
      query?.removeEventListener("change", handleRatioChange);
    };
  }

  return {
    draw,
    resize,
    observe,
  };
}