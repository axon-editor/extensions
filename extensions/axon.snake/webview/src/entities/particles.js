"use strict";

// Short-lived canvas bursts that play when food is eaten and when a run ends.
export function createParticleSystem() {
  const particles = [];

  function emit(x, y, color, count, spread) {
    const angleJitter = spread ?? 0.6;
    for (let i = 0; i < count; i += 1) {
      const angle = ((Math.PI * 2 * i) / count) + (Math.random() - 0.5) * angleJitter;
      const speed = 20 + Math.random() * 50;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.35,
        age: 0,
        size: 1.5 + Math.random() * 2,
        color,
      });
    }
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.age += dt;
      if (particle.age >= particle.life) {
        particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.94;
      particle.vy *= 0.94;
    }
  }

  function render(ctx) {
    for (const particle of particles) {
      const progress = particle.age / particle.life;
      ctx.globalAlpha = 1 - progress;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (1 - progress * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { emit, update, render };
}