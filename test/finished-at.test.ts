/**
 * The finish time: `tasks.finished_at`, written when a task enters Done or
 * Cancelled and cleared when it leaves them. `updated_at` moves on every edit,
 * so only this column can say when the work was over. See #84.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as boardRoute from "../app/routes/board";
import * as loginRoute from "../app/routes/login";
import * as taskRoute from "../app/routes/task";
import { cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";

beforeEach(wipe);

/** An account, its personal org and a cookie that signs its requests. */
async function member(email: string, name: string) {
  const auth = createAuth(env, get("/"));
  const person = await createAccount(auth, { email, name, password: PASSWORD });
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email, password: PASSWORD })),
  )) as Response;
  const org = await db
    .prepare("SELECT id, slug FROM orgs JOIN memberships ON org_id = id WHERE user_id = ?")
    .bind(person.id)
    .first<{ id: string; slug: string }>();
  return { org: org!, cookie: cookieFrom(response) };
}

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

describe("an edit to a finished task", () => {
  it("does not change the stamp when the title is saved", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "done");
    const stamped = (await only()).finished_at;

    await task(ada.org.slug, ada.cookie, id, { title: "A better title" });

    const row = await db
      .prepare("SELECT title, finished_at, updated_at FROM tasks WHERE id = ?")
      .bind(id)
      .first<{ title: string; finished_at: string | null; updated_at: string }>();
    expect(row!.title).toBe("A better title");
    expect(row!.finished_at).toBe(stamped);
  });

  it("does not change the stamp when the description is saved", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "done");
    const stamped = (await only()).finished_at;

    await task(ada.org.slug, ada.cookie, id, { intent: "describe", description: "How it went" });

    expect((await only()).finished_at).toBe(stamped);
  });
});
