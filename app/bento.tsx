/**
 * Bento: a page laid out as tiles in a grid, each the size of what it holds.
 * See ADR-0040.
 *
 * A tile is one surface on the page's ground: a rounded panel, a small-caps
 * label with its glyph at the top, an act at the top right where it has one,
 * and its content below. Nothing inside a tile draws a box of its own, apart
 * from chips and inputs, so there is never a box inside a box.
 *
 * The grid is four columns from `sm` up and two on a phone. A tile names how
 * many columns it spans and how many rows; on a phone a span of three or four
 * is the whole width.
 */

/** The class of each span, written out so Tailwind sees every one. */
const SPAN: Record<1 | 2 | 3 | 4, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-2 sm:col-span-3",
  4: "col-span-2 sm:col-span-4",
};

const ROWS: Record<1 | 2 | 3, string> = {
  1: "",
  2: "sm:row-span-2",
  3: "sm:row-span-3",
};

/** The grid the tiles sit in. `cols` is three on a page that wants wider tiles. */
export function Bento({ children, cols = 4, className = "" }: { children: React.ReactNode; cols?: 3 | 4; className?: string }) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 ${cols === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"} auto-rows-[minmax(5.5rem,auto)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Tile({
  span = 1,
  rows = 1,
  label,
  icon,
  action,
  tone = "surface",
  className = "",
  children,
}: {
  span?: 1 | 2 | 3 | 4;
  rows?: 1 | 2 | 3;
  /** The small-caps name at the tile's top, or none for a tile that heads itself. */
  label?: React.ReactNode;
  icon?: React.ReactNode;
  /** An act at the tile's top right: a link, a switch, a count. */
  action?: React.ReactNode;
  /** `plain` for a tile that is the page's own ground, as a heading row. */
  tone?: "surface" | "plain" | "ink";
  className?: string;
  children?: React.ReactNode;
}) {
  const ground =
    tone === "plain" ? "bg-transparent" : tone === "ink" ? "bg-fg text-bg" : "bg-surface";
  return (
    <section className={`flex min-w-0 flex-col gap-3 rounded-2xl p-4 ${ground} ${SPAN[span]} ${ROWS[rows]} ${className}`}>
      {label || action ? (
        <div className="flex min-h-5 items-center gap-2">
          {label ? (
            <h2 className={`flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-[0.15em] ${tone === "ink" ? "text-bg/60" : "text-dim"}`}>
              {icon ? <span className="flex">{icon}</span> : null}
              {label}
            </h2>
          ) : null}
          {action ? <span className="ml-auto flex items-center gap-2">{action}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A count, large, with the word that names it: for a tile that counts. */
export function Stat({ value, word }: { value: number | string; word: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <strong key={String(value)} className="font-serif text-3xl font-normal tabular-nums motion-safe:animate-tick">
        {value}
      </strong>
      <span className="text-xs text-muted">{word}</span>
    </span>
  );
}
