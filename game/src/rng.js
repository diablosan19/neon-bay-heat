// rng.js — the one source of randomness in Neon Bay Heat.
//
// The whole simulation runs off a single seeded stream so that a world built
// from a seed replays exactly: same traffic, same pedestrians, same staged
// screenshot scenes. Nothing in the simulation calls Math.random.

export class Rng {
  constructor(seed) {
    // mulberry32 state; any uint32 seed works, 0 included.
    this.state = seed >>> 0;
  }

  // Next float in [0, 1).
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max], both ends included.
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  // True with probability p.
  chance(p) {
    return this.next() < p;
  }

  // One element of arr.
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// Wrap an angle to [-PI, PI] so steering always takes the short way round.
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
