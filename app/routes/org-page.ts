/**
 * An org page's old address, `/o/acme/members`, sent on to where it now opens:
 * over the org's board, `/o/acme/board/members`. A mailed link and a bookmark
 * still land. An address that names no page is a 404. See ADR-0039.
 */

import { redirect } from "react-router";

import { orgPagePath } from "../paths";
import type { Route } from "./+types/org-page";

/** The pages that moved under the board. */
const MOVED = new Set(["clients", "decisions", "archive", "fields", "members", "settings"]);

export async function loader({ request, params }: Route.LoaderArgs) {
  const rest = params["*"] ?? "";
  const page = rest.split("/")[0] ?? "";
  if (!MOVED.has(page)) throw new Response("Not found", { status: 404 });
  throw redirect(`${orgPagePath(params.slug, rest)}${new URL(request.url).search}`);
}
