import { Form, Link } from "react-router";

import { colorRows, PALETTE_NAMES, readColor, type ColorRow } from "../colors";
import { listColors, setColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { Dot } from "../dot";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  fieldKey,
  isFieldType,
  readOptions,
  type FieldType,
  type OrgField,
} from "../fields";
import {
  declareField,
  editField,
  heldValues,
  listFields,
  readField,
  removeField,
} from "../fields.server";
import { fieldClass } from "../forms";
import { readOrgApp } from "../orgs.server";
import { isLinked, isRefsPath } from "../refs";
import { refOptionsOfOrg, refreshField } from "../refs.server";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/fields";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Fields of ${loaderData.org.name} — Tusker` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const fields = await listFields(env.DB, scope);
  const references = fields.filter((field) => field.type === "reference").map((field) => field.key);
  const [colors, options, held, app] = await Promise.all([
    listColors(env.DB, scope),
    refOptionsOfOrg(env.DB, scope),
    heldValues(env.DB, scope, references),
    readOrgApp(env.DB, scope),
  ]);

  // The lines the colour form draws for each reference field: the cached
  // options, and then every other value a task holds or a colour names.
  const rows: Record<string, ColorRow[]> = {};
  for (const key of references) {
    rows[key] = colorRows(options[key] ?? [], colors[key] ?? {}, held[key] ?? []);
  }

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    fields,
    // How many options each reference field has cached. The count is what
    // tells a person the pull worked, and the key it was pulled with stays on
    // the server: this payload goes to the browser.
    cached: Object.fromEntries(Object.entries(options).map(([key, one]) => [key, one.length])),
    colors: rows,
    // The address of the org app, and whether a key is set. A reference field
    // reads under both, so this screen says so before it takes a path.
    app,
  };
}

/** The name each colour box carries, ahead of the value it colours. */
const COLOR_BOX = "color.";

/**
 * The colours one post names, as `stored value → colour`, or the first reason
 * it names none. An empty box is no colour, so it clears the row.
 */
