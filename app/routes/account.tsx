/**
 * The account page: the name, the orgs, the join requests still waiting, and
 * Sign out.
 *
 * It held `/me` until the unified board took that URL. `/me` now shows the
 * tasks, because a person opens Tusker to work, not to read a list of links.
 */

import { Form, Link, redirect } from "react-router";

import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { waitingFor, withdrawRequest } from "../join-requests.server";
import { OrgDot } from "../org-chip";
import { listOrgsForPerson } from "../orgs.server";
import { requirePerson, withCookies } from "../session.server";
import type { Route } from "./+types/account";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Your account — Tusker" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const person = await requirePerson(request, env);
  const orgs = await listOrgsForPerson(env.DB, person.id);
  return {
    person: { name: person.name, email: person.email },
    orgs,
    // Approval by one org leaves the rest waiting, and the directory is shut
    // to a member, so this is where they are withdrawn. See ADR-0028.
    requests: await waitingFor(env.DB, person.id),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const form = await request.formData();

  if (form.get("intent") === "withdraw") {
    const person = await requirePerson(request, env);
    await withdrawRequest(env.DB, person.id, String(form.get("org") ?? ""));
    return null;
  }

  const auth = createAuth(env, request);
  const response = await auth.api.signOut({ headers: request.headers, asResponse: true });
  return withCookies(response, redirect("/login"));
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { person, orgs, requests } = loaderData;

  return (
    <main className="mx-auto flex flex-1 max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl tracking-tight">{person.name || person.email}</h1>
      <p className="text-muted">{person.email}</p>

      <section className="rounded-lg border border-border p-4">
        <h2 className="uppercase tracking-wide text-muted">Orgs</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {orgs.map((org) => (
            <li key={org.id}>
              <Link to={`/o/${org.slug}/board`} className="underline">
                {org.name}
              </Link>{" "}
              <span className="text-muted">/{org.slug}</span>{" "}
              <Link to={`/o/${org.slug}/members`} className="ml-2 underline">
                Members
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/orgs/new" className="mt-3 inline-block underline">
          New org
        </Link>
      </section>

      {requests.length > 0 ? (
        <section className="rounded-lg border border-border p-4">
          <h2 className="uppercase tracking-wide text-muted">Asked to join</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {requests.map((org) => (
              <li key={org.id} className="flex items-center gap-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <OrgDot color={org.color} />
                  <span className="truncate">{org.name}</span>
                </span>
                <Form method="post">
                  <input type="hidden" name="org" value={org.id} />
                  <button name="intent" value="withdraw" className="underline">
                    Withdraw
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Form method="post">
        <button className="rounded border border-border px-3 py-2">Sign out</button>
      </Form>
    </main>
  );
}
