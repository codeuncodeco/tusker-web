/**
 * Where a task page came from, and how it goes back.
 *
 * `Enter` opens a task from four keyed lists. The origin rides in the URL, so
 * a reload keeps it and two tabs cannot fight over it. See #65.
 */

import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { BackLink } from "../app/back-link";
import type { Status } from "../app/board";
import { backPath, taskPath } from "../app/paths";
import * as taskRoute from "../app/routes/task";
import type { TaskId } from "../app/task-number";
import type { LiveTask } from "../app/unified";
import { UnifiedCard } from "../app/unified-card";
import { UnifiedRow } from "../app/unified-row";
import { member } from "./accounts";
import { get, post, routeArgs, wipe } from "./routes";

const db = env.DB;

beforeEach(wipe);

/** A task, placed by hand. `decides` is what raises the prompt on a finish. */
async function task(orgId: string, id: TaskId, some: { status?: Status; decides?: boolean } = {}) {
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, title, status, position, decides) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .bind(id, orgId, `Task ${id}`, some.status ?? "todo", some.decides ? 1 : 0)
    .run();
  return id;
}

/** A post to one task page, on the URL the origin rides in. */
function onTask(
  cookie: string,
  id: TaskId,
  query: string,
  fields: Record<string, string>,
) {
  const request = post(`/t/${id}${query}`, fields);
  request.headers.set("cookie", cookie);
  return taskRoute.action(routeArgs(request, { n: String(id) }));
}

/** The URL a redirect answered with. */
function redirect(answer: unknown): URL {
  return new URL((answer as Response).headers.get("location")!, "https://tusker.test");
}

/** One task page, as one person reads it. */
function taskPage(cookie: string, id: TaskId, query = "") {
  return taskRoute.loader(routeArgs(get(`/t/${id}${query}`, cookie), { n: String(id) }));
}

describe("the URL a link into a task builds", () => {
  it("carries the page the person came from", () => {
    expect(taskPath(1, "/me/plan")).toBe("/t/1?from=%2Fme%2Fplan");
  });

  it("keeps the query of that page, so a narrowed board comes back narrowed", () => {
    expect(taskPath(1, "/o/acme/board?q=trail")).toBe(
      "/t/1?from=%2Fo%2Facme%2Fboard%3Fq%3Dtrail",
    );
  });

  it("names no origin for a link that has none", () => {
    expect(taskPath(1)).toBe("/t/1");
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
    const id = await task(ada.org.id, 1);

    const page = await taskPage(ada.cookie, id, "?from=%2Fme%2Ffocus");

    expect(page.back).toBe("/me/focus");
  });

  it("falls back to the org's board", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await task(ada.org.id, 1);

    const page = await taskPage(ada.cookie, id);

    expect(page.back).toBe(`/o/${ada.org.slug}/board`);
  });

  // The prompt is a place, so finishing a task redirects. That redirect is
  // the one the page makes, and it must not lose the way back. See ADR-0010.
  it("keeps the origin when the Finish button raises the decision prompt", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await task(ada.org.id, 1, { decides: true });

    const answer = await onTask(ada.cookie, id, "?from=%2Fme", {
      intent: "finish",
    });

    const asked = redirect(answer);
    expect(asked.searchParams.get("from")).toBe("/me");
    expect(asked.searchParams.get("ask")).toBe(String(id));
  });

  // Saving the task with the status moved to Done is the same act, through
  // `moveAndAsk`, and it redirects the same way.
  it("keeps the origin when a save moves the task to Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await task(ada.org.id, 1, { decides: true });

    const answer = await onTask(ada.cookie, id, "?from=%2Fme%2Fweek", {
      title: "Task 1",
      status: "done",
      decides: "1",
    });

    const asked = redirect(answer);
    expect(asked.searchParams.get("from")).toBe("/me/week");
    expect(asked.searchParams.get("ask")).toBe(String(id));
  });
});

/** One task, as the cross-org pages draw one. */
function live(id: number): LiveTask {
  return {
    id,
    org: { slug: "acme", name: "Acme", color: "blue" },
    title: `Task ${id}`,
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
        <UnifiedRow task={live(1)} planned={false} selected={false} domId="row-a" showsOrg />
      </ul>,
    );

    expect(links(html)).toEqual(["/t/1?from=%2Fme%2Fplan"]);
  });

  it("records the unified board, with the query that narrowed it", () => {
    const html = markup(
      <ul>
        <UnifiedCard task={live(1)} selected={false} domId="card-a" place={() => {}} showsOrg />
      </ul>,
      "/me?backlog=1",
    );

    expect(links(html)).toEqual(["/t/1?from=%2Fme%3Fbacklog%3D1"]);
  });

  // The prompt is a raised prompt and not a view, so it is no part of the
  // page a person goes back to. A task already finished is never asked about
  // twice. See ADR-0010.
  it("drops the decision prompt the list stands under", () => {
    const html = markup(
      <ul>
        <UnifiedRow task={live(1)} planned={false} selected={false} domId="row-a" showsOrg />
      </ul>,
      "/me?backlog=1&ask=2&org=acme",
    );

    expect(links(html)).toEqual(["/t/1?from=%2Fme%3Fbacklog%3D1"]);
  });
});

describe("the way off a task page", () => {
  it("names the place it goes and the key that goes there", () => {
    const html = markup(<BackLink to="/me/plan" />, "/t/1?from=%2Fme%2Fplan");

    expect(links(html)).toEqual(["/me/plan"]);
    expect(html).toContain('aria-keyshortcuts="Escape"');
    expect(html).toContain(">Esc</kbd>");
  });
});
