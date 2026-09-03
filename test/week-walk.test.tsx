/**
 * How the week page draws the week it speaks for. See #142.
 *
 * The page is reachable at a named address, so the walk between weeks and the
 * key itself are links, and a week that is over draws no control that writes
 * its set. What it draws instead is the take.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import Week from "../app/routes/me.week";

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
  prev?: string;
  next?: string;
  canPick?: boolean;
  take?: { into: string; count: number } | null;
}) {
  const week = some.week ?? WEEK;
  const loaderData = {
    // One personal org, so the box draws: a person always has one.
    orgs: [{ slug: "ada", name: "Ada", kind: "personal", color: null }],
    members: {},
    week,
    span: "Mon 31 Aug – Fri 4 Sep",
    named: week !== WEEK,
    canPick: some.canPick ?? true,
    onThisWeek: week === WEEK,
    prev: some.prev ?? "2026-W35",
    next: some.next ?? "2026-W37",
    day: "2026-09-01",
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

/** Every address the page links to. */
function links(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((one) => one[1]);
}

describe("the walk between weeks", () => {
  it("prints the key as a link to its own named address", () => {
    expect(links(page({}))).toContain(`/me/week/${WEEK}`);
  });

  it("offers the week before and the week after", () => {
    expect(links(page({}))).toContain("/me/week/2026-W35");
    expect(links(page({}))).toContain("/me/week/2026-W37");
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
    expect(links(page({}))).not.toContain("/me/week");
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
    const html = page({});

    expect(html).toContain('value="unplan"');
    expect(html).toContain('value="up"');
    expect(html).toContain("Add a task");
  });
});

describe("the take line", () => {
  it("names the week that left the work, the count, and the week it lands in", () => {
    const html = page({ week: "2026-W30", canPick: false, take: { into: WEEK, count: 4 } });

    expect(html).toContain("2026-W30 left 4 tasks unfinished");
    expect(html).toContain(`Take them into ${WEEK}`);
    expect(html).toContain('value="take"');
  });

  it("says one task once, and takes it and not them", () => {
    const html = page({ week: "2026-W30", canPick: false, take: { into: WEEK, count: 1 } });

    expect(html).toContain("left 1 task unfinished");
    expect(html).toContain(`Take it into ${WEEK}`);
  });

  it("draws nothing where the week left nothing", () => {
    expect(page({ week: "2026-W30", canPick: false })).not.toContain('value="take"');
  });
});
