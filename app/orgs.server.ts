import { nextColor, type PaletteName } from "./colors";
import type { OrgApp } from "./refs";
import type { ReadScope, Scope } from "./scope.server";

export type Org = {
  id: string;
  slug: string;
  name: string;
  kind: "personal" | "team";
  created_at: string;
  /**
   * The colour this org draws wherever a page names it beside another org. It
   * is a palette name or an exact colour, as an option colour is. Null means
   * nobody chose, and such an org draws grey. See ADR-0020.
   */
  color: string | null;
};

/**
 * Every column an `Org` holds, aliased `o`, so one read cannot drift from the
 * next. Every query that answers with an `Org` selects this and nothing else,
 * here and in `org-keys.server.ts`.
 */
export const ORG_COLUMNS = "o.id, o.slug, o.name, o.kind, o.created_at, o.color";

/** The orgs one person is a member of, personal org first, then newest first. */
export async function listOrgsForPerson(db: D1Database, personId: string): Promise<Org[]> {
  const { results } = await db
    .prepare(
      `SELECT ${ORG_COLUMNS}
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
      `SELECT ${ORG_COLUMNS}
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
  const color = await assignedColor(db, person.id);

  for (let tries = 0; tries < 5; tries++) {
    const id = crypto.randomUUID();
    const slug = await freeSlug(db, base);

    try {
      await db.batch([
        db
          .prepare("INSERT INTO orgs (id, slug, name, kind, color) VALUES (?, ?, ?, 'personal', ?)")
          .bind(id, slug, name, color),
        db
          .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'owner')")
          .bind(id, person.id),
      ]);
    } catch (failure) {
      if (tookTheSlug(failure)) continue;
      throw failure;
    }

    const org = await db
      .prepare(`SELECT ${ORG_COLUMNS} FROM orgs o WHERE o.id = ?`)
      .bind(id)
      .first<Org>();
    if (!org) throw new Error("The personal org disappeared right after the insert.");
    return org;
  }

  throw new Error(`Five tries found no free slug near ${base}.`);
}

/**
 * Makes an org a person names, with that person as its owner. The org row and
 * the membership row go in one batch, because an org nobody belongs to is a
 * row no page can reach.
 *
 * Answers null when the slug is taken, so the form can say so.
 */
export async function createTeamOrg(
  db: D1Database,
  team: { name: string; slug: string; personId: string },
): Promise<Org | null> {
  const id = crypto.randomUUID();
  const color = await assignedColor(db, team.personId);

  try {
    await db.batch([
      db
        .prepare("INSERT INTO orgs (id, slug, name, kind, color) VALUES (?, ?, ?, 'team', ?)")
        .bind(id, team.slug, team.name, color),
      db
        .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'owner')")
        .bind(id, team.personId),
    ]);
  } catch (failure) {
    if (tookTheSlug(failure)) return null;
    throw failure;
  }

  const org = await db
    .prepare(`SELECT ${ORG_COLUMNS} FROM orgs o WHERE o.id = ?`)
    .bind(id)
    .first<Org>();
  if (!org) throw new Error("The org disappeared right after the insert.");
  return org;
}

/**
 * The colour a new org of this person takes: the first palette name, grey
 * excluded, that no org they already hold carries.
 *
 * The colour is assigned and not derived, because the set of orgs one person
 * holds is small and a person overwrites the row from the settings page. See
 * ADR-0020.
 */
async function assignedColor(db: D1Database, personId: string): Promise<PaletteName> {
  const { results } = await db
    .prepare(
      `SELECT o.color
       FROM orgs o
       JOIN memberships m ON m.org_id = o.id
       WHERE m.user_id = ?`,
    )
    .bind(personId)
    .all<{ color: string | null }>();

  return nextColor(results.map((row) => row.color));
}

/**
 * Gives an org the colour a member chose. Null clears it, and the org draws
 * grey again, because grey is drawn and never stored.
 *
 * Membership is the only permission check Tusker has, so the scope is the
 * whole of it: any member may set the colour.
 */
export async function setOrgColor(
  db: D1Database,
  scope: Scope,
  color: string | null,
): Promise<void> {
  await db.prepare("UPDATE orgs SET color = ? WHERE id = ?").bind(color, scope.org.id).run();
}

/** What became of an attempt to give an org another name or slug. */
export type Renamed = "changed" | "taken";

/**
 * Gives an org another name and slug, in one write. Every page of the org
 * lives under the slug, so the caller redirects to the new address once this
 * answers.
 *
 * A slug another org already holds leaves the row alone, name and all.
 */
export async function renameOrg(
  db: D1Database,
  orgId: string,
  to: { name: string; slug: string },
): Promise<Renamed> {
  try {
    await db.prepare("UPDATE orgs SET name = ?, slug = ? WHERE id = ?").bind(to.name, to.slug, orgId).run();
  } catch (failure) {
    if (tookTheSlug(failure)) return "taken";
    throw failure;
  }
  return "changed";
}

export type Member = { id: string; name: string; email: string; role: Role };

/** Everybody in one org, owners first, then by the day they joined. */
export async function listMembers(db: D1Database, orgId: string): Promise<Member[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.name, u.email, m.role
       FROM memberships m
       JOIN "user" u ON u.id = m.user_id
       WHERE m.org_id = ?
       ORDER BY m.role = 'owner' DESC, m.created_at, u.email`,
    )
    .bind(orgId)
    .all<Member>();
  return results;
}

/** The two roles a membership row can hold. */
export const ROLES = ["owner", "member"] as const;

export type Role = (typeof ROLES)[number];

/** True when a form named a role the column holds. */
export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

/** One member of one org, or null for a person the org does not hold. */
export async function memberOf(
  db: D1Database,
  orgId: string,
  personId: string,
): Promise<Member | null> {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, m.role
       FROM memberships m
       JOIN "user" u ON u.id = m.user_id
       WHERE m.org_id = ? AND m.user_id = ?`,
    )
    .bind(orgId, personId)
    .first<Member>();
}

