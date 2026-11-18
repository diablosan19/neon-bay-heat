# NEON BAY HEAT — a tiny open-world crime sandbox

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/diablosan19/neon-bay-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/diablosan19/neon-bay-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon Bay Heat is a top-down 2D open-world crime game that runs in a desktop
browser from static files — no build step, no network. It is an original
homage to the classic top-down open-world crime games: an original city
(Neon Bay), original names, art, and code. No Rockstar assets, names, or
trademarks are used anywhere.

## The city

Neon Bay is a seeded 3360×2400 world: six avenues and four streets of
two-lane traffic, pastel blocks with neon-signed spots (Coral Diner, Club
Mirage, Hotel Solano, Starfish Tacos on the promenade…), kerbside parking
everywhere, parks and palms, and a beach and bay along the east edge.

## How to play

- **WASD / arrows** — walk and drive. **Shift** — run. **E / F** — steal or
  ditch a car. **Esc / P** — pause. **Enter** — start and restart.
- Steal from five kinds of car — compact, sedan, coupe, taxi, van — each
  with its own top speed, acceleration, and handling.
- Crimes raise your heat: theft, running a pedestrian down, crashing a
  cruiser. Heat shows as up to five wanted stars, and cruisers spawn,
  chase, and box you in. Stand still next to one and the BUST meter fills.
  Break their line of sight for five seconds and the heat cools away.
- Jobs alternate between **DELIVER** (timed pickup and drop-off) and
  **GETAWAY** (the pickup itself sets three stars on you — lose the cops,
  then reach the hideout against the clock). Jobs pay $150–$450.
- Near misses, scares, and crashes feed the **MAYHEM** combo, which pays
  cash out at up to ×5 while the chaos lasts.

## Tech

Canvas 2D rendering over a pure, fixed-step (60 Hz) simulation in plain ES
modules — `sim.js` (rules), `city.js` (the seeded city), `render.js` (the
drawing), `sound.js` (a WebAudio synth: engine, sirens, stings), `shots.js`
(deterministic screenshot scenes). All randomness comes from one seeded
mulberry32 stream, so a world replays exactly from its seed plus inputs;
`tools/selfcheck.mjs` verifies that headlessly, along with the wanted,
mission, bust, and screenshot-scene invariants.

## Run it locally

```sh
node serve.ts   # then open http://localhost:8080
```

Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards — see the [gta6-01 bounty](https://make.fun/bounty/gta6-01).
