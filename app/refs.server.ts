import type { OrgField, RefLabels } from "./fields";
import { readRefOptions, refsUrl, type RefOption } from "./refs";
import type { Scope } from "./scope.server";

/**
 * The option cache of the reference fields, and the pull that fills it.
 *
 * A picker reads the cache, so it never waits on the org app. The pull runs on
 * a cron and from the manage screen, and one more time when a task holds an id
 * the cache does not know.
 *
 * Every call to an org app carries the org's refs key. The org app minted it
 * and can revoke it, and Tusker holds the plaintext on the org rather than in
 * a Worker secret, which holds one value and does not survive a second org
 * app. See ADR-0005.
 */

/** Where one reference field reads from, and what it reads with. */
type Source = {
  org_id: string;
  key: string;
  refs_path: string;
  refs_base_url: string;
  refs_key: string;
};

/**
 * The columns a source reads. The org's key is here and in no other read: a
 * field row carries only the list it names.
 */
const SOURCE_SELECT = `SELECT f.org_id, f.key, f.refs_path, o.refs_base_url, o.refs_key
  FROM org_fields f JOIN orgs o ON o.id = f.org_id`;


/** What became of a pull: the options it cached, or why it cached none. */
export type Pulled = { pulled: number } | { error: string };

/** The cached options of one reference field, in label order. */
export async function listRefOptions(
  db: D1Database,
  scope: Scope,
  fieldKey: string,
): Promise<RefOption[]> {
  const { results } = await db
    .prepare(
      `SELECT ext_id AS id, label FROM org_ref_options
       WHERE org_id = ? AND field_key = ? AND label IS NOT NULL
       ORDER BY label, ext_id`,
    )
    .bind(scope.org.id, fieldKey)
    .all<RefOption>();
  return results;
}

/**
 * The cached options of every reference field of the org, in label order. One
 * query draws the whole manage screen, however many fields the org declares.
 */
export async function refOptionsOfOrg(
  db: D1Database,
  scope: Scope,
): Promise<Record<string, RefOption[]>> {
  const { results } = await db
    .prepare(
      `SELECT field_key, ext_id AS id, label FROM org_ref_options
       WHERE org_id = ? AND label IS NOT NULL
       ORDER BY label, ext_id`,
    )
    .bind(scope.org.id)
    .all<RefOption & { field_key: string }>();

  const options: Record<string, RefOption[]> = {};
  for (const row of results) {
    (options[row.field_key] ??= []).push({ id: row.id, label: row.label });
  }
  return options;
}

/**
 * The cached labels of every reference field of the org, as a card and an
 * editor read them. One query covers the whole board, so a column of cards
 * costs no more reads than a single one.
 */
export async function refLabels(db: D1Database, scope: Scope): Promise<RefLabels> {
  const { results } = await db
    .prepare(
      "SELECT field_key, ext_id, label FROM org_ref_options WHERE org_id = ? AND label IS NOT NULL",
    )
    .bind(scope.org.id)
    .all<{ field_key: string; ext_id: string; label: string }>();

  const labels: RefLabels = {};
  for (const row of results) {
    (labels[row.field_key] ??= {})[row.ext_id] = row.label;
  }
  return labels;
}

/**
 * Pulls one field's options and writes them over the cache, from the manage
 * screen's refresh button.
 */
export async function refreshField(db: D1Database, scope: Scope, field: OrgField): Promise<Pulled> {
  const source = await sourceFor(db, scope.org.id, field.key);
  // The caller read this field a moment ago, so a missing row means the field
  // went while the request ran, not that a person asked for the wrong one.
  if (!source) return { error: `${field.label} is gone.` };
  return pull(db, source);
}

/**
 * The label for one id the cache does not hold: one live pull, and then the
 * cache again.
 *
 * The refs endpoint answers with the whole list and nothing narrower, so the
 * live lookup is a refresh. That also means the miss pays for itself: every
 * other id added since the last cron run lands in the cache with it.
 *
 * Answers null when the org app does not know the id either, and the screen
 * then shows the raw id.
 */
