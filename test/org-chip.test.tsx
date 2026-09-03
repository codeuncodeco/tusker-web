import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter, createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import type { OrgHeld } from "../app/current-org";
import { Header } from "../app/header";
import { OrgChip } from "../app/org-chip";
import type { LiveTask } from "../app/unified";
import { UnifiedCard } from "../app/unified-card";

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
      <UnifiedCard task={live("purple")} rank={1} selected={false} domId="c1" place={() => {}} />
    ));

    expect(markup).toContain("var(--color-opt-purple)");
    expect(markup).toContain("Acme");
  });
});

describe("the header", () => {
  /** One org as the header holds it. */
  function org(slug: string, color: string | null): OrgHeld {
    return { slug, name: slug, kind: "team", color };
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
