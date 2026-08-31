export type Org = {
  id: string;
  slug: string;
  name: string;
  kind: "personal" | "team";
  created_at: string;
};

/** The orgs one person is a member of, personal org first, then newest first. */
export async function listOrgsForPerson(db: D1Database, personId: string): Promise<Org[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.slug, o.name, o.kind, o.created_at
       FROM orgs o
       JOIN memberships m ON m.org_id = o.id
       WHERE m.user_id = ?
       ORDER BY o.kind = 'personal' DESC, o.created_at DESC`,
    )
    .bind(personId)
    .all<Org>();
  return results;
}

/**
 * The org behind a slug, but only for a member of it. Membership is the only
 * permission check, so every route under `/o/:slug` starts here.
 *
 * Answers null for an org that does not exist and for one the person is not a
 * member of, so a stranger cannot tell the two apart.
 */
export async function orgForMember(
  db: D1Database,
  slug: string,
  personId: string,
): Promise<Org | null> {
  return db
    .prepare(
      `SELECT o.id, o.slug, o.name, o.kind, o.created_at
       FROM orgs o
       JOIN memberships m ON m.org_id = o.id
       WHERE o.slug = ? AND m.user_id = ?`,
    )
    .bind(slug, personId)
    .first<Org>();
}

/**
 * Creates the org Tusker gives a person at signup, with that person as its only
 * member. The org row and the membership row go in one batch, because a person
 * with no org cannot make a task.
 *
 * The slug column is unique, so two people invited at once with the same email
 * local part can collide. The insert then runs again with the next free slug.
 */
export async function createPersonalOrg(
  db: D1Database,
  person: { id: string; name?: string | null; email: string },
): Promise<Org> {
  const base = baseSlug(person.email);
  const name = person.name?.trim() || person.email;

  for (let tries = 0; tries < 5; tries++) {
    const id = crypto.randomUUID();
    const slug = await freeSlug(db, base);

    try {
      await db.batch([
        db
          .prepare("INSERT INTO orgs (id, slug, name, kind) VALUES (?, ?, ?, 'personal')")
          .bind(id, slug, name),
        db
          .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'owner')")
          .bind(id, person.id),
      ]);
    } catch (failure) {
      if (tookTheSlug(failure)) continue;
      throw failure;
    }

    const org = await db
      .prepare("SELECT id, slug, name, kind, created_at FROM orgs WHERE id = ?")
      .bind(id)
      .first<Org>();
    if (!org) throw new Error("The personal org disappeared right after the insert.");
    return org;
  }

  throw new Error(`Five tries found no free slug near ${base}.`);
}

/** True when another org took the slug between the read and the insert. */
function tookTheSlug(failure: unknown): boolean {
  return failure instanceof Error && failure.message.includes("UNIQUE constraint failed");
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
