import { accountName, createAccount } from "./accounts.server";
import { INVITE_TTL, mintInviteLink, type Auth } from "./auth.server";
import type { Mailer } from "./mail.server";
import { addMember, addMemberById, type Org } from "./orgs.server";

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
 * invites, and the consequence is deliberate: any member can make an account
 * on the instance. This is not a public signup — every way in still refuses an
 * unknown email.
 *
 * The three answers a member sees:
 *
 * - `added` — an account held the email, and it is a member now
 * - `invited` — no account held it, so Tusker made one, holding this org and
 *   no other. See ADR-0024
 * - `already` — the account is a member of this org. Nothing changes, and
 *   nobody is mailed
 */
export async function inviteToOrg(
  deps: InviteDeps,
  invitation: { org: Org; byId: string; email: string },
): Promise<Invited> {
  const { db, auth, mailer, origin } = deps;
  const email = invitation.email.trim().toLowerCase();
  const boardPath = `/o/${invitation.org.slug}/board`;
  const mail = { org: invitation.org.name, board: `${origin}${boardPath}` };

  const outcome = await addMember(db, invitation.org.id, email);
  if (outcome === "already") return "already";

  if (outcome === "added") {
    const by = await accountName(db, invitation.byId);
    await mailer.invitation(email, { by, ...mail });
    return "added";
  }

  // No account holds the email. Tusker makes it, and the org that invited it
  // is the only one it holds.
  const person = await madeAccount(auth, email);
  if (!person) {
    // Another invitation made the account between the read and here. It is an
    // account like any other now, so add it and mail it as one.
    return inviteToOrg(deps, invitation);
  }

  await addMemberById(db, invitation.org.id, person.id);

  const by = await accountName(db, invitation.byId);
  const url = await mintInviteLink(auth, email, boardPath);
  await mailer.invitation(email, { by, ...mail, signIn: { url, days: INVITE_TTL / 86_400 } });
  return "invited";
}

/** The account this call made, or null when another call made it first. */
async function madeAccount(auth: Auth, email: string) {
  try {
    return await createAccount(auth, { email });
  } catch (failure) {
    const ctx = await auth.$context;
    if (await ctx.internalAdapter.findUserByEmail(email)) return null;
    throw failure;
  }
}
