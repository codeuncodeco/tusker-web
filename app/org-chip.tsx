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
 * The mark that names one org where a page mixes several: a dot and the org
 * name, on the unified board, plan mode and the week page.
 *
 * The dot is decoration. It is `aria-hidden`, so a reader reads the name
 * alone, and nothing sorts, groups or filters by the colour.
 *
 * An org page draws no chip. There is one org there and nothing to tell apart.
 */
export function OrgChip({ org }: { org: { name: string; color: string | null } }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
      <OrgDot color={org.color} />
      {org.name}
    </span>
  );
}
