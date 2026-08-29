import { createLocalAccountIssuer } from "@better-auth/core/db";

import type { Auth } from "./auth.server";

/**
 * Makes an account. Tusker has no public signup, so this is the one way in:
 * an invitation or a hand-run script calls it.
 *
 * The user row triggers the database hook that creates the personal org, so a
 * new person can make a task straight away.
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
