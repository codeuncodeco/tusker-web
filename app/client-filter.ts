/**
 * The client filter of the unified board: one chip per client of every org
 * that names a client field, and one click narrows the board to that client's
 * tasks. See ADR-0036.
 *
 * The org board needs nothing of this: its client field is one of its field
 * filters, under `field.<key>`. The unified board has no field filters,
 * because each org declares its own fields, so a client there names its org
 * as well as its value: `client=<slug>:<value>`. A value is the one the task
 * stores, the option of a select or the external id of a reference.
 */

import { readTrimmed } from "./query";
import type { CardOrg } from "./unified";

/** The name the filter rides under in the address. */
export const CLIENT_NAME = "client";

/** One client, as the address names it: its org and the value tasks store. */
export type ClientPick = { slug: string; value: string };

/** One client a chip offers, with what the chip draws. */
export type ClientChoice = ClientPick & {
  org: CardOrg;
  /** What a person reads: the option, or the cached label of the ref. */
  label: string;
  color: string | null;
};

/**
 * The client the address narrows to, or null for none. A slug never holds a
 * colon, so the first one splits the two, and a value may hold any.
 */
export function readClient(params: URLSearchParams): ClientPick | null {
  const raw = readTrimmed(params, CLIENT_NAME);
  const at = raw.indexOf(":");
  if (at <= 0 || at === raw.length - 1) return null;
  return { slug: raw.slice(0, at), value: raw.slice(at + 1) };
}

/** The address value one client rides under. */
export function clientValue(pick: ClientPick): string {
  return `${pick.slug}:${pick.value}`;
}

/** True when the two name the same client of the same org. */
export function sameClient(a: ClientPick | null, b: ClientPick): boolean {
  return a !== null && a.slug === b.slug && a.value === b.value;
}
