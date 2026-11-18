// sim.js — the whole simulation of Neon Bay Heat, pure logic with no DOM:
// the player on foot and in cars, lane traffic, pedestrians, the police and
// the wanted system, missions, and the mayhem combo. Fixed-step and fully
// seeded, so a world replays exactly from its seed plus its input stream.

import { Rng, wrapAngle, clamp, dist } from './rng.js';
import { buildCity, collideCircle, snapToRoad, WORLD, AVENUES, STREETS, ROAD_W } from './city.js';

export const STEP = 1 / 60;

export const CAR_KINDS = {
  compact: { top: 320, accel: 300, turn: 2.7, len: 34, wid: 19 },
  sedan: { top: 362, accel: 275, turn: 2.5, len: 38, wid: 19 },
  coupe: { top: 468, accel: 360, turn: 3.0, len: 40, wid: 20 },
  taxi: { top: 350, accel: 265, turn: 2.5, len: 38, wid: 19 },
  van: { top: 302, accel: 225, turn: 2.1, len: 45, wid: 22 },
  cop: { top: 446, accel: 345, turn: 2.9, len: 41, wid: 20 },
};
const PARKED_KINDS = ['compact', 'compact', 'sedan', 'sedan', 'coupe', 'taxi', 'van'];
const CAR_COLORS = [
  '#e8e8ec', '#c0c4cc', '#8a8f98', '#d94f4f', '#4f7ad9', '#4fd98a',
  '#e8c84a', '#b44fd9', '#4fd2d9', '#e88a4a', '#f2f2f2', '#3a3f4a',
];
const COPS_BY_STAR = [0, 1, 2, 3, 4, 6];
export const SEEN_RANGE = 560;

// Car ids come from a per-world counter, so two worlds built from the same
// seed number their cars identically.
function makeCar(ids, kind, x, y, angle, mode, color) {
  return {
    id: ids.next++, kind, x, y, angle, speed: 0, mode, color,
    axis: 'y', road: 0, dir: 1, cruise: 0, turnCd: 0, nearCd: 0,
    stolen: false, crashCd: 0,
  };
}

export function createWorld(seed) {
  const rng = new Rng(seed ^ 0x9e3779b9);
  const city = buildCity(seed);
  const ids = { next: 1 };
  const cars = [];

  for (const p of city.parking) {
    const kind = rng.pick(PARKED_KINDS);
    const angle = p.angle + (rng.chance(0.5) ? 0 : Math.PI);
    cars.push(makeCar(ids, kind, p.x, p.y, angle, 'parked', rng.pick(CAR_COLORS)));
  }

  // Traffic already rolling when the world opens.
  for (let i = 0; i < 16; i++) {
    const car = spawnTrafficCar(rng, null, ids);
    if (car) cars.push(car);
  }

  const peds = [];
  for (let i = 0; i < 26; i++) peds.push(makePed(rng));

  return {
    seed,
    rng,
    ids,
    city,
    t: 0,
    status: 'playing', // 'playing' | 'busted' | 'wasted'
    player: {
      x: 1322, y: 1470, angle: -Math.PI / 2, onFoot: true, car: null,
      health: 100, lastHurtT: -99, hurtCd: 0,
    },
    cars,
    peds,
    heat: 0,
    stars: 0,
    seen: false,
    unseenFor: 99,
    bust: 0,
    cash: 0,
    combo: 0,
    comboT: 99,
    mission: null,
    missionSeq: 0,
    nextMissionIn: 2,
    lastSpot: null,
    popups: [],
    events: [],
    camX: 0,
    camY: 0,
    camOverride: null,
    copSpawnCd: 0,
    stats: { crimes: 0, nearMiss: 0, jobs: 0, topSpeed: 0, timeAlive: 0 },
  };
}

