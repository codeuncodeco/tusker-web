import { Form, Link } from "react-router";

import { cloudflareEnv } from "../context.server";
import { fieldClass } from "../forms";
import { addMember, listMembers } from "../orgs.server";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/members";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Members of ${loaderData.org.name} — Tusker` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);
  return {
    org: { slug: scope.org.slug, name: scope.org.name, kind: scope.org.kind },
    members: await listMembers(env.DB, scope.org.id),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Name the email of the account to add." };

  const added = await addMember(env.DB, scope.org.id, email);
  if (added === "no-account") {
    return { error: `No account holds ${email}. Invite them first, then add them here.` };
  }
  if (added === "already") return { error: `${email} is already a member.` };
  return { ok: `${email} is a member now.` };
}

export default function Members({ loaderData, actionData }: Route.ComponentProps) {
  const { org, members } = loaderData;

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <nav className="flex gap-4 text-sm">
          <Link to={`/o/${org.slug}/board`} className="underline">
            Board
          </Link>
          <Link to={`/o/${org.slug}/settings`} className="underline">
            Settings
          </Link>
          <Link to={`/o/${org.slug}/fields`} className="underline">
            Fields
          </Link>
        </nav>
      </header>

      <ul className="flex flex-col gap-1">
        {members.map((member) => (
          <li key={member.id}>
            {member.name || member.email}{" "}
            <span className="text-neutral-500">{member.email}</span>{" "}
            <span className="text-xs uppercase tracking-wide text-neutral-500">{member.role}</span>
          </li>
        ))}
      </ul>

      {org.kind === "personal" ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          A personal org holds one person. Make another org to work with somebody else.
        </p>
      ) : (
        <Form method="post" className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            Add by email
            <input name="email" type="email" required className={fieldClass} />
          </label>

          {actionData && "error" in actionData ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {actionData.error}
            </p>
          ) : null}
          {actionData && "ok" in actionData ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{actionData.ok}</p>
          ) : null}

          <button className="self-start rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700">
            Add
          </button>
        </Form>
      )}
    </main>
  );
}
