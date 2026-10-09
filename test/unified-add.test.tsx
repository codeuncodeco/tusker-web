/**
 * The org picker on the cross-org quick-add box. It starts with no org picked,
 * and a person who belongs to one org has none at all. See ADR-0027.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { AddingProvider } from "../app/adding";
import type { OrgHeld } from "../app/current-org";
import { UndoLine, UnifiedAdd } from "../app/unified-add";

const ACME: OrgHeld = { slug: "acme", name: "Acme", color: "blue" };
const ADA: OrgHeld = { slug: "ada", name: "Ada", color: "red" };

/** The box, as a person who opened Tusker a moment ago sees it. */
function box(orgs: OrgHeld[]): string {
  const Stub = createRoutesStub([
    {
      path: "/me",
      Component: () => (
        <AddingProvider>
          <UnifiedAdd orgs={orgs} members={{}} />
        </AddingProvider>
      ),
    },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={["/me"]} />);
}

/** The org select, or undefined when the box draws none. */
function picker(html: string): string | undefined {
  return /<select[^>]*aria-label="Add to org"[^>]*>.*?<\/select>/s.exec(html)?.[0];
}

describe("a box for a person in several orgs", () => {
  it("starts with no org picked, and the browser refuses an add until one is", () => {
    const select = picker(box([ADA, ACME]));

    expect(select).toBeDefined();
    expect(select).toMatch(/<select[^>]*required/);
    expect(select).toMatch(/<option value="" disabled="" selected="">/);
    expect(select).not.toMatch(/value="(ada|acme)" selected/);
  });

  it("names no org over the box while none is picked", () => {
    expect(box([ADA, ACME])).not.toContain("Adding to");
  });
});

describe("a box for a person in one org", () => {
  it("draws no picker, and files into that org", () => {
    const html = box([ACME]);

    expect(picker(html)).toBeUndefined();
    expect(html).toContain('<input type="hidden" name="slug" value="acme"/>');
  });

  it("names no org either, because there is no other to mistake it for", () => {
    expect(box([ACME])).not.toContain("Adding to");
  });
});

it("draws nothing for a person in no org", () => {
  expect(box([])).not.toContain("<form");
});

describe("the line an add leaves", () => {
  /** The line for an add of `count` rows, filed in `org`. */
  function line(org: string | null, count = 1): string {
    const ids = Array.from({ length: count }, (_, at) => `t${at}`);
    return renderToStaticMarkup(
      <UndoLine
        added={{ slug: "acme", ids, text: "Ship it", decides: false }}
        org={org}
        undo={() => {}}
        dismiss={() => {}}
      />,
    );
  }

  it("names the org for a person in several", () => {
    expect(line("Acme")).toContain("Added to Acme");
    expect(line("Acme", 3)).toContain("Added 3 tasks to Acme");
  });

  it("names no org for a person in one", () => {
    expect(line(null)).toMatch(/<span class="grow">Added<\/span>/);
    expect(line(null, 3)).toMatch(/<span class="grow">Added 3 tasks<\/span>/);
  });
});