export async function lookUpRef(
  db: D1Database,
  scope: Scope,
  field: OrgField,
  extId: string,
): Promise<string | null> {
  const pulled = await refreshField(db, scope, field);
  if ("error" in pulled) return null;

  const row = await db
    .prepare(
      `SELECT label FROM org_ref_options
       WHERE org_id = ? AND field_key = ? AND ext_id = ? AND label IS NOT NULL`,
    )
    .bind(scope.org.id, field.key, extId)
    .first<{ label: string }>();
  if (row) return row.label;

  // The org app does not know this id either. The miss is a row with no label,
  // so the next load of the task reads it instead of calling the org app.
  await db
    .prepare(
      `INSERT OR REPLACE INTO org_ref_options (org_id, field_key, ext_id, label)
       VALUES (?, ?, ?, NULL)`,
    )
    .bind(scope.org.id, field.key, extId)
    .run();
  return null;
}

/** What the task editor needs to draw one reference field. */
export type RefPicker = {
  /** The cached options, in label order. */
  options: RefOption[];
  /**
   * True once a pull has answered. A field that was never pulled draws an id
   * box, because an empty dropdown reads as "the org app has no trails".
   */
  pulled: boolean;
  /** The label for the id the task holds, or null when nothing names it. */
  label: string | null;
};

/**
 * What the editor draws every reference field of the org with.
 *
 * An id the cache does not hold costs one live lookup, which is the escape
 * hatch for a record made since the last cron run.
 *
 * An id the org app does not know either costs one lookup and no more: the
 * miss is remembered, so a task holding a deleted trail does not call the org
 * app on every load of the page. The next pull clears every miss with the rest
 * of the cache, which gives the id another chance each time the cron runs.
 *
 * A field that was never pulled costs nothing: it has nothing to look up
 * with.
 */
export async function refPickers(
  db: D1Database,
  scope: Scope,
  fields: OrgField[],
  data: Record<string, string>,
): Promise<Record<string, RefPicker>> {
  const pickers: Record<string, RefPicker> = {};

  for (const field of fields) {
    if (field.type !== "reference") continue;

    let options = await listRefOptions(db, scope, field.key);
    const held = data[field.key];
    let label = held ? (options.find((one) => one.id === held)?.label ?? null) : null;

    if (held && label === null && field.refs_pulled_at !== null && !(await missed(db, scope, field, held))) {
      label = await lookUpRef(db, scope, field, held);
      if (label !== null) options = await listRefOptions(db, scope, field.key);
    }

    pickers[field.key] = { options, pulled: field.refs_pulled_at !== null, label };
  }

  return pickers;
}

