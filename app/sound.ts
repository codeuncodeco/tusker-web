/**
 * The sound of the app: a small set of short, quiet notes for what a person
 * does, drawn from Strudel's synth engine, `superdough`. See ADR-0040.
 *
 * - **tap**: any control pressed. A tiny tick.
 * - **pick**: a chip or a toggle turning on.
 * - **open** and **close**: a modal, a panel or the dial.
 * - **slide**: a drawer pulled out.
 * - **add**: a task added.
 * - **done**: a task finished, a rising three-note chime.
 * - **undo**, **error**, and **scheme**, an airy sweep for a change of light.
 *
 * Nothing loads until the first press: the engine is imported then, and the
 * browser allows audio only after a gesture anyway. A sound asked for before
 * the engine is ready is dropped, not queued, so a burst never plays late.
 *
 * Sound is on by default. The You panel's switch mutes it, and the browser
 * remembers that under `tusker:sound`.
 */

import { useSyncExternalStore } from "react";

/** The sounds there are. */
export type SoundName = "tap" | "pick" | "open" | "close" | "slide" | "add" | "done" | "undo" | "error" | "scheme";

/** One note of a sound: when, after the press, and how it sounds. */
type Note = {
  at: number;
  s: "sine" | "triangle" | "square";
  note: string;
  gain: number;
  decay: number;
  cutoff?: number;
};

/** Every sound, as notes. Quiet, short, and soft at the top. */
export const SOUNDS: Record<SoundName, Note[]> = {
  tap: [{ at: 0, s: "sine", note: "g6", gain: 0.035, decay: 0.03, cutoff: 3000 }],
  pick: [{ at: 0, s: "triangle", note: "e6", gain: 0.05, decay: 0.06, cutoff: 3200 }],
  open: [
    { at: 0, s: "triangle", note: "c5", gain: 0.045, decay: 0.08, cutoff: 2400 },
    { at: 0.045, s: "triangle", note: "g5", gain: 0.04, decay: 0.1, cutoff: 2400 },
  ],
  close: [
    { at: 0, s: "triangle", note: "g5", gain: 0.04, decay: 0.08, cutoff: 2200 },
    { at: 0.045, s: "triangle", note: "c5", gain: 0.035, decay: 0.1, cutoff: 2000 },
  ],
  slide: [
    { at: 0, s: "sine", note: "d5", gain: 0.04, decay: 0.05 },
    { at: 0.03, s: "sine", note: "a5", gain: 0.035, decay: 0.07 },
  ],
  add: [
    { at: 0, s: "triangle", note: "e5", gain: 0.05, decay: 0.06, cutoff: 2800 },
    { at: 0.05, s: "triangle", note: "b5", gain: 0.045, decay: 0.09, cutoff: 2800 },
  ],
  done: [
    { at: 0, s: "sine", note: "c6", gain: 0.055, decay: 0.22 },
    { at: 0.07, s: "sine", note: "e6", gain: 0.05, decay: 0.24 },
    { at: 0.14, s: "sine", note: "g6", gain: 0.05, decay: 0.32 },
  ],
  undo: [
    { at: 0, s: "triangle", note: "a5", gain: 0.04, decay: 0.07, cutoff: 2200 },
    { at: 0.05, s: "triangle", note: "e5", gain: 0.035, decay: 0.09, cutoff: 2000 },
  ],
  error: [{ at: 0, s: "square", note: "c3", gain: 0.03, decay: 0.12, cutoff: 900 }],
  scheme: [
    { at: 0, s: "sine", note: "c5", gain: 0.03, decay: 0.35 },
    { at: 0.08, s: "sine", note: "g5", gain: 0.028, decay: 0.4 },
    { at: 0.16, s: "sine", note: "c6", gain: 0.025, decay: 0.45 },
    { at: 0.24, s: "sine", note: "e6", gain: 0.02, decay: 0.55 },
  ],
};

/** What plays a note: the engine, once loaded. Tests hand in their own. */
export type Engine = { now: () => number; play: (value: Record<string, unknown>, at: number, duration: number) => void };

let engine: Engine | null = null;
let loading: Promise<void> | null = null;

/** Hands the module an engine, or takes it away: for tests. */
export function setEngine(next: Engine | null) {
  engine = next;
}

/**
 * Loads Strudel's engine, once, on the first press: its synths, and an audio
 * context the press is allowed to start. Its worklets stay off; these notes
 * need none.
 */
export function loadEngine(): Promise<void> {
  if (engine || loading || typeof window === "undefined") return loading ?? Promise.resolve();
  loading = import("superdough")
    .then(async (dough) => {
      dough.registerSynthSounds();
      await dough.initAudio({ disableWorklets: true });
      const context = dough.getAudioContext();
      engine = {
        now: () => context.currentTime,
        play: (value, at, duration) => void dough.superdough(value, at, duration),
      };
    })
    .catch(() => {
      // A browser with no audio stays silent; nothing else changes.
    });
  return loading;
}

/** The key the browser keeps the mute under. */
const MUTE_KEY = "tusker:sound";

const listeners = new Set<() => void>();

/** True while the person has muted the app. */
export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "off";
  } catch {
    return false;
  }
}

/** Mutes or unmutes, and tells every switch drawn. */
export function setMuted(muted: boolean) {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "off");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // A browser that keeps nothing stays as it was.
  }
  for (const listener of listeners) listener();
}

/** Whether sound is on, for the You panel's switch. Off on a server render. */
export function useSoundOn(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => !isMuted(),
    () => false,
  );
}

/** True where the person asked the system for less motion, which also asks for quiet. */
function asksForCalm(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Plays one sound now, if sound is on and the engine is ready. */
export function play(name: SoundName) {
  if (!engine || isMuted() || asksForCalm()) return;
  const start = engine.now() + 0.01;
  for (const one of SOUNDS[name]) {
    engine.play(
      {
        s: one.s,
        note: one.note,
        gain: one.gain,
        attack: 0.002,
        decay: one.decay,
        sustain: 0,
        release: 0.03,
        ...(one.cutoff ? { cutoff: one.cutoff } : {}),
      },
      start + one.at,
      one.decay,
    );
  }
}

/** The controls a press on which plays `tap`. */
const PRESSABLE = "button, a[href], summary, [role='button'], label:has(input)";

/**
 * Listens for every press on the page: the first loads the engine, and each
 * on a control plays `tap`. One listener, so no control needs code of its own.
 */
export function listenForPresses(): () => void {
  function onPress(event: PointerEvent) {
    void loadEngine();
    const target = (event.target as Element | null)?.closest(PRESSABLE);
    if (!target) return;
    // A chip or a box about to turn on picks; anything else taps.
    const turningOn =
      target.getAttribute("aria-pressed") === "false" ||
      (target.matches("label") && target.querySelector("input:not(:checked)") !== null);
    play(turningOn ? "pick" : "tap");
  }
  document.addEventListener("pointerdown", onPress, true);
  return () => document.removeEventListener("pointerdown", onPress, true);
}
