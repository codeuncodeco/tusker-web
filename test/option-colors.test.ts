import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import { colorRows } from "../app/colors";
import * as boardRoute from "../app/routes/board";
import * as fieldsRoute from "../app/routes/fields";
import * as loginRoute from "../app/routes/login";
import * as newOrgRoute from "../app/routes/orgs.new";
import * as taskRoute from "../app/routes/task";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
const TRAILS = "https://blrhikes.test/api/tusker/refs/trails";
const KUMARA = [{ id: "t1", label: "Kumara Parvatha" }];

beforeEach(wipe);
afterEach(() => vi.unstubAllGlobals());

/** Answers every refs call with `options`. */
function orgApp(options: unknown = []) {
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify(options), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

/** An account, its personal org and a cookie that signs its requests. */
async function member(email: string, name: string) {
  const auth = createAuth(env, get("/"));
  const person = await createAccount(auth, { email, name, password: PASSWORD });
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email, password: PASSWORD })),
  )) as Response;
  return { person, cookie: cookieFrom(response) };
}

/** A post to a route action, signed by the cookie. */
function send(
  route: { action: (args: never) => unknown },
  path: string,
  cookie: string,
  fields: Record<string, string>,
  params: Record<string, string> = {},
): Promise<unknown> {
  const request = post(path, fields);
  request.headers.set("cookie", cookie);
  return Promise.resolve(route.action(routeArgs(request, params)));
}

/** Ada, with an org at /codeuncode and a reference field named Trail. */
async function anOrg(over: { show_on_card?: string } = {}) {
  const ada = await member("ada@example.test", "Ada");
  await send(newOrgRoute, "/orgs/new", ada.cookie, { name: "codeuncode", slug: "codeuncode" });
  await send(
    fieldsRoute,
    "/o/codeuncode/fields",
    ada.cookie,
    {
      intent: "declare",
      label: "Trail",
      type: "reference",
      source_url: TRAILS,
      refs_key: "minted-by-blrhikes",
      ...(over.show_on_card ? { show_on_card: over.show_on_card } : {}),
    },
    { slug: "codeuncode" },
  );
  return ada;
}

/** The manual refresh on the fields screen. */
function refresh(cookie: string) {
  return send(
    fieldsRoute,
    "/o/codeuncode/fields",
    cookie,
    { intent: "refresh", key: "trail" },
    { slug: "codeuncode" },
  );
}

/** The fields screen, which draws the colour boxes. */
function fieldsOf(cookie: string) {
  return fieldsRoute.loader(routeArgs(get("/o/codeuncode/fields", cookie), { slug: "codeuncode" }));
}

/** A save of the colours of one field. */
function setColor(cookie: string, colors: Record<string, string>, key = "trail") {
  const boxes = Object.fromEntries(
    Object.entries(colors).map(([value, color]) => [`color.${value}`, color]),
  );
  return send(
    fieldsRoute,
    "/o/codeuncode/fields",
    cookie,
    { intent: "colors", key, ...boxes },
    { slug: "codeuncode" },
  );
}

/** Adds a task to To do, gives it a trail, and answers its id. */
async function addTask(cookie: string, title: string, trail?: string): Promise<string> {
  await send(
    boardRoute,
    "/o/codeuncode/board",
    cookie,
    { intent: "create", status: "todo", title },
    { slug: "codeuncode" },
  );
  const row = await db.prepare("SELECT id FROM tasks WHERE title = ?").bind(title).first<{ id: string }>();
  const taskId = row!.id;
  if (trail !== undefined) {
    await send(taskRoute, `/o/codeuncode/t/${taskId}`, cookie, { title, "field.trail": trail }, {
      slug: "codeuncode",
      taskId,
    });
  }
  return taskId;
}

/** The cards of the To do column. */
async function todo(cookie: string) {
  const board = await boardRoute.loader(
    routeArgs(get("/o/codeuncode/board", cookie), { slug: "codeuncode" }),
  );
  return board.columns.find((one) => one.status === "todo")!.tasks;
}

/** A trail field with one cached option, and Ada's cookie. */
async function withOptions(over: { show_on_card?: string } = {}) {
  const ada = await anOrg(over);
  orgApp(KUMARA);
  await refresh(ada.cookie);
  return ada;
}

describe("the values one field can colour", () => {
  it("lists every cached option, and then every value a task holds or a colour names", () => {
    expect(colorRows(KUMARA, { t1: "blue", gone: "red" }, ["t9", "t1"])).toEqual([
      { value: "t1", label: "Kumara Parvatha", color: "blue", cached: true },
      { value: "gone", label: "gone", color: "red", cached: false },
      { value: "t9", label: "t9", color: null, cached: false },
    ]);
  });
});

