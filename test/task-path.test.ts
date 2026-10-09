/**
 * A task is named by a number the database counts out, and its page is
 * `/t/<n>`. The path names no org, so the page finds the org from the task and
 * proves the membership, and every task the person may not read is the same
 * 404. See ADR-0030.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { addMemberById } from "../app/orgs.server";
import { taskPath } from "../app/paths";
import * as taskLayout from "../app/layouts/task";
import * as taskRoute from "../app/routes/task";
import { requireScope } from "../app/scope.server";
import { createTasks, deleteTask } from "../app/tasks.server";
import { readTaskId } from "../app/task-number";
import { member, signedIn } from "./accounts";
import { caught, get, routeArgs, wipe } from "./routes";

const db = env.DB;

beforeEach(wipe);

/** A member's own org, and their scope in it, as the routes prove one. */
async function owner(email: string, name: string) {
  const made = await member(email, name);
  const scope = await requireScope(get(`/o/${made.org.slug}/board`, made.cookie), env, made.org.slug);
  return { ...made, scope };
}

const ada = () => owner("ada@example.test", "Ada");

/** The task page, as one signed-in person loads it. */
function load(n: string, cookie: string, search = "") {
  return taskRoute.loader(routeArgs(get(`/t/${n}${search}`, cookie), { n }));
}

describe("the task number", () => {
  it("counts up across orgs, in the order the tasks are made", async () => {
    const one = await ada();
    const grace = await owner("grace@example.test", "Grace");

    const first = await createTasks(db, one.scope, { titles: ["a", "b"], status: "todo", assignees: [] });
    const second = await createTasks(db, grace.scope, { titles: ["c"], status: "todo", assignees: [] });
    const third = await createTasks(db, one.scope, { titles: ["d"], status: "todo", assignees: [] });

    const all = [...first, ...second, ...third];
    expect(all.every((id) => Number.isInteger(id))).toBe(true);
    expect(all).toEqual([...all].sort((a, b) => a - b));
    expect(new Set(all).size).toBe(4);
  });

  it("is never handed out again after the newest task is deleted", async () => {
    const one = await ada();
    const [made] = await createTasks(db, one.scope, { titles: ["Gone"], status: "todo", assignees: [] });
    await deleteTask(db, one.scope, made);

    const [next] = await createTasks(db, one.scope, { titles: ["Next"], status: "todo", assignees: [] });
    expect(next).toBeGreaterThan(made);
  });

  it("writes each task's assignees against that task", async () => {
    const one = await ada();
    const grace = await signedIn("grace@example.test", "Grace");
    await addMemberById(db, one.org.id, grace.person.id);

    const ids = await createTasks(db, one.scope, {
      titles: ["a", "b", "c"],
      status: "todo",
      assignees: [one.person.id, grace.person.id],
    });

    const { results } = await db
      .prepare("SELECT task_id, user_id FROM task_assignees ORDER BY task_id, user_id")
      .all<{ task_id: number; user_id: string }>();
    const people = [one.person.id, grace.person.id].sort();
    expect(results).toEqual(ids.flatMap((id) => people.map((user_id) => ({ task_id: id, user_id }))));
  });

  it("reads from a path or a form only as a whole number from 1", () => {
    expect(readTaskId("1234")).toBe(1234);
    expect(readTaskId("0")).toBeNull();
    expect(readTaskId("012")).toBeNull();
    expect(readTaskId("1.5")).toBeNull();
    expect(readTaskId("-3")).toBeNull();
    expect(readTaskId("abc")).toBeNull();
    expect(readTaskId("")).toBeNull();
    expect(readTaskId(null)).toBeNull();
  });
});

describe("the task path", () => {
  it("is /t/<n>, with the origin when there is one", () => {
    expect(taskPath(1234)).toBe("/t/1234");
    expect(taskPath(1234, "/me?today=1")).toBe("/t/1234?from=%2Fme%3Ftoday%3D1");
  });

  it("opens the task for a member of its org, with the org board as the way back", async () => {
    const one = await ada();
    const [id] = await createTasks(db, one.scope, { titles: ["Pack"], status: "todo", assignees: [] });

    const page = await load(String(id), one.cookie);
    expect(page.task).toMatchObject({ id, title: "Pack" });
    expect(page.org.slug).toBe(one.org.slug);
    expect(page.back).toBe(`/o/${one.org.slug}/board`);
  });

  it("goes back to the list it was opened from", async () => {
    const one = await ada();
    const [id] = await createTasks(db, one.scope, { titles: ["Pack"], status: "todo", assignees: [] });

    const page = await load(String(id), one.cookie, "?from=%2Fme%2Fplan");
    expect(page.back).toBe("/me/plan");
  });

  it("names the task by its number in the title", async () => {
    const one = await ada();
    const [id] = await createTasks(db, one.scope, { titles: ["Pack"], status: "todo", assignees: [] });
    const loaderData = await load(String(id), one.cookie);

    const meta = taskRoute.meta({ loaderData } as never);
    expect(meta).toEqual([{ title: `#${id} Pack — Tusker` }]);
  });

  it("gives one 404 for another org's task, a deleted task, a number never handed out and no number", async () => {
    const one = await ada();
    const grace = await member("grace@example.test", "Grace");
    const [held] = await createTasks(db, one.scope, { titles: ["Ada's"], status: "todo", assignees: [] });
    const [gone] = await createTasks(db, one.scope, { titles: ["Gone"], status: "todo", assignees: [] });
    await deleteTask(db, one.scope, gone);

    for (const n of [String(held), String(gone), "999999", "abc"]) {
      const answer = await caught(load(n, grace.cookie));
      expect(answer.status).toBe(404);
      expect(await answer.text()).toBe("Not found");
    }
  });

  it("sends a signed-out person to sign in", async () => {
    const one = await ada();
    const [id] = await createTasks(db, one.scope, { titles: ["Pack"], status: "todo", assignees: [] });

    const answer = await caught(taskRoute.loader(routeArgs(get(`/t/${id}`), { n: String(id) })));
    expect(answer.status).toBe(302);
  });

  it("draws the header in the task's org", async () => {
    const one = await ada();
    const [id] = await createTasks(db, one.scope, { titles: ["Pack"], status: "todo", assignees: [] });

    const layout = await taskLayout.loader(routeArgs(get(`/t/${id}`, one.cookie), { n: String(id) }));
    expect(layout.org.slug).toBe(one.org.slug);
  });
});
