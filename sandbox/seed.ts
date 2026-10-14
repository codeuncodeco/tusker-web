/**
 * The sample data a fresh sandbox starts with.
 *
 * It is written through the data functions wherever one exists, over the same
 * adapter the app uses, so a schema change on `main` that the functions follow
 * is a change the seed follows too. Only the account rows are plain SQL,
 * because better-auth owns that table and the app has no function that writes
 * it without an auth instance.
 */

import { setColors } from "../app/colors.server";
import { decide, recordDecision } from "../app/decisions.server";
import { localDay } from "../app/day";
import { declareField } from "../app/fields.server";
import { addMemberById, createOrg, setOrgApp } from "../app/orgs.server";
import { startPlan } from "../app/plans.server";
import { archiveTasks } from "../app/archive.server";
import { setAssignees } from "../app/assignees.server";
import type { Scope } from "../app/scope.server";
import { createTasks, moveTask, saveDescription, saveTask } from "../app/tasks.server";
import type { TaskId } from "../app/task-number";
import { startWeek } from "../app/weeks.server";
import { localWeek } from "../app/week";
import type { Status } from "../app/board";

/** The one person every request is. See `sandbox/session.ts`. */
export const PERSON = { id: "sandbox-person", name: "Sam Sandbox", email: "sam@sandbox.test" };

/** The other members, so assignee chips and filters have more than one face. */
const CREW = [
  { id: "sandbox-ana", name: "Ana Ortiz", email: "ana@sandbox.test" },
  { id: "sandbox-bo", name: "", email: "bo.lee@sandbox.test" },
];

/** Where the reference field "reads". The fetch guard answers it from the cache. */
export const ORG_APP_URL = "https://org-app.sandbox.invalid/api";

/** A request for the functions that take one. The sandbox has no real address. */
const HERE = "https://sandbox.invalid";

export async function seed(db: D1Database): Promise<void> {
  for (const person of [PERSON, ...CREW]) {
    await db
      .prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .bind(person.id, person.name, person.email, new Date().toISOString(), new Date().toISOString())
      .run();
  }

  const studio = await org(db, "Studio", "studio");
  const garden = await org(db, "Garden Club", "garden");
  for (const scope of [studio, garden]) {
    for (const person of CREW) await addMemberById(db, scope.org.id, person.id);
  }

  await studioFields(db, studio);
  await gardenFields(db, garden);

  const s = await tasks(db, studio, {
    backlog: ["Sketch the spring poster", "Find a printer for the zine"],
    todo: ["Reply to the gallery about dates", "Order more risograph ink", "Book the photo shoot"],
    in_progress: ["Lay out issue 4", "Edit the interview with Mira"],
    done: ["Send invoices for March", "Pick the cover stock"],
    cancelled: ["Pitch the podcast"],
  });
  const g = await tasks(db, garden, {
    backlog: ["Plan the autumn bulb order"],
    todo: ["Fix the shed door", "Water rota for August"],
    in_progress: ["Build the compost bays"],
    done: ["Clear bed 3", "Buy seed potatoes"],
    cancelled: ["Rent a rotavator"],
  });

  // Custom field values, a due date and a description, so a card and the task
  // page show every kind of line they draw.
  await saveTask(db, studio, s.in_progress[0], {
    title: "Lay out issue 4",
    data: { client: "In-house", priority: "High", project: "zine" },
    decides: false,
    dueDate: localDay(new Date(Date.now() + 3 * 86_400_000)),
  });
  await saveTask(db, studio, s.todo[0], {
    title: "Reply to the gallery about dates",
    data: { client: "Northside Gallery", priority: "Medium", project: "show" },
    decides: true,
    dueDate: localDay(),
  });
  await saveTask(db, studio, s.todo[1], {
    title: "Order more risograph ink",
    data: { priority: "Low" },
    decides: false,
    dueDate: null,
  });
  await saveDescription(
    db,
    studio,
    s.in_progress[0],
    "Sixteen pages, two colours.\n\n- [x] Flat plan\n- [ ] Cover\n- [ ] Centre spread\n\nSee **the brief** for sizes.",
  );
  await saveTask(db, garden, g.todo[0], {
    title: "Fix the shed door",
    data: { plot: "North" },
    decides: false,
    dueDate: localDay(new Date(Date.now() + 86_400_000)),
  });

  await setAssignees(db, studio, s.in_progress[0], [PERSON.id]);
  await setAssignees(db, studio, s.in_progress[1], [PERSON.id, CREW[0]!.id]);
  await setAssignees(db, studio, s.todo[2], [CREW[1]!.id]);
  await setAssignees(db, garden, g.in_progress[0], [PERSON.id, CREW[1]!.id]);
  await setAssignees(db, garden, g.todo[1], [CREW[0]!.id]);

  // A decision a finished task asked for, and one written with no task.
  const decided = (await createTasks(db, studio, { titles: ["Choose the zine paper"], status: "in_progress", assignees: [] }))[0]!;
  await saveTask(db, studio, decided, { title: "Choose the zine paper", data: {}, decides: true, dueDate: null });
  await moveTask(db, studio, { taskId: decided, status: "done" });
  await decide(db, studio, new Request(`${HERE}/o/studio/board`), form({ id: String(decided), title: "Use 100gsm recycled stock", rationale: "Cheaper, and the ink sits well on it." }));
  await recordDecision(db, garden, new Request(`${HERE}/o/garden/decisions`), form({ title: "No pesticides on the shared beds", rationale: "Agreed at the June meeting." }));

  // One archived task in each org, for the archive page.
  await archiveTasks(db, studio, [s.done[1]!]);
  await archiveTasks(db, garden, [g.done[1]!]);

  await startPlan(db, PERSON.id, localDay(), [s.in_progress[0]!, g.todo[0]!, s.todo[0]!]);
  await startWeek(db, PERSON.id, localWeek(), [s.in_progress[0]!, s.in_progress[1]!, g.in_progress[0]!, g.todo[0]!, s.todo[1]!]);
}