describe("colouring a value", () => {
  it("stores the colour against the value, not against the field", async () => {
    const ada = await withOptions();

    await setColor(ada.cookie, { t1: "blue" });

    const row = await db
      .prepare("SELECT field_key, value, color FROM org_field_colors")
      .first<{ field_key: string; value: string; color: string }>();
    expect(row).toEqual({ field_key: "trail", value: "t1", color: "blue" });
  });

  it("takes an exact colour as well as a palette name", async () => {
    const ada = await withOptions();

    await setColor(ada.cookie, { t1: "#2563EB" });

    expect((await fieldsOf(ada.cookie)).colors.trail[0].color).toBe("#2563EB");
  });

  it("refuses a colour Tusker cannot read, and writes nothing", async () => {
    const ada = await withOptions();

    const answer = await setColor(ada.cookie, { t1: "rebeccapurple" });

    expect(answer).toEqual({
      error:
        "Trail: A colour is a palette name or an exact colour, for example blue or #2563eb. rebeccapurple is neither.",
    });
    expect((await fieldsOf(ada.cookie)).colors.trail[0].color).toBeNull();
  });

  it("clears the colour when the box is emptied", async () => {
    const ada = await withOptions();
    await setColor(ada.cookie, { t1: "blue" });

    await setColor(ada.cookie, { t1: "" });

    expect((await fieldsOf(ada.cookie)).colors.trail[0].color).toBeNull();
    const left = await db.prepare("SELECT count(*) AS n FROM org_field_colors").first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it("answers 404 for a key the org does not declare", async () => {
    const ada = await withOptions();

    const answer = await caught(setColor(ada.cookie, { t1: "blue" }, "client"));

    expect(answer.status).toBe(404);
  });

  it("answers 400 for a field that takes no colour", async () => {
    const ada = await withOptions();
    await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "declare", label: "Kind", type: "select", options: "Bug" },
      { slug: "codeuncode" },
    );

    const answer = await caught(setColor(ada.cookie, { Bug: "blue" }, "kind"));

    expect(answer.status).toBe(400);
  });
});

describe("a value the cache does not name", () => {
  it("still takes a colour, because the colour hangs off the value", async () => {
    const ada = await withOptions({ show_on_card: "1" });
    // An id made after the last pull, which the picker took as typed.
    await addTask(ada.cookie, "Walk the new one", "t9");

    expect((await fieldsOf(ada.cookie)).colors.trail).toContainEqual({
      value: "t9",
      label: "t9",
      color: null,
      cached: false,
    });

    await setColor(ada.cookie, { t9: "red" });

    expect((await todo(ada.cookie))[0].fields[0].color).toBe("red");
  });
});

describe("the card", () => {
  it("draws the colour of the value the task holds", async () => {
    const ada = await withOptions({ show_on_card: "1" });
    await setColor(ada.cookie, { t1: "blue" });
    await addTask(ada.cookie, "Walk Kumara", "t1");

    expect((await todo(ada.cookie))[0].fields).toEqual([
      { key: "trail", label: "Trail", value: "Kumara Parvatha", color: "blue" },
    ]);
  });

  it("draws no colour for a value nobody coloured", async () => {
    const ada = await withOptions({ show_on_card: "1" });
    orgApp([...KUMARA, { id: "t2", label: "Skandagiri" }]);
    await refresh(ada.cookie);
    await setColor(ada.cookie, { t1: "blue" });
    await addTask(ada.cookie, "Walk Skandagiri", "t2");

    expect((await todo(ada.cookie))[0].fields[0].color).toBeNull();
  });
});

describe("the task page", () => {
  it("carries the colour of the value the task holds", async () => {
    const ada = await withOptions();
    await setColor(ada.cookie, { t1: "blue" });
    const task = await addTask(ada.cookie, "Walk Kumara", "t1");

    const edit = await taskRoute.loader(
      routeArgs(get(`/o/codeuncode/t/${task}`, ada.cookie), { slug: "codeuncode", taskId: task }),
    );

    expect(edit.colors).toEqual({ trail: "blue" });
  });
});

describe("a colour that outlives its option", () => {
  it("stays through a pull that drops the option, and still draws on the card", async () => {
    const ada = await withOptions({ show_on_card: "1" });
    await setColor(ada.cookie, { t1: "blue" });
    await addTask(ada.cookie, "Walk Kumara", "t1");

    // The org app dropped the trail, and the pull replaces the cache whole.
    orgApp([]);
    await refresh(ada.cookie);

    expect((await todo(ada.cookie))[0].fields[0].color).toBe("blue");
    // The screen keeps the line, so a person can still clear the colour.
    expect((await fieldsOf(ada.cookie)).colors.trail).toEqual([
      { value: "t1", label: "t1", color: "blue", cached: false },
    ]);
  });

  it("goes with the field, because a colour under no declaration reaches no screen", async () => {
    const ada = await withOptions();
    await setColor(ada.cookie, { t1: "blue" });

    await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "remove", key: "trail" },
      { slug: "codeuncode" },
    );

    const left = await db.prepare("SELECT count(*) AS n FROM org_field_colors").first<{ n: number }>();
    expect(left!.n).toBe(0);
  });
});