function spawnTrafficCar(rng, near, ids) {
  // A car on a random avenue or street, in the correct right-hand lane.
  for (let tries = 0; tries < 12; tries++) {
    let x;
    let y;
    let axis;
    let road;
    let dir;
    if (rng.chance(0.55)) {
      axis = 'y';
      road = rng.pick(AVENUES);
      dir = rng.chance(0.5) ? 1 : -1;
      x = road - 27 * dir;
      y = rng.range(80, WORLD.h - 80);
    } else {
      axis = 'x';
      road = rng.pick(STREETS);
      dir = rng.chance(0.5) ? 1 : -1;
      x = rng.range(80, WORLD.sandX - 120);
      y = road + 27 * dir;
    }
    if (near && dist(x, y, near.x, near.y) < 620) continue;
    if (near && dist(x, y, near.x, near.y) > 1250) continue;
    const kind = rng.pick(['compact', 'sedan', 'sedan', 'taxi', 'coupe', 'van']);
    const car = makeCar(ids, kind, x, y, axis === 'y' ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (dir === 1 ? 0 : Math.PI), 'traffic', rng.pick(CAR_COLORS));
    car.axis = axis;
    car.road = road;
    car.dir = dir;
    car.cruise = rng.range(185, 262);
    car.speed = car.cruise * rng.range(0.7, 1);
    return car;
  }
  return null;
}

function makePed(rng) {
  // A pedestrian on a sidewalk: beside an avenue or a street, never in a wall.
  let x;
  let y;
  if (rng.chance(0.5)) {
    const ax = rng.pick(AVENUES);
    x = ax + (rng.chance(0.5) ? -1 : 1) * (ROAD_W / 2 + 11);
    y = rng.range(70, WORLD.h - 70);
  } else {
    const sy = rng.pick(STREETS);
    x = rng.range(70, WORLD.sandX - 90);
    y = sy + (rng.chance(0.5) ? -1 : 1) * (ROAD_W / 2 + 11);
  }
  return {
    x, y, angle: rng.range(0, Math.PI * 2), state: 'walk',
    tx: x, ty: y, thinkT: 0, fleeT: 0, downT: 0, fx: 0, fy: 0,
    color: rng.pick(CAR_COLORS), skin: rng.pick(['#f2c79b', '#c68863', '#8a5a3b', '#6e4530']),
  };
}

export function addHeat(state, pts) {
  state.heat = clamp(state.heat + pts, 0, 5);
  // Fresh heat means the five-second cooling grace starts over: the decay
  // only runs once the player has been unseen for five straight seconds,
  // and a new crime restarts that clock.
  if (pts > 0) state.unseenFor = 0;
}

// A crime the world notices: heat, a stat, a sting for the sound layer, and
// a scare source for nearby pedestrians.
export function commitCrime(state, pts, x, y) {
  addHeat(state, pts);
  state.stats.crimes++;
  state.events.push('crime');
  state.lastCrime = { x, y, t: state.t };
}

export function addPopup(state, x, y, text, color) {
  state.popups.push({ x, y, text, color: color || '#ffd94a', t: 0, life: 1.15 });
}

export function comboMult(state) {
  return 1 + Math.min(4, Math.floor(state.combo / 6));
}

// A mayhem event: feeds the combo, pays out at the current multiplier, and
// floats the takings over the car that earned them.
function mayhem(state, points, baseCash, x, y) {
  const pay = baseCash * comboMult(state);
  state.combo += points;
  state.comboT = 0;
  state.cash += pay;
  addPopup(state, x, y, `+$${pay}`, '#ffd94a');
  state.events.push('cash');
}

export function spawnCop(state) {
  const p = state.player;
  const rng = state.rng;
  for (let tries = 0; tries < 10; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const snap = snapToRoad(p.x + Math.cos(a) * 830, p.y + Math.sin(a) * 830);
    if (dist(snap.x, snap.y, p.x, p.y) < 620) continue;
    const car = makeCar(state.ids, 'cop', snap.x, snap.y, Math.atan2(p.y - snap.y, p.x - snap.x), 'cop', '#15161c');
    const onAve = AVENUES.some((ax) => Math.abs(ax - snap.x) < 2);
    car.axis = onAve ? 'y' : 'x';
    car.road = onAve ? snap.x : snap.y;
    car.dir = 1;
    car.cruise = CAR_KINDS.cop.top;
    state.cars.push(car);
    return car;
  }
  return null;
}

// ---------------------------------------------------------------- player ---

