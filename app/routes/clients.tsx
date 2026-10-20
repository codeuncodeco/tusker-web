/**
 * The clients of one org: one card per value of the org's client field, each
 * with its colour, how much is still open for it, and how many links and
 * notes it keeps. A card opens the client's page. See ADR-0036.
 *
 * An org that names no client field gets one line that says where to name it.
 */

import { Link } from "react-router";

import { clientPath } from "../client-tag";
import { countsByClient } from "../client-resources.server";
import { clientsOf } from "../clients.server";
import { colorCss } from "../colors";
import { cloudflareEnv } from "../context.server";
import { LinkIcon, Note } from "../icons";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/clients";
import { orgPagePath } from "../paths";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Clients — ${loaderData.org.name}` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);
  const found = await clientsOf(env.DB, scope);
  const counts = found ? await countsByClient(env.DB, scope, found.field.key) : {};

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    field: found ? { key: found.field.key, label: found.field.label } : null,
    clients: (found?.clients ?? []).map((client) => ({
      ...client,
      counts: counts[client.value] ?? { links: 0, notes: 0, open: 0 },
    })),
  };
}

export default function Clients({ loaderData }: Route.ComponentProps) {
  const { org, field, clients } = loaderData;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl tracking-tight">Clients</h1>

      {field === null ? (
        <p className="text-muted">
          {org.name} names no client field yet. On the{" "}
          <Link to={orgPagePath(org.slug, "fields")} className="underline">
            fields page
          </Link>
          , press <strong className="font-medium text-fg">Make it the client field</strong> on a select or a reference
          field, and each of its values gets a page here.
        </p>
      ) : clients.length === 0 ? (
        <p className="text-muted">
          The {field.label} field offers no values yet. Add some on the{" "}
          <Link to={orgPagePath(org.slug, "fields")} className="underline">
            fields page
          </Link>
          .
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client, at) => (
            <li
              key={client.value}
              style={{ animationDelay: `${at * 40}ms` }}
              className="motion-safe:animate-rise-in"
            >
              <Link
                to={clientPath(org.slug, client.value)}
                style={client.color ? { borderLeftColor: colorCss(client.color) } : undefined}
                className="press-soft group flex h-full flex-col gap-3 rounded-lg border border-l-[6px] border-border bg-surface p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="font-serif text-xl leading-tight">{client.label}</span>
                <span className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span className="tabular-nums">
                    <strong className="font-semibold text-fg">{client.counts.open}</strong> open
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <LinkIcon className="size-3" />
                    {client.counts.links}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <Note className="size-3" />
                    {client.counts.notes}
                  </span>
                  <span aria-hidden="true" className="ml-auto transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
