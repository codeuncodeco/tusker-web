import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isMuted, play, setEngine, setMuted, SOUNDS } from "../app/sound";

/** A stand-in for the engine, which keeps what it was asked to play. */
function fakeEngine() {
  const played: { value: Record<string, unknown>; at: number; duration: number }[] = [];
  setEngine({ now: () => 10, play: (value, at, duration) => played.push({ value, at, duration }) });
  return played;
}

/** A browser's localStorage, for the mute. */
function storage() {
  const held = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
    removeItem: (key: string) => void held.delete(key),
  });
}

beforeEach(() => {
  storage();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(() => {
  setEngine(null);
  vi.unstubAllGlobals();
});

describe("a sound", () => {
  it("plays its notes, quiet and short, each at its own beat after the press", () => {
    const played = fakeEngine();

    play("done");

    expect(played.map((one) => one.value.note)).toEqual(["c6", "e6", "g6"]);
    expect(played.map((one) => one.at)).toEqual([10.01, 10.08, 10.15].map((at) => expect.closeTo(at, 5)));
    for (const one of played) {
      expect(one.value.gain).toBeLessThanOrEqual(0.06);
      expect(one.duration).toBeLessThan(0.5);
    }
  });

  it("is quiet for every name", () => {
    for (const notes of Object.values(SOUNDS)) {
      for (const note of notes) expect(note.gain).toBeLessThanOrEqual(0.06);
    }
  });

  it("plays nothing before the first press has loaded the engine", () => {
    setEngine(null);
    expect(() => play("tap")).not.toThrow();
  });

  it("plays nothing while muted, and plays again once unmuted", () => {
    const played = fakeEngine();

    setMuted(true);
    expect(isMuted()).toBe(true);
    play("tap");
    expect(played).toEqual([]);

    setMuted(false);
    play("tap");
    expect(played).toHaveLength(1);
  });

  it("plays nothing where the person asked for less motion", () => {
    const played = fakeEngine();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));

    play("open");
    expect(played).toEqual([]);
  });
});
