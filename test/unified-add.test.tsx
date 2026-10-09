/**
 * The org picker on the cross-org quick-add box. It starts with no org picked,
 * and a person who belongs to one org has none at all. See ADR-0027.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { AddingProvider } from "../app/adding";
import type { OrgHeld } from "../app/current-org";
import { UnifiedAdd } from "../app/unified-add";

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
