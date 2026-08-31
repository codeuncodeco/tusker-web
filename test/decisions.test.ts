import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import * as boardRoute from "../app/routes/board";
import * as logRoute from "../app/routes/decisions";
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

/** A task, placed by hand so a test can state the column it wants. */
async function task(orgId: string, id: string, some: { status?: Status } = {}) {
  await db
    .prepare("INSERT INTO tasks (id, org_id, title, status, position) VALUES (?, ?, ?, ?, 1)")
    .bind(id, orgId, id, some.status ?? "todo")
    .run();
  return id;
}

/** A post to the board, signed by the cookie. */
function onBoard(cookie: string, slug: string, fields: Record<string, string>, query = "") {
  const request = post(`/o/${slug}/board${query}`, fields);
  request.headers.set("cookie", cookie);
  return boardRoute.action(routeArgs(request, { slug }));
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

/** Every decision row, oldest first, as the table holds it. */
async function rows() {
  const { results } = await db
    .prepare("SELECT id, org_id, task_id, title, rationale FROM decisions ORDER BY rowid")
    .all<{ id: string; org_id: string; task_id: string | null; title: string; rationale: string }>();
  return results;
}

describe("the prompt on finishing", () => {
  it("is raised when a board card moves to Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    const response = await onBoard(ada.cookie, ada.org.slug, {
      intent: "move",
      id: "ship",
      status: "done",
    });

    expect(query(response).get("decide")).toBe("ship");
    expect((await board(ada.cookie, ada.org.slug, "?decide=ship")).ask).toEqual({
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

    expect(query(response).get("decide")).toBe("ship");
    expect(query(response).get("org")).toBe(ada.org.slug);
    expect((await mePage(ada.cookie, `?decide=ship&org=${ada.org.slug}`)).ask).toEqual({
      id: "ship",
      slug: ada.org.slug,
      title: "ship",
    });
  });

  it("is raised by the task page, which finishes a task of its own", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    const response = await onTask(ada.cookie, ada.org.slug, "ship", { intent: "finish" });

    expect(query(response).get("decide")).toBe("ship");
    const status = await db.prepare("SELECT status FROM tasks WHERE id = 'ship'").first<{
      status: string;
    }>();
    expect(status!.status).toBe("done");
  });

  it("reads null for a task the person's orgs do not hold", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(bob.org.id, "theirs");

    expect((await board(ada.cookie, ada.org.slug, "?decide=theirs")).ask).toBe(null);
    expect((await mePage(ada.cookie, `?decide=theirs&org=${bob.org.slug}`)).ask).toBe(null);
  });
});

describe("skipping the prompt", () => {
  it("leaves the task Done, and writes no decision", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "ship", status: "done" });

    const row = await db
      .prepare("SELECT status, decision_asked FROM tasks WHERE id = 'ship'")
      .first<{ status: string; decision_asked: number }>();
    expect(row).toEqual({ status: "done", decision_asked: 1 });
    expect(await rows()).toEqual([]);
  });

  it("is not asked again when the task moves out of Done and back", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "ship", status: "done" });
    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "ship", status: "todo" });
    const again = await onBoard(ada.cookie, ada.org.slug, {
      intent: "move",
      id: "ship",
      status: "done",
    });

    expect(again).toEqual({ ok: true });
  });

  it("is not asked again by another way of finishing the same task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    await onMe(ada.cookie, { intent: "finish", id: "ship", slug: ada.org.slug });
    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "ship", status: "todo" });
    const again = await onTask(ada.cookie, ada.org.slug, "ship", { intent: "finish" });

    expect(again).toEqual({ ok: true });
  });
});

describe("saving a decision", () => {
  it("writes it to the org that holds the task, with the task id", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await onBoard(ada.cookie, ada.org.slug, { intent: "move", id: "ship", status: "done" });

    const response = await onBoard(
      ada.cookie,
      ada.org.slug,
      { intent: "decide", id: "ship", title: "Ship on Friday", rationale: "The test is green." },
      "?decide=ship",
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

    const answer = await onBoard(ada.cookie, ada.org.slug, {
      intent: "decide",
      id: "ship",
      title: "  ",
      rationale: "The test is green.",
    });

    expect(answer).toEqual({ error: "A decision needs a title." });
    expect(await rows()).toEqual([]);
  });

  it("refuses a task another org holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(bob.org.id, "theirs");

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
      "/o/acme/board?cancelled=1&decide=ship&org=acme",
    );
  });

  it("closes it, and leaves a page with nothing else to say no query string", () => {
    expect(withoutPrompt("/me", "?decide=ship&org=acme")).toBe("/me");
    expect(withoutPrompt("/me", "?decide=ship&org=acme&today=1")).toBe("/me?today=1");
  });
});
