/**
 * What the unified board draws for its assignee filter: the select, the box it
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

describe("the select", () => {
  it("offers Anyone, Mine and Unassigned, and no member", () => {
    const html = drawnAt("/me", <UnifiedAssigneeFilter assignee="" />);

    const options = [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((one) => [
      one[1],
      one[2],
    ]);
    expect(options).toEqual([
      ["", "Anyone"],
      [MINE, "Mine"],
      ["unassigned", "Unassigned"],
    ]);
  });

  it("holds the value the address carries", () => {
    const html = drawnAt(`/me?assignee=${MINE}`, <UnifiedAssigneeFilter assignee={MINE} />);

    expect(html).toContain(`<option value="${MINE}" selected="">Mine</option>`);
  });

  it("keeps the chips and the columns in the address, and drops its own old value", () => {
    const html = drawnAt(
      `/me?today=1&backlog=1&assignee=${MINE}`,
      <UnifiedAssigneeFilter assignee={MINE} />,
    );

    expect(html).toContain('<input type="hidden" name="today" value="1"/>');
    expect(html).toContain('<input type="hidden" name="backlog" value="1"/>');
    expect(html).not.toContain('type="hidden" name="assignee"');
  });

  it("is a GET form, with a button for a browser that runs no script", () => {
    const html = drawnAt("/me", <UnifiedAssigneeFilter assignee="" />);

    expect(html).toMatch(/<form [^>]*method="get"/);
    expect(html).toContain('<button class="sr-only">Filter</button>');
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

describe("the org select", () => {
  it("carries the board's filter, so a pick with no script keeps it", () => {
    const html = headerAt(`/me?assignee=${MINE}`, [ADA, ACME], null);

    expect(html).toContain(`<input type="hidden" name="assignee" value="${MINE}"/>`);
  });

  it("carries Anyone set by hand", () => {
    const html = headerAt("/o/acme/board?assignee=", [ADA, ACME], ACME);

    expect(html).toContain('<input type="hidden" name="assignee" value=""/>');
  });

  it("carries nothing from an address with no filter", () => {
    expect(headerAt("/me", [ADA, ACME], null)).not.toContain('name="assignee"');
  });
});
