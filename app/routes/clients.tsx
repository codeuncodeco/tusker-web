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
import { ModalControls } from "../route-modal";
import { requireScope } from "../scope.server";
import { Bento, Stat, Tile } from "../bento";
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

  const open = clients.reduce((sum, one) => sum + one.counts.open, 0);
  // The client with the most open work takes a wide tile. See ADR-0040.
  const busiest = clients.reduce<string | null>(
    (best, one) => (best === null || one.counts.open > (clients.find((c) => c.value === best)?.counts.open ?? 0) ? one.value : best),
    null,
  );

  return (
    <main className="flex flex-col gap-3">
      <Bento>
        <Tile span={4} tone="plain" className="p-1!">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-6 gap-y-2">
              <h1 className="font-serif text-3xl tracking-tight">Clients</h1>
              {field ? (
                <>
                  <Stat value={clients.length} word={clients.length === 1 ? "client" : "clients"} />
                  <Stat value={open} word="open" />
                </>
              ) : null}
            </div>
            <ModalControls />
          </div>
        </Tile>

        {field === null ? (
          <Tile span={4}>
            <p className="text-muted">
              {org.name} names no client field yet. On the{" "}
              <Link to={orgPagePath(org.slug, "fields")} className="underline">
                fields page
              </Link>
              , press <strong className="font-medium text-fg">Make it the client field</strong> on a select or a
              reference field, and each of its values gets a page here.
            </p>
          </Tile>
        ) : clients.length === 0 ? (
          <Tile span={4}>
            <p className="text-muted">
              The {field.label} field offers no values yet. Add some on the{" "}
              <Link to={orgPagePath(org.slug, "fields")} className="underline">
                fields page
              </Link>
              .
            </p>
          </Tile>
        ) : (
          clients.map((client, at) => (
            <Link
              key={client.value}
              to={clientPath(org.slug, client.value)}
              style={{
                animationDelay: `${at * 30}ms`,
                ...(client.color ? { borderLeftColor: colorCss(client.color) } : {}),
              }}
              className={`press-soft group flex min-h-36 flex-col gap-3 rounded-2xl border-l-[6px] border-transparent bg-surface p-4 hover:bg-surface-2 motion-safe:animate-rise-in ${
                client.value === busiest && clients.length > 2 ? "col-span-2 sm:row-span-2" : "col-span-1"
              }`}
            >
              <span className="font-serif text-xl leading-tight">{client.label}</span>
              <span className="mt-auto flex items-end gap-4">
                <Stat value={client.counts.open} word="open" />
                <span className="ml-auto flex items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1 tabular-nums">
                    <LinkIcon className="size-3" />
                    {client.counts.links}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <Note className="size-3" />
                    {client.counts.notes}
                  </span>
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </span>
            </Link>
          ))
        )}
      </Bento>
    </main>
  );
}
