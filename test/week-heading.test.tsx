/**
 * How the week page names the week it speaks for. See #146.
 *
 * `2026-W36` is the address and the stored key, and it is not a reading, so
 * the heading and the tab title say the span a person reads.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import Week, { meta } from "../app/routes/me.week";

/** A Tuesday, and the week it sits in. */
const DAY = "2026-09-01";
const WEEK = "2026-W36";

/** The week page, drawn from the data a loader would give it. */
function page(some: { week?: string; day?: string } = {}) {
  const week = some.week ?? WEEK;
  const day = some.day ?? DAY;
  const loaderData = {
    orgs: [],
    members: {},
    week,
    named: week !== WEEK,
    day,
    leftovers: null,
    groups: [{ key: "week" as const, label: "This week", tasks: [] }],
    picked: [],
    done: 0,
    ask: null,
  };
  const props = { loaderData } as unknown as React.ComponentProps<typeof Week>;
  const Stub = createRoutesStub([{ path: "/me/week", Component: () => <Week {...props} /> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/me/week"]} />);
}

/** The words the heading draws, with the markup taken out. */
function heading(html: string): string {
  return (/<h1[^>]*>(.*?)<\/h1>/s.exec(html)?.[1] ?? "").replace(/<[^>]*>/g, "");
}

describe("the week the page names", () => {
  it("heads the page with the word for this week, and the span after it", () => {
    expect(page()).toMatch(/This week, Mon 31 Aug – Fri 4 Sept?/);
  });

  it("heads a week further off with its span alone", () => {
    const html = page({ week: "2026-W34" });

    expect(html).toContain("Mon 17 Aug – Fri 21 Aug");
    expect(html).not.toContain("Last week");
  });

  it("reads the heading without the week key and without the nav label", () => {
    // The key still addresses the page. It is the reading that drops it.
    expect(heading(page())).toContain("This week");
    expect(heading(page())).not.toContain("W36");
    expect(heading(page())).not.toContain("Your week");
  });

  it("heads the week with a link to its own dated address", () => {
    expect(page()).toContain(`href="/me/week/${WEEK}"`);
  });

  it("names the week in the tab title, span first", () => {
    const title = meta({ loaderData: { week: WEEK, day: DAY } } as never);

    const span = expect.stringMatching(/^Mon 31 Aug – Fri 4 Sept? — Tusker$/);
    expect(title).toEqual([{ title: span }]);
  });
});