function nearestCar(state, x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of state.cars) {
    if (car.mode === 'cop' || car.mode === 'leave') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function tryEnterExit(state) {
  const p = state.player;
  if (p.onFoot) {
    const car = nearestCar(state, p.x, p.y, 48);
    if (!car) return;
    if (car.mode === 'traffic') {
      // Yank the driver out: they bail and run, and the theft is a crime.
      const driver = makePed(state.rng);
      driver.x = car.x + 20;
      driver.y = car.y + 10;
      driver.state = 'flee';
      driver.fleeT = 3;
      driver.fx = car.x;
      driver.fy = car.y;
      state.peds.push(driver);
      state.peds.splice(0, 1); // keep the head count bounded
    }
    if (!car.stolen) {
      car.stolen = true;
      commitCrime(state, 1.0, car.x, car.y);
    }
    car.mode = 'player';
    p.car = car;
    p.onFoot = false;
    state.events.push('enter');
  } else {
    const car = p.car;
    car.mode = 'parked';
    car.speed = 0;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
    p.car = null;
    p.onFoot = true;
    state.events.push('exit');
  }
}

function updatePlayerOnFoot(state, input, dt) {
  const p = state.player;
  let mx = 0;
  let my = 0;
  if (input.up) my -= 1;
  if (input.down) my += 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  if (mx !== 0 || my !== 0) {
    const len = Math.sqrt(mx * mx + my * my);
    const speed = input.run ? 238 : 138;
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    p.angle = Math.atan2(my, mx);
  }
  collideCircle(state.city.buildings, p, 11);
  p.x = clamp(p.x, 14, WORLD.waterX - 8);
  p.y = clamp(p.y, 14, WORLD.h - 14);
}

function updatePlayerCar(state, input, dt) {
  const p = state.player;
  const car = p.car;
  const K = CAR_KINDS[car.kind];
  const onSand = car.x > WORLD.sandX;

  if (input.up) car.speed += K.accel * (1 - car.speed / K.top) * dt;
  if (input.down) {
    car.speed -= (car.speed > 5 ? 430 : 165) * dt;
    if (car.speed < -K.top * 0.35) car.speed = -K.top * 0.35;
  }
  if (!input.up && !input.down) car.speed -= car.speed * 0.4 * dt;
  car.speed -= car.speed * (onSand ? 0.85 : 0.12) * dt;
  if (Math.abs(car.speed) < 2 && !input.up && !input.down) car.speed = 0;

  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  if (steer !== 0 && car.speed !== 0) {
    const sf = clamp(car.speed / 150, -1.5, 1.5);
    car.angle += steer * K.turn * sf * dt * 0.55;
  }

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;

  const spd = Math.abs(car.speed);
  if (spd > state.stats.topSpeed) state.stats.topSpeed = spd;

  // Buildings: a hard enough arrival is a crash — damage, heat, a bounce.
  const before = car.speed;
  const hit = collideCircle(state.city.buildings, car, 17);
  if (hit) {
    const into = -(Math.cos(car.angle) * hit.nx + Math.sin(car.angle) * hit.ny) * before;
    if (into > 60) {
      car.speed = -before * 0.22;
      if (into > 175 && car.crashCd <= 0) {
        car.crashCd = 1;
        state.events.push('crash');
        hurtPlayer(state, (into - 150) * 0.045);
        commitCrime(state, 0.25, car.x, car.y);
      }
    }
    p.x = car.x;
    p.y = car.y;
  }
  car.x = clamp(car.x, 20, WORLD.waterX - 12);
  car.y = clamp(car.y, 20, WORLD.h - 20);
  p.x = car.x;
  p.y = car.y;
}

function hurtPlayer(state, dmg) {
  const p = state.player;
  if (dmg <= 0 || state.status !== 'playing') return;
  p.health -= dmg;
  p.lastHurtT = state.t;
  if (p.health <= 0) {
    p.health = 0;
    state.status = 'wasted';
    state.events.push('wasted');
  }
}

// ------------------------------------------------------- traffic & police ---

function lanePoint(car) {
  // The point this car is steering for: ahead of it, centred on its lane.
  if (car.axis === 'y') return { x: car.road - 27 * car.dir, y: car.y + car.dir * 150 };
  return { x: car.x + car.dir * 150, y: car.road + 27 * car.dir };
}

function steerToward(car, tx, ty, turnRate, dt) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = wrapAngle(desired - car.angle);
  const maxTurn = turnRate * dt;
  car.angle += clamp(diff, -maxTurn, maxTurn);
  return Math.abs(diff);
}

