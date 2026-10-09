/**
 * A task-page button, while its own post is in flight.
 *
 * Each button reads the navigation for its own intent, so a Save in flight
 * does not hold Finish, and the reverse. The button is live again once the
 * navigation is idle, whether the post landed or was refused. See #194.
 */

import { describe, expect, it } from "vitest";

import { isPosting } from "../app/posting";

/** The navigation while one form is posted, or after it, as React Router holds it. */
function posted(state: "submitting" | "loading", fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.append(name, value);
  return { state, formMethod: "POST", formData } as const;
}

const idle = { state: "idle", formMethod: undefined, formData: undefined } as const;

describe("a button with an intent", () => {
  it("is posting while a form with its intent is submitted", () => {
    expect(isPosting(posted("submitting", { intent: "finish" }), "finish")).toBe(true);
  });

  it("is still posting while the page reloads after its post", () => {
    expect(isPosting(posted("loading", { intent: "finish" }), "finish")).toBe(true);
  });

  it("is not posting while another intent is in flight", () => {
    expect(isPosting(posted("submitting", { intent: "archive" }), "finish")).toBe(false);
  });

  it("is not posting while the edit form, which carries no intent, is in flight", () => {
    expect(isPosting(posted("submitting", { title: "A" }), "finish")).toBe(false);
  });

  it("is live again once the navigation is idle", () => {
    expect(isPosting(idle, "finish")).toBe(false);
  });
});

describe("the Save button, which posts no intent", () => {
  it("is posting while a form with no intent is submitted", () => {
    expect(isPosting(posted("submitting", { title: "A" }), null)).toBe(true);
  });

  it("is not posting while Finish is in flight", () => {
    expect(isPosting(posted("submitting", { intent: "finish" }), null)).toBe(false);
  });

  it("is not posting while the page only loads, with nothing posted", () => {
    expect(isPosting({ state: "loading", formMethod: undefined, formData: undefined }, null)).toBe(
      false,
    );
  });

  it("is live again once the navigation is idle", () => {
    expect(isPosting(idle, null)).toBe(false);
  });
});
