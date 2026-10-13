// Window motion driven from the main process: drag, the momentum glide after
// a drag, the resize grip, and the eased slide used by snap-to-position.
//
// The renderer only signals start/end; we track the cursor here in DIP and
// move the window, keeping the grabbed point fixed under it like a native
// drag. (CSS -webkit-app-region dragging can't do just-in-time grab-anywhere
// and suppresses clicks. And frameless + transparent + resizable:false means
// there are no native resize edges either.)
//
// Only one motion runs at a time; starting a new one ends the previous.

import type { Point, Rectangle } from "electron";

export interface MotionTarget {
  /** The window frame, or null once the window is gone. */
  getBounds(): Rectangle | null;
  setBounds(bounds: Rectangle): void;
  getCursor(): Point;
  /** A motion came to rest — time to persist the frame. */
  onSettled(): void;
}

interface Size {
  width: number;
  height: number;
}

type Mode = "idle" | "drag" | "glide" | "resize" | "slide";

const TICK_MS = 8;

// drag release → glide
const VELOCITY_WINDOW_MS = 120; // release velocity comes from the last ~120ms
const MIN_SAMPLE_SPAN_MS = 20;
const MIN_RELEASE_SPEED = 0.08; // px/ms; a gentle release shouldn't drift
// the glide is a settle, not a throw: take only a fraction of the release
// velocity and cap it, so the window drifts a few dozen px at most
const GLIDE_VELOCITY_SCALE = 0.5;
const GLIDE_MAX_SPEED = 0.6;
const GLIDE_FRICTION = 0.85; // per 16ms; firm, ~60px worst case
const GLIDE_STOP_SPEED = 0.02;

const SLIDE_MS = 320;

export class WindowMotion {
  private mode: Mode = "idle";
  private timer: ReturnType<typeof setInterval> | null = null;
  // Frozen during drag/glide/slide so a hold can't feed a grown HWND back
  // into the next setBounds (Electron 41.3+ / Windows, electron#51679).
  private lockedSize: Size | null = null;
  private samples: { x: number; y: number; t: number }[] = [];

  constructor(
    private readonly target: MotionTarget,
    private readonly minSize: Size
  ) {}

  get active(): boolean {
    return this.mode !== "idle";
  }

  /** Stop whatever is running (window hidden, closed, or resized by other means). */
  cancel(): void {
    if (this.mode === "idle") return;
    this.stop();
    this.target.onSettled();
  }

  beginDrag(): void {
    this.cancel();
    const frame = this.target.getBounds();
    if (!frame) return;
    const windowStart = { x: frame.x, y: frame.y };
    const cursorStart = this.target.getCursor();
    this.samples = [];
    this.start("drag", frame, () => {
      const cursor = this.target.getCursor();
      this.moveTo(
        windowStart.x + (cursor.x - cursorStart.x),
        windowStart.y + (cursor.y - cursorStart.y)
      );
      const now = this.target.getBounds();
      if (!now) return;
      this.samples.push({ x: now.x, y: now.y, t: Date.now() });
      if (this.samples.length > 12) this.samples.shift();
    });
  }

  /** Release the drag; a quick flick lets the window glide to a soft stop. */
  endDrag(): void {
    if (this.mode !== "drag") return;
    const velocity = this.releaseVelocity();
    const frame = this.target.getBounds();
    // the glide keeps the size the drag started with
    const size = this.lockedSize ?? frame;
    this.stop();
    if (!velocity || !frame) {
      this.target.onSettled();
      return;
    }

    let { vx, vy } = velocity;
    let x = frame.x;
    let y = frame.y;
    let last = Date.now();
    this.start("glide", size, () => {
      const now = Date.now();
      const step = now - last;
      last = now;
      x += vx * step;
      y += vy * step;
      const decay = Math.pow(GLIDE_FRICTION, step / 16);
      vx *= decay;
      vy *= decay;
      this.moveTo(x, y);
      if (Math.hypot(vx, vy) < GLIDE_STOP_SPEED) this.cancel();
    });
  }

  beginResize(): void {
    this.cancel();
    const frame = this.target.getBounds();
    if (!frame) return;
    const cursorStart = this.target.getCursor();
    this.start("resize", null, () => {
      const cursor = this.target.getCursor();
      const width = Math.max(
        this.minSize.width,
        Math.round(frame.width + (cursor.x - cursorStart.x))
      );
      const height = Math.max(
        this.minSize.height,
        Math.round(frame.height + (cursor.y - cursorStart.y))
      );
      const now = this.target.getBounds();
      if (!now || (now.width === width && now.height === height)) return;
      this.target.setBounds({ x: frame.x, y: frame.y, width, height });
    });
  }

  endResize(): void {
    if (this.mode === "resize") this.cancel();
  }

  /** Slide the window to (x, y) over ~320ms with an ease-out curve. */
  slideTo(x: number, y: number): void {
    this.cancel();
    const frame = this.target.getBounds();
    if (!frame) return;
    if (Math.abs(x - frame.x) < 2 && Math.abs(y - frame.y) < 2) return;
    const startedAt = Date.now();
    this.start("slide", frame, () => {
      const progress = Math.min(1, (Date.now() - startedAt) / SLIDE_MS);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      this.moveTo(frame.x + (x - frame.x) * eased, frame.y + (y - frame.y) * eased);
      if (progress >= 1) this.cancel();
    });
  }

  private start(mode: Mode, lockTo: Size | null, tick: () => void): void {
    this.mode = mode;
    this.lockedSize = lockTo ? { width: lockTo.width, height: lockTo.height } : null;
    this.timer = setInterval(() => {
      try {
        // the window can be destroyed mid-flight
        if (!this.target.getBounds()) this.cancel();
        else tick();
      } catch (err) {
        console.error(`[oxide] window ${mode} failed:`, err);
        this.cancel();
      }
    }, TICK_MS);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.mode = "idle";
    this.lockedSize = null;
    this.samples = [];
  }

  private moveTo(x: number, y: number): void {
    const frame = this.target.getBounds();
    if (!frame) return;
    const nx = Math.round(x);
    const ny = Math.round(y);
    if (frame.x === nx && frame.y === ny) return;
    // one setBounds call keeps the size pinned; setPosition on a frameless
    // Windows window can grow the HWND a few DIP per invocation
    this.target.setBounds({
      x: nx,
      y: ny,
      width: this.lockedSize?.width ?? frame.width,
      height: this.lockedSize?.height ?? frame.height,
    });
  }

  /** Glide velocity (px/ms) from the recent drag samples, or null for "just stop". */
  private releaseVelocity(): { vx: number; vy: number } | null {
    const now = Date.now();
    const recent = this.samples.filter((sample) => now - sample.t < VELOCITY_WINDOW_MS);
    if (recent.length < 2) return null;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const span = last.t - first.t;
    if (span < MIN_SAMPLE_SPAN_MS) return null;
    let vx = (last.x - first.x) / span;
    let vy = (last.y - first.y) / span;
    let speed = Math.hypot(vx, vy);
    if (speed < MIN_RELEASE_SPEED) return null;
    vx *= GLIDE_VELOCITY_SCALE;
    vy *= GLIDE_VELOCITY_SCALE;
    speed *= GLIDE_VELOCITY_SCALE;
    if (speed > GLIDE_MAX_SPEED) {
      vx *= GLIDE_MAX_SPEED / speed;
      vy *= GLIDE_MAX_SPEED / speed;
    }
    return { vx, vy };
  }
}