function driveCar(car, dt) {
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

function updateTrafficCar(state, car, dt) {
  const rng = state.rng;
  car.turnCd -= dt;

  // Forced turn before the bay: eastbound streets end at Ocean Drive.
  if (car.axis === 'x' && car.dir === 1 && car.x > AVENUES[5] - 30) {
    car.axis = 'y';
    car.road = AVENUES[5];
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.turnCd = 3;
  }
  // Junction turns.
  if (car.turnCd <= 0) {
    if (car.axis === 'y') {
      for (const sy of STREETS) {
        if (Math.abs(car.y - sy) < 9 && rng.chance(0.38)) {
          car.axis = 'x';
          car.road = sy;
          car.dir = rng.chance(0.5) ? 1 : -1;
          car.turnCd = 3;
          break;
        }
      }
    } else {
      for (const ax of AVENUES) {
        if (Math.abs(car.x - ax) < 9 && rng.chance(0.38)) {
          car.axis = 'y';
          car.road = ax;
          car.dir = rng.chance(0.5) ? 1 : -1;
          car.turnCd = 3;
          break;
        }
      }
    }
  }
  // World edges: turn around rather than leave the map.
  if (car.x < 70 && car.axis === 'x') car.dir = 1;
  if (car.x > WORLD.sandX - 90 && car.axis === 'x') car.dir = -1;
  if (car.y < 70 && car.axis === 'y') car.dir = 1;
  if (car.y > WORLD.h - 70 && car.axis === 'y') car.dir = -1;

  const target = lanePoint(car);
  steerToward(car, target.x, target.y, 2.3, dt);

  // Brake for whoever is ahead in the lane.
  let targetSpeed = car.cruise;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (ahead > 0 && ahead < 72 && side < 17) {
      targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed - 12));
    }
  }
  const p = state.player;
  if (!p.onFoot && p.car) {
    const dx = p.car.x - car.x;
    const dy = p.car.y - car.y;
    const ahead = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (ahead > 0 && ahead < 72 && side < 17) targetSpeed = Math.min(targetSpeed, Math.abs(p.car.speed));
  }

  if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + 210 * dt);
  else car.speed = Math.max(targetSpeed, car.speed - 420 * dt);
  driveCar(car, dt);
  const hit = collideCircle(state.city.buildings, car, 15);
  if (hit) car.speed *= 0.45;

  // Recycle traffic that has wandered far from the action.
  if (car.mode === 'traffic' && dist(car.x, car.y, p.x, p.y) > 1550) {
    const fresh = spawnTrafficCar(state.rng, p, state.ids);
    if (fresh) {
      car.x = fresh.x; car.y = fresh.y; car.angle = fresh.angle;
      car.axis = fresh.axis; car.road = fresh.road; car.dir = fresh.dir;
      car.speed = fresh.speed; car.cruise = fresh.cruise; car.kind = fresh.kind;
    }
  }
}

function updateCop(state, car, dt) {
  const p = state.player;
  const K = CAR_KINDS.cop;
  const d = dist(car.x, car.y, p.x, p.y);
  const lead = p.onFoot ? 0 : 0.32;
  const tx = p.x + (p.onFoot ? 0 : Math.cos(p.angle) * Math.abs(p.car.speed) * lead);
  const ty = p.y + (p.onFoot ? 0 : Math.sin(p.angle) * Math.abs(p.car.speed) * lead);
  steerToward(car, tx, ty, 3.0, dt);

  let targetSpeed;
  if (p.onFoot && d < 54) targetSpeed = 0; // park up and let the bust meter work
  else if (d > 320) targetSpeed = K.top;
  else if (d > 110) targetSpeed = K.top * 0.6;
  else targetSpeed = K.top * 0.42;
  if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + K.accel * dt);
  else car.speed = Math.max(targetSpeed, car.speed - 460 * dt);
  driveCar(car, dt);
  const hit = collideCircle(state.city.buildings, car, 16);
  if (hit) car.speed *= 0.4;
  car.x = clamp(car.x, 18, WORLD.waterX - 10);
  car.y = clamp(car.y, 18, WORLD.h - 18);
}

