// shots.js — the deterministic screenshot scenes behind ?shot=start|play|
// end|beach. Each scene builds a fresh world from the seed, plays it forward
// a fixed number of steps, then stages the moment the screenshot needs with
// direct state placement (a stolen coupe mid-chase, a bust at a junction, a
// quiet minute on the sand). Same seed, same frame, every time: the staging
// consumes the world's own seeded stream and nothing else.

import { createWorld, stepWorld } from './sim.js';
import { WORLD } from './city.js';

const IDLE = { up: false, down: false, left: false, right: false, run: false, interact: false };
const DRIVE = { ...IDLE, up: true };

function settle(state, steps, input = IDLE) {
  for (let i = 0; i < steps; i++) stepWorld(state, input, 1 / 60);
}

function findParked(state, kind) {
  let fallback = null;
  for (const car of state.cars) {
    if (car.mode !== 'parked') continue;
    if (car.kind === kind) return car;
    if (!fallback) fallback = car;
  }
  if (fallback && kind) fallback.kind = kind;
  return fallback;
}

function makeCop(state, x, y, angle) {
  const car = {
    id: 9000 + state.cars.length, kind: 'cop', x, y, angle, speed: 0,
    mode: 'cop', color: '#15161c', axis: 'y', road: 1850, dir: -1,
    cruise: 446, turnCd: 0, nearCd: 0, stolen: true, crashCd: 0,
  };
  state.cars.push(car);
  return car;
}

// Title: the city alive around a player standing at a downtown junction.
function stageStart(seed) {
  const state = createWorld(seed);
  state.player.x = 1282;
  state.player.y = 1462;
  settle(state, 270);
  return { state, screen: 'title' };
}

// Play: a stolen coupe at speed on Avenue 1850, three stars up, two
// cruisers in frame behind it, a drop-off job ticking down.
function stagePlay(seed) {
  const state = createWorld(seed);
  settle(state, 90);

  // Clear the staging corridor of traffic and pedestrians so the chase
  // reads clean and nothing interferes with the staged numbers.
  state.cars = state.cars.filter(
    (c) => !(c.mode === 'traffic' && c.x > 1700 && c.x < 2050 && c.y > 420 && c.y < 1400),
  );
  for (const ped of state.peds) {
    if (ped.x > 1700 && ped.x < 2050 && ped.y > 420 && ped.y < 1400) {
      ped.x = 240;
      ped.y = 240;
      ped.tx = 240;
      ped.ty = 240;
    }
  }

  const coupe = findParked(state, 'coupe');
  coupe.x = 1877;
  coupe.y = 1060;
  coupe.angle = -Math.PI / 2;
  coupe.speed = 305;
  coupe.mode = 'player';
  coupe.stolen = true;
  const p = state.player;
  p.car = coupe;
  p.onFoot = false;
  p.x = coupe.x;
  p.y = coupe.y;
  p.angle = coupe.angle;

  const copA = makeCop(state, 1877 - 24, 1060 + 190, -Math.PI / 2);
  copA.speed = 305;
  const copB = makeCop(state, 1877 + 30, 1060 + 259, -Math.PI / 2);
  copB.speed = 305;

  state.heat = 3.0;
  state.cash = 1268;
  state.combo = 10;
  state.comboT = 0;

  // The drop-off is the nearest spot whose marker is still well clear of
  // where the chase ends, so the job cannot complete itself mid-stage.
  let drop = null;
  let best = Infinity;
  for (const s of state.city.spots) {
    const d = Math.hypot(s.marker.x - 1877, s.marker.y - 945);
    if (d > 260 && d < best) { best = d; drop = s; }
  }
  const pickup = state.city.spots.find((s) => s !== drop);
  state.mission = {
    type: 'deliver', phase: 'dropoff', pickup, drop,
    target: drop.marker, timer: 47, pay: 340,
  };
  state.nextMissionIn = 9999;

  settle(state, 22, DRIVE);
  return { state, screen: 'play' };
}

// End: BUSTED at the Avenue 1850 / Street 1400 junction, ringed by
// cruisers, with a full run's stats on the screen.
function stageEnd(seed) {
  const state = createWorld(seed);
  settle(state, 60);
  const p = state.player;
  p.x = 1850;
  p.y = 1400;
  p.onFoot = true;
  p.car = null;
  state.heat = 3.0;
  state.cash = 2310;
  const ring = [
    [38, 0.3], [47, 1.85], [52, 3.4], [44, 4.9],
  ];
  for (const [d, a] of ring) {
    const cx = p.x + Math.cos(a) * d;
    const cy = p.y + Math.sin(a) * d;
    makeCop(state, cx, cy, Math.atan2(p.y - cy, p.x - cx));
  }
  state.stats.jobs = 3;
  state.stats.crimes = 11;
  state.stats.nearMiss = 6;
  state.stats.topSpeed = 372;
  state.stats.timeAlive = 754;
  state.bust = 1;
  state.stars = 3; // stepWorld would recompute this from heat; it never runs again
  state.status = 'busted';
  return { state, screen: 'busted' };
}

// Beach: a quiet minute on the sand — no stars, a coupe parked at the
// Ocean Drive kerb, the next job waiting at Starfish Tacos, and the bay
// filling the right third of the frame.
function stageBeach(seed) {
  const state = createWorld(seed);
  settle(state, 90);
  const p = state.player;
  p.x = 3060;
  p.y = 1200;
  p.angle = Math.PI;
  p.onFoot = true;
  p.car = null;
  state.cash = 640;
  state.heat = 0;

  const coupe = findParked(state, 'coupe');
  coupe.x = 2727;
  coupe.y = 1380;
  coupe.angle = -Math.PI / 2;
  coupe.speed = 0;

  const tacos = state.city.spots.find((s) => s.hut);
  const other = state.city.spots.find((s) => s !== tacos);
  state.mission = {
    type: 'deliver', phase: 'pickup', pickup: tacos, drop: other,
    target: tacos.marker, timer: 0, pay: 0,
  };
  state.nextMissionIn = 9999;
  state.camOverride = { x: 2080, y: 840 };
  settle(state, 2);
  return { state, screen: 'play' };
}

const SCENES = { start: stageStart, play: stagePlay, end: stageEnd, beach: stageBeach };

export function stageScene(name, seed) {
  const fn = SCENES[name] || stageStart;
  return fn(seed);
}