/** True when a live lookup already failed to name this id. */
async function missed(
  db: D1Database,
  scope: Scope,
  field: OrgField,
  extId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM org_ref_options
       WHERE org_id = ? AND field_key = ? AND ext_id = ? AND label IS NULL`,
    )
    .bind(scope.org.id, field.key, extId)
    .first();
  return row !== null;
}

/** What one run of the cron refresh did. */
export type Refreshed = { fields: number; failed: number };

/**
 * Pulls every reference field of every org, on the cron.
 *
 * This is the one read of field rows that takes no scope. A scope is proof
 * that a signed-in person belongs to an org, and the cron has no person. It
 * reads no task row, and each pull joins the field to its own org, so no org's
 * key touches another org's base URL.
 *
 * An org that names no org app is skipped whole. It has nothing to pull with,
 * and counting it as a failure every run would say nothing a person can act
 * on.
 */
export async function refreshEveryField(db: D1Database): Promise<Refreshed> {
  const { results } = await db
    .prepare(
      `${SOURCE_SELECT}
       WHERE f.type = 'reference' AND f.refs_path <> '' AND o.refs_base_url <> ''
       ORDER BY f.org_id, f.position, f.key`,
    )
    .all<Source>();
  return pullEach(db, results);
}

/**
 * Pulls every reference field of one org, right after a person saved the org
 * app's base URL and key.
 *
 * Rotation is what this issue is about, so a paste that answers nothing is the
 * failure to remove. A field that names no path is counted as a failure here,
 * because the person is looking at the answer and can go and fix it.
 */
export async function refreshOrgFields(db: D1Database, scope: Scope): Promise<Refreshed> {
  const { results } = await db
    .prepare(`${SOURCE_SELECT} WHERE f.org_id = ? AND f.type = 'reference' ORDER BY f.position, f.key`)
    .bind(scope.org.id)
    .all<Source>();
  return pullEach(db, results);
}

/** Pulls a list of sources, counting the ones that answered nothing usable. */
async function pullEach(db: D1Database, sources: Source[]): Promise<Refreshed> {
  let failed = 0;
  for (const source of sources) {
    // One org app must not end the run for the rest. A throw here is a bad
    // write, not a bad answer: `pull` already reports a bad answer.
    try {
      const pulled = await pull(db, source);
      if ("error" in pulled) failed += 1;
    } catch {
      failed += 1;
    }
  }

  return { fields: sources.length, failed };
}

/** One field's path, with its org's base URL and key, or null when it is gone. */
async function sourceFor(db: D1Database, orgId: string, key: string): Promise<Source | null> {
  const row = await db
    .prepare(`${SOURCE_SELECT} WHERE f.org_id = ? AND f.key = ? AND f.type = 'reference'`)
    .bind(orgId, key)
    .first<Source>();
  return row;
}

/**
 * Reads the org app and writes what it answered over the field's cache.
 *
 * The cache is replaced whole, so a record the org app dropped leaves the
 * picker. A failed pull writes nothing, so the picker keeps the last good list
 * rather than emptying itself the moment a key is revoked.
 */
async function pull(db: D1Database, source: Source): Promise<Pulled> {
  if (!source.refs_base_url) return { error: "This org names no org app. Set one in settings." };
  if (!source.refs_key) return { error: "This org holds no refs key. Set one in settings." };
  if (!source.refs_path) return { error: "This field names no refs path." };

  // The org's key goes only to the org's own base URL. A path that moved the
  // origin never gets a URL to send it to.
  const url = refsUrl(source.refs_base_url, source.refs_path);
  if (!url) return { error: "That refs path does not sit under the org app's base URL." };

  const options = await read(url, source.refs_key);
  if ("error" in options) return options;

  await db.batch([
    db
      .prepare("DELETE FROM org_ref_options WHERE org_id = ? AND field_key = ?")
      .bind(source.org_id, source.key),
    ...options.options.map((option) =>
      db
        .prepare(
          `INSERT INTO org_ref_options (org_id, field_key, ext_id, label) VALUES (?, ?, ?, ?)`,
        )
        .bind(source.org_id, source.key, option.id, option.label),
    ),
    db
      .prepare(
        `UPDATE org_fields SET refs_pulled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE org_id = ? AND key = ?`,
      )
      .bind(source.org_id, source.key),
  ]);

  return { pulled: options.options.length };
}

/** What the org app answered, or the reason Tusker could not read it. */
async function read(
  url: string,
  key: string,
): Promise<{ options: RefOption[] } | { error: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${key}` },
      // An org app that never answers would otherwise hold the cron run, or a
      // person's task page, for as long as the platform allows.
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { error: "The org app did not answer." };
  }

  // A revoked key reads as a 401 here, and that is the failure a person needs
  // to see spelled out rather than as an empty picker.
  if (!response.ok) return { error: `The org app answered ${response.status}.` };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { error: "The org app answered something that is not JSON." };
  }

  const options = readRefOptions(body);
  if (!options) return { error: "The org app answered rows that are not {id, label}." };
  return { options };
}
