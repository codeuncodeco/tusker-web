import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { UNASSIGNED } from "../app/assignee-filter";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import { DAY_COOKIE } from "../app/day";
import * as boardRoute from "../app/routes/board";
import * as loginRoute from "../app/routes/login";
import { cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
const DAY = "2026-09-01";

beforeEach(wipe);

/** An account and a cookie that signs its requests. */
async function member(email: string, name: string) {
  const auth = createAuth(env, get("/"));
  const person = await createAccount(auth, { email, name, password: PASSWORD });
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email, password: PASSWORD })),
  )) as Response;
  return { id: person.id, name, cookie: `${cookieFrom(response)}; ${DAY_COOKIE}=${DAY}` };
}

/** A team org, with everybody named as a member of it. */
async function team(slug: string, people: { id: string }[]) {
  const id = `org-${slug}`;
  await db.batch([
    db.prepare("INSERT INTO orgs (id, slug, name, kind) VALUES (?, ?, ?, 'team')").bind(id, slug, slug),
    ...people.map((person) =>
      db
        .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
        .bind(id, person.id),
    ),
  ]);
  return { id, slug };
}

/** The personal org Tusker made for a person at signup. */
async function personalOrg(personId: string) {
  const org = await db
    .prepare(
      "SELECT id, slug FROM orgs JOIN memberships ON org_id = id WHERE user_id = ? AND kind = 'personal'",
    )
    .bind(personId)
    .first<{ id: string; slug: string }>();
  return org!;
}

/** A task, placed by hand so a test can state the column it sits in. */
async function task(
  orgId: string,
  id: string,
  held: { id: string }[] = [],
  status: Status = "todo",
) {
  await db
    .prepare("INSERT INTO tasks (id, org_id, title, status, position) VALUES (?, ?, ?, ?, 1)")
    .bind(id, orgId, id, status)
    .run();
  for (const person of held) {
    await db
      .prepare("INSERT INTO task_assignees (task_id, org_id, user_id) VALUES (?, ?, ?)")
      .bind(id, orgId, person.id)
      .run();
  }
  return id;
}

/** The board loader for one org, as that org's member sees it. */
function board(slug: string, cookie: string, query = "") {
  return boardRoute.loader(routeArgs(get(`/o/${slug}/board${query}`, cookie), { slug }));
}

/** Every title the board draws, whatever column holds it. */
function titles(data: Awaited<ReturnType<typeof board>>) {
  return data.columns.flatMap((column) => column.tasks.map((one) => one.title)).sort();
}

describe("narrowing the board to one member", () => {
  it("keeps the tasks that member holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const org = await team("blrhikes", [ada, bo]);
    await task(org.id, "Ada's", [ada]);
    await task(org.id, "Bo's", [bo]);
    await task(org.id, "Nobody's");

    expect(titles(await board(org.slug, ada.cookie, `?assignee=${ada.id}`))).toEqual(["Ada's"]);
  });

  it("answers for each holder of a task several people hold", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const cy = await member("cy@example.test", "Cy");
    const org = await team("blrhikes", [ada, bo, cy]);
    await task(org.id, "The three of them", [ada, bo, cy]);

    for (const person of [ada, bo, cy]) {
      expect(titles(await board(org.slug, ada.cookie, `?assignee=${person.id}`))).toEqual([
        "The three of them",
      ]);
    }
  });

  it("keeps the tasks nobody holds under Unassigned", async () => {
    const ada = await member("ada@example.test", "Ada");
    const org = await team("blrhikes", [ada]);
    await task(org.id, "Ada's", [ada]);
    await task(org.id, "Nobody's");

    expect(titles(await board(org.slug, ada.cookie, `?assignee=${UNASSIGNED}`))).toEqual([
      "Nobody's",
    ]);
  });

  it("gives the whole board back under Anyone", async () => {
    const ada = await member("ada@example.test", "Ada");
    const org = await team("blrhikes", [ada]);
    await task(org.id, "Ada's", [ada]);
    await task(org.id, "Nobody's");

    expect(titles(await board(org.slug, ada.cookie))).toEqual(["Ada's", "Nobody's"]);
    expect(titles(await board(org.slug, ada.cookie, "?assignee="))).toEqual(["Ada's", "Nobody's"]);
  });

  it("draws an empty board for a name no member answers to", async () => {
    const ada = await member("ada@example.test", "Ada");
    const org = await team("blrhikes", [ada]);
    await task(org.id, "Ada's", [ada]);

    expect(titles(await board(org.slug, ada.cookie, "?assignee=u-gone"))).toEqual([]);
  });
});

