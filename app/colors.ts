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

/**
 * The closed set of names an option colour can name, and the value each one
 * draws with on the light theme and on the dark one. One name, two values, one
 * place: a name and its values cannot drift apart.
 */
export const PALETTE = {
  grey: { light: "#4b5563", dark: "#9ca3af" },
  red: { light: "#dc2626", dark: "#f87171" },
  orange: { light: "#ea580c", dark: "#fb923c" },
  amber: { light: "#d97706", dark: "#fbbf24" },
  green: { light: "#16a34a", dark: "#4ade80" },
  teal: { light: "#0d9488", dark: "#2dd4bf" },
  blue: { light: "#2563eb", dark: "#60a5fa" },
  purple: { light: "#9333ea", dark: "#c084fc" },
  pink: { light: "#db2777", dark: "#f472b6" },
} as const;

export type PaletteName = keyof typeof PALETTE;

/** The palette names, in the order a screen offers them. */
export const PALETTE_NAMES = Object.keys(PALETTE) as PaletteName[];

/**
 * The exact colours Tusker takes: `#rgb` and `#rrggbb`. A Worker has no CSS
 * parser, and a colour it cannot read fails as a dot that does not draw, so
 * every other CSS colour form is refused at the box rather than on the card.
 */
const EXACT_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** True when the value names a palette colour. */
function isPaletteName(text: string): text is PaletteName {
  return Object.hasOwn(PALETTE, text);
}

/**
 * True for a colour Tusker draws: a palette name or an exact colour. A palette
 * name is read in any case, as an exact colour is.
 */
export function isColor(text: string): boolean {
  return text.startsWith("#") ? EXACT_COLOR.test(text) : isPaletteName(text.toLowerCase());
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
    return {
      error: `A colour is a palette name or an exact colour, for example blue or #2563eb. ${text} is neither.`,
    };
  }
  // A palette name is stored as the token names it. An exact colour is stored
  // as the person typed it, because that is what draws.
  return { color: text.startsWith("#") ? text : text.toLowerCase() };
}

/**
 * What a dot is painted with. A palette name resolves to its two values, and
 * the browser takes the one the theme asks for. An exact colour draws as the
 * person typed it, in both themes. That is the deal an exact colour makes.
 */
export function colorCss(color: string): string {
  if (color.startsWith("#")) return color;
  const { light, dark } = PALETTE[color as PaletteName];
  return `light-dark(${light}, ${dark})`;
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
 * every other value a task holds or a colour names.
 *
 * A colour is keyed by the stored value, not by a cached option, so the screen
 * offers a box for a value the cache does not name: an id newer than the last
 * pull, and a value whose option is gone. A colour outlives its option, and
 * this is the one place a person can clear it.
 */
export function colorRows(
  options: RefOption[],
  colors: Record<string, string>,
  held: string[] = [],
): ColorRow[] {
  const cached = new Set(options.map((option) => option.id));
  const rest = [...new Set([...held, ...Object.keys(colors)])]
    .filter((value) => !cached.has(value))
    .sort();

  return [
    ...options.map((option) => ({
      value: option.id,
      label: option.label,
      color: colors[option.id] ?? null,
      cached: true,
    })),
    ...rest.map((value) => ({ value, label: value, color: colors[value] ?? null, cached: false })),
  ];
}
