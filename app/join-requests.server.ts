import { accountName } from "./accounts.server";
import { nameOf } from "./assignees";
import { mailSignInLink, type InviteDeps } from "./invites.server";
import { memberOf } from "./orgs.server";
import type { Scope } from "./scope.server";

/**
 * The join request: a person's ask to become a member of one org, sent from
 * the org directory. Every member of the org sees it, and only an owner
 * answers it. See ADR-0028.
 */

/** The two states a join request row holds. */
type Status = "waiting" | "declined";

/** Where one person stands with one org of the directory. Null is no request. */
export type RequestState = Status | null;

/**
 * One org as the directory draws it. The directory names an org to somebody
 * outside it, so it carries the name and the colour and nothing else of the
 * org. The id is what a form posts back.
 */
export type ListedOrg = { id: string; name: string; color: string | null; request: RequestState };

/** Every org of the instance, by name, with the request this person holds to each. */
export async function listDirectory(db: D1Database, personId: string): Promise<ListedOrg[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.name, o.color, r.status AS request
       FROM orgs o
       LEFT JOIN join_requests r ON r.org_id = o.id AND r.user_id = ?
       ORDER BY o.name COLLATE NOCASE, o.id`,
    )
    .bind(personId)
    .all<ListedOrg>();
  return results;
}

/** The orgs one person waits to hear from, for their account page. */
export async function waitingFor(
  db: D1Database,
  personId: string,
): Promise<Omit<ListedOrg, "request">[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.name, o.color
       FROM join_requests r
       JOIN orgs o ON o.id = r.org_id
       WHERE r.user_id = ? AND r.status = 'waiting'
       ORDER BY r.created_at, r.rowid`,
    )
    .bind(personId)
    .all<Omit<ListedOrg, "request">>();
  return results;
}

/** What became of one ask, with the name of the org it went to. */
export type Asked =
  | { outcome: "asked" | Status; org: string }
  | { outcome: "no-org" };

/**
 * Sends a join request, and mails the org's owners. A person holds at most one
 * request per org, so asking again while one waits changes nothing and mails
 * nobody. A declined request stays declined. See ADR-0028.
 */
export async function askToJoin(
  deps: Pick<InviteDeps, "db" | "mailer" | "origin">,
  personId: string,
  orgId: string,
): Promise<Asked> {
  const { db, mailer, origin } = deps;
  const org = await db
    .prepare("SELECT slug, name FROM orgs WHERE id = ?")
    .bind(orgId)
    .first<{ slug: string; name: string }>();
  if (!org) return { outcome: "no-org" };

  const done = await db
    .prepare("INSERT OR IGNORE INTO join_requests (org_id, user_id) VALUES (?, ?)")
    .bind(orgId, personId)
    .run();
  if (done.meta.changes === 0) {
    const held = await db
      .prepare("SELECT status FROM join_requests WHERE org_id = ? AND user_id = ?")
      .bind(orgId, personId)
      .first<{ status: Status }>();
    return { outcome: held?.status ?? "waiting", org: org.name };
  }

  const { results: owners } = await db
    .prepare(
      `SELECT u.email FROM memberships m JOIN "user" u ON u.id = m.user_id
       WHERE m.org_id = ? AND m.role = 'owner'`,
    )
    .bind(orgId)
    .all<{ email: string }>();
  const mail = {
    who: await accountName(db, personId),
    org: org.name,
    members: `${origin}/o/${org.slug}/members`,
  };
  for (const owner of owners) await mailer.joinRequest(owner.email, mail);
  return { outcome: "asked", org: org.name };
}

/**
 * Takes back a waiting request. A declined one is not the person's to take
 * back, or a withdraw would undo the decline.
 */
export async function withdrawRequest(
  db: D1Database,
  personId: string,
  orgId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM join_requests WHERE org_id = ? AND user_id = ? AND status = 'waiting'")
    .bind(orgId, personId)
    .run();
}

/** One waiting request, as the members page lists it. */
export type Waiting = { id: string; name: string; email: string };

/** The requests waiting on one org, oldest first. Every member reads these. */
export async function waitingOn(db: D1Database, scope: Scope): Promise<Waiting[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.name, u.email
       FROM join_requests r
       JOIN "user" u ON u.id = r.user_id
       WHERE r.org_id = ? AND r.status = 'waiting'
       ORDER BY r.created_at, r.rowid`,
    )
    .bind(scope.org.id)
    .all<Waiting>();
  return results;
}

/** True when the person the scope names owns the org, and so answers its requests. */
export async function answersRequests(db: D1Database, scope: Scope): Promise<boolean> {
  return (await memberOf(db, scope, scope.personId))?.role === "owner";
}

/** The two answers an owner gives a join request. */
export type Answer = "approve" | "decline";

/** What became of an owner's answer, with the name of the person it answered. */
export type Answered =
  | { outcome: "approved"; name: string }
  | { outcome: "declined"; name: string }
  | { outcome: "not-owner" }
  | { outcome: "no-request" };

/**
 * An owner's answer to one waiting request.
 *
 * Approving makes the person a member, which clears the request, and mails
 * them a link that signs them in, as an invitation does. Declining is silent,
 * and the row stays so the person cannot ask again.
 *
 * Each write is guarded by the request still waiting, in the statement, so an
 * approval cannot undo a withdraw or a decline that landed first, and two
 * approvals mail once.
 *
 * A plain member is refused here and not only in the page, because only an
 * owner answers. See ADR-0028.
 */
export async function answerRequest(
  deps: InviteDeps,
  scope: Scope,
  personId: string,
  answer: Answer,
): Promise<Answered> {
  const { db } = deps;
  if (!(await answersRequests(db, scope))) return { outcome: "not-owner" };

  const asker = await db
    .prepare(
      `SELECT u.name, u.email FROM join_requests r JOIN "user" u ON u.id = r.user_id
       WHERE r.org_id = ? AND r.user_id = ? AND r.status = 'waiting'`,
    )
    .bind(scope.org.id, personId)
    .first<{ name: string; email: string }>();
  if (!asker) return { outcome: "no-request" };
  const name = nameOf(asker);

  if (answer === "decline") {
    const done = await db
      .prepare(
        `UPDATE join_requests SET status = 'declined'
         WHERE org_id = ? AND user_id = ? AND status = 'waiting'`,
      )
      .bind(scope.org.id, personId)
      .run();
    return done.meta.changes > 0 ? { outcome: "declined", name } : { outcome: "no-request" };
  }

  // The membership comes from the waiting row itself, and the row goes in the
  // same batch, as `addMemberById` clears it for an invitation.
  const [added] = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO memberships (org_id, user_id, role)
         SELECT org_id, user_id, 'member' FROM join_requests
         WHERE org_id = ? AND user_id = ? AND status = 'waiting'`,
      )
      .bind(scope.org.id, personId),
    db
      .prepare("DELETE FROM join_requests WHERE org_id = ? AND user_id = ? AND status = 'waiting'")
      .bind(scope.org.id, personId),
  ]);
  if (added!.meta.changes === 0) return { outcome: "no-request" };

  await mailSignInLink(deps, { org: scope.org, byId: scope.personId, email: asker.email });
  return { outcome: "approved", name };
}
