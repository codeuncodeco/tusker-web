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
import { listColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedOn, decide, promptFor } from "../decisions.server";
import { Dot } from "../dot";
import { shownOnCard, type Shown } from "../fields";
import { listFields } from "../fields.server";
import { refLabels } from "../refs.server";
import { fieldClass } from "../forms";
import { useLocalDay } from "../local-day";
import { listOrgsForPerson } from "../orgs.server";
import { readPlan } from "../plans.server";
import { OrgNav } from "../org-nav";
import { OrgSwitcher } from "../org-switcher";
import { requireScope } from "../scope.server";
import { createTask, listTasks, moveTask, type Task } from "../tasks.server";
import type { Route } from "./+types/board";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.org.name} — Tusker` }];
}

/** What one card shows. The task page reads the rest of the row. */
type Card = { id: string; title: string; fields: Shown[] };

/** True while the board is narrowed to today's plan. */
function readToday(params: URLSearchParams): boolean {
  return params.get("today") === "1";
}

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
  // A reference card shows the cached label. The board does no live lookup: a
  // column of misses would be a column of calls to the org app.
  const labels = await refLabels(env.DB, scope);
  // The colour one value carries, so a card tells one client from another at a
  // glance. One query covers every card. See ADR-0006.
  const colors = await listColors(env.DB, scope);
  // The chip narrows the board to the tasks today's plan holds. A null plan is
  // a day the person has not planned, and then the board offers no chip.
  const day = dayOf(request);
  const plan = await readPlan(env.DB, scope.personId, day);
  const query = new URL(request.url).searchParams;
  // An emptied plan holds nothing to narrow to, so it carries no chip either.
  const held = new Set(plan ?? []);
  const hasPlan = held.size > 0;
  const today = readToday(query) && hasPlan;
  const shown = today ? tasks.filter((task) => held.has(task.id)) : tasks;

  // The Backlog rule reads the whole board, so narrowing does not change which
  // columns a person sees. Clearing the chip gives the board back as it was.
  const counts = countByStatus(tasks);
  const toggles = readToggles(query);
  const columns = columnsToShow(counts, toggles).map((status) => ({
    status,
    label: STATUS_LABEL[status],
    tasks: shown
      .filter((task) => task.status === status)
      .map(
        (task): Card => ({
          id: task.id,
          title: task.title,
          fields: shownOnCard(declared, task.data, labels, colors),
        }),
      ),
  }));

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    orgs: await listOrgsForPerson(env.DB, scope.personId),
    columns,
    // The prompt a finished card raised, if the query string still holds one.
    ask: await askedOn(env.DB, scope, request),
    toggles,
    today,
    day,
    /** Today's plan holds a task, so the chip has something to narrow to. */
    hasPlan,
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
    // The mark goes on when the task is made, while the thought is there. It
    // is off by default, so an unticked box is a task that decides nothing.
    await createTask(env.DB, scope, { title, status, decides: form.get("decides") === "1" });
    return { ok: true };
  }

  if (intent === "move") {
    const status = readStatus(form);
    const id = String(form.get("id") ?? "");
    // The card the task lands above. Nothing named means the bottom.
    const before = String(form.get("before") ?? "") || null;
    const moved = await moveTask(env.DB, scope, { taskId: id, status, before });
    if (!moved.moved) throw new Response("Not found", { status: 404 });
    // A card dropped into Done is a task finished, and a marked task is the
    // one Tusker asks about.
    if (moved.finished) {
      const prompt = await promptFor(env.DB, scope, request, id);
      if (prompt) return prompt;
    }
    return { ok: true };
  }

  // The prompt a finished card raised, answered.
  if (intent === "decide") return decide(env.DB, scope, request, form);

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
      {/* Off by default. Most tasks decide nothing, and a prompt people
          learn to dismiss is how a log goes empty. See ADR-0010. */}
      <label className="flex items-center gap-2 text-xs text-neutral-500">
        <input type="checkbox" name="decides" value="1" />
        Holds a decision
      </label>
      <button className="sr-only">Add</button>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </add.Form>
  );
}

/** What a drag asks for: the card, its column, and the card it lands above. */
type Move = (id: string, status: Status, before: string | null) => void;

/**
 * One card. It shows its rank, the way the extension did: the place the board
 * draws it in, counting from one. No row stores it.
 *
 * The select moves the card to another column, and the two arrows move it
 * inside one. Both sit in a form that posts on its own, so a move needs no
 * script. Tusker is keyboard first, so the drag is the second way, not the
 * only one.
 */
function CardItem({
  cards,
  index,
  status,
  slug,
  move,
}: {
  cards: Card[];
  index: number;
  status: Status;
  slug: string;
  move: Move;
}) {
  const card = cards[index];
  const post = useFetcher();

  // Up lands above the card overhead. Down lands above the card after the
  // next one, and an empty value names the bottom of the column.
  const up = index === 0 ? null : cards[index - 1].id;
  const down = index === cards.length - 1 ? null : (cards[index + 2]?.id ?? "");

  return (
    <li
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", card.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        // The dragged card takes this one's place, so this one slides down.
        event.stopPropagation();
        event.preventDefault();
        const dragged = event.dataTransfer.getData("text/plain");
        if (dragged && dragged !== card.id) move(dragged, status, card.id);
      }}
      className="flex cursor-grab flex-col gap-2 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <span className="flex gap-2">
        <span className="tabular-nums text-neutral-400">{index + 1}</span>
        <Link to={`/o/${slug}/t/${card.id}`} className="underline-offset-2 hover:underline">
          {card.title}
        </Link>
      </span>

      {card.fields.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs text-neutral-500">
          {card.fields.map((field) => (
            <li
              key={field.key}
              className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800"
            >
              <Dot color={field.color} />
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
 * The query string with one switch turned the other way, and the rest of it
 * kept. Every switch the header draws is one of these.
 */
function flipped(params: URLSearchParams, which: string, on: boolean): string {
  const next = new URLSearchParams(params);
  if (on) next.delete(which);
  else next.set(which, "1");
  const query = next.toString();
  return query ? `?${query}` : "?";
}

/** The chip that narrows the board to today's plan, and gives it back. */
function TodayChip({ today }: { today: boolean }) {
  const [params] = useSearchParams();

  return (
    <Link
      to={flipped(params, "today", today)}
      aria-pressed={today}
      className={`rounded-full border px-2 py-0.5 text-xs ${
        today
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-200 dark:bg-neutral-200 dark:text-neutral-900"
          : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      Today
    </Link>
  );
}

