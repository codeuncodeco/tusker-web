import { Link } from "react-router";

/** The pages one org holds, in the order every header lists them. */
const PAGES = [
  { to: "board", label: "Board" },
  { to: "decisions", label: "Decisions" },
  { to: "fields", label: "Fields" },
  { to: "members", label: "Members" },
  { to: "settings", label: "Settings" },
] as const;

export type Page = (typeof PAGES)[number]["to"];

/**
 * The links from one page of an org to the others. One list, so a new page
 * reaches every header at once. `here` names the page a person is on, which
 * then takes no link of its own. A page outside the list, such as one task,
 * names none and gets them all.
 */
export function OrgNav({ slug, here }: { slug: string; here?: Page }) {
  return (
    <nav className="flex gap-4 text-sm">
      {PAGES.filter((page) => page.to !== here).map((page) => (
        <Link key={page.to} to={`/o/${slug}/${page.to}`} className="underline">
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
