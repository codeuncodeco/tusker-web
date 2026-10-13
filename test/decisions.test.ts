import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import type { Status } from "../app/board";
import * as boardRoute from "../app/routes/board";
import * as logRoute from "../app/routes/decisions";
import * as focusRoute from "../app/routes/me.focus";
import * as meRoute from "../app/routes/me";
import * as taskRoute from "../app/routes/task";
import type { TaskId } from "../app/task-number";
import { pageOf, withPrompt, withoutPrompt } from "../app/decisions";
import { aside, member } from "./accounts";
import { caught, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const DAY = "2026-09-01";

beforeEach(wipe);

/**
 * A task, placed by hand so a test can state the column it wants. `decides`
 * marks it as one that holds a decision, which is what raises the prompt.
 */
async function task(
  orgId: string,
  id: TaskId,
  some: { status?: Status; decides?: boolean; title?: string } = {},
) {
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, title, status, position, decides) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .bind(id, orgId, some.title ?? "ship", some.status ?? "todo", some.decides === false ? 0 : 1)
    .run();
  return id;
}

/** A task nobody marked, which is every task by default. */
function plainTask(orgId: string, id: TaskId, some: { status?: Status; title?: string } = {}) {
  return task(orgId, id, { ...some, decides: false });
}

/** A post to the board, signed by the cookie. */
function onBoard(cookie: string, slug: string, fields: Record<string, string>, query = "") {
  const request = post(`/o/${slug}/board${query}`, fields);
  request.headers.set("cookie", cookie);
  return boardRoute.action(routeArgs(request, { slug }));
}

/** A task finished on the board, which is what raises the prompt. */
function finish(cookie: string, slug: string, id: TaskId) {
  return onBoard(cookie, slug, { intent: "move", id: String(id), status: "done" });
}

/** The board, as one person reads it. */
function board(cookie: string, slug: string, query = "") {
  return boardRoute.loader(routeArgs(get(`/o/${slug}/board${query}`, cookie), { slug }));
}

/** A post to the unified view, on the day the browser is in. */
function onMe(cookie: string, fields: Record<string, string>, query = "") {
  const request = post(`/me${query}`, fields);
  request.headers.set("cookie", `${cookie}; day=${DAY}`);
  return meRoute.action(routeArgs(request));
}

/** The unified view, as one person reads it. */
function mePage(cookie: string, query = "") {
  return meRoute.loader(routeArgs(get(`/me${query}`, `${cookie}; day=${DAY}`)));
}

/** A post to focus mode, which finishes a task as every other screen does. */
function onFocus(cookie: string, fields: Record<string, string>) {
  const request = post("/me/focus", fields);
  request.headers.set("cookie", `${cookie}; day=${DAY}`);
  return focusRoute.action(routeArgs(request));
}

/** Focus mode, as one person reads it. */
function focusPage(cookie: string, query = "") {
  return focusRoute.loader(routeArgs(get(`/me/focus${query}`, `${cookie}; day=${DAY}`)));
}

/** A post to one task page. */
function onTask(cookie: string, taskId: TaskId, fields: Record<string, string>) {
  const request = post(`/t/${taskId}`, fields);
  request.headers.set("cookie", cookie);
  return taskRoute.action(routeArgs(request, { n: String(taskId) }));
}

/** One task page, as one person reads it. */
function taskPage(cookie: string, taskId: TaskId, query = "") {
  return taskRoute.loader(routeArgs(get(`/t/${taskId}${query}`, cookie), { n: String(taskId) }));
}

/** The decision log of one org. */
function log(cookie: string, slug: string) {
  return logRoute.loader(routeArgs(get(`/o/${slug}/decisions`, cookie), { slug }));
}

/** A post to the decision log, which is where a decision with no task is written. */
function onLog(cookie: string, slug: string, fields: Record<string, string>) {
  const request = post(`/o/${slug}/decisions`, { intent: "record", ...fields });
  request.headers.set("cookie", cookie);
  return logRoute.action(routeArgs(request, { slug }));
}

/** The query string a redirect answered with. */
function query(response: unknown): URLSearchParams {
  const location = (response as Response).headers.get("location")!;
  return new URL(location, "https://tusker.test").searchParams;
}

