// selfcheck.mjs — headless verification for Neon Bay Heat. Imports the real
// simulation and the real screenshot staging, and asserts the rules the
// game promises: exact seed replay, theft and stacked crimes driving the
// wanted stars, heat cooling when unseen, the cornered bust, both mission
// flows paying out, the staged scenes holding their invariants, byte-stable
// staging, and long autopilot soaks staying finite with bounded entities.
//
// Run: node tools/selfcheck.mjs   (exit 0 = everything passed)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWorld, stepWorld, addHeat, spawnCop, worldSnapshot, STEP,
} from '../game/src/sim.js';
import { stageScene } from '../game/src/shots.js';
import { WORLD } from '../game/src/city.js';
import { wrapAngle } from '../game/src/rng.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const IDLE = { up: false, down: false, left: false, right: false, run: false, interact: false };

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function steps(state, n, input = IDLE) {
  for (let i = 0; i < n; i++) stepWorld(state, input, STEP);
}

function parkedCars(state) {
  return state.cars.filter((c) => c.mode === 'parked');
}

function teleportBeside(state, car) {
  state.player.x = car.x + 30;
  state.player.y = car.y;
}

// ---------------------------------------------------------- 1. seed replay
function autopilot(state, tick) {
  const inp = { ...IDLE, run: true };
  const p = state.player;
  let target = null;
  if (state.mission && state.mission.target) target = state.mission.target;
  else if (p.onFoot) {
    let best = Infinity;
    for (const c of parkedCars(state)) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < best) { best = d; target = c; }
    }
  } else {
    target = state.city.spots[Math.floor(tick / 900) % state.city.spots.length].marker;
  }
  if (!target) return inp;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy);
  if (p.onFoot) {
    if (dx > 6) inp.right = true;
    if (dx < -6) inp.left = true;
    if (dy > 6) inp.down = true;
    if (dy < -6) inp.up = true;
    if (d < 40) inp.interact = true;
  } else {
    const diff = wrapAngle(Math.atan2(dy, dx) - p.angle);
    if (diff > 0.14) inp.right = true;
    if (diff < -0.14) inp.left = true;
    inp.up = true;
  }
  return inp;
}

{
  const a = createWorld(7);
  const b = createWorld(7);
  for (let i = 0; i < 600; i++) {
    stepWorld(a, autopilot(a, i), STEP);
    stepWorld(b, autopilot(b, i), STEP);
  }
  check(
    'seed replay: two seed-7 worlds, 600 autopilot steps, identical snapshots',
    JSON.stringify(worldSnapshot(a)) === JSON.stringify(worldSnapshot(b)),
  );
}

// ------------------------------------------------------------- 2. the theft
{
  const s = createWorld(3);
  const car = parkedCars(s)[0];
  teleportBeside(s, car);
  stepWorld(s, { ...IDLE, interact: true }, STEP);
  check('theft: interacting beside a parked car puts the player in it', !s.player.onFoot && s.player.car === car);
  check('theft: heat reaches at least 1 star', s.heat >= 1 && s.stars >= 1, `heat=${s.heat}`);
}

// ------------------------------------------------------ 3. crimes stack up
{
  const s = createWorld(3);
  for (let k = 0; k < 3; k++) {
    const car = parkedCars(s).find((c) => !c.stolen);
    teleportBeside(s, car);
    stepWorld(s, { ...IDLE, interact: true }, STEP); // steal
    stepWorld(s, { ...IDLE, interact: true }, STEP); // get back out
  }
  check('stacked crimes: three thefts reach exactly 3 stars', s.stars === 3, `heat=${s.heat} stars=${s.stars}`);
}

// ------------------------------------------------------ 4. heat cools away
{
  const s = createWorld(5);
  addHeat(s, 2.0);
  let cooledAt = -1;
  for (let i = 0; i < 1200; i++) {
    // Keep the test about the cooling rule: no police on the board.
    s.cars = s.cars.filter((c) => c.mode !== 'cop');
    stepWorld(s, IDLE, STEP);
    if (s.heat === 0) { cooledAt = i; break; }
  }
  check('heat cools to 0 when unseen (5 s grace, then 0.22/s)', cooledAt > 0, `cooledAt=${cooledAt}`);
  check('stars follow heat back to 0', s.stars === 0);
}

// -------------------------------------------------------- 5. cornered bust
{
  const s = createWorld(2);
  addHeat(s, 2.0);
  const cop = spawnCop(s);
  cop.x = s.player.x + 40;
  cop.y = s.player.y;
  cop.speed = 0;
  let bustStep = -1;
  for (let i = 0; i < 300; i++) {
    stepWorld(s, IDLE, STEP);
    if (s.status === 'busted') { bustStep = i; break; }
  }
  check('a cornered player standing by a cruiser is BUSTED', bustStep > 0, `bustStep=${bustStep}`);
}

