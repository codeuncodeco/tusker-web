import { Link } from "react-router";

import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Tusker" },
    { name: "description", content: "A keyboard-first task board for several orgs at once." },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Tusker</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        A keyboard-first task board for several orgs at once. Tusker has no public signup, so an
        account comes from an invitation.
      </p>
      <p>
        <Link to="/sign-in" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
