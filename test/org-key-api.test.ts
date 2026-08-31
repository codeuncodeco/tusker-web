import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as apiRoute from "../app/routes/api.tasks";
import * as boardRoute from "../app/routes/board";
import * as fieldsRoute from "../app/routes/fields";
import * as loginRoute from "../app/routes/login";
import * as newOrgRoute from "../app/routes/orgs.new";
import * as settingsRoute from "../app/routes/settings";
import * as taskRoute from "../app/routes/task";
import { caught, cookieFrom, get, post, routeArgs, SITE, wipe } from "./routes";

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

/** Ada with an org at /codeuncode, and Bo with one at /blrhikes. */
async function twoOrgs() {
  const ada = await member("ada@example.test", "Ada");
  const bo = await member("bo@example.test", "Bo");
  await send(newOrgRoute, "/orgs/new", ada.cookie, { name: "codeuncode", slug: "codeuncode" });
  await send(newOrgRoute, "/orgs/new", bo.cookie, { name: "blrhikes", slug: "blrhikes" });
  return { ada, bo };
}

/** Mints one key for an org, and answers the plaintext it showed once. */
async function mint(slug: string, cookie: string, name = "blrhikes-app"): Promise<string> {
  const answer = (await send(
    settingsRoute,
    `/o/${slug}/settings`,
    cookie,
    { intent: "mint-key", key_name: name },
    { slug },
  )) as { key?: string };
  return answer.key!;
}

/** The settings screen of one org. */
function settingsOf(slug: string, cookie: string) {
  return settingsRoute.loader(routeArgs(get(`/o/${slug}/settings`, cookie), { slug }));
}

/**
 * A read of the task API, with a key when the test carries one. A rejected key
 * is a thrown response, and `caught` reads it like a returned one.
 */
function read(query: string, key?: string): Promise<Response> {
  const request = new Request(`${SITE}/api/tasks${query}`);
  if (key) request.headers.set("authorization", `Bearer ${key}`);
  return caught(Promise.resolve(apiRoute.loader(routeArgs(request))));
}

/** Adds a task to a column and answers its id. */
async function addTask(slug: string, cookie: string, title: string, status = "todo"): Promise<string> {
  await send(boardRoute, `/o/${slug}/board`, cookie, { intent: "create", status, title }, { slug });
  const row = await db.prepare("SELECT id FROM tasks WHERE title = ?").bind(title).first<{ id: string }>();
  return row!.id;
}

/** Declares one field for an org. */
function declare(slug: string, cookie: string, field: { label: string; type: string; options?: string }) {
  return send(
    fieldsRoute,
    `/o/${slug}/fields`,
    cookie,
    { intent: "declare", label: field.label, type: field.type, options: field.options ?? "" },
    { slug },
  );
}

/** Writes one custom field value on a task. */
function save(slug: string, cookie: string, taskId: string, title: string, fields: Record<string, string>) {
  return send(taskRoute, `/o/${slug}/t/${taskId}`, cookie, { title, ...fields }, { slug, taskId });
}

describe("minting and revoking an org key", () => {
  it("shows the plaintext once, and holds only a hash", async () => {
    const { bo } = await twoOrgs();

    const key = await mint("blrhikes", bo.cookie);

    expect(key).toMatch(/^tskr_/);
    const row = await db.prepare("SELECT * FROM org_keys").first<Record<string, string>>();
    expect(Object.values(row!)).not.toContain(key);
    expect(row!.hash).not.toContain(key.slice(5));
  });

  it("lists the key by name and preview, and never the key", async () => {
    const { bo } = await twoOrgs();
    const key = await mint("blrhikes", bo.cookie, "crew screen");

    const screen = await settingsOf("blrhikes", bo.cookie);

    expect(screen.keys).toHaveLength(1);
    expect(screen.keys[0]).toMatchObject({ name: "crew screen", revoked_at: null });
    expect(JSON.stringify(screen)).not.toContain(key);
  });

  it("stops a revoked key reading, and keeps its row", async () => {
    const { bo } = await twoOrgs();
    const key = await mint("blrhikes", bo.cookie);
    const id = (await settingsOf("blrhikes", bo.cookie)).keys[0].id;

    await send(settingsRoute, "/o/blrhikes/settings", bo.cookie, { intent: "revoke-key", id }, { slug: "blrhikes" });

    expect((await read("", key)).status).toBe(401);
    const screen = await settingsOf("blrhikes", bo.cookie);
    expect(screen.keys[0].revoked_at).not.toBeNull();
  });

  it("says the same thing when the same key is revoked twice", async () => {
    const { bo } = await twoOrgs();
    await mint("blrhikes", bo.cookie);
    const id = (await settingsOf("blrhikes", bo.cookie)).keys[0].id;
    const revoke = () =>
      send(settingsRoute, "/o/blrhikes/settings", bo.cookie, { intent: "revoke-key", id }, { slug: "blrhikes" });

    await revoke();
    const first = (await settingsOf("blrhikes", bo.cookie)).keys[0].revoked_at;
    await revoke();

    expect((await settingsOf("blrhikes", bo.cookie)).keys[0].revoked_at).toBe(first);
  });

  it("refuses to revoke another org's key", async () => {
    const { ada, bo } = await twoOrgs();
    const key = await mint("blrhikes", bo.cookie);
    const id = (await settingsOf("blrhikes", bo.cookie)).keys[0].id;

    const response = await caught(
      send(settingsRoute, "/o/codeuncode/settings", ada.cookie, { intent: "revoke-key", id }, { slug: "codeuncode" }),
    );

    expect(response.status).toBe(404);
    expect((await read("", key)).status).toBe(200);
  });
});