function readColors(
  form: FormData,
  label: string,
): { colors: Record<string, string | null> } | { error: string } {
  const colors: Record<string, string | null> = {};

  for (const [name, raw] of form.entries()) {
    if (!name.startsWith(COLOR_BOX)) continue;
    const read = readColor(raw);
    if ("error" in read) return { error: `${label}: ${read.error}` };
    colors[name.slice(COLOR_BOX.length)] = read.color;
  }

  return { colors };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

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

  if (intent === "colors") {
    const field = await readField(env.DB, scope, String(form.get("key") ?? ""));
    if (!field) throw new Response("Not found", { status: 404 });
    // Only a reference field takes a colour. A select holds its own list and
    // no endpoint, and that list has no colour screen yet. See ADR-0006.
    if (field.type !== "reference") throw new Response("That field takes no colour.", { status: 400 });

    const read = readColors(form, field.label);
    if ("error" in read) return read;

    await setColors(env.DB, scope, field.key, read.colors);
    return { ok: true };
  }

  const label = String(form.get("label") ?? "").trim();
  const options = readOptions(String(form.get("options") ?? ""));
  const show_on_card = form.get("show_on_card") === "1";
  const filterable = form.get("filterable") === "1";
  if (!label) return { error: "A field needs a label with a letter or a number." };

  // Only a reference reads this box. The declare form draws it for every type,
  // so a path typed under Text would otherwise be stored. An edit draws it for
  // a reference alone, so it can read it as it comes.
  const noPath = intent === "declare" && form.get("type") !== "reference";
  const refs_path = noPath ? "" : String(form.get("refs_path") ?? "").trim();

  if (intent === "edit") {
    const field = await readField(env.DB, scope, String(form.get("key") ?? ""));
    if (!field) throw new Response("Not found", { status: 404 });

    const wrong = check(field.type, { options, refs_path });
    if (wrong) return { error: wrong };

    await editField(env.DB, scope, field, { label, options, refs_path, show_on_card, filterable });
    return { ok: true };
  }

  if (intent === "declare") {
    const type = form.get("type");
    if (!isFieldType(type)) throw new Response("That is not a field type.", { status: 400 });

    const key = fieldKey(label);
    if (!key) return { error: "A field needs a label with a letter or a number." };

    // A reference field reads under the org app the org names. Declaring one
    // before that pair is set would make a field that can never pull.
    if (type === "reference" && !isLinked(await readOrgApp(env.DB, scope))) {
      return { error: "This org names no org app yet. Set its base URL and key in settings." };
    }

    const wrong = check(type, { options, refs_path });
    if (wrong) return { error: wrong };

    const declared = await declareField(env.DB, scope, {
      key,
      label,
      type,
      options,
      refs_path,
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
  after: { options: string[]; refs_path: string },
): string | null {
  if (type === "select" && after.options.length === 0) {
    return "A select needs at least one option.";
  }
  if (type === "reference" && !isRefsPath(after.refs_path)) {
    return "A reference needs a refs path, as trails. It sits under the org app's base URL.";
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
 * The list a reference field reads, under the org app's base URL.
 *
 * The address and the key are not here. They belong to the org app, not to one
 * list of it, and settings holds them.
 */
function RefPath({ base, field }: { base: string; field?: OrgField }) {
  return (
    <label className="flex flex-col gap-1">
      Refs path
      <span className="text-sm text-neutral-500">
        The list this field reads, under {base || "the org app's base URL"}. It answers with{" "}
        {"{id, label}"} rows.
      </span>
      <input
        name="refs_path"
        defaultValue={field?.refs_path ?? ""}
        placeholder="trails"
        className={fieldClass}
      />
    </label>
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
 * The colours of one reference field: one box per value, and one save.
 *
 * The box takes a palette name or an exact colour. The list offers the palette
 * names, and a person can still type `#2563eb`, which draws as typed in both
 * themes. See ADR-0006.
 */
function RefColors({ field, rows }: { field: OrgField; rows: ColorRow[] }) {
  const list = `palette-${field.key}`;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Nothing to colour yet. Refresh the options, and each one takes a colour here.
      </p>
    );
  }

  return (
    <Form method="post" className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="intent" value="colors" />
      <input type="hidden" name="key" value={field.key} />

      <span className="text-neutral-500">
        A colour draws as a dot on the card and beside the box on the task page. Type a palette
        name or an exact colour, for example blue or #2563eb. Empty draws plain.
      </span>

      <datalist id={list}>
        {PALETTE_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.value} className="flex items-center gap-2">
            <Dot color={row.color} />
            <span className="w-48 truncate">
              {row.label}
              {row.cached ? null : <span className="text-neutral-500"> (gone)</span>}
            </span>
            <input
              name={`${COLOR_BOX}${row.value}`}
              list={list}
              defaultValue={row.color ?? ""}
              aria-label={`Colour for ${row.label}`}
              placeholder="blue or #2563eb"
              className={`${fieldClass} py-1`}
            />
          </li>
        ))}
      </ul>

      <button className="self-start rounded border border-neutral-300 px-3 py-1 dark:border-neutral-700">
        Save colours
      </button>
    </Form>
  );
}

/**
 * One declared field, with the parts an edit can change. The key and the type
 * stay: a value lives under the key, so a new key would leave every value
 * behind.
 */
function DeclaredField({
  field,
  base,
  cached,
  colors,
}: {
  field: OrgField;
  base: string;
  cached: number;
  colors: ColorRow[];
}) {
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

        {field.type === "reference" ? <RefPath base={base} field={field} /> : null}

        <Flags field={field} />

        <span className="flex gap-2">
          <button className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700">
            Save
          </button>
        </span>
      </Form>

      {field.type === "reference" ? (
        <>
          <RefCache field={field} cached={cached} />
          <RefColors field={field} rows={colors} />
        </>
      ) : null}

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
  const { org, fields, cached, colors, app } = loaderData;
  const linked = isLinked(app);
  const error = actionData && "error" in actionData ? actionData.error : null;
  const pulled = actionData && "pulled" in actionData ? actionData.pulled : null;

  return (
    <main className="mx-auto flex flex-1 max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Fields</h1>

      <p className="text-neutral-600 dark:text-neutral-400">
        A field this org declares shows on every task of this org, and on no task of another one.
      </p>

      <ul className="flex flex-col gap-3">
        {fields.map((field) => (
          <DeclaredField
            key={field.key}
            field={field}
            base={app.refs_base_url}
            cached={cached[field.key] ?? 0}
            colors={colors[field.key] ?? []}
          />
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

        {linked ? (
          <RefPath base={app.refs_base_url} />
        ) : (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            A reference field reads from this org's org app. Name its base URL and key in{" "}
            <Link to={`/o/${org.slug}/settings`} className="underline">
              settings
            </Link>{" "}
            first.
          </p>
        )}

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
