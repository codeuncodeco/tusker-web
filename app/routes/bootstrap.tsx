import { Form, redirect } from "react-router";

import { createAccount, noAccountYet } from "../accounts.server";
import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { MIN_PASSWORD, fieldClass } from "../forms";
import { withCookies } from "../session.server";
import type { Route } from "./+types/bootstrap";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Set up Tusker" }];
}

/**
 * Makes the first account. The route is open while the `user` table is empty,
 * and it is gone the moment that account lands.
 *
 * A fresh deploy is therefore public until somebody uses this page. Whoever
 * posts first owns the instance, so open the page yourself right after the
 * first deploy. Every account after this one comes from `POST /api/invite`.
 */
export async function loader({ context }: Route.LoaderArgs) {
  await onlyWhileEmpty(context.get(cloudflareEnv).DB);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  await onlyWhileEmpty(env.DB);

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (!email.includes("@")) return { error: "Type your email address.", email, name };
  if (password.length < MIN_PASSWORD) {
    return { error: `The password needs ${MIN_PASSWORD} characters or more.`, email, name };
  }

  const auth = createAuth(env, request);
  await createAccount(auth, { email, name: name || undefined, password });

  // The password goes straight into a session, so the first person never waits
  // on mail that an empty instance may not yet be able to send.
  const response = await auth.api
    .signInEmail({ body: { email, password }, headers: request.headers, asResponse: true })
    .catch(() => null);

  if (!response?.ok) throw redirect("/login");
  return withCookies(response, redirect("/account"));
}

/** The route exists only while no account does. After that it is a 404. */
async function onlyWhileEmpty(db: D1Database) {
  if (!(await noAccountYet(db))) throw new Response("Not found", { status: 404 });
}

export default function Bootstrap({ actionData }: Route.ComponentProps) {
  return (
    <main className="mx-auto flex flex-1 max-w-md flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Set up Tusker</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        This instance holds no account yet. The one you make here is the first, and this page
        closes behind it.
      </p>

      {actionData?.error ? (
        <p role="alert" className="rounded border border-red-300 p-3 text-red-700 dark:border-red-800 dark:text-red-400">
          {actionData.error}
        </p>
      ) : null}

      <Form method="post" className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" autoComplete="name" defaultValue={actionData?.name ?? ""} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={actionData?.email ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
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
          Make the first account
        </button>
      </Form>
    </main>
  );
}
