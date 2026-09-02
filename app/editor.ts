/**
 * The textarea editing behaviours: what the description box does with the text
 * a person types.
 *
 * Every helper mutates the textarea in place rather than going through a
 * re-render. The field's value is saved by its own handler, on blur, so a
 * re-render mid-edit would throw the caret away. Keeping the behaviours in one
 * module means a second box binds the same keys rather than its own, and means
 * the keys can be exercised with no DOM: a plain object with a value and a
 * selection is the whole contract.
 *
 * `isUrl` comes from `markdown.ts`, so the editor and the renderer hold one
 * idea of what a link is.
 */

import { isUrl } from "./markdown";

/**
 * What the helpers need of a textarea: the text, and where the caret sits.
 * `HTMLTextAreaElement` answers this, and so does the stub the tests pass.
 */
export type EditorField = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

/**
 * What the helpers need of a key press. React's `KeyboardEvent` answers it,
 * because `currentTarget` is the textarea the handler sits on.
 */
export type EditorKeyEvent = {
  currentTarget: EditorField;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault(): void;
};

/** What the helpers need of a paste. React's `ClipboardEvent` answers it. */
export type EditorPasteEvent = {
  currentTarget: EditorField;
  clipboardData: { getData(kind: string): string } | null;
  preventDefault(): void;
};

/**
 * Replace a range of the text and put the caret somewhere sensible.
 *
 * Like every helper here it writes in place: the value is saved by the field's
 * own handler, on blur, so nothing re-renders mid-edit and loses the caret.
 */
export function spliceText(
  field: EditorField,
  start: number,
  end: number,
  insert: string,
  caret?: number,
): void {
  field.value = field.value.slice(0, start) + insert + field.value.slice(end);
  const pos = caret == null ? start + insert.length : caret;
  field.selectionStart = field.selectionEnd = pos;
}

/**
 * Cmd or Ctrl and K — turn the selection into a link.
 *
 * A selected URL becomes the target, with the caret in the empty label.
 * Anything else becomes the label, with the selection on a `url` placeholder,
 * ready to be typed or pasted over.
 */
export function linkSelection(field: EditorField): void {
  const { selectionStart: start, selectionEnd: end, value } = field;
  const selected = value.slice(start, end);
  if (isUrl(selected)) {
    spliceText(field, start, end, `[](${selected})`, start + 1);
    return;
  }
  const label = selected || "link";
  spliceText(field, start, end, `[${label}](url)`);
  field.selectionStart = start + label.length + 3;
  field.selectionEnd = field.selectionStart + 3;
}

/**
 * Enter inside a list item continues the list at the same indent, and keeps the
 * checkbox marker. Enter on an empty item ends the list: the marker goes, and
 * the caret stays on a blank line.
 *
 * Returns true when it handled the key.
 */
export function continueList(field: EditorField): boolean {
  if (field.selectionStart !== field.selectionEnd) return false;
  const pos = field.selectionStart;
  const lineStart = field.value.lastIndexOf("\n", pos - 1) + 1;
  const item = field.value.slice(lineStart, pos).match(/^(\s*)([-*])\s+(\[[ xX]\]\s+)?(.*)$/);
  if (!item) return false;
  const [, white, bullet, box, rest] = item;
  if (!rest.trim()) {
    spliceText(field, lineStart, pos, "");
    return true;
  }
  spliceText(field, pos, pos, `\n${white}${bullet} ${box ? "[ ] " : ""}`);
  return true;
}

/**
 * Pasting a URL over a selection wraps the selection as a link rather than
 * replacing it — the behaviour everyone now has in their fingers. A paste of
 * anything else, or onto no selection, is left to the browser.
 */
export function handleEditorPaste(event: EditorPasteEvent): void {
  const field = event.currentTarget;
  if (field.selectionStart === field.selectionEnd) return;
  const pasted = event.clipboardData?.getData("text/plain") || "";
  if (!isUrl(pasted)) return;
  event.preventDefault();
  const { selectionStart: start, selectionEnd: end } = field;
  const selected = field.value.slice(start, end);
  spliceText(field, start, end, `[${selected}](${pasted.trim()})`);
}

/**
 * The formatting shortcuts a box carries. Cmd or Ctrl and K is the only one
 * left: emphasis went with the renderer pass that drew it. Returns true when
 * the key was consumed.
 */
export function handleMarkKeys(event: EditorKeyEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  if (event.key.toLowerCase() !== "k") return false;
  linkSelection(event.currentTarget);
  event.preventDefault();
  return true;
}

/**
 * Move the lines the selection touches two spaces right, or, when `outdent` is
 * true, up to two spaces left. The selection still covers the same words after
 * the move, because it shifts by what the lines gave or took.
 */
function indentSelection(field: EditorField, outdent: boolean): void {
  const value = field.value;
  const selStart = field.selectionStart;
  const selEnd = field.selectionEnd;
  const firstLineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  const before = value.slice(0, firstLineStart);
  const region = value.slice(firstLineStart, selEnd);
  const after = value.slice(selEnd);

  // The end of the selection moves by what every line gave or took, and its
  // start moves by what the first line alone did.
  let delta = 0;
  let firstDelta = 0;
  const lines = region.split("\n").map((line, at) => {
    if (outdent) {
      const lead = line.match(/^( {1,2}|\t)/);
      const removed = lead ? lead[0].length : 0;
      if (at === 0) firstDelta = -removed;
      delta -= removed;
      return line.slice(removed);
    }
    if (at === 0) firstDelta = 2;
    delta += 2;
    return "  " + line;
  });

  field.value = before + lines.join("\n") + after;
  field.selectionStart = Math.max(firstLineStart, selStart + firstDelta);
  field.selectionEnd = selEnd + delta;
}

/**
 * The whole key map of the description box: Cmd or Ctrl and K makes a link,
 * Enter continues a list, and Tab or Shift+Tab indents or outdents the selected
 * lines by two spaces.
 */
export function handleDescEditKey(event: EditorKeyEvent): void {
  if (handleMarkKeys(event)) return;
  if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
    if (continueList(event.currentTarget)) event.preventDefault();
    return;
  }
  if (event.key !== "Tab") return;
  event.preventDefault();
  indentSelection(event.currentTarget, event.shiftKey);
}
