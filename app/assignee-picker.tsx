/**
 * The assignee picker of the quick-add box: a button that opens a popover of
 * checkboxes, one per member of the org the box files into.
 *
 * The person who types a task on a team board usually knows who does it, so
 * the box says it while the thought is there rather than sending them to the
 * task page after. It posts the `assignee` field the task page posts, so one
 * reader answers for both. See ADR-0013.
 *
 * The set starts empty. Unassigned is a state to look at, not a gap to hide.
 *
 * A personal org holds one member and draws no picker, so an empty list draws
 * nothing at all.
 */

import { useEffect, useRef, useState } from "react";

import type { Assignee } from "./assignees";
import { smallFieldClass } from "./forms";

/**
 * The popover's width, in px. The side it hangs from is decided before it
 * draws, so the width is a number here and not a class.
 */
const POPOVER_WIDTH = 224;

/** The gap the popover keeps from the edge of the window, in px. */
const EDGE_GAP = 8;

/**
 * The edge of the button the popover hangs from.
 *
 * It hangs from the right edge by default, because the button sits at the
 * right of the quick-add row and a popover that grows left stays over the
 * box. In the leftmost column there is no room to the left, so the popover
 * hangs from the left edge instead. Where neither side fits, the right edge
 * wins: one rule, and the wider window is the fix.
 */
export function popoverSide(
  button: { left: number; right: number },
  width: number,
  viewport: number,
): "right" | "left" {
  if (button.right - width >= EDGE_GAP) return "right";
  return button.left + width <= viewport - EDGE_GAP ? "left" : "right";
}

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
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"right" | "left">("right");
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  // A pointer anywhere else closes the popover, as it does for a menu. The
  // button is its own toggle, so a press on it is not this.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const at = event.target as Node;
      if (popover.current?.contains(at) || button.current?.contains(at)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (members.length === 0) return null;

  const held = new Set(picked);
  const holders = members.filter((member) => held.has(member.id));

  /** Ticks or unticks one box, keeping the member list's order. */
  function toggle(id: string) {
    const next = held.has(id) ? picked.filter((one) => one !== id) : [...picked, id];
    onPick(members.filter((member) => next.includes(member.id)).map((member) => member.id));
  }

  /** Closes the popover and gives the focus back to the button that opened it. */
  function close() {
    setOpen(false);
    button.current?.focus();
  }

  return (
    <div
      onKeyDown={(event) => {
        // Escape shuts the popover and gives the focus back to the button. The
        // box reads Escape as "leave the field", and one press means one thing.
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        close();
      }}
      className="relative"
    >
      {/* The set travels as hidden fields, so it posts whether the popover is
          open or shut: the checkboxes below are on screen only while it is. */}
      {picked.map((id) => (
        <input key={id} type="hidden" name="assignee" value={id} />
      ))}

      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-label={
          holders.length === 0
            ? "Assign to a member"
            : `Assigned to ${holders.map((one) => one.name).join(", ")}`
        }
        onClick={() => {
          // The side is read while the button is on screen and the popover is
          // not: it draws once, on the side that fits.
          const at = open ? null : button.current?.getBoundingClientRect();
          if (at) setSide(popoverSide(at, POPOVER_WIDTH, document.documentElement.clientWidth));
          setOpen((was) => !was);
        }}
        className={`flex items-center gap-1 uppercase tracking-wide ${smallFieldClass}`}
      >
        {holders.length === 0 ? (
          <span className="normal-case tracking-normal text-muted">Assign</span>
        ) : (
          holders.map((one) => (
            <span key={one.id} aria-hidden="true" className="text-muted">
              {one.initials}
            </span>
          ))
        )}
      </button>

      {open ? (
        <div
          ref={popover}
          role="group"
          aria-label="Assignees"
          onKeyDown={(event) => {
            // Enter ticks the box it is on and never posts the add. A person
            // is picking members here, not finishing the task.
            if (event.key !== "Enter") return;
            event.preventDefault();
            const on = event.target as HTMLElement;
            if (on instanceof HTMLInputElement && on.type === "checkbox") toggle(on.value);
          }}
          style={{ width: POPOVER_WIDTH }}
          className={`absolute ${side === "right" ? "right-0" : "left-0"} z-10 mt-1 flex max-h-56 flex-col gap-1 overflow-y-auto rounded border border-border bg-surface p-2`}
        >
          {members.map((member) => (
            <label key={member.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                value={member.id}
                checked={held.has(member.id)}
                onChange={() => toggle(member.id)}
              />
              {member.name}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
