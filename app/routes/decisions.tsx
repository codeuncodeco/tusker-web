/**
 * The decision log: one org's decisions, newest first.
 *
 * A decision outlives the task that produced it, so a line with no task is not
 * a broken one. It is the record still standing after the work is gone.
 */

import { Form, Link } from "react-router";

import { cloudflareEnv } from "../context.server";
import { dayDate } from "../day";
import { DecisionFields } from "../decision-fields";
import { listDecisions, recordDecision } from "../decisions.server";
import { useTaskHref } from "../paths";
import { ModalControls } from "../route-modal";
import { requireScope } from "../scope.server";
import { Bento, Stat, Tile } from "../bento";
import { CircleHalf, Pen, Scale } from "../icons";
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
  const hrefOf = useTaskHref();

  // A bento: the box that keeps a new decision across the top, then one
  // tile per decision, two abreast. See ADR-0040.
  return (
    <main className="flex flex-col gap-3">
      <h1 className="sr-only">Decisions</h1>
      <Bento>
        <Tile span={4} label="Keep a decision" icon={<Pen className="size-3" />} action={
            <>
              <Stat value={decisions.length} word="kept" />
              <ModalControls />
            </>
          }
        >
          {/* The decision box. The prompt catches a decision a task produced,
              and this catches one no task did. See ADR-0024. It is keyed on
              the newest decision, so a save draws it again, empty; a refusal
              writes no line, so the box keeps what was typed. */}
          <Form key={decisions[0]?.id ?? "none"} method="post" className="flex flex-col gap-3">
            <input type="hidden" name="intent" value="record" />
            <DecisionFields
              placeholder="What was decided"
              rows={2}
              title={actionData?.title}
              rationale={actionData?.rationale}
              error={actionData?.error}
            />
            <div>
              <button className="press rounded-xl bg-fg px-4 py-2 text-bg">Keep it</button>
            </div>
          </Form>
        </Tile>

        {decisions.length === 0 ? (
          <Tile span={4} tone="plain">
            <p className="text-muted">
              No decision yet. Write one above, or mark a task as one that holds a decision and Tusker asks when you
              finish it.
            </p>
          </Tile>
        ) : (
          decisions.map((decision) => (
            <Tile
              key={decision.id}
              span={2}
              label={dayDate(decision.created_at.slice(0, 10))}
              icon={<Scale className="size-3" />}
              className="motion-safe:animate-rise-in"
            >
              <h2 className="font-serif text-xl leading-snug">{decision.title}</h2>
              {decision.rationale ? <p className="whitespace-pre-wrap text-muted">{decision.rationale}</p> : null}
              {decision.task ? (
                <Link
                  to={hrefOf(decision.task.id)}
                  className="press mt-auto inline-flex items-center gap-1.5 self-start rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-fg"
                >
                  <CircleHalf className="size-3" />
                  {decision.task.title}
                </Link>
              ) : null}
            </Tile>
          ))
        )}
      </Bento>
    </main>
  );
}
