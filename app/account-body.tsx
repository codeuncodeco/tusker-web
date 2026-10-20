/**
 * What the account page and the account modal draw: the person's look and
 * name, their orgs, the join requests still waiting, and Sign out. One block,
 * so the page a link opens and the modal the profile button opens cannot
 * drift apart. Every form here names `/account`, so it posts there from
 * whichever page the modal sits over. See ADR-0034.
 */

import { useRef } from "react";
import { Form, Link, useFetcher } from "react-router";

import { initialsOf, type Me } from "./assignees";
import { ArrowRight, Building, ImageIcon, Plus, Users, XMark } from "./icons";
import { Bento, Tile } from "./bento";
import { Avatar } from "./initials";
import { orgPagePath } from "./paths";
import { ModalControls } from "./route-modal";
import { OrgDot } from "./org-chip";
import { SavedInput } from "./saved-input";
import { Swatches } from "./swatches";

/** Where every form of the account posts. */
export const ACCOUNT = "/account";

/** What the account loader answers, as this block reads it. */
export type AccountData = {
  person: { name: string; email: string };
  look: { color: string | null; image: string | null };
  orgs: { id: string; slug: string; name: string; color: string | null }[];
  requests: { id: string; name: string; color: string | null }[];
};

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
            void fetcher.submit({ intent: "image", image: await squarePicture(picked) }, { method: "post", action: ACCOUNT });
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
          onSave={(typed) => void fetcher.submit({ intent: "name", name: typed }, { method: "post", action: ACCOUNT })}
          className="-mx-1 w-full rounded border border-transparent bg-transparent px-1 font-serif text-3xl tracking-tight hover:border-border focus:border-fg focus:outline-none"
        />
        <p className="text-muted">{person.email}</p>
        <Form method="post" action={ACCOUNT} className="flex flex-col gap-1.5">
          <input type="hidden" name="intent" value="color" />
          <span className="text-xs uppercase tracking-wide text-muted">Your colour</span>
          <Swatches
            name="color"
            value={color}
            label="Your colour"
            onPick={(picked) => void fetcher.submit({ intent: "color", color: picked }, { method: "post", action: ACCOUNT })}
            extra={
              image ? (
                <button
                  type="button"
                  onClick={() => void fetcher.submit({ intent: "image", image: "" }, { method: "post", action: ACCOUNT })}
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

/**
 * Who you are, small: the head of the You panel. Your avatar, which a tap
 * changes the picture of; your name, edited in place; your email; and your
 * colour, one click a swatch. It posts to `/account`, as the account page
 * does, and the dock's avatar follows. See ADR-0040.
 */
export function Identity({ me }: { me: Me }) {
  const fetcher = useFetcher<{ error: string } | null>();
  const file = useRef<HTMLInputElement>(null);
  const sent = fetcher.formData;
  const color = sent?.get("intent") === "color" ? String(sent.get("color")) : (me.color ?? null);
  const image = sent?.get("intent") === "image" ? String(sent.get("image")) || null : (me.image ?? null);
  const name = sent?.get("intent") === "name" ? String(sent.get("name")) : me.name;
  const shown = {
    initials: initialsOf({ name, email: me.email ?? "" }),
    color: color ?? undefined,
    image: image ?? undefined,
  };
  const post = (fields: Record<string, string>) => void fetcher.submit(fields, { method: "post", action: ACCOUNT });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => file.current?.click()}
          aria-label={image ? "Change your picture" : "Add a picture"}
          title={image ? "Change your picture" : "Add a picture"}
          className="press group relative shrink-0 rounded-full"
        >
          <Avatar person={shown} size="md" className="size-12 border-2 text-xs" />
          <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border border-border bg-surface text-muted group-hover:text-fg">
            <ImageIcon className="size-2.5" />
          </span>
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            if (picked) post({ intent: "image", image: await squarePicture(picked) });
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <SavedInput
            value={name}
            aria-label="Your name"
            placeholder={me.email}
            onSave={(typed) => post({ intent: "name", name: typed })}
            className="-mx-1 w-full truncate rounded-md border border-transparent bg-transparent px-1 font-medium hover:border-border focus:border-fg focus:outline-none"
          />
          {me.email ? <span className="truncate text-xs text-muted">{me.email}</span> : null}
        </div>
      </div>
      <Swatches
        name="color"
        value={color}
        label="Your colour"
        onPick={(picked) => post({ intent: "color", color: picked })}
      />
      {fetcher.data?.error ? (
        <p role="alert" className="text-xs text-danger motion-safe:animate-shake">
          {fetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}

export function AccountBody({ person, look, orgs, requests }: AccountData) {
  const withdraw = useFetcher();

  // A bento: who you are across the top, your orgs, the requests waiting,
  // and the way out. See ADR-0040.
  return (
    <Bento>
      <Tile span={4} className="relative sm:pr-32">
        <Look person={person} look={look} />
        <ModalControls className="absolute right-3 top-3" />
      </Tile>

      <Tile span={2} label="Orgs" icon={<Building className="size-3" />} action={<span className="font-mono text-[0.625rem] tabular-nums text-dim">{orgs.length}</span>}>
        <ul className="-mx-2 flex flex-col">
          {orgs.map((org) => (
            <li key={org.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <OrgDot color={org.color} />
              <Link to={`/o/${org.slug}/board`} className="min-w-0 flex-1 truncate">
                {org.name}
              </Link>
              <Link to={orgPagePath(org.slug, "members")} className="text-xs text-muted hover:text-fg">
                Members
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/orgs/new" className="press mt-auto inline-flex items-center gap-1.5 self-start rounded-full bg-surface-2 px-3 py-1 text-xs text-muted hover:text-fg">
          <Plus className="size-3" />
          New org
        </Link>
      </Tile>

      {requests.length > 0 ? (
        <Tile span={2} label="Asked to join" icon={<Users className="size-3" />}>
          <ul className="flex flex-col gap-1">
            {requests.map((org) => (
              <li key={org.id} className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <OrgDot color={org.color} />
                  <span className="truncate">{org.name}</span>
                </span>
                <withdraw.Form method="post" action={ACCOUNT}>
                  <input type="hidden" name="org" value={org.id} />
                  <button name="intent" value="withdraw" className="press rounded-full px-2.5 py-1 text-xs text-danger hover:bg-danger/10">
                    Withdraw
                  </button>
                </withdraw.Form>
              </li>
            ))}
          </ul>
        </Tile>
      ) : null}

      <Tile span={requests.length > 0 ? 4 : 2} label="Session" icon={<ArrowRight className="size-3" />}>
        <Form method="post" action={ACCOUNT} className="mt-auto">
          <button className="press rounded-xl border border-border px-4 py-2 text-danger hover:bg-danger/10">Sign out</button>
        </Form>
      </Tile>
    </Bento>
  );
}
