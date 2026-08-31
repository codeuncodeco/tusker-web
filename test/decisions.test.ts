import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import * as boardRoute from "../app/routes/board";
import * as logRoute from "../app/routes/decisions";
import * as focusRoute from "../app/routes/me.focus";
import * as loginRoute from "../app/routes/login";
import * as meRoute from "../app/routes/me";
import * as taskRoute from "../app/routes/task";
import { withPrompt, withoutPrompt } from "../app/decisions";
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
  const org = await db
    .prepare("SELECT id, slug FROM orgs JOIN memberships ON org_id = id WHERE user_id = ?")
    .bind(person.id)
    .first<{ id: string; slug: string }>();
  return { person, org: org!, cookie: cookieFrom(response) };
}

/**
 * A task, placed by hand so a test can state the column it wants. `decides`
 * marks it as one that holds a decision, which is what raises the prompt.
 */
async function task(orgId: string, id: string, some: { status?: Status; decides?: boolean } = {}) {
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, title, status, position, decides) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .bind(id, orgId, id, some.status ?? "todo", some.decides === false ? 0 : 1)
    .run();
  return id;
}

/** A task nobody marked, which is every task by default. */
function plainTask(orgId: string, id: string, some: { status?: Status } = {}) {
  return task(orgId, id, { ...some, decides: false });
}

/** A post to the board, signed by the cookie. */
function onBoard(cookie: string, slug: string, fields: Record<string, string>, query = "") {
  const request = post(`/o/${slug}/board${query}`, fields);
  request.headers.set("cookie", cookie);
  return boardRoute.action(routeArgs(request, { slug }));
}

/** A task finished on the board, which is what raises the prompt. */
function finish(cookie: string, slug: string, id: string) {
  return onBoard(cookie, slug, { intent: "move", id, status: "done" });
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
function onTask(cookie: string, slug: string, taskId: string, fields: Record<string, string>) {
  const request = post(`/o/${slug}/t/${taskId}`, fields);
  request.headers.set("cookie", cookie);
  return taskRoute.action(routeArgs(request, { slug, taskId }));
}

/** One task page, as one person reads it. */
function taskPage(cookie: string, slug: string, taskId: string, query = "") {
  return taskRoute.loader(
    routeArgs(get(`/o/${slug}/t/${taskId}${query}`, cookie), { slug, taskId }),
  );
}

/** The decision log of one org. */
function log(cookie: string, slug: string) {
  return logRoute.loader(routeArgs(get(`/o/${slug}/decisions`, cookie), { slug }));
}

/** The query string a redirect answered with. */
function query(response: unknown): URLSearchParams {
  const location = (response as Response).headers.get("location")!;
  return new URL(location, "https://tusker.test").searchParams;
}

/** The mark one task carries. */
async function marked(id: string): Promise<number> {
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
    .all<{ id: string; org_id: string; task_id: string | null; title: string; rationale: string }>();
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

  it("goes on from the quick-add box when the box is ticked", async () => {
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
    expect(made!.decides).toBe(1);
  });

  it("asks at once for a marked task typed straight into Done", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await onBoard(ada.cookie, ada.org.slug, {
      intent: "create",
      title: "Pick a database",
      status: "done",
      decides: "1",
    });

    const asked = query(response).get("ask")!;
    expect((await board(ada.cookie, ada.org.slug, `?ask=${asked}`)).ask).toEqual({
      id: asked,
      slug: ada.org.slug,
      title: "Pick a database",
    });
  });

  it("asks nothing for an unmarked task typed straight into Done", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await onBoard(ada.cookie, ada.org.slug, {
      intent: "create",
      title: "Water the plants",
      status: "done",
    });

    expect(response).toEqual({ ok: true });
  });

  it("goes on and off from the task page, which reads it back", async () => {
    const ada = await member("ada@example.test", "Ada");
    await plainTask(ada.org.id, "ship");

    await onTask(ada.cookie, ada.org.slug, "ship", { title: "ship", decides: "1" });
    expect(await marked("ship")).toBe(1);
    expect((await taskPage(ada.cookie, ada.org.slug, "ship")).task.decides).toBe(true);

    // An unticked box is absent from the post, which is how the mark comes off.
    await onTask(ada.cookie, ada.org.slug, "ship", { title: "ship" });
    expect(await marked("ship")).toBe(0);
    expect((await taskPage(ada.cookie, ada.org.slug, "ship")).task.decides).toBe(false);
  });
});

