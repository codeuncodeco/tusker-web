/**
 * One client's page: everything an org keeps about one of its clients, where
 * the work for it is. Its links (a Figma file, a brief, a Loom), its meeting
 * notes, and the tasks still open for it. See ADR-0036.
 *
 * Every act is one move. A pasted link is added as it lands in the box. "New
 * note" opens a note dated today with the caret in it, and leaving the note
 * saves it. A colour is one click. Only a delete asks, by a hold.
 *
 * The client is a value of the org's client field, named in the address by
 * the value tasks store. A value the field does not offer is a 404.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";

import { STATUS_LABEL, type Status } from "../board";
import {
  addLink,
  addNote,
  deleteResource,
  editResource,
  listResources,
  openTasksOf,
  tickNote,
  type ClientLink,
  type ClientNote,
  type ClientTask,
} from "../client-resources.server";
import { clientOf } from "../clients.server";
import { colorCss, readColor } from "../colors";
import { setColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { DescriptionView } from "../description-view";
import { handleDescEditKey, handleEditorPaste } from "../editor";
import { fieldName } from "../field-filter";
import { HoldButton } from "../hold-button";
import {
  Check,
  Copy,
  Dropbox,
  External,
  Figma,
  GitHub,
  GoogleDrive,
  LinkIcon,
  Note,
  Play,
  Plus,
  Slack,
  Trash,
  XMark,
  YouTube,
} from "../icons";
import type { LinkKind } from "../links";
import { readLink } from "../links";
import { OrgDot } from "../org-chip";
import { taskPath } from "../paths";
import { useSent } from "../pending";
import { SavedInput } from "../saved-input";
import { requireScope } from "../scope.server";
import { Swatches } from "../swatches";
import type { Route } from "./+types/client";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.client.label} — ${loaderData.org.name}` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);
  const found = await clientOf(env.DB, scope, params.client);
  if (!found) throw new Response("Not found", { status: 404 });

  const [resources, open] = await Promise.all([
    listResources(env.DB, scope, found.client.value),
    openTasksOf(env.DB, scope, found.field.key, found.client.value),
  ]);

  return {
    org: { slug: scope.org.slug, name: scope.org.name, color: scope.org.color },
    field: { key: found.field.key, label: found.field.label },
    client: found.client,
    links: resources.links,
    notes: resources.notes,
    open,
    day: dayOf(request),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);
  const found = await clientOf(env.DB, scope, params.client);
  if (!found) throw new Response("Not found", { status: 404 });
  const client = found.client.value;

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");

  if (intent === "link") {
    const added = await addLink(env.DB, scope, client, { url: form.get("url"), title: form.get("title") });
    return "error" in added ? added : { added: added.id };
  }

  if (intent === "note") {
    const added = await addNote(env.DB, scope, client, dayOf(request));
    return { note: added.id };
  }

  if (intent === "edit") {
    // Only the parts the form names change, so a title saved alone leaves the
    // text of the note as it is.
    const change = Object.fromEntries(
      (["title", "body", "day"] as const).filter((name) => form.has(name)).map((name) => [name, form.get(name)]),
    );
    const edited = await editResource(env.DB, scope, id, change);
    if (edited === false) throw new Response("Not found", { status: 404 });
    return edited === true ? { ok: true } : edited;
  }

  if (intent === "tick") {
    await tickNote(env.DB, scope, id, Number(form.get("box")));
    return { ok: true };
  }

  if (intent === "delete") {
    await deleteResource(env.DB, scope, id);
    return { ok: true };
  }

  if (intent === "color") {
    const read = readColor(form.get("color"));
    if ("error" in read) return read;
    await setColors(env.DB, scope, found.field.key, { [client]: read.color });
    return { ok: true };
  }

  throw new Response("That form does not name an action.", { status: 400 });
}

/** The ids whose delete is in flight, so a deleted card goes at once. */
function useDeleting(): Set<string> {
  return new Set(
    useSent()
      .filter((form) => form.get("intent") === "delete")
      .map((form) => String(form.get("id"))),
  );
}

export default function Client({ loaderData }: Route.ComponentProps) {
  const { org, field, client, links, notes, open, day } = loaderData;
  const deleting = useDeleting();
  const shownLinks = links.filter((one) => !deleting.has(one.id));
  const shownNotes = notes.filter((one) => !deleting.has(one.id));
  const board = `/o/${org.slug}/board?${new URLSearchParams({ assignee: "anyone", [fieldName(field.key)]: client.value })}`;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-8">
      <Hero org={org} client={client} counts={{ open: open.length, links: shownLinks.length, notes: shownNotes.length }} board={board} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Links links={shownLinks} />
          <Notes notes={shownNotes} day={day} />
        </div>
        <OpenTasks tasks={open} board={board} label={client.label} />
      </div>
    </main>
  );
}

