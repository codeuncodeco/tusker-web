/**
 * Tells the server which day the person is in.
 *
 * The Worker runs in UTC, so an evening away from UTC reads the wrong plan
 * until the browser says the day. Every page that reads a plan writes the
 * cookie once and then asks again, the board included: a chip for yesterday
 * is a chip for the wrong tasks.
 *
 * A page that names its own day says nothing, because the person asked for
 * that day and not for this one.
 */

import { useEffect } from "react";
import { useRevalidator } from "react-router";

import { DAY_COOKIE, localDay } from "./day";

export function useLocalDay(day: string, ask = true) {
  const revalidator = useRevalidator();

  useEffect(() => {
    if (!ask) return;
    const here = localDay();
    if (here === day) return;
    document.cookie = `${DAY_COOKIE}=${here}; path=/; max-age=86400; samesite=lax`;
    revalidator.revalidate();
  }, [ask, day, revalidator]);
}
