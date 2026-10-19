import { describe, expect, it } from "vitest";

import {
  ANYONE,
  ANYONE_WORD,
  ASSIGNEE_NAME,
  MINE,
  UNASSIGNED,
  carried,
  keeps,
  readAssignee,
  readBoardAssignee,
  readUnifiedAssignee,
  resolvedFor,
  seededBy,
  withoutAssignee,
} from "../app/assignee-filter";
import { memoryKey, narrowingOf } from "../app/remembered";

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
    expect(narrowingOf(query("q=&today=1"))).toBe("");
  });

  it("keeps Anyone, said out loud, because a bare address is the reader's own work", () => {
    expect(narrowingOf(query(`q=&${ASSIGNEE_NAME}=&today=1`))).toBe(`${ASSIGNEE_NAME}=${ANYONE_WORD}`);
    expect(narrowingOf(query(`${ASSIGNEE_NAME}=${ANYONE_WORD}`))).toBe(`${ASSIGNEE_NAME}=${ANYONE_WORD}`);
  });
});

describe("the assignees the quick-add box starts with", () => {
  const members = [member("u-ada"), member("u-bo")];

  it("is the member the board is narrowed to", () => {
    expect(seededBy("u-bo", members)).toEqual(["u-bo"]);
  });

  it("is nobody under Anyone or Unassigned", () => {
    expect(seededBy(ANYONE, members)).toEqual([]);
    expect(seededBy(UNASSIGNED, members)).toEqual([]);
  });

  it("is nobody for a name no member answers to", () => {
    expect(seededBy("u-gone", members)).toEqual([]);
  });
});

describe("the value the unified board reads", () => {
  it("reads Mine and Unassigned", () => {
    expect(readUnifiedAssignee(query(`${ASSIGNEE_NAME}=${MINE}`))).toBe(MINE);
    expect(readUnifiedAssignee(query(`${ASSIGNEE_NAME}=${UNASSIGNED}`))).toBe(UNASSIGNED);
  });

  it("is Mine on an address that carries no filter, so the board opens on the reader's work", () => {
    expect(readUnifiedAssignee(query(""))).toBe(MINE);
    expect(readUnifiedAssignee(query("backlog=1"))).toBe(MINE);
  });

  it("is Anyone on an address that says so, as the word or as an empty value", () => {
    expect(readUnifiedAssignee(query(`${ASSIGNEE_NAME}=${ANYONE_WORD}`))).toBe(ANYONE);
    expect(readUnifiedAssignee(query(`${ASSIGNEE_NAME}=`))).toBe(ANYONE);
  });

  it("reads a member id as Anyone, because the board names no member", () => {
    expect(readUnifiedAssignee(query(`${ASSIGNEE_NAME}=u-ada`))).toBe(ANYONE);
  });
});

describe("the value an org board reads", () => {
  it("is the reader on an address that carries no filter", () => {
    expect(readBoardAssignee(query(""), "u-ada")).toBe("u-ada");
    expect(readBoardAssignee(query("q=walk"), "u-ada")).toBe("u-ada");
  });

  it("is Anyone on an address that says so, as the word or as an empty value", () => {
    expect(readBoardAssignee(query(`${ASSIGNEE_NAME}=${ANYONE_WORD}`), "u-ada")).toBe(ANYONE);
    expect(readBoardAssignee(query(`${ASSIGNEE_NAME}=`), "u-ada")).toBe(ANYONE);
  });

  it("reads Unassigned and a member as themselves", () => {
    expect(readBoardAssignee(query(`${ASSIGNEE_NAME}=${UNASSIGNED}`), "u-ada")).toBe(UNASSIGNED);
    expect(readBoardAssignee(query(`${ASSIGNEE_NAME}=u-bo`), "u-ada")).toBe("u-bo");
  });
});

describe("the holder Mine names", () => {
  it("is whoever reads the board, so a shared link shows the reader's own work", () => {
    const held = [member("u-ada")];
    expect(keeps(resolvedFor(MINE, "u-ada"), held)).toBe(true);
    expect(keeps(resolvedFor(MINE, "u-bo"), held)).toBe(false);
  });

  it("leaves Anyone and Unassigned as they are", () => {
    expect(resolvedFor(ANYONE, "u-ada")).toBe(ANYONE);
    expect(resolvedFor(UNASSIGNED, "u-ada")).toBe(UNASSIGNED);
  });
});

describe("the value the org select carries to another board", () => {
  const team = { members: 3 };
  const solo = { members: 1 };

  it("turns Mine into the person on an org board, and keeps Unassigned", () => {
    expect(carried(MINE, "u-ada", team)).toBe("u-ada");
    expect(carried(UNASSIGNED, "u-ada", team)).toBe(UNASSIGNED);
  });

  it("drops the value on the way to an org of one, which draws no filter", () => {
    expect(carried(MINE, "u-ada", solo)).toBe(null);
    expect(carried(UNASSIGNED, "u-ada", solo)).toBe(null);
  });

  it("turns the person into Mine on the way to All, and keeps Unassigned", () => {
    expect(carried("u-ada", "u-ada", null)).toBe(MINE);
    expect(carried(UNASSIGNED, "u-ada", null)).toBe(UNASSIGNED);
  });

  it("turns another member into Anyone, said out loud so no memory stands in", () => {
    expect(carried("u-bo", "u-ada", null)).toBe(ANYONE_WORD);
    expect(carried("u-bo", "u-ada", team)).toBe(ANYONE_WORD);
  });

  it("carries the person from one org board to another", () => {
    expect(carried("u-ada", "u-ada", team)).toBe("u-ada");
  });

  it("carries Anyone set by hand, as its word, so the next board's memory and default do not stand in", () => {
    expect(carried(ANYONE, "u-ada", null)).toBe(ANYONE_WORD);
    expect(carried(ANYONE_WORD, "u-ada", team)).toBe(ANYONE_WORD);
  });

  it("carries nothing from an address with no filter, so the next board's memory holds", () => {
    expect(carried(null, "u-ada", null)).toBe(null);
    expect(carried(null, "u-ada", team)).toBe(null);
  });
});

describe("where the unified board remembers its filter", () => {
  it("is a place no org's slug can name", () => {
    for (const slug of ["all", "me", "board", "unified", "a-b-1"]) {
      expect(memoryKey(null)).not.toBe(memoryKey(slug));
    }
    expect(memoryKey(null)).not.toMatch(/^tusker:board:[a-z0-9-]+$/);
  });

  it("keeps Mine", () => {
    expect(narrowingOf(query(`${ASSIGNEE_NAME}=${MINE}&today=1`))).toBe(`${ASSIGNEE_NAME}=${MINE}`);
  });
});