function managePolice(state, dt) {
  state.copSpawnCd -= dt;
  const desired = COPS_BY_STAR[state.stars];
  let cops = state.cars.filter((c) => c.mode === 'cop');

  if (cops.length < desired && state.copSpawnCd <= 0) {
    if (spawnCop(state)) state.copSpawnCd = 1.1;
    cops = state.cars.filter((c) => c.mode === 'cop');
  }
  // Too many for the current heat: the farthest breaks off and leaves.
  if (cops.length > desired) {
    let far = null;
    let farD = -1;
    for (const c of cops) {
      const d = dist(c.x, c.y, state.player.x, state.player.y);
      if (d > farD) { farD = d; far = c; }
    }
    if (far) {
      if (farD > 640) state.cars.splice(state.cars.indexOf(far), 1);
      else { far.mode = 'leave'; far.axis = Math.abs(Math.sin(far.angle)) > 0.7 ? 'y' : 'x'; far.road = far.axis === 'y' ? AVENUES[0] : STREETS[0]; far.dir = 1; far.cruise = 240; }
    }
  }
  // Leaving cars drive off and are removed once clear.
  for (let i = state.cars.length - 1; i >= 0; i--) {
    const car = state.cars[i];
    if (car.mode === 'cop' && dist(car.x, car.y, state.player.x, state.player.y) > 1500) {
      state.cars.splice(i, 1);
    } else if (car.mode === 'leave' && dist(car.x, car.y, state.player.x, state.player.y) > 1050) {
      state.cars.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------ pedestrians ---

function updatePed(state, ped, dt) {
  const p = state.player;
  if (ped.state === 'down') {
    ped.downT -= dt;
    if (ped.downT <= 0) ped.state = 'walk';
    return;
  }

  // Danger: a fast car close by, or a fresh crime on this block.
  let threat = null;
  if (!p.onFoot && p.car && Math.abs(p.car.speed) > 150) {
    if (dist(ped.x, ped.y, p.car.x, p.car.y) < 74) threat = p.car;
  }
  if (!threat && state.lastCrime && state.t - state.lastCrime.t < 1.2) {
    if (dist(ped.x, ped.y, state.lastCrime.x, state.lastCrime.y) < 95) {
      threat = state.lastCrime;
    }
  }
  if (threat && ped.state !== 'flee') {
    ped.state = 'flee';
    ped.fleeT = state.rng.range(2.2, 3.8);
    ped.fx = threat.x;
    ped.fy = threat.y;
    if (threat === p.car) mayhem(state, 1, 3, ped.x, ped.y - 14);
  }

  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    const a = Math.atan2(ped.y - ped.fy, ped.x - ped.fx);
    ped.angle = a;
    ped.x += Math.cos(a) * 178 * dt;
    ped.y += Math.sin(a) * 178 * dt;
    if (ped.fleeT <= 0) ped.state = 'walk';
  } else {
    ped.thinkT -= dt;
    if (ped.thinkT <= 0 || dist(ped.x, ped.y, ped.tx, ped.ty) < 8) {
      ped.thinkT = state.rng.range(2, 6);
      ped.tx = clamp(ped.x + state.rng.range(-260, 260), 40, WORLD.sandX + 120);
      ped.ty = clamp(ped.y + state.rng.range(-260, 260), 40, WORLD.h - 40);
    }
    const a = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.angle = a;
    ped.x += Math.cos(a) * 62 * dt;
    ped.y += Math.sin(a) * 62 * dt;
  }
  collideCircle(state.city.buildings, ped, 9);
  ped.x = clamp(ped.x, 12, WORLD.waterX - 6);
  ped.y = clamp(ped.y, 12, WORLD.h - 12);

  // Run over: any fast car, but only the player's driving is a crime.
  for (const car of state.cars) {
    if (Math.abs(car.speed) < 85) continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 16) {
      ped.state = 'down';
      ped.downT = 15;
      state.events.push('crash');
      if (car.mode === 'player') {
        commitCrime(state, 1.0, ped.x, ped.y);
        addPopup(state, ped.x, ped.y - 18, 'PEDESTRIAN DOWN', '#ff7a6b');
      }
      break;
    }
  }
}

// ------------------------------------------------------------- collisions ---

function collideCars(state, dt) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const minD = 34;
      if (d <= 0.01 || d >= minD) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (minD - d) / 2;
      if (a.mode !== 'player') { a.x -= nx * push; a.y -= ny * push; }
      if (b.mode !== 'player') { b.x += nx * push; b.y += ny * push; }
      if (a.mode === 'player') { b.x += nx * push * 2; b.y += ny * push * 2; }
      if (b.mode === 'player') { a.x -= nx * push * 2; a.y -= ny * push * 2; }

      const closing = (a.speed * Math.cos(a.angle) - b.speed * Math.cos(b.angle)) * nx
        + (a.speed * Math.sin(a.angle) - b.speed * Math.sin(b.angle)) * ny;
      if (closing > 125) {
        const playerInvolved = a.mode === 'player' || b.mode === 'player';
        const copInvolved = a.mode === 'cop' || b.mode === 'cop';
        a.speed *= 0.55;
        b.speed *= 0.55;
        state.events.push('crash');
        if (playerInvolved) {
          hurtPlayer(state, (closing - 110) * 0.05);
          if (copInvolved) commitCrime(state, 0.5, state.player.x, state.player.y);
          else mayhem(state, 3, 6, state.player.x, state.player.y - 20);
        }
      } else if (closing > 20) {
        a.speed *= 0.85;
        b.speed *= 0.85;
      }
    }
  }

  // Near misses feed the mayhem combo.
  const p = state.player;
  if (!p.onFoot && p.car && Math.abs(p.car.speed) > 235) {
    for (const car of cars) {
      if (car === p.car || car.nearCd > 0) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d > 24 && d < 44) {
        car.nearCd = 2.5;
        state.stats.nearMiss++;
        mayhem(state, 2, 4, p.x, p.y - 22);
      }
    }
  }
  for (const car of cars) {
    if (car.nearCd > 0) car.nearCd -= dt;
    if (car.crashCd > 0) car.crashCd -= dt;
  }
}

