import { Form } from "react-router";

import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { fieldClass } from "../forms";
import { inviteToOrg } from "../invites.server";
import { createMailer } from "../mail.server";
import { listMembers } from "../orgs.server";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/members";

/** A personal org holds one person, so it has no member to add. */
const PERSONAL_ORG = "A personal org holds one person. Make another org to work with somebody else.";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Members of ${loaderData.org.name} — Tusker` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);
  return {
    org: { slug: scope.org.slug, name: scope.org.name, kind: scope.org.kind },
    members: await listMembers(env.DB, scope.org.id),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  if (scope.org.kind === "personal") return { error: PERSONAL_ORG };

  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Name the email of the person to invite." };

  const mailer = createMailer(env);
  const invited = await inviteToOrg(
    { db: env.DB, auth: createAuth(env, request, mailer), mailer, origin: new URL(request.url).origin },
    { org: scope.org, byId: scope.personId, email },
  );

  if (invited === "already") return { error: `${email} is already a member.` };
  if (invited === "invited") {
    return { ok: `${email} is a member now. Tusker mailed them a link to sign in.` };
  }
  return { ok: `${email} is a member now. Tusker mailed them.` };
}

export default function Members({ loaderData, actionData }: Route.ComponentProps) {
  const { org, members } = loaderData;

  return (
    <main className="mx-auto flex flex-1 max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl tracking-tight">Members</h1>

      <ul className="flex flex-col gap-1">
        {members.map((member) => (
          <li key={member.id}>
            {member.name || member.email}{" "}
            <span className="text-muted">{member.email}</span>{" "}
            <span className="text-xs uppercase tracking-wide text-muted">{member.role}</span>
          </li>
        ))}
      </ul>

      {org.kind === "personal" ? (
        <p className="text-muted">
          {PERSONAL_ORG}
        </p>
      ) : (
        <Form method="post" className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            Invite by email
            <input name="email" type="email" required className={fieldClass} />
          </label>
          <p className="text-muted">
            An email no account holds gets one, and a mail with a link to sign in.
          </p>

          {actionData && "error" in actionData ? (
            <p role="alert" className="text-danger">
              {actionData.error}
            </p>
          ) : null}
          {actionData && "ok" in actionData ? (
            <p className="text-muted">{actionData.ok}</p>
          ) : null}

          <button className="self-start rounded border border-border px-3 py-2">
            Invite
          </button>
        </Form>
      )}
    </main>
  );
}
