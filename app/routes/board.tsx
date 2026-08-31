import { useEffect, useRef } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";

import {
  STATUSES,
  STATUS_LABEL,
  backlogByRule,
  columnsToShow,
  isStatus,
  type Status,
  type Toggles,
} from "../board";
import { cloudflareEnv } from "../context.server";
import { shownOnCard, type Shown } from "../fields";
import { listFields } from "../fields.server";
import { fieldClass } from "../forms";
import { listOrgsForPerson } from "../orgs.server";
import { OrgNav } from "../org-nav";
import { OrgSwitcher } from "../org-switcher";
import { arrowsOn, marked, seenBy, type Arrows } from "../order";
import { requireScope } from "../scope.server";
import { clearRanks, createTask, listTasks, moveTask, rankTask, type Task } from "../tasks.server";
import type { Route } from "./+types/board";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.org.name} — Tusker` }];
}

/**
 * What one card shows. The task page reads the rest of the row.
 *
 * `marked` is true while the card carries a rank that puts it somewhere other
 * than the board does, which is what the marker says.
 *
 * `up` and `down` name the card each arrow lands the card above. They come
 * from the board's order, because the arrows write the board's order.
 */
type Card = { id: string; title: string; fields: Shown[]; marked: boolean } & Arrows;

/** Which of the two hidden columns the query string asks for. */
function readToggles(params: URLSearchParams): Toggles {
  return { backlog: params.get("backlog") === "1", cancelled: params.get("cancelled") === "1" };
}

/** How many tasks each status holds, so the Backlog rule can read it. */
function countByStatus(tasks: Task[]): Record<Status, number> {
  const counts: Record<Status, number> = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    done: 0,
    cancelled: 0,
  };
  for (const task of tasks) counts[task.status]++;
  return counts;
}

/** The status the form names, or a 400. */
function readStatus(form: FormData): Status {
  const status = form.get("status");
  if (!isStatus(status)) throw new Response("That is not a column.", { status: 400 });
  return status;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);

  const tasks = await listTasks(env.DB, scope);
  // The org's declarations decide what a card shows, so the board needs no
  // code for any one org's fields.
  const declared = await listFields(env.DB, scope);
  const counts = countByStatus(tasks);
  const toggles = readToggles(new URL(request.url).searchParams);
  const columns = columnsToShow(counts, toggles).map((status) => {
    // The board's own order first, so the marker can name what moved, and the
    // person's own order after it.
    const column = tasks.filter((task) => task.status === status);
    const markers = marked(column);
    const arrows = arrowsOn(column);

    return {
      status,
      label: STATUS_LABEL[status],
      // The reset only has something to clear while this person ranked a card.
      ranked: column.some((task) => task.rank !== null),
      tasks: seenBy(column).map(
        (task): Card => ({
          id: task.id,
          title: task.title,
          fields: shownOnCard(declared, task.data),
          marked: markers.has(task.id),
          ...arrows.get(task.id)!,
        }),
      ),
    };
  });

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    orgs: await listOrgsForPerson(env.DB, scope.personId),
    columns,
    toggles,
    // The rule can show Backlog on its own, and then the toggle has nothing to
    // add. The header reads this to leave the toggle out.
    backlogByRule: backlogByRule(counts),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create") {
    const title = String(form.get("title") ?? "").trim();
    const status = readStatus(form);
    if (!title) return { error: "A task needs a title." };
    await createTask(env.DB, scope, { title, status });
    return { ok: true };
  }

  if (intent === "move" || intent === "rank") {
    const status = readStatus(form);
    const id = String(form.get("id") ?? "");
    // The card the task lands above. Nothing named means the bottom.
    const before = String(form.get("before") ?? "") || null;
    // `intentFor` says which order the drag asked for.
    const write = intent === "rank" ? rankTask : moveTask;
    const moved = await write(env.DB, scope, { taskId: id, status, before });
    if (!moved) throw new Response("Not found", { status: 404 });
    return { ok: true };
  }

  if (intent === "reset") {
    await clearRanks(env.DB, scope, readStatus(form));
    return { ok: true };
  }

  throw new Response("That form does not name an action.", { status: 400 });
}

/**
 * The box at the top of a column. It posts on Enter and empties itself once
 * the task lands, so a person can type the next one at once.
 */
function QuickAdd({ status, label }: { status: Status; label: string }) {
  const add = useFetcher<typeof action>();
  const form = useRef<HTMLFormElement>(null);
  const error = add.data && "error" in add.data ? add.data.error : null;

  useEffect(() => {
    if (add.state === "idle" && add.data && "ok" in add.data) form.current?.reset();
  }, [add.state, add.data]);

  return (
    <add.Form method="post" ref={form} className="flex flex-col gap-2">
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="status" value={status} />
      <input
        name="title"
        required
        placeholder={`Add to ${label}`}
        aria-label={`Add to ${label}`}
        className={fieldClass}
      />
      <button className="sr-only">Add</button>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </add.Form>
  );
}

/**
 * What a drag asks for: the card, its column, and the card it lands above.
 * `intent` names the order it writes.
 */
type Drag = (intent: "move" | "rank", id: string, status: Status, before: string | null) => void;

/** The column a dragged card left, beside the id every drag already carries. */
const FROM_COLUMN = "application/x-tusker-column";

/**
 * Which order a drop writes. A card that stays in its column moves in this
 * person's own order. A card that changes column moves on the board, because
 * the column a task sits in is shared. See ADR-0003.
 */
function intentFor(event: React.DragEvent, status: Status): "move" | "rank" {
  return event.dataTransfer.getData(FROM_COLUMN) === status ? "rank" : "move";
}

/**
 * One card. It shows its number in the column, the way the extension did. The
 * number is the place the card takes in the order this person reads, not a
 * stored field.
 *
 * The select moves the card to another column, and the two arrows move it
 * inside one. Both write the board's order, for every member, and both sit in
 * a form that posts on its own, so a move needs no script. A drag inside a
 * column writes this person's own order instead. Ticket #30 holds the keyboard
 * path to that order.
 *
 * The loader read both arrows from the board's order, so a rank never sends an
 * arrow to a card that is no neighbour on the board.
 */
function CardItem({
  card,
  index,
  status,
  slug,
  move,
}: {
  card: Card;
  index: number;
  status: Status;
  slug: string;
  move: Drag;
}) {
  const post = useFetcher();
  const { up, down } = card;

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", card.id);
        event.dataTransfer.setData(FROM_COLUMN, status);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        // The dragged card takes this one's place, so this one slides down.
        event.stopPropagation();
        event.preventDefault();
        const dragged = event.dataTransfer.getData("text/plain");
        if (dragged && dragged !== card.id) move(intentFor(event, status), dragged, status, card.id);
      }}
      className="flex cursor-grab flex-col gap-2 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <span className="flex gap-2">
        <span className="tabular-nums text-neutral-400">{index + 1}</span>
        <Link to={`/o/${slug}/t/${card.id}`} className="underline-offset-2 hover:underline">
          {card.title}
        </Link>
        {card.marked ? (
          <span
            title="Your order, not the board's"
            aria-label="Your order, not the board's"
            className="text-amber-600 dark:text-amber-500"
          >
            ●
          </span>
        ) : null}
      </span>

      {card.fields.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs text-neutral-500">
          {card.fields.map((field) => (
            <li key={field.key} className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
              <span className="text-neutral-400">{field.label}</span> {field.value}
            </li>
          ))}
        </ul>
      ) : null}

      <post.Form method="post" className="flex gap-2">
        <input type="hidden" name="intent" value="move" />
        <input type="hidden" name="id" value={card.id} />
        <select
          name="status"
          aria-label={`Column for ${card.title}`}
          defaultValue={status}
          onChange={(event) => post.submit(event.currentTarget.form)}
          className="rounded border border-neutral-300 bg-transparent px-1 py-0.5 text-xs dark:border-neutral-700"
        >
          {STATUSES.map((one) => (
            <option key={one} value={one}>
              {STATUS_LABEL[one]}
            </option>
          ))}
        </select>
        {/* The submit the select needs when no script runs. */}
        <button name="before" value="" className="sr-only">
          Move
        </button>
        <button
          name="before"
          value={up ?? ""}
          disabled={up === null}
          aria-label={`Move ${card.title} up`}
          className="rounded border border-neutral-300 px-1 text-xs disabled:opacity-30 dark:border-neutral-700"
        >
          ↑
        </button>
        <button
          name="before"
          value={down ?? ""}
          disabled={down === null}
          aria-label={`Move ${card.title} down`}
          className="rounded border border-neutral-300 px-1 text-xs disabled:opacity-30 dark:border-neutral-700"
        >
          ↓
        </button>
      </post.Form>
    </li>
  );
}

/**
 * The action that drops this person's order for one column, so the column
 * reads as the board holds it again. It shows only while they ranked a card
 * in that column.
 */
function ResetOrder({ status }: { status: Status }) {
  const reset = useFetcher();

  return (
    <reset.Form method="post">
      <input type="hidden" name="intent" value="reset" />
      <input type="hidden" name="status" value={status} />
      <button className="text-xs normal-case underline">Reset order</button>
    </reset.Form>
  );
}

/** The link that turns one hidden column on or off, keeping the other one. */
function Toggle({ which, toggles }: { which: "backlog" | "cancelled"; toggles: Toggles }) {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (toggles[which]) next.delete(which);
  else next.set(which, "1");
  const query = next.toString();

  return (
    <Link to={query ? `?${query}` : "?"} className="underline">
      {toggles[which] ? "Hide" : "Show"} {STATUS_LABEL[which]}
    </Link>
  );
}

export default function Board({ loaderData }: Route.ComponentProps) {
  const { org, orgs, columns, toggles } = loaderData;
  const mover = useFetcher();

  /**
   * The post a drag makes: whose order it writes, the card, the column it
   * lands in, and the card it lands above. No card named means the bottom of
   * the column. A card's own form carries the moves the keyboard makes.
   */
  const move: Drag = (intent, id, status, before) => {
    mover.submit({ intent, id, status, before: before ?? "" }, { method: "post" });
  };

  /** A drop on the column itself, past the last card, lands at the bottom. */
  function onDrop(status: Status, event: React.DragEvent) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id) move(intentFor(event, status), id, status, null);
  }

  return (
    <main className="flex min-h-full flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <OrgSwitcher orgs={orgs} here={org.slug} />
        <nav className="flex gap-4 text-sm">
          {loaderData.backlogByRule ? null : <Toggle which="backlog" toggles={toggles} />}
          <Toggle which="cancelled" toggles={toggles} />
          <Link to="/me" className="underline">
            You
          </Link>
        </nav>
        <OrgNav slug={org.slug} here="board" />
      </header>

      <div className="flex flex-1 gap-4 overflow-x-auto">
        {columns.map((column) => (
          <section
            key={column.status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(column.status, event)}
            className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <h2 className="flex items-baseline gap-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
              {column.label} <span className="text-neutral-400">{column.tasks.length}</span>
              {column.ranked ? <ResetOrder status={column.status} /> : null}
            </h2>

            <QuickAdd status={column.status} label={column.label} />

            <ul className="flex flex-col gap-2">
              {column.tasks.map((card, index) => (
                <CardItem
                  key={card.id}
                  card={card}
                  index={index}
                  status={column.status}
                  slug={org.slug}
                  move={move}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
