/**
 * The decision log: one org's decisions, newest first.
 *
 * A decision outlives the task that produced it, so a line with no task is not
 * a broken one. It is the record still standing after the work is gone.
 */

import { Form, Link } from "react-router";

import { cloudflareEnv } from "../context.server";
import { DecisionFields } from "../decision-fields";
import { listDecisions, recordDecision } from "../decisions.server";
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

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const form = await request.formData();
  if (String(form.get("intent") ?? "") !== "record") {
    throw new Response("That form does not name an action.", { status: 400 });
  }

  return recordDecision(env.DB, scope, request, form);
}

export default function Decisions({ loaderData, actionData }: Route.ComponentProps) {
  const { org, decisions } = loaderData;
  const origin = useOrigin();

  return (
    <main className="mx-auto flex flex-1 w-full max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl tracking-tight">Decisions</h1>

      {/* The decision box. The prompt catches a decision a task produced, and
          this catches one no task did. See ADR-0024. */}
      <Form method="post" className="flex flex-col gap-3 rounded border border-border p-4">
        <input type="hidden" name="intent" value="record" />

        <DecisionFields
          placeholder="What was decided"
          rows={3}
          title={actionData?.title}
          rationale={actionData?.rationale}
          error={actionData?.error}
        />

        <div>
          <button className="rounded border border-border px-3 py-2">Keep it</button>
        </div>
      </Form>

      {decisions.length === 0 ? (
        <p className="text-muted">
          No decision yet. Write one here, or mark a task as one that holds a decision and
          Tusker asks when you finish it.
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
