import { Form } from "react-router";

import { cloudflareEnv } from "../context.server";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  fieldKey,
  isFieldType,
  isSourceUrl,
  readOptions,
  type FieldType,
  type OrgField,
} from "../fields";
import { declareField, editField, listFields, readField, removeField } from "../fields.server";
import { fieldClass } from "../forms";
import { OrgNav } from "../org-nav";
import { countRefOptions, refreshField } from "../refs.server";
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
    // How many options each reference field has cached. The count is what
    // tells a person the pull worked, and the key it was pulled with stays on
    // the server: this payload goes to the browser.
    cached: await countRefOptions(env.DB, scope),
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

  if (intent === "refresh") {
    const field = await readField(env.DB, scope, String(form.get("key") ?? ""));
    if (!field) throw new Response("Not found", { status: 404 });

    const pulled = await refreshField(env.DB, scope, field);
    if ("error" in pulled) return { error: `${field.label}: ${pulled.error}` };
    return { ok: true, pulled: pulled.pulled };
  }

  const label = String(form.get("label") ?? "").trim();
  const options = readOptions(String(form.get("options") ?? ""));
  const show_on_card = form.get("show_on_card") === "1";
  const filterable = form.get("filterable") === "1";
  if (!label) return { error: "A field needs a label with a letter or a number." };

  // Only a reference reads these two boxes. The declare form draws them for
  // every type, so a URL typed under Text would otherwise be stored. An edit
  // draws them for a reference alone, so it can read them as they come.
  const noSource = intent === "declare" && form.get("type") !== "reference";
  const source_url = noSource ? "" : String(form.get("source_url") ?? "").trim();
  const refs_key = noSource ? "" : String(form.get("refs_key") ?? "").trim();

  if (intent === "edit") {
    const field = await readField(env.DB, scope, String(form.get("key") ?? ""));
    if (!field) throw new Response("Not found", { status: 404 });

    // The check reads the shape the field ends in, not the boxes. An edit that
    // leaves the key box empty keeps the key the field holds, so a field that
    // already carries one needs nothing typed back — and one that carries none
    // cannot be saved without a key.
    const wrong = check(field.type, {
      options,
      source_url,
      keyed: refs_key !== "" || field.has_refs_key,
    });
    if (wrong) return { error: wrong };

    await editField(env.DB, scope, field, { label, options, source_url, refs_key, show_on_card, filterable });
    return { ok: true };
  }

  if (intent === "declare") {
    const type = form.get("type");
    if (!isFieldType(type)) throw new Response("That is not a field type.", { status: 400 });

    const key = fieldKey(label);
    if (!key) return { error: "A field needs a label with a letter or a number." };

    const wrong = check(type, { options, source_url, keyed: refs_key !== "" });
    if (wrong) return { error: wrong };

    const declared = await declareField(env.DB, scope, {
      key,
      label,
      type,
      options,
      source_url,
      refs_key,
      show_on_card,
      filterable,
    });
    if (declared === "taken") return { error: `This org already declares ${key}.` };
    return { ok: true };
  }

  throw new Response("That form does not name an action.", { status: 400 });
}

/**
 * What one type demands of a field, or null when the field answers it. This
 * reads the shape the write leaves behind, so a declare and an edit hold to
 * one set of rules and a field cannot be edited into a shape it could not have
 * been declared in.
 */
function check(
  type: FieldType,
  after: { options: string[]; source_url: string; keyed: boolean },
): string | null {
  if (type === "select" && after.options.length === 0) {
    return "A select needs at least one option.";
  }
  if (type === "reference" && !isSourceUrl(after.source_url)) {
    return "A reference needs a source URL, as https://blrhikes.example/api.";
  }
  if (type === "reference" && !after.keyed) {
    return "A reference needs the refs key the org app minted for it.";
  }
  return null;
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
 * Where a reference field reads from, and what it reads with.
 *
 * The key box is empty every time. Tusker holds the plaintext, but no screen
 * shows it: the org app minted it and it opens the org app's data. Leaving the
 * box empty keeps the key the field already holds.
 */
function RefSource({ field }: { field?: OrgField }) {
  return (
    <>
      <label className="flex flex-col gap-1">
        Source URL
        <span className="text-sm text-neutral-500">
          The refs endpoint of the org app, which answers with {"{id, label}"} rows.
        </span>
        <input
          name="source_url"
          type="url"
          defaultValue={field?.source_url ?? ""}
          placeholder="https://blrhikes.example/api/tusker/refs/trails"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        Refs key
        <span className="text-sm text-neutral-500">
          {field
            ? field.has_refs_key
              ? "This field holds a key. Paste a new one to replace it, or leave this empty to keep it."
              : "This field holds no key. Paste the one the org app minted."
            : "Mint it in the org app. It is shown there once."}
        </span>
        <input name="refs_key" type="password" autoComplete="off" className={fieldClass} />
      </label>
    </>
  );
}

/** What the last pull of a reference field left in the cache, and a new pull. */
function RefCache({ field, cached }: { field: OrgField; cached: number }) {
  return (
    <Form method="post" className="flex items-baseline gap-3 text-sm">
      <input type="hidden" name="intent" value="refresh" />
      <input type="hidden" name="key" value={field.key} />
      <button className="rounded border border-neutral-300 px-3 py-1 dark:border-neutral-700">
        Refresh options
      </button>
      <span className="text-neutral-500">
        {field.refs_pulled_at === null
          ? "Never pulled. The picker shows an id box until a pull works."
          : `${cached} option${cached === 1 ? "" : "s"} cached, pulled ${field.refs_pulled_at}.`}
      </span>
    </Form>
  );
}

/**
 * One declared field, with the parts an edit can change. The key and the type
 * stay: a value lives under the key, so a new key would leave every value
 * behind.
 */
function DeclaredField({ field, cached }: { field: OrgField; cached: number }) {
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
            <span className="text-sm text-neutral-500">
              An option you drop empties the field on every task that held it.
            </span>
            <textarea
              name="options"
              rows={3}
              defaultValue={field.options.join("\n")}
              className={fieldClass}
            />
          </label>
        ) : null}

        {field.type === "reference" ? <RefSource field={field} /> : null}

        <Flags field={field} />

        <span className="flex gap-2">
          <button className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700">
            Save
          </button>
        </span>
      </Form>

      {field.type === "reference" ? <RefCache field={field} cached={cached} /> : null}

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
  const { org, fields, cached } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;
  const pulled = actionData && "pulled" in actionData ? actionData.pulled : null;

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <OrgNav slug={org.slug} here="fields" />
      </header>

      <p className="text-neutral-600 dark:text-neutral-400">
        A field this org declares shows on every task of this org, and on no task of another one.
      </p>

      <ul className="flex flex-col gap-3">
        {fields.map((field) => (
          <DeclaredField key={field.key} field={field} cached={cached[field.key] ?? 0} />
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

        <RefSource />

        <Flags />

        {pulled !== null ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Pulled {pulled} option{pulled === 1 ? "" : "s"}.
          </p>
        ) : null}

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
