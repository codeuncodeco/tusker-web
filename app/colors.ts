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
 * The closed set of names an option colour can name, in the order a screen
 * offers them. A name carries no hex here. Each one has a `--color-opt-<name>`
 * token in `app/app.css` that holds its light value and its dark one, so the
 * dot flips with the theme and one file owns every colour.
 */
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

/** The name a colour falls back to when the palette no longer holds its own. */
const FALLBACK: PaletteName = "grey";

/**
 * The exact colours Tusker takes: `#rgb` and `#rrggbb`. A Worker has no CSS
 * parser, and a colour it cannot read fails as a dot that does not draw, so
 * every other CSS colour form is refused at the box rather than on the card.
 */
const EXACT_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** True when the value names a palette colour. */
function isPaletteName(text: string): text is PaletteName {
  return (PALETTE as readonly string[]).includes(text);
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
 * What a dot is painted with. A palette name resolves to its token, and the
 * token holds both values, so the browser takes the one the theme asks for. An
 * exact colour draws as the person typed it, in both themes. That is the deal
 * an exact colour makes.
 *
 * A colour outlives the palette that named it. A row in `org_field_colors` can
 * name a colour a later palette dropped, and such a name draws grey rather
 * than throwing the page away.
 */
export function colorCss(color: string): string {
  if (color.startsWith("#")) return color;
  const name = isPaletteName(color) ? color : FALLBACK;
  return `var(--color-opt-${name})`;
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

/**
 * The palette names an org can be assigned. Grey is what a colourless org
 * already draws, so handing it out would say "somebody chose grey" when
 * nobody chose at all.
 */
export const ASSIGNABLE = PALETTE.filter((name) => name !== "grey") as readonly PaletteName[];

/**
 * The colour a new org takes: the first assignable name no org of the person
 * holds. Once the person holds them all it wraps round, by the count of every
 * org they hold, so the ninth org repeats the first and the seventeenth
 * repeats it again rather than piling on one name.
 *
 * This is a stored default a person overwrites, not a derived colour. See
 * ADR-0020.
 */
export function nextColor(held: (string | null)[]): PaletteName {
  const taken = new Set(held.filter((color): color is string => color !== null));
  return ASSIGNABLE.find((name) => !taken.has(name)) ?? ASSIGNABLE[held.length % ASSIGNABLE.length];
}
