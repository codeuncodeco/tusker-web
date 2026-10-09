/**
 * The quick-add box the cross-org pages carry.
 *
 * The org board's box needs no org: the org is the page, and the column is the
 * only choice left. A cross-org page holds no org, so the box names one. It
 * starts with no org picked every time, and refuses an add until one is. The
 * picked org draws a chip for as long as the box holds it, because the
 * placeholder goes away at the first keystroke, which is when the risk starts.
 * A person in one org has no picker and no chip: the org is implied. See
 * ADR-0012 and ADR-0024.
 *
 * The unified board puts one of these on every column, and the column names
 * the status. Plan mode puts one at the top and names none: an add there is a
 * pick, and a pick is live work.
 */

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { useAddingTo } from "./adding";
import { AssigneePicker } from "./assignee-picker";
import type { Assignee } from "./assignees";
import type { Status } from "./board";
import type { OrgHeld } from "./current-org";
import { smallFieldClass } from "./forms";
import { OrgChip } from "./org-chip";
import { QuickAddBox, useAddKey, useQuickAddDraft } from "./quick-add";
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
  members,
  status,
  label = "Add a task",
  addKey = true,
}: {
  orgs: OrgHeld[];
  /**
   * The members of every org of two or more, keyed by slug. The page reads
   * them with the orgs, so the picker draws the moment the org pick changes
   * and no fetcher runs between. An org of one is not keyed and draws no
   * picker.
   */
  members: Record<string, Assignee[]>;
  /** The column the box files into, where the page draws one per column. */
  status?: Status;
  /** What the empty box says, and what a screen reader reads. */
  label?: string;
  /** True for the one box on the page that `n` focuses. */
  addKey?: boolean;
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

  // A person in one org files there and picks nothing. A person in several
  // files nowhere until they pick, because no org is safe to guess: an org of
  // one today is not private tomorrow. See ADR-0024.
  const several = orgs.length > 1;
  const filing = several ? (orgs.find((org) => org.slug === picked) ?? null) : (orgs[0] ?? null);
  const answer = add.data;
  const error = answer && "error" in answer ? answer.error : null;

  // An add empties the box and raises the undo line. The pick stays: a person
  // adding a second task to one org named it once.
  useEffect(() => {
    if (add.state !== "idle" || !answer || !("added" in answer)) return;
    setLast(answer.added);
    draft.clear();
  }, [add.state, answer, draft.clear]);

  useAddKey(box, addKey);

  // An assignee id belongs to one org's membership, so a set carried across a
  // pick would name people the new org does not hold. The undo resets the pick
  // to no org, and the set goes with it by this same rule.
  //
  // The set is emptied while the render that changed the org is still running,
  // not in an effect after it, so no frame ever draws one org's picker holding
  // another org's ids.
  const filingSlug = filing?.slug ?? null;
  const [pickedFor, setPickedFor] = useState(filingSlug);
  if (pickedFor !== filingSlug) {
    setPickedFor(filingSlug);
    draft.setAssignees([]);
  }

  // The picker takes the focus a re-file needs, and the title where a person
  // has one org and so has no picker.
  useEffect(() => {
    if (undone === 0) return;
    (picker.current ?? box.current)?.focus();
  }, [undone]);

  if (orgs.length === 0) return null;

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
            {/* A person with one org has no choice to make, so the org is a
                hidden field rather than a picker. */}
            {several || !filing ? null : <input type="hidden" name="slug" value={filing.slug} />}
          </>
        }
        chip={
          /* The chip that names the picked org, because a task filed in the
             wrong one is on another org's board. One org needs no name. */
          several && filing ? (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              Adding to <OrgChip org={filing} />
            </p>
          ) : null
        }
        picker={
          <>
            {several ? (
              <select
                ref={picker}
                name="slug"
                // Empty until a pick, and required, so the browser refuses an
                // add that names no org. The action refuses it as well.
                required
                value={filing?.slug ?? ""}
                onChange={(event) => pick(event.target.value)}
                aria-label="Add to org"
                className={smallFieldClass}
              >
                <option value="" disabled>
                  Pick an org
                </option>
                {orgs.map((org) => (
                  <option key={org.slug} value={org.slug}>
                    {org.name}
                  </option>
                ))}
              </select>
            ) : null}

            {/* The members of the org the pick holds. An org of one is not
                keyed, and no pick is no org, so neither draws a picker and
                the task is unassigned. */}
            <AssigneePicker
              members={filing ? (members[filing.slug] ?? []) : []}
              picked={draft.assignees}
              onPick={draft.setAssignees}
            />
          </>
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
      className="flex items-center gap-3 text-muted"
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
