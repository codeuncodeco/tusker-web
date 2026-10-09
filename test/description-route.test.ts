import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";

import * as taskRoute from "../app/routes/task";
import type { TaskId } from "../app/task-number";
import { member } from "./accounts";
import { caught, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;

beforeEach(wipe);

/** A task carrying the description the test wants to read back. */
async function task(orgId: string, id: TaskId, description: string) {
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, title, status, position, description) VALUES (?, ?, ?, 'todo', 1, ?)",
    )
    .bind(id, orgId, `Task ${id}`, description)
    .run();
  return id;
}

/** The task page, as one member reads it. */
function page(cookie: string, id: TaskId) {
  return taskRoute.loader(routeArgs(get(`/t/${id}`, cookie), { n: String(id) }));
}

/** One post to the task page, signed by one member. */
function act(cookie: string, id: TaskId, fields: Record<string, string>) {
  const request = post(`/t/${id}`, fields);
  request.headers.set("cookie", cookie);
  return taskRoute.action(routeArgs(request, { n: String(id) }));
}

/** One box of the description, ticked. */
function tick(cookie: string, id: TaskId, box: string) {
  return act(cookie, id, { intent: "tick", box });
}

/** The description the row holds now. */
async function described(id: TaskId) {
  const row = await db
    .prepare("SELECT description FROM tasks WHERE id = ?")
    .bind(id)
    .first<{ description: string }>();
  return row!.description;
}

it("the page carries the raw markdown, not markup made for it", async () => {
  const one = await member("rope@example.test", "Rope");
  await task(one.org.id, 1, "- [ ] buy rope");

  const data = await page(one.cookie, 1);
  expect(data.task.description).toBe("- [ ] buy rope");
});

it("ticking a box flips that line and keeps the rest of the text", async () => {
  const one = await member("tent@example.test", "Tent");
  await task(one.org.id, 1, "notes\n- [ ] buy rope\n- [x] pack tent");

  await tick(one.cookie, 1, "0");

  expect(await described(1)).toBe("notes\n- [x] buy rope\n- [x] pack tent");
});

it("a checkbox line inside a fence is not one of the boxes a tick counts", async () => {
  const one = await member("fence@example.test", "Fence");
  await task(one.org.id, 1, "- [ ] real\n```\n- [ ] typed\n```\n- [ ] also real");

  await tick(one.cookie, 1, "1");

  expect(await described(1)).toBe("- [ ] real\n```\n- [ ] typed\n```\n- [x] also real");
});

it("a box the description does not hold answers 404", async () => {
  const one = await member("gone@example.test", "Gone");
  await task(one.org.id, 1, "- [ ] one");

  const response = await caught(tick(one.cookie, 1, "3"));
  expect(response.status).toBe(404);
});

it("a box that is no number answers 404 and writes nothing", async () => {
  const one = await member("junk@example.test", "Junk");
  await task(one.org.id, 1, "- [ ] one");

  const response = await caught(tick(one.cookie, 1, "half"));
  expect(response.status).toBe(404);
  expect(await described(1)).toBe("- [ ] one");
});

it("a tick on another org's task answers 404, because the read is scoped", async () => {
  const one = await member("mine@example.test", "Mine");
  const other = await member("theirs@example.test", "Theirs");
  await task(other.org.id, 2, "- [ ] theirs");

  const response = await caught(tick(one.cookie, 2, "0"));
  expect(response.status).toBe(404);
  expect(await described(2)).toBe("- [ ] theirs");
});

/** The description, as the box posts it when it is left. */
function describeTask(cookie: string, id: TaskId, description: string) {
  return act(cookie, id, { intent: "describe", description });
}

it("leaving the box writes the description a person typed", async () => {
  const one = await member("typed@example.test", "Typed");
  await task(one.org.id, 1, "old");

  await describeTask(one.cookie, 1, "- [ ] buy rope\n- [ ] pack tent");

  expect(await described(1)).toBe("- [ ] buy rope\n- [ ] pack tent");
});

it("an emptied box writes an empty description", async () => {
  const one = await member("empty@example.test", "Empty");
  await task(one.org.id, 1, "old");

  await describeTask(one.cookie, 1, "");

  expect(await described(1)).toBe("");
});

it("a description saved on another org's task answers 404, because the write is scoped", async () => {
  const one = await member("here@example.test", "Here");
  const other = await member("there@example.test", "There");
  await task(other.org.id, 2, "theirs");

  const response = await caught(describeTask(one.cookie, 2, "mine now"));
  expect(response.status).toBe(404);
  expect(await described(2)).toBe("theirs");
});
