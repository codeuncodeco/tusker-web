import { expect, it } from "vitest";

import {
  continueList,
  handleDescEditKey,
  handleEditorPaste,
  linkSelection,
  type EditorField,
} from "../app/editor";

// A textarea stand-in: the text and the selection are the whole contract the
// helpers use, so every case below runs with no DOM.
const ta = (value: string, start = value.length, end = start): EditorField => ({
  value,
  selectionStart: start,
  selectionEnd: end,
});

/** The field's text with the selection marked, so a caret case reads at a glance. */
const show = (field: EditorField) =>
  field.value.slice(0, field.selectionStart) + "|" + field.value.slice(field.selectionEnd);

/** A key press on the field, with the modifiers a case names. */
const key = (
  field: EditorField,
  pressed: string,
  mods: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
) => ({
  currentTarget: field,
  key: pressed,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
});

/** A paste of one string onto the field. */
const paste = (field: EditorField, pasted: string) => ({
  currentTarget: field,
  clipboardData: { getData: () => pasted },
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
});

it("link on a selected url puts the caret in the empty label", () => {
  const x = ta("see https://x.com", 4, 17);
  linkSelection(x);
  expect(show(x)).toBe("see [|](https://x.com)");
});

it("link on selected text selects the url placeholder", () => {
  const x = ta("read the docs", 9, 13);
  linkSelection(x);
  expect(x.value).toBe("read the [docs](url)");
  expect(x.value.slice(x.selectionStart, x.selectionEnd)).toBe("url");
});

it("enter continues a bullet list", () => {
  const x = ta("- one");
  expect(continueList(x)).toBe(true);
  expect(show(x)).toBe("- one\n- |");
});

it("enter continues a checkbox list, unchecked", () => {
  const x = ta("  - [x] done");
  expect(continueList(x)).toBe(true);
  expect(show(x)).toBe("  - [x] done\n  - [ ] |");
});

it("enter on an empty item ends the list", () => {
  const x = ta("- one\n- ");
  expect(continueList(x)).toBe(true);
  expect(show(x)).toBe("- one\n|");
});

it("enter outside a list is left alone", () => {
  const x = ta("just prose");
  expect(continueList(x)).toBe(false);
  expect(x.value).toBe("just prose");
});

it("pasting a url over a selection makes a link", () => {
  const x = ta("read the docs", 9, 13);
  const event = paste(x, "https://example.com");
  handleEditorPaste(event);
  expect(event.prevented).toBe(true);
  expect(x.value).toBe("read the [docs](https://example.com)");
});

it("pasting a non-url is left to the browser", () => {
  const x = ta("read the docs", 9, 13);
  const event = paste(x, "manual");
  handleEditorPaste(event);
  expect(event.prevented).toBe(false);
  expect(x.value).toBe("read the docs");
});

it("pasting a url with nothing selected is left to the browser", () => {
  const x = ta("read the docs");
  const event = paste(x, "https://example.com");
  handleEditorPaste(event);
  expect(event.prevented).toBe(false);
  expect(x.value).toBe("read the docs");
});

it("tab indents the current line", () => {
  const x = ta("- one");
  const event = key(x, "Tab");
  handleDescEditKey(event);
  expect(event.prevented).toBe(true);
  expect(x.value).toBe("  - one");
});

it("shift-tab outdents", () => {
  const x = ta("  - one");
  handleDescEditKey(key(x, "Tab", { shiftKey: true }));
  expect(x.value).toBe("- one");
});

it("cmd+k in the description editor makes a link", () => {
  const x = ta("docs", 0, 4);
  const event = key(x, "k", { metaKey: true });
  handleDescEditKey(event);
  expect(event.prevented).toBe(true);
  expect(x.value).toBe("[docs](url)");
});

// Emphasis is gone, so cmd+B must fall through to the browser rather than being
// silently swallowed by the editor.
it("cmd+b is no longer intercepted", () => {
  const x = ta("loud", 0, 4);
  const event = key(x, "b", { metaKey: true });
  handleDescEditKey(event);
  expect(event.prevented).toBe(false);
  expect(x.value).toBe("loud");
});

it("cmd+enter is not swallowed as list continuation", () => {
  const x = ta("- one");
  const event = key(x, "Enter", { metaKey: true });
  handleDescEditKey(event);
  expect(event.prevented).toBe(false);
  expect(x.value).toBe("- one");
});
