/**
 * The Landing page at `/`, and the one decision in front of it.
 *
 * `/` sends a person where they belong. A signed-in person goes to their board,
 * because a person opens Tusker to work: the unified board, or the org board
 * of a person in one org, who always stands in it. See ADR-0029.
 */

import { Link, redirect } from "react-router";

import { noAccountYet } from "../accounts.server";
import { cloudflareEnv } from "../context.server";
import { boardOf, onlyOrg } from "../org-select";
import { listOrgsForPerson } from "../orgs.server";
import { getSession } from "../session.server";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Tusker" },
    { name: "description", content: "A keyboard-first task board for several orgs at once." },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  if (await noAccountYet(env.DB)) throw redirect("/bootstrap");
  const session = await getSession(request, env);
  if (session) {
    const only = onlyOrg(await listOrgsForPerson(env.DB, session.user.id));
    throw redirect(boardOf(only?.slug ?? null));
  }
  return null;
}

export default function Home() {
  return (
    <main className="mx-auto flex flex-1 max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl tracking-tight">Tusker</h1>
      <p className="text-muted">
        A keyboard-first task board for several orgs at once.
      </p>
      <p className="text-muted">
        Tusker is invitation only. Ask a member of your organization for an invitation.
      </p>
      <p>
        <Link to="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
