import { describe, expect, it } from "vitest";

import { dayOf, isDay, localDay } from "../app/day";
import { get } from "./routes";

describe("a day", () => {
  it("takes a date a calendar holds", () => {
    expect(isDay("2026-09-01")).toBe(true);
  });

  it("takes no other shape, and no month thirteen", () => {
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("1 September 2026")).toBe(false);
    expect(isDay("2026-02-30")).toBe(false);
  });

  it("reads the local parts of a clock, not the UTC ones", () => {
    // Built from local parts, so the answer is that day in any time zone.
    const evening = new Date(2026, 8, 1, 23, 30);
    expect(localDay(evening)).toBe("2026-09-01");
  });
});

describe("the day a request speaks for", () => {
  it("takes the day the browser wrote", () => {
    expect(dayOf(get("/me", "day=2026-09-02"))).toBe("2026-09-02");
  });

  it("falls back to the Worker's own day while the browser is silent", () => {
    expect(dayOf(get("/me"), new Date(2026, 8, 1, 23, 30))).toBe("2026-09-01");
  });

  it("ignores a cookie that does not name a day", () => {
    expect(dayOf(get("/me", "day=tomorrow"), new Date(2026, 8, 1))).toBe("2026-09-01");
  });
});
