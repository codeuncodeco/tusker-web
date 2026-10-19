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

import { useRef } from "react";
import { Form, Link, redirect, useFetcher } from "react-router";

import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { waitingFor, withdrawRequest } from "../join-requests.server";
import { initialsOf } from "../assignees";
import { ImageIcon, XMark } from "../icons";
import { Avatar } from "../initials";
import { OrgDot } from "../org-chip";
import { listOrgsForPerson } from "../orgs.server";
import { lookOf, setPersonColor, setPersonImage, setPersonName } from "../people.server";
import { SavedInput } from "../saved-input";
import { Swatches } from "../swatches";
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

/** The side of the square a picture is cut to. Twice the largest avatar a card draws, for sharp screens. */
const PICTURE_SIDE = 96;

/**
 * A picture file, cut to a centred square and shrunk to `PICTURE_SIDE`, as a
 * JPEG data URL. A board draws it at a few dozen pixels, so a few kilobytes
 * hold it, and the row stays small.
 */
async function squarePicture(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = PICTURE_SIDE;
  canvas.height = PICTURE_SIDE;
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PICTURE_SIDE, PICTURE_SIDE);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Who you are on every card: your picture or your initials on your colour, the
 * name beside it, and one click to change any of them.
 */
function Look({ person, look }: { person: { name: string; email: string }; look: { color: string | null; image: string | null } }) {
  const fetcher = useFetcher<{ error: string } | null>();
  const file = useRef<HTMLInputElement>(null);

  // What is in flight draws at once, before the post comes back.
  const sent = fetcher.formData;
  const color = sent?.get("intent") === "color" ? String(sent.get("color")) : look.color;
  const image = sent?.get("intent") === "image" ? String(sent.get("image")) || null : look.image;
  const name = sent?.get("intent") === "name" ? String(sent.get("name")) : person.name;
  const shown = { initials: initialsOf({ name, email: person.email }), color: color ?? undefined, image: image ?? undefined };

  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative self-start">
        {/* The key draws it again on every change, so it pops. */}
        <span key={`${color}${image ? "+" : ""}${shown.initials}`} className="flex motion-safe:animate-pop">
          <Avatar person={shown} size="lg" className="border-[3px]" />
        </span>
        <button
          type="button"
          onClick={() => file.current?.click()}
          aria-label={image ? "Change your picture" : "Add a picture"}
          title={image ? "Change your picture" : "Add a picture"}
          className="press absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border border-border bg-surface shadow-sm hover:bg-surface-2"
        >
          <ImageIcon className="size-3.5" />
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            if (!picked) return;
            void fetcher.submit({ intent: "image", image: await squarePicture(picked) }, { method: "post" });
          }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* The heading names the page; the box beside it changes the name in
            place, and saves when it is left. */}
        <h1 className="sr-only">{name || person.email}</h1>
        <SavedInput
          value={name}
          aria-label="Your name"
          placeholder={person.email}
          onSave={(typed) => void fetcher.submit({ intent: "name", name: typed }, { method: "post" })}
          className="-mx-1 w-full rounded border border-transparent bg-transparent px-1 font-serif text-3xl tracking-tight hover:border-border focus:border-fg focus:outline-none"
        />
        <p className="text-muted">{person.email}</p>
        <Form method="post" className="flex flex-col gap-1.5">
          <input type="hidden" name="intent" value="color" />
          <span className="text-xs uppercase tracking-wide text-muted">Your colour</span>
          <Swatches
            name="color"
            value={color}
            label="Your colour"
            onPick={(picked) => void fetcher.submit({ intent: "color", color: picked }, { method: "post" })}
            extra={
              image ? (
                <button
                  type="button"
                  onClick={() => void fetcher.submit({ intent: "image", image: "" }, { method: "post" })}
                  className="press ml-2 flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-fg"
                >
                  <XMark className="size-3" />
                  Remove picture
                </button>
              ) : null
            }
          />
        </Form>
        {fetcher.data?.error ? (
          <p role="alert" className="text-danger motion-safe:animate-shake">
            {fetcher.data.error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { person, look, orgs, requests } = loaderData;

  return (
    <main className="mx-auto flex flex-1 max-w-2xl flex-col justify-center gap-6 p-8">
      <Look person={person} look={look} />

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
