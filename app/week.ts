/**
 * A week is an ISO week, written `YYYY-Www`. One part of Tusker reads one: a
 * week set belongs to a week.
 *
 * The week takes the week the person is in, not the week the Worker runs in.
 * The browser already tells the server its own day, so the week is read from
 * that day and needs no second cookie: `toISOString()` converts to UTC first,
 * so a Sunday evening east of UTC would land on next week.
 *
 * ISO is what makes the key a fact rather than a setting. The week runs Monday
 * to Sunday, and the year is the year of its Thursday, so a week that straddles
 * New Year is named once and by one rule.
 */

import { dayOf, localDay } from "./day";

/** The shape a week key takes. */
const WEEK = /^(\d{4})-W(\d{2})$/;

/** Milliseconds in a week, which is what counts weeks apart. */
const A_WEEK = 7 * 24 * 60 * 60 * 1000;

/** The week a day belongs to, by the ISO rule. */
export function weekOf(day: string): string {
  const thursday = thursdayOf(new Date(`${day}T00:00:00Z`));
  const year = thursday.getUTCFullYear();
  const week = 1 + Math.round((thursday.getTime() - firstThursday(year).getTime()) / A_WEEK);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** This week where the clock runs: in the browser, the person's own week. */
export function localWeek(at: Date = new Date()): string {
  return weekOf(localDay(at));
}

/**
 * The week a request speaks for: the week of the day the browser wrote, or of
 * the Worker's own day until it does. A person east of UTC therefore reads
 * last week's set for one render, and the page asks again with the right day.
 */
export function weekIn(request: Request, now: Date = new Date()): string {
  return weekOf(dayOf(request, now));
}

/**
 * True for a week a calendar holds, so 2025-W53 is not one: 2025 is a 52-week
 * year. The key is read back from its own Monday, which answers that in one
 * line rather than in a table of long years.
 */
export function isWeek(text: string): boolean {
  if (!WEEK.test(text)) return false;
  const monday = mondayOf(text);
  return !Number.isNaN(monday.getTime()) && weekOf(dayText(monday)) === text;
}

/**
 * The days the week page draws: Monday to Friday.
 *
 * Five days is a fact about the page and not a rule in the data. A week set
 * holds no day at all, and a Saturday plan still works, because a person who
 * addresses a day gets that day.
 */
export function daysOfWeek(week: string): string[] {
  const monday = mondayOf(week);
  return [0, 1, 2, 3, 4].map((step) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + step);
    return dayText(day);
  });
}

/**
 * The whole week, Monday to Sunday.
 *
 * The page draws five days, but the data holds seven: a Saturday plan is a
 * plan, so a cascade that clears a week's plans must reach it.
 */
export function weekBounds(week: string): { monday: string; sunday: string } {
  const monday = mondayOf(week);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { monday: dayText(monday), sunday: dayText(sunday) };
}

/** The week as a person reads it: the Monday and the Friday that bound it. */
export function weekSpan(week: string): string {
  const days = daysOfWeek(week);
  return `${dayLabel(days[0])} – ${dayLabel(days[4])}`;
}

/** One end of the span, as "Mon 31 Aug". Read in UTC, so the date is the day. */
function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * The week before. The step moves the week's Monday by seven days and reads
 * the week back, so a year turns over by the ISO rule and not by arithmetic on
 * the key: 2026-W01 comes after 2025-W52, and 2026-W53 runs into 2027-W01.
 */
export function weekBefore(week: string): string {
  return weekStepped(week, -7);
}

/** The week after, stepped the same way. */
export function weekAfter(week: string): string {
  return weekStepped(week, 7);
}

/** One week moved by whole weeks. `app/day.ts` steps a day; this steps a week. */
function weekStepped(week: string, by: number): string {
  const monday = mondayOf(week);
  monday.setUTCDate(monday.getUTCDate() + by);
  return weekOf(dayText(monday));
}

/** The Monday a week key opens on. */
function mondayOf(week: string): Date {
  const said = WEEK.exec(week);
  if (!said) return new Date(NaN);
  const [, year, count] = said;
  // The first Thursday is in week one, so its Monday opens the year's weeks.
  const first = firstThursday(Number(year));
  const monday = new Date(first);
  monday.setUTCDate(first.getUTCDate() - 3 + (Number(count) - 1) * 7);
  return monday;
}

/** The Thursday of the week a date sits in, which names the week's year. */
function thursdayOf(at: Date): Date {
  const monday = (at.getUTCDay() + 6) % 7;
  const thursday = new Date(at);
  thursday.setUTCDate(at.getUTCDate() - monday + 3);
  return thursday;
}

/** The Thursday of week one: the week that holds 4 January. */
function firstThursday(year: number): Date {
  return thursdayOf(new Date(Date.UTC(year, 0, 4)));
}

/** A date as a day is written. */
function dayText(at: Date): string {
  return at.toISOString().slice(0, 10);
}
