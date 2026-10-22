/**
 * Drag between and inside lists, with the drop drawn before it is made: the
 * cards make room where the dragged card will land, and a faded copy holds
 * that place. Both boards and plan mode draw their drag with this, so the
 * gesture is one gesture wherever it is offered. See ADR-0025.
 *
 * It is `@dnd-kit/sortable`, the pattern Payload's admin uses for a row drag.
 * A drag starts from anywhere on the card, and movement tells it from a
 * click: a mouse drags once it has moved a few pixels, and a press that does
 * not move is a click, which places the cursor or opens the task. A finger
 * drags after a short hold, so a swipe over a card still scrolls the column.
 * No key drags: the keys are the list keys, and they do not change. See
 * ADR-0041.
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
  pointerWithin,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
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
import type { TaskId } from "./task-number";

/**
 * What a dragged card is over: the closest card of the list the pointer is in,
 * or that list itself where it is empty or the card is past its cards.
 *
 * A list is as long as its cards and no shorter than its column, so the
 * corners of a long one are far from the pointer, and the closest corners of
 * all would pick a card of the next column level with it. So the pointer picks
 * the list first. Where it is in no list, the closest of all decides, as it did
 * before. See #191.
 */
export function whereOver(lists: Lists): CollisionDetection {
  return (args) => {
    const names = new Set(Object.keys(lists));
    const list = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter((one) => names.has(String(one.id))),
    })[0];
    if (!list) return closestCorners(args);
    const name = String(list.id);
    const inList = new Set<UniqueIdentifier>([name, ...lists[name]]);
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter((one) => inList.has(one.id)),
    });
  };
}

/** One drop: the card, the list it landed in, and that list's new order. */
export type Drop = { id: TaskId; list: string; order: TaskId[] };

/**
 * Swallows the click a browser may fire as a drag lets go, so a drop never
 * opens the task or ticks the ring it was let go over. It lasts the one
 * click that follows the release and no longer.
 */
function swallowClick() {
  const stop = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
}

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
  overlay: (id: TaskId) => ReactNode;
  /** Draws the lists, in the order the drag has them now. */
  children: (shown: Lists) => ReactNode;
}) {
  const id = useId();
  const [active, setActive] = useState<TaskId | null>(null);
  // The lists while a drag is under way, and after a drop until the page draws
  // the post. Null is the page's own lists.
  const [held, setHeld] = useState<Lists | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short hold: the whole card drags, so a finger that moves at once is a
    // swipe, and scrolls the column.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
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
    setActive(event.active.id as TaskId);
    setHeld(lists);
  }

  function onDragOver({ active: dragged, over }: DragOverEvent) {
    if (!over) return;
    const translated = dragged.rect.current.translated;
    const below = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
    setHeld((now) => crossOver(now ?? lists, dragged.id as TaskId, over.id, below));
  }

  function onDragEnd({ active: dragged, over }: DragEndEvent) {
    setActive(null);
    swallowClick();
    // A card is dragged by its task number, and a list is never dragged.
    const card = dragged.id as TaskId;
    if (!over || !held) return setHeld(null);

    const ended = settle(held, card, over.id);
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
    swallowClick();
    setHeld(null);
  }, []);

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={whereOver(shown)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children(shown)}
      <DragOverlay>{active !== null ? overlay(active) : null}</DragOverlay>
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
  ids: TaskId[];
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
 * way, and the listeners that start a drag from anywhere on it. The card being
 * dragged is drawn faded where it will land, and the overlay follows the
 * pointer.
 *
 * `card` is the class a card that drags takes: the grab cursor, no text
 * selection under a drag, and `touch-manipulation`, which lets a finger still
 * scroll the column while the hold decides. A card that does not drag takes
 * none of it. See ADR-0041.
 */
export function useDragItem(id: TaskId, disabled = false) {
  const { setNodeRef, transform, transition, listeners, isDragging } = useSortable({ id, disabled });
  return {
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    // No `attributes`: they would make the card a tab stop and a button, and
    // the list, not the card, holds the focus and the keys. See ADR-0022.
    listeners: disabled ? undefined : listeners,
    card: disabled ? "" : "cursor-grab select-none touch-manipulation",
    dragging: isDragging,
  };
}

/**
 * The copy of a card that follows the pointer. It carries the title and
 * nothing else: the card itself stays in the list, faded, where it will land.
 */
export function DragCopy({ title }: { title: string }) {
  return (
    // Lifted off the board: a little larger, a little turned, with a deeper
    // shadow, as a card picked up in a game. It lands with the drop.
    <div className="-rotate-1 scale-[1.03] cursor-grabbing rounded border border-fg bg-surface p-3 shadow-xl motion-safe:animate-pop">
      {title}
    </div>
  );
}
