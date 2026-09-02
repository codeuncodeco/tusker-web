import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssigneePicker, popoverSide } from "../app/assignee-picker";
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

describe("the side the popover hangs from", () => {
  const WIDTH = 224;
  const VIEWPORT = 1000;

  it("hangs from the right edge where the room is there", () => {
    expect(popoverSide({ left: 700, right: 760 }, WIDTH, VIEWPORT)).toBe("right");
  });

  it("hangs from the left edge in the leftmost column, where a right hang runs off", () => {
    expect(popoverSide({ left: 40, right: 100 }, WIDTH, VIEWPORT)).toBe("left");
  });

  it("hangs from the right edge where neither side fits, so one rule decides", () => {
    expect(popoverSide({ left: 10, right: 60 }, WIDTH, 200)).toBe("right");
  });
});