/**
 * The top of the page: the client's name on a wash of its colour, its org, the
 * counts, and a row of swatches that recolours it everywhere in one click.
 */
function Hero({
  org,
  client,
  counts,
  board,
}: {
  org: { slug: string; name: string; color: string | null };
  client: { value: string; label: string; color: string | null };
  counts: { open: number; links: number; notes: number };
  board: string;
}) {
  const fetcher = useFetcher();
  const sent = fetcher.formData;
  const color = sent ? String(sent.get("color")) || null : client.color;
  const paint = color ? colorCss(color) : "var(--color-dim)";

  return (
    <header
      style={{
        backgroundImage: `linear-gradient(120deg, color-mix(in oklab, ${paint} 26%, transparent), color-mix(in oklab, ${paint} 6%, transparent) 70%)`,
        borderColor: `color-mix(in oklab, ${paint} 40%, transparent)`,
      }}
      className="flex flex-col gap-4 rounded-xl border p-6 transition-[background-image,border-color] duration-500"
    >
      <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
        <Link to={`/o/${org.slug}/clients`} className="hover:text-fg hover:underline">
          Clients
        </Link>
        <span aria-hidden="true">/</span>
        <OrgDot color={org.color} />
        {org.name}
      </span>
      <h1 className="font-serif text-4xl tracking-tight">{client.label}</h1>
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <Stat value={counts.open} word="open" />
        <Stat value={counts.links} word={counts.links === 1 ? "link" : "links"} />
        <Stat value={counts.notes} word={counts.notes === 1 ? "note" : "notes"} />
        <Link
          to={board}
          className="press ml-1 inline-flex items-center gap-1 rounded-full border border-fg bg-fg px-3 py-1 text-xs text-bg hover:opacity-90"
        >
          See on the board →
        </Link>
      </span>
      <fetcher.Form method="post" className="flex items-center gap-3">
        <input type="hidden" name="intent" value="color" />
        <span className="text-xs uppercase tracking-wide text-muted">Colour</span>
        <Swatches
          name="color"
          value={color}
          label={`Colour of ${client.label}`}
          onPick={(picked) => void fetcher.submit({ intent: "color", color: picked }, { method: "post" })}
        />
      </fetcher.Form>
    </header>
  );
}

/** One count of the hero. The key draws it again when it changes, so it ticks. */
function Stat({ value, word }: { value: number; word: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full bg-bg/70 px-3 py-1 text-xs">
      <strong key={value} className="inline-block font-semibold tabular-nums motion-safe:animate-tick">
        {value}
      </strong>
      <span className="text-muted">{word}</span>
    </span>
  );
}

/** A section's heading, with its count and whatever acts it holds. */
function SectionHead({ title, icon, children }: { title: string; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-xl">{title}</h2>
      <span className="ml-auto flex items-center gap-2">{children}</span>
    </div>
  );
}

/**
 * The links: a box that adds a link the moment one is pasted into it, then a
 * card per link. A card opens its link in a new tab; beside it, Copy and ✕.
 */
