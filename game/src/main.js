// main.js — the shell: canvas, the fixed-step loop, and the screen flow
// (title -> play <-> pause, busted / wasted -> restart). The simulation
// advances in exact 1/60 s steps however the display refreshes, and renders
// once per animation frame.
//
// ?seed=N fixes the world seed. ?shot=start|play|end|beach&seed=N stages a
// deterministic screenshot scene instead: the scene is built, painted twice
// (so fonts and gradients settle), and window.__shotReady is set.

import { createWorld, stepWorld, STEP } from './sim.js';
import { renderFrame, VIEW_W, VIEW_H } from './render.js';
import { Input } from './input.js';
import { SoundEngine } from './sound.js';
import { stageScene } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const status = document.getElementById('status');

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = parseInt(params.get('seed') || '', 10);

const input = new Input(window);
const sound = new SoundEngine();

let world = null;
let screen = 'title';
let accumulator = 0;
let lastTs = 0;

function newWorld(seed) {
  world = createWorld(seed);
  screen = 'title';
  accumulator = 0;
}

function liveSeed() {
  return (Date.now() % 2147483647) + 1;
}

if (shotName) {
  const staged = stageScene(shotName, Number.isFinite(seedParam) ? seedParam : 1);
  world = staged.state;
  let paints = 0;
  const paint = () => {
    renderFrame(ctx, world, staged.screen);
    paints++;
    if (paints >= 2) {
      window.__shotReady = true;
    } else {
      requestAnimationFrame(paint);
    }
  };
  requestAnimationFrame(paint);
} else {
  newWorld(Number.isFinite(seedParam) ? seedParam : liveSeed());
  requestAnimationFrame(loop);
}

function announce(text) {
  if (status && status.textContent !== text) status.textContent = text;
}

function loop(ts) {
  requestAnimationFrame(loop);
  if (!lastTs) lastTs = ts;
  let frame = (ts - lastTs) / 1000;
  lastTs = ts;
  if (frame > 0.1) frame = 0.1;

  sound.start();

  if (input.take('pause')) {
    if (screen === 'play') screen = 'pause';
    else if (screen === 'pause') screen = 'play';
  }
  if (input.take('confirm')) {
    if (screen === 'title') screen = 'play';
    else if (screen === 'busted' || screen === 'wasted') newWorld(liveSeed()), (screen = 'play');
  }
  // The interact press is an edge the simulation consumes itself; hand it
  // through the intent of the next step only.
  const interactPressed = input.take('interact');

  if (screen === 'play') {
    accumulator += frame;
    let first = true;
    while (accumulator >= STEP) {
      const intent = input.intent();
      if (first && interactPressed) intent.interact = true;
      first = false;
      stepWorld(world, intent, STEP);
      accumulator -= STEP;
      if (world.status !== 'playing') break;
    }
    if (world.status === 'busted') screen = 'busted';
    else if (world.status === 'wasted') screen = 'wasted';
  } else if (screen === 'title') {
    // The city idles behind the title: step with no input.
    accumulator += frame;
    while (accumulator >= STEP) {
      stepWorld(world, input.intent(), STEP);
      accumulator -= STEP;
    }
  }

  sound.consumeEvents(world);
  sound.update(world);
  renderFrame(ctx, world, screen);
  announce(
    screen === 'title'
      ? 'Neon Bay Heat. Press Enter to play.'
      : `Cash $${world.cash}. Wanted level ${world.stars}. ${screen === 'play' ? 'Playing.' : screen}.`,
  );
}
