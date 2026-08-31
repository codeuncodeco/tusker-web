import { Link } from "react-router";

import { noAccountYet } from "../accounts.server";
import { cloudflareEnv } from "../context.server";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Tusker" },
    { name: "description", content: "A keyboard-first task board for several orgs at once." },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  return { empty: await noAccountYet(context.get(cloudflareEnv).DB) };
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
