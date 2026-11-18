// city.js — Neon Bay itself: the road grid, buildings, named spots, palms and
// kerbside parking, all generated from a seed so every run builds the same
// city. The bay sits on the east edge: promenade, sand, then water.

import { Rng } from './rng.js';

export const WORLD = { w: 3360, h: 2400, sandX: 2933, waterX: 3130 };
export const AVENUES = [350, 850, 1350, 1850, 2350, 2800]; // vertical roads, west to east
export const STREETS = [300, 850, 1400, 1950]; // horizontal roads, north to south
export const ROAD_W = 112;

const PASTELS = [
  '#f2b8a0', '#f7d08a', '#a8d8b9', '#9fc7e8', '#d3b8e8',
  '#f49fb8', '#f7e3a1', '#a0ddd6', '#f5c6d6', '#b5d99c',
];
const NEON = ['#22d3ee', '#f472b6', '#facc15', '#4ade80', '#c084fc', '#fb923c'];

const SPOT_NAMES = [
  'Coral Diner', 'Club Mirage', 'Hotel Solano', 'Neon Marina',
  'Palms Arcade', 'Tidal Fitness', 'Salty Parrot Bar',
];

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// The buildable bands between roads: [west edge, east edge] pairs.
function bands(roads, limit) {
  const out = [];
  let prev = 40;
  for (const r of roads) {
    out.push([prev, r - ROAD_W / 2]);
    prev = r + ROAD_W / 2;
  }
  out.push([prev, limit]);
  return out;
}

function markerFor(cx, cy) {
  // The roadside point in front of a building: the closest point that lies
  // on a road centre line, so mission markers sit where a car can reach.
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(ax - cx);
    if (d < bestD) { bestD = d; best = { x: ax, y: cy }; }
  }
  for (const sy of STREETS) {
    const d = Math.abs(sy - cy);
    if (d < bestD) { bestD = d; best = { x: cx, y: sy }; }
  }
  return best;
}

