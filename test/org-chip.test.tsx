import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import type { OrgHeld } from "../app/current-org";
import { FocusList } from "../app/focus-list";
import { OrgChip, OrgNameChip, orgInitialsOf, tellsOrgsApart } from "../app/org-chip";
import type { Group, LiveTask } from "../app/unified";
import { UnifiedCard } from "../app/unified-card";
import { UnifiedList } from "../app/unified-list";
import { UnifiedRow } from "../app/unified-row";
import { headerAt } from "./routes";

/** One task of an org that carries the named colour. */
function live(color: string | null): LiveTask {
  return {
    id: 1,
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

describe("the initials an org chip draws", () => {
  it("takes the first letter of the first two words", () => {
    expect(orgInitialsOf("Code Uncode")).toBe("CU");
    expect(orgInitialsOf("code uncode labs")).toBe("CU");
  });

  it("splits words on a hyphen, an underscore and a dot as well as a space", () => {
    expect(orgInitialsOf("acme-corp")).toBe("AC");
    expect(orgInitialsOf("acme_corp")).toBe("AC");
    expect(orgInitialsOf("acme.corp")).toBe("AC");
  });

  it("counts a digit as a letter", () => {
    expect(orgInitialsOf("Team 7")).toBe("T7");
    expect(orgInitialsOf("42")).toBe("42");
  });

  it("takes the first two letters of a one-word name", () => {
    expect(orgInitialsOf("Acme")).toBe("AC");
    expect(orgInitialsOf("codeuncode")).toBe("CO");
  });

  it("draws one letter for a name that holds one", () => {
    expect(orgInitialsOf("X")).toBe("X");
    expect(orgInitialsOf("  x  ")).toBe("X");
  });

  it("skips a word with no letter or digit, such as an emoji", () => {
    expect(orgInitialsOf("🚀 Launch Pad")).toBe("LP");
  });

  it("draws the first character of a name with no letter or digit, so the chip is never empty", () => {
    expect(orgInitialsOf("🚀")).toBe("🚀");
    expect(orgInitialsOf("  -- ")).toBe("-");
  });

  it("keeps a letter that uppercases to two as one, so the chip stays two wide", () => {
    expect(orgInitialsOf("ßeta")).toBe("SE");
  });

  it("keeps a whole emoji as the first character, not half of one", () => {
    expect(orgInitialsOf("👍🏽")).toBe("👍🏽");
  });
});

describe("the initials chip", () => {
  it("draws the initials, and gives a reader and a hover the full name", () => {
    const markup = renderToStaticMarkup(<OrgChip org={{ name: "Code Uncode", color: "teal" }} />);

    expect(markup).toContain('title="Code Uncode"');
    expect(markup).toMatch(/<span class="sr-only">Code Uncode<\/span>/);
    expect(markup).toMatch(/<span aria-hidden="true">CU<\/span>/);
  });

  it("draws the dot and the full name in the form the quick-add line takes", () => {
    const markup = renderToStaticMarkup(<OrgNameChip org={{ name: "Code Uncode", color: "teal" }} />);

    expect(markup).toContain("var(--color-opt-teal)");
    expect(markup).toContain("Code Uncode");
    expect(markup).not.toContain('aria-hidden="true">CU<');
  });
});

describe("a card of the unified board", () => {
  it("names its org with the initials chip, colour and all", () => {
    const markup = draw(() => (
      <UnifiedCard task={live("purple")} selected={false} domId="c1" place={() => {}} showsOrg />
    ));

    expect(markup).toContain("var(--color-opt-purple)");
    expect(markup).toContain('title="Acme"');
    expect(markup).toMatch(/<span aria-hidden="true">AC<\/span>/);
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

    expect(row).toContain('title="Acme"');
    expect(row).toMatch(/<span aria-hidden="true">AC<\/span>/);
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

    for (const html of [list, batch]) {
      expect(html).toContain('title="Acme"');
      expect(html).toMatch(/<span aria-hidden="true">AC<\/span>/);
    }
  });
});

describe("the header", () => {
  /** One org as the header holds it. */
  function org(slug: string, color: string | null): OrgHeld {
    return { slug, name: slug, color };
  }

  it("puts the dot of the org in view beside its name, and every org's in the settings panel", () => {
    const orgs = [org("acme", "teal"), org("ada", "pink")];
    const markup = headerAt("/o/acme/board", orgs, orgs[0]!);

    const header = markup.slice(0, markup.indexOf("</header>"));
    expect(header).toContain("var(--color-opt-teal)");
    expect(header).not.toContain("var(--color-opt-pink)");
    const panel = markup.slice(markup.indexOf('aria-label="Settings"'));
    expect(panel).toContain("var(--color-opt-teal)");
    expect(panel).toContain("var(--color-opt-pink)");
  });

  it("gives a colourless org a grey dot, so the header keeps one shape", () => {
    const orgs = [org("acme", null)];
    const markup = headerAt("/o/acme/board", orgs, orgs[0]!);

    expect(markup).toContain("var(--color-opt-grey)");
  });
});