// ---------------------------------------------------- 6+7. the mission loop
{
  const s = createWorld(4);
  let guard = 0;
  while (!s.mission && guard++ < 400) stepWorld(s, IDLE, STEP);
  check('a deliver job is offered', !!s.mission && s.mission.type === 'deliver' && s.mission.phase === 'pickup');
  s.player.x = s.mission.target.x;
  s.player.y = s.mission.target.y;
  stepWorld(s, IDLE, STEP);
  check(
    'deliver pickup arms the drop-off with pay and a timer',
    s.mission.phase === 'dropoff' && s.mission.pay >= 150 && s.mission.pay <= 400 && s.mission.timer > 0,
    JSON.stringify(s.mission && { phase: s.mission.phase, pay: s.mission.pay, timer: s.mission.timer }),
  );
  const pay = s.mission.pay;
  const cashBefore = s.cash;
  s.player.x = s.mission.target.x;
  s.player.y = s.mission.target.y;
  stepWorld(s, IDLE, STEP);
  check('deliver drop-off pays out and closes the job', s.stats.jobs === 1 && s.cash === cashBefore + pay && !s.mission);

  guard = 0;
  while (!s.mission && guard++ < 500) stepWorld(s, IDLE, STEP);
  check('the next job is a getaway', !!s.mission && s.mission.type === 'getaway');
  s.player.x = s.mission.target.x;
  s.player.y = s.mission.target.y;
  stepWorld(s, IDLE, STEP);
  check('getaway pickup forces 3 stars and the escape phase', s.mission.phase === 'escape' && s.heat >= 3, `heat=${s.heat}`);
  guard = 0;
  while (s.mission && s.mission.phase === 'escape' && guard++ < 2400) {
    s.cars = s.cars.filter((c) => c.mode !== 'cop');
    stepWorld(s, IDLE, STEP);
  }
  check('losing the police opens the hideout phase', !!s.mission && s.mission.phase === 'hideout');
  if (s.mission) {
    s.player.x = s.mission.target.x;
    s.player.y = s.mission.target.y;
    stepWorld(s, IDLE, STEP);
  }
  check('reaching the hideout completes the getaway', s.stats.jobs === 2);
}

// ------------------------------------------------------- 8-11. the scenes
{
  const { state, screen } = stageScene('play', 1);
  const p = state.player;
  const nearCops = state.cars.filter((c) => c.mode === 'cop' && Math.hypot(c.x - p.x, c.y - p.y) < 340);
  check('play scene: player is in a stolen coupe', !p.onFoot && p.car && p.car.kind === 'coupe');
  check('play scene: 3 wanted stars', state.stars === 3, `stars=${state.stars}`);
  check('play scene: two cruisers staged within 340px', nearCops.length >= 2, `near=${nearCops.length}`);
  check(
    'play scene: drop-off job live with cash and combo',
    !!state.mission && state.mission.phase === 'dropoff' && state.cash >= 1200 && state.combo >= 8,
    `cash=${state.cash} combo=${state.combo}`,
  );
  check('play scene renders through the play screen', screen === 'play');
}
{
  const { state } = stageScene('beach', 1);
  const p = state.player;
  const coupe = state.cars.find(
    (c) => c.mode === 'parked' && c.kind === 'coupe' && Math.hypot(c.x - p.x, c.y - p.y) < 420,
  );
  check('beach scene: player on foot on the sand, no heat', p.onFoot && p.x > WORLD.sandX && state.heat === 0);
  check('beach scene: camera override frames sand + water as the right third',
    !!state.camOverride && state.camOverride.x === 2080 && state.camX === 2080);
  check('beach scene: a parked coupe waits at the kerb', !!coupe);
  check('beach scene: the Starfish Tacos job is offered',
    !!state.mission && state.mission.pickup.name === 'Starfish Tacos');
}
{
  const { state, screen } = stageScene('end', 1);
  const ring = state.cars.filter(
    (c) => c.mode === 'cop' && Math.hypot(c.x - state.player.x, c.y - state.player.y) < 85,
  );
  check('end scene: BUSTED, ringed by 4 cruisers, full stats',
    state.status === 'busted' && ring.length === 4 && state.stats.jobs === 3 && screen === 'busted',
    `ring=${ring.length} status=${state.status}`);
}
{
  const fresh = createWorld(1);
  const { state, screen } = stageScene('start', 1);
  const moved = state.cars.filter(
    (c, i) => c.mode === 'traffic' && Math.hypot(c.x - fresh.cars[i].x, c.y - fresh.cars[i].y) > 30,
  );
  check('start scene: title over live, moved traffic', screen === 'title' && moved.length >= 8, `moved=${moved.length}`);
}

// ----------------------------------------------------- 12. byte-stable staging
{
  const snap = (name) => JSON.stringify(worldSnapshot(stageScene(name, 1).state));
  check('staging is byte-stable: play', snap('play') === snap('play'));
  check('staging is byte-stable: beach', snap('beach') === snap('beach'));
  check('staging is byte-stable: end', snap('end') === snap('end'));
}

// ------------------------------------------------------------- 13. the soak
{
  let totalSteps = 0;
  for (const seed of [11, 23, 37]) {
    const s = createWorld(seed);
    const initialCars = s.cars.length;
    let i = 0;
    for (; i < 3600; i++) {
      stepWorld(s, autopilot(s, i), STEP);
      if (s.status !== 'playing') break;
    }
    totalSteps += i;
    const finite = [s.player, ...s.cars, ...s.peds].every(
      (e) => Number.isFinite(e.x) && Number.isFinite(e.y),
    );
    check(
      `soak seed ${seed}: ${i} steps, finite, bounded entities`,
      finite && s.cars.length <= initialCars + 8 && s.peds.length <= 28,
      `cars=${s.cars.length}/${initialCars} peds=${s.peds.length} status=${s.status}`,
    );
  }
  check('soaks exercised real play (3600+ steps in all)', totalSteps >= 3600, `total=${totalSteps}`);
}

// ------------------------------------------------- 14. sources and the tree
{
  for (const f of ['sim.js', 'city.js', 'shots.js', 'rng.js']) {
    const src = readFileSync(join(root, 'game', 'src', f), 'utf8');
    check(`${f} never calls Math.random`, !src.includes('Math.random('));
  }
  let count = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      count++;
      if (statSync(full).isDirectory()) walk(full);
    }
  };
  walk(join(root, 'game'));
  check('game/ is far under the 993-entry cap', count <= 993, `entries=${count}`);
}

console.log(`\nselfcheck: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
