/**
 * The decision log: one org's decisions, newest first.
 *
 * A decision outlives the task that produced it, so a line with no task is not
 * a broken one. It is the record still standing after the work is gone.
 */

import { Link } from "react-router";

import { cloudflareEnv } from "../context.server";
import { listDecisions } from "../decisions.server";
import { taskPath, useOrigin } from "../paths";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/decisions";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Decisions — ${loaderData.org.name}` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    decisions: await listDecisions(env.DB, scope),
  };
}

export default function Decisions({ loaderData }: Route.ComponentProps) {
  const { org, decisions } = loaderData;
  const origin = useOrigin();

  return (
    <main className="mx-auto flex flex-1 w-full max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl tracking-tight">Decisions</h1>

      {decisions.length === 0 ? (
        <p className="text-muted">
          No decision yet. Mark a task as one that holds a decision, and Tusker asks when
          you finish it.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {decisions.map((decision) => (
            <li
              key={decision.id}
              className="flex flex-col gap-1 rounded border border-border p-4"
            >
              <h2>{decision.title}</h2>
              <p className="text-xs tabular-nums text-muted">
                {decision.created_at.slice(0, 10)}
                {decision.task ? (
                  <>
                    {" · "}
                    <Link
                      to={taskPath(org.slug, decision.task.id, origin)}
                      className="underline underline-offset-2"
                    >
                      {decision.task.title}
                    </Link>
                  </>
                ) : null}
              </p>
              {decision.rationale ? (
                <p className="whitespace-pre-wrap text-muted">
                  {decision.rationale}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
