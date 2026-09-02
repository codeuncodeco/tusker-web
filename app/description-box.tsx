/**
 * The description box: the read view, and the textarea that edits it.
 *
 * The textarea is uncontrolled. The keys in `editor.ts` write the text and move
 * the caret in place, and a re-render mid-edit would throw that caret away, so
 * React holds no value while a person types. Leaving the box saves it: the
 * value goes to the server on blur, and the box shuts.
 *
 * Editing needs script. The read view does not, and neither does a tick, so a
 * page with no script still shows the description and still ticks its boxes.
 */

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { DescriptionView } from "./description-view";
import { handleDescEditKey, handleEditorPaste } from "./editor";

export function DescriptionBox({ text }: { text: string }) {
  const save = useFetcher();
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  // The text the last save carried, while it is in flight. The loader has not
  // answered yet, and a description that snaps back to the old words for half
  // a second reads as an edit that did not land.
  const sent = save.formData?.get("description");
  const shown = typeof sent === "string" ? sent : text;

  // The box takes focus as it opens, with the caret after the text: a person
  // who clicks Edit is there to type.
  useEffect(() => {
    const field = box.current;
    if (!editing || !field) return;
    field.focus();
    field.selectionStart = field.selectionEnd = field.value.length;
  }, [editing]);

  if (!editing) {
    return (
      <>
        <DescriptionView text={shown} />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="self-start rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
        >
          Edit
        </button>
      </>
    );
  }

  return (
    <save.Form method="post" className="flex flex-col items-start gap-2">
      <input type="hidden" name="intent" value="describe" />
      <textarea
        ref={box}
        name="description"
        // Uncontrolled on purpose: the keys write the field in place. It opens
        // on the text the last save carried, so re-opening the box while that
        // save is in flight does not give back the words it replaced.
        defaultValue={shown}
        rows={8}
        aria-label="Description"
        className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
        onKeyDown={(event) => {
          // Tab indents, so Tab cannot be the way out. Escape is: it blurs the
          // box, and the blur saves, so a keyboard leaves by one press.
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
      {/* The way out, on screen. It blurs the box, and the blur is what saves,
          so there is one save path and not two. The press keeps the focus it
          would otherwise steal, or the box would shut under the click. Escape
          is the same way out from the keyboard. */}
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => box.current?.blur()}
        className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
      >
        Done
      </button>
    </save.Form>
  );
}
