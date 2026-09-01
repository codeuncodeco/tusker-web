import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { initialsOf } from "../app/assignees";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import { ASK } from "../app/decisions";
import * as boardRoute from "../app/routes/board";
import * as loginRoute from "../app/routes/login";
import * as meRoute from "../app/routes/me";
import * as taskRoute from "../app/routes/task";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
const DAY = "2026-09-01";

beforeEach(wipe);

/** An account, its personal org and a cookie that signs its requests. */
async function member(email: string, name: string) {
  const auth = createAuth(env, get("/"));
  const person = await createAccount(auth, { email, name, password: PASSWORD });
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email, password: PASSWORD })),
  )) as Response;
  return { person, cookie: cookieFrom(response) };
}

/** A team org, with everybody named as a member of it. */
async function team(slug: string, people: { id: string }[]) {
  const id = `org-${slug}`;
  await db.batch([
    db.prepare("INSERT INTO orgs (id, slug, name, kind) VALUES (?, ?, ?, 'team')").bind(id, slug, slug),
    ...people.map((person) =>
      db
        .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
        .bind(id, person.id),
    ),
  ]);
  return { id, slug };
}

/** The personal org Tusker made for a person at signup. */
async function personalOrg(personId: string) {
  const org = await db
    .prepare(
      "SELECT id, slug FROM orgs JOIN memberships ON org_id = id WHERE user_id = ? AND kind = 'personal'",
    )
    .bind(personId)
    .first<{ id: string; slug: string }>();
  return org!;
}

/** A task, placed by hand so a test can state the column it wants. */
async function task(orgId: string, id: string, some: { status?: Status; decides?: boolean } = {}) {
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, title, status, position, decides) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .bind(id, orgId, id, some.status ?? "todo", some.decides ? 1 : 0)
    .run();
  return id;
}

/** A save of the task page, signed by the cookie. */
function save(cookie: string, slug: string, taskId: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [name, value] of Object.entries({ title: taskId, status: "todo", ...fields })) {
    body.append(name, value);
  }
  // Several assignees are several values under one name, as the checkboxes
  // post, behind the hidden mark that says the picker was on the form.
  if ("assignees" in fields) {
    body.set("assignees", "picked");
    for (const id of fields.assignees.split(",").filter(Boolean)) body.append("assignee", id);
  }

  const request = new Request(`https://tusker.test/o/${slug}/t/${taskId}`, {
    method: "POST",
    body,
  });
  request.headers.set("cookie", cookie);
  return taskRoute.action(routeArgs(request, { slug, taskId }));
}

/** The task page, as one person reads it. */
function taskPage(cookie: string, slug: string, taskId: string) {
  return taskRoute.loader(
    routeArgs(get(`/o/${slug}/t/${taskId}`, cookie), { slug, taskId }),
  );
}

/** The board, as one person reads it. */
function board(cookie: string, slug: string) {
  return boardRoute.loader(routeArgs(get(`/o/${slug}/board`, cookie), { slug }));
}

/** The user ids `task_assignees` holds for one task. */
async function heldBy(taskId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT user_id FROM task_assignees WHERE task_id = ? ORDER BY user_id")
    .bind(taskId)
    .all<{ user_id: string }>();
  return results.map((row) => row.user_id);
}

describe("initials", () => {
  it("takes the first letter of the first two words of a name", () => {
    expect(initialsOf({ name: "Ada Lovelace", email: "ada@tusker.test" })).toBe("AL");
    expect(initialsOf({ name: "Ada Byron King Lovelace", email: "ada@tusker.test" })).toBe("AB");
    expect(initialsOf({ name: "Ada", email: "ada@tusker.test" })).toBe("A");
  });

  it("falls back to the email for an account with no name", () => {
    expect(initialsOf({ name: "", email: "grace@tusker.test" })).toBe("G");
  });
});

