/**
 * The toast: what one message draws, and what its one act posts. See #121.
 *
 * A toast is announced, so the region it lands in is read here; and its act is
 * a form button, so a person on a keyboard reaches it.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import App from "../app/root";
import { ToastBar, ToastRegion } from "../app/toast";

/** The markup one piece draws, through a router the fetchers need. */
function markup(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/", Component: () => <>{element}</> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

describe("the region a toast lands in", () => {
  it("is a live region, so a message that arrives is read out", () => {
    const html = markup(<ToastRegion held={null} drop={() => {}} />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("draws nothing while no message stands", () => {
    expect(markup(<ToastRegion held={null} drop={() => {}} />)).not.toContain("<button");
  });
});

describe("one message", () => {
  it("names its text and offers its act as a button", () => {
    const html = markup(
      <ToastBar
        toast={{
          text: "Archived 3.",
          act: { label: "Undo", action: "/o/acme/board", post: { intent: "restore", id: ["a", "b"] } },
        }}
        drop={() => {}}
      />,
    );

    expect(html).toContain("Archived 3.");
    expect(html).toContain(">Undo</button>");
    expect(html).toContain('action="/o/acme/board"');
    expect(html).toContain('name="intent" value="restore"');
    expect(html).toContain('name="id" value="a"');
    expect(html).toContain('name="id" value="b"');
  });

  it("links to the archive of every org a sweep filed into", () => {
    const html = markup(
      <ToastBar
        toast={{
          text: "Archived 3 from Done.",
          links: [
            { label: "Acme", to: "/o/acme/archive" },
            { label: "Ada", to: "/o/ada/archive" },
          ],
        }}
        drop={() => {}}
      />,
    );

    expect(html).toContain('href="/o/acme/archive"');
    expect(html).toContain('href="/o/ada/archive"');
  });

  it("carries a way to send it away by hand", () => {
    const html = markup(<ToastBar toast={{ text: "Saved." }} drop={() => {}} />);

    expect(html).toContain('aria-label="Dismiss"');
  });

  it("draws no form while it holds no act", () => {
    expect(markup(<ToastBar toast={{ text: "Saved." }} drop={() => {}} />)).not.toContain("<form");
  });
});

describe("the region every page shares", () => {
  it("is mounted by the root layout, so a page that raises one is heard", () => {
    // `useToast` answers a page that stands under no provider with a no-op, so
    // a region left out of the root would lose every message in silence.
    const Stub = createRoutesStub([
      { path: "/", Component: App, children: [{ index: true, Component: () => <p>A page</p> }] },
    ]);

    const html = renderToStaticMarkup(<Stub initialEntries={["/"]} />);

    expect(html).toContain("A page");
    expect(html).toContain('role="status"');
  });
});
