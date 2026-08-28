// input.js — unifies keyboard + touch (virtual joystick, action button,
// scene "look" drag). Exposes a stable state object the game reads each frame.

export class Input {
  constructor({ joystickEl, knobEl, actionEl }) {
    this.joystickEl = joystickEl;
    this.knobEl = knobEl;
    this.actionEl = actionEl;

    this.move = { x: 0, y: 0 }; // -1..1  (y = forward/back, x = strafe)
    this.lookDelta = { x: 0, y: 0 }; // consumed by camera each frame
    this.actionPressed = false; // edge trigger (true for one frame)

    this._joyActiveId = null;
    this._lookActiveId = null;
    this._lookLast = { x: 0, y: 0 };
    this._keys = {};
    this._enabled = false;

    this._bind();
  }

  enable(on) {
    this._enabled = on;
    if (!on) {
      this.move.x = 0;
      this.move.y = 0;
    }
  }

  _bind() {
    // Keyboard
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this._keys[e.code] = true;
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
        ].includes(e.code)
      )
        e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this._keys[e.code] = false;
    });
    window.addEventListener("blur", () => {
      this._keys = {};
      this._joyActiveId = null;
    });

    // Joystick (pointer)
    this.joystickEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this._joyActiveId = e.pointerId;
      try {
        this.joystickEl.setPointerCapture(e.pointerId);
      } catch (_) {}
      this._updateJoy(e);
    });
    this.joystickEl.addEventListener("pointermove", (e) => {
      if (e.pointerId === this._joyActiveId) this._updateJoy(e);
    });
    // Release is watched on BOTH the element and the window so a lost
    // pointerup (common on touch) can never leave the team walking forever.
    const endJoy = (e) => {
      if (e.pointerId === this._joyActiveId) {
        this._joyActiveId = null;
        this.move.x = 0;
        this.move.y = 0;
        this._resetKnob();
      }
    };
    this.joystickEl.addEventListener("pointerup", endJoy);
    this.joystickEl.addEventListener("pointercancel", endJoy);
    window.addEventListener("pointerup", endJoy);
    window.addEventListener("pointercancel", endJoy);

    // Action button
    this.actionEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.actionPressed = true;
    });

    // Look drag — any pointer that is not the joystick and not the button.
    window.addEventListener("pointerdown", (e) => {
      if (e.target === this.joystickEl || e.target === this.actionEl) return;
      if (e.target.closest(".icon-btn, button, .overlay")) return;
      this._lookActiveId = e.pointerId;
      this._lookLast = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this._lookActiveId) return;
      const dx = e.clientX - this._lookLast.x;
      const dy = e.clientY - this._lookLast.y;
      this._lookLast = { x: e.clientX, y: e.clientY };
      this.lookDelta.x += dx;
      this.lookDelta.y += dy;
    });
    const endLook = (e) => {
      if (e.pointerId === this._lookActiveId) this._lookActiveId = null;
    };
    window.addEventListener("pointerup", endLook);
    window.addEventListener("pointercancel", endLook);

    // Mouse wheel to dolly the camera on desktop
    window.addEventListener(
      "wheel",
      (e) => {
        this._lookDelta.y += e.deltaY * 0.5;
      },
      { passive: true }
    );
  }

  _updateJoy(e) {
    const r = this.joystickEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const radius = r.width / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const max = radius * 0.72;
    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.move.x = dx / max;
    this.move.y = -dy / max; // up on screen = forward
  }

  _resetKnob() {
    this.knobEl.style.transform = "translate(-50%, -50%)";
  }

  // Called every frame by the game.
  update() {
    // Joystick only counts while a joystick pointer is actually pressed —
    // a stale this.move can therefore never make the team walk on its own.
    let jx = 0;
    let jy = 0;
    if (this._joyActiveId !== null) {
      jx = this.move.x;
      jy = this.move.y;
      const jm = Math.hypot(jx, jy);
      const DEAD = 0.2;
      if (jm < DEAD) {
        jx = 0;
        jy = 0;
      } else {
        const s = (jm - DEAD) / (1 - DEAD);
        jx *= s;
        jy *= s;
      }
    }

    // Keyboard mapping (WASD + arrows)
    let kx = 0;
    let ky = 0;
    if (this._keys["KeyA"] || this._keys["ArrowLeft"]) kx -= 1;
    if (this._keys["KeyD"] || this._keys["ArrowRight"]) kx += 1;
    if (this._keys["KeyW"] || this._keys["ArrowUp"]) ky += 1;
    if (this._keys["KeyS"] || this._keys["ArrowDown"]) ky -= 1;
    const klen = Math.hypot(kx, ky);

    // Keyboard (desktop) wins over the joystick when present.
    let x;
    let y;
    if (klen > 0.01) {
      x = kx / Math.max(1, klen);
      y = ky / Math.max(1, klen);
    } else {
      x = jx;
      y = jy;
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    if (l < 0.08) {
      x = 0;
      y = 0;
    }
    this.move.x = x;
    this.move.y = y;

    return {
      move: { x: this.move.x, y: this.move.y },
      lookDelta: { x: this.lookDelta.x, y: this.lookDelta.y },
      actionPressed: this.actionPressed,
    };
  }

  consumeLook() {
    const d = this.lookDelta;
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return d;
  }

  consumeAction() {
    const a = this.actionPressed;
    this.actionPressed = false;
    return a;
  }
}