function Links({ links }: { links: ClientLink[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title="Links" icon={<LinkIcon className="size-4 text-muted" />} />
      <LinkPaste />
      {links.length === 0 ? (
        <p className="text-muted">
          Nothing here yet. Paste the Figma file, the brief, the shared folder: whatever you reach for.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {links.map((link) => (
            <LinkCard key={link.id} link={link} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The paste box. A paste of a link into the empty box adds it at once, so one
 * move is the whole act; typing and Enter adds it too. A refusal shakes the box
 * and says why under it.
 */
function LinkPaste() {
  const fetcher = useFetcher<{ error?: string; added?: string }>();
  const box = useRef<HTMLInputElement>(null);
  const busy = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  // A link that landed empties the box, ready for the next.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.added && box.current) box.current.value = "";
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post" className="flex flex-col gap-1">
      <input type="hidden" name="intent" value="link" />
      <span className={`flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 focus-within:border-solid focus-within:border-fg ${error ? "motion-safe:animate-shake" : ""}`}>
        <Plus className="size-3.5 text-muted" />
        <input
          ref={box}
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          placeholder="Paste a link: Figma, Google Docs, Notion, Loom, anything"
          aria-label="Add a link"
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (event.currentTarget.value.trim() !== "" || !readLink(pasted)) return;
            event.preventDefault();
            event.currentTarget.value = pasted.trim();
            void fetcher.submit({ intent: "link", url: pasted.trim() }, { method: "post" });
          }}
          className="h-11 min-w-0 flex-1 bg-transparent focus:outline-none"
        />
        <button disabled={busy} className="press rounded px-2 py-1 text-xs text-muted hover:text-fg">
          {busy ? "Adding…" : "Add ↵"}
        </button>
      </span>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </fetcher.Form>
  );
}

/** The mark and the colour each service's tile draws. */
const KIND_LOOK: Record<LinkKind, { mark: (className: string) => React.ReactNode; color: string }> = {
  figma: { mark: (c) => <Figma className={c} />, color: "#f24e1e" },
  "google-doc": { mark: (c) => <GoogleDrive className={c} />, color: "#4285f4" },
  "google-sheet": { mark: (c) => <GoogleDrive className={c} />, color: "#0f9d58" },
  "google-slides": { mark: (c) => <GoogleDrive className={c} />, color: "#f4b400" },
  "google-drive": { mark: (c) => <GoogleDrive className={c} />, color: "#1fa463" },
  notion: { mark: () => <span className="font-serif text-base font-semibold leading-none">N</span>, color: "var(--color-fg)" },
  github: { mark: (c) => <GitHub className={c} />, color: "var(--color-fg)" },
  loom: { mark: (c) => <Play className={c} />, color: "#625df5" },
  youtube: { mark: (c) => <YouTube className={c} />, color: "#ff0033" },
  slack: { mark: (c) => <Slack className={c} />, color: "#e01e5a" },
  dropbox: { mark: (c) => <Dropbox className={c} />, color: "#0061ff" },
  web: { mark: (c) => <LinkIcon className={c} />, color: "var(--color-muted)" },
};

/** One link, as a card: its service's tile, its title and host, and its acts. */
function LinkCard({ link }: { link: ClientLink }) {
  const remove = useFetcher();
  const rename = useFetcher();
  const [renaming, setRenaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const look = KIND_LOOK[link.kind];
  const sent = rename.formData?.get("title");
  const title = typeof sent === "string" ? sent : link.title;

  useEffect(() => {
    if (!copied) return;
    const off = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(off);
  }, [copied]);

  return (
    <li className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-2 pr-1 shadow-sm transition-shadow hover:shadow-md motion-safe:animate-rise-in">
      {renaming ? (
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <Tile look={look} />
          <SavedInput
            value={title}
            required
            autoFocus
            aria-label="Link title"
            onSave={(typed) => void rename.submit({ intent: "edit", id: link.id, title: typed }, { method: "post" })}
            onBlur={() => setRenaming(false)}
            className="min-w-0 flex-1 rounded border border-fg bg-bg px-2 py-1 focus:outline-none"
          />
        </span>
      ) : (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="press-soft flex min-w-0 flex-1 items-center gap-3 rounded"
          title={link.url}
        >
          <Tile look={look} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{title}</span>
            <span className="flex items-center gap-1 truncate text-xs text-muted">
              {link.host}
              <External className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
          </span>
        </a>
      )}
      <span className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton label={copied ? "Copied" : "Copy the link"} onClick={() => void navigator.clipboard?.writeText(link.url).then(() => setCopied(true))}>
          {copied ? <Check className="size-3.5 text-win motion-safe:animate-pop" /> : <Copy className="size-3.5" />}
        </IconButton>
        <IconButton label="Rename" onClick={() => setRenaming(true)}>
          <span className="text-xs leading-none">Aa</span>
        </IconButton>
        <IconButton
          label="Remove the link"
          onClick={() => void remove.submit({ intent: "delete", id: link.id }, { method: "post" })}
        >
          <XMark className="size-3.5" />
        </IconButton>
      </span>
    </li>
  );
}

/** A service's tile: its mark on a wash of its colour. */
function Tile({ look }: { look: (typeof KIND_LOOK)[LinkKind] }) {
  return (
    <span
      style={{ color: look.color, backgroundColor: `color-mix(in oklab, ${look.color} 14%, transparent)` }}
      className="flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
    >
      {look.mark("size-5")}
    </span>
  );
}

/** A small square button holding one glyph, named for a screen reader. */
function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="press flex size-8 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
    >
      {children}
    </button>
  );
}

/**
 * The meeting notes, newest meeting first. "New note" makes one dated today and
 * opens it with the caret in place.
 */
function Notes({ notes, day }: { notes: ClientNote[]; day: string }) {
  const add = useFetcher<{ note?: string }>();
  const fresh = add.data?.note ?? null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHead title="Meeting notes" icon={<Note className="size-4 text-muted" />}>
        <add.Form method="post">
          <input type="hidden" name="intent" value="note" />
          <button className="press inline-flex items-center gap-1.5 rounded-full border border-fg bg-fg px-3 py-1 text-xs text-bg hover:opacity-90">
            <Plus className="size-3" />
            {add.state === "idle" ? "New note" : "Starting…"}
          </button>
        </add.Form>
      </SectionHead>
      {notes.length === 0 ? (
        <p className="text-muted">No meetings written down yet. New note starts one dated {day}.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} fresh={note.id === fresh} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One meeting note: its day, its title and its text, each saved as it is left. */
function NoteCard({ note, fresh }: { note: ClientNote; fresh: boolean }) {
  const save = useFetcher();
  const remove = useFetcher();
  const sent = save.formData;
  const title = sent?.has("title") ? String(sent.get("title")) : note.title;
  const day = sent?.has("day") ? String(sent.get("day")) : note.day;
  const post = (fields: Record<string, string>) => void save.submit({ intent: "edit", id: note.id, ...fields }, { method: "post" });

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm motion-safe:animate-rise-in">
      <span className="flex flex-wrap items-center gap-2">
        <SavedInput
          type="date"
          value={day}
          aria-label="Day of the meeting"
          onSave={(value) => post({ day: value })}
          className="rounded border border-transparent bg-surface-2 px-2 py-0.5 text-xs tabular-nums hover:border-border focus:border-fg focus:outline-none"
        />
        <SavedInput
          value={title}
          required
          aria-label="Title of the note"
          onSave={(value) => post({ title: value })}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 font-serif text-lg hover:border-border focus:border-fg focus:outline-none"
        />
        <HoldButton
          label="Delete"
          icon={<Trash className="size-3" />}
          onConfirm={() => void remove.submit({ intent: "delete", id: note.id }, { method: "post" })}
          className="px-2 py-1 text-xs"
        />
      </span>
      <NoteBody note={note} fresh={fresh} save={(body) => post({ body })} sent={sent?.has("body") ? String(sent.get("body")) : null} />
    </li>
  );
}

/**
 * The text of one note: read, with live checkboxes, until a click opens it as
 * a textarea that keeps the description box's keys. Leaving it saves it.
 */
function NoteBody({
  note,
  fresh,
  save,
  sent,
}: {
  note: ClientNote;
  fresh: boolean;
  save: (body: string) => void;
  sent: string | null;
}) {
  const [editing, setEditing] = useState(fresh);
  const box = useRef<HTMLTextAreaElement>(null);
  const shown = sent ?? note.body;

  useEffect(() => {
    const field = box.current;
    if (!editing || !field) return;
    field.focus();
    field.selectionStart = field.selectionEnd = field.value.length;
  }, [editing]);

  if (!editing) {
    return shown.trim() === "" ? (
      <button type="button" onClick={() => setEditing(true)} className="self-start text-muted hover:text-fg">
        Write the notes… <span className="text-dim">(- [ ] makes an action item)</span>
      </button>
    ) : (
      <div
        className="cursor-text"
        onClick={(event) => {
          const target = event.target as Element;
          if (target.closest("a, label, input, button")) return;
          if (window.getSelection()?.toString()) return;
          setEditing(true);
        }}
      >
        <DescriptionView text={shown} names={{ id: note.id }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <textarea
        ref={box}
        defaultValue={shown}
        rows={Math.max(6, shown.split("\n").length + 1)}
        aria-label="Notes"
        placeholder={"Who came, what was decided, what happens next.\n- [ ] An action item"}
        className="w-full rounded border border-border bg-bg px-3 py-2 font-mono"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.blur();
            return;
          }
          handleDescEditKey(event);
        }}
        onPaste={handleEditorPaste}
        onBlur={(event) => {
          if (event.currentTarget.value !== shown) save(event.currentTarget.value);
          setEditing(false);
        }}
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => box.current?.blur()}
        className="press rounded border border-border px-3 py-1"
      >
        Done
      </button>
    </div>
  );
}

/** The dot each status draws in the open list. */
const STATUS_DOT: Partial<Record<Status, string>> = {
  in_progress: "bg-win",
  todo: "bg-fg",
  backlog: "bg-dim",
};

/** The client's open tasks, in progress first, and the way to the filtered board. */
function OpenTasks({ tasks, board, label }: { tasks: ClientTask[]; board: string; label: string }) {
  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
      <SectionHead title="Open tasks" icon={<span className="size-2 rounded-full bg-win" />}>
        <Link to={board} className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline">
          Board →
        </Link>
      </SectionHead>
      {tasks.length === 0 ? (
        <p className="text-muted">Nothing open for {label}. All clear.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link to={taskPath(task.id)} className="press-soft flex items-center gap-2 px-3 py-2 hover:bg-surface-2">
                <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${STATUS_DOT[task.status] ?? "bg-dim"}`} />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                <span className="shrink-0 text-xs text-muted">
                  <span className="sr-only">{STATUS_LABEL[task.status]}. </span>
                  {task.due_date ?? ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
