// render.js — everything the player sees: the city from above, the cars and
// crowds, the HUD with its minimap, and the title / pause / BUSTED / WASTED
// screens. Canvas 2D, drawn from simulation state only, so a staged scene
// renders the same frame every time.

import { WORLD, AVENUES, STREETS, ROAD_W } from './city.js';
import { CAR_KINDS, comboMult } from './sim.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;

function shade(hex, f) {
  if (hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// Deterministic per-position hash in [0,1): rooftop clutter placement that
// never changes between frames.
function hash2(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCrosswalks(ctx, ax, sy) {
  ctx.fillStyle = 'rgba(238,234,220,0.85)';
  const x0 = ax - ROAD_W / 2;
  const y0 = sy - ROAD_W / 2;
  // Across the avenue, on the north and south legs: vertical stripes, with
  // the junction centre left as bare road.
  for (const bandY of [y0 + 3, y0 + ROAD_W - 25]) {
    for (let x = x0 + 6; x < x0 + ROAD_W - 12; x += 19) {
      ctx.fillRect(x, bandY, 10, 22);
    }
  }
  // Across the street, on the west and east legs: horizontal stripes.
  for (const bandX of [x0 + 3, x0 + ROAD_W - 25]) {
    for (let y = y0 + 6; y < y0 + ROAD_W - 12; y += 19) {
      ctx.fillRect(bandX, y, 22, 10);
    }
  }
}

function drawWorld(ctx, state) {
  const { camX, camY } = state;
  const city = state.city;

  // Ground: dusk-violet pavement, then the promenade, sand and the bay.
  ctx.fillStyle = '#37324e';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#4a4364';
  ctx.fillRect(WORLD.sandX - 77 - camX, -camY, 77, WORLD.h);
  ctx.fillStyle = '#ecd096';
  ctx.fillRect(WORLD.sandX - camX, -camY, WORLD.waterX - WORLD.sandX, WORLD.h);
  ctx.fillStyle = '#dcbd7f';
  ctx.fillRect(WORLD.waterX - 16 - camX, -camY, 16, WORLD.h);
  const wg = ctx.createLinearGradient(WORLD.waterX - camX, 0, WORLD.w - camX, 0);
  wg.addColorStop(0, '#1d8a9c');
  wg.addColorStop(1, '#0f5d75');
  ctx.fillStyle = wg;
  ctx.fillRect(WORLD.waterX - camX, -camY, WORLD.w - WORLD.waterX, WORLD.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const wy = ((i * 311 + Math.sin(state.t * 0.7 + i) * 6) % WORLD.h) - camY;
    if (wy < -10 || wy > VIEW_H + 10) continue;
    ctx.beginPath();
    ctx.arc(WORLD.waterX + 60 + (i % 3) * 55 - camX, wy, 16, 0.3, Math.PI - 0.3);
    ctx.stroke();
  }

  // Roads with kerb lines and dashed double-gold centre lines.
  ctx.fillStyle = '#262433';
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2 - camX, -camY, ROAD_W, WORLD.h);
  for (const sy of STREETS) ctx.fillRect(-camX, sy - ROAD_W / 2 - camY, WORLD.sandX + 60, ROAD_W);
  ctx.strokeStyle = '#4d4870';
  ctx.lineWidth = 2;
  for (const ax of AVENUES) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(ax + s * (ROAD_W / 2) - camX, -camY);
      ctx.lineTo(ax + s * (ROAD_W / 2) - camX, WORLD.h - camY);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(216,178,60,0.75)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (const ax of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(ax - camX, -camY);
    ctx.lineTo(ax - camX, WORLD.h - camY);
    ctx.stroke();
  }
  for (const sy of STREETS) {
    ctx.beginPath();
    ctx.moveTo(-camX, sy - camY);
    ctx.lineTo(WORLD.sandX + 40 - camX, sy - camY);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const ax of AVENUES) {
    for (const sy of STREETS) drawCrosswalks(ctx, ax - camX, sy - camY);
  }

  // Buildings: drop shadow, pastel body, darker inset roof line, rooftop
  // boxes in shades of the roof colour, and a neon strip — lit with the
  // name on the spots that have one.
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const b of city.buildings) {
    const x = b.x - camX;
    const y = b.y - camY;
    if (x + b.w < -30 || y + b.h < -30 || x > VIEW_W + 30 || y > VIEW_H + 30) continue;
    ctx.fillStyle = 'rgba(18,10,28,0.35)';
    ctx.fillRect(x + 7, y + 9, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, b.w, b.h);
    ctx.strokeStyle = b.trim;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 6, y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = b.roof;
    const h1 = hash2(b.x, b.y);
    ctx.fillRect(x + 14 + h1 * 20, y + 14, Math.max(12, b.w * 0.32), Math.max(10, b.h * 0.26));
    if (b.w > 130 && b.h > 110) {
      ctx.fillRect(x + b.w * 0.55, y + b.h * 0.5, b.w * 0.26, b.h * 0.3);
    }
    ctx.fillStyle = b.neon;
    ctx.fillRect(x + 8, y + b.h - 8, b.w - 16, 4);
    if (b.name) {
      ctx.fillStyle = 'rgba(16,12,26,0.82)';
      const tw = ctx.measureText(b.name.toUpperCase()).width + 14;
      rr(ctx, x + b.w / 2 - tw / 2, y + b.h - 26, tw, 15, 4);
      ctx.fill();
      ctx.fillStyle = '#ffe9f6';
      ctx.fillText(b.name.toUpperCase(), x + b.w / 2, y + b.h - 15);
    }
  }

  // Palms: a soft shadow, six fronds and a trunk dot.
  ctx.strokeStyle = '#3f9e4d';
  ctx.lineWidth = 2.5;
  for (const p of city.palms) {
    const x = p.x - camX;
    const y = p.y - camY;
    if (x < -30 || y < -30 || x > VIEW_W + 30 || y > VIEW_H + 30) continue;
    ctx.fillStyle = 'rgba(18,10,28,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 4, 9 * p.s, 4 * p.s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + hash2(p.x, p.y) * 2;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(a) * 9 * p.s, y + Math.sin(a) * 8 * p.s - 3,
        x + Math.cos(a) * 15 * p.s, y + Math.sin(a) * 12 * p.s + 2,
      );
    }
    ctx.stroke();
    ctx.fillStyle = '#7a5230';
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// -------------------------------------------------------------- entities ---

function drawCar(ctx, state, car) {
  const K = CAR_KINDS[car.kind];
  const x = car.x - state.camX;
  const y = car.y - state.camY;
  if (x < -60 || y < -60 || x > VIEW_W + 60 || y > VIEW_H + 60) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(15,8,24,0.35)';
  rr(ctx, -K.len / 2 + 3, -K.wid / 2 + 4, K.len, K.wid, 6);
  ctx.fill();
  const isCop = car.kind === 'cop';
  ctx.fillStyle = isCop ? '#15161c' : car.color;
  rr(ctx, -K.len / 2, -K.wid / 2, K.len, K.wid, 6);
  ctx.fill();
  if (isCop) {
    ctx.fillStyle = '#e8e8ec';
    ctx.fillRect(-K.len * 0.16, -K.wid / 2 + 1.5, K.len * 0.34, K.wid - 3);
  } else {
    ctx.fillStyle = shade(car.color, 0.72);
    rr(ctx, -K.len * 0.16, -K.wid / 2 + 3, K.len * 0.36, K.wid - 6, 3);
    ctx.fill();
  }
  // Windshield and rear glass.
  ctx.fillStyle = 'rgba(20,28,44,0.9)';
  ctx.fillRect(K.len * 0.2, -K.wid / 2 + 3.5, 4.5, K.wid - 7);
  ctx.fillRect(-K.len * 0.26, -K.wid / 2 + 3.5, 4, K.wid - 7);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(K.len / 2 - 2.5, -K.wid / 2 + 2.5, 2.5, 4);
  ctx.fillRect(K.len / 2 - 2.5, K.wid / 2 - 6.5, 2.5, 4);
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#ffd94a';
    ctx.fillRect(-4, -3.5, 8, 7);
  }
  if (isCop) {
    // Light bar, alternating red and blue.
    const phase = Math.floor(state.t * 5) % 2;
    ctx.fillStyle = phase ? '#ff3b30' : '#5c2e2e';
    ctx.fillRect(-6, -K.wid / 2 + 3, 6, K.wid - 6);
    ctx.fillStyle = phase ? '#2e4a8f' : '#3b82f6';
    ctx.fillRect(0, -K.wid / 2 + 3, 6, K.wid - 6);
  }
  ctx.restore();
}

