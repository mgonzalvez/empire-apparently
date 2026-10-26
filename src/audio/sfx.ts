/**
 * WebAudio synth SFX (C18 — the first blips; C33 is the final pass over
 * travel/battle/alert/explosion/UI). No audio files, no engine involvement:
 * the UI layer calls `playSfx()` at action points, and the engine never
 * hears about it.
 *
 * OFF by default (PLAN §5, core §20). The preference persists across games
 * under the family-convention key (like `empire-apparently-theme`).
 * Playback reads this persisted preference — the source of truth at play
 * time; new games record it into `settings.sound` for the save file.
 */

export type SfxKind =
  | 'ui' // generic confirm (wait, assignments, evacuation)
  | 'travel' // setting course
  | 'build' // construction, repair, commission
  | 'combat-win' // the orbit is ours
  | 'combat-loss' // the defense held
  | 'victory' // mandate fulfilled
  | 'defeat'; // appointment rescinded

export const SOUND_KEY = 'empire-apparently-sound';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-session fallback when localStorage is unavailable (private mode, tests). */
const memory = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => {
    memory.set(k, v);
  },
  removeItem: (k) => {
    memory.delete(k);
  },
};

export function defaultStorage(): StorageLike {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    /* storage access denied — fall through to memory */
  }
  return memoryStorage;
}

/** Off unless explicitly persisted (core §20: sound starts off). */
export function isSoundOn(storage: StorageLike = defaultStorage()): boolean {
  try {
    return storage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean, storage: StorageLike = defaultStorage()): void {
  try {
    if (on) storage.setItem(SOUND_KEY, 'on');
    else storage.removeItem(SOUND_KEY);
  } catch {
    /* preference is best-effort */
  }
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface Tone {
  type: OscillatorType;
  freq: number;
  freqEnd?: number;
  at: number; // seconds from now
  dur: number; // seconds
  gain: number;
}

function playTone(ac: AudioContext, t: Tone): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const start = ac.currentTime + t.at;
  osc.type = t.type;
  osc.frequency.setValueAtTime(t.freq, start);
  if (t.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(t.freqEnd, start + t.dur);
  }
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(t.gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(start);
  osc.stop(start + t.dur + 0.02);
}

/**
 * Play a synthesized cue. Silent unless sound is on; never throws (missing
 * AudioContext, denied context, node environments — all no-ops).
 */
export function playSfx(kind: SfxKind): void {
  if (!isSoundOn()) return;
  const ac = audio();
  if (!ac) return;

  const cues: Record<SfxKind, Tone[]> = {
    ui: [{ type: 'sine', freq: 660, at: 0, dur: 0.07, gain: 0.04 }],
    travel: [
      { type: 'triangle', freq: 220, freqEnd: 440, at: 0, dur: 0.28, gain: 0.05 },
    ],
    build: [
      { type: 'square', freq: 330, at: 0, dur: 0.06, gain: 0.03 },
      { type: 'square', freq: 495, at: 0.07, dur: 0.06, gain: 0.03 },
    ],
    'combat-win': [
      { type: 'triangle', freq: 392, at: 0, dur: 0.12, gain: 0.05 },
      { type: 'triangle', freq: 523, at: 0.12, dur: 0.16, gain: 0.05 },
    ],
    'combat-loss': [
      { type: 'sawtooth', freq: 220, freqEnd: 110, at: 0, dur: 0.35, gain: 0.04 },
    ],
    victory: [
      { type: 'triangle', freq: 392, at: 0, dur: 0.12, gain: 0.05 },
      { type: 'triangle', freq: 494, at: 0.12, dur: 0.12, gain: 0.05 },
      { type: 'triangle', freq: 587, at: 0.24, dur: 0.3, gain: 0.06 },
    ],
    defeat: [
      { type: 'sine', freq: 196, freqEnd: 98, at: 0, dur: 0.8, gain: 0.05 },
    ],
  };

  for (const t of cues[kind]) playTone(ac, t);
}
