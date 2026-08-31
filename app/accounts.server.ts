import { createLocalAccountIssuer } from "@better-auth/core/db";

import type { Auth } from "./auth.server";

/**
 * Makes an account. Tusker has no public signup, so this is the one way in:
 * the bootstrap page, an invitation, or a hand-run script calls it.
 *
 * The user row triggers the database hook that creates the personal org, so a
 * new person can make a task straight away.
 *
 * This reaches into `auth.$context` because better-auth publishes no endpoint
 * that makes an account without a signup. `sign-up/email` is off, and the
 * admin plugin would add a role model Tusker does not want. Watch these three
 * calls on a better-auth upgrade, and the fourth in `mintSignInLink`.
 */
export async function createAccount(
  auth: Auth,
  person: { email: string; name?: string; password?: string },
) {
  const ctx = await auth.$context;
  const email = person.email.toLowerCase();

  if (await ctx.internalAdapter.findUserByEmail(email)) {
    throw new Error(`An account already holds ${email}.`);
  }

  const user = await ctx.internalAdapter.createUser(
    { email, name: person.name ?? "", emailVerified: false },
    { method: "invitation" },
  );

  if (person.password) {
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      issuer: createLocalAccountIssuer("credential"),
      accountId: user.id,
      password: await ctx.password.hash(person.password),
    });
  }

  return user;
}

/**
 * True while no account exists. The bootstrap route is open only then, so this
 * read decides whether the instance still has a way in.
 */
export async function noAccountYet(db: D1Database): Promise<boolean> {
  const found = await db.prepare('SELECT 1 FROM "user" LIMIT 1').first();
  return found === null;
}

/** The name a mail calls an account by: its name, or its email when the name is blank. */
export async function accountName(db: D1Database, personId: string): Promise<string> {
  const person = await db
    .prepare('SELECT name, email FROM "user" WHERE id = ?')
    .bind(personId)
    .first<{ name: string; email: string }>();
  return person?.name?.trim() || person?.email || "Somebody";
}