export function buildCity(seed) {
  const rng = new Rng(seed * 7919 + 13);
  const buildings = [];
  const palms = [];
  const parking = [];
  const spots = [];

  const xBands = bands(AVENUES, WORLD.sandX - 8);
  const yBands = bands(STREETS, WORLD.h - 40);

  const blocks = [];
  for (const [x0, x1] of xBands) {
    for (const [y0, y1] of yBands) {
      blocks.push({ x0, x1, y0, y1 });
    }
  }

  // Pick seven well-spread blocks to host the named spots.
  const spotBlocks = new Set();
  const stride = Math.floor(blocks.length / SPOT_NAMES.length);
  for (let i = 0; i < SPOT_NAMES.length; i++) spotBlocks.add(i * stride + 2);

  blocks.forEach((blk, bi) => {
    const roll = rng.next();
    const ix0 = blk.x0 + 18;
    const ix1 = blk.x1 - 18;
    const iy0 = blk.y0 + 18;
    const iy1 = blk.y1 - 18;
    if (roll < 0.14) {
      // Park block: grass and palms, no buildings.
      for (let i = 0; i < 7; i++) {
        palms.push({ x: rng.range(ix0 + 10, ix1 - 10), y: rng.range(iy0 + 10, iy1 - 10), s: rng.range(0.8, 1.3) });
      }
      return;
    }
    if (roll < 0.28) {
      // Parking-lot block: two rows of parked cars on open asphalt.
      for (let row = 0; row < 2; row++) {
        const y = iy0 + 40 + row * 90;
        for (let x = ix0 + 30; x < ix1 - 20; x += 64) {
          if (rng.chance(0.75)) parking.push({ x, y, angle: Math.PI / 2 });
        }
      }
      return;
    }
    // Buildings block: a 2x2 split with alleys between.
    const mx = (ix0 + ix1) / 2;
    const my = (iy0 + iy1) / 2;
    const cells = [
      [ix0, iy0, mx - 9, my - 9], [mx + 9, iy0, ix1, my - 9],
      [ix0, my + 9, mx - 9, iy1], [mx + 9, my + 9, ix1, iy1],
    ];
    let firstBuilding = null;
    for (const [cx0, cy0, cx1, cy1] of cells) {
      if (rng.chance(0.12)) continue; // the odd courtyard gap
      const color = rng.pick(PASTELS);
      const b = {
        x: cx0 + 5, y: cy0 + 5, w: cx1 - cx0 - 10, h: cy1 - cy0 - 10,
        color, roof: shade(color, 0.82), trim: shade(color, 0.62),
        neon: rng.pick(NEON), name: null,
      };
      buildings.push(b);
      if (!firstBuilding) firstBuilding = b;
    }
    if (spotBlocks.has(bi) && firstBuilding) {
      const name = SPOT_NAMES[spots.length];
      firstBuilding.name = name;
      const cx = firstBuilding.x + firstBuilding.w / 2;
      const cy = firstBuilding.y + firstBuilding.h / 2;
      spots.push({ name, x: cx, y: cy, marker: markerFor(cx, cy), hut: false });
    }
  });

  // Beachfront huts on the promenade; the middle one is a mission spot.
  const hutNames = ['Beach Rentals', 'Starfish Tacos', 'Surf Wax Co'];
  hutNames.forEach((name, i) => {
    const hut = {
      x: 2870, y: 600 + i * 400, w: 54, h: 66,
      color: '#f7d08a', roof: '#d9a75e', trim: '#a87f3e', neon: '#22d3ee', name,
    };
    buildings.push(hut);
    if (name === 'Starfish Tacos') {
      spots.push({ name, x: hut.x + 27, y: hut.y + 33, marker: { x: 2852, y: hut.y + 33 }, hut: true });
    }
  });

  // Palms along the promenade.
  for (let y = 90; y < WORLD.h - 60; y += rng.range(85, 130)) {
    palms.push({ x: 2906 + rng.range(-8, 8), y, s: rng.range(0.9, 1.4) });
  }

  // Kerbside parking along the avenues and streets.
  for (const ax of AVENUES) {
    let y = 140;
    while (y < WORLD.h - 120) {
      y += rng.range(130, 220);
      if (STREETS.some((sy) => Math.abs(y - sy) < ROAD_W / 2 + 46)) continue;
      const side = rng.chance(0.5) ? -1 : 1;
      parking.push({ x: ax + side * (ROAD_W / 2 + 17), y, angle: Math.PI / 2 });
    }
  }
  for (const sy of STREETS) {
    let x = 160;
    while (x < WORLD.sandX - 160) {
      x += rng.range(170, 260);
      if (AVENUES.some((ax) => Math.abs(x - ax) < ROAD_W / 2 + 46)) continue;
      const side = rng.chance(0.5) ? -1 : 1;
      parking.push({ x, y: sy + side * (ROAD_W / 2 + 17), angle: 0 });
    }
  }

  return { buildings, palms, parking, spots };
}

export function isRoad(x, y) {
  if (x >= WORLD.waterX) return false;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_W / 2) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_W / 2) return true;
  return false;
}

// Nearest point on the road network to (x, y); used to spawn traffic and
// police where they belong.
export function snapToRoad(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(ax - x);
    if (d < bestD) { bestD = d; best = { x: ax, y }; }
  }
  for (const sy of STREETS) {
    const d = Math.abs(sy - y);
    if (d < bestD) { bestD = d; best = { x, y: sy }; }
  }
  best.x = Math.max(30, Math.min(WORLD.w - 30, best.x));
  best.y = Math.max(30, Math.min(WORLD.h - 30, best.y));
  return best;
}

// Push a circle (entity e with radius r) out of every building it overlaps.
// Returns impact info when a push happened, so callers can price a crash.
export function collideCircle(buildings, e, r) {
  let hit = null;
  for (const b of buildings) {
    const nx = Math.max(b.x, Math.min(e.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(e.y, b.y + b.h));
    const dx = e.x - nx;
    const dy = e.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      e.x = nx + (dx / d) * r;
      e.y = ny + (dy / d) * r;
      hit = { nx: dx / d, ny: dy / d };
    } else {
      // Centre inside the building: leave by the shallowest face.
      const left = e.x - b.x;
      const right = b.x + b.w - e.x;
      const top = e.y - b.y;
      const bottom = b.y + b.h - e.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) { e.x = b.x - r; hit = { nx: -1, ny: 0 }; }
      else if (m === right) { e.x = b.x + b.w + r; hit = { nx: 1, ny: 0 }; }
      else if (m === top) { e.y = b.y - r; hit = { nx: 0, ny: -1 }; }
      else { e.y = b.y + b.h + r; hit = { nx: 0, ny: 1 }; }
    }
  }
  return hit;
}