/** The mark one task carries. */
async function marked(id: TaskId): Promise<number> {
  const row = await db
    .prepare("SELECT decides FROM tasks WHERE id = ?")
    .bind(id)
    .first<{ decides: number }>();
  return row!.decides;
}

/** Every decision row, oldest first, as the table holds it. */
async function rows() {
  const { results } = await db
    .prepare("SELECT id, org_id, task_id, title, rationale FROM decisions ORDER BY rowid")
    .all<{ id: string; org_id: string; task_id: TaskId | null; title: string; rationale: string }>();
  return results;
}

describe("marking a task as one that holds a decision", () => {
  it("is off by default in the board's quick-add box", async () => {
    const ada = await member("ada@example.test", "Ada");

    await onBoard(ada.cookie, ada.org.slug, { intent: "create", title: "Water the plants", status: "todo" });

    const made = await db
      .prepare("SELECT id, decides FROM tasks")
      .first<{ id: string; decides: number }>();
    expect(made!.decides).toBe(0);
  });

  // The box sets no mark: the task page does. See ADR-0010.
  it("stays off when a post from the box names it", async () => {
    const ada = await member("ada@example.test", "Ada");

    await onBoard(ada.cookie, ada.org.slug, {
      intent: "create",
      title: "Pick a database",
      status: "todo",
      decides: "1",
    });

    const made = await db
      .prepare("SELECT id, decides FROM tasks")
      .first<{ id: string; decides: number }>();
    expect(made!.decides).toBe(0);
  });

  it("asks nothing for a task typed straight into Done, though the post names a mark", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await onBoard(ada.cookie, ada.org.slug, {
      intent: "create",
      title: "Pick a database",
      status: "done",
      decides: "1",
    });

    expect(response).toEqual({ ok: true });
  });

  it("goes on and off from the task page, which reads it back", async () => {
    const ada = await member("ada@example.test", "Ada");
    await plainTask(ada.org.id, 1);

    await onTask(ada.cookie, 1, { title: "ship", decides: "1" });
    expect(await marked(1)).toBe(1);
    expect((await taskPage(ada.cookie, 1)).task.decides).toBe(true);

    // An unticked box is absent from the post, which is how the mark comes off.
    await onTask(ada.cookie, 1, { title: "ship" });
    expect(await marked(1)).toBe(0);
    expect((await taskPage(ada.cookie, 1)).task.decides).toBe(false);
  });
});

describe("the prompt on finishing a marked task", () => {
  it("is raised when a marked board card moves to Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    const response = await finish(ada.cookie, ada.org.slug, 1);

    expect(query(response).get("ask")).toBe("1");
    expect((await board(ada.cookie, ada.org.slug, "?ask=1")).ask).toEqual({
      id: 1,
      slug: ada.org.slug,
      title: "ship",
    });
  });

  it("is not raised by a move that does not finish the task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    const response = await onBoard(ada.cookie, ada.org.slug, {
      intent: "move",
      id: "1",
      status: "in_progress",
    });

    expect(response).toEqual({ ok: true });
  });

  it("keeps the rest of the query string, so a narrowed board stays narrowed", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    const response = await onBoard(
      ada.cookie,
      ada.org.slug,
      { intent: "move", id: "1", status: "done" },
      "?cancelled=1",
    );

    expect(query(response).get("cancelled")).toBe("1");
  });

  it("is raised by the unified view, which names the org the task is in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await aside(ada.person);
    await task(ada.org.id, 1);

    const response = await onMe(ada.cookie, { intent: "finish", id: "1", slug: ada.org.slug });

    expect(query(response).get("ask")).toBe("1");
    expect(query(response).get("org")).toBe(ada.org.slug);
    expect((await mePage(ada.cookie, `?ask=1&org=${ada.org.slug}`)).ask).toEqual({
      id: 1,
      slug: ada.org.slug,
      title: "ship",
    });
  });

  it("is raised by the task page, which finishes a task of its own", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    const response = await onTask(ada.cookie, 1, { intent: "finish" });

    expect(query(response).get("ask")).toBe("1");
    const status = await db.prepare("SELECT status FROM tasks WHERE id = 1").first<{
      status: string;
    }>();
    expect(status!.status).toBe("done");
  });

  it("is raised by focus mode, which finishes a task as the board does", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    const response = await onFocus(ada.cookie, {
      intent: "finish",
      id: "1",
      slug: ada.org.slug,
    });

    expect(query(response).get("ask")).toBe("1");
    expect(query(response).get("org")).toBe(ada.org.slug);
    expect((await focusPage(ada.cookie, `?ask=1&org=${ada.org.slug}`)).ask).toEqual({
      id: 1,
      slug: ada.org.slug,
      title: "ship",
    });
  });

  it("reads null for a task the person's orgs do not hold", async () => {
    const ada = await member("ada@example.test", "Ada");
    await aside(ada.person);
    const bob = await member("bob@example.test", "Bob");
    await task(bob.org.id, 1);

    expect((await board(ada.cookie, ada.org.slug, "?ask=1")).ask).toBe(null);
    expect((await mePage(ada.cookie, `?ask=1&org=${bob.org.slug}`)).ask).toBe(null);
  });

  it("reads null for a marked task that is not finished, so the address is no way in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    expect((await board(ada.cookie, ada.org.slug, "?ask=1")).ask).toBe(null);
  });
});

