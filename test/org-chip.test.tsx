import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter, createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import type { OrgHeld } from "../app/current-org";
import { FocusList } from "../app/focus-list";
import { Header } from "../app/header";
import { OrgChip, tellsOrgsApart } from "../app/org-chip";
import type { Group, LiveTask } from "../app/unified";
import { UnifiedCard } from "../app/unified-card";
import { UnifiedList } from "../app/unified-list";
import { UnifiedRow } from "../app/unified-row";

/** One task of an org that carries the named colour. */
function live(color: string | null): LiveTask {
  return {
    id: "t1",
    org: { slug: "acme", name: "Acme", color },
    title: "Ship it",
    status: "todo",
    due_date: null,
    percentile: 0.5,
    created_at: "2026-09-01",
    fields: [],
    assignees: [],
    finished: false,
  };
}

/** A component that links, rendered as one string of HTML. */
function draw(Component: () => React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/me", Component }]);
  return renderToStaticMarkup(<Stub initialEntries={["/me"]} />);
}

describe("the chip that names an org", () => {
  it("paints the dot with the org's colour and still reads the name", () => {
    const markup = renderToStaticMarkup(<OrgChip org={{ name: "Acme", color: "teal" }} />);

    expect(markup).toContain("var(--color-opt-teal)");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("Acme");
  });

  it("draws grey for an org nobody gave a colour", () => {
    const markup = renderToStaticMarkup(<OrgChip org={{ name: "Acme", color: null }} />);

    expect(markup).toContain("var(--color-opt-grey)");
  });

  it("draws grey, and throws no page away, for a name the palette dropped", () => {
    const markup = renderToStaticMarkup(<OrgChip org={{ name: "Acme", color: "chartreuse" }} />);

    expect(markup).toContain("var(--color-opt-grey)");
    expect(markup).toContain("Acme");
  });

  it("draws an exact colour as the person typed it", () => {
    const markup = renderToStaticMarkup(<OrgChip org={{ name: "Acme", color: "#2563EB" }} />);

    expect(markup).toContain("#2563EB");
  });
});

describe("a card of the unified board", () => {
  it("names its org with the chip, colour and all", () => {
    const markup = draw(() => (
      <UnifiedCard task={live("purple")} selected={false} domId="c1" place={() => {}} showsOrg />
    ));

    expect(markup).toContain("var(--color-opt-purple)");
    expect(markup).toContain("Acme");
  });

  it("names no org for a person in one, because there is no other to tell it from", () => {
    const markup = draw(() => (
      <UnifiedCard task={live("purple")} selected={false} domId="c1" place={() => {}} showsOrg={false} />
    ));

    expect(markup).not.toContain("var(--color-opt-purple)");
    expect(markup).not.toContain("Acme");
    expect(markup).toContain("Ship it");
  });
});

describe("a page that mixes orgs", () => {
  const acme: OrgHeld = { slug: "acme", name: "Acme", color: "purple" };
  const ada: OrgHeld = { slug: "ada", name: "Ada", color: "pink" };

  it("names each task's org for a person in two orgs or more", () => {
    expect(tellsOrgsApart([acme, ada])).toBe(true);
  });

  it("names no org for a person in one, or in none", () => {
    expect(tellsOrgsApart([acme])).toBe(false);
    expect(tellsOrgsApart([])).toBe(false);
  });
});

describe("a row of plan mode, the week page and focus mode", () => {
  const groups: Group[] = [{ key: "today", label: "Plan", tasks: [live("purple")], sinks: false }];

  it("names its org with the chip for a person in several", () => {
    const row = draw(() => (
      <ul>
        <UnifiedRow task={live("purple")} planned={false} selected={false} domId="r1" showsOrg />
      </ul>
    ));

    expect(row).toContain("Acme");
  });

  it("names no org on a row, a list or a batch for a person in one", () => {
    const row = draw(() => (
      <ul>
        <UnifiedRow task={live("purple")} planned={false} selected={false} domId="r1" showsOrg={false} />
      </ul>
    ));
    const list = draw(() => (
      <UnifiedList groups={groups} planned={new Set()} day="2026-10-09" showsOrg={false} />
    ));
    const batch = draw(() => <FocusList tasks={[live("purple")]} showsOrg={false} />);

    for (const html of [row, list, batch]) {
      expect(html).toContain("Ship it");
      expect(html).not.toContain("Acme");
    }
  });

  it("passes the chip down a list and a batch for a person in several", () => {
    const list = draw(() => <UnifiedList groups={groups} planned={new Set()} day="2026-10-09" showsOrg />);
    const batch = draw(() => <FocusList tasks={[live("purple")]} showsOrg />);

    expect(list).toContain("Acme");
    expect(batch).toContain("Acme");
  });
});

describe("the header", () => {
  /** One org as the header holds it. */
  function org(slug: string, color: string | null): OrgHeld {
    return { slug, name: slug, color };
  }

  it("puts a dot before the current org and before every org in the switcher", () => {
    const orgs = [org("acme", "teal"), org("ada", "pink")];
    const markup = renderToStaticMarkup(
      <StaticRouter location="/o/acme/board">
        <Header orgs={orgs} org={orgs[0]!} />
      </StaticRouter>,
    );

    // Row 1 names the current org once, and the menu names both.
    expect(markup.match(/--color-opt-teal/g)).toHaveLength(2);
    expect(markup).toContain("var(--color-opt-pink)");
  });

  it("gives a colourless org a grey dot, so the menu keeps one shape", () => {
    const orgs = [org("acme", null)];
    const markup = renderToStaticMarkup(
      <StaticRouter location="/o/acme/board">
        <Header orgs={orgs} org={orgs[0]!} />
      </StaticRouter>,
    );

    expect(markup).toContain("var(--color-opt-grey)");
  });
});
