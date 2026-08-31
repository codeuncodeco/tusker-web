import { betterAuth } from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import { emailOTP, magicLink } from "better-auth/plugins";

import { createMailer, type Mailer } from "./mail.server";
import { createPersonalOrg } from "./orgs.server";

/** The link and the code both last this long. */
const SIGN_IN_TTL = 15 * 60;

/**
 * How long an invitation link lives. An invitation lands while a person
 * sleeps, so it outlives a sign-in link by far. The sign-in TTL stays short
 * because a login box waits for the person, and a 6-digit code must expire
 * fast whatever the link does.
 */
export const INVITE_TTL = 7 * 24 * 60 * 60;

export type AuthDeps = {
  db: D1Database;
  secret: string;
  baseURL: string;
  mailer: Mailer;
};

/**
 * Every option the auth instance takes. `scripts/auth-schema.ts` calls this
 * too, so the checked-in schema stays in step with the plugins the app runs.
 *
 * Tusker has no public signup. Every way in refuses an unknown email. The
 * first account comes from `/bootstrap`, and every one after it from an
 * invitation or a hand-made row.
 */
export function authOptions({ db, secret, baseURL, mailer }: AuthDeps) {
  return {
    appName: "Tusker",
    database: db,
    secret,
    baseURL,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.passwordReset(user.email, url);
      },
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: SIGN_IN_TTL,
        sendMagicLink: async ({ email, url }) => {
          await mailer.signIn(email, { url });
        },
      }),
      emailOTP({
        disableSignUp: true,
        expiresIn: SIGN_IN_TTL,
        otpLength: 6,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type === "sign-in") await mailer.signIn(email, { otp });
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // D1 has no interactive transaction, and this hook runs after the
            // user row lands. A failure here undoes the row, so no account is
            // left without an org.
            try {
              await createPersonalOrg(db, { id: user.id, name: user.name, email: user.email });
            } catch (failure) {
              await db.prepare('DELETE FROM "user" WHERE id = ?').bind(user.id).run();
              throw failure;
            }
          },
        },
      },
    },
  } satisfies Parameters<typeof betterAuth>[0];
}

/**
 * The auth instance for one request. The base URL comes from the request, so
 * the dev domain and a preview URL both work with no extra variable.
 */
export function createAuth(env: Env, request: Request, mailer: Mailer = createMailer(env)) {
  return betterAuth(
    authOptions({
      db: env.DB,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: new URL(request.url).origin,
      mailer,
    }),
  );
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Mints a magic-link row that lives `INVITE_TTL`, and answers the URL that
 * spends it. The link lands on `next` once the person is signed in.
 *
 * The invitation link must outlive a sign-in link, and `expiresIn` on the
 * `magicLink` plugin sets one life for every link and every code. So this
 * writes the verification row itself. The verify route is the one the plugin
 * already publishes, so `/api/auth/magic-link/verify` spends this link with no
 * change to it.
 *
 * `sendMagicLink` mails the URL and returns nothing, which is the other reason
 * the endpoint cannot serve here: the caller needs the URL for its own mail.
 *
 * The row holds the token as it stands, which is what the plugin does while
 * its `storeToken` option is left alone. Setting that option to `hashed` would
 * make the verify route look up a hash and find none of these rows, so this
 * function must hash the same way on the day anybody sets it.
 *
 * This reaches into `auth.$context`, as `createAccount` does. Watch it on a
 * better-auth upgrade.
 */
export async function mintInviteLink(auth: Auth, email: string, next: string): Promise<string> {
  const ctx = await auth.$context;
  const token = generateRandomString(32, "a-z", "A-Z");

  await ctx.internalAdapter.createVerificationValue({
    identifier: token,
    value: JSON.stringify({ email: email.toLowerCase() }),
    expiresAt: new Date(Date.now() + INVITE_TTL * 1000),
  });

  // The context base URL already carries the auth base path, `/api/auth`, so
  // the verify route hangs straight off it.
  const url = new URL(`${ctx.baseURL.replace(/\/+$/, "")}/magic-link/verify`);
  url.searchParams.set("token", token);
  url.searchParams.set("callbackURL", next);
  return url.toString();
}
