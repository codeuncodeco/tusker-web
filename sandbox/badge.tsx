/**
 * The one piece of sandbox chrome: a small tag in the corner that says what
 * this is, and holds "Reset sample data".
 *
 * It mounts in its own root, outside the app's tree, so no app file draws it
 * and a UI change on `main` never meets it in a merge.
 */

import { useState } from "react";
import { createRoot } from "react-dom/client";

import { resetSampleData } from "./boot";

export function mountBadge() {
  const host = document.createElement("div");
  host.id = "tusker-sandbox";
  document.body.appendChild(host);
  createRoot(host).render(<Badge />);
}

function Badge() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded border border-border bg-surface px-2 py-1 text-xs text-muted shadow-sm print:hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="font-mono uppercase tracking-wide">
        Sandbox
      </button>
      {open ? (
        <>
          <span>Your data lives in this browser only.</span>
          <button
            type="button"
            className="underline"
            onClick={() => {
              if (confirm("Throw away every change and start again from the sample data?")) resetSampleData();
            }}
          >
            Reset sample data
          </button>
        </>
      ) : null}
    </div>
  );
}
