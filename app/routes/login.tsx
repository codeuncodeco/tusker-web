import { Form, redirect, useSearchParams } from "react-router";

import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { createMailer, oneMail } from "../mail.server";
import { safeNext } from "../paths";
import { getSession, withCookies } from "../session.server";
import { fieldClass } from "../forms";
import type { Route } from "./+types/login";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Sign in — Tusker" }];
}

/** The same answer for a known and an unknown email, so neither leaks. */
const SENT = "Check your mail. The message holds a link and a code.";

export async function loader({ request, context }: Route.LoaderArgs) {
  const found = await getSession(request, context.get(cloudflareEnv));
  if (found) throw redirect(safeNext(new URL(request.url).searchParams.get("next")));
  return null;
}

/** What the form shows after a post. One shape, so the view stays simple. */
type SignInReply = { error?: string; sent?: string; email?: string; next: string };

/**
 * Turns a better-auth sign-in into a redirect that carries the session cookie,
 * or into the message the form shows. The password and the code both end here.
 */
async function land(
  attempt: Promise<Response>,
  wrong: SignInReply,
): Promise<SignInReply | Response> {
  const response = await attempt.catch(() => null);
  if (!response?.ok) return wrong;
  return withCookies(response, redirect(wrong.next));
}

export async function action({ request, context }: Route.ActionArgs): Promise<SignInReply | Response> {
  const env = context.get(cloudflareEnv);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(form.get("next"));

  if (!email) return { error: "Type your email address.", next };

  if (intent === "password") {
    const auth = createAuth(env, request);
    const password = String(form.get("password") ?? "");
    return land(
      auth.api.signInEmail({ body: { email, password }, headers: request.headers, asResponse: true }),
      { error: "That email and password do not match.", email, next },
    );
  }

  if (intent === "code") {
    const auth = createAuth(env, request);
    const otp = String(form.get("otp") ?? "").trim();
    return land(
      auth.api.signInEmailOTP({ body: { email, otp }, headers: request.headers, asResponse: true }),
      { error: "That code is wrong or too old.", email, sent: SENT, next },
    );
  }

  if (intent === "link") {
    // One mail carries both, because mail latency is the reason a code exists.
    const box = oneMail(createMailer(env));
    const auth = createAuth(env, request, box.mailer);

    // An unknown email must look the same as a known one, so neither call
    // changes the answer. A failed call is still worth a line in the log.
    await auth.api
      .signInMagicLink({ body: { email, callbackURL: next }, headers: request.headers })
      .catch((failure) => console.error("The magic link did not go out.", failure));
    await auth.api
      .sendVerificationOTP({ body: { email, type: "sign-in" }, headers: request.headers })
      .catch((failure) => console.error("The code did not go out.", failure));

    await box.flush();
    return { sent: SENT, email, next };
  }

  if (intent === "forgot") {
    const auth = createAuth(env, request);
    await auth.api
      .requestPasswordReset({ body: { email, redirectTo: "/reset-password" }, headers: request.headers })
      .catch(() => null);
    return { sent: "Check your mail for a link to set a new password.", email, next };
  }

  return { error: "That form does not name a way in.", next };
}

export default function SignIn({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const next = actionData?.next ?? safeNext(params.get("next"));
  const email = actionData?.email ?? "";

  return (
    <main className="mx-auto flex flex-1 max-w-md flex-col justify-center gap-8 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in to Tusker</h1>

      {actionData?.error ? (
        <p role="alert" className="rounded border border-red-300 p-3 text-red-700 dark:border-red-800 dark:text-red-400">
          {actionData.error}
        </p>
      ) : null}
      {actionData?.sent ? (
        <p role="status" className="rounded border border-neutral-300 p-3 dark:border-neutral-700">
          {actionData.sent}
        </p>
      ) : null}

      <Form method="post" className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={email}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            className={fieldClass}
          />
        </label>
        <button
          name="intent"
          value="password"
          className="rounded bg-neutral-900 px-3 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Sign in
        </button>
        <div className="flex gap-3 text-sm">
          <button name="intent" value="link" className="underline">
            Mail me a link and a code
          </button>
          <button name="intent" value="forgot" className="underline">
            Forgot the password
          </button>
        </div>
      </Form>

      <Form method="post" className="flex flex-col gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />
        <label className="flex flex-col gap-1 text-sm">
          Code from the mail
          <input
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            className={fieldClass}
          />
        </label>
        <button name="intent" value="code" className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700">
          Sign in with the code
        </button>
      </Form>
    </main>
  );
}
