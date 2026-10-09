/**
 * What the org board draws for its field filters: one select per filterable
 * field in the top row's filter group, and a quick-add box that takes the
 * board's active narrowing. See #59.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import type { Status } from "../app/board";
import type { FieldFilter } from "../app/field-filter";
import Board from "../app/routes/board";

const COLUMNS: { status: Status; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];

const MEMBERS = [
  { id: "u-ada", name: "Ada", initials: "AD" },
  { id: "u-bo", name: "Bo", initials: "BO" },
];

/** The org board, drawn from the data a loader would give it. */
function orgBoard({ assignee = "", filters = [] as FieldFilter[] } = {}): string {
  const loaderData = {
    org: { slug: "acme", name: "Acme" },
    columns: COLUMNS.map((one) => ({ ...one, tasks: [] })),
    members: MEMBERS,
    ask: null,
    toggles: {},
    today: false,
    week: false,
    search: "",
    assignee,
    filters,
    day: "2026-09-02",
    hasPlan: false,
    hasSet: false,
    backlogByRule: true,
  };
  const props = { loaderData } as unknown as React.ComponentProps<typeof Board>;
  const Stub = createRoutesStub([{ path: "/o/:slug/board", Component: () => <Board {...props} /> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/o/acme/board"]} />);
}

const CLIENT: FieldFilter = {
  key: "client",
  label: "Client",
  value: "",
  options: [
    { value: "Acme", label: "Acme" },
    { value: "Globex", label: "Globex" },
  ],
};

/** The form that posts an add. */
function addBox(html: string): string {
  return html.split("<form").find((form) => form.includes('value="create"')) ?? "";
}

/** The filter group on the right of the top row. */
function filterGroup(html: string): string {
  return html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
}

describe("the field filters in the top row", () => {
  it("draws one select per filterable field, with Any first", () => {
    const group = filterGroup(orgBoard({ filters: [CLIENT] }));
    expect(group).toContain('name="field.client"');
    expect(group).toContain('aria-label="Filter by Client"');
    expect(group.indexOf(">Any client<")).toBeLessThan(group.indexOf(">Acme<"));
  });

  it("holds the value the board narrows by", () => {
    const group = filterGroup(orgBoard({ filters: [{ ...CLIENT, value: "Globex" }] }));
    expect(group).toMatch(/<option value="Globex" selected="">/);
  });

  it("draws no field select for an org with no filterable field", () => {
    expect(filterGroup(orgBoard())).not.toContain('name="field.');
  });
});

describe("the quick-add box under the narrowing", () => {
  it("posts each active field value", () => {
    const box = addBox(orgBoard({ filters: [{ ...CLIENT, value: "Acme" }] }));
    expect(box).toContain('type="hidden" name="field.client" value="Acme"');
  });

  it("posts no value for a filter set to Any", () => {
    expect(addBox(orgBoard({ filters: [CLIENT] }))).not.toContain('name="field.client"');
  });

  it("starts the assignee picker with the member the board is narrowed to", () => {
    const box = addBox(orgBoard({ assignee: "u-bo" }));
    expect(box).toContain('name="assignee" value="u-bo"');
    expect(box).not.toContain('name="assignee" value="u-ada"');
  });

  it("starts the picker empty under Anyone and Unassigned", () => {
    expect(addBox(orgBoard())).not.toContain('name="assignee" value=');
    expect(addBox(orgBoard({ assignee: "unassigned" }))).not.toContain('name="assignee" value=');
  });
});
