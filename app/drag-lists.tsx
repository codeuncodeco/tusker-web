/**
 * Drag between and inside lists, with the drop drawn before it is made: the
 * cards make room where the dragged card will land, and a faded copy holds
 * that place. Both boards and plan mode draw their drag with this, so the
 * gesture is one gesture wherever it is offered. See ADR-0025.
 *
 * It is `@dnd-kit/sortable`, the pattern Payload's admin uses for a row drag.
 * A drag starts from the grip and nowhere else, so the rest of the card places
 * the cursor on a click and scrolls the column on a swipe. On the grip, a
 * mouse drags once it has moved a few pixels and a finger drags at once. No
 * key drags: the keys are the list keys, and they do not change.
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
import { useSent } from "./pending";

/** One drop: the card, the list it landed in, and that list's new order. */
export type Drop = { id: string; list: string; order: string[] };

export function DragLists({
  lists,
  onDrop,
  overlay,
  children,
}: {
  /** The ids the page draws, by list. */
  lists: Lists;
  /**
   * Posts the drop. The page lays the post over its lists while it is in
   * flight, so the card draws where it landed before the server answers.
   * See #168.
   */
  onDrop: (drop: Drop) => void;
  /** What follows the pointer: a copy of the card being dragged. */
  overlay: (id: string) => ReactNode;
  /** Draws the lists, in the order the drag has them now. */
  children: (shown: Lists) => ReactNode;
}) {
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  // The lists while a drag is under way, and after a drop until the page draws
  // the post. Null is the page's own lists.
  const [held, setHeld] = useState<Lists | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // No hold: only the grip starts a drag, so a touch there is never a swipe.
    useSensor(TouchSensor),
  );

  // After a drop the held copy stays until the page draws the post, so the
  // card does not jump home and back: the lists the page hands in change once
  // the post is laid over them. A post the server refuses may change nothing,
  // so the copy also goes once no post is in flight. A drag under way is never
  // let go of here: a key posts while it runs, and that is not the drop's post.
  const sent = useSent().length;
  const shape = JSON.stringify(lists);
  const drop = useRef<{ shape: string; flying: boolean } | null>(null);
  useEffect(() => {
    const waiting = drop.current;
    if (!waiting) return;
    if (sent > 0) waiting.flying = true;
    if (shape === waiting.shape && (sent > 0 || !waiting.flying)) return;
    drop.current = null;
    setHeld(null);
  }, [shape, sent]);

  const shown = held ?? lists;

  function onDragStart(event: DragStartEvent) {
    drop.current = null;
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
    drop.current = { shape, flying: false };
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
 * way, and the grip a drag starts from. The card being dragged is drawn faded
 * where it will land, and the overlay follows the pointer.
 */
export function useDragItem(id: string, disabled = false) {
  const { setNodeRef, setActivatorNodeRef, transform, transition, listeners, isDragging } =
    useSortable({ id, disabled });
  return {
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    // No `attributes`: they would make the grip a tab stop and a button, and
    // the list, not the card, holds the focus and the keys. See ADR-0022.
    grip: { ref: setActivatorNodeRef, listeners: disabled ? undefined : listeners },
    dragging: isDragging,
  };
}

/**
 * The six dots at the left edge of a card, and the one part of it a drag
 * starts from. It adds width and never a line. It is for the pointer alone:
 * the keys already move a card, so it is hidden and takes no focus.
 *
 * `touch-none` keeps the browser from scrolling under a finger on the grip,
 * which would take the touch before the drag could. See ADR-0025.
 */
export function Grip({ grip }: { grip: ReturnType<typeof useDragItem>["grip"] }) {
  return (
    <span
      aria-hidden="true"
      data-grip=""
      ref={grip.ref}
      {...grip.listeners}
      className="-ml-1 shrink-0 cursor-grab touch-none self-center p-1 text-dim hover:text-fg"
    >
      <svg viewBox="0 0 10 16" fill="currentColor" className="block h-4 w-2.5">
        <circle cx="2.5" cy="3" r="1.5" />
        <circle cx="7.5" cy="3" r="1.5" />
        <circle cx="2.5" cy="8" r="1.5" />
        <circle cx="7.5" cy="8" r="1.5" />
        <circle cx="2.5" cy="13" r="1.5" />
        <circle cx="7.5" cy="13" r="1.5" />
      </svg>
    </span>
  );
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
