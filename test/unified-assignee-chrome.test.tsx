/**
 * What the unified board draws for its assignee filter: the chips, the box it
 * seeds, and the org select that carries the value to another board.
 * See ADR-0033.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { AddingProvider } from "../app/adding";
import { MINE } from "../app/assignee-filter";
import type { Assignee } from "../app/assignees";
import { UnifiedAssigneeFilter } from "../app/board-chrome";
import type { OrgHeld } from "../app/current-org";
import { UnifiedAdd } from "../app/unified-add";
import { headerAt } from "./routes";

const ACME: OrgHeld = { slug: "acme", name: "Acme", color: "blue" };
const ADA: OrgHeld = { slug: "ada", name: "Ada", color: "red" };
const ADA_LOVELACE: Assignee = { id: "u-ada", name: "Ada Lovelace", initials: "AL" };
const BO: Assignee = { id: "u-bo", name: "Bo Diddley", initials: "BD" };

/** Draws one element at one address, inside a data router. */
function drawnAt(path: string, element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/me", Component: () => element }]);
  return renderToStaticMarkup(<Stub initialEntries={[path]} />);
}

/** The chips of the filter, as `[href, pressed, words]`. */
function chips(html: string): [string, string, string][] {
  return [...html.matchAll(/<a ([^>]*)>([^<]*)</g)].map((one) => [
    (one[1]!.match(/href="([^"]*)"/)?.[1] ?? "").replace(/&amp;/g, "&"),
    one[1]!.match(/aria-pressed="([^"]*)"/)?.[1] ?? "",
    one[2]!,
  ]);
}

describe("the chips", () => {
  it("offer Mine, Anyone and Unassigned, each one click away, and no member", () => {
    const html = drawnAt("/me", <UnifiedAssigneeFilter assignee={MINE} />);

    expect(chips(html)).toEqual([
      [`/me?assignee=${MINE}`, "true", "Mine"],
      ["/me?assignee=anyone", "false", "Anyone"],
      ["/me?assignee=unassigned", "false", "Unassigned"],
    ]);
  });

  it("press the value the board narrows by", () => {
    const html = drawnAt("/me?assignee=anyone", <UnifiedAssigneeFilter assignee="" />);

    expect(chips(html).map((one) => one[1])).toEqual(["false", "true", "false"]);
  });

  it("keep the chips and the columns in the address, and drop their own old value", () => {
    const html = drawnAt(
      `/me?today=1&backlog=1&assignee=${MINE}`,
      <UnifiedAssigneeFilter assignee={MINE} />,
    );

    expect(chips(html)[2]![0]).toBe("/me?today=1&backlog=1&assignee=unassigned");
  });

  it("are links, so a browser that runs no script narrows too", () => {
    const html = drawnAt("/me", <UnifiedAssigneeFilter assignee={MINE} />);

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<select");
  });
});

describe("the box on a board narrowed to Mine", () => {
  /** The box for a person in one team, seeded with whoever is named. */
  function box(seed: string | null) {
    return drawnAt(
      "/me",
      <AddingProvider>
        <UnifiedAdd orgs={[ACME]} members={{ acme: [ADA_LOVELACE, BO] }} seed={seed} />
      </AddingProvider>,
    );
  }

  it("starts with the reader picked", () => {
    expect(box("u-ada")).toContain('<input type="hidden" name="assignee" value="u-ada"/>');
  });

  it("starts with nobody picked on any other board", () => {
    expect(box(null)).not.toContain('name="assignee"');
  });

  it("picks nobody in an org the reader is no member of", () => {
    expect(box("u-cy")).not.toContain('name="assignee"');
  });
});

describe("the org picks in the settings panel", () => {
  it("carry the board's filter through /go, so the next board reads it in its own words", () => {
    const html = headerAt(`/me?assignee=${MINE}`, [ADA, ACME], null);

    expect(html).toContain(`href="/go?to=acme&amp;assignee=${MINE}"`);
  });

  it("carry Anyone set by hand", () => {
    const html = headerAt("/o/acme/board?assignee=", [ADA, ACME], ACME);

    expect(html).toContain('href="/go?to=ada&amp;assignee="');
  });

  it("carries nothing from an address with no filter", () => {
    expect(headerAt("/me", [ADA, ACME], null)).not.toContain('name="assignee"');
  });
});
