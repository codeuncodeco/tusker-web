import { Form, Link, useFetcher } from "react-router";

import { ASSIGNABLE, colorRows, readColor, type ColorRow } from "../colors";
import { listColors, setColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { Dot } from "../dot";
import {
  canNameClient,
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
  markClientField,
  readField,
  removeField,
} from "../fields.server";
import { Check, XMark } from "../icons";
import { Swatches } from "../swatches";
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

  // The lines the colour rows draw for each field with a list: a reference
  // field's cached options, then every other value a task holds or a colour
  // names; a select's own options. See ADR-0006 and ADR-0036.
  const rows: Record<string, ColorRow[]> = {};
  for (const key of references) {
    rows[key] = colorRows(options[key] ?? [], colors[key] ?? {}, held[key] ?? []);
  }
  for (const field of fields.filter((one) => one.type === "select")) {
    rows[field.key] = colorRows(
      field.options.map((option) => ({ id: option, label: option })),
      colors[field.key] ?? {},
    );
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
    // A field with a list takes a colour per value: a reference field and a
    // select. Text and a date have no list to colour. See ADR-0006.
    if (!canNameClient(field.type)) throw new Response("That field takes no colour.", { status: 400 });

    const read = readColors(form, field.label);
    if ("error" in read) return read;

    await setColors(env.DB, scope, field.key, read.colors);
    return { ok: true };
  }

  // One value's colour, from one click on a swatch. An empty colour clears it.
  if (intent === "color") {
    const field = await readField(env.DB, scope, String(form.get("key") ?? ""));
    if (!field) throw new Response("Not found", { status: 404 });
    if (!canNameClient(field.type)) throw new Response("That field takes no colour.", { status: 400 });

    const read = readColor(form.get("color"));
    if ("error" in read) return { error: `${field.label}: ${read.error}` };
    await setColors(env.DB, scope, field.key, { [String(form.get("value") ?? "")]: read.color });
    return { ok: true };
  }

  // Names the field that holds the client, or none for an empty key. See ADR-0036.
  if (intent === "client") {
    const key = String(form.get("key") ?? "");
    const marked = await markClientField(env.DB, scope, key || null);
    if (!marked) return { error: "Only a select or a reference field can name the client." };
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

/**
 * The two boxes every field carries, on the declare form and on an edit.
 *
 * The board draws a filter for a select or a reference field alone: a text or
 * a date field has no list of values to pick from. The box says so, rather
 * than take a tick that draws nothing.
 */
function Flags({ field, saves = false }: { field?: OrgField; saves?: boolean }) {
  // On a declared field a tick saves at once, as the rest of the field does
  // when it is left: the form goes as it stands.
  const save = saves
    ? (event: React.ChangeEvent<HTMLInputElement>) => event.currentTarget.form?.requestSubmit()
    : undefined;

  return (
    <span className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2">
        <input type="checkbox" name="show_on_card" value="1" defaultChecked={field?.show_on_card} onChange={save} />
        Show on the card
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="filterable" value="1" defaultChecked={field?.filterable} onChange={save} />
        Filter by it
      </label>
      <span className="text-muted">The board filters by a select or a reference field, not by text or a date.</span>
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
      <span className="text-muted">
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
    <Form method="post" className="flex items-baseline gap-3">
      <input type="hidden" name="intent" value="refresh" />
      <input type="hidden" name="key" value={field.key} />
      <button className="rounded border border-border px-3 py-1">
        Refresh options
      </button>
      <span className="text-muted">
        {field.refs_pulled_at === null
          ? "Never pulled. The picker shows an id box until a pull works."
          : `${cached} option${cached === 1 ? "" : "s"} cached, pulled ${field.refs_pulled_at}.`}
      </span>
    </Form>
  );
}

/**
 * The colours of one field's values: a row of swatches per value, and one
 * click saves a colour. The ✕ clears it, and the value draws plain. A colour
 * set as an exact hex still draws, and still shows its dot; a swatch only
 * replaces it. See ADR-0006.
 *
 * Each row is its own form, and each swatch a submit of it, so with no script
 * a click still saves. With script it saves through a fetcher, in place.
 */
function OptionColors({ field, rows }: { field: OrgField; rows: ColorRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted">
        Nothing to colour yet. {field.type === "reference" ? "Refresh the options, and each" : "Each option"} takes a
        colour here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wide text-muted">Colours</span>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <ColorLine key={row.value} field={field} row={row} />
        ))}
      </ul>
    </div>
  );
}

