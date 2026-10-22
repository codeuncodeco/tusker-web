/**
 * The clients of an org: the values of the field the org names as its client
 * field, each with its label and its option colour. A client is still a value
 * of a custom field and nothing more (ADR-0002); this reads the list in one
 * place, for the filter chips, the client pages and the unified board.
 * See ADR-0036.
 */

import type { ClientChoice } from "./client-filter";
import { listColors } from "./colors.server";
import { clientField, type OrgField } from "./fields";
import { listFields } from "./fields.server";
import { refOptionsOfOrg } from "./refs.server";
import { scopeIn, type OrgSet, type Scope } from "./scope.server";

/** One client of one org: the stored value, what a person reads, its colour. */
export type Client = { value: string; label: string; color: string | null };

/** An org's client field and its clients, or null for an org that tracks none. */
export type Clients = { field: OrgField; clients: Client[] };

/**
 * The org's clients, in the order the field holds them: a select's options as
 * declared, a reference's cached refs by label.
 */
export async function clientsOf(db: D1Database, scope: Scope): Promise<Clients | null> {
  const fields = await listFields(db, scope);
  const field = clientField(fields);
  if (!field) return null;

  const [colors, refs] = await Promise.all([listColors(db, scope), refOptionsOfOrg(db, scope)]);
  const tint = colors[field.key] ?? {};
  const clients =
    field.type === "select"
      ? field.options.map((value) => ({ value, label: value, color: tint[value] ?? null }))
      : (refs[field.key] ?? []).map((one) => ({ value: one.id, label: one.label, color: tint[one.id] ?? null }));
  return { field, clients };
}

/** One client, by the value tasks store, or null for a value the org does not offer. */
export async function clientOf(
  db: D1Database,
  scope: Scope,
  value: string,
): Promise<{ field: OrgField; client: Client } | null> {
  const found = await clientsOf(db, scope);
  const client = found?.clients.find((one) => one.value === value);
  return found && client ? { field: found.field, client } : null;
}

/**
 * Every client across the person's orgs, org by org in the set's order, as the
 * unified board's chips offer them.
 */
export async function clientsAcross(db: D1Database, set: OrgSet): Promise<ClientChoice[]> {
  const read = await Promise.all(
    set.orgs.map(async (org) => {
      const found = await clientsOf(db, scopeIn(set, org.id)!);
      return (found?.clients ?? []).map((client) => ({
        slug: org.slug,
        value: client.value,
        label: client.label,
        color: client.color,
        org: { slug: org.slug, name: org.name, color: org.color },
      }));
    }),
  );
  return read.flat();
}
