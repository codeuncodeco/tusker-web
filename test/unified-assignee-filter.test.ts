/**
 * The unified board's assignee filter: `Anyone`, `Mine` and `Unassigned`, and
 * no member names. See ADR-0033.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { MINE, UNASSIGNED } from "../app/assignee-filter";
import * as goRoute from "../app/routes/go";
import * as meRoute from "../app/routes/me";
import { member } from "./accounts";
import { caught, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const DAY = "2026-09-01";

beforeEach(wipe);

/** An org named by its slug, with everybody named as a member of it. */
async function team(slug: string, people: { id: string }[]) {
  const id = `org-${slug}`;
  await db.batch([
    db.prepare("INSERT INTO orgs (id, slug, name) VALUES (?, ?, ?)").bind(id, slug, slug),
    ...people.map((person) =>
      db
        .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
        .bind(id, person.id),
    ),
  ]);
  return { id, slug };
}

/** A To do task, held by whoever is named. */
async function task(orgId: string, title: string, held: { id: string }[] = []) {
  const { meta } = await db
    .prepare("INSERT INTO tasks (org_id, title, status, position) VALUES (?, ?, 'todo', 1)")
    .bind(orgId, title)
    .run();
  for (const person of held) {
    await db
      .prepare("INSERT INTO task_assignees (task_id, org_id, user_id) VALUES (?, ?, ?)")
      .bind(meta.last_row_id, orgId, person.id)
      .run();
  }
  return meta.last_row_id;
}

/** A task added from the unified board's box, as a person adds one. */
async function added(cookie: string, slug: string, title: string) {
  const request = post("/me", { intent: "create", slug, title, status: "todo" });
  request.headers.set("cookie", `${cookie}; day=${DAY}`);
  await meRoute.action(routeArgs(request));
}

/** The unified board, as one person reads it. */
function page(cookie: string, query = "") {
  return meRoute.loader(routeArgs(get(`/me${query}`, `${cookie}; day=${DAY}`)));
}

/** Every title the board draws, whatever column holds it. */
function titles(data: Awaited<ReturnType<typeof page>>) {
  return data.columns.flatMap((column) => column.tasks.map((one) => one.title)).sort();
}

/**
 * Ada and Bo, each in an org of one of their own, and both in one team. Each
 * own org holds a task added from the box, which its one member holds.
 */
async function board() {
  const ada = await member("ada@example.test", "Ada");
  const bo = await member("bo@example.test", "Bo");
  const both = await team("blrhikes", [ada.person, bo.person]);
  await task(both.id, "Ada's", [ada.person]);
  await task(both.id, "Bo's", [bo.person]);
  await task(both.id, "Shared", [ada.person, bo.person]);
  await task(both.id, "Nobody's");
  await added(ada.cookie, ada.org.slug, "Ada alone");
  await added(bo.cookie, bo.org.slug, "Bo alone");
  return { ada, bo, both };
}