describe("the metadata aside", () => {
  it("writes the status, the due date and the assignees", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const grace = await member("grace@tusker.test", "Grace Hopper");
    const org = await team("hikes", [ada.person, grace.person]);
    const id = await task(org.id, "walk");

    const saved = await save(ada.cookie, org.slug, id, {
      due_date: "2026-09-20",
      status: "in_progress",
      assignees: `${ada.person.id},${grace.person.id}`,
    });
    expect(saved).toEqual({ ok: true });

    const page = await taskPage(ada.cookie, org.slug, id);
    expect(page.task.status).toBe("in_progress");
    expect(page.task.due_date).toBe("2026-09-20");
    expect(page.holders.map((one) => one.name)).toEqual(["Ada Lovelace", "Grace Hopper"]);
  });

  it("names only the members the form asks for", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const grace = await member("grace@tusker.test", "Grace Hopper");
    const org = await team("hikes", [ada.person, grace.person]);
    const id = await task(org.id, "walk");

    await save(ada.cookie, org.slug, id, { assignees: `${ada.person.id},${grace.person.id}` });
    await save(ada.cookie, org.slug, id, { assignees: grace.person.id });

    expect(await heldBy(id)).toEqual([grace.person.id]);

    // Every box unticked posts no name, and the task goes back to unassigned.
    await save(ada.cookie, org.slug, id, { assignees: "" });
    expect(await heldBy(id)).toEqual([]);
  });

  it("leaves the assignees alone for a form that carries no picker", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const org = await team("hikes", [ada.person]);
    const id = await task(org.id, "walk");

    await save(ada.cookie, org.slug, id, { assignees: ada.person.id });
    await save(ada.cookie, org.slug, id, { title: "A new title" });

    expect(await heldBy(id)).toEqual([ada.person.id]);
  });

  it("empties the due date when the box is cleared", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const org = await team("hikes", [ada.person]);
    const id = await task(org.id, "walk");

    await save(ada.cookie, org.slug, id, { due_date: "2026-09-20" });
    await save(ada.cookie, org.slug, id, { due_date: "" });

    const page = await taskPage(ada.cookie, org.slug, id);
    expect(page.task.due_date).toBeNull();
  });

  it("refuses a date no calendar holds", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const org = await team("hikes", [ada.person]);
    const id = await task(org.id, "walk");

    expect(await save(ada.cookie, org.slug, id, { due_date: "2026-13-01" })).toEqual({
      error: "A due date is a date, as 2026-08-31.",
    });
  });

  it("refuses a member of another org, and writes nothing", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const grace = await member("grace@tusker.test", "Grace Hopper");
    const hikes = await team("hikes", [ada.person]);
    await team("boats", [grace.person]);
    const id = await task(hikes.id, "walk");

    const saved = await save(ada.cookie, hikes.slug, id, {
      title: "A new title",
      assignees: grace.person.id,
    });
    expect(saved).toEqual({ error: "hikes has no such member. Pick from the list." });

    expect(await heldBy(id)).toEqual([]);
    const page = await taskPage(ada.cookie, hikes.slug, id);
    expect(page.task.title).toBe("walk");
  });

  it("raises the decision prompt when the status moves a marked task to Done", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const org = await team("hikes", [ada.person]);
    const id = await task(org.id, "walk", { decides: true });

    // The mark is a box on the same form, so a save that keeps it ticked posts it.
    const answer = await caught(save(ada.cookie, org.slug, id, { status: "done", decides: "1" }));
    expect(answer.status).toBe(302);
    expect(new URL(answer.headers.get("location")!, "https://tusker.test").searchParams.get(ASK)).toBe(id);
  });

  it("asks nothing when the status does not move", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const org = await team("hikes", [ada.person]);
    const id = await task(org.id, "walk", { decides: true, status: "done" });

    expect(await save(ada.cookie, org.slug, id, { status: "done", decides: "1" })).toEqual({
      ok: true,
    });
  });

  it("drops an assignee who is no longer a member, and errors on nothing", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const grace = await member("grace@tusker.test", "Grace Hopper");
    const org = await team("hikes", [ada.person, grace.person]);
    const id = await task(org.id, "walk");

    await save(ada.cookie, org.slug, id, { assignees: `${ada.person.id},${grace.person.id}` });

    await db
      .prepare("DELETE FROM memberships WHERE org_id = ? AND user_id = ?")
      .bind(org.id, grace.person.id)
      .run();

    expect(await heldBy(id)).toEqual([ada.person.id]);
    const page = await taskPage(ada.cookie, org.slug, id);
    expect(page.holders.map((one) => one.name)).toEqual(["Ada Lovelace"]);
  });

  it("draws no picker in a personal org", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const org = await personalOrg(ada.person.id);
    const id = await task(org.id, "walk");

    const page = await taskPage(ada.cookie, org.slug, id);
    expect(page.members).toEqual([]);
    expect(page.holders).toEqual([]);
  });
});

describe("a card", () => {
  it("draws the initials of the members who hold the task", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const grace = await member("grace@tusker.test", "Grace Hopper");
    const org = await team("hikes", [ada.person, grace.person]);
    const id = await task(org.id, "walk");

    await save(ada.cookie, org.slug, id, { assignees: `${ada.person.id},${grace.person.id}` });

    const page = await board(ada.cookie, org.slug);
    const todo = page.columns.find((column) => column.status === "todo")!;
    expect(todo.tasks[0].holders.map((one) => one.initials)).toEqual(["AL", "GH"]);
  });

  it("draws none in a personal org", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const org = await personalOrg(ada.person.id);
    const id = await task(org.id, "walk");

    const page = await board(ada.cookie, org.slug);
    const todo = page.columns.find((column) => column.status === "todo")!;
    expect(todo.tasks[0].holders).toEqual([]);
  });
});

describe("a due date set on the task page", () => {
  it("shows on the unified view row", async () => {
    const ada = await member("ada@tusker.test", "Ada Lovelace");
    const org = await team("hikes", [ada.person]);
    const id = await task(org.id, "walk");

    await save(ada.cookie, org.slug, id, { due_date: "2026-09-20" });

    const request = get("/me");
    request.headers.set("cookie", `${ada.cookie}; day=${DAY}`);
    const page = await meRoute.loader(routeArgs(request));
    const rows = page.groups.flatMap((group) => group.tasks);
    expect(rows.find((one) => one.id === id)!.due_date).toBe("2026-09-20");
  });
});
