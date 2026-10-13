/**
 * The colour scheme: whether a page draws light or dark. Light, Dark, or
 * System, which follows the operating system.
 *
 * The pick belongs to the browser and not to the person, so it lives in a
 * cookie and nowhere else. A laptop and a phone can differ, and the pick
 * outlives a sign-out. This module is the only place that knows the cookie.
 * See #223.
 */

import { useFetcher, useRouteLoaderData } from "react-router";

import { readCookie } from "./cookies";
import type { loader } from "./root";

/** The three picks, in the order the control lists them. */
export const COLOUR_SCHEMES = ["light", "dark", "system"] as const;

export type ColourScheme = (typeof COLOUR_SCHEMES)[number];

/** The cookie that holds a pick. No cookie means System. */
const COLOUR_SCHEME_COOKIE = "colour-scheme";

/** One year: a preference, not a session. */
const ONE_YEAR = 60 * 60 * 24 * 365;

/** True for one of the three picks and nothing else. */
export function isColourScheme(value: unknown): value is ColourScheme {
  return COLOUR_SCHEMES.includes(value as ColourScheme);
}

/**
 * The pick a request carries. Only Light and Dark are ever written, so any
 * other value, and no cookie, reads as System.
 */
export function colourSchemeOf(request: Request): ColourScheme {
  const said = readCookie(request, COLOUR_SCHEME_COOKIE);
  return said === "light" || said === "dark" ? said : "system";
}

/**
 * The `Set-Cookie` header that holds a pick. System deletes the cookie, so a
 * browser that picked System reads the same as one that never picked.
 */
export function colourSchemeCookie(scheme: ColourScheme): string {
  const [value, age] = scheme === "system" ? ["", 0] : [scheme, ONE_YEAR];
  return `${COLOUR_SCHEME_COOKIE}=${value}; Path=/; Max-Age=${age}; SameSite=Lax`;
}

/** The `color-scheme` `<html>` carries for a pick. System lets the OS choose. */
export const COLOUR_SCHEME_CSS = {
  light: "light",
  dark: "dark",
  system: "light dark",
} as const satisfies Record<ColourScheme, string>;

/** Where a pick is posted. */
export const COLOUR_SCHEME_ACTION = "/colour-scheme";

/** The fetcher a pick travels in, shared by the control and `Layout`. */
const COLOUR_SCHEME_FETCHER = "colour-scheme";

/**
 * The fetcher that posts a pick. The control submits through it, and `Layout`
 * reads the pick from it while the post is in flight.
 */
export function useColourSchemeFetcher() {
  return useFetcher({ key: COLOUR_SCHEME_FETCHER });
}

/**
 * The pick the page draws: the one in flight while a post runs, so the page
 * changes at once, and the root loader's after it. Where there is no loader
 * data, as in the error boundary, it is System.
 */
export function useColourScheme(): ColourScheme {
  const loaded = useRouteLoaderData<typeof loader>("root")?.colourScheme;
  const pending = useColourSchemeFetcher().formData?.get("scheme");
  return isColourScheme(pending) ? pending : (loaded ?? "system");
}
