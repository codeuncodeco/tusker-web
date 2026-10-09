/**
 * The task page saves one control at a time. Each post names its control by
 * its intent and carries that control's value and nothing else, so it writes
 * that one value and leaves every other one as it was. See #204.
 *
 * With no script the page is one form, and Save posts the whole task, the
 * description with it.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { addMemberById } from "../app/orgs.server";
import * as fieldsRoute from "../app/routes/fields";
import * as taskRoute from "../app/routes/task";
import type { TaskId } from "../app/task-number";
import { member, signedIn } from "./accounts";
import { caught, post, routeArgs, wipe } from "./routes";

const db = env.DB;

beforeEach(wipe);

/** One post to the task page, signed by one member. */
function act(cookie: string, id: TaskId, fields: Record<string, string | string[]>) {
  const request = post(`/t/${id}`, fields);
  request.headers.set("cookie", cookie);
  return taskRoute.action(routeArgs(request, { n: String(id) }));
}

/** Declares one field for the org. */
async function declare(cookie: string, slug: string, label: string, type: string, options = "") {
  const request = post(`/o/${slug}/fields`, { intent: "declare", label, type, options });
  request.headers.set("cookie", cookie);
  await fieldsRoute.action(routeArgs(request, { slug }));
}

/**
 * Ada's org with Grace in it, a text and a select field declared, and one task
 * that holds a value in every control the page draws.
 */
async function fullTask() {
  const ada = await member("ada@example.test", "Ada");
  const grace = await signedIn("grace@example.test", "Grace");
  await addMemberById(db, ada.org.id, grace.person.id);

  await declare(ada.cookie, ada.org.slug, "Client", "text");
  await declare(ada.cookie, ada.org.slug, "Kind", "select", "Bug\nChore");

  await db
    .prepare(
      `INSERT INTO tasks (id, org_id, title, status, position, due_date, decides, description, data)
       VALUES (1, ?, 'Pack', 'todo', 1, '2026-12-01', 1, 'the words', ?)`,
    )
    .bind(ada.org.id, JSON.stringify({ client: "Acme", kind: "Bug" }))
    .run();
  await db
    .prepare("INSERT INTO task_assignees (task_id, org_id, user_id) VALUES (1, ?, ?)")
    .bind(ada.org.id, ada.person.id)
    .run();

  return { ada, grace };
}

/** Every value the page edits, as the tables hold them. */
async function held(id: TaskId) {
  const row = await db
    .prepare(
      "SELECT title, status, due_date, decides, description, data FROM tasks WHERE id = ?",
    )
    .bind(id)
    .first<{
      title: string;
      status: string;
      due_date: string | null;
      decides: number;
      description: string;
      data: string;
    }>();
  const { results } = await db
    .prepare("SELECT user_id FROM task_assignees WHERE task_id = ? ORDER BY user_id")
    .bind(id)
    .all<{ user_id: string }>();
  return {
    ...row!,
    data: JSON.parse(row!.data) as Record<string, string>,
    assignees: results.map((one) => one.user_id).sort(),
  };
}

