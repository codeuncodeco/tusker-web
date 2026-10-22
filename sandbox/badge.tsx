/**
 * The sandbox's one act that the app does not have: Reset sample data.
 *
 * It draws nothing of its own. It lends the act to the app's settings panel
 * through `window.tuskerExtras`, the one place a host can add a row to it, so
 * no app file names the sandbox and a UI change on `main` never meets it in a
 * merge.
 */

import { resetSampleData } from "./boot";

export function mountBadge() {
  window.tuskerExtras = [
    {
      label: "Reset sample data",
      run: () => {
        if (confirm("Throw away every change and start again from the sample data?")) resetSampleData();
      },
    },
  ];
}
