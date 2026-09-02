import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import * as boardRoute from "../app/routes/board";
import * as loginRoute from "../app/routes/login";
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
  return { person, org: org!, cookie: cookieFrom(response) };
}

/** The board loader for one org, as that org's member sees it. */
function board(slug: string, cookie: string, query = "") {
  return boardRoute.loader(routeArgs(get(`/o/${slug}/board${query}`, cookie), { slug }));
}

/** A post to the board action, signed by the cookie. */
function act(slug: string, cookie: string, fields: Record<string, string>) {
  const request = post(`/o/${slug}/board`, fields);
  request.headers.set("cookie", cookie);
  return boardRoute.action(routeArgs(request, { slug }));
}

/** Makes a task in To do and hands back its id. */
async function task(
  who: Awaited<ReturnType<typeof member>>,
  title: string,
  description = "",
  status: Status = "todo",
) {
  await act(who.org.slug, who.cookie, { intent: "create", status, title });
  const row = await db
    .prepare("SELECT id FROM tasks WHERE org_id = ? AND title = ?")
    .bind(who.org.id, title)
    .first<{ id: string }>();
  if (description) {
    await db.prepare("UPDATE tasks SET description = ? WHERE id = ?").bind(description, row!.id).run();
  }
  return row!.id;
}

/** Every title the board draws, whatever column holds it. */
function titles(data: Awaited<ReturnType<typeof board>>) {
  return data.columns.flatMap((column) => column.tasks.map((one) => one.title)).sort();
}

describe("searching the board", () => {
  it("keeps the tasks whose title holds the text", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada, "Write the board");
    await task(ada, "Read the mail");

    expect(titles(await board("ada", ada.cookie, "?q=board"))).toEqual(["Write the board"]);
  });

  it("does not care about case", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada, "Write the Board");

    expect(titles(await board("ada", ada.cookie, "?q=BOARD"))).toEqual(["Write the Board"]);
  });

  it("keeps a task whose description holds the text", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada, "Write it", "The column order stands");
    await task(ada, "Read the mail");

    expect(titles(await board("ada", ada.cookie, "?q=column"))).toEqual(["Write it"]);
  });

  it("does not match across the seam between the two columns", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada, "Write the", "board and the rest");

    expect(titles(await board("ada", ada.cookie, "?q=the board"))).toEqual([]);
    expect(titles(await board("ada", ada.cookie, "?q=Write the"))).toEqual(["Write the"]);
  });

  it("gives the whole board back when the box is empty", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada, "Write the board");
    await task(ada, "Read the mail");

    expect(titles(await board("ada", ada.cookie, "?q="))).toEqual(["Read the mail", "Write the board"]);
  });

  it("hands the text back, so the box holds what was searched", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect((await board("ada", ada.cookie, "?q=board")).search).toBe("board");
    expect((await board("ada", ada.cookie)).search).toBe("");
  });

  it("reaches no other org's tasks", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await task(bo, "Write the board");
    await task(ada, "Read the mail");

    expect(titles(await board("ada", ada.cookie, "?q=board"))).toEqual([]);
  });
});

describe("a wildcard a person types", () => {
  it("matches itself, and does not stand for any character", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada, "Ship 100% of it");
    await task(ada, "Ship none of it");

    expect(titles(await board("ada", ada.cookie, "?q=100%25"))).toEqual(["Ship 100% of it"]);
    expect(titles(await board("ada", ada.cookie, "?q=%25"))).toEqual(["Ship 100% of it"]);
  });

  it("treats an underscore as an underscore", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada, "Rename in_progress");
    await task(ada, "Rename into progress");

    expect(titles(await board("ada", ada.cookie, "?q=in_progress"))).toEqual(["Rename in_progress"]);
  });
});

describe("search beside the other narrowings", () => {
  it("stacks with the column toggles", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada, "Write the board", "", "todo");
    await task(ada, "Cancel the board", "", "cancelled");

    const shown = await board("ada", ada.cookie, "?q=board&cancelled=1");
    expect(titles(shown)).toEqual(["Cancel the board", "Write the board"]);

    const hidden = await board("ada", ada.cookie, "?q=board");
    expect(titles(hidden)).toEqual(["Write the board"]);
  });

  it("leaves the Backlog rule reading the whole board", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada, "Write the board", "", "todo");

    // Nothing matches, but there is work in hand, so Backlog stays shut.
    const data = await board("ada", ada.cookie, "?q=nothing at all");
    expect(titles(data)).toEqual([]);
    expect(data.backlogByRule).toBe(false);
    expect(data.columns.map((one) => one.status)).toEqual(["todo", "in_progress", "done"]);
  });
});
