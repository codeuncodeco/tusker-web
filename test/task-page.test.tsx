/**
 * The task page as the server draws it. The title is the heading, the
 * description sits under it, and the task aside holds every property and every
 * act. With no script the page is one form, and a Save the server draws posts
 * it. See #204.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import type { Status } from "../app/board";
import type { OrgField } from "../app/fields";
import Task from "../app/routes/task";

/** A field as the org declares it, with the parts this page reads. */
function field(key: string, type: OrgField["type"], options: string[] = []): OrgField {
  return {
    key,
    label: key,
    type,
    options,
    refs_path: "",
    refs_pulled_at: null,
    show_on_card: false,
    filterable: false,
    position: 1,
  };
}

/** The task page, drawn from the data a loader would give it. */
function page(
  some: {
    status?: Status;
    archived?: boolean;
    description?: string;
    fields?: OrgField[];
    members?: { id: string; name: string; initials: string }[];
  } = {},
): string {
  const status = some.status ?? "todo";
  const loaderData = {
    org: { slug: "acme", name: "Acme" },
    back: "/o/acme/board",
    task: {
      id: 12,
      title: "Pack the tent",
      status,
      due_date: "2026-12-01",
      data: { kind: "Bug" },
      decides: true,
      description: some.description ?? "",
      archived: some.archived ?? false,
      finished: status === "done" || status === "cancelled",
    },
    fields: some.fields ?? [],
    members: some.members ?? [],
    assignees: [],
    refs: {},
    colors: {},
    ask: null,
  };
  const props = { loaderData, actionData: undefined } as unknown as React.ComponentProps<typeof Task>;
  const Stub = createRoutesStub([{ path: "/t/:n", Component: () => <Task {...props} /> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/t/12"]} />);
}

/** The markup of the task aside alone. */
function asideOf(html: string): string {
  return html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
}

/** True when every control of that name posts with the page's one form. */
function tied(html: string, name: string): boolean {
  const tags = html.match(/<(input|select|textarea)\b[^>]*>/g) ?? [];
  const named = tags.filter((tag) => tag.includes(`name="${name}"`));
  return named.length > 0 && named.every((tag) => tag.includes('form="task-form"'));
}

/** The markup outside every `<noscript>`, which is what a page with script draws. */
function scripted(html: string): string {
  return html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
}

describe("an open task", () => {
  it("draws the title once, as an editable heading, with no Title label", () => {
    const html = page();

    expect(html.match(/name="title"/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*><span[^>]*>#12<\/span><input[^>]*aria-label="Title"/);
    expect(html).not.toContain(">Title<");
  });

  it("draws the task's number before the title in the heading", () => {
    expect(page()).toMatch(/<h1[^>]*><span[^>]*>#12<\/span>/);
  });

  it("draws no Edit button, and a placeholder for an empty description", () => {
    const html = page();

    expect(html).not.toContain(">Edit<");
    expect(html).toContain("Add a description…");
  });

  it("names the key that opens the description", () => {
    expect(page({ description: "the words" })).toContain('aria-keyshortcuts="e"');
  });

  it("draws Save and the raw description only for a page with no script", () => {
    const html = page({ description: "- [ ] poles" });

    expect(html).toMatch(/<noscript>[^]*?<textarea name="description" form="task-form"[^>]*>- \[ \] poles<\/textarea>/);
    expect(html).toMatch(/<noscript><button form="task-form"[^>]*>Save<\/button><\/noscript>/);
    expect(scripted(html)).not.toContain(">Save<");
    expect(scripted(html)).not.toContain('name="description"');
  });

  it("ties every control to the one form", () => {
    const html = page({
      fields: [field("kind", "select", ["Bug", "Chore"]), field("client", "text")],
      members: [
        { id: "ada", name: "Ada", initials: "A" },
        { id: "grace", name: "Grace", initials: "G" },
      ],
    });

    for (const name of [
      "title",
      "status",
      "due_date",
      "decides",
      "assignees",
      "assignee",
      "field.kind",
      "field.client",
    ]) {
      expect([name, tied(html, name)]).toEqual([name, true]);
    }
  });

  it("holds the acts, the decision mark and the fields in the aside", () => {
    const aside = asideOf(page({ fields: [field("kind", "select", ["Bug", "Chore"])] }));

    expect(aside).toContain('value="finish"');
    expect(aside).toContain('name="status"');
    expect(aside).toContain('name="due_date"');
    expect(aside).toContain('name="decides"');
    expect(aside).toContain('name="field.kind"');
    // The acts row comes first.
    expect(aside.indexOf('value="finish"')).toBeLessThan(aside.indexOf('name="status"'));
  });

  it("draws no act at the foot of the main column", () => {
    const html = page();
    const main = html.slice(0, html.indexOf("<aside"));

    expect(main).not.toContain('name="intent"');
  });

  it("says nothing about fields when the org declares none", () => {
    const html = page();

    expect(html).not.toContain("declares no field");
    expect(html).not.toContain("/o/acme/fields");
  });

  it("draws the phone bar with the status, Finish and Details", () => {
    const bar = page().match(/<div class="fixed inset-x-0 bottom-0[\s\S]*?<\/details><\/div>/)?.[0] ?? "";

    expect(bar).toContain("To do");
    expect(bar).toContain('value="finish"');
    expect(bar).toMatch(/<details data-task-drawer=""><summary[^>]*>Details<\/summary><\/details>/);
  });
});

describe("a finished task", () => {
  it("reads its aside as text, with Reopen and Archive in the acts row", () => {
    const aside = asideOf(page({ status: "done", fields: [field("kind", "select", ["Bug"])] }));

    expect(aside).toContain('value="reopen"');
    expect(aside).toContain('value="archive"');
    expect(aside).not.toContain("<select");
    expect(aside).toContain("Holds a decision");
    expect(aside).toContain("Bug");
  });

  it("draws the title as a plain heading and no Save", () => {
    const html = page({ status: "done" });

    expect(html).toMatch(/<h1[^>]*><span[^>]*>#12<\/span><span[^>]*>Pack the tent<\/span><\/h1>/);
    expect(html).not.toContain('name="title"');
    expect(html).not.toContain(">Save<");
  });

  it("offers Restore alone once it is archived, in the aside and the bar", () => {
    const html = page({ status: "done", archived: true });

    expect(asideOf(html)).toContain('value="restore"');
    expect(html).not.toContain('value="archive"');
    expect(html).not.toContain('value="reopen"');
    expect(html.match(/value="restore"/g)).toHaveLength(2);
  });
});
