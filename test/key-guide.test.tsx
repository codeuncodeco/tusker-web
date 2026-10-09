/**
 * The Key guide: the dialog that names every list key the page gives. `?`
 * opens it from inside a keyed list, and from nowhere else. See #206.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BOARD_LINES } from "../app/board-keys";
import { KeyGuide, guideFor, type GuideLine } from "../app/key-guide";
import { KEY_MAP, type ActionName } from "../app/key-map";
import { readPress } from "../app/keyed-list";
import { ALL_ACTS, NO_STEP_ACTS, READ_ACTS, guideLines } from "../app/unified-keys";

/** A press as a keyed list hears it, on an element that is or is not a box. */
function keydown(key: string, inBox = false): KeyboardEvent {
  const target = { closest: () => (inBox ? {} : null) };
  return { key, target, metaKey: false, ctrlKey: false, altKey: false } as unknown as KeyboardEvent;
}

/** What one press does to a keyed list that binds nothing of its own. */
function hear(event: KeyboardEvent) {
  const guide = vi.fn();
  const kept = readPress(event, { press: () => false, guide, box: null, swallow: [] });
  return { kept, opened: guide.mock.calls.length > 0 };
}

describe("the press that opens the guide", () => {
  // No page draws a dialog, so every press reaches the list's guard.
  afterEach(() => vi.unstubAllGlobals());
  function noDialog() {
    vi.stubGlobal("document", { querySelector: () => null });
  }

  it("is ?, from inside a keyed list", () => {
    noDialog();
    expect(KEY_MAP.guide.key).toBe("?");
    expect(hear(keydown("?"))).toEqual({ kept: true, opened: true });
  });

  // A box is never inside a keyed list, but a press in one is the person's
  // wherever it lands, so `?` types `?`. See ADR-0022.
  it("types ? in a box, and opens nothing", () => {
    noDialog();
    expect(hear(keydown("?", true))).toEqual({ kept: false, opened: false });
  });

  // The guide is a dialog, and a press under a dialog is not the page's.
  it("opens nothing while a dialog is up", () => {
    vi.stubGlobal("document", { querySelector: () => ({}) });
    expect(hear(keydown("?"))).toEqual({ kept: false, opened: false });
  });
});

/** The acts one set of lines names, in the order the guide draws them. */
function acts(lines: GuideLine[]): ActionName[] {
  return lines.map((one) => one.act);
}

describe("the acts a page gives the guide", () => {
  it("names the org board's keys, the step among them", () => {
    expect(acts(BOARD_LINES)).toEqual([
      "next",
      "prev",
      "open",
      "up",
      "down",
      "forward",
      "back",
      "finish",
      "clear",
    ]);
  });

  // The list hands over its own acts. The guide adds `n` where the page draws
  // a box, and `?` everywhere.
  it("adds the box's key where the page draws one, and its own key", () => {
    expect(acts(guideFor(BOARD_LINES, true)).slice(-3)).toEqual(["add", "clear", "guide"]);
    expect(acts(guideFor(BOARD_LINES, false))).not.toContain("add");
  });

  it("names every key of plan mode", () => {
    expect(acts(guideLines(ALL_ACTS))).toEqual([
      "next",
      "prev",
      "open",
      "plan",
      "up",
      "down",
      "top",
      "bottom",
      "forward",
      "back",
      "finish",
      "clear",
    ]);
  });

  it("names no step on the unified board, whose order is derived", () => {
    const board = acts(guideLines(NO_STEP_ACTS));
    expect(board).toContain("plan");
    expect(board).not.toContain("up");
    expect(board).not.toContain("top");
  });

  it("names no plan on a day read back", () => {
    expect(acts(guideLines(READ_ACTS))).not.toContain("plan");
  });

  it("names the plan key by the verbs the page draws", () => {
    const plan = guideLines(ALL_ACTS, { pick: "Pick", drop: "Unpick" }).find(
      (one) => one.act === "plan",
    );
    expect(plan?.label).toBe("Pick or unpick");
  });
});

describe("the guide", () => {
  const html = renderToStaticMarkup(<KeyGuide lines={guideFor(BOARD_LINES, true)} close={() => {}} />);

  it("is a dialog with a name", () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="key-guide"');
  });

  it("names each act and draws its key the way a hint draws it", () => {
    expect(html).toContain(KEY_MAP.up.label);
    expect(html).toContain("⇧K");
    expect(html).toContain("Esc");
    expect(html).toContain("?");
  });
});
