import { Form, redirect, useSearchParams } from "react-router";

import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { MIN_PASSWORD, fieldClass } from "../forms";
import type { Route } from "./+types/reset-password";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Set a new password — Tusker" }];
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");

  if (!token) return { error: "That link carries no token. Ask for a new one." };
  if (password.length < MIN_PASSWORD) {
    return { error: `The password needs ${MIN_PASSWORD} characters or more.` };
  }

  const auth = createAuth(context.get(cloudflareEnv), request);
  const done = await auth.api
    .resetPassword({ body: { token, newPassword: password }, headers: request.headers })
    .catch(() => null);

  if (!done) return { error: "That link is wrong or too old. Ask for a new one." };
  throw redirect("/sign-in");
}

export default function ResetPassword({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  // better-auth sends a wrong or old link here with `?error=`, and no token.
  const stale = params.get("error") ? "That link is wrong or too old. Ask for a new one." : null;
  const error = actionData?.error ?? stale;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Set a new password</h1>

      {error ? (
        <p role="alert" className="rounded border border-red-300 p-3 text-red-700 dark:border-red-800 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <Form method="post" className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <label className="flex flex-col gap-1 text-sm">
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
        <button className="rounded bg-neutral-900 px-3 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900">
          Save the password
        </button>
      </Form>
    </main>
  );
}
