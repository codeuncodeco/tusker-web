/**
 * The account page: the name, the look, the orgs, the join requests still
 * waiting, and Sign out.
 *
 * The look is the person's colour and picture, which every card of every org
 * draws for them. A swatch saves on its one click, and a picture saves as it
 * is picked. See ADR-0034.
 *
 * It held `/me` until the unified board took that URL. `/me` now shows the
 * tasks, because a person opens Tusker to work, not to read a list of links.
 */

import { redirect } from "react-router";

import { AccountBody } from "../account-body";
import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { waitingFor, withdrawRequest } from "../join-requests.server";
import { listOrgsForPerson } from "../orgs.server";
import { lookOf, setPersonColor, setPersonImage, setPersonName } from "../people.server";
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
    look: await lookOf(env.DB, person.id),
    orgs,
    // Approval by one org leaves the rest waiting, and the directory is shut
    // to a member, so this is where they are withdrawn. See ADR-0028.
    requests: await waitingFor(env.DB, person.id),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const form = await request.formData();

  const intent = form.get("intent");

  if (intent === "withdraw") {
    const person = await requirePerson(request, env);
    await withdrawRequest(env.DB, person.id, String(form.get("org") ?? ""));
    return null;
  }

  // The look and the name. A refusal comes back as the page's one error line.
  if (intent === "color" || intent === "image" || intent === "name") {
    const person = await requirePerson(request, env);
    if (intent === "color") return setPersonColor(env.DB, person.id, form.get("color"));
    if (intent === "image") return setPersonImage(env.DB, person.id, form.get("image"));
    await setPersonName(env.DB, person.id, form.get("name"));
    return null;
  }

  const auth = createAuth(env, request);
  const response = await auth.api.signOut({ headers: request.headers, asResponse: true });
  return withCookies(response, redirect("/login"));
}

export default function Account({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto flex flex-1 max-w-2xl flex-col justify-center gap-6 p-8">
      <AccountBody {...loaderData} />
    </main>
  );
}
