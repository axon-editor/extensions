"use strict";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

export function normalize(vx, vy) {
  const length = Math.hypot(vx, vy);
  if (length === 0) return { vx: 0, vy: 0 };
  return { vx: vx / length, vy: vy / length };
}

export function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}