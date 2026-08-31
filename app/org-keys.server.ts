import { hashKey, keyPreview, mintKey } from "./org-keys";
import type { Org } from "./orgs.server";
import type { Scope } from "./scope.server";

/**
 * The org keys of one org: the mint, the revoke and the read that turns a key
 * back into an org.
 *
 * A key names an org and no person, because crew who read an org app's task
 * screen are not Tusker accounts. Membership is still the only way to mint or
 * revoke one, so every call here except `orgForKey` takes a scope.
 */

/** One key, as the settings screen reads it. The key itself is never here. */
export type OrgKey = {
  id: string;
  name: string;
  /** The first characters of the key, to tell one row from another. */
  preview: string;
  created_at: string;
  /** When the key stopped working, or null while it still does. */
  revoked_at: string | null;
};

/** The columns a screen reads. `hash` is not one of them. */
const COLUMNS = "id, name, preview, created_at, revoked_at";

/** One org's keys, newest first, revoked ones with the rest. */
export async function listOrgKeys(db: D1Database, scope: Scope): Promise<OrgKey[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM org_keys WHERE org_id = ? ORDER BY created_at DESC, id`)
    .bind(scope.org.id)
    .all<OrgKey>();
  return results;
}

/**
 * Mints a key for an org and answers the plaintext. The caller shows it once:
 * the row holds a hash, so nothing can read the key back.
 */
export async function createOrgKey(db: D1Database, scope: Scope, name: string): Promise<string> {
  const key = mintKey();

  await db
    .prepare("INSERT INTO org_keys (id, org_id, name, hash, preview) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), scope.org.id, name, await hashKey(key), keyPreview(key))
    .run();

  return key;
}

/**
 * Stops a key working. The row stays, because it is the record that the key
 * existed. Answers false when the org holds no such key, so the route can
 * answer 404 rather than tell one org about another org's row.
 */
export async function revokeOrgKey(db: D1Database, scope: Scope, id: string): Promise<boolean> {
  const done = await db
    .prepare(
      `UPDATE org_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND org_id = ? AND revoked_at IS NULL`,
    )
    .bind(id, scope.org.id)
    .run();
  return done.meta.changes > 0;
}

/**
 * The org one key opens, or null when no live key hashes to it.
 *
 * The read is by hash, so a wrong key and a revoked key both answer null in
 * the same work: there is no comparison whose time says how close a guess
 * was.
 */
export async function orgForKey(db: D1Database, key: string): Promise<Org | null> {
  return db
    .prepare(
      `SELECT o.id, o.slug, o.name, o.kind, o.created_at
       FROM org_keys k
       JOIN orgs o ON o.id = k.org_id
       WHERE k.hash = ? AND k.revoked_at IS NULL`,
    )
    .bind(await hashKey(key))
    .first<Org>();
}
