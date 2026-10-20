import { Dot } from "./dot";

/**
 * The dot one org draws. An org with no colour draws grey rather than nothing,
 * so a row keeps one shape and null keeps its meaning of "nobody chose". Grey
 * is drawn here and never stored. See ADR-0020.
 */
export function OrgDot({ color }: { color: string | null }) {
  return <Dot color={color ?? "grey"} />;
}

/**
 * The mark that names one org where a page mixes several: a small pill holding
 * the dot and the org's initials, in the line under a task's title on the
 * unified board, the cross-org list, plan mode, the week page and focus mode.
 * Two letters keep every chip short and one width, so a long org name cannot
 * push the org's fields off the line. See #240.
 *
 * The dot and the initials are decoration. Both are `aria-hidden`, and the
 * full name is the chip's text for a reader and its `title` on hover. Nothing
 * sorts, groups or filters by the colour.
 *
 * An org page draws no chip. There is one org there and nothing to tell apart.
 * Nor does a cross-org page for a person in one org, for the same reason: see
 * `tellsOrgsApart`.
 */
export function OrgChip({ org }: { org: { name: string; color: string | null } }) {
  return (
    <span
      title={org.name}
      className="flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[0.625rem] leading-none font-medium tracking-wide text-muted"
    >
      {/* Letters and no dot: the org's colour is drawn where orgs are picked,
          not on every card. See ADR-0038. */}
      <span className="sr-only">{org.name}</span>
      <span aria-hidden="true">{orgInitialsOf(org.name)}</span>
    </span>
  );
}

/**
 * The org chip with the full name: the dot and the org name. The quick-add box
 * draws it, because that is where a person checks which org a new task goes
 * to, and two letters are not enough to check.
 */
export function OrgNameChip({ org }: { org: { name: string; color: string | null } }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
      <OrgDot color={org.color} />
      {org.name}
    </span>
  );
}

/**
 * The letters an org chip draws: the first letter or digit of the first two
 * words, uppercased. Words split on whitespace, `-`, `_` and `.`, and a word
 * with no letter or digit, such as an emoji, is skipped. A one-word name draws
 * its first two letters or digits, so "Acme" draws `AC`.
 *
 * It differs from a member's `initialsOf` on purpose: an org name is often a
 * slug such as "acme-corp" or holds a number such as "Team 7", and two letters
 * keep every org chip one width.
 *
 * A name with no letter or digit draws its first character, so the chip is
 * never empty. Two orgs with the same initials keep them: the colour and the
 * hover name tell them apart.
 */
export function orgInitialsOf(name: string): string {
  const words = name
    .split(/[\s\-_.]+/)
    .map((word) => word.match(/[\p{L}\p{N}]/gu) ?? [])
    .filter((chars) => chars.length > 0);

  const picked = words.length > 1 ? words.slice(0, 2).map((chars) => chars[0]!) : (words[0] ?? []).slice(0, 2);
  if (picked.length > 0) return picked.map(upper).join("");

  const first = new Intl.Segmenter().segment(name.trim())[Symbol.iterator]().next();
  return first.done ? "" : first.value.segment;
}

/** One character uppercased, kept to one: "ß" uppercases to "SS". */
function upper(char: string): string {
  return Array.from(char.toUpperCase())[0]!;
}

/**
 * True when a cross-org page names the org of each task: for a person in two
 * orgs or more. With one org the chip tells nothing apart, so it says nothing,
 * and the line an add leaves names no org either. See #183.
 */
export function tellsOrgsApart(orgs: readonly unknown[]): boolean {
  return orgs.length > 1;
}
