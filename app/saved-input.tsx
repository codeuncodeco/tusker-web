/**
 * A one-line box that saves when it is left.
 *
 * The box draws the value the page holds until a person focuses it. From then
 * until they leave, it draws what they type, and a re-render from a post in
 * flight does not take the words out from under the caret. Leaving it saves a
 * changed value, and `Enter` leaves it. `Esc` leaves it too, and puts the held
 * value back without a post.
 *
 * A date box posts nothing while it holds half a date, and neither does a box
 * that may not be empty when it is emptied: both put the held value back. A
 * refused post is undone the same way, because the box then draws the server's
 * value again. See #204.
 *
 * With no script it is a plain named box in the page's one form, and the
 * form's Save posts it.
 */

import { useRef, useState } from "react";

export function SavedInput({
  value,
  onSave,
  required = false,
  type = "text",
  ...box
}: {
  /** The value the page holds, with any post in flight laid over it. */
  value: string;
  onSave: (value: string) => void;
  /** True for a box that cannot be left empty, as the title. */
  required?: boolean;
  type?: "text" | "date";
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "type" | "onChange">) {
  const [draft, setDraft] = useState<string | null>(null);
  // Set by `Esc`, so the blur it makes puts the value back and posts nothing.
  const dropped = useRef(false);

  return (
    <input
      {...box}
      type={type}
      required={required}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        // The box sits in the page's one form, so `Enter` would post the whole
        // task. It leaves the box instead, and leaving is what saves.
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        // The press stays on the box, so the page's `Esc` does not also go
        // back to the list. See `isPagePress`.
        if (event.key === "Escape") {
          event.preventDefault();
          dropped.current = true;
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const typed = draft ?? value;
        const keep =
          !dropped.current &&
          !event.currentTarget.validity.badInput &&
          !(required && typed.trim() === "") &&
          typed !== value;
        dropped.current = false;
        setDraft(null);
        if (keep) onSave(typed);
      }}
    />
  );
}
