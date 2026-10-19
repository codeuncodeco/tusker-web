/**
 * A button for an act that cannot be taken back: hold it, and a bar fills
 * under the words; let go early and nothing happens. It is the press a game
 * asks for before it drops an item, and it asks once, in place, with no
 * dialog.
 *
 * A tap that is not a hold asks instead: the words turn into "Sure? Click
 * again", and a second click within a few seconds does it. That is the road
 * for the keyboard, where Enter is a click and nothing is held, and for a
 * person who asked for less motion, whose bar does not animate.
 */

import { useEffect, useRef, useState } from "react";

/** How long the hold takes, in ms. Long enough to be a choice, short enough to be one move. */
export const HOLD_MS = 700;

/** How long the "Sure?" stays before it gives up, in ms. */
const ASK_MS = 3000;

export function HoldButton({
  label,
  sure = "Sure? Click again",
  onConfirm,
  className = "",
  icon,
}: {
  label: string;
  sure?: string;
  onConfirm: () => void;
  className?: string;
  icon?: React.ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const [asking, setAsking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // True once a hold has done the act, so the click its release makes asks nothing.
  const done = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!asking) return;
    const off = window.setTimeout(() => setAsking(false), ASK_MS);
    return () => window.clearTimeout(off);
  }, [asking]);

  function start(event: React.PointerEvent) {
    if (event.button !== 0) return;
    done.current = false;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      done.current = true;
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  }

  function stop() {
    window.clearTimeout(timer.current);
    setHolding(false);
  }

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        if (done.current) {
          done.current = false;
          return;
        }
        if (asking) {
          setAsking(false);
          onConfirm();
          return;
        }
        setAsking(true);
      }}
      title={`Hold to ${label.toLowerCase()}, or click twice`}
      className={`press relative isolate inline-flex select-none items-center gap-1.5 overflow-hidden rounded border border-border px-3 py-2 text-danger ${asking ? "border-danger motion-safe:animate-shake" : ""} ${className}`}
    >
      <span
        aria-hidden="true"
        style={{ transitionDuration: holding ? `${HOLD_MS}ms` : "150ms" }}
        className={`absolute inset-0 -z-10 origin-left bg-danger/20 transition-transform ease-linear ${holding ? "scale-x-100" : "scale-x-0"}`}
      />
      {icon}
      <span aria-live="polite">{asking ? sure : label}</span>
    </button>
  );
}
