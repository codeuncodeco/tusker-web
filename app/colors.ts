import type { RefOption } from "./refs";

/**
 * The colour one value of a reference field carries, so a card tells one
 * client from another at a glance. Tusker owns it: it is not part of what an
 * org app answers with. See ADR-0006.
 *
 * A colour is a palette name or an exact colour, and nothing else. The leading
 * `#` tells the two apart, so `red` is a palette name and never a CSS colour
 * name.
 */

/** The closed set of names an option colour can name. */
export const PALETTE = [
  "grey",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const;

export type PaletteName = (typeof PALETTE)[number];

/**
 * The exact colours Tusker takes: `#rgb` and `#rrggbb`. A Worker has no CSS
 * parser, and a colour it cannot read fails as a dot that does not draw, so
 * every other CSS colour form is refused at the box rather than on the card.
 */
const EXACT = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** True when the value names a palette colour. */
export function isPaletteName(text: string): text is PaletteName {
  return (PALETTE as readonly string[]).includes(text);
}

/** True for a colour Tusker draws: a palette name or an exact colour. */
export function isColor(text: string): boolean {
  return text.startsWith("#") ? EXACT.test(text) : isPaletteName(text);
}

/** A colour the value takes, or the reason it does not. */
export type ColorReading = { color: string | null } | { error: string };

/**
 * What Tusker makes of a colour a person typed. An empty box is no colour, so
 * clearing it removes the row and the value draws plain.
 */
export function readColor(raw: unknown): ColorReading {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { color: null };
  if (!isColor(text)) {
    return { error: `A colour is a palette name or an exact colour, as blue or #2563eb. ${text} is neither.` };
  }
  return { color: text };
}

/**
 * What a dot is painted with. A palette name resolves to a token, which
 * `app.css` gives a light value and a dark one. An exact colour draws as the
 * person typed it, in both themes. That is the deal an exact colour makes.
 */
export function colorCss(color: string): string {
  return color.startsWith("#") ? color : `var(--dot-${color})`;
}

/** The option colours of one org, as `field key → stored value → colour`. */
export type OptionColors = Record<string, Record<string, string>>;

/** The colour one field gives one stored value, or null when it gives none. */
export function colorOf(
  colors: OptionColors,
  fieldKey: string,
  value: string | undefined,
): string | null {
  if (value === undefined) return null;
  return colors[fieldKey]?.[value] ?? null;
}

/** One line of the colour screen: a value, what names it, and its colour. */
export type ColorRow = {
  value: string;
  /** The cached label, or the value itself when the cache names it no more. */
  label: string;
  color: string | null;
  /** False for a value the last pull dropped, which keeps its colour. */
  cached: boolean;
};

/**
 * The values one reference field can colour: every cached option, and then
 * every value that holds a colour the cache no longer names.
 *
 * A colour outlives its option, so the screen keeps showing it. That is the
 * one place a person can clear a colour for an option that is gone.
 */
export function colorRows(options: RefOption[], colors: Record<string, string>): ColorRow[] {
  const rows = options.map((option) => ({
    value: option.id,
    label: option.label,
    color: colors[option.id] ?? null,
    cached: true,
  }));

  const cached = new Set(options.map((option) => option.id));
  const gone = Object.keys(colors)
    .filter((value) => !cached.has(value))
    .sort()
    .map((value) => ({ value, label: value, color: colors[value], cached: false }));

  return [...rows, ...gone];
}
