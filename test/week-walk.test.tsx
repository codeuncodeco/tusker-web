/**
 * How the week page draws the week it speaks for. See #142 and #146.
 *
 * The page is reachable at a named address, so the heading and the walk beside
 * it are links, and a week that is over draws no control that writes its set.
 * What it draws instead is the take.
 *
 * `2026-W36` is the address and the stored key, and it is not a reading, so
 * every line a person reads says the span instead.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import Week, { meta } from "../app/routes/me.week";

/** A Tuesday, and the week it sits in. */
const DAY = "2026-09-01";
const WEEK = "2026-W36";

/** One member of the set, as the loader hands it over. */
const TASK = {
  id: "a",
  org: { slug: "acme", name: "Acme" },
  title: "Ship it",
  status: "todo" as const,
  due_date: null,
  percentile: 0,
  created_at: "2026-09-01T00:00:00.000Z",
  fields: [],
  assignees: [],
  finished: false,
};

/** The week page, drawn from the data a loader would give it. */
function page(some: {
  week?: string;
  day?: string;
  prev?: string;
  next?: string;
  canPick?: boolean;
  take?: { into: string; count: number } | null;
} = {}) {
  const week = some.week ?? WEEK;
  const loaderData = {
    // One personal org, so the box draws: a person always has one.
    orgs: [{ slug: "ada", name: "Ada", kind: "personal", color: null }],
    members: {},
    week,
    named: week !== WEEK,
    canPick: some.canPick ?? true,
    onThisWeek: week === WEEK,
    prev: some.prev ?? "2026-W35",
    next: some.next ?? "2026-W37",
    day: some.day ?? DAY,
    leftovers: null,
    take: some.take ?? null,
    groups: [{ key: "week" as const, label: "This week", tasks: [TASK], sinks: true }],
    picked: ["a"],
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

/** Every address the page links to. */
function links(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((one) => one[1]);
}

describe("the walk between weeks", () => {
  it("prints the heading as a link to the week's own named address", () => {
    expect(links(page())).toContain(`/me/week/${WEEK}`);
  });

  it("offers the week before and the week after", () => {
    expect(links(page())).toContain("/me/week/2026-W35");
    expect(links(page())).toContain("/me/week/2026-W37");
  });

  it("names each step the way a person reads it", () => {
    const html = page();

    expect(html).toContain("The week before, Mon 24 Aug – Fri 28 Aug");
    expect(html).toMatch(/The week after, Mon 7 Sept? – Fri 11 Sept?/);
  });

  it("walks both ways from a week already read back", () => {
    const html = page({ week: "2026-W30", prev: "2026-W29", next: "2026-W31", canPick: false });

    expect(links(html)).toContain("/me/week/2026-W29");
    expect(links(html)).toContain("/me/week/2026-W31");
  });

  it("offers the way back to this week from a week the path named", () => {
    expect(links(page({ week: "2026-W30", canPick: false }))).toContain("/me/week");
  });

  it("offers no way back from the week the person is in", () => {
    expect(links(page())).not.toContain("/me/week");
  });
});

describe("the week the page names", () => {
  it("heads the page with the word for this week, and the span after it", () => {
    expect(heading(page())).toMatch(/^This week, Mon 31 Aug – Fri 4 Sept?$/);
  });

  it("heads a week further off with its span alone", () => {
    expect(heading(page({ week: "2026-W34", canPick: false }))).toBe("Mon 17 Aug – Fri 21 Aug");
  });

  it("reads the heading without the week key and without the nav label", () => {
    // The key still addresses the page. It is the reading that drops it.
    expect(heading(page())).not.toContain("W36");
    expect(heading(page())).not.toContain("Your week");
  });

  it("names the week in the tab title, span first", () => {
    const title = meta({ loaderData: { week: WEEK, day: DAY } } as never);

    const span = expect.stringMatching(/^Mon 31 Aug – Fri 4 Sept? — Tusker$/);
    expect(title).toEqual([{ title: span }]);
  });
});

describe("a week that is over", () => {
  it("draws no pick, no step and no box, because none of them writes there", () => {
    const html = page({ week: "2026-W30", canPick: false });

    expect(html).not.toContain('value="plan"');
    expect(html).not.toContain('value="unplan"');
    expect(html).not.toContain('value="up"');
    expect(html).not.toContain("Add a task");
  });

  it("draws the pick, the step and the box on the week being worked", () => {
    const html = page();

    expect(html).toContain('value="unplan"');
    expect(html).toContain('value="up"');
    expect(html).toContain("Add a task");
  });
});

describe("the take line", () => {
  it("names the week that left the work, the count, and the week it lands in", () => {
    const html = page({ week: "2026-W30", canPick: false, take: { into: WEEK, count: 4 } });

    expect(html).toContain("Mon 20 Jul – Fri 24 Jul left 4 tasks unfinished");
    expect(html).toMatch(/Take them into Mon 31 Aug – Fri 4 Sept?/);
    expect(html).toContain('value="take"');
  });

  it("says one task once, and takes it and not them", () => {
    const html = page({ week: "2026-W30", canPick: false, take: { into: WEEK, count: 1 } });

    expect(html).toContain("left 1 task unfinished");
    expect(html).toMatch(/Take it into Mon 31 Aug – Fri 4 Sept?/);
  });

  it("draws nothing where the week left nothing", () => {
    expect(page({ week: "2026-W30", canPick: false })).not.toContain('value="take"');
  });
});
