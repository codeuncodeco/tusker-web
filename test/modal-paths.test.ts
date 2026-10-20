import { describe, expect, it } from "vitest";

import { modalParentOf, orgPagePath, taskBack, taskHref } from "../app/paths";
import { modalTitle } from "../app/route-modal";

describe("the page a modal opens over", () => {
  it("is the board or the view the address starts with", () => {
    expect(modalParentOf("/o/acme/board")).toBe("/o/acme/board");
    expect(modalParentOf("/o/acme/board/t/12")).toBe("/o/acme/board");
    expect(modalParentOf("/o/acme/board/clients/Acme%20Co")).toBe("/o/acme/board");
    expect(modalParentOf("/me/t/12")).toBe("/me");
    expect(modalParentOf("/me/week/t/12")).toBe("/me/week");
    expect(modalParentOf("/me/plan")).toBe("/me/plan");
  });

  it("is none for a page that stands alone", () => {
    expect(modalParentOf("/t/12")).toBeNull();
    expect(modalParentOf("/me/plan/2026-10-19")).toBeNull();
    expect(modalParentOf("/account")).toBeNull();
  });
});

describe("where a task opens", () => {
  it("opens over the board, keeping the board's own address, and dropping a raised prompt", () => {
    expect(taskHref(12, "/o/acme/board", "?assignee=anyone&ask=3&org=acme")).toBe("/o/acme/board/t/12?assignee=anyone");
  });

  it("opens over the board from a modal already open over it", () => {
    expect(taskHref(12, "/o/acme/board/decisions", "")).toBe("/o/acme/board/t/12");
  });

  it("opens its own page where nothing stands behind, recording the way back", () => {
    expect(taskHref(12, "/me/plan/2026-10-19", "")).toBe("/t/12?from=%2Fme%2Fplan%2F2026-10-19");
  });

  it("goes back to the page it opened over, with that page's address", () => {
    expect(taskBack("https://x.test/o/acme/board/t/12?assignee=anyone", "acme")).toBe("/o/acme/board?assignee=anyone");
    expect(taskBack("https://x.test/t/12?from=%2Fme%2Fweek", "acme")).toBe("/me/week");
    expect(taskBack("https://x.test/t/12", "acme")).toBe("/o/acme/board");
  });
});

it("opens an org's pages over its board", () => {
  expect(orgPagePath("acme", "members")).toBe("/o/acme/board/members");
});

it("names a modal by its address", () => {
  expect(modalTitle("/o/acme/board/t/12")).toBe("Task #12");
  expect(modalTitle("/me/week/t/7")).toBe("Task #7");
  expect(modalTitle("/o/acme/board/decisions")).toBe("Decisions");
  expect(modalTitle("/o/acme/board/clients/Acme%20Co")).toBe("Acme Co");
});
