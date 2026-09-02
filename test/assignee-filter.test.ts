import { describe, expect, it } from "vitest";

import {
  ANYONE,
  ASSIGNEE_NAME,
  UNASSIGNED,
  keeps,
  readAssignee,
  withoutAssignee,
} from "../app/assignee-filter";
import { narrowingOf } from "../app/remembered";

/** The address a board carries, as the filter helpers read it. */
function query(text: string) {
  return new URLSearchParams(text);
}

/** One assignee, as the loader's map holds them. */
function member(id: string) {
  return { id, name: id, initials: id.slice(0, 2).toUpperCase() };
}

describe("the value the address holds", () => {
  it("is Anyone on a board that carries no filter", () => {
    expect(readAssignee(query("backlog=1"))).toBe(ANYONE);
  });

  it("is Anyone when the value is empty", () => {
    expect(readAssignee(query(`${ASSIGNEE_NAME}=`))).toBe(ANYONE);
  });

  it("reads Unassigned", () => {
    expect(readAssignee(query(`${ASSIGNEE_NAME}=${UNASSIGNED}`))).toBe(UNASSIGNED);
  });

  it("reads a member", () => {
    expect(readAssignee(query(`${ASSIGNEE_NAME}=u-ada`))).toBe("u-ada");
  });

  it("drops the space around what the address carries", () => {
    expect(readAssignee(query(`${ASSIGNEE_NAME}=%20u-ada%20`))).toBe("u-ada");
  });
});

describe("the tasks one value keeps", () => {
  it("keeps every task under Anyone, held or not", () => {
    expect(keeps(ANYONE, [member("u-ada")])).toBe(true);
    expect(keeps(ANYONE, [])).toBe(true);
  });

  it("keeps the tasks nobody holds under Unassigned", () => {
    expect(keeps(UNASSIGNED, [])).toBe(true);
    expect(keeps(UNASSIGNED, [member("u-ada")])).toBe(false);
  });

  it("keeps a task the member holds among others", () => {
    const held = [member("u-ada"), member("u-bo"), member("u-cy")];
    expect(keeps("u-bo", held)).toBe(true);
    expect(keeps("u-dee", held)).toBe(false);
  });

  it("keeps nothing for a name no task answers to", () => {
    expect(keeps("u-gone", [])).toBe(false);
  });
});

describe("the rest of the address the select carries over", () => {
  it("keeps every name but the filter", () => {
    expect(withoutAssignee(query(`q=board&${ASSIGNEE_NAME}=u-ada&backlog=1`))).toEqual([
      ["q", "board"],
      ["backlog", "1"],
    ]);
  });
});

describe("what a board remembers", () => {
  it("keeps the filter beside the search", () => {
    expect(narrowingOf(query(`q=board&${ASSIGNEE_NAME}=u-ada`))).toBe(
      `q=board&${ASSIGNEE_NAME}=u-ada`,
    );
  });

  it("keeps a filter that stands alone", () => {
    expect(narrowingOf(query(`${ASSIGNEE_NAME}=${UNASSIGNED}&backlog=1`))).toBe(
      `${ASSIGNEE_NAME}=${UNASSIGNED}`,
    );
  });

  it("is empty for a board a person cleared by hand", () => {
    expect(narrowingOf(query(`q=&${ASSIGNEE_NAME}=&today=1`))).toBe("");
  });
});