/** The link that turns one hidden column on or off, keeping the other one. */
function Toggle({ which, toggles }: { which: "backlog" | "cancelled"; toggles: Toggles }) {
  const [params] = useSearchParams();

  return (
    <Link to={flipped(params, which, toggles[which])} className="underline">
      {toggles[which] ? "Hide" : "Show"} {STATUS_LABEL[which]}
    </Link>
  );
}

export default function Board({ loaderData }: Route.ComponentProps) {
  const { org, orgs, columns, toggles, today, hasPlan, day, ask } = loaderData;
  const mover = useFetcher();

  // The chip speaks for today, so the board must know which day that is where
  // the person is, not where the Worker runs.
  useLocalDay(day);

  /**
   * The post a drag makes: the card, the column it lands in, and the card it
   * lands above. No card named means the bottom of the column. A card's own
   * form carries the moves the keyboard makes.
   */
  const move: Move = (id, status, before) => {
    mover.submit({ intent: "move", id, status, before: before ?? "" }, { method: "post" });
  };

  /** A drop on the column itself, past the last card, lands at the bottom. */
  function onDrop(status: Status, event: React.DragEvent) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id) move(id, status, null);
  }

  return (
    <main className="flex min-h-full flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <OrgSwitcher orgs={orgs} here={org.slug} />
        <nav className="flex items-baseline gap-4 text-sm">
          {hasPlan ? <TodayChip today={today} /> : null}
          {loaderData.backlogByRule ? null : <Toggle which="backlog" toggles={toggles} />}
          <Toggle which="cancelled" toggles={toggles} />
          <Link to="/me" className="underline">
            Your tasks
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
            <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
              {column.label} <span className="text-neutral-400">{column.tasks.length}</span>
            </h2>

            <QuickAdd status={column.status} label={column.label} />

            <ul className="flex flex-col gap-2">
              {column.tasks.map((card, index) => (
                <CardItem
                  key={card.id}
                  cards={column.tasks}
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

      <DecisionPrompt ask={ask} />
    </main>
  );
}