describe("the prompt on finishing a marked task", () => {
  it("is raised when a marked board card moves to Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    const response = await finish(ada.cookie, ada.org.slug, "ship");

    expect(query(response).get("ask")).toBe("ship");
    expect((await board(ada.cookie, ada.org.slug, "?ask=ship")).ask).toEqual({
      id: "ship",
      slug: ada.org.slug,
      title: "ship",
    });
  });

  it("is not raised by a move that does not finish the task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    const response = await onBoard(ada.cookie, ada.org.slug, {
      intent: "move",
      id: "ship",
      status: "in_progress",
    });

    expect(response).toEqual({ ok: true });
  });

  it("keeps the rest of the query string, so a narrowed board stays narrowed", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    const response = await onBoard(
      ada.cookie,
      ada.org.slug,
      { intent: "move", id: "ship", status: "done" },
      "?cancelled=1",
    );

    expect(query(response).get("cancelled")).toBe("1");
  });

  it("is raised by the unified view, which names the org the task is in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    const response = await onMe(ada.cookie, { intent: "finish", id: "ship", slug: ada.org.slug });

    expect(query(response).get("ask")).toBe("ship");
    expect(query(response).get("org")).toBe(ada.org.slug);
    expect((await mePage(ada.cookie, `?ask=ship&org=${ada.org.slug}`)).ask).toEqual({
      id: "ship",
      slug: ada.org.slug,
      title: "ship",
    });
  });

  it("is raised by the task page, which finishes a task of its own", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    const response = await onTask(ada.cookie, ada.org.slug, "ship", { intent: "finish" });

    expect(query(response).get("ask")).toBe("ship");
    const status = await db.prepare("SELECT status FROM tasks WHERE id = 'ship'").first<{
      status: string;
    }>();
    expect(status!.status).toBe("done");
  });

  it("is raised by focus mode, which finishes a task as the board does", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    const response = await onFocus(ada.cookie, {
      intent: "finish",
      id: "ship",
      slug: ada.org.slug,
    });

    expect(query(response).get("ask")).toBe("ship");
    expect(query(response).get("org")).toBe(ada.org.slug);
    expect((await focusPage(ada.cookie, `?ask=ship&org=${ada.org.slug}`)).ask).toEqual({
      id: "ship",
      slug: ada.org.slug,
      title: "ship",
    });
  });

  it("reads null for a task the person's orgs do not hold", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(bob.org.id, "theirs");

    expect((await board(ada.cookie, ada.org.slug, "?ask=theirs")).ask).toBe(null);
    expect((await mePage(ada.cookie, `?ask=theirs&org=${bob.org.slug}`)).ask).toBe(null);
  });

  it("reads null for a marked task that is not finished, so the address is no way in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    expect((await board(ada.cookie, ada.org.slug, "?ask=ship")).ask).toBe(null);
  });
});

describe("an unmarked task", () => {
  it("raises no prompt on the board", async () => {
    const ada = await member("ada@example.test", "Ada");
    await plainTask(ada.org.id, "chore");

    expect(await finish(ada.cookie, ada.org.slug, "chore")).toEqual({ ok: true });
    expect((await board(ada.cookie, ada.org.slug, "?ask=chore")).ask).toBe(null);
  });

  it("raises no prompt however else it is finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await plainTask(ada.org.id, "one");
    await plainTask(ada.org.id, "two");
    await plainTask(ada.org.id, "three");

    expect(await onMe(ada.cookie, { intent: "finish", id: "one", slug: ada.org.slug })).toEqual({
      ok: true,
    });
    expect(await onTask(ada.cookie, ada.org.slug, "two", { intent: "finish" })).toEqual({
      ok: true,
    });
    expect(await onFocus(ada.cookie, { intent: "finish", id: "three", slug: ada.org.slug })).toEqual(
      { ok: true },
    );
  });

  it("takes no decision, even from a form that names it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await plainTask(ada.org.id, "chore", { status: "done" });

    const response = await caught(
      onBoard(ada.cookie, ada.org.slug, { intent: "decide", id: "chore", title: "Not asked for" }),
    );

    expect(response.status).toBe(404);
    expect(await rows()).toEqual([]);
  });
});

describe("skipping the prompt", () => {
  it("leaves the task Done, and writes no decision", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    await finish(ada.cookie, ada.org.slug, "ship");

    const row = await db
      .prepare("SELECT status, decides FROM tasks WHERE id = 'ship'")
      .first<{ status: string; decides: number }>();
    expect(row).toEqual({ status: "done", decides: 1 });
    expect(await rows()).toEqual([]);
  });

  it("is a not-now: the task is asked again the next time it is finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    await finish(ada.cookie, ada.org.slug, "ship");
    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "ship", status: "todo" });
    const again = await finish(ada.cookie, ada.org.slug, "ship");

    expect(query(again).get("ask")).toBe("ship");
  });

  it("ends when the person unmarks the task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await finish(ada.cookie, ada.org.slug, "ship");

    await onTask(ada.cookie, ada.org.slug, "ship", { title: "ship" });
    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "ship", status: "todo" });
    const again = await finish(ada.cookie, ada.org.slug, "ship");

    expect(again).toEqual({ ok: true });
  });
});

