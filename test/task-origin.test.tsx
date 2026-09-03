/**
 * Where a task page came from, and how it goes back.
 *
 * `Enter` opens a task from four lists. The origin rides in the URL, so a
 * reload keeps it and two tabs cannot fight over it. See #65.
 */

import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import { BackLink } from "../app/back-link";
import type { Status } from "../app/board";
import { backPath, taskPath } from "../app/paths";
import * as loginRoute from "../app/routes/login";
import * as taskRoute from "../app/routes/task";
import type { LiveTask } from "../app/unified";
import { UnifiedCard } from "../app/unified-card";
import { UnifiedRow } from "../app/unified-row";
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

/** A task, placed by hand. `decides` is what raises the prompt on a finish. */
async function task(orgId: string, id: string, some: { status?: Status; decides?: boolean } = {}) {
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, title, status, position, decides) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .bind(id, orgId, id, some.status ?? "todo", some.decides ? 1 : 0)
    .run();
  return id;
}

/** One task page, as one person reads it. */
function taskPage(cookie: string, slug: string, taskId: string, query = "") {
  return taskRoute.loader(
    routeArgs(get(`/o/${slug}/t/${taskId}${query}`, cookie), { slug, taskId }),
  );
}

describe("the URL a link into a task builds", () => {
  it("carries the page the person came from", () => {
    expect(taskPath("acme", "t1", "/me/plan")).toBe("/o/acme/t/t1?from=%2Fme%2Fplan");
  });

  it("keeps the query of that page, so a narrowed board comes back narrowed", () => {
    expect(taskPath("acme", "t1", "/o/acme/board?q=trail")).toBe(
      "/o/acme/t/t1?from=%2Fo%2Facme%2Fboard%3Fq%3Dtrail",
    );
  });

  it("names no origin for a link that has none", () => {
    expect(taskPath("acme", "t1")).toBe("/o/acme/t/t1");
  });
});

describe("where a task page goes back to", () => {
  it("is the page the origin names", () => {
    expect(backPath("?from=%2Fme%2Fplan", "acme")).toBe("/me/plan");
  });

  it("is the org's board for a task opened from nowhere", () => {
    expect(backPath("", "acme")).toBe("/o/acme/board");
  });

  // The address bar is where the origin comes from, so it is a path inside
  // the app or it is nothing.
  it("is the org's board for an origin that points off the site", () => {
    expect(backPath("?from=https%3A%2F%2Felsewhere.test", "acme")).toBe("/o/acme/board");
    expect(backPath("?from=%2F%2Felsewhere.test", "acme")).toBe("/o/acme/board");
  });
});

describe("the task page", () => {
  it("gives back the list the origin names", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await task(ada.org.id, "t1");

    const page = await taskPage(ada.cookie, ada.org.slug, id, "?from=%2Fme%2Ffocus");

    expect(page.back).toBe("/me/focus");
  });

  it("falls back to the org's board", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await task(ada.org.id, "t1");

    const page = await taskPage(ada.cookie, ada.org.slug, id);

    expect(page.back).toBe(`/o/${ada.org.slug}/board`);
  });

  it("keeps the origin when a finish raises the decision prompt", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await task(ada.org.id, "t1", { decides: true });

    const request = post(`/o/${ada.org.slug}/t/${id}?from=%2Fme`, { intent: "finish" });
    request.headers.set("cookie", ada.cookie);
    const answer = (await taskRoute.action(
      routeArgs(request, { slug: ada.org.slug, taskId: id }),
    )) as Response;

    const location = new URL(answer.headers.get("location")!, "https://tusker.test");
    expect(location.searchParams.get("from")).toBe("/me");
    expect(location.searchParams.get("ask")).toBe(id);
  });
});

/** One task, as the cross-org pages draw one. */
function live(id: string): LiveTask {
  return {
    id,
    org: { slug: "acme", name: "Acme", color: "blue" },
    title: id,
    status: "todo",
    due_date: null,
    percentile: 0.5,
    created_at: "2026-09-01",
    fields: [],
    assignees: [],
    finished: false,
  };
}

/** The markup one control draws, on the page a person stands on. */
function markup(element: React.ReactNode, here = "/me/plan"): string {
  const Stub = createRoutesStub([{ path: "*", Component: () => <>{element}</> }]);
  return renderToStaticMarkup(<Stub initialEntries={[here]} />);
}

/** The `href` values one piece of markup carries, in page order. */
function links(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

describe("the link a list draws into a task", () => {
  it("records the list, from plan mode and focus mode", () => {
    const html = markup(
      <ul>
        <UnifiedRow task={live("a")} planned={false} selected={false} domId="row-a" />
      </ul>,
    );

    expect(links(html)).toEqual(["/o/acme/t/a?from=%2Fme%2Fplan"]);
  });

  it("records the unified board, with the query that narrowed it", () => {
    const html = markup(
      <ul>
        <UnifiedCard task={live("a")} rank={1} selected={false} domId="card-a" place={() => {}} />
      </ul>,
      "/me?backlog=1",
    );

    expect(links(html)).toEqual(["/o/acme/t/a?from=%2Fme%3Fbacklog%3D1"]);
  });
});

describe("the way off a task page", () => {
  it("names the place it goes and the key that goes there", () => {
    const html = markup(<BackLink to="/me/plan" />, "/o/acme/t/a?from=%2Fme%2Fplan");

    expect(links(html)).toEqual(["/me/plan"]);
    expect(html).toContain('aria-keyshortcuts="Escape"');
    expect(html).toContain(">Esc</kbd>");
  });
});
