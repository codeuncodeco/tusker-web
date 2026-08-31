import { createAccount } from "./accounts.server";
import { INVITE_TTL, mintSignInLink, type Auth } from "./auth.server";
import type { Mailer } from "./mail.server";
import { addMember, addMemberById, memberName, type Org } from "./orgs.server";

/** What became of one invitation. */
export type Invited = "added" | "invited" | "already";

/** Everything one invitation reads and writes, so a test can hand its own. */
export type InviteDeps = { db: D1Database; auth: Auth; mailer: Mailer; origin: string };

/**
 * One act: make the account when no account holds the email, add the
 * membership, and mail the person.
 *
 * Two steps existed because `POST /api/invite` came first, not because a
 * person wants two. Membership is the only permission check, so any member
 * invites, and the consequence is deliberate: any member can mint an account
 * on the instance. This is not a public signup — every way in still refuses an
 * unknown email.
 *
 * The three answers a member sees:
 *
 * - `added` — an account held the email, and it is a member now
 * - `invited` — no account held it, so Tusker made one, with its personal org
 * - `already` — the account is a member of this org. Nothing changes, and
 *   nobody is mailed
 */
export async function inviteToOrg(
  deps: InviteDeps,
  invitation: { org: Org; byId: string; email: string },
): Promise<Invited> {
  const { db, auth, mailer, origin } = deps;
  const email = invitation.email.trim().toLowerCase();
  const board = `${origin}/o/${invitation.org.slug}/board`;

  const held = await addMember(db, invitation.org.id, email);
  if (held === "already") return "already";

  const by = await memberName(db, invitation.byId);

  if (held === "added") {
    await mailer.invitation(email, { by, org: invitation.org.name, board });
    return "added";
  }

  // No account holds the email. Making it also makes the personal org, through
  // the better-auth user hook, so the invited person lands with an org of
  // their own as well as this one.
  const person = await createAccount(auth, { email });
  await addMemberById(db, invitation.org.id, person.id);

  const signIn = await mintSignInLink(auth, email, {
    ttl: INVITE_TTL,
    next: `/o/${invitation.org.slug}/board`,
  });
  await mailer.invitation(email, { by, org: invitation.org.name, board, signIn });
  return "invited";
}