describe("a post for one control", () => {
  it("writes the title and nothing else", async () => {
    const { ada } = await fullTask();
    const before = await held(1);

    await act(ada.cookie, 1, { intent: "title", title: "  Pack the tent " });

    expect(await held(1)).toEqual({ ...before, title: "Pack the tent" });
  });

  it("refuses an empty title, and the title stays", async () => {
    const { ada } = await fullTask();
    const before = await held(1);

    const response = await caught(act(ada.cookie, 1, { intent: "title", title: "  " }));

    expect(response.status).toBe(400);
    expect(await held(1)).toEqual(before);
  });

  it("writes one field, and keeps the other field, the date, the assignees and the mark", async () => {
    const { ada } = await fullTask();
    const before = await held(1);

    await act(ada.cookie, 1, { intent: "field", key: "kind", "field.kind": "Chore" });

    expect(await held(1)).toEqual({ ...before, data: { client: "Acme", kind: "Chore" } });
  });

  it("clears one field by posting it empty, and keeps the other", async () => {
    const { ada } = await fullTask();
    const before = await held(1);

    await act(ada.cookie, 1, { intent: "field", key: "client", "field.client": "" });

    expect(await held(1)).toEqual({ ...before, data: { kind: "Bug" } });
  });

  it("refuses a value the field does not take, and a field the org never declared", async () => {
    const { ada } = await fullTask();
    const before = await held(1);

    const wrong = await caught(
      act(ada.cookie, 1, { intent: "field", key: "kind", "field.kind": "Epic" }),
    );
    const unknown = await caught(
      act(ada.cookie, 1, { intent: "field", key: "budget", "field.budget": "9" }),
    );

    expect(wrong.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(await held(1)).toEqual(before);
  });

  it("writes the due date, clears it, and refuses a day no calendar holds", async () => {
    const { ada } = await fullTask();
    const before = await held(1);

    await act(ada.cookie, 1, { intent: "due", due_date: "2026-12-24" });
    expect(await held(1)).toEqual({ ...before, due_date: "2026-12-24" });

    await act(ada.cookie, 1, { intent: "due", due_date: "" });
    expect(await held(1)).toEqual({ ...before, due_date: null });

    const response = await caught(
      act(ada.cookie, 1, { intent: "due", due_date: "2026-13-40" }),
    );
    expect(response.status).toBe(400);
    expect((await held(1)).due_date).toBeNull();
  });

  it("puts the decision mark on and takes it off", async () => {
    const { ada } = await fullTask();
    const before = await held(1);

    await act(ada.cookie, 1, { intent: "mark", decides: "0" });
    expect(await held(1)).toEqual({ ...before, decides: 0 });

    await act(ada.cookie, 1, { intent: "mark", decides: "1" });
    expect(await held(1)).toEqual(before);
  });

  it("assigns one member and unassigns another, and keeps the rest", async () => {
    const { ada, grace } = await fullTask();
    const before = await held(1);

    await act(ada.cookie, 1, { intent: "assign", assignee: grace.person.id, held: "1" });
    expect(await held(1)).toEqual({
      ...before,
      assignees: [ada.person.id, grace.person.id].sort(),
    });

    // Assigning twice holds the member once.
    await act(ada.cookie, 1, { intent: "assign", assignee: grace.person.id, held: "1" });

    await act(ada.cookie, 1, { intent: "assign", assignee: ada.person.id, held: "0" });
    expect(await held(1)).toEqual({ ...before, assignees: [grace.person.id] });
  });

  it("refuses an assignee the org does not hold", async () => {
    const { ada } = await fullTask();
    const stranger = await signedIn("stranger@example.test", "Stranger");
    const before = await held(1);

    const response = await caught(
      act(ada.cookie, 1, { intent: "assign", assignee: stranger.person.id, held: "1" }),
    );

    expect(response.status).toBe(400);
    expect(await held(1)).toEqual(before);
  });

  it("moves the status, and keeps every other value", async () => {
    const { ada } = await fullTask();
    const before = await held(1);

    await act(ada.cookie, 1, { intent: "status", status: "in_progress" });

    expect(await held(1)).toEqual({ ...before, status: "in_progress" });
  });

  it("raises the decision prompt when the status moves a marked task to Done", async () => {
    const { ada } = await fullTask();

    const response = await caught(act(ada.cookie, 1, { intent: "status", status: "done" }));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/t/1");
    expect((await held(1)).status).toBe("done");
  });

  it("finishes the task when the status moves it to Cancelled", async () => {
    const { ada } = await fullTask();

    await act(ada.cookie, 1, { intent: "status", status: "cancelled" });

    const row = await db
      .prepare("SELECT status, finished_at FROM tasks WHERE id = 1")
      .first<{ status: string; finished_at: string | null }>();
    expect(row!.status).toBe("cancelled");
    expect(row!.finished_at).not.toBeNull();
  });
});

describe("a post for one control on a finished task", () => {
  const posts: Record<string, string>[] = [
    { intent: "title", title: "Rewritten" },
    { intent: "field", key: "kind", "field.kind": "Chore" },
    { intent: "due", due_date: "2026-12-24" },
    { intent: "mark", decides: "0" },
    { intent: "status", status: "todo" },
  ];

  for (const fields of posts) {
    it(`refuses ${fields.intent}, and the task keeps what it held`, async () => {
      const { ada } = await fullTask();
      await db.prepare("UPDATE tasks SET status = 'done' WHERE id = 1").run();
      const before = await held(1);

      const response = await caught(act(ada.cookie, 1, fields));

      expect(response.status).toBe(409);
      expect(await held(1)).toEqual(before);
    });
  }

  it("refuses assign, and the task keeps what it held", async () => {
    const { ada, grace } = await fullTask();
    await db.prepare("UPDATE tasks SET status = 'cancelled' WHERE id = 1").run();
    const before = await held(1);

    const response = await caught(
      act(ada.cookie, 1, { intent: "assign", assignee: grace.person.id, held: "1" }),
    );

    expect(response.status).toBe(409);
    expect(await held(1)).toEqual(before);
  });
});

describe("a post for one control on another org's task", () => {
  it("answers 404 and writes nothing", async () => {
    await fullTask();
    const bo = await member("bo@example.test", "Bo");
    const before = await held(1);

    // Bo is no member of the org that holds the task, so it answers as if there were none.
    const response = await caught(
      act(bo.cookie, 1, { intent: "title", title: "Mine now" }),
    );

    expect(response.status).toBe(404);
    expect(await held(1)).toEqual(before);
  });
});

describe("the whole-task save the page posts with no script", () => {
  it("writes the title, description, status, due date, assignees, mark and fields in one post", async () => {
    const { ada, grace } = await fullTask();

    await act(ada.cookie, 1, {
      title: "Pack the tent",
      description: "- [ ] poles",
      status: "in_progress",
      due_date: "2026-12-24",
      assignees: "picked",
      assignee: [grace.person.id],
      // The mark is unticked, so the box posts nothing.
      "field.client": "Globex",
      "field.kind": "Chore",
    });

    expect(await held(1)).toEqual({
      title: "Pack the tent",
      status: "in_progress",
      due_date: "2026-12-24",
      decides: 0,
      description: "- [ ] poles",
      data: { client: "Globex", kind: "Chore" },
      assignees: [grace.person.id],
    });
  });

  it("writes the description with the line breaks a person typed, not the ones a form posts", async () => {
    const { ada } = await fullTask();

    // A browser posts a textarea's line breaks as CRLF.
    await act(ada.cookie, 1, { title: "Pack", description: "- [x] poles\r\nwords" });

    expect((await held(1)).description).toBe("- [x] poles\nwords");
  });

  it("keeps the description when the post does not carry one", async () => {
    const { ada } = await fullTask();

    await act(ada.cookie, 1, { title: "Pack", status: "todo", decides: "1" });

    expect((await held(1)).description).toBe("the words");
  });
});