// --------------------------------------------------------------- missions ---

function pickSpot(state, avoid) {
  const spots = state.city.spots;
  for (let tries = 0; tries < 12; tries++) {
    const s = state.rng.pick(spots);
    if (s !== avoid && s !== state.lastSpot) return s;
  }
  return spots[0];
}

function startMission(state) {
  const type = state.missionSeq % 2 === 0 ? 'deliver' : 'getaway';
  state.missionSeq++;
  const pickup = pickSpot(state, null);
  const drop = pickSpot(state, pickup);
  state.lastSpot = pickup;
  state.mission = {
    type, phase: 'pickup', pickup, drop,
    target: pickup.marker, timer: 0, pay: 0,
  };
}

function completeMission(state) {
  const m = state.mission;
  state.cash += m.pay;
  state.stats.jobs++;
  addPopup(state, state.player.x, state.player.y - 26, `JOB DONE +$${m.pay}`, '#7dff8a');
  state.events.push('cash');
  state.lastSpot = m.drop;
  state.mission = null;
  state.nextMissionIn = 3;
}

function updateMission(state, dt) {
  if (!state.mission) {
    state.nextMissionIn -= dt;
    if (state.nextMissionIn <= 0) startMission(state);
    return;
  }
  const m = state.mission;
  const p = state.player;

  if (m.phase === 'pickup') {
    if (dist(p.x, p.y, m.target.x, m.target.y) < 46) {
      const d = dist(m.pickup.marker.x, m.pickup.marker.y, m.drop.marker.x, m.drop.marker.y);
      if (m.type === 'deliver') {
        m.phase = 'dropoff';
        m.target = m.drop.marker;
        m.pay = clamp(Math.round((140 + d * 0.055) / 5) * 5, 150, 400);
        m.timer = clamp(d / 14 + 18, 30, 100);
      } else {
        // The getaway pickup is the crime: the whole city hears about it.
        addHeat(state, Math.max(0, 3.0 - state.heat));
        state.stats.crimes++;
        state.events.push('crime');
        m.phase = 'escape';
        m.target = null;
        m.pay = clamp(Math.round((190 + d * 0.06) / 5) * 5, 200, 450);
        addPopup(state, p.x, p.y - 26, 'TAKE THE HEAT OFF', '#ff9d5c');
      }
    }
    return;
  }

  if (m.phase === 'escape') {
    if (state.heat <= 0.05 && !state.seen) {
      m.phase = 'hideout';
      m.target = m.drop.marker;
      m.timer = 45;
      addPopup(state, p.x, p.y - 26, 'CLEAR — GET TO THE HIDEOUT', '#7dff8a');
    }
    return;
  }

  // 'dropoff' and 'hideout' are timed runs to the marker.
  m.timer -= dt;
  if (m.timer <= 0) {
    addPopup(state, p.x, p.y - 26, 'JOB FAILED', '#ff7a6b');
    state.mission = null;
    state.nextMissionIn = 4;
    return;
  }
  if (dist(p.x, p.y, m.target.x, m.target.y) < 46) completeMission(state);
}

