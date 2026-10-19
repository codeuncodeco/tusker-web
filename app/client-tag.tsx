/**
 * The tag a card draws for its client: the client's name on a tint of its
 * option colour, first on the card's line, so a board reads by client at a
 * glance. Where the card can hold a link, the tag opens the client's page.
 * See ADR-0036.
 */

import { Link } from "react-router";

import { colorCss } from "./colors";

/** The page of one client of one org. */
export function clientPath(slug: string, value: string): string {
  return `/o/${slug}/clients/${encodeURIComponent(value)}`;
}

/** The paint a client tag takes from its colour: a tint, and the colour as its edge. */
function tagStyle(color: string | null): React.CSSProperties {
  if (!color) return {};
  const paint = colorCss(color);
  return {
    backgroundColor: `color-mix(in oklab, ${paint} 16%, transparent)`,
    borderColor: `color-mix(in oklab, ${paint} 45%, transparent)`,
  };
}

export function ClientTag({
  label,
  color,
  to,
}: {
  label: string;
  color: string | null;
  /** The client's page, where the tag may be a link. */
  to?: string;
}) {
  const className =
    "inline-flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-border bg-surface-2 px-1.5 py-0.5 font-medium text-fg";
  const body = (
    <>
      {color ? (
        <span aria-hidden="true" style={{ backgroundColor: colorCss(color) }} className="size-1.5 shrink-0 rounded-full" />
      ) : null}
      <span className="truncate">{label}</span>
    </>
  );

  return to ? (
    <Link to={to} style={tagStyle(color)} className={`press ${className} hover:brightness-95`} title={`${label}: notes and links`}>
      {body}
    </Link>
  ) : (
    <span style={tagStyle(color)} className={className}>
      {body}
    </span>
  );
}
