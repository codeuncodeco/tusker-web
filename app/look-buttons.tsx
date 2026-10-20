/**
 * The two buttons that change how a page is drawn: the colour scheme, one
 * click a step, and the Key guide. The settings panel holds them. See
 * ADR-0038.
 */

import { useLocation } from "react-router";

import {
  COLOUR_SCHEME_ACTION,
  type ColourScheme,
  nextScheme,
  useColourScheme,
  useColourSchemeFetcher,
} from "./colour-scheme";
import { Desktop, Keyboard, Moon, Sun } from "./icons";
import { keyHint } from "./key-hint";
import { useKeyGuide } from "./keyed-list";

/**
 * The Key guide, one click away in the settings panel, on a page that gives
 * list keys and where the pointer is fine.
 */
export function KeysButton() {
  const guide = useKeyGuide();
  if (!guide.given) return null;
  const mark = keyHint("guide");

  return (
    <button
      type="button"
      {...mark.keys}
      onClick={() => guide.open(null)}
      aria-label="Keys"
      title="Keys ?"
      className="press hidden size-9 items-center justify-center rounded-lg border border-border bg-bg hover:border-dim hover:bg-surface-2 pointer-fine:flex"
    >
      <Keyboard className="size-4" />
    </button>
  );
}

/** The name and the glyph of each colour scheme, as the button draws them. */
const SCHEME_LOOKS: Record<ColourScheme, { label: string; icon: (className: string) => React.ReactNode }> = {
  light: { label: "Light", icon: (className) => <Sun className={className} /> },
  dark: { label: "Dark", icon: (className) => <Moon className={className} /> },
  system: { label: "System", icon: (className) => <Desktop className={className} /> },
};

/** The radius the reveal grows to: far enough to cover the farthest corner. */
function revealRadius(x: number, y: number): number {
  return Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
}

/**
 * The colour scheme button: one glyph, and one click steps to the next scheme,
 * Light to Dark to System and round again. See `nextScheme`.
 *
 * With script, the pick posts through a fetcher, and the page draws it while
 * the post is in flight, so it changes at once. Where the browser can, the new
 * scheme grows out of the button as a circle over the old one, and the glyph
 * spins in. A person who asked for less motion gets the change at once.
 *
 * With no script it is a plain POST form, and the button itself sends the next
 * scheme. The form names the page the person stands on, and the reply
 * redirects back there.
 */
export function ColourSchemeButton() {
  const scheme = useColourScheme();
  const fetcher = useColourSchemeFetcher();
  const { pathname, search } = useLocation();
  const next = nextScheme(scheme);
  const name = `Colour scheme: ${SCHEME_LOOKS[scheme].label}. Switch to ${SCHEME_LOOKS[next].label}.`;

  function pick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const send = () =>
      fetcher.submit(
        { scheme: next },
        { method: "post", action: COLOUR_SCHEME_ACTION, defaultShouldRevalidate: false, flushSync: true },
      );

    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm || typeof document.startViewTransition !== "function") {
      void send();
      return;
    }

    // The circle grows from the button's centre.
    const box = event.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const root = document.documentElement;
    root.classList.add("scheme-reveal");
    const transition = document.startViewTransition(() => {
      void send();
    });
    void transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${revealRadius(x, y)}px at ${x}px ${y}px)`] },
        { duration: 520, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
    void transition.finished.finally(() => root.classList.remove("scheme-reveal"));
  }

  return (
    <form method="post" action={COLOUR_SCHEME_ACTION}>
      <input type="hidden" name="next" value={`${pathname}${search}`} />
      <button
        name="scheme"
        value={next}
        onClick={pick}
        aria-label={name}
        title={name}
        className="press flex size-9 items-center justify-center overflow-hidden rounded-lg border border-border bg-bg hover:border-dim hover:bg-surface-2"
      >
        {/* The key draws the glyph again on every pick, so it spins in. */}
        <span key={scheme} className="flex motion-safe:animate-spin-in">
          {SCHEME_LOOKS[scheme].icon("size-4")}
        </span>
      </button>
    </form>
  );
}

