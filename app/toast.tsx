/**
 * The toast: one short message about an act that is already done, and at most
 * one way to take it back.
 *
 * A batch is what needs this. One card that leaves the board says so by
 * leaving it, but a sweep of a column takes several away at once, and the
 * count is the only proof of what happened. So the message names the count and
 * holds the one undo for the batch.
 *
 * One toast stands at a time: a second message replaces the first, because two
 * undos side by side is a person guessing which batch is which. The message
 * goes by itself after a short while, and a person can send it away sooner.
 *
 * The undo posts a form, so it is a button a keyboard reaches and a screen
 * reader names. The region it lands in is live, so a reader announces the
 * message when it arrives. See #121.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useFetcher, useLocation } from "react-router";

/** What the one button on a toast does: its name, where it posts, and what. */
export type ToastAct = {
  label: string;
  /** The route the post goes to. The toast is drawn above every route, so it
   * cannot read one off the tree the way a route's own form does. */
  action: string;
  post: Record<string, string | string[]>;
};

/** One message: the line a person reads, and at most one act. */
export type Toast = { text: string; act?: ToastAct };

/** The message that stands, and its number, so a new one starts the clock again. */
type Held = { toast: Toast; raised: number };

/** How long a message stands before it goes by itself. */
const TOAST_LIFE = 6000;

const Raise = createContext<(toast: Toast) => void>(() => {});

/** Raises a message. Every page under the root layout can call this. */
export function useToast(): (toast: Toast) => void {
  return useContext(Raise);
}

/** Holds the message that stands, and draws it over the page. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [held, hold] = useState<Held | null>(null);
  const raised = useRef(0);
  const { pathname } = useLocation();

  const raise = useCallback((toast: Toast) => {
    raised.current += 1;
    hold({ toast, raised: raised.current });
  }, []);
  const drop = useCallback(() => hold(null), []);

  // A message is about the page it was raised on, and its act posts there. A
  // person who has left that page is done with both, so the message goes.
  useEffect(() => drop(), [pathname, drop]);

  return (
    <Raise.Provider value={raise}>
      {children}
      <ToastRegion held={held} drop={drop} />
    </Raise.Provider>
  );
}

/**
 * Where a message lands. It is drawn whether or not one stands, because a live
 * region that arrives with its message is a region a reader may not announce.
 */
export function ToastRegion({ held, drop }: { held: Held | null; drop: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center p-4"
    >
      {held ? <ToastBar key={held.raised} toast={held.toast} drop={drop} /> : null}
    </div>
  );
}

/** One message, drawn. */
export function ToastBar({ toast, drop }: { toast: Toast; drop: () => void }) {
  const act = useFetcher();

  // The clock starts over with each message, because the key above remounts
  // this on a new one.
  useEffect(() => {
    const timer = setTimeout(drop, TOAST_LIFE);
    return () => clearTimeout(timer);
  }, [drop]);

  // The act is done, so the message it belonged to has nothing left to offer.
  useEffect(() => {
    if (act.state === "idle" && act.data) drop();
  }, [act.state, act.data, drop]);

  return (
    <div className="pointer-events-auto flex items-baseline gap-3 rounded border border-border bg-surface px-3 py-2 shadow-sm">
      <span>{toast.text}</span>

      {toast.act ? (
        <act.Form method="post" action={toast.act.action}>
          {Object.entries(toast.act.post).flatMap(([name, value]) =>
            (Array.isArray(value) ? value : [value]).map((one) => (
              <input key={`${name}:${one}`} type="hidden" name={name} value={one} />
            )),
          )}
          <button className="underline underline-offset-2">{toast.act.label}</button>
        </act.Form>
      ) : null}

      <button type="button" onClick={drop} aria-label="Dismiss" className="text-muted">
        ×
      </button>
    </div>
  );
}
