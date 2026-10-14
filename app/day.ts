/**
 * A day is a calendar date, written `YYYY-MM-DD`. Two parts of Tusker read
 * one: a date field holds a day, and a plan belongs to a day.
 *
 * A plan takes the day the person is in, not the day the Worker runs in, so
 * the browser names it and the server is told. `toISOString()` converts to
 * UTC first, so an evening plan east of UTC would land on tomorrow. Nothing
 * here calls it.
 */

import { readCookie } from "./cookies";

/** The shape a day takes, as SQLite and the browser both read it. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The cookie the browser writes its own day into. */
export const DAY_COOKIE = "day";

/** True for a date a calendar holds, so 2026-13-01 is not one. */
export function isDay(text: string): boolean {
  if (!DAY.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** Today where the clock runs: in the browser, the person's own day. */
export function localDay(at: Date = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * The day as a person reads it: "Thursday 3 September". The weekday is read in
 * UTC, so the name is the day itself and not the reader's evening.
 *
 * The name drops the year in the year the reader is in, and keeps it outside
 * it: a plan in another year must say which. `today` says which year that is,
 * so a page hands the day it speaks from and never the Worker's own.
 */
export function dayName(day: string, today: string): string {
  // The weekday is written apart from the date, because en-GB puts a comma
  // between the two once the year joins them: "Thursday, 1 January 2026".
  const weekday = written(day, { weekday: "long" });
  const date = written(day, {
    day: "numeric",
    month: "long",
    year: day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  });
  return `${weekday} ${date}`;
}

/**
 * The short day a span is written in: "Mon 31 Aug", and "Mon 29 Dec 2025"
 * where the span asks for the year.
 *
 * The caller says whether to write it, because a span reads as one thing: a
 * year on one end alone would leave the other end to be guessed. `dayName`
 * writes one day and answers the question itself.
 */
export function dayShort(day: string, year: boolean): string {
  // The weekday is written apart from the date for the reason `dayName` gives:
  // en-GB puts a comma between the two once the year joins them.
  const weekday = written(day, { weekday: "short" });
  const date = written(day, {
    day: "numeric",
    month: "short",
    year: year ? "numeric" : undefined,
  });
  return `${weekday} ${date}`;
}

/**
 * The date a record was kept on: "13 Oct 2026". It has no weekday and always
 * has the year, because a decision or an archived task is read back long
 * after, and the year is the part a reader cannot guess.
 */
export function dayDate(day: string): string {
  return written(day, DATE_PARTS);
}

/**
 * The day as a heading names it: the same date, behind the word a person
 * counts by where there is one. "Today, Thursday 3 September" says both the
 * step and the day, and two steps back says the day alone.
 */
export function dayLabel(day: string, today: string): string {
  const near = nearWord(day, today);
  const name = dayName(day, today);
  return near ? `${near}, ${name}` : name;
}

/** The word for a day within one step of today, or null for every other day. */
function nearWord(day: string, today: string): string | null {
  if (day === today) return "Today";
  if (day === dayBefore(today)) return "Yesterday";
  if (day === dayAfter(today)) return "Tomorrow";
  return null;
}

/** One day written the way this app writes days: British, and read in UTC. */
function written(day: string, parts: Intl.DateTimeFormatOptions): string {
  return writtenIn(new Date(`${day}T00:00:00Z`), parts, "UTC");
}

/**
 * The date a stored time falls on in one zone: "13 Oct 2026", as `dayDate`
 * writes a day. The same time can fall on two dates, so the caller names the
 * zone: UTC where the reader's zone is not known, and the reader's own where
 * it is.
 */
export function stampDate(stamp: string, zone: string): string {
  return writtenIn(new Date(stamp), DATE_PARTS, zone);
}

/**
 * The whole of a stored time in one zone: "13 Oct 2026, 14:32 BST". The zone
 * is written, because a clock that does not say where it runs is read wrong.
 */
export function stampTime(stamp: string, zone: string): string {
  return writtenIn(
    new Date(stamp),
    { ...DATE_PARTS, hour: "2-digit", minute: "2-digit", timeZoneName: "short" },
    zone,
  );
}

/** The parts of a date a record is read back by: no weekday, and the year. */
const DATE_PARTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/** One moment written the way this app writes dates, British, in one zone. */
function writtenIn(at: Date, parts: Intl.DateTimeFormatOptions, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", { ...parts, timeZone: zone }).format(at);
}

/**
 * The day a request speaks for: the one the browser wrote, or the Worker's own
 * day until it does. A person east of UTC therefore reads yesterday's plan for
 * one render, and the page asks again with the right day.
 */
export function dayOf(request: Request, now: Date = new Date()): string {
  const said = readCookie(request, DAY_COOKIE);
  return said && isDay(said) ? said : localDay(now);
}

/**
 * The day before. The step uses UTC, so a month end, a year end and a leap day
 * are the calendar's business and not the reader's zone.
 */
export function dayBefore(day: string): string {
  return dayStepped(day, -1);
}

/** The day after, stepped the same way. */
export function dayAfter(day: string): string {
  return dayStepped(day, 1);
}

/** One day moved by whole days. `app/board.ts` steps a column; this steps a day. */
function dayStepped(day: string, by: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + by);
  return at.toISOString().slice(0, 10);
}
