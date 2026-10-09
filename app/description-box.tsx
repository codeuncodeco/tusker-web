/**
 * The description box: the read view, and the textarea that edits it.
 *
 * There is no Edit button. A click on the text opens the editor, and so does
 * `E` from anywhere on the page that is not a box. A click on a checkbox still
 * ticks it, and a click on a link still follows it. An empty description draws
 * a placeholder that opens the editor. See #204.
 *
 * The textarea is uncontrolled. The keys in `editor.ts` write the text and move
 * the caret in place, and a re-render mid-edit would throw that caret away, so
 * React holds no value while a person types. Leaving the box saves it: the
 * value goes to the server on blur, and the box shuts.
 *
 * Editing in place needs script. With none, the box is a plain textarea of the
 * raw markdown in the page's one form, and the form's Save posts it with the
 * rest of the task. A box is then ticked by typing `[x]`.
 */

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { DescriptionView } from "./description-view";
import { handleDescEditKey, handleEditorPaste } from "./editor";
import { keyMark } from "./key-hint";
import { isPagePress } from "./keys";

/** The press that opens the editor. An act has a key. See ADR-0026. */
const EDIT = "e";

export function DescriptionBox({
  text,
  form,
}: {
  text: string;
  /** The id of the form the no-script textarea posts with. */
  form: string;
}) {
  const save = useFetcher();
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const { keys, hint } = keyMark(EDIT);

  // The text the last save carried, while it is in flight. The loader has not
  // answered yet, and a description that snaps back to the old words for half
  // a second reads as an edit that did not land.
  const sent = save.formData?.get("description");
  const shown = typeof sent === "string" ? sent : text;

  // The box takes focus as it opens, with the caret after the text: a person
  // who opens it is there to type.
  useEffect(() => {
    const field = box.current;
    if (!editing || !field) return;
    field.focus();
    field.selectionStart = field.selectionEnd = field.value.length;
  }, [editing]);

  // `isPagePress` keeps the press off a box and off a raised prompt, so an
  // `e` typed into the title is a letter and not an act.
  useEffect(() => {
    if (editing) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== EDIT || !isPagePress(event)) return;
      // The letter would land in the box that is about to take the focus.
      event.preventDefault();
      setEditing(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const heading = (
    <h2>
      Description
      {hint}
    </h2>
  );

  if (!editing) {
    return (
      <>
        {heading}
        {/* Read and ticked with script. With none, the textarea below stands
            in for it. */}
        <div className="noscript:hidden">
          {shown.trim() === "" ? (
            <button
              type="button"
              {...keys}
              onClick={() => setEditing(true)}
              className="self-start text-muted"
            >
              Add a description…
            </button>
          ) : (
            <div
              {...keys}
              className="cursor-text"
              onClick={(event) => {
                // A tick and a link do their own thing, and a drag that
                // selected words was a person reading, not a person editing.
                const target = event.target as Element;
                if (target.closest("a, label, input, button")) return;
                if (window.getSelection()?.toString()) return;
                setEditing(true);
              }}
            >
              <DescriptionView text={shown} />
            </div>
          )}
        </div>
        <noscript>
          <textarea
            name="description"
            form={form}
            defaultValue={text}
            rows={8}
            aria-label="Description"
            className="w-full rounded border border-border bg-surface px-3 py-2 font-mono"
          />
        </noscript>
      </>
    );
  }

  return (
    <>
      {heading}
      <save.Form method="post" className="flex flex-col items-start gap-2">
        <input type="hidden" name="intent" value="describe" />
        <textarea
          ref={box}
          name="description"
          // Uncontrolled on purpose: the keys write the field in place. It
          // opens on the text the last save carried, so re-opening the box
          // while that save is in flight does not give back the words it
          // replaced.
          defaultValue={shown}
          rows={8}
          aria-label="Description"
          className="w-full rounded border border-border bg-surface px-3 py-2 font-mono"
          onKeyDown={(event) => {
            // Tab indents, so Tab cannot be the way out. Escape is: it blurs
            // the box, and the blur saves, so a keyboard leaves by one press.
            if (event.key === "Escape") {
              event.currentTarget.blur();
              return;
            }
            handleDescEditKey(event);
          }}
          onPaste={handleEditorPaste}
          onBlur={(event) => {
            const form = event.currentTarget.form;
            // A box left as it was found writes nothing.
            if (form && event.currentTarget.value !== shown) save.submit(form);
            setEditing(false);
          }}
        />
        {/* The way out, on screen. It blurs the box, and the blur is what
            saves, so there is one save path and not two. The press keeps the
            focus it would otherwise steal, or the box would shut under the
            click. Escape is the same way out from the keyboard. */}
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => box.current?.blur()}
          className="rounded border border-border px-3 py-1"
        >
          Done
        </button>
      </save.Form>
    </>
  );
}
