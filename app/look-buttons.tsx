/**
 * The two buttons that change how a page is drawn: the colour scheme, one
 * click a step, and the Key guide. The settings panel holds them. See
 * ADR-0038.
 */

import { play } from "./sound";
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

/**
 * The act of picking a colour scheme: post it, and where the browser can, let
 * the new scheme dissolve in over the old. A person who asked for less motion
 * gets the change at once. The button and the segments both pick through it.
 */
export function useSchemePick(): (to: ColourScheme) => void {
  const fetcher = useColourSchemeFetcher();
  return (to) => {
    play("scheme");
    const send = () =>
      fetcher.submit(
        { scheme: to },
        { method: "post", action: COLOUR_SCHEME_ACTION, defaultShouldRevalidate: false, flushSync: true },
      );

    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm || typeof document.startViewTransition !== "function") {
      void send();
      return;
    }

    // The new scheme breathes in over the old: a slow dissolve with a soft
    // bloom, drawn in `app.css`, so a change of light feels like morning
    // and not a flash. See ADR-0039.
    const root = document.documentElement;
    root.classList.add("scheme-reveal");
    const transition = document.startViewTransition(() => {
      void send();
    });
    void transition.finished.finally(() => root.classList.remove("scheme-reveal"));
  };
}

/**
 * The colour scheme button: one glyph, and one click steps to the next scheme,
 * Light to Dark to System and round again. See `nextScheme`.
 *
 * With script, the pick posts through a fetcher, and the page draws it while
 * the post is in flight, so it changes at once. Where the browser can, the new
 * scheme dissolves in over the old one, slowly, and the glyph turns in. A person who asked for less motion gets the change at once.
 *
 * With no script it is a plain POST form, and the button itself sends the next
 * scheme. The form names the page the person stands on, and the reply
 * redirects back there.
 */
export function ColourSchemeButton() {
  const scheme = useColourScheme();
  const pickScheme = useSchemePick();
  const { pathname, search } = useLocation();
  const next = nextScheme(scheme);
  const name = `Colour scheme: ${SCHEME_LOOKS[scheme].label}. Switch to ${SCHEME_LOOKS[next].label}.`;

  return (
    <form method="post" action={COLOUR_SCHEME_ACTION}>
      <input type="hidden" name="next" value={`${pathname}${search}`} />
      <button
        name="scheme"
        value={next}
        onClick={(event) => {
          event.preventDefault();
          pickScheme(next);
        }}
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

/**
 * The colour scheme as three segments, Light, Dark and System, each one click,
 * the one held filled. Each is a submit of a plain POST form, so with no
 * script a click still picks. The You panel draws this. See ADR-0040.
 */
export function SchemeSegments() {
  const scheme = useColourScheme();
  const pickScheme = useSchemePick();
  const { pathname, search } = useLocation();

  return (
    <form method="post" action={COLOUR_SCHEME_ACTION} role="group" aria-label="Colour scheme" className="flex rounded-xl bg-surface-2 p-0.5">
      <input type="hidden" name="next" value={`${pathname}${search}`} />
      {(["light", "dark", "system"] as const).map((one) => {
        const held = one === scheme;
        return (
          <button
            key={one}
            name="scheme"
            value={one}
            aria-pressed={held}
            onClick={(event) => {
              event.preventDefault();
              if (!held) pickScheme(one);
            }}
            className={`press flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[0.625rem] text-xs ${
              held ? "bg-bg font-medium text-fg shadow-sm" : "text-muted hover:text-fg"
            }`}
          >
            {SCHEME_LOOKS[one].icon("size-3.5")}
            {SCHEME_LOOKS[one].label}
          </button>
        );
      })}
    </form>
  );
}