describe("what the header needs to draw the select", () => {
  it("hands back the value, so a reload draws the filter it ran", async () => {
    const ada = await member("ada@example.test", "Ada");
    const org = await team("blrhikes", [ada]);

    expect((await board(org.slug, ada.cookie, `?assignee=${ada.id}`)).assignee).toBe(ada.id);
    expect((await board(org.slug, ada.cookie)).assignee).toBe("");
  });

  it("hands back the org's members in name order", async () => {
    const cy = await member("cy@example.test", "Cy");
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const org = await team("blrhikes", [cy, ada, bo]);

    const { members } = await board(org.slug, ada.cookie);
    expect(members.map((one) => one.name)).toEqual(["Ada", "Bo", "Cy"]);
  });

  it("draws no select on a personal org, which draws no assignee", async () => {
    const ada = await member("ada@example.test", "Ada");
    const org = await personalOrg(ada.id);
    await task(org.id, "Ada's");

    const data = await board(org.slug, ada.cookie, `?assignee=${ada.id}`);
    expect(data.members).toEqual([]);
    // A filter in the address narrows nothing where no filter is drawn.
    expect(titles(data)).toEqual(["Ada's"]);
  });

  it("draws the select on a team org of one member", async () => {
    const ada = await member("ada@example.test", "Ada");
    const org = await team("blrhikes", [ada]);

    expect((await board(org.slug, ada.cookie)).members.map((one) => one.name)).toEqual(["Ada"]);
  });
});

describe("the filter beside the other narrowings", () => {
  it("narrows what the search left", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const org = await team("blrhikes", [ada, bo]);
    await task(org.id, "Write the board", [ada]);
    await task(org.id, "Read the board", [bo]);
    await task(org.id, "Write the mail", [ada]);

    expect(titles(await board(org.slug, ada.cookie, `?q=board&assignee=${ada.id}`))).toEqual([
      "Write the board",
    ]);
  });

  it("narrows what the Today chip left", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const org = await team("blrhikes", [ada, bo]);
    await task(org.id, "Planned and Ada's", [ada]);
    await task(org.id, "Planned and Bo's", [bo]);
    await task(org.id, "Ada's and unplanned", [ada]);
    await db
      .prepare("INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)")
      .bind(ada.id, DAY, JSON.stringify(["Planned and Ada's", "Planned and Bo's"]))
      .run();

    expect(titles(await board(org.slug, ada.cookie, `?today=1&assignee=${ada.id}`))).toEqual([
      "Planned and Ada's",
    ]);
  });

  it("stacks with the column toggles", async () => {
    const ada = await member("ada@example.test", "Ada");
    const org = await team("blrhikes", [ada]);
    await task(org.id, "Ada's, done", [ada], "done");
    await task(org.id, "Ada's, cancelled", [ada], "cancelled");

    expect(titles(await board(org.slug, ada.cookie, `?assignee=${ada.id}`))).toEqual([
      "Ada's, done",
    ]);
    expect(titles(await board(org.slug, ada.cookie, `?assignee=${ada.id}&cancelled=1`))).toEqual([
      "Ada's, cancelled",
      "Ada's, done",
    ]);
  });
});

describe("the sweep under the filter", () => {
  // "Narrowing decides the set and never the button": the sweep sits on every
  // finished column that holds a card. `test/column-sweep.test.tsx` holds the
  // button's own rule, and this holds the set the filter hands it.
  it("archives exactly the cards the filter left on screen", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const org = await team("blrhikes", [ada, bo]);
    await task(org.id, "Ada's, done", [ada], "done");
    await task(org.id, "Bo's, done", [bo], "done");

    const narrowed = await board(org.slug, ada.cookie, `?assignee=${ada.id}`);
    const done = narrowed.columns.find((column) => column.status === "done")!;
    const request = post(`/o/${org.slug}/board`, {
      intent: "archive",
      id: done.tasks.map((one) => one.id),
    });
    request.headers.set("cookie", ada.cookie);
    await boardRoute.action(routeArgs(request, { slug: org.slug }));

    expect(titles(await board(org.slug, ada.cookie))).toEqual(["Bo's, done"]);
  });
});
