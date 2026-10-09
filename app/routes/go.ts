/**
 * Where the org select sends a browser that runs no script. The select is a
 * GET form, and `?to=` names an org, or nothing for All. See ADR-0029.
 */

import { redirect } from "react-router";

import { pickedBoard } from "../org-select";
import type { Route } from "./+types/go";

export async function loader({ request }: Route.LoaderArgs) {
  throw redirect(pickedBoard(new URL(request.url).searchParams.get("to")));
}
