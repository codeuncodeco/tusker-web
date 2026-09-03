import { describe, expect, it } from "vitest";

import {
  daysOfWeek,
  isWeek,
  localWeek,
  weekAfter,
  weekBefore,
  weekBounds,
  weekIn,
  weekLabel,
  weekOf,
  weekSpan,
} from "../app/week";
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

describe("the week as a person reads it", () => {
  it("names the Monday and the Friday, and drops the year in this one", () => {
    // The month is abbreviated by the runtime's own tables, so "Sep" and
    // "Sept" are both right and the shape is what matters.
    expect(weekSpan("2026-W36", "2026-09-03")).toMatch(/^Mon 31 Aug – Fri 4 Sept?$/);
  });

  it("keeps the year on the days outside this one", () => {
    // The week that straddles New Year says which year each end is in.
    expect(weekSpan("2026-W01", "2026-09-03")).toBe("Mon 29 Dec 2025 – Fri 2 Jan");
  });
});

describe("the week a heading names", () => {
  it("says this week, last week and next week as words, with the span after", () => {
    expect(weekLabel("2026-W36", "2026-09-03")).toMatch(/^This week, Mon 31 Aug – Fri 4 Sept?$/);
    expect(weekLabel("2026-W35", "2026-09-03")).toMatch(/^Last week, Mon 24 Aug – Fri 28 Aug$/);
    const next = weekLabel("2026-W37", "2026-09-03");
    expect(next).toMatch(/^Next week, Mon 7 Sept? – Fri 11 Sept?$/);
  });

  it("says the span alone for every other week", () => {
    expect(weekLabel("2026-W34", "2026-09-03")).toBe("Mon 17 Aug – Fri 21 Aug");
  });

  it("carries the word over a year end", () => {
    // 2026-W01 opens on 29 December 2025, so "this week" spans two years.
    expect(weekLabel("2026-W01", "2025-12-31")).toBe("This week, Mon 29 Dec – Fri 2 Jan 2026");
    expect(weekLabel("2025-W52", "2025-12-31")).toBe("Last week, Mon 22 Dec – Fri 26 Dec");
  });
});

describe("the week before and the week after", () => {
  it("steps one week either way", () => {
    expect(weekBefore("2026-W36")).toBe("2026-W35");
    expect(weekAfter("2026-W36")).toBe("2026-W37");
  });

  it("turns the year over on the key's own rule", () => {
    // 2025 is a 52-week year, so week one of 2026 follows 2025-W52.
    expect(weekBefore("2026-W01")).toBe("2025-W52");
    // 2026 is a 53-week year, so its last week runs into 2027-W01.
    expect(weekAfter("2026-W53")).toBe("2027-W01");
  });

  it("gives back a week a calendar holds, either way", () => {
    expect(isWeek(weekBefore("2026-W01"))).toBe(true);
    expect(isWeek(weekAfter("2026-W53"))).toBe(true);
  });
});