// ------------------------------------------------------------------- step ---

export function stepWorld(state, input, dt) {
  state.events.length = 0;
  if (state.status !== 'playing') return;
  state.t += dt;
  state.stats.timeAlive += dt;
  const p = state.player;

  if (input.interact) tryEnterExit(state);
  if (p.onFoot) updatePlayerOnFoot(state, input, dt);
  else updatePlayerCar(state, input, dt);

  for (const car of state.cars) {
    if (car.mode === 'traffic' || car.mode === 'leave') updateTrafficCar(state, car, dt);
    else if (car.mode === 'cop') updateCop(state, car, dt);
    else if (car.mode === 'parked') {
      // A parked car shoved by a crash rolls a little, then settles.
      if (car.speed !== 0) {
        driveCar(car, dt);
        car.speed *= (1 - 2.6 * dt);
        if (Math.abs(car.speed) < 3) car.speed = 0;
        collideCircle(state.city.buildings, car, 16);
      }
    }
  }
  collideCars(state, dt);
  for (const ped of state.peds) updatePed(state, ped, dt);

  // Wanted bookkeeping: who can see the player right now?
  state.stars = state.heat <= 0 ? 0 : Math.min(5, Math.ceil(state.heat));
  state.seen = state.cars.some(
    (c) => c.mode === 'cop' && dist(c.x, c.y, p.x, p.y) < SEEN_RANGE,
  );
  if (state.seen) state.unseenFor = 0;
  else {
    state.unseenFor += dt;
    if (state.unseenFor > 5 && state.heat > 0) {
      state.heat = Math.max(0, state.heat - 0.22 * dt);
      state.stars = state.heat <= 0 ? 0 : Math.min(5, Math.ceil(state.heat));
    }
  }
  managePolice(state, dt);

  // The bust meter: stand still next to a cruiser and you are done.
  const slowOrFoot = p.onFoot || Math.abs(p.car ? p.car.speed : 0) < 25;
  const copClose = state.cars.some(
    (c) => c.mode === 'cop' && dist(c.x, c.y, p.x, p.y) < 58,
  );
  if (slowOrFoot && copClose && state.stars > 0) {
    state.bust += dt / 1.4;
    if (state.bust >= 1) {
      state.bust = 1;
      state.status = 'busted';
      state.events.push('busted');
    }
  } else {
    state.bust = Math.max(0, state.bust - 2 * dt);
  }

  // Health creeps back once the player is out of trouble.
  if (state.t - p.lastHurtT > 6 && p.health > 0) {
    p.health = Math.min(100, p.health + 3 * dt);
  }
  if (p.hurtCd > 0) p.hurtCd -= dt;

  // Mayhem combo drains when the chaos stops.
  state.comboT += dt;
  if (state.comboT > 4) state.combo = Math.max(0, state.combo - 14 * dt);

  updateMission(state, dt);

  for (let i = state.popups.length - 1; i >= 0; i--) {
    const pop = state.popups[i];
    pop.t += dt;
    pop.y -= 42 * dt;
    if (pop.t > pop.life) state.popups.splice(i, 1);
  }

  // Camera: follow the player, clamped to the world, unless a scene staged
  // an override (the beach shot).
  if (state.camOverride) {
    state.camX = state.camOverride.x;
    state.camY = state.camOverride.y;
  } else {
    state.camX = clamp(p.x - 640, 0, WORLD.w - 1280);
    state.camY = clamp(p.y - 360, 0, WORLD.h - 720);
  }
}

// A plain-data snapshot of everything that moves, for determinism checks.
export function worldSnapshot(state) {
  const r3 = (n) => Math.round(n * 1000) / 1000;
  return {
    t: r3(state.t),
    status: state.status,
    heat: r3(state.heat),
    cash: state.cash,
    player: {
      x: r3(state.player.x), y: r3(state.player.y),
      angle: r3(state.player.angle), onFoot: state.player.onFoot,
      health: r3(state.player.health),
    },
    cars: state.cars.map((c) => [
      c.id, r3(c.x), r3(c.y), r3(c.angle), r3(c.speed), c.mode,
    ]),
    peds: state.peds.map((pd) => [r3(pd.x), r3(pd.y), pd.state]),
    mission: state.mission
      ? { type: state.mission.type, phase: state.mission.phase, pay: state.mission.pay }
      : null,
  };
}
