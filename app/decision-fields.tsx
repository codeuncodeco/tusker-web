/**
 * The two fields a decision is written in, and the error one refusal shows.
 *
 * Both doors take the same answer, so both draw the same fields: the prompt a
 * finished task raises, and the box on the log. See ADR-0024.
 */

import { fieldClass } from "./forms";

export function DecisionFields({
  placeholder,
  first = false,
  title = "",
  rationale = "",
  rows = 4,
  error,
}: {
  /** What the title box says while it is empty. */
  placeholder: string;
  /** True where the fields open the page, so the caret starts in the title. */
  first?: boolean;
  /** The words a refused post is putting back. */
  title?: string;
  rationale?: string;
  rows?: number;
  error?: string;
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        Title
        <input
          name="title"
          required
          autoFocus={first}
          defaultValue={title}
          placeholder={placeholder}
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        Rationale
        <textarea name="rationale" rows={rows} defaultValue={rationale} className={fieldClass} />
      </label>

      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
