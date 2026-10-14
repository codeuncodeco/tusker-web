/**
 * Keeps the sandbox off the network. A request to this page's own origin goes
 * through, for the app's assets and the SQLite binary. A request to an org app
 * a reference field reads is answered from the field's cached options, so a
 * refresh succeeds and changes nothing. Every other request is refused, as an
 * org app that does not answer is.
 */

import { refsUrl, type RefOption } from "../app/refs";

type Source = { org_id: string; key: string; refs_path: string; refs_base_url: string };

export function guardFetch(db: D1Database, origin: string, real: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    if (url.origin === origin) return real(input, init);

    const options = await cachedOptions(db, url.toString());
    if (options) return Response.json(options);

    console.info(`sandbox: no network call to ${url.origin}`);
    throw new TypeError("The sandbox makes no network call.");
  };
}

/** The cached options of the reference field that reads this URL, or null. */
async function cachedOptions(db: D1Database, url: string): Promise<RefOption[] | null> {
  const { results } = await db
    .prepare(
      `SELECT f.org_id, f.key, f.refs_path, o.refs_base_url
       FROM org_fields f JOIN orgs o ON o.id = f.org_id
       WHERE f.type = 'reference'`,
    )
    .all<Source>();

  const field = results.find((one) => refsUrl(one.refs_base_url, one.refs_path) === url);
  if (!field) return null;

  const { results: options } = await db
    .prepare(
      `SELECT ext_id AS id, label FROM org_ref_options
       WHERE org_id = ? AND field_key = ? AND label IS NOT NULL
       ORDER BY label, ext_id`,
    )
    .bind(field.org_id, field.key)
    .all<RefOption>();
  return options;
}
