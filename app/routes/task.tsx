import { Form, Link } from "react-router";

import { colorOf } from "../colors";
import { listColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { Dot } from "../dot";
import { readData, type OrgField } from "../fields";
import { listFields } from "../fields.server";
import { fieldClass } from "../forms";
import { OrgNav } from "../org-nav";
import { refPickers, type RefPicker } from "../refs.server";
import { requireScope, type Scope } from "../scope.server";
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

  const fields = await listFields(env.DB, scope);

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    task: { id: task.id, title: task.title, status: task.status, data: task.data },
    fields,
    // The cached options each reference field draws. The refs key that filled
    // that cache stays on the server: this payload goes to the browser.
    refs: await refPickers(env.DB, scope, fields, task.data),
    // The colour of the value this task holds, per field, and no other. The
    // dropdown list stays plain: a browser will not style an option, so the
    // dot draws beside the box. See ADR-0006.
    colors: await heldColors(env.DB, scope, fields, task.data),
  };
}

/** The colour each field gives the value this task holds, or null for none. */
async function heldColors(
  db: D1Database,
  scope: Scope,
  fields: OrgField[],
  data: Record<string, string>,
): Promise<Record<string, string | null>> {
  const colors = await listColors(db, scope);
  return Object.fromEntries(
    fields.map((field) => [field.key, colorOf(colors, field.key, data[field.key])]),
  );
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

/**
 * A reference field: a picker over the cached options.
 *
 * A field that was never pulled draws a plain id box. An empty dropdown reads
 * as "the org app has no trails", and the box at least takes an id.
 *
 * An id the options do not name keeps its place in the list, drawn raw, so a
 * save of the rest of the task does not silently drop it.
 */
function RefBox({
  field,
  value,
  picker,
  color,
}: {
  field: OrgField;
  value: string | undefined;
  picker: RefPicker | undefined;
  color: string | null;
}) {
  const name = `field.${field.key}`;
  const options = picker?.options ?? [];
  const unnamed = value && !options.some((one) => one.id === value);

  if (!picker?.pulled) {
    return (
      <label className="flex flex-col gap-1">
        {field.label}
        <span className="text-sm text-neutral-500">
          No options pulled yet. Refresh this field on the fields screen, or type the id.
        </span>
        <span className="flex items-center gap-2">
          <input name={name} type="text" defaultValue={value ?? ""} className={`${fieldClass} flex-1`} />
          <Dot color={color} />
        </span>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1">
      {field.label}
      <span className="flex items-center gap-2">
        <select name={name} defaultValue={value ?? ""} className={`${fieldClass} flex-1`}>
          <option value="">—</option>
          {unnamed ? <option value={value}>{picker.label ?? value}</option> : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <Dot color={color} />
      </span>
    </label>
  );
}

/** One declared field, drawn by its type. Every type reads one box. */
function FieldBox({
  field,
  value,
  picker,
  color,
}: {
  field: OrgField;
  value: string | undefined;
  picker: RefPicker | undefined;
  color: string | null;
}) {
  const name = `field.${field.key}`;

  if (field.type === "reference") {
    return <RefBox field={field} value={value} picker={picker} color={color} />;
  }

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
  const { org, task, fields, refs, colors } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <OrgNav slug={org.slug} />
      </header>

      <Form method="post" key={task.id} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          Title
          <input name="title" required defaultValue={task.title} className={fieldClass} />
        </label>

        {fields.map((field) => (
          <FieldBox
            key={field.key}
            field={field}
            value={task.data[field.key]}
            picker={refs[field.key]}
            color={colors[field.key] ?? null}
          />
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
