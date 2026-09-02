/**
 * The quick-add box the cross-org pages carry.
 *
 * The org board's box needs no org: the org is the page, and the column is the
 * only choice left. A cross-org page holds no org, so the box names one. It
 * starts at the personal org every time, and a team org draws a chip for as
 * long as the box holds it, because the placeholder goes away at the first
 * keystroke, which is when the risk starts. See ADR-0012.
 *
 * The unified board puts one of these on every column, and the column names
 * the status. Plan mode puts one at the top and names none: an add there is a
 * pick, and a pick is live work.
 */

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { useAddingTo } from "./adding";
import type { Status } from "./board";
import type { OrgHeld } from "./current-org";
import { fieldClass } from "./forms";
import { isPagePress } from "./keys";
import { QuickAddBox, useQuickAddDraft } from "./quick-add";
import type { Added } from "./unified";
import type { Acted } from "./unified-actions.server";

/** What an act of this box answers with. A redirect never reaches the browser. */
type Answer = Exclude<Acted, Response>;

/**
 * The box, or nothing for a person who belongs to no org at all.
 *
 * `n` focuses the title and Escape gives the list its keys back, so the page
 * stays keyboard first with a text box on it. A page with several boxes gives
 * the key to one of them, because one key names one box.
 */
export function UnifiedAdd({
  orgs,
  status,
  label = "Add a task",
  hotkey = true,
}: {
  orgs: OrgHeld[];
  /** The column the box files into, where the page draws one per column. */
  status?: Status;
  /** What the empty box says, and what a screen reader reads. */
  label?: string;
  /** True for the one box on the page that `n` focuses. */
  hotkey?: boolean;
}) {
  const add = useFetcher<Answer>();
  const undo = useFetcher();
  const [picked, pick] = useAddingTo();

  // The box keeps the words, so an undo can give them back.
  const draft = useQuickAddDraft();
  // The last add, until the next one, the dismiss or the end of the page.
  const [last, setLast] = useState<Added | null>(null);
  // Counts the undos, so each one puts the person back on the picker.
  const [undone, setUndone] = useState(0);

  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLSelectElement>(null);

  // Every person has a personal org, and it is first in the set. A person who
  // belongs to nothing at all has no box to draw.
  const personal = orgs[0];
  const filing = orgs.find((org) => org.slug === picked) ?? personal;
  const answer = add.data;
  const error = answer && "error" in answer ? answer.error : null;

  // An add empties the box and raises the undo line. The pick stays: a person
  // adding a second task to a team org named it once.
  useEffect(() => {
    if (add.state !== "idle" || !answer || !("added" in answer)) return;
    setLast(answer.added);
    draft.clear();
  }, [add.state, answer, draft.clear]);

  useEffect(() => {
    if (!hotkey) return;

    function onKey(event: KeyboardEvent) {
      if (!isPagePress(event) || event.key !== "n") return;
      box.current?.focus();
      event.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);

  // The picker takes the focus a re-file needs, and the title where a person
  // has only their personal org and so has no picker.
  useEffect(() => {
    if (undone === 0) return;
    (picker.current ?? box.current)?.focus();
  }, [undone]);

  if (!personal) return null;

  /** Takes the add back and gives the box the words and the mark again. */
  function refile(one: Added) {
    // One add is one act, so the undo names every row it made in one post.
    const form = new FormData();
    form.append("intent", "undo");
    form.append("slug", one.slug);
    for (const id of one.ids) form.append("id", id);
    undo.submit(form, { method: "post" });

    setLast(null);
    draft.setTitle(one.text);
    draft.setDecides(one.decides);
    // A person undoes when the org was wrong, so the picker starts over.
    pick(null);
    setUndone((count) => count + 1);
  }

  return (
    <section className="flex flex-col gap-2">
      <QuickAddBox
        form={add.Form}
        label={label}
        draft={draft}
        error={error}
        titleRef={box}
        // Escape leaves the box, and the list gets `j`, `k` and the rest back.
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          (event.target as HTMLElement).blur();
        }}
        fields={
          <>
            {/* The column the box sits on, where the page draws one per
                column. Plan mode names none, and the add lands in To do. */}
            {status ? <input type="hidden" name="status" value={status} /> : null}
            {/* A person with only their personal org has no choice to make, so
                the org is a hidden field rather than a picker. */}
            {orgs.length > 1 ? null : <input type="hidden" name="slug" value={personal.slug} />}
          </>
        }
        chip={
          /* The chip that names a team org, because a task filed in one is on
             every member's board. The personal org stays quiet. */
          filing.kind === "team" ? (
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-500">
              Adding to {filing.name}
            </p>
          ) : null
        }
        picker={
          orgs.length > 1 ? (
            <select
              ref={picker}
              name="slug"
              value={filing.slug}
              onChange={(event) => pick(event.target.value)}
              aria-label="Add to org"
              className={fieldClass}
            >
              {orgs.map((org) => (
                <option key={org.slug} value={org.slug}>
                  {org.name}
                </option>
              ))}
            </select>
          ) : null
        }
      />

      {last ? (
        <UndoLine
          added={last}
          org={orgs.find((org) => org.slug === last.slug)?.name ?? last.slug}
          undo={refile}
          dismiss={() => setLast(null)}
        />
      ) : null}
    </section>
  );
}

/**
 * The line one add leaves behind. It counts what the add made, because a
 * pasted list is one act with several rows in it. It has no timer: it stays
 * until the next add, the dismiss, or the end of the page.
 */
function UndoLine({
  added,
  org,
  undo,
  dismiss,
}: {
  added: Added;
  /** The org the task landed in, named as a person reads it. */
  org: string;
  undo: (one: Added) => void;
  dismiss: () => void;
}) {
  return (
    <p
      role="status"
      className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400"
    >
      <span className="grow">
        {added.ids.length === 1 ? "Added" : `Added ${added.ids.length} tasks`} to {org}
      </span>
      <button type="button" onClick={() => undo(added)} className="underline">
        Undo
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="underline">
        Dismiss
      </button>
    </p>
  );
}
