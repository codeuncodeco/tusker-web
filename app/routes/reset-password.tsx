import { Form, Link, redirect, useSearchParams } from "react-router";

import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { MIN_PASSWORD, fieldClass } from "../forms";
import type { Route } from "./+types/reset-password";

/** The one message a dead link earns, from the action and from `?error=`. */
const STALE = "That link is wrong or too old.";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Set a new password — Tusker" }];
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");

  if (!token) return { error: "That link carries no token." };
  if (password.length < MIN_PASSWORD) {
    return { error: `The password needs ${MIN_PASSWORD} characters or more.` };
  }

  const auth = createAuth(context.get(cloudflareEnv), request);
  const done = await auth.api
    .resetPassword({ body: { token, newPassword: password }, headers: request.headers })
    .catch(() => null);

  if (!done) return { error: STALE };
  throw redirect("/login");
}

export default function ResetPassword({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  // better-auth sends a wrong or old link here with `?error=`, and no token.
  const stale = params.get("error") ? STALE : null;
  const error = actionData?.error ?? stale;

  return (
    <main className="mx-auto flex flex-1 max-w-md flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl tracking-tight">Set a new password</h1>

      {error ? (
        <p role="alert" className="rounded border border-danger p-3 text-danger">
          {error}{" "}
          {/* A dead token answers the same way every time, so the message
              carries the way out, not only the bad news. */}
          <Link to="/login" className="underline">
            Ask for a new one
          </Link>
          .
        </p>
      ) : null}

      <Form method="post" className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <label className="flex flex-col gap-1">
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            className={fieldClass}
          />
        </label>
        <button className="rounded bg-fg px-3 py-2 text-bg">
          Save the password
        </button>
      </Form>
    </main>
  );
}