describe("narrowing the unified board", () => {
  it("keeps every task under Anyone, held or not", async () => {
    const { ada } = await board();

    const all = ["Ada alone", "Ada's", "Bo's", "Nobody's", "Shared"];
    expect(titles(await page(ada.cookie, "?assignee=anyone"))).toEqual(all);
    expect(titles(await page(ada.cookie, "?assignee="))).toEqual(all);
  });

  it("opens on Mine when the address names no filter, so a person starts on their own work", async () => {
    const { ada } = await board();

    expect(titles(await page(ada.cookie))).toEqual(titles(await page(ada.cookie, `?assignee=${MINE}`)));
    expect((await page(ada.cookie)).assignee).toBe(MINE);
  });

  it("keeps the reader's tasks under Mine, an org of one's included", async () => {
    const { ada } = await board();

    expect(titles(await page(ada.cookie, `?assignee=${MINE}`))).toEqual([
      "Ada alone",
      "Ada's",
      "Shared",
    ]);
  });

  it("reads Mine as whoever opens the link", async () => {
    const { bo } = await board();

    expect(titles(await page(bo.cookie, `?assignee=${MINE}`))).toEqual([
      "Bo alone",
      "Bo's",
      "Shared",
    ]);
  });

  it("keeps the tasks nobody holds under Unassigned, and none from an org of one", async () => {
    const { ada } = await board();

    expect(titles(await page(ada.cookie, `?assignee=${UNASSIGNED}`))).toEqual(["Nobody's"]);
  });

  it("reads a member id as Anyone, because this board names no member", async () => {
    const { ada, bo } = await board();

    const data = await page(ada.cookie, `?assignee=${bo.person.id}`);

    expect(data.assignee).toBe("");
    expect(titles(data)).toEqual(["Ada alone", "Ada's", "Bo's", "Nobody's", "Shared"]);
  });

  it("narrows what the Today chip left", async () => {
    const { ada } = await board();
    const nobodys = await db
      .prepare("SELECT id FROM tasks WHERE title = 'Nobody''s'")
      .first<{ id: number }>();
    const mine = await db.prepare("SELECT id FROM tasks WHERE title = 'Ada''s'").first<{ id: number }>();
    await db
      .prepare("INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)")
      .bind(ada.person.id, DAY, JSON.stringify([nobodys!.id, mine!.id]))
      .run();

    expect(titles(await page(ada.cookie, `?today=1&assignee=${MINE}`))).toEqual(["Ada's"]);
  });
});

describe("what the page hands the box and the select", () => {
  it("hands back the value it narrows by, and the reader", async () => {
    const { ada } = await board();

    const data = await page(ada.cookie, `?assignee=${MINE}`);

    expect(data.assignee).toBe(MINE);
    expect(data.personId).toBe(ada.person.id);
  });

  it("draws no initials on a card from an org of one, though the row is stored", async () => {
    const { ada } = await board();

    const cards = (await page(ada.cookie)).columns.flatMap((column) => column.tasks);

    expect(cards.find((one) => one.title === "Ada alone")?.assignees).toEqual([]);
    expect(cards.find((one) => one.title === "Ada's")?.assignees.map((one) => one.id)).toEqual([
      ada.person.id,
    ]);
  });
});

describe("the org select carries the filter", () => {
  /** Where `/go` sends the person, for a pick and the value the board held, if any. */
  async function went(cookie: string, to: string, assignee: string | null) {
    const query = new URLSearchParams(assignee === null ? { to } : { to, assignee });
    const response = await caught(goRoute.loader(routeArgs(get(`/go?${query}`, cookie))));
    return response.headers.get("location");
  }

  it("turns Mine into the person's own name in a team, and keeps Unassigned", async () => {
    const { ada, both } = await board();

    expect(await went(ada.cookie, both.slug, MINE)).toBe(
      `/o/${both.slug}/board?assignee=${ada.person.id}`,
    );
    expect(await went(ada.cookie, both.slug, UNASSIGNED)).toBe(
      `/o/${both.slug}/board?assignee=${UNASSIGNED}`,
    );
  });

  it("drops the value on the way to an org of one", async () => {
    const { ada } = await board();

    expect(await went(ada.cookie, ada.org.slug, MINE)).toBe(`/o/${ada.org.slug}/board`);
  });

  it("turns the person back into Mine on All, and another member into Anyone", async () => {
    const { ada, bo } = await board();

    expect(await went(ada.cookie, "", ada.person.id)).toBe(`/me?assignee=${MINE}`);
    expect(await went(ada.cookie, "", UNASSIGNED)).toBe(`/me?assignee=${UNASSIGNED}`);
    expect(await went(ada.cookie, "", bo.person.id)).toBe("/me?assignee=anyone");
  });

  it("carries Anyone set by hand, as its word, so the next board's memory and default do not stand in", async () => {
    const { ada, both } = await board();

    expect(await went(ada.cookie, "", "")).toBe("/me?assignee=anyone");
    expect(await went(ada.cookie, both.slug, "anyone")).toBe(`/o/${both.slug}/board?assignee=anyone`);
  });

  it("opens a board bare when the address held no filter, so its memory holds", async () => {
    const { ada, both } = await board();

    expect(await went(ada.cookie, both.slug, null)).toBe(`/o/${both.slug}/board`);
  });
});
