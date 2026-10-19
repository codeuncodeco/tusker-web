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
import { declareField, markClientField } from "../app/fields.server";
import { addMemberById, createOrg, setOrgApp } from "../app/orgs.server";
import { setPersonImage } from "../app/people.server";
import { startPlan } from "../app/plans.server";
import { archiveTasks } from "../app/archive.server";
import { addLink, addNote, editResource } from "../app/client-resources.server";
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
const OTHER_MEMBERS = [
  { id: "sandbox-ana", name: "Ana Ortiz", email: "ana@sandbox.test" },
  { id: "sandbox-bo", name: "", email: "bo.lee@sandbox.test" },
];

/**
 * A picture for Ana, drawn here so the sandbox loads nothing off-site: a sunny
 * disc and a smile on her colour. Sam and Bo keep their initials, so a card
 * shows both looks.
 */
const ANA_PICTURE = `data:image/svg+xml;base64,${btoa(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3c7"/><stop offset="1" stop-color="#cf5f92"/></linearGradient></defs>` +
    `<rect width="96" height="96" fill="url(#g)"/>` +
    `<circle cx="48" cy="40" r="18" fill="#ffe1c4"/>` +
    `<path d="M14 96c4-22 18-32 34-32s30 10 34 32z" fill="#5b2a4a"/>` +
    `<path d="M30 36c2-14 34-16 36 2c-8-6-26-8-36-2z" fill="#3b1d33"/>` +
    `<circle cx="41" cy="41" r="2.4" fill="#3b1d33"/><circle cx="55" cy="41" r="2.4" fill="#3b1d33"/>` +
    `<path d="M41 48q7 6 14 0" stroke="#3b1d33" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    `</svg>`,
)}`;

/** Studio's clients, the options of its client field. */
const CLIENTS = ["Northside Gallery", "In-house", "Mira Press"] as const;

/** Where the reference field "reads". The fetch guard answers it from the cache. */
export const ORG_APP_URL = "https://org-app.sandbox.invalid/api";

/** A request for the functions that take one. The sandbox has no real address. */
const ORIGIN = "https://sandbox.invalid";

export async function seed(db: D1Database): Promise<void> {
  for (const person of [PERSON, ...OTHER_MEMBERS]) {
    await db
      .prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .bind(person.id, person.name, person.email, new Date().toISOString(), new Date().toISOString())
      .run();
  }

  await setPersonImage(db, OTHER_MEMBERS[0]!.id, ANA_PICTURE);

  const studio = await org(db, "Studio", "studio");
  const garden = await org(db, "Garden Club", "garden");
  for (const scope of [studio, garden]) {
    for (const person of OTHER_MEMBERS) await addMemberById(db, scope.org.id, person.id);
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
    data: { priority: "Low", client: "In-house" },
    decides: false,
    dueDate: null,
  });
  await saveDescription(
    db,
    studio,
    s.in_progress[0],
    "Sixteen pages, two colours.\n\n- [x] Flat plan\n- [ ] Cover\n- [ ] Centre spread\n\nSee **the brief** for sizes.",
  );
  await saveTask(db, studio, s.in_progress[1], {
    title: "Edit the interview with Mira",
    data: { client: "Mira Press", priority: "High" },
    decides: false,
    dueDate: localDay(new Date(Date.now() + 2 * 86_400_000)),
  });
  await saveTask(db, studio, s.todo[2], {
    title: "Book the photo shoot",
    data: { client: "Northside Gallery" },
    decides: false,
    dueDate: null,
  });
  await saveTask(db, studio, s.backlog[0], {
    title: "Sketch the spring poster",
    data: { client: "Northside Gallery", priority: "Medium" },
    decides: false,
    dueDate: null,
  });
  await saveTask(db, garden, g.todo[0], {
    title: "Fix the shed door",
    data: { plot: "North" },
    decides: false,
    dueDate: localDay(new Date(Date.now() + 86_400_000)),
  });

  await setAssignees(db, studio, s.in_progress[0], [PERSON.id]);
  await setAssignees(db, studio, s.in_progress[1], [PERSON.id, OTHER_MEMBERS[0]!.id]);
  await setAssignees(db, studio, s.todo[2], [OTHER_MEMBERS[1]!.id]);
  await setAssignees(db, garden, g.in_progress[0], [PERSON.id, OTHER_MEMBERS[1]!.id]);
  await setAssignees(db, garden, g.todo[1], [OTHER_MEMBERS[0]!.id]);

  // A decision a finished task asked for, and one written with no task.
  const decided = (await createTasks(db, studio, { titles: ["Choose the zine paper"], status: "in_progress", assignees: [] }))[0]!;
  await saveTask(db, studio, decided, { title: "Choose the zine paper", data: {}, decides: true, dueDate: null });
  await moveTask(db, studio, { taskId: decided, status: "done" });
  await decide(db, studio, new Request(`${ORIGIN}/o/studio/board`), form({ id: String(decided), title: "Use 100gsm recycled stock", rationale: "Cheaper, and the ink sits well on it." }));
  await recordDecision(db, garden, new Request(`${ORIGIN}/o/garden/decisions`), form({ title: "No pesticides on the shared beds", rationale: "Agreed at the June meeting." }));

  // A client page with something on it: two links and a meeting note with
  // action items. See ADR-0036.
  await addLink(db, studio, "Northside Gallery", { url: "https://www.figma.com/design/aBcDeFgHiJkL/Spring-Show-Posters?node-id=0-1" });
  await addLink(db, studio, "Northside Gallery", { url: "https://docs.google.com/document/d/1sAnDbOx/edit", title: "Show brief" });
  await addLink(db, studio, "Mira Press", { url: "https://www.notion.so/mirapress/Interview-plan-0123456789abcdef0123456789abcdef" });
  const kickoff = await addNote(db, studio, "Northside Gallery", localDay(new Date(Date.now() - 6 * 86_400_000)));
  await editResource(db, studio, kickoff.id, {
    title: "Kick-off with the gallery",
    body: "Sam, Ana and Lena from Northside.\n\nThe show opens in spring. They want posters in two sizes and a zine to sell at the door.\n\n- [x] Send the brief back with questions\n- [ ] Book the photo shoot\n- [ ] Draft three poster directions\n\nNext call in two weeks.",
  });

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
  // The client field: a select with a colour per client, marked as the field
  // that names the client, so cards carry a tag, every board filters by it
  // and each client has a page of notes and links. See ADR-0036.
  await declareField(db, scope, { key: "client", label: "Client", type: "select", options: [...CLIENTS], refs_path: "", show_on_card: true, filterable: false });
  await setColors(db, scope, "client", { "Northside Gallery": "purple", "In-house": "teal", "Mira Press": "orange" });
  await markClientField(db, scope, "client");
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
