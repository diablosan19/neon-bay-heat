// Neon Bay Heat — entry packager for make.fun's gta6-01 bounty (Node 22,
// standard library only).
//
// The game itself is the static site in game/ (open game/index.html in a
// browser and play; no build step, no network). This program hands it in:
// it validates the tree against the gate's caps, copies game/ and
// screenshots/ beside the dossier into the output directory, writes
// dossier.json with the vendored buildDossier library, and leaves a
// build-manifest.json describing exactly what was shipped. Run it with
// MAKEFUN_OUTPUT_DIR set outside the grader; inside, /output is the
// default. It writes only deterministic bytes, so two runs agree.

import {
  cpSync, existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const GATE = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648, // 48 MiB
  game_path_max_bytes: 1000,
};
const INDEX_MAX_BYTES = 1024 * 1024;

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(root, 'game');
const shotsDir = join(root, 'screenshots');

function refuse(message: string): never {
  throw new Error(`neon-bay-heat: preflight refused the entry — ${message}`);
}

// Walk a tree once, collecting { path, bytes } per file and refusing
// anything the gate would refuse: symlinks, oversize paths, a missing or
// oversize index.html, too many entries, too many bytes.
function survey(dir: string, label: string) {
  const files: { path: string; bytes: number }[] = [];
  let entries = 0;
  let total = 0;
  const visit = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const rel = relative(dir, full);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) refuse(`${label}/${rel} is a symlink`);
      entries++;
      if (Buffer.byteLength(rel, 'utf8') > GATE.game_path_max_bytes) {
        refuse(`${label}/${rel} exceeds the ${GATE.game_path_max_bytes}-byte path cap`);
      }
      if (st.isDirectory()) visit(full);
      else if (st.isFile()) {
        files.push({ path: rel, bytes: st.size });
        total += st.size;
      }
    }
  };
  visit(dir);
  return { files, entries, total };
}

function preflight() {
  if (!existsSync(join(gameDir, 'index.html'))) refuse('game/index.html is missing');
  const game = survey(gameDir, 'game');
  if (game.entries > GATE.game_max_files) {
    refuse(`game/ holds ${game.entries} entries, over the ${GATE.game_max_files} cap`);
  }
  if (game.total > GATE.game_max_bytes) {
    refuse(`game/ is ${game.total} bytes, over the ${GATE.game_max_bytes} cap`);
  }
  const index = game.files.find((f) => f.path === 'index.html');
  if (index && index.bytes > INDEX_MAX_BYTES) refuse('game/index.html exceeds 1 MiB');

  if (!existsSync(shotsDir)) refuse('screenshots/ is missing');
  const shots = survey(shotsDir, 'screenshots');
  const images = shots.files.filter((f) => !f.path.split('/').pop()!.startsWith('.'));
  if (images.length < 3 || images.length > GATE.screenshots.max) {
    refuse(`screenshots/ holds ${images.length} images, need 3 or 4`);
  }
  for (const img of images) {
    if (img.bytes > GATE.screenshots.max_bytes) {
      refuse(`screenshots/${img.path} exceeds the 256 KiB screenshot cap`);
    }
  }
  return { game, shots: images };
}

const { game, shots } = preflight();

mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, GATE);
writeFileSync(join(outDir, 'dossier.json'), dossier);

// The manifest: every shipped file with its size, sorted by path, nothing
// time-varying — a fingerprint a human can diff between two runs. (It does
// not list itself.)
const manifest = {
  game: 'Neon Bay Heat',
  files: [
    ...game.files.map((f) => ({ path: `game/${f.path}`, bytes: f.bytes })),
    ...shots.map((f) => ({ path: `screenshots/${f.path}`, bytes: f.bytes })),
    { path: 'dossier.json', bytes: Buffer.byteLength(dossier, 'utf8') },
  ].sort((a, b) => (a.path < b.path ? -1 : 1)),
};
writeFileSync(join(outDir, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `neon-bay-heat: shipped ${game.files.length} game files (${game.total} bytes), `
  + `${shots.length} screenshots, dossier ${Buffer.byteLength(dossier, 'utf8')} bytes`,
);
