// input.js — keyboard intent for the simulation. Held keys give continuous
// intent (move, drive, run); one-shot presses (interact, pause, confirm) are
// latched until the shell reads them, so a press between frames is never
// lost and never counted twice.

const HELD = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};
const PRESSED = {
  KeyE: 'interact', KeyF: 'interact',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm',
};

export class Input {
  constructor(target) {
    this.held = { up: false, down: false, left: false, right: false, run: false };
    this.latched = { interact: false, pause: false, confirm: false };
    target.addEventListener('keydown', (e) => {
      const h = HELD[e.code];
      if (h) {
        this.held[h] = true;
        e.preventDefault();
      }
      const p = PRESSED[e.code];
      if (p && !e.repeat) this.latched[p] = true;
      if (p === 'pause' || p === 'confirm') e.preventDefault();
    });
    target.addEventListener('keyup', (e) => {
      const h = HELD[e.code];
      if (h) this.held[h] = false;
    });
    target.addEventListener('blur', () => {
      for (const k of Object.keys(this.held)) this.held[k] = false;
    });
  }

  // The intent object the simulation steps on. `interact` is an edge: it is
  // true for exactly one step after the press.
  intent() {
    return {
      up: this.held.up,
      down: this.held.down,
      left: this.held.left,
      right: this.held.right,
      run: this.held.run,
      interact: false,
    };
  }

  take(name) {
    const v = this.latched[name];
    this.latched[name] = false;
    return v;
  }
}