/** One value's line of swatches. */
function ColorLine({ field, row }: { field: OrgField; row: ColorRow }) {
  const fetcher = useFetcher();
  const sent = fetcher.formData;
  const color = sent ? String(sent.get("color")) || null : row.color;
  const post = (picked: string) =>
    void fetcher.submit({ intent: "color", key: field.key, value: row.value, color: picked }, { method: "post" });

  return (
    <li>
      <Form method="post" className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="intent" value="color" />
        <input type="hidden" name="key" value={field.key} />
        <input type="hidden" name="value" value={row.value} />
        <span className="flex w-40 items-center gap-2 truncate">
          <Dot color={color} />
          {row.label}
          {row.cached ? null : <span className="text-muted"> (gone)</span>}
        </span>
        <Swatches
          name="color"
          value={color}
          label={`Colour for ${row.label}`}
          names={ASSIGNABLE}
          onPick={post}
          extra={
            color ? (
              <button
                name="color"
                value=""
                aria-label={`Clear the colour of ${row.label}`}
                title="Clear"
                onClick={(event) => {
                  event.preventDefault();
                  post("");
                }}
                className="press flex size-7 items-center justify-center rounded-full border border-dashed border-border text-muted hover:text-fg"
              >
                <XMark className="size-3" />
              </button>
            ) : null
          }
        />
      </Form>
    </li>
  );
}

/**
 * The switch that names a field as the org's client field: one click. A field
 * that holds it says so, and a click on it lets go. Only a select or a
 * reference can hold it. See ADR-0036.
 */
function ClientSwitch({ field }: { field: OrgField }) {
  const fetcher = useFetcher();
  if (!canNameClient(field.type)) return null;
  const sent = fetcher.formData;
  const on = sent ? String(sent.get("key")) === field.key : Boolean(field.client);

  return (
    <fetcher.Form method="post" className="ml-auto">
      <input type="hidden" name="intent" value="client" />
      <input type="hidden" name="key" value={on ? "" : field.key} />
      <button
        aria-pressed={on}
        title={on ? "This field names the client. Click to stop." : "Make this the client field: tag cards, filter every board and give each client a page."}
        className={`press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
          on ? "border-fg bg-fg text-bg motion-safe:animate-pop" : "border-border text-muted hover:text-fg"
        }`}
      >
        {on ? <Check className="size-3" /> : null}
        {on ? "Client field" : "Make it the client field"}
      </button>
    </fetcher.Form>
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
  const edit = useFetcher();

  return (
    <li className="flex flex-col gap-2 rounded border border-border p-3">
      <span className="flex items-center gap-2">
        <code>{field.key}</code>
        <span className="text-muted">{FIELD_TYPE_LABEL[field.type]}</span>
        <ClientSwitch field={field} />
      </span>

      <edit.Form method="post" className="flex flex-col gap-2">
        <input type="hidden" name="intent" value="edit" />
        <input type="hidden" name="key" value={field.key} />

        <label className="flex flex-col gap-1">
          Label
          <input name="label" required defaultValue={field.label} className={fieldClass} />
        </label>

        {field.type === "select" ? (
          <label className="flex flex-col gap-1">
            Options, one per line
            <span className="text-muted">
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

        <Flags field={field} saves />

        <span className="flex gap-2">
          <button className="press rounded border border-border px-3 py-1">
            {edit.state === "idle" ? "Save" : "Saving…"}
          </button>
        </span>
      </edit.Form>

      {field.type === "reference" ? <RefCache field={field} cached={cached} /> : null}
      {canNameClient(field.type) ? <OptionColors field={field} rows={colors} /> : null}

      <Form method="post">
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="key" value={field.key} />
        <button className="text-danger underline">
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
      <h1 className="text-2xl tracking-tight">Fields</h1>

      <p className="text-muted">
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

      <Form method="post" className="group/declare flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-lg">Declare a field</h2>
        <input type="hidden" name="intent" value="declare" />

        <label className="flex flex-col gap-1">
          Label
          <input name="label" required className={fieldClass} />
        </label>

        {/* The type is one click, and the boxes below it are the ones that
            type reads: the options for a select, the refs path for a
            reference. */}
        <fieldset className="flex flex-col gap-1">
          <legend>Type</legend>
          <span className="flex flex-wrap gap-1">
            {FIELD_TYPES.map((type) => (
              <label
                key={type}
                className="press cursor-pointer rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-fg has-[:checked]:border-fg has-[:checked]:bg-fg has-[:checked]:text-bg has-focus-visible:outline-2 has-focus-visible:outline-accent"
              >
                <input type="radio" name="type" value={type} defaultChecked={type === "text"} className="sr-only" />
                {FIELD_TYPE_LABEL[type]}
              </label>
            ))}
          </span>
        </fieldset>

        <label className="flex-col gap-1 hidden group-has-[input[name=type][value=select]:checked]/declare:flex">
          Options, one per line
          <textarea name="options" rows={3} className={fieldClass} />
        </label>

        {linked ? (
          <div className="hidden group-has-[input[name=type][value=reference]:checked]/declare:block">
            <RefPath base={app.refs_base_url} />
          </div>
        ) : (
          <p className="text-muted">
            A reference field reads from this org's org app. Name its base URL and key in{" "}
            <Link to={`/o/${org.slug}/settings`} className="underline">
              settings
            </Link>{" "}
            first.
          </p>
        )}

        <Flags />

        {pulled !== null ? (
          <p className="text-muted">
            Pulled {pulled} option{pulled === 1 ? "" : "s"}.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}

        <button className="self-start rounded border border-border px-3 py-2">
          Declare
        </button>
      </Form>
    </main>
  );
}
