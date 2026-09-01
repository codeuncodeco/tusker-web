import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as loginRoute from "../app/routes/login";
import * as taskRoute from "../app/routes/task";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

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

/** A task carrying the description the test wants to read back. */
async function task(orgId: string, id: string, description: string) {
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, title, status, position, description) VALUES (?, ?, ?, 'todo', 1, ?)",
    )
    .bind(id, orgId, id, description)
    .run();
  return id;
}

/** The task page, as one member reads it. */
function page(cookie: string, slug: string, taskId: string) {
  return taskRoute.loader(routeArgs(get(`/o/${slug}/t/${taskId}`, cookie), { slug, taskId }));
}

/** One box of the description, ticked. */
function tick(cookie: string, slug: string, taskId: string, box: string) {
  const request = post(`/o/${slug}/t/${taskId}`, { intent: "tick", box });
  request.headers.set("cookie", cookie);
  return taskRoute.action(routeArgs(request, { slug, taskId }));
}

/** The description the row holds now. */
async function described(taskId: string) {
  const row = await db
    .prepare("SELECT description FROM tasks WHERE id = ?")
    .bind(taskId)
    .first<{ description: string }>();
  return row!.description;
}

it("the page carries the raw markdown, not markup made for it", async () => {
  const one = await member("rope@example.test", "Rope");
  await task(one.org.id, "t1", "- [ ] buy rope");

  const data = await page(one.cookie, one.org.slug, "t1");
  expect(data.task.description).toBe("- [ ] buy rope");
});

it("ticking a box flips that line and keeps the rest of the text", async () => {
  const one = await member("tent@example.test", "Tent");
  await task(one.org.id, "t1", "notes\n- [ ] buy rope\n- [x] pack tent");

  await tick(one.cookie, one.org.slug, "t1", "0");

  expect(await described("t1")).toBe("notes\n- [x] buy rope\n- [x] pack tent");
});

it("a checkbox line inside a fence is not one of the boxes a tick counts", async () => {
  const one = await member("fence@example.test", "Fence");
  await task(one.org.id, "t1", "- [ ] real\n```\n- [ ] typed\n```\n- [ ] also real");

  await tick(one.cookie, one.org.slug, "t1", "1");

  expect(await described("t1")).toBe("- [ ] real\n```\n- [ ] typed\n```\n- [x] also real");
});

it("a box the description does not hold answers 404", async () => {
  const one = await member("gone@example.test", "Gone");
  await task(one.org.id, "t1", "- [ ] one");

  const response = await caught(tick(one.cookie, one.org.slug, "t1", "3"));
  expect(response.status).toBe(404);
});

it("a tick on another org's task answers 404, because the read is scoped", async () => {
  const one = await member("mine@example.test", "Mine");
  const other = await member("theirs@example.test", "Theirs");
  await task(other.org.id, "t2", "- [ ] theirs");

  const response = await caught(tick(one.cookie, one.org.slug, "t2", "0"));
  expect(response.status).toBe(404);
  expect(await described("t2")).toBe("- [ ] theirs");
});
