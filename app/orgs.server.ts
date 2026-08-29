export type Org = {
  id: string;
  slug: string;
  name: string;
  kind: "personal" | "team";
  created_at: string;
};

export type Role = "owner" | "member";

/** The orgs one person is a member of, personal org first, then newest first. */
export async function listOrgsForUser(db: D1Database, userId: string): Promise<Org[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.slug, o.name, o.kind, o.created_at
       FROM orgs o
       JOIN memberships m ON m.org_id = o.id
       WHERE m.user_id = ?
       ORDER BY o.kind = 'personal' DESC, o.created_at DESC`,
    )
    .bind(userId)
    .all<Org>();
  return results;
}

/**
 * Creates the org Tusker gives a person at signup, with that person as its only
 * member. The org row and the membership row go in one batch, because a person
 * with no org cannot make a task.
 */
export async function createPersonalOrg(
  db: D1Database,
  person: { id: string; name?: string | null; email: string },
): Promise<Org> {
  const id = crypto.randomUUID();
  const slug = await freeSlug(db, baseSlug(person.email));
  const name = person.name?.trim() || person.email;

  await db.batch([
    db
      .prepare("INSERT INTO orgs (id, slug, name, kind) VALUES (?, ?, ?, 'personal')")
      .bind(id, slug, name),
    db
      .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'owner')")
      .bind(id, person.id),
  ]);

  const org = await db
    .prepare("SELECT id, slug, name, kind, created_at FROM orgs WHERE id = ?")
    .bind(id)
    .first<Org>();
  if (!org) throw new Error("The personal org disappeared right after the insert.");
  return org;
}

/** The email's local part, cut down to what a URL can hold. */
function baseSlug(email: string): string {
  const local = email.split("@")[0] ?? "";
  const slug = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "person";
}

/** The base slug, or the base plus a number when another org already took it. */
async function freeSlug(db: D1Database, base: string): Promise<string> {
  const { results } = await db
    .prepare("SELECT slug FROM orgs WHERE slug = ? OR slug LIKE ?")
    .bind(base, `${base}-%`)
    .all<{ slug: string }>();

  const taken = new Set(results.map((row) => row.slug));
  if (!taken.has(base)) return base;

  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
