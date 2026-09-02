/**
 * The toast: what one message draws, and what its one act posts. See #121.
 *
 * A toast is announced, so the region it lands in is read here; and its act is
 * a form button, so a person on a keyboard reaches it.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

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

  it("carries a way to send it away by hand", () => {
    const html = markup(<ToastBar toast={{ text: "Saved." }} drop={() => {}} />);

    expect(html).toContain('aria-label="Dismiss"');
  });

  it("draws no form while it holds no act", () => {
    expect(markup(<ToastBar toast={{ text: "Saved." }} drop={() => {}} />)).not.toContain("<form");
  });
});
