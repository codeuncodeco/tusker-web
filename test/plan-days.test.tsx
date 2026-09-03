/**
 * How plan mode draws the day it speaks for. See #66.
 *
 * The page is reachable at a dated address, so the walk between days and the
 * date itself are links, and a day past its own draws no control that writes.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import Plan, { meta } from "../app/routes/me.plan";

const DAY = "2026-09-01";

/** One planned task, as the loader hands it over. */
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

/** Plan mode, drawn from the data a loader would give it. */
function page(some: { day?: string; prev?: string; next?: string; canPlan?: boolean }) {
  const day = some.day ?? DAY;
  const onToday = day === DAY;
  const loaderData = {
    orgs: [],
    members: {},
    day,
    today: DAY,
    named: !onToday,
    onToday,
    canAdd: onToday,
    canPlan: some.canPlan ?? true,
    prev: some.prev ?? "2026-08-31",
    next: some.next ?? "2026-09-02",
    groups: [{ key: "today" as const, label: "Today", tasks: [TASK] }],
    planned: ["a"],
    ask: null,
  };
  const props = { loaderData } as unknown as React.ComponentProps<typeof Plan>;
  const Stub = createRoutesStub([{ path: "/me/plan", Component: () => <Plan {...props} /> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/me/plan"]} />);
}

/** Every address the page links to. */
function links(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((one) => one[1]);
}

describe("the walk between days", () => {
  it("prints the date as a link to its own dated address", () => {
    expect(links(page({}))).toContain(`/me/plan/${DAY}`);
  });

  it("offers the day before and the day after", () => {
    const html = page({ prev: "2026-08-31", next: "2026-09-02" });

    expect(links(html)).toContain("/me/plan/2026-08-31");
    expect(links(html)).toContain("/me/plan/2026-09-02");
  });

  it("walks both ways from a day already read back", () => {
    const html = page({
      day: "2026-08-25",
      prev: "2026-08-24",
      next: "2026-08-26",
      canPlan: false,
    });

    expect(links(html)).toContain("/me/plan/2026-08-24");
    expect(links(html)).toContain("/me/plan/2026-08-26");
  });

  it("offers the way back to today from a day the path named", () => {
    const html = page({ day: "2026-08-25", next: "2026-08-26", canPlan: false });

    expect(links(html)).toContain("/me/plan");
  });

  it("offers no way back to today from today", () => {
    expect(links(page({}))).not.toContain("/me/plan");
  });
});

describe("the day the page names", () => {
  it("heads the page with the word for today, and the date after it", () => {
    expect(page({})).toContain("Today, Tuesday 1 September");
  });

  it("heads a day two steps back with its date alone", () => {
    const html = page({ day: "2026-08-25", canPlan: false });

    expect(html).toContain("Tuesday 25 August");
    expect(html).not.toContain("Yesterday");
  });

  it("heads the day with a link to its own dated address", () => {
    expect(page({})).toContain(`href="/me/plan/${DAY}"`);
  });

  it("names each step of the walk the way a person reads it", () => {
    const html = page({ prev: "2026-08-31", next: "2026-09-02" });

    expect(html).toContain("The day before, Monday 31 August");
    expect(html).toContain("The day after, Wednesday 2 September");
  });

  it("names the day in the tab title, weekday first", () => {
    const title = meta({ loaderData: { day: DAY, today: DAY } } as never);

    expect(title).toEqual([{ title: "Tuesday 1 September — Tusker" }]);
  });
});

describe("a day past its own", () => {
  it("draws no pick and no step, because neither writes there", () => {
    const html = page({ day: "2026-08-25", canPlan: false });

    expect(html).not.toContain('value="plan"');
    expect(html).not.toContain('value="unplan"');
    expect(html).not.toContain('value="up"');
  });

  it("draws the pick and the step on the day the plan is made", () => {
    const html = page({});

    expect(html).toContain('value="unplan"');
    expect(html).toContain('value="up"');
  });
});