/**
 * How many live tasks of the org one member holds: To do and In progress, not
 * archived.
 *
 * The members page asks before it removes anybody, because the assignments go
 * with the membership and nothing on screen says how many that is. The tasks
 * themselves stay: they belong to the org, per ADR-0001.
 */
export async function heldLiveTasks(
  db: D1Database,
  scope: Scope,
  personId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS held
       FROM task_assignees a
       JOIN tasks t ON t.id = a.task_id AND t.org_id = a.org_id
       WHERE a.org_id = ? AND a.user_id = ?
         AND t.archived = 0 AND t.status IN ('todo', 'in_progress')`,
    )
    .bind(scope.org.id, personId)
    .first<{ held: number }>();
  return row?.held ?? 0;
}

/** What became of an attempt to take a member out or to change their role. */
export type MemberChange = "changed" | "last-owner" | "no-member";

/**
 * Takes one person out of one org. They lose the org at once, because
 * membership is the only permission check.
 *
 * Their tasks stay and their assignments go: `task_assignees` names the
 * membership, so the database drops the rows. See ADR-0013.
 *
 * The last owner of an org cannot be taken out, and the guard is in the
 * statement rather than in a read before it, so two removals at once cannot
 * leave an org with none.
 */
export async function removeMember(
  db: D1Database,
  scope: Scope,
  personId: string,
): Promise<MemberChange> {
  if (!(await memberOf(db, scope.org.id, personId))) return "no-member";

  const done = await db
    .prepare(
      `DELETE FROM memberships
       WHERE org_id = ? AND user_id = ?
         AND (role <> 'owner'
              OR (SELECT COUNT(*) FROM memberships WHERE org_id = ? AND role = 'owner') > 1)`,
    )
    .bind(scope.org.id, personId, scope.org.id)
    .run();

  return done.meta.changes > 0 ? "changed" : "last-owner";
}

/**
 * Gives one member of one org the other role. Promoting is always allowed, and
 * demoting the last owner is refused by the same rule that keeps the removal
 * from taking them: an org always keeps one owner.
 */
export async function setMemberRole(
  db: D1Database,
  scope: Scope,
  personId: string,
  role: Role,
): Promise<MemberChange> {
  if (!(await memberOf(db, scope.org.id, personId))) return "no-member";

  const done = await db
    .prepare(
      `UPDATE memberships SET role = ?
       WHERE org_id = ? AND user_id = ?
         AND (? = 'owner'
              OR role <> 'owner'
              OR (SELECT COUNT(*) FROM memberships WHERE org_id = ? AND role = 'owner') > 1)`,
    )
    .bind(role, scope.org.id, personId, role, scope.org.id)
    .run();

  return done.meta.changes > 0 ? "changed" : "last-owner";
}

/** What became of an attempt to add somebody to an org. */
export type Added = "added" | "already" | "no-account";

/**
 * Adds an account to an org by its email. The account must exist already: an
 * unknown email answers `no-account`, which the invite path takes as the cue
 * to make one.
 *
 * Membership is the only permission check, so any member can add another one.
 */
export async function addMember(db: D1Database, orgId: string, email: string): Promise<Added> {
  const person = await db
    .prepare('SELECT id FROM "user" WHERE lower(email) = ?')
    .bind(email.trim().toLowerCase())
    .first<{ id: string }>();
  if (!person) return "no-account";

  return addMemberById(db, orgId, person.id);
}

/** Adds an account Tusker holds the id of. Every new member lands as `member`. */
export async function addMemberById(
  db: D1Database,
  orgId: string,
  personId: string,
): Promise<Exclude<Added, "no-account">> {
  const done = await db
    .prepare("INSERT OR IGNORE INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
    .bind(orgId, personId)
    .run();

  return done.meta.changes > 0 ? "added" : "already";
}


/** The org app of one org. An org that names none reads as empty and unkeyed. */
export async function readOrgApp(db: D1Database, scope: ReadScope): Promise<OrgApp> {
  const row = await db
    .prepare("SELECT refs_base_url, refs_key <> '' AS has_refs_key FROM orgs WHERE id = ?")
    .bind(scope.org.id)
    .first<{ refs_base_url: string; has_refs_key: number }>();
  return {
    refs_base_url: row?.refs_base_url ?? "",
    has_refs_key: row?.has_refs_key === 1,
  };
}

/**
 * Points an org at its org app.
 *
 * The key is write-only: an empty one keeps the key the org holds, because no
 * screen can show a person the value to type back. Saving a base URL alone is
 * therefore how a person moves the app without minting a new key.
 */
export async function setOrgApp(
  db: D1Database,
  scope: Scope,
  app: { refs_base_url: string; refs_key: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE orgs
       SET refs_base_url = ?, refs_key = CASE WHEN ? = '' THEN refs_key ELSE ? END
       WHERE id = ?`,
    )
    .bind(app.refs_base_url, app.refs_key, app.refs_key, scope.org.id)
    .run();
}

/** True when another org took the slug between the read and the insert. */
function tookTheSlug(failure: unknown): boolean {
  return failure instanceof Error && failure.message.includes("UNIQUE constraint failed");
}

/** The email's local part, cut down to what a URL can hold. */
function baseSlug(email: string): string {
  return slugify(email.split("@")[0] ?? "") || "person";
}

/** The part of a name a URL can carry: lower case, no run of punctuation. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/** The base slug, or the base plus a number when another org already took it. */
export async function freeSlug(db: D1Database, base: string): Promise<string> {
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
