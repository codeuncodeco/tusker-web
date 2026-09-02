import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssigneePicker } from "../app/assignee-picker";
import type { Assignee } from "../app/assignees";

const ADA: Assignee = { id: "u-ada", name: "Ada Byron", initials: "AB" };
const DEV: Assignee = { id: "u-dev", name: "Devi Kaur", initials: "DK" };

/** The closed picker, as a page draws it before anybody opens it. */
function drawn(members: Assignee[], picked: string[] = []) {
  return renderToStaticMarkup(
    <AssigneePicker members={members} picked={picked} onPick={() => {}} />,
  );
}

describe("the closed button", () => {
  it("says Assign while the set is empty, because unassigned is a state", () => {
    const html = drawn([ADA, DEV]);

    expect(html).toContain("Assign");
    expect(html).toContain('aria-label="Assign to a member"');
  });

  it("draws the initials of everyone held, and names them in full", () => {
    const html = drawn([ADA, DEV], [ADA.id, DEV.id]);

    expect(html).toContain("AB");
    expect(html).toContain("DK");
    expect(html).toContain('aria-label="Assigned to Ada Byron, Devi Kaur"');
  });
});

describe("what the box posts", () => {
  it("carries the set as hidden fields, so a shut popover still posts it", () => {
    const html = drawn([ADA, DEV], [DEV.id]);

    expect(html).toContain('<input type="hidden" name="assignee" value="u-dev"/>');
    expect(html).not.toContain('value="u-ada"');
  });

  it("posts nothing while nobody is held", () => {
    expect(drawn([ADA, DEV])).not.toContain('name="assignee"');
  });
});

it("draws nothing for an org with no member list, as a personal org has none", () => {
  expect(drawn([])).toBe("");
});
