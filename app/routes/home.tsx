import { Link, redirect } from "react-router";

import { noAccountYet } from "../accounts.server";
import { cloudflareEnv } from "../context.server";
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
  // A signed-in person has no use for this page. Their tasks are the answer.
  if (await getSession(request, env)) throw redirect("/me");
  return { empty: await noAccountYet(env.DB) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Tusker</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        A keyboard-first task board for several orgs at once. Tusker has no public signup, so an
        account comes from an invitation.
      </p>
      <p>
        {loaderData.empty ? (
          <Link to="/bootstrap" className="underline">
            Make the first account
          </Link>
        ) : (
          <Link to="/login" className="underline">
            Sign in
          </Link>
        )}
      </p>
    </main>
  );
}
