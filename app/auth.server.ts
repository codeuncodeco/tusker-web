import { betterAuth } from "better-auth";
import { emailOTP, magicLink } from "better-auth/plugins";

import { createMailer, type Mailer } from "./mail.server";
import { createPersonalOrg } from "./orgs.server";

/** The link and the code both last this long. */
const SIGN_IN_TTL = 15 * 60;

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