describe("an unmarked task", () => {
  it("raises no prompt on the board", async () => {
    const ada = await member("ada@example.test", "Ada");
    await plainTask(ada.org.id, 1);

    expect(await finish(ada.cookie, ada.org.slug, 1)).toEqual({ ok: true });
    expect((await board(ada.cookie, ada.org.slug, "?ask=1")).ask).toBe(null);
  });

  it("raises no prompt however else it is finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await plainTask(ada.org.id, 1);
    await plainTask(ada.org.id, 2);
    await plainTask(ada.org.id, 3);

    expect(await onMe(ada.cookie, { intent: "finish", id: "1", slug: ada.org.slug })).toEqual({
      ok: true,
    });
    expect(await onTask(ada.cookie, 2, { intent: "finish" })).toEqual({
      ok: true,
    });
    expect(await onFocus(ada.cookie, { intent: "finish", id: "3", slug: ada.org.slug })).toEqual(
      { ok: true },
    );
  });

  it("takes no decision, even from a form that names it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await plainTask(ada.org.id, 1, { status: "done" });

    const response = await caught(
      onBoard(ada.cookie, ada.org.slug, { intent: "decide", id: "1", title: "Not asked for" }),
    );

    expect(response.status).toBe(404);
    expect(await rows()).toEqual([]);
  });
});

describe("skipping the prompt", () => {
  it("leaves the task Done, and writes no decision", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    await finish(ada.cookie, ada.org.slug, 1);

    const row = await db
      .prepare("SELECT status, decides FROM tasks WHERE id = 1")
      .first<{ status: string; decides: number }>();
    expect(row).toEqual({ status: "done", decides: 1 });
    expect(await rows()).toEqual([]);
  });

  it("is a not-now: the task is asked again the next time it is finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    await finish(ada.cookie, ada.org.slug, 1);
    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "1", status: "todo" });
    const again = await finish(ada.cookie, ada.org.slug, 1);

    expect(query(again).get("ask")).toBe("1");
  });

  it("ends when the person unmarks the task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await finish(ada.cookie, ada.org.slug, 1);

    // A finished task is reopened before it is saved. See #164.
    await onTask(ada.cookie, 1, { intent: "reopen" });
    await onTask(ada.cookie, 1, { title: "ship" });
    const again = await finish(ada.cookie, ada.org.slug, 1);

    expect(again).toEqual({ ok: true });
  });
});

describe("a task that already holds a decision", () => {
  it("is not asked again, however it is finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await finish(ada.cookie, ada.org.slug, 1);
    await onBoard(ada.cookie, ada.org.slug, {
      intent: "decide",
      id: "1",
      title: "Ship on Friday",
    });

    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "1", status: "todo" });
    expect(await finish(ada.cookie, ada.org.slug, 1)).toEqual({ ok: true });
    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "1", status: "todo" });
    expect(await onTask(ada.cookie, 1, { intent: "finish" })).toEqual({
      ok: true,
    });
  });

  it("raises no prompt on a reload of the page that asked", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await finish(ada.cookie, ada.org.slug, 1);
    await onBoard(ada.cookie, ada.org.slug, {
      intent: "decide",
      id: "1",
      title: "Ship on Friday",
    });

    expect((await board(ada.cookie, ada.org.slug, "?ask=1")).ask).toBe(null);
  });
});

