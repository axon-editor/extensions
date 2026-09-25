"use strict";

export function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function vecEq(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

export function shade(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const red = Math.round(((value >> 16) & 255) * (1 - amount));
  const green = Math.round(((value >> 8) & 255) * (1 - amount));
  const blue = Math.round((value & 255) * (1 - amount));
  return `rgb(${red},${green},${blue})`;
}