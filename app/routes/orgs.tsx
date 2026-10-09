/**
 * The org directory: where a person who belongs to no org lands, and asks to
 * join one or more orgs. It is the only page that names an org to somebody
 * outside it, so it shows each org's name and colour and nothing else. It also
 * names the instance owner, for a person whose org is not listed.
 *
 * A person who belongs to an org does not see it. See ADR-0027 and ADR-0028.
 */

import { Form, redirect } from "react-router";

import { instanceOwner, type InstanceOwner } from "../accounts.server";
import { nameOf } from "../assignees";
import { cloudflareEnv } from "../context.server";
import {
  askToJoin,
  listDirectory,
  withdrawRequest,
  type ListedOrg,
} from "../join-requests.server";
import { createMailer } from "../mail.server";
import { OrgDot } from "../org-chip";
import { readOrgSet } from "../scope.server";
import type { Route } from "./+types/orgs";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Orgs — Tusker" }];
}

/** The signed-in person's id, or a redirect to their board when they belong to an org. */
async function requireNoOrg(request: Request, env: Env): Promise<string> {
  const set = await readOrgSet(request, env);
  if (set.orgs.length > 0) throw redirect("/me");
  return set.personId;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const personId = await requireNoOrg(request, env);
  return {
    orgs: await listDirectory(env.DB, personId),
    owner: await instanceOwner(env.DB),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const personId = await requireNoOrg(request, env);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const orgId = String(form.get("org") ?? "");

  if (intent === "withdraw") {
    await withdrawRequest(env.DB, personId, orgId);
    return { ok: "Request withdrawn." };
  }
  if (intent !== "ask") throw new Response("That form does not name an action.", { status: 400 });

  const asked = await askToJoin(
    { db: env.DB, mailer: createMailer(env), origin: new URL(request.url).origin },
    personId,
    orgId,
  );
  if (asked.outcome === "no-org") return { error: "Tusker holds no such org." };
  // A decline is final, so the row reads Declined and the ask is refused.
  if (asked.outcome === "declined") return { error: `${asked.org} declined your request.` };
  return { ok: `Request sent. The owners of ${asked.org} have a mail.` };
}

export default function Directory({ loaderData, actionData }: Route.ComponentProps) {
  const { orgs, owner } = loaderData;

  return (
    <main className="mx-auto flex flex-1 w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl tracking-tight">You belong to no org yet</h1>
      <p className="text-muted">
        Tasks live in orgs. Ask to join yours, and one of its owners answers.
      </p>

      {orgs.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {orgs.map((org) => (
            <li key={org.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <OrgDot color={org.color} />
                <span className="truncate">{org.name}</span>
              </span>
              <span className="ml-auto">
                <RequestControl org={org} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">This Tusker holds no org yet.</p>
      )}

      {actionData && "error" in actionData ? (
        <p role="alert" className="text-danger">
          {actionData.error}
        </p>
      ) : null}
      {actionData && "ok" in actionData ? <p className="text-muted">{actionData.ok}</p> : null}

      <Owner owner={owner} />
    </main>
  );
}

/** What one org's row offers: an ask, a withdraw while it waits, or the decline. */
function RequestControl({ org }: { org: ListedOrg }) {
  if (org.request === "declined") return <span className="text-muted">Declined</span>;

  if (org.request === "waiting") {
    return (
      <Form method="post" className="flex items-baseline gap-3">
        <input type="hidden" name="org" value={org.id} />
        <span className="text-muted">Requested</span>
        <button name="intent" value="withdraw" className="underline">
          Withdraw
        </button>
      </Form>
    );
  }

  return (
    <Form method="post">
      <input type="hidden" name="org" value={org.id} />
      <button name="intent" value="ask" className="rounded border border-border px-3 py-1">
        Ask to join
      </button>
    </Form>
  );
}

/** Who to contact when the person's org is not in the list. */
function Owner({ owner }: { owner: InstanceOwner | null }) {
  if (!owner) return null;
  return (
    <p className="text-muted">
      Your org is not listed? Ask {nameOf(owner)}, who set up this Tusker:{" "}
      <a href={`mailto:${owner.email}`} className="underline">
        {owner.email}
      </a>
      .
    </p>
  );
}
