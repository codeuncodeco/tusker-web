import { cloudflareContext } from "../context.server";
import { listOrgs } from "../orgs.server";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Tusker" },
    { name: "description", content: "A keyboard-first task board for several orgs at once." },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const orgs = await listOrgs(env.DB);
  return { orgs };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { orgs } = loaderData;

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Tusker</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Walking skeleton. The route renders, and D1 answers.
      </p>
      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Orgs</h2>
        {orgs.length === 0 ? (
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            No orgs yet. The <code>orgs</code> table exists, so the migration ran.
          </p>
        ) : (
          <ul className="mt-2 list-disc pl-5">
            {orgs.map((org) => (
              <li key={org.id}>
                {org.name} <span className="text-neutral-500">/{org.slug}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
