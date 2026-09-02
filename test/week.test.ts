import { describe, expect, it } from "vitest";

import { daysOfWeek, isWeek, localWeek, weekBounds, weekIn, weekOf, weekSpan } from "../app/week";
import { get } from "./routes";

describe("the week a day sits in", () => {
  it("names the ISO week, Monday first", () => {
    // 2026-08-31 is a Monday, and 2026-09-06 the Sunday that closes the week.
    expect(weekOf("2026-08-31")).toBe("2026-W36");
    expect(weekOf("2026-09-06")).toBe("2026-W36");
    expect(weekOf("2026-09-07")).toBe("2026-W37");
  });

  it("gives a late December day the next year's week one", () => {
    // 2025-12-29 is the Monday of the week that holds 2026-01-01.
    expect(weekOf("2025-12-29")).toBe("2026-W01");
  });

  it("gives an early January day the last year's final week", () => {
    // 2027-01-01 is a Friday, so it belongs to the week that opened in 2026.
    expect(weekOf("2027-01-01")).toBe("2026-W53");
  });
});

describe("a week key", () => {
  it("takes a week a calendar holds", () => {
    expect(isWeek("2026-W36")).toBe(true);
    expect(isWeek("2026-W53")).toBe(true);
  });

  it("takes no other shape, and no week the year does not reach", () => {
    expect(isWeek("2026-W00")).toBe(false);
    expect(isWeek("2026-W54")).toBe(false);
    // 2025 is a 52-week year, so it holds no week 53.
    expect(isWeek("2025-W53")).toBe(false);
    expect(isWeek("2026-09-01")).toBe(false);
    expect(isWeek("2026-w36")).toBe(false);
  });
});

describe("the days a week holds", () => {
  it("runs Monday to Sunday, whatever the page draws", () => {
    expect(weekBounds("2026-W36")).toEqual({ monday: "2026-08-31", sunday: "2026-09-06" });
  });
});

describe("the days a week page draws", () => {
  it("is Monday to Friday, five days", () => {
    expect(daysOfWeek("2026-W36")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("names the span a person reads", () => {
    // The month is abbreviated by the runtime's own tables, so "Sep" and
    // "Sept" are both right and the shape is what matters.
    expect(weekSpan("2026-W36")).toMatch(/^Mon 31 Aug – Fri 4 Sept?$/);
  });

  it("gives every day back the week it came from", () => {
    for (const day of daysOfWeek("2026-W01")) expect(weekOf(day)).toBe("2026-W01");
    for (const day of daysOfWeek("2026-W53")) expect(weekOf(day)).toBe("2026-W53");
  });
});

describe("the week a request speaks for", () => {
  it("reads the local parts of a clock, not the UTC ones", () => {
    // Sunday evening east of UTC is still last week, and UTC would say Monday.
    expect(localWeek(new Date(2026, 8, 6, 23, 30))).toBe("2026-W36");
  });

  it("takes the week of the day the browser wrote", () => {
    expect(weekIn(get("/me/week", "day=2026-09-07"))).toBe("2026-W37");
  });

  it("falls back to the Worker's own week while the browser is silent", () => {
    expect(weekIn(get("/me/week"), new Date(2026, 8, 6, 23, 30))).toBe("2026-W36");
  });
});
