/**
 * Drag between and inside lists, with the drop drawn before it is made: the
 * cards make room where the dragged card will land, and a faded copy holds
 * that place. Both boards and plan mode draw their drag with this, so the
 * gesture is one gesture wherever it is offered. See ADR-0025.
 *
 * It is `@dnd-kit/sortable`, the pattern Payload's admin uses for a row drag.
 * A mouse drags once it has moved a few pixels, so a click on a card still
 * places the cursor. A finger drags after a short hold, so a swipe still
 * scrolls the column. No key drags: the keys are the list keys, and they do not
 * change.
 *
 * The page hands this the lists it draws and gets back the lists to draw,
 * which are the same lists until a drag moves a card. A drop calls `onDrop`
 * with the list the card landed in and that list's new order, and the page
 * says what the order means: the org board names the card below, the unified
 * board names a card of the same org, and the plan names a row.
 */

import {
  closestCorners,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { crossOver, listOf, settle, type Lists } from "./drag";

/** One drop: the card, the list it landed in, and that list's new order. */
export type Drop = { id: string; list: string; order: string[] };

export function DragLists({
  lists,
  onDrop,
  busy,
  overlay,
  children,
}: {
  /** The ids the page draws, by list. */
  lists: Lists;
  onDrop: (drop: Drop) => void;
  /**
   * True while the drop's post is in flight. The page keeps the dropped order
   * until the post comes back, so the card does not jump home and back.
   */
  busy: boolean;
  /** What follows the pointer: a copy of the card being dragged. */
  overlay: (id: string) => ReactNode;
  /** Draws the lists, in the order the drag has them now. */
  children: (shown: Lists) => ReactNode;
}) {
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  // The lists while a drag is under way, and after a drop until its post comes
  // back. Null is the page's own lists.
  const [held, setHeld] = useState<Lists | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  // The reload after a drop draws the order the server stored, so the held
  // copy goes once the drop's post is done. A post that has not started yet
  // is not done, so the drop waits for it to start. A page's keys post on the
  // same fetcher, and a post the drop did not make clears nothing: it would
  // snap a drag back mid-way.
  const drop = useRef<"none" | "sent" | "flying">("none");
  useEffect(() => {
    if (busy && drop.current === "sent") drop.current = "flying";
    if (busy || drop.current !== "flying") return;
    drop.current = "none";
    setHeld(null);
  }, [busy]);

  const shown = held ?? lists;

  function onDragStart(event: DragStartEvent) {
    setActive(String(event.active.id));
    setHeld(lists);
  }

  function onDragOver({ active: dragged, over }: DragOverEvent) {
    if (!over) return;
    const translated = dragged.rect.current.translated;
    const below = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
    setHeld((now) => crossOver(now ?? lists, String(dragged.id), String(over.id), below));
  }

  function onDragEnd({ active: dragged, over }: DragEndEvent) {
    setActive(null);
    const card = String(dragged.id);
    if (!over || !held) return setHeld(null);

    const ended = settle(held, card, String(over.id));
    const list = listOf(ended, card);
    const order = list === null ? [] : ended[list];
    // A card let go where it started writes nothing.
    if (list === null || (list === listOf(lists, card) && order.indexOf(card) === lists[list].indexOf(card))) {
      return setHeld(null);
    }
    setHeld(ended);
    drop.current = "sent";
    onDrop({ id: card, list, order });
  }

  const onDragCancel = useCallback(() => {
    setActive(null);
    setHeld(null);
  }, []);

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children(shown)}
      <DragOverlay>{active ? overlay(active) : null}</DragOverlay>
    </DndContext>
  );
}

/**
 * One list a card can be dropped into, drawn as the `<ul>` that holds its
 * cards. It takes a drop on its empty part as well as on a card, so an empty
 * column is a place to land.
 *
 * `props` is what the page puts on the list element, the keyed list's ref
 * among them, so both refs go on the one element. See ADR-0022.
 */
export function DropList({
  id,
  ids,
  props,
  className,
  children,
}: {
  /** The list's own id: a column's status, or a group's key. */
  id: string;
  /** The cards it holds, in the order they are drawn. */
  ids: string[];
  props?: { ref?: (node: HTMLElement | null) => void } & HTMLAttributes<HTMLUListElement>;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  const bind = props?.ref;
  const ref = useCallback(
    (node: HTMLUListElement | null) => {
      setNodeRef(node);
      bind?.(node);
    },
    [setNodeRef, bind],
  );

  return (
    <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
      <ul {...props} ref={ref} className={className}>
        {children}
      </ul>
    </SortableContext>
  );
}

/**
 * What one card needs to drag: its ref, the style that slides it out of the
 * way, and the handlers that start the drag. The card being dragged is drawn
 * faded where it will land, and the overlay follows the pointer.
 */
export function useDragItem(id: string, disabled = false) {
  const { setNodeRef, transform, transition, listeners, isDragging } = useSortable({ id, disabled });
  return {
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    // No `attributes`: they would make every card a tab stop and a button,
    // and the list, not the card, holds the focus and the keys. See ADR-0022.
    listeners: disabled ? {} : listeners,
    dragging: isDragging,
  };
}

/**
 * The copy of a card that follows the pointer. It carries the title and
 * nothing else: the card itself stays in the list, faded, where it will land.
 */
export function DragCopy({ title }: { title: string }) {
  return (
    <div className="cursor-grabbing rounded border border-fg bg-surface p-3 shadow-md">{title}</div>
  );
}
