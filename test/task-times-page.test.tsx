/**
 * The times a task's page lists at the foot of its aside. See #218.
 *
 * The server does not know the reader's zone, so the page it draws writes the
 * dates in UTC. The browser writes them again in its own zone once the page
 * is up, which a static render cannot show.
 */

import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import type { Status } from "../app/board";
import * as taskRoute from "../app/routes/task";
import type { TaskId } from "../app/task-number";
import { member } from "./accounts";
import { get, post, routeArgs, wipe } from "./routes";

const db = env.DB;

beforeEach(wipe);

/** A task with its stored times written by hand. */
async function task(
  orgId: string,
  id: TaskId,
  some: {
    status: Status;
    created_at: string;
    updated_at: string;
    finished_at?: string;
    archived_at?: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO tasks (id, org_id, title, status, position, archived,
                          created_at, updated_at, finished_at, archived_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      orgId,
      `Task ${id}`,
      some.status,
      some.archived_at ? 1 : 0,
      some.created_at,
      some.updated_at,
      some.finished_at ?? null,
      some.archived_at ?? null,
    )
    .run();
}

/** The task page as one member's browser first draws it. */
async function drawn(cookie: string, id: TaskId): Promise<string> {
  const path = `/t/${id}`;
  const loaderData = await taskRoute.loader(routeArgs(get(path, cookie), { n: String(id) }));
  // The route's own props carry matches and params the page never reads.
  const Page = taskRoute.default as unknown as (props: {
    loaderData: typeof loaderData;
    actionData: undefined;
  }) => React.ReactNode;
  const Stub = createRoutesStub([
    { path: "*", Component: () => <Page loaderData={loaderData} actionData={undefined} /> },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={[path]} />);
}

describe("the times a task's page lists", () => {
  it("writes Created as a date, with the whole time on hover, in UTC", async () => {
    const one = await member("made@example.test", "Made");
    const at = "2026-10-13T23:32:00.000Z";
    await task(one.org.id, 1, { status: "todo", created_at: at, updated_at: at });

    const html = await drawn(one.cookie, 1);

    expect(html).toContain(">Created<");
    expect(html).toContain(
      `<time dateTime="${at}" title="13 Oct 2026, 23:32 UTC">13 Oct 2026</time>`,
    );
    expect(html).not.toContain(">Updated<");
  });

  it("lists Updated once the task is saved", async () => {
    const one = await member("saved@example.test", "Saved");
    const at = "2026-10-01T09:00:00.000Z";
    await task(one.org.id, 1, { status: "todo", created_at: at, updated_at: at });

    const request = post("/t/1", { intent: "title", title: "A new name" });
    request.headers.set("cookie", one.cookie);
    await taskRoute.action(routeArgs(request, { n: "1" }));

    expect(await drawn(one.cookie, 1)).toContain(">Updated<");
  });

  it("lists Created and Finished on a finished task, which is read", async () => {
    const one = await member("ended@example.test", "Ended");
    await task(one.org.id, 1, {
      status: "done",
      created_at: "2026-10-01T09:00:00.000Z",
      finished_at: "2026-10-03T09:00:00.000Z",
      updated_at: "2026-10-03T09:00:00.000Z",
    });

    const html = await drawn(one.cookie, 1);

    expect(html).toContain('value="reopen"');
    expect(html).toContain(">Finished<");
    expect(html).toContain(">3 Oct 2026</time>");
    expect(html).not.toContain(">Updated<");
  });

  it("lists Archived and no Updated on an archived task", async () => {
    const one = await member("shelved@example.test", "Shelved");
    await task(one.org.id, 1, {
      status: "done",
      created_at: "2026-10-01T09:00:00.000Z",
      finished_at: "2026-10-03T09:00:00.000Z",
      archived_at: "2026-10-05T09:00:00.000Z",
      updated_at: "2026-10-06T09:00:00.000Z",
    });

    const html = await drawn(one.cookie, 1);

    expect(html).toContain(">Archived<");
    expect(html).toContain(">5 Oct 2026</time>");
    expect(html).not.toContain(">Updated<");
  });
});
