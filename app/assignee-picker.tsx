/**
 * The assignee picker of the quick-add box: one avatar per member of the org
 * the box files into, each a toggle. One click holds a member, a second lets
 * them go. Nothing opens and nothing has to be closed.
 *
 * The person who types a task on a team board usually knows who does it, so
 * the box says it while the thought is there rather than sending them to the
 * task page after. It posts the `assignee` field the task page posts, so one
 * reader answers for both. See ADR-0013.
 *
 * The set starts empty. Unassigned is a state to look at, not a gap to hide.
 *
 * An org of one member draws no picker, so an empty list draws
 * nothing at all.
 */

import type { Assignee } from "./assignees";
import { Avatar } from "./initials";

export function AssigneePicker({
  members,
  picked,
  onPick,
}: {
  /** The members of the org the box files into. Empty draws no picker. */
  members: Assignee[];
  /** The ids the box holds, in the order the member list has them. */
  picked: string[];
  onPick: (ids: string[]) => void;
}) {
  if (members.length === 0) return null;

  const held = new Set(picked);
  const holders = members.filter((member) => held.has(member.id));

  /** Holds or lets go of one member, keeping the member list's order. */
  function toggle(id: string) {
    const next = held.has(id) ? picked.filter((one) => one !== id) : [...picked, id];
    onPick(members.filter((member) => next.includes(member.id)).map((member) => member.id));
  }

  return (
    <div
      role="group"
      aria-label={
        holders.length === 0
          ? "Assign to a member"
          : `Assigned to ${holders.map((one) => one.name).join(", ")}`
      }
      className="flex max-w-56 shrink-0 items-center gap-1 overflow-x-auto py-0.5"
    >
      {/* The set travels as hidden fields, so the toggles post nothing of
          their own. */}
      {picked.map((id) => (
        <input key={id} type="hidden" name="assignee" value={id} />
      ))}

      {members.map((member) => {
        const on = held.has(member.id);
        return (
          <button
            key={member.id}
            type="button"
            aria-pressed={on}
            aria-label={member.name}
            title={on ? `${member.name}: held. Click to let go.` : `Assign to ${member.name}`}
            onClick={() => toggle(member.id)}
            className={`press flex shrink-0 rounded-full ${on ? "" : "opacity-40 grayscale hover:opacity-80 hover:grayscale-0"}`}
          >
            <span key={on ? "on" : "off"} className={`flex rounded-full ${on ? "motion-safe:animate-pop" : ""}`}>
              <Avatar person={member} size="md" className={on ? "" : "border-dashed"} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
