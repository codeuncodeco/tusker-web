/**
 * Where the org select sends a pick that carries an assignee filter, and every
 * pick from a browser that runs no script. The select is a GET form, and
 * `?to=` names an org, or nothing for All. See ADR-0029.
 *
 * `?assignee=` is the filter the board held. The board it opens gets the same
 * question in its own words: `Mine` on All is the person's name in an org. The
 * rule is `carried`, and it needs the person and the org, so only a pick that
 * carries a filter reads them. See ADR-0033.
 */

import { redirect } from "react-router";

import { ASSIGNEE_NAME, carried, readAssignee } from "../assignee-filter";
import { cloudflareEnv } from "../context.server";
import { boardOf, pickedSlug } from "../org-select";
import { readOrgSet } from "../scope.server";
import type { Route } from "./+types/go";

export async function loader({ request, context }: Route.LoaderArgs) {
  const query = new URL(request.url).searchParams;
  const slug = pickedSlug(query.get("to"));
  const board = boardOf(slug);
  const assignee = readAssignee(query);
  if (!assignee) throw redirect(board);

  const set = await readOrgSet(request, context.get(cloudflareEnv));
  // A slug the person does not hold carries nothing, and its layout answers
  // 404 as it would.
  const org = slug === null ? null : set.orgs.find((one) => one.slug === slug);
  const value = org === undefined ? null : carried(assignee, set.personId, org);
  if (value === null) throw redirect(board);

  throw redirect(`${board}?${new URLSearchParams({ [ASSIGNEE_NAME]: value })}`);
}