describe("a task that already holds a decision", () => {
  it("is not asked again, however it is finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await finish(ada.cookie, ada.org.slug, "ship");
    await onBoard(ada.cookie, ada.org.slug, {
      intent: "decide",
      id: "ship",
      title: "Ship on Friday",
    });

    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "ship", status: "todo" });
    expect(await finish(ada.cookie, ada.org.slug, "ship")).toEqual({ ok: true });
    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "ship", status: "todo" });
    expect(await onTask(ada.cookie, ada.org.slug, "ship", { intent: "finish" })).toEqual({
      ok: true,
    });
  });

  it("raises no prompt on a reload of the page that asked", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await finish(ada.cookie, ada.org.slug, "ship");
    await onBoard(ada.cookie, ada.org.slug, {
      intent: "decide",
      id: "ship",
      title: "Ship on Friday",
    });

    expect((await board(ada.cookie, ada.org.slug, "?ask=ship")).ask).toBe(null);
  });
});

describe("saving a decision", () => {
  it("writes it to the org that holds the task, with the task id", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await finish(ada.cookie, ada.org.slug, "ship");

    const response = await onBoard(
      ada.cookie,
      ada.org.slug,
      { intent: "decide", id: "ship", title: "Ship on Friday", rationale: "The test is green." },
      "?ask=ship",
    );

    expect((response as Response).headers.get("location")).toBe(`/o/${ada.org.slug}/board`);
    const [written] = await rows();
    expect(written.org_id).toBe(ada.org.id);
    expect(written.task_id).toBe("ship");
    expect(written.title).toBe("Ship on Friday");
    expect(written.rationale).toBe("The test is green.");
  });

  it("names the person who decided", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await finish(ada.cookie, ada.org.slug, "ship");

    await onMe(ada.cookie, {
      intent: "decide",
      id: "ship",
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
    await task(ada.org.id, "ship");
    await finish(ada.cookie, ada.org.slug, "ship");

    const answer = await onBoard(ada.cookie, ada.org.slug, {
      intent: "decide",
      id: "ship",
      title: "  ",
      rationale: "The test is green.",
    });

    expect(answer).toEqual({ error: "A decision needs a title." });
    expect(await rows()).toEqual([]);
  });

  it("writes one decision for a form posted twice", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await finish(ada.cookie, ada.org.slug, "ship");
    const save = { intent: "decide", id: "ship", title: "Ship on Friday" };

    await onBoard(ada.cookie, ada.org.slug, save);
    const again = await caught(onBoard(ada.cookie, ada.org.slug, save));

    expect(again.status).toBe(404);
    expect(await rows()).toHaveLength(1);
  });

  it("refuses a task another org holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(bob.org.id, "theirs", { status: "done" });

    const response = await caught(
      onBoard(ada.cookie, ada.org.slug, {
        intent: "decide",
        id: "theirs",
        title: "Not mine to make",
      }),
    );

    expect(response.status).toBe(404);
    expect(await rows()).toEqual([]);
  });
});

describe("a decision outliving its task", () => {
  it("stays in the log with the link cleared when the task is deleted", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await finish(ada.cookie, ada.org.slug, "ship");
    await onBoard(ada.cookie, ada.org.slug, {
      intent: "decide",
      id: "ship",
      title: "Ship on Friday",
    });

    await db.prepare("DELETE FROM tasks WHERE id = 'ship'").run();

    const [kept] = await rows();
    expect(kept.title).toBe("Ship on Friday");
    expect(kept.task_id).toBe(null);
    expect((await log(ada.cookie, ada.org.slug)).decisions[0].task).toBe(null);
  });
});

describe("the log", () => {
  it("lists the org's decisions newest first, and links to the task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "first");
    await task(ada.org.id, "second");
    await finish(ada.cookie, ada.org.slug, "first");
    await finish(ada.cookie, ada.org.slug, "second");
    await onBoard(ada.cookie, ada.org.slug, { intent: "decide", id: "first", title: "One" });
    await onBoard(ada.cookie, ada.org.slug, { intent: "decide", id: "second", title: "Two" });

    const { decisions } = await log(ada.cookie, ada.org.slug);

    expect(decisions.map((one) => one.title)).toEqual(["Two", "One"]);
    expect(decisions[1].task).toEqual({ id: "first", title: "first" });
  });

  it("holds one org's decisions and no other org's", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(ada.org.id, "mine");
    await task(bob.org.id, "theirs");
    await finish(ada.cookie, ada.org.slug, "mine");
    await finish(bob.cookie, bob.org.slug, "theirs");
    await onBoard(ada.cookie, ada.org.slug, { intent: "decide", id: "mine", title: "Mine" });
    await onBoard(bob.cookie, bob.org.slug, { intent: "decide", id: "theirs", title: "Theirs" });

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
    expect(withPrompt("/o/acme/board", "?cancelled=1", { id: "ship", slug: "acme" })).toBe(
      "/o/acme/board?cancelled=1&ask=ship&org=acme",
    );
  });

  it("closes it, and leaves a page with nothing else to say no query string", () => {
    expect(withoutPrompt("/me", "?ask=ship&org=acme")).toBe("/me");
    expect(withoutPrompt("/me", "?ask=ship&org=acme&today=1")).toBe("/me?today=1");
  });
});