describe("saving a decision", () => {
  it("writes it to the org that holds the task, with the task id", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await finish(ada.cookie, ada.org.slug, 1);

    const response = await onBoard(
      ada.cookie,
      ada.org.slug,
      { intent: "decide", id: "1", title: "Ship on Friday", rationale: "The test is green." },
      "?ask=1",
    );

    expect((response as Response).headers.get("location")).toBe(`/o/${ada.org.slug}/board`);
    const [written] = await rows();
    expect(written.org_id).toBe(ada.org.id);
    expect(written.task_id).toBe(1);
    expect(written.title).toBe("Ship on Friday");
    expect(written.rationale).toBe("The test is green.");
  });

  it("names the person who decided", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await finish(ada.cookie, ada.org.slug, 1);

    await onMe(ada.cookie, {
      intent: "decide",
      id: "1",
      slug: ada.org.slug,
      title: "Ship on Friday",
    });

    const row = await db
      .prepare("SELECT decided_by FROM decisions")
      .first<{ decided_by: string }>();
    expect(row!.decided_by).toBe(ada.person.id);
  });

  it("refuses an empty title, and keeps the words the person typed", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await finish(ada.cookie, ada.org.slug, 1);

    const answer = await onBoard(ada.cookie, ada.org.slug, {
      intent: "decide",
      id: "1",
      title: "  ",
      rationale: "The test is green.",
    });

    expect(answer).toEqual({ error: "A decision needs a title." });
    expect(await rows()).toEqual([]);
  });

  it("writes one decision for a form posted twice", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await finish(ada.cookie, ada.org.slug, 1);
    const save = { intent: "decide", id: "1", title: "Ship on Friday" };

    await onBoard(ada.cookie, ada.org.slug, save);
    const again = await caught(onBoard(ada.cookie, ada.org.slug, save));

    expect(again.status).toBe(404);
    expect(await rows()).toHaveLength(1);
  });

  it("refuses a task another org holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(bob.org.id, 1, { status: "done" });

    const response = await caught(
      onBoard(ada.cookie, ada.org.slug, {
        intent: "decide",
        id: "1",
        title: "Not mine to make",
      }),
    );

    expect(response.status).toBe(404);
    expect(await rows()).toEqual([]);
  });
});

describe("writing a decision on the log itself", () => {
  it("writes it to the org, with no task, named by the person who decided", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await onLog(ada.cookie, ada.org.slug, {
      title: "Ship on Friday",
      rationale: "Nobody made a task of it.",
    });

    expect((response as Response).headers.get("location")).toBe(`/o/${ada.org.slug}/decisions`);
    const [written] = await rows();
    expect(written.org_id).toBe(ada.org.id);
    expect(written.task_id).toBe(null);
    expect(written.title).toBe("Ship on Friday");
    expect(written.rationale).toBe("Nobody made a task of it.");
    const row = await db
      .prepare("SELECT decided_by FROM decisions")
      .first<{ decided_by: string }>();
    expect(row!.decided_by).toBe(ada.person.id);
  });

  it("reads back in the log as a line with no task", async () => {
    const ada = await member("ada@example.test", "Ada");

    await onLog(ada.cookie, ada.org.slug, { title: "Ship on Friday" });

    const { decisions } = await log(ada.cookie, ada.org.slug);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].title).toBe("Ship on Friday");
    expect(decisions[0].task).toBe(null);
  });

  it("takes an empty rationale", async () => {
    const ada = await member("ada@example.test", "Ada");

    await onLog(ada.cookie, ada.org.slug, { title: "Ship on Friday" });

    const [written] = await rows();
    expect(written.rationale).toBe("");
  });

  it("refuses an empty title, and gives back the words the person typed", async () => {
    const ada = await member("ada@example.test", "Ada");

    const answer = await onLog(ada.cookie, ada.org.slug, {
      title: "  ",
      rationale: "The test is green.",
    });

    expect(answer).toEqual({
      error: "A decision needs a title.",
      title: "  ",
      rationale: "The test is green.",
    });
    expect(await rows()).toEqual([]);
  });

  it("refuses a post that names no action", async () => {
    const ada = await member("ada@example.test", "Ada");

    const request = post(`/o/${ada.org.slug}/decisions`, { title: "Ship on Friday" });
    request.headers.set("cookie", ada.cookie);
    const response = await caught(
      logRoute.action(routeArgs(request, { slug: ada.org.slug })) as Promise<unknown>,
    );

    expect(response.status).toBe(400);
    expect(await rows()).toEqual([]);
  });

  it("is a 404 for a person the org does not hold", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");

    const response = await caught(onLog(ada.cookie, bob.org.slug, { title: "Not mine to make" }));

    expect(response.status).toBe(404);
    expect(await rows()).toEqual([]);
  });
});

