/**
 * The finish time: `tasks.finished_at`, written when a task enters Done or
 * Cancelled and cleared when it leaves them. `updated_at` moves on every edit,
 * so only this column can say when the work was over. See #84.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import * as boardRoute from "../app/routes/board";
import * as taskRoute from "../app/routes/task";
import { member } from "./accounts";
import { post, routeArgs, wipe } from "./routes";

const db = env.DB;

beforeEach(wipe);

/** A post to the board action, signed by the cookie. */
function board(slug: string, cookie: string, fields: Record<string, string>) {
  const request = post(`/o/${slug}/board`, fields);
  request.headers.set("cookie", cookie);
  return boardRoute.action(routeArgs(request, { slug }));
}

/** A post to the task page, signed by the cookie. */
function task(slug: string, cookie: string, taskId: string, fields: Record<string, string>) {
  const request = post(`/o/${slug}/t/${taskId}`, fields);
  request.headers.set("cookie", cookie);
  return taskRoute.action(routeArgs(request, { slug, taskId }));
}

/** The one task the org holds, as the row carries it. */
async function only(): Promise<{ id: string; status: string; finished_at: string | null }> {
  const row = await db
    .prepare("SELECT id, status, finished_at FROM tasks")
    .first<{ id: string; status: string; finished_at: string | null }>();
  return row!;
}

/** One task in one column, made by the board's quick add. */
async function made(slug: string, cookie: string, status: string, title = "Some work") {
  await board(slug, cookie, { intent: "create", status, title });
  return (await only()).id;
}

describe("a move into the finished columns", () => {
  it("stamps a task moved into Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "todo");

    await board(ada.org.slug, ada.cookie, { intent: "move", id, status: "done" });

    expect((await only()).finished_at).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("stamps a task moved into Cancelled", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "todo");

    await board(ada.org.slug, ada.cookie, { intent: "move", id, status: "cancelled" });

    expect((await only()).finished_at).not.toBeNull();
  });

  it("stamps a task typed straight into Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    await made(ada.org.slug, ada.cookie, "done");

    expect((await only()).finished_at).not.toBeNull();
  });

  it("leaves a live task with no finish time", async () => {
    const ada = await member("ada@example.test", "Ada");
    await made(ada.org.slug, ada.cookie, "todo");

    expect((await only()).finished_at).toBeNull();
  });

  it("keeps the first stamp when the task moves between the two", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "todo");
    await board(ada.org.slug, ada.cookie, { intent: "move", id, status: "done" });
    const stamped = (await only()).finished_at;

    await board(ada.org.slug, ada.cookie, { intent: "move", id, status: "cancelled" });

    expect((await only()).finished_at).toBe(stamped);
  });

  it("keeps the stamp when the card is reordered inside Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "done");
    const stamped = (await only()).finished_at;

    await board(ada.org.slug, ada.cookie, { intent: "move", id, status: "done" });

    expect((await only()).finished_at).toBe(stamped);
  });
});

describe("a move out of the finished columns", () => {
  it("clears the stamp", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "done");

    await board(ada.org.slug, ada.cookie, { intent: "move", id, status: "todo" });

    expect(await only()).toMatchObject({ status: "todo", finished_at: null });
  });
});

describe("a finished task on its page", () => {
  // A finished task is read on its page, not edited. A tick is the one write
  // to its text the page still takes. See #164.
  it("does not change the stamp when a box of the description is ticked", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "done");
    await db.prepare("UPDATE tasks SET description = '- [ ] tidy up' WHERE id = ?").bind(id).run();
    const stamped = (await only()).finished_at;

    await task(ada.org.slug, ada.cookie, id, { intent: "tick", box: "0" });

    const row = await db
      .prepare("SELECT description, finished_at FROM tasks WHERE id = ?")
      .bind(id)
      .first<{ description: string; finished_at: string | null }>();
    expect(row).toEqual({ description: "- [x] tidy up", finished_at: stamped });
  });

  it("clears the stamp when it is reopened", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "done");

    await task(ada.org.slug, ada.cookie, id, { intent: "reopen" });

    expect(await only()).toMatchObject({ status: "todo", finished_at: null });
  });
});