function drawPed(ctx, state, ped) {
  const x = ped.x - state.camX;
  const y = ped.y - state.camY;
  if (x < -20 || y < -20 || x > VIEW_W + 20 || y > VIEW_H + 20) return;
  ctx.fillStyle = 'rgba(15,8,24,0.3)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 3, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  if (ped.state === 'down') ctx.rotate(Math.PI / 2);
  else ctx.rotate(ped.angle);
  ctx.fillStyle = ped.color;
  rr(ctx, -4, -3.4, 9, 6.8, 3);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(5.5, 0, 3.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayerMarker(ctx, state) {
  const p = state.player;
  const x = p.x - state.camX;
  const y = p.y - state.camY;
  const bob = Math.sin(state.t * 5) * 2.5;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - 24 + bob);
  ctx.lineTo(x - 7, y - 33 + bob);
  ctx.lineTo(x + 7, y - 33 + bob);
  ctx.closePath();
  ctx.fill();
}

function drawMissionMarker(ctx, state) {
  const m = state.mission;
  if (!m || !m.target) return;
  const tx = m.target.x - state.camX;
  const ty = m.target.y - state.camY;
  if (tx < -20 || ty < -20 || tx > VIEW_W + 20 || ty > VIEW_H + 20) return;
  // A beam of gold light and a diamond at its foot.
  const grad = ctx.createLinearGradient(0, ty - 190, 0, ty);
  grad.addColorStop(0, 'rgba(255,217,74,0)');
  grad.addColorStop(1, 'rgba(255,217,74,0.5)');
  ctx.fillStyle = grad;
  ctx.fillRect(tx - 5, ty - 190, 10, 190);
  const pulse = 15 + Math.sin(state.t * 4) * 3;
  ctx.strokeStyle = 'rgba(255,217,74,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(tx, ty, pulse + 8, (pulse + 8) * 0.45, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd94a';
  ctx.save();
  ctx.translate(tx, ty - 8);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-6, -6, 12, 12);
  ctx.restore();
}