async function org(db: D1Database, name: string, slug: string): Promise<Scope> {
  const made = await createOrg(db, { name, slug, personId: PERSON.id });
  if (!made) throw new Error(`The seed could not make ${slug}.`);
  return { org: made, personId: PERSON.id };
}

/** One block of tasks per column, first title topmost. */
async function tasks(
  db: D1Database,
  scope: Scope,
  columns: Record<Status, string[]>,
): Promise<Record<Status, TaskId[]>> {
  const made = {} as Record<Status, TaskId[]>;
  for (const [status, titles] of Object.entries(columns) as [Status, string[]][]) {
    made[status] = await createTasks(db, scope, { titles, status, assignees: [] });
  }
  return made;
}

async function studioFields(db: D1Database, scope: Scope) {
  await declareField(db, scope, { key: "client", label: "Client", type: "text", options: [], refs_path: "", show_on_card: true, filterable: false });
  await declareField(db, scope, { key: "priority", label: "Priority", type: "select", options: ["High", "Medium", "Low"], refs_path: "", show_on_card: true, filterable: true });
  await setColors(db, scope, "priority", { High: "red", Medium: "amber", Low: "teal" });

  // A reference field, with its org app and a cache already pulled.
  await setOrgApp(db, scope, { refs_base_url: ORG_APP_URL, refs_key: "sandbox-refs-key" });
  await declareField(db, scope, { key: "project", label: "Project", type: "reference", options: [], refs_path: "projects", show_on_card: true, filterable: false });
  await db.batch([
    ...[
      ["zine", "Zine, issue 4"],
      ["show", "Spring show"],
      ["site", "New website"],
    ].map(([id, label]) =>
      db
        .prepare("INSERT INTO org_ref_options (org_id, field_key, ext_id, label) VALUES (?, 'project', ?, ?)")
        .bind(scope.org.id, id, label),
    ),
    db
      .prepare(`UPDATE org_fields SET refs_pulled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE org_id = ? AND key = 'project'`)
      .bind(scope.org.id),
  ]);
}

async function gardenFields(db: D1Database, scope: Scope) {
  await declareField(db, scope, { key: "plot", label: "Plot", type: "select", options: ["North", "South", "Greenhouse"], refs_path: "", show_on_card: true, filterable: true });
  await setColors(db, scope, "plot", { North: "blue", South: "orange", Greenhouse: "green" });
}

function form(values: Record<string, string>): FormData {
  const made = new FormData();
  for (const [name, value] of Object.entries(values)) made.set(name, value);
  return made;
}