describe("reading tasks with an org key", () => {
  it("answers that org's tasks and nothing else", async () => {
    const { ada, bo } = await twoOrgs();
    await addTask("blrhikes", bo.cookie, "Book the bus");
    await addTask("codeuncode", ada.cookie, "Ship the board");
    const key = await mint("blrhikes", bo.cookie);

    const response = await read("", key);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { org: { slug: string }; tasks: { title: string }[] };
    expect(body.org.slug).toBe("blrhikes");
    expect(body.tasks.map((one) => one.title)).toEqual(["Book the bus"]);
  });

  it("answers the tasks in column order", async () => {
    const { bo } = await twoOrgs();
    await addTask("blrhikes", bo.cookie, "First");
    await addTask("blrhikes", bo.cookie, "Second");
    const key = await mint("blrhikes", bo.cookie);

    const body = (await (await read("", key)).json()) as { tasks: { title: string }[] };

    // A new task lands at the top of its column, so the newest reads first.
    expect(body.tasks.map((one) => one.title)).toEqual(["Second", "First"]);
  });

  it("answers the columns in board order, whatever the query asked for", async () => {
    const { bo } = await twoOrgs();
    await addTask("blrhikes", bo.cookie, "Read the map", "done");
    await addTask("blrhikes", bo.cookie, "Book the bus", "todo");
    await addTask("blrhikes", bo.cookie, "Pay the driver", "in_progress");
    const key = await mint("blrhikes", bo.cookie);

    const body = (await (await read("", key)).json()) as { tasks: { title: string }[] };

    // A position is a place in one column, so a list of columns is meaningless
    // until the status groups it.
    expect(body.tasks.map((one) => one.title)).toEqual(["Book the bus", "Pay the driver", "Read the map"]);
  });

  it("reads a bearer scheme in either case", async () => {
    const { bo } = await twoOrgs();
    const key = await mint("blrhikes", bo.cookie);
    const request = new Request(`${SITE}/api/tasks`, { headers: { authorization: `bearer ${key}` } });

    const response = await caught(Promise.resolve(apiRoute.loader(routeArgs(request))));

    expect(response.status).toBe(200);
  });

  it("filters by status", async () => {
    const { bo } = await twoOrgs();
    await addTask("blrhikes", bo.cookie, "Book the bus", "todo");
    await addTask("blrhikes", bo.cookie, "Pay the driver", "in_progress");
    await addTask("blrhikes", bo.cookie, "Sleep", "backlog");
    const key = await mint("blrhikes", bo.cookie);

    const body = (await (await read("?status=todo&status=in_progress", key)).json()) as {
      tasks: { title: string }[];
    };

    expect(body.tasks.map((one) => one.title).sort()).toEqual(["Book the bus", "Pay the driver"]);
  });

  it("filters by a custom field value", async () => {
    const { bo } = await twoOrgs();
    await declare("blrhikes", bo.cookie, { label: "Trail", type: "text" });
    const bus = await addTask("blrhikes", bo.cookie, "Book the bus");
    const tent = await addTask("blrhikes", bo.cookie, "Pack the tent");
    await save("blrhikes", bo.cookie, bus, "Book the bus", { "field.trail": "skandagiri" });
    await save("blrhikes", bo.cookie, tent, "Pack the tent", { "field.trail": "nandi" });
    const key = await mint("blrhikes", bo.cookie);

    const body = (await (await read("?field.trail=skandagiri", key)).json()) as {
      tasks: { title: string; data: Record<string, string> }[];
    };

    expect(body.tasks.map((one) => one.title)).toEqual(["Book the bus"]);
    expect(body.tasks[0].data).toEqual({ trail: "skandagiri" });
  });

  it("refuses a status the board does not draw", async () => {
    const { bo } = await twoOrgs();
    const key = await mint("blrhikes", bo.cookie);

    const response = await read("?status=someday", key);

    expect(response.status).toBe(400);
  });

  it("refuses a filter that names no value", async () => {
    const { bo } = await twoOrgs();
    await declare("blrhikes", bo.cookie, { label: "Trail", type: "text" });
    const key = await mint("blrhikes", bo.cookie);

    const response = await read("?field.trail=", key);

    expect(response.status).toBe(400);
  });

  it("refuses a field the org does not declare", async () => {
    const { bo } = await twoOrgs();
    const key = await mint("blrhikes", bo.cookie);

    const response = await read("?field.trail=skandagiri", key);

    expect(response.status).toBe(400);
  });

  it("refuses a request with no key or a wrong key, and holds each key to its own org", async () => {
    const { ada, bo } = await twoOrgs();
    await addTask("blrhikes", bo.cookie, "Book the bus");
    await mint("blrhikes", bo.cookie);
    const theirs = await mint("codeuncode", ada.cookie);

    expect((await read("")).status).toBe(401);
    expect((await read("", "tskr_nothing")).status).toBe(401);

    const body = (await (await read("", theirs)).json()) as { tasks: unknown[] };
    expect(body.tasks).toEqual([]);
  });
});
