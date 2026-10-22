import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssigneePicker } from "../app/assignee-picker";
import type { Assignee } from "../app/assignees";

const ADA: Assignee = { id: "u-ada", name: "Ada Byron", initials: "AB" };
const DEV: Assignee = { id: "u-dev", name: "Devi Kaur", initials: "DK" };

/** The picker, as a page draws it. */
function drawn(members: Assignee[], picked: string[] = []) {
  return renderToStaticMarkup(
    <AssigneePicker members={members} picked={picked} onPick={() => {}} />,
  );
}

describe("the toggles", () => {
  it("says nobody is held while the set is empty, because unassigned is a state", () => {
    const html = drawn([ADA, DEV]);

    expect(html).toContain('aria-label="Assign to a member"');
    expect(html).not.toContain('aria-pressed="true"');
  });

  it("draws one toggle per member, with their initials, and names who is held", () => {
    const html = drawn([ADA, DEV], [ADA.id, DEV.id]);

    expect(html).toContain("AB");
    expect(html).toContain("DK");
    expect(html).toContain('aria-label="Assigned to Ada Byron, Devi Kaur"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  it("presses only the members held", () => {
    const html = drawn([ADA, DEV], [DEV.id]);

    expect(html).toMatch(/aria-pressed="false" aria-label="Ada Byron"/);
    expect(html).toMatch(/aria-pressed="true" aria-label="Devi Kaur"/);
  });
});

describe("what the box posts", () => {
  it("carries the set as hidden fields", () => {
    const html = drawn([ADA, DEV], [DEV.id]);

    expect(html).toContain('<input type="hidden" name="assignee" value="u-dev"/>');
    expect(html).not.toContain('value="u-ada"');
  });

  it("posts nothing while nobody is held", () => {
    expect(drawn([ADA, DEV])).not.toContain('name="assignee"');
  });
});

it("draws nothing for an org with no member list, as an org of one has none", () => {
  expect(drawn([])).toBe("");
});
