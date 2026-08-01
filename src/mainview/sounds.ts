// Tiny WebAudio synth for UI feedback. No audio assets, just oscillators.

let enabled = true;
let ctx: AudioContext | null = null;

export function setSoundsEnabled(value: boolean) {
  enabled = value;
}

function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  sweep?: number; // glide to this frequency over the duration
  delay?: number; // seconds
}

function tone(freq: number, dur: number, opts: ToneOpts = {}) {
  if (!enabled) return;
  const audio = ac();
  if (!audio) return;
  const { type = "sine", gain = 0.06, sweep, delay = 0 } = opts;
  const t0 = audio.currentTime + delay;

  const osc = audio.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);

  const g = audio.createGain();
  // quick attack, smooth decay — keeps it soft and clicky-free
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sounds = {
  /** mark done: bright little two-note pop */
  check() {
    tone(660, 0.09, { sweep: 920 });
    tone(1040, 0.08, { delay: 0.055, gain: 0.04 });
  },
  /** mark not done: soft downward blip */
  uncheck() {
    tone(520, 0.08, { sweep: 390, gain: 0.045 });
  },
  /** global capture landed */
  capture() {
    tone(500, 0.1, { sweep: 760, type: "triangle", gain: 0.05 });
    tone(980, 0.07, { delay: 0.07, gain: 0.035 });
  },
  /** copied to clipboard */
  copy() {
    tone(880, 0.05, { gain: 0.04 });
  },
  /** note(s) deleted */
  remove() {
    tone(240, 0.1, { sweep: 150, type: "triangle", gain: 0.05 });
  },
  /** small neutral pop (add note, pill toggle) */
  pop() {
    tone(720, 0.055, { gain: 0.04 });
  },
};
