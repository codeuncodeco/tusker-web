import { Form, Link } from "react-router";

import { cloudflareEnv } from "../context.server";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  fieldKey,
  isFieldType,
  readOptions,
  type OrgField,
} from "../fields";
import { declareField, editField, listFields, removeField } from "../fields.server";
import { fieldClass } from "../forms";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/fields";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Fields of ${loaderData.org.name} — Tusker` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);
  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    fields: await listFields(env.DB, scope),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "remove") {
    const removed = await removeField(env.DB, scope, String(form.get("key") ?? ""));
    if (!removed) throw new Response("Not found", { status: 404 });
    return { ok: true };
  }

  const label = String(form.get("label") ?? "").trim();
  const options = readOptions(String(form.get("options") ?? ""));
  const show_on_card = form.get("show_on_card") === "1";
  const filterable = form.get("filterable") === "1";
  if (!label) return { error: "A field needs a label with a letter or a number." };

  if (intent === "edit") {
    const changed = await editField(env.DB, scope, String(form.get("key") ?? ""), {
      label,
      options,
      show_on_card,
      filterable,
    });
    if (!changed) throw new Response("Not found", { status: 404 });
    return { ok: true };
  }

  if (intent === "declare") {
    const type = form.get("type");
    if (!isFieldType(type)) throw new Response("That is not a field type.", { status: 400 });

    const key = fieldKey(label);
    if (!key) return { error: "A field needs a label with a letter or a number." };
    if (type === "select" && options.length === 0) {
      return { error: "A select needs at least one option." };
    }

    const declared = await declareField(env.DB, scope, {
      key,
      label,
      type,
      options,
      show_on_card,
      filterable,
    });
    if (declared === "taken") return { error: `This org already declares ${key}.` };
    return { ok: true };
  }

  throw new Response("That form does not name an action.", { status: 400 });
}

/** The two boxes every field carries, on the declare form and on an edit. */
function Flags({ field }: { field?: OrgField }) {
  return (
    <span className="flex gap-4 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" name="show_on_card" value="1" defaultChecked={field?.show_on_card} />
        Show on the card
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="filterable" value="1" defaultChecked={field?.filterable} />
        Filter by it
      </label>
    </span>
  );
}

/**
 * One declared field, with the parts an edit can change. The key and the type
 * stay: a value lives under the key, so a new key would leave every value
 * behind.
 */
function Declared({ field }: { field: OrgField }) {
  return (
    <li className="flex flex-col gap-2 rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <span className="flex items-baseline gap-2 text-sm">
        <code>{field.key}</code>
        <span className="text-neutral-500">{FIELD_TYPE_LABEL[field.type]}</span>
      </span>

      <Form method="post" className="flex flex-col gap-2">
        <input type="hidden" name="intent" value="edit" />
        <input type="hidden" name="key" value={field.key} />

        <label className="flex flex-col gap-1">
          Label
          <input name="label" required defaultValue={field.label} className={fieldClass} />
        </label>

        {field.type === "select" ? (
          <label className="flex flex-col gap-1">
            Options, one per line
            <textarea
              name="options"
              rows={3}
              defaultValue={field.options.join("\n")}
              className={fieldClass}
            />
          </label>
        ) : null}

        <Flags field={field} />

        <span className="flex gap-2">
          <button className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700">
            Save
          </button>
        </span>
      </Form>

      <Form method="post">
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="key" value={field.key} />
        <button className="text-sm text-red-700 underline dark:text-red-400">
          Remove {field.label}, and its value on every task
        </button>
      </Form>
    </li>
  );
}

export default function Fields({ loaderData, actionData }: Route.ComponentProps) {
  const { org, fields } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <nav className="flex gap-4 text-sm">
          <Link to={`/o/${org.slug}/board`} className="underline">
            Board
          </Link>
          <Link to={`/o/${org.slug}/settings`} className="underline">
            Settings
          </Link>
        </nav>
      </header>

      <p className="text-neutral-600 dark:text-neutral-400">
        A field this org declares shows on every task of this org, and on no task of another one.
      </p>

      <ul className="flex flex-col gap-3">
        {fields.map((field) => (
          <Declared key={field.key} field={field} />
        ))}
      </ul>

      <Form method="post" className="flex flex-col gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h2 className="text-lg font-medium">Declare a field</h2>
        <input type="hidden" name="intent" value="declare" />

        <label className="flex flex-col gap-1">
          Label
          <input name="label" required className={fieldClass} />
        </label>

        <label className="flex flex-col gap-1">
          Type
          <select name="type" defaultValue="text" className={fieldClass}>
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {FIELD_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          Options, one per line
          <span className="text-sm text-neutral-500">A select reads these. The other types do not.</span>
          <textarea name="options" rows={3} className={fieldClass} />
        </label>

        <Flags />

        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <button className="self-start rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700">
          Declare
        </button>
      </Form>
    </main>
  );
}
