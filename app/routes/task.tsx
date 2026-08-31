import { Form, Link } from "react-router";

import { cloudflareEnv } from "../context.server";
import { readData, type OrgField } from "../fields";
import { listFields } from "../fields.server";
import { fieldClass } from "../forms";
import { requireScope } from "../scope.server";
import { readTask, saveTask } from "../tasks.server";
import type { Route } from "./+types/task";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.task.title} — Tusker` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);

  const task = await readTask(env.DB, scope, params.taskId);
  if (!task) throw new Response("Not found", { status: 404 });

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    task: { id: task.id, title: task.title, status: task.status, data: task.data },
    fields: await listFields(env.DB, scope),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "A task needs a title." };

  // The org's own declarations decide what is read, so a form that names
  // another org's field writes nothing.
  const read = readData(await listFields(env.DB, scope), form);
  if ("error" in read) return read;

  const saved = await saveTask(env.DB, scope, params.taskId, { title, data: read.data });
  if (!saved) throw new Response("Not found", { status: 404 });
  return { ok: true };
}

/** One declared field, drawn by its type. Every type reads one box. */
function FieldBox({ field, value }: { field: OrgField; value: string | undefined }) {
  const name = `field.${field.key}`;

  if (field.type === "select") {
    return (
      <label className="flex flex-col gap-1">
        {field.label}
        <select name={name} defaultValue={value ?? ""} className={fieldClass}>
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1">
      {field.label}
      <input
        name={name}
        type={field.type === "date" ? "date" : "text"}
        defaultValue={value ?? ""}
        className={fieldClass}
      />
    </label>
  );
}

export default function Task({ loaderData, actionData }: Route.ComponentProps) {
  const { org, task, fields } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <nav className="flex gap-4 text-sm">
          <Link to={`/o/${org.slug}/board`} className="underline">
            Board
          </Link>
          <Link to={`/o/${org.slug}/fields`} className="underline">
            Fields
          </Link>
        </nav>
      </header>

      <Form method="post" key={task.id} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          Title
          <input name="title" required defaultValue={task.title} className={fieldClass} />
        </label>

        {fields.map((field) => (
          <FieldBox key={field.key} field={field} value={task.data[field.key]} />
        ))}

        {fields.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-400">
            This org declares no field yet.{" "}
            <Link to={`/o/${org.slug}/fields`} className="underline">
              Declare one
            </Link>
            .
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        {actionData && "ok" in actionData ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Saved.</p>
        ) : null}

        <button className="self-start rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700">
          Save
        </button>
      </Form>
    </main>
  );
}
