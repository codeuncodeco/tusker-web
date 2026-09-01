import { expect, it } from "vitest";

import { checkboxLines, descriptionBlocks, tickBox } from "../app/description";

it("draws a plain line inline, with the markup the renderer makes", () => {
  expect(descriptionBlocks("see https://x.com")).toEqual([
    {
      kind: "line",
      indent: 0,
      html: 'see <a href="https://x.com" target="_blank" rel="noopener noreferrer">https://x.com</a>',
    },
  ]);
});

it("keeps a blank line, so a paragraph break survives", () => {
  expect(descriptionBlocks("one\n\ntwo").map((block) => block.kind)).toEqual([
    "line",
    "blank",
    "line",
  ]);
});

it("draws a checkbox line as a box, ticked or not", () => {
  expect(descriptionBlocks("- [ ] buy rope\n- [x] pack tent")).toEqual([
    { kind: "check", box: 0, checked: false, indent: 0, html: "buy rope" },
    { kind: "check", box: 1, checked: true, indent: 0, html: "pack tent" },
  ]);
});

it("counts two spaces, or a tab, as one level of nesting", () => {
  const blocks = descriptionBlocks("- [ ] top\n  - [ ] under\n\t\t- [ ] deeper\n    words");
  expect(blocks.map((block) => ("indent" in block ? block.indent : null))).toEqual([0, 1, 2, 2]);
});

it("draws a fenced block verbatim, in one code block", () => {
  expect(descriptionBlocks("```js\nconst a = 1 < 2;\n```")).toEqual([
    { kind: "code", text: "const a = 1 < 2;" },
  ]);
});

it("a fence nobody closed still ends at the end of the text", () => {
  expect(descriptionBlocks("```\nstill open")).toEqual([{ kind: "code", text: "still open" }]);
});

it("a checkbox line inside a fence is text, not a box", () => {
  const blocks = descriptionBlocks("- [ ] real\n```\n- [ ] typed\n```\n- [ ] also real");
  expect(blocks).toEqual([
    { kind: "check", box: 0, checked: false, indent: 0, html: "real" },
    { kind: "code", text: "- [ ] typed" },
    { kind: "check", box: 1, checked: false, indent: 0, html: "also real" },
  ]);
});

it("a star bullet is a checkbox too, and the label renders inline", () => {
  expect(descriptionBlocks("* [X] run `npm test`")).toEqual([
    { kind: "check", box: 0, checked: true, indent: 0, html: "run <code>npm test</code>" },
  ]);
});

it("nothing draws for empty text", () => {
  expect(descriptionBlocks("")).toEqual([]);
});

it("checkboxLines names the toggleable lines and skips the fenced ones", () => {
  const lines = "- [ ] real\n```\n- [ ] typed\n```\n- [ ] also real".split("\n");
  expect(checkboxLines(lines)).toEqual([0, 4]);
});

it("ticking a box flips that line and leaves the rest of the text alone", () => {
  const text = "notes\n- [ ] buy rope\n- [x] pack tent";
  expect(tickBox(text, 0)).toBe("notes\n- [x] buy rope\n- [x] pack tent");
  expect(tickBox(text, 1)).toBe("notes\n- [ ] buy rope\n- [ ] pack tent");
});

it("ticking keeps the indent and the bullet the line was written with", () => {
  expect(tickBox("  * [ ] under", 0)).toBe("  * [x] under");
});

it("the Nth box on screen is the Nth toggleable line, fences skipped", () => {
  const text = "- [ ] real\n```\n- [ ] typed\n```\n- [ ] also real";
  expect(tickBox(text, 1)).toBe("- [ ] real\n```\n- [ ] typed\n```\n- [x] also real");
});

it("a box the text does not hold changes nothing", () => {
  expect(tickBox("- [ ] one", 3)).toBe(null);
});
