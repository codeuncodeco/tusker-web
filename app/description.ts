/**
 * The block half of a task description: the line loop the inline renderer in
 * `markdown.ts` leaves to its caller.
 *
 * A description is raw text. This module cuts it into the blocks a page draws —
 * checkbox lines, fenced code, blank lines and plain lines — and flips one box
 * back in the raw text. Nothing here touches the DOM, so the same functions
 * answer on the server and in a test.
 */

import { renderInline } from "./markdown";

/** Matches a GitHub-style task-list line: "- [ ] text" / "* [x] text". */
const CHECKBOX_RE = /^(\s*)([-*])\s+\[([ xX])\]\s+(.*)$/;

/** A ``` fence, opening (optional language) or closing. */
const FENCE_RE = /^\s*```(.*)$/;

/** How deep one level of nesting draws, and the deepest a line may go. */
const MAX_INDENT = 10;

/**
 * One drawable piece of a description.
 *
 * `html` is what `renderInline` made and nothing else, so a page may draw it as
 * HTML. `text` is raw: a fenced block draws verbatim, as text.
 */
export type DescriptionBlock =
  | { kind: "code"; text: string }
  | { kind: "check"; box: number; checked: boolean; indent: number; html: string }
  | { kind: "blank" }
  | { kind: "line"; indent: number; html: string };

/**
 * Line indexes of the live checkboxes, in the order they draw. A checkbox-ish
 * line inside a fenced code block is literal text, so it is skipped — both the
 * blocks and the tick read this list, which is what keeps the Nth box on screen
 * pointing at the Nth toggleable line.
 */
export function checkboxLines(lines: string[]): number[] {
  const found: number[] = [];
  let inFence = false;
  for (let at = 0; at < lines.length; at++) {
    if (FENCE_RE.test(lines[at])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && CHECKBOX_RE.test(lines[at])) found.push(at);
  }
  return found;
}

/** Nesting depth from leading whitespace (tab = 2 spaces, 2 spaces = one level). */
function indentOf(white: string): number {
  const spaces = white.replace(/\t/g, "  ").length;
  return Math.min(Math.floor(spaces / 2), MAX_INDENT);
}

/** The description, cut into the blocks a page draws. Empty text draws nothing. */
export function descriptionBlocks(text: string): DescriptionBlock[] {
  if (!text.trim()) return [];

  const lines = text.split("\n");
  const blocks: DescriptionBlock[] = [];
  let box = 0;
  let at = 0;

  while (at < lines.length) {
    // Fenced code — swallow up to the closing fence, or to the end of the text
    // when the fence was never closed, and draw it verbatim.
    if (FENCE_RE.test(lines[at])) {
      const held: string[] = [];
      at++;
      while (at < lines.length && !FENCE_RE.test(lines[at])) held.push(lines[at++]);
      at++;
      blocks.push({ kind: "code", text: held.join("\n") });
      continue;
    }

    const line = lines[at++];
    const check = line.match(CHECKBOX_RE);
    if (check) {
      blocks.push({
        kind: "check",
        box: box++,
        checked: check[3].toLowerCase() === "x",
        indent: indentOf(check[1]),
        html: renderInline(check[4]),
      });
    } else if (line.trim() === "") {
      blocks.push({ kind: "blank" });
    } else {
      const lead = line.match(/^(\s*)/)![1];
      blocks.push({ kind: "line", indent: indentOf(lead), html: renderInline(line.slice(lead.length)) });
    }
  }

  return blocks;
}

/**
 * The description with the Nth box flipped, or null when the text holds no such
 * box. The rest of the text is untouched: only the one bracket changes.
 */
export function tickBox(text: string, box: number): string | null {
  const lines = text.split("\n");
  const at = checkboxLines(lines)[box];
  if (at === undefined) return null;

  const check = lines[at].match(CHECKBOX_RE)!;
  const checked = check[3].toLowerCase() === "x";
  lines[at] = `${check[1]}${check[2]} [${checked ? " " : "x"}] ${check[4]}`;
  return lines.join("\n");
}
