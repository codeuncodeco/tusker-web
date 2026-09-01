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
 * The day as a person reads it: the weekday and the date. The weekday is read
 * in UTC, so the name is the day itself and not the reader's evening.
 */
export function dayName(day: string): string {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
  return `${weekday} ${day}`;
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
