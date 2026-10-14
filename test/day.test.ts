import { describe, expect, it } from "vitest";

import {
  dayAfter,
  dayBefore,
  dayDate,
  dayLabel,
  dayName,
  dayOf,
  dayShort,
  isDay,
  localDay,
  stampDate,
  stampTime,
} from "../app/day";
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

describe("stepping to another day", () => {
  it("goes back one day, and forward one", () => {
    expect(dayBefore("2026-09-02")).toBe("2026-09-01");
    expect(dayAfter("2026-09-01")).toBe("2026-09-02");
  });

  it("steps over a month end and a year end", () => {
    expect(dayAfter("2026-08-31")).toBe("2026-09-01");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });

  it("steps over a leap day", () => {
    expect(dayAfter("2028-02-28")).toBe("2028-02-29");
    expect(dayBefore("2028-03-01")).toBe("2028-02-29");
  });
});

describe("the day as a person reads it", () => {
  it("names the weekday and the date, and drops the year in this one", () => {
    expect(dayName("2026-09-03", "2026-09-03")).toBe("Thursday 3 September");
  });

  it("keeps the year outside this one, ahead and behind", () => {
    expect(dayName("2025-12-31", "2026-09-03")).toBe("Wednesday 31 December 2025");
    expect(dayName("2027-01-01", "2026-09-03")).toBe("Friday 1 January 2027");
  });

  it("reads the weekday in UTC, so the name is the day itself", () => {
    // Named from the day alone. No zone moves it to the evening before.
    expect(dayName("2026-09-01", "2026-09-03")).toBe("Tuesday 1 September");
  });
});

describe("the day a heading names", () => {
  it("says today, yesterday and tomorrow as words, with the date after", () => {
    expect(dayLabel("2026-09-03", "2026-09-03")).toBe("Today, Thursday 3 September");
    expect(dayLabel("2026-09-02", "2026-09-03")).toBe("Yesterday, Wednesday 2 September");
    expect(dayLabel("2026-09-04", "2026-09-03")).toBe("Tomorrow, Friday 4 September");
  });

  it("says the date alone for every other day", () => {
    expect(dayLabel("2026-09-01", "2026-09-03")).toBe("Tuesday 1 September");
  });

  it("carries the word over a month end and a year end", () => {
    expect(dayLabel("2026-08-31", "2026-09-01")).toBe("Yesterday, Monday 31 August");
    expect(dayLabel("2026-01-01", "2025-12-31")).toBe("Tomorrow, Thursday 1 January 2026");
  });
});

describe("the short day a span is written in", () => {
  it("names the weekday and the date, short", () => {
    // The month is abbreviated by the runtime's own tables, so "Sep" and
    // "Sept" are both right and the shape is what matters.
    expect(dayShort("2026-09-03", false)).toMatch(/^Thu 3 Sept?$/);
  });

  it("writes the year where the span asks for one", () => {
    expect(dayShort("2025-12-29", true)).toBe("Mon 29 Dec 2025");
    expect(dayShort("2027-01-01", true)).toBe("Fri 1 Jan 2027");
  });
});

describe("the date a record was kept on", () => {
  it("writes the day, the short month and the year", () => {
    expect(dayDate("2026-10-13")).toBe("13 Oct 2026");
  });

  it("writes a single-digit day without a leading zero", () => {
    expect(dayDate("2026-09-03")).toBe("3 Sept 2026");
  });

  it("writes the year on each side of a year end", () => {
    expect(dayDate("2025-12-31")).toBe("31 Dec 2025");
    expect(dayDate("2026-01-01")).toBe("1 Jan 2026");
  });
});

describe("the date a stored time falls on", () => {
  it("writes the date in UTC when it is asked for UTC", () => {
    expect(stampDate("2026-10-13T23:32:00.000Z", "UTC")).toBe("13 Oct 2026");
  });

  it("writes the date the reader's zone falls on, a day on from UTC east of it", () => {
    expect(stampDate("2026-10-13T23:32:00.000Z", "Asia/Kolkata")).toBe("14 Oct 2026");
  });

  it("writes the date a day back from UTC west of it", () => {
    expect(stampDate("2026-01-01T02:00:00.000Z", "America/New_York")).toBe("31 Dec 2025");
  });
});

describe("the time a stored time names, as a hover reads it", () => {
  it("writes the date, the time and the zone", () => {
    expect(stampTime("2026-10-13T23:32:00.000Z", "UTC")).toBe("13 Oct 2026, 23:32 UTC");
  });

  it("writes the clock and the date of the reader's zone", () => {
    expect(stampTime("2026-10-13T23:32:00.000Z", "Asia/Kolkata")).toBe(
      "14 Oct 2026, 05:02 GMT+5:30",
    );
  });
});