function drawPopups(ctx, state) {
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const pop of state.popups) {
    const a = Math.max(0, 1 - pop.t / pop.life);
    ctx.globalAlpha = a;
    ctx.fillStyle = pop.color;
    ctx.strokeStyle = 'rgba(10,8,18,0.8)';
    ctx.lineWidth = 3;
    const x = pop.x - state.camX;
    const y = pop.y - state.camY;
    ctx.strokeText(pop.text, x, y);
    ctx.fillText(pop.text, x, y);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------- HUD ---

function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd94a' : 'rgba(255,255,255,0.16)';
  ctx.fill();
}

function missionText(state) {
  const m = state.mission;
  if (!m) return null;
  if (m.type === 'deliver') {
    return m.phase === 'pickup'
      ? { title: 'DELIVER', line: `Pick up at ${m.pickup.name}` }
      : { title: 'DELIVER', line: `Drop off at ${m.drop.name} — $${m.pay} on arrival` };
  }
  if (m.phase === 'pickup') return { title: 'GETAWAY', line: `Pick up at ${m.pickup.name}` };
  if (m.phase === 'escape') return { title: 'GETAWAY', line: 'Lose the cops, then lie low' };
  return { title: 'GETAWAY', line: `Hide out at ${m.drop.name} — $${m.pay} if you make it` };
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(13,11,24,0.72)';
  rr(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawMinimap(ctx, state) {
  const MW = 196;
  const MH = 140;
  const x0 = VIEW_W - MW - 16;
  const y0 = VIEW_H - MH - 16;
  const s = MW / WORLD.w;
  panel(ctx, x0 - 6, y0 - 6, MW + 12, MH + 12);
  ctx.fillStyle = '#221f33';
  ctx.fillRect(x0, y0, MW, MH);
  ctx.fillStyle = '#14667d';
  ctx.fillRect(x0 + WORLD.waterX * s, y0, (WORLD.w - WORLD.waterX) * s, MH);
  ctx.fillStyle = '#ecd096';
  ctx.fillRect(x0 + WORLD.sandX * s, y0, (WORLD.waterX - WORLD.sandX) * s, MH);
  ctx.strokeStyle = '#5d5780';
  ctx.lineWidth = 1;
  for (const ax of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(x0 + ax * s, y0);
    ctx.lineTo(x0 + ax * s, y0 + MH);
    ctx.stroke();
  }
  for (const sy of STREETS) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + sy * s);
    ctx.lineTo(x0 + WORLD.sandX * s, y0 + sy * s);
    ctx.stroke();
  }
  if (state.mission && state.mission.target) {
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.arc(x0 + state.mission.target.x * s, y0 + state.mission.target.y * s, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const blink = Math.floor(state.t * 3) % 2 === 0;
  for (const car of state.cars) {
    if (car.mode !== 'cop') continue;
    ctx.fillStyle = blink ? '#ff3b30' : '#3b82f6';
    ctx.fillRect(x0 + car.x * s - 2, y0 + car.y * s - 2, 4, 4);
  }
  const p = state.player;
  ctx.save();
  ctx.translate(x0 + p.x * s, y0 + p.y * s);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -3.6);
  ctx.lineTo(-4, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHUD(ctx, state) {
  const p = state.player;
  ctx.textAlign = 'left';

  // Cash and mayhem, top-left.
  panel(ctx, 16, 16, 218, 64);
  ctx.fillStyle = '#7dff8a';
  ctx.font = '700 27px system-ui, sans-serif';
  ctx.fillText(`$${state.cash.toLocaleString('en-US')}`, 30, 52);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.fillText('CASH', 30, 70);
  if (state.combo > 0.5) {
    ctx.fillStyle = '#ffd94a';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText(`MAYHEM x${comboMult(state)}`, 30, 106);
    ctx.fillStyle = 'rgba(255,217,74,0.3)';
    ctx.fillRect(30, 114, 120, 5);
    ctx.fillStyle = '#ffd94a';
    ctx.fillRect(30, 114, Math.min(120, state.combo * 5), 5);
  }

  // Mission prompt under the cash.
  const mt = missionText(state);
  if (mt) {
    panel(ctx, 16, 92 + (state.combo > 0.5 ? 42 : 0), 330, 56);
    const my = 92 + (state.combo > 0.5 ? 42 : 0);
    ctx.fillStyle = '#ffd94a';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(mt.title, 30, my + 21);
    ctx.fillStyle = '#f2eefc';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(mt.line, 30, my + 41);
    const m = state.mission;
    if ((m.phase === 'dropoff' || m.phase === 'hideout') && m.timer > 0) {
      const max = m.phase === 'hideout' ? 45 : 100;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(250, my + 12, 82, 6);
      ctx.fillStyle = m.timer < 12 ? '#ff5c49' : '#7dff8a';
      ctx.fillRect(250, my + 12, 82 * Math.max(0, Math.min(1, m.timer / max)), 6);
    }
  }

  // Wanted stars and health, top-right.
  const flash = state.seen && Math.floor(state.t * 4) % 2 === 0;
  for (let i = 0; i < 5; i++) {
    const on = i < state.stars;
    star(ctx, VIEW_W - 150 + i * 30, 38, 12, on && !flash ? true : on);
    if (on && flash) {
      ctx.fillStyle = 'rgba(255,59,48,0.35)';
      ctx.beginPath();
      ctx.arc(VIEW_W - 150 + i * 30, 38, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('WANTED', VIEW_W - 24, 66);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  rr(ctx, VIEW_W - 176, 76, 152, 9, 4);
  ctx.fill();
  ctx.fillStyle = p.health > 35 ? '#7dff8a' : '#ff5c49';
  rr(ctx, VIEW_W - 176, 76, 152 * Math.max(0, p.health / 100), 9, 4);
  ctx.fill();

  // The bust meter, centre-top, only while it is filling.
  if (state.bust > 0.02) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5c49';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText('BUST', VIEW_W / 2, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, VIEW_W / 2 - 110, 42, 220, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#ff5c49';
    rr(ctx, VIEW_W / 2 - 110, 42, 220 * state.bust, 8, 4);
    ctx.fill();
  }

  // Speed, bottom-left.
  ctx.textAlign = 'left';
  if (!p.onFoot && p.car) {
    const mph = Math.round(Math.abs(p.car.speed) * 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText(`${mph}`, 24, VIEW_H - 44);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`MPH · ${p.car.kind.toUpperCase()}`, 24, VIEW_H - 22);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText('ON FOOT', 24, VIEW_H - 24);
  }

  // Off-screen mission arrow.
  const m = state.mission;
  if (m && m.target) {
    const tx = m.target.x - state.camX;
    const ty = m.target.y - state.camY;
    if (tx < 10 || ty < 10 || tx > VIEW_W - 10 || ty > VIEW_H - 10) {
      const cx = Math.max(36, Math.min(VIEW_W - 36, tx));
      const cy = Math.max(36, Math.min(VIEW_H - 36, ty));
      const ang = Math.atan2(ty - VIEW_H / 2, tx - VIEW_W / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      const d = Math.round(Math.hypot(m.target.x - p.x, m.target.y - p.y) / 10);
      ctx.fillStyle = '#ffd94a';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${d}m`, cx, cy + 26);
    }
  }

  drawMinimap(ctx, state);
}

// --------------------------------------------------------------- screens ---

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function drawStats(ctx, state) {
  const rows = [
    ['Cash in hand', `$${state.cash.toLocaleString('en-US')}`],
    ['Jobs done', `${state.stats.jobs}`],
    ['Crimes', `${state.stats.crimes}`],
    ['Near misses', `${state.stats.nearMiss}`],
    ['Top speed', `${Math.round(state.stats.topSpeed * 0.3)} MPH`],
    ['Time survived', fmtTime(state.stats.timeAlive)],
  ];
  ctx.font = '600 17px system-ui, sans-serif';
  rows.forEach(([k, v], i) => {
    const y = 356 + i * 30;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(k, VIEW_W / 2 - 16, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(v, VIEW_W / 2 + 16, y);
  });
}

function drawTitle(ctx, state) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, 'rgba(24,8,38,0.62)');
  g.addColorStop(1, 'rgba(24,8,38,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = '#f472b6';
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ffe3f1';
  ctx.font = '800 76px system-ui, sans-serif';
  ctx.fillText('NEON BAY HEAT', VIEW_W / 2, 218);
  ctx.restore();
  ctx.fillStyle = '#a5f3fc';
  ctx.font = '600 19px system-ui, sans-serif';
  ctx.fillText('An original top-down crime sandbox — steal it, run it, cash it in.', VIEW_W / 2, 258);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '500 16px system-ui, sans-serif';
  ctx.fillText('WASD / arrows — move and drive      E / F — steal or ditch a car      Shift — run', VIEW_W / 2, 330);
  ctx.fillText('Take the gold jobs, watch the stars, and never stop moving next to a cruiser.', VIEW_W / 2, 358);
  if (Math.floor(state.t * 1.6) % 2 === 0) {
    ctx.fillStyle = '#ffd94a';
    ctx.font = '700 21px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER TO PLAY', VIEW_W / 2, 440);
  }
}

function drawEndScreen(ctx, state, kind) {
  ctx.fillStyle = kind === 'busted' ? 'rgba(70,6,4,0.5)' : 'rgba(8,6,14,0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'busted' ? '#ff6a55' : '#e8e8f2';
  ctx.font = '800 84px system-ui, sans-serif';
  ctx.fillText(kind === 'busted' ? 'B U S T E D' : 'W A S T E D', VIEW_W / 2, 240);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '500 17px system-ui, sans-serif';
  ctx.fillText(
    kind === 'busted' ? 'The cruisers boxed you in. The bay keeps your money either way.' : 'Neon Bay is rough on the reckless.',
    VIEW_W / 2, 282,
  );
  drawStats(ctx, state);
  ctx.fillStyle = '#ffd94a';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText('PRESS ENTER TO TRY AGAIN', VIEW_W / 2, 580);
}

// The one entry point: draw the world, its people, the HUD and whichever
// screen the shell is showing.
export function renderFrame(ctx, state, screen) {
  drawWorld(ctx, state);
  drawMissionMarker(ctx, state);
  for (const ped of state.peds) drawPed(ctx, state, ped);
  for (const car of state.cars) drawCar(ctx, state, car);
  if (state.player.onFoot) {
    // The player on foot, drawn like a pedestrian but unmistakably theirs.
    const p = state.player;
    const x = p.x - state.camX;
    const y = p.y - state.camY;
    ctx.fillStyle = 'rgba(15,8,24,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ff5c39';
    rr(ctx, -4.5, -3.8, 10, 7.6, 3);
    ctx.fill();
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath();
    ctx.arc(6, 0, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawPlayerMarker(ctx, state);
  drawPopups(ctx, state);

  if (screen !== 'title') drawHUD(ctx, state);
  if (screen === 'title') drawTitle(ctx, state);
  else if (screen === 'pause') {
    ctx.fillStyle = 'rgba(10,8,20,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.fillText('PAUSED', VIEW_W / 2, 330);
    ctx.font = '500 17px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Esc / P to resume · the bay is not going anywhere', VIEW_W / 2, 372);
  } else if (screen === 'busted') drawEndScreen(ctx, state, 'busted');
  else if (screen === 'wasted') drawEndScreen(ctx, state, 'wasted');
}