describe("a decision outliving its task", () => {
  it("stays in the log with the link cleared when the task is deleted", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await finish(ada.cookie, ada.org.slug, 1);
    await onBoard(ada.cookie, ada.org.slug, {
      intent: "decide",
      id: "1",
      title: "Ship on Friday",
    });

    await db.prepare("DELETE FROM tasks WHERE id = 1").run();

    const [kept] = await rows();
    expect(kept.title).toBe("Ship on Friday");
    expect(kept.task_id).toBe(null);
    expect((await log(ada.cookie, ada.org.slug)).decisions[0].task).toBe(null);
  });
});

describe("the log", () => {
  it("lists the org's decisions newest first, and links to the task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1, { title: "first" });
    await task(ada.org.id, 2, { title: "second" });
    await finish(ada.cookie, ada.org.slug, 1);
    await finish(ada.cookie, ada.org.slug, 2);
    await onBoard(ada.cookie, ada.org.slug, { intent: "decide", id: "1", title: "One" });
    await onBoard(ada.cookie, ada.org.slug, { intent: "decide", id: "2", title: "Two" });

    const { decisions } = await log(ada.cookie, ada.org.slug);

    expect(decisions.map((one) => one.title)).toEqual(["Two", "One"]);
    expect(decisions[1].task).toEqual({ id: 1, title: "first" });
  });

  it("holds one org's decisions and no other org's", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(ada.org.id, 1);
    await task(bob.org.id, 2);
    await finish(ada.cookie, ada.org.slug, 1);
    await finish(bob.cookie, bob.org.slug, 2);
    await onBoard(ada.cookie, ada.org.slug, { intent: "decide", id: "1", title: "Mine" });
    await onBoard(bob.cookie, bob.org.slug, { intent: "decide", id: "2", title: "Theirs" });

    expect((await log(ada.cookie, ada.org.slug)).decisions.map((one) => one.title)).toEqual([
      "Mine",
    ]);
  });

  it("is a 404 for a person the org does not hold", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");

    const response = await caught(log(ada.cookie, bob.org.slug));

    expect(response.status).toBe(404);
  });
});

describe("where the prompt lives", () => {
  it("raises the prompt on a page, keeping the query string it had", () => {
    expect(withPrompt("/o/acme/board", "?cancelled=1", { id: 1, slug: "acme" })).toBe(
      "/o/acme/board?cancelled=1&ask=1&org=acme",
    );
  });

  it("closes it, and leaves a page with nothing else to say no query string", () => {
    expect(withoutPrompt("/me", "?ask=1&org=acme")).toBe("/me");
    expect(withoutPrompt("/me", "?ask=1&org=acme&today=1")).toBe("/me?today=1");
  });
});

// A fetcher posts to the page's data address, and the prompt is a place on the
// page, not on that address. A redirect to `/me.data` is a 404.
describe("the page a post came from", () => {
  it("is the page itself for a post to its data address", () => {
    expect(pageOf("/me.data")).toBe("/me");
    expect(pageOf("/o/acme/board.data")).toBe("/o/acme/board");
  });

  it("is the root for a post to the root's data address", () => {
    expect(pageOf("/_root.data")).toBe("/");
  });

  it("is the path as it came for a plain post", () => {
    expect(pageOf("/me")).toBe("/me");
    expect(pageOf("/o/acme/board")).toBe("/o/acme/board");
  });
});
