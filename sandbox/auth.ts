/**
 * Stands in for `app/auth.server.ts` in the sandbox build. No better-auth code
 * runs and no auth server is called.
 *
 * Sign-in, bootstrap and reset-password answer that the sandbox has no
 * sign-in: the person is always signed in, so those pages redirect before a
 * form is shown. Sign out does nothing. An invitation works against the
 * browser database, so the members page can add a person, and its mail goes to
 * the console like every other.
 */

import type * as Real from "../app/auth.server";

export const INVITE_TTL: typeof Real.INVITE_TTL = 7 * 24 * 60 * 60;

export function authOptions(): never {
  throw new Error("The sandbox runs no better-auth.");
}

const NO_SIGN_IN = "The sandbox has one person, always signed in, and no sign-in.";

export const createAuth = ((env: Env, request: Request) => {
  const db = env.DB;
  const origin = new URL(request.url).origin;

  const api = new Proxy(
    {
      async signOut() {
        return new Response(null, { status: 200 });
      },
    } as Record<string, (...args: unknown[]) => Promise<unknown>>,
    {
      get(target, name: string) {
        return (
          target[name] ??
          (async () => {
            throw new Response(NO_SIGN_IN, { status: 404 });
          })
        );
      },
    },
  );

  const context = {
    baseURL: `${origin}/api/auth`,
    password: { hash: async (password: string) => `sandbox:${password.length}` },
    internalAdapter: {
      async findUserByEmail(email: string) {
        const user = await db.prepare('SELECT * FROM "user" WHERE lower(email) = ?').bind(email.toLowerCase()).first();
        return user ? { user, accounts: [] } : null;
      },
      async createUser(person: { email: string; name: string }) {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        await db
          .prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)`)
          .bind(id, person.name, person.email, now, now)
          .run();
        return { id, ...person, emailVerified: false, createdAt: new Date(now), updatedAt: new Date(now) };
      },
      async linkAccount() {
        // The sandbox keeps no password: nobody signs in to it.
      },
      async createVerificationValue() {
        // The link an invitation mails is never spent here.
      },
    },
  };

  return {
    api,
    handler: async () => new Response(NO_SIGN_IN, { status: 404 }),
    $context: Promise.resolve(context),
  };
}) as unknown as typeof Real.createAuth;

export const mintInviteLink: typeof Real.mintInviteLink = async (auth, _email, next) => {
  const ctx = await auth.$context;
  const url = new URL(`${ctx.baseURL}/magic-link/verify`);
  url.searchParams.set("token", "sandbox");
  url.searchParams.set("callbackURL", next);
  return url.toString();
};
