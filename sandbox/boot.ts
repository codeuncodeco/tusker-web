/**
 * Starts the sandbox in the browser, before the app hydrates: opens the
 * database, keeps the app off the network, and hands back the `Env` the
 * loaders and actions read in place of the Worker's bindings.
 */

import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";

import { keepResponseCookies } from "./cookie-jar";
import { openDatabase, type Store } from "./database";
import { guardFetch } from "./fetch-guard";

/** Where the browser keeps the database between visits. */
const KEY = "tusker:sandbox:database";

/** True once a reset is under way, so a save in flight does not write the old data back. */
let resetting = false;

const store: Store = {
  load: () => localStorage.getItem(KEY),
  save(text) {
    if (resetting) return;
    try {
      localStorage.setItem(KEY, text);
    } catch (failure) {
      console.error("sandbox: the browser refused to save the database", failure);
    }
  },
  clear: () => localStorage.removeItem(KEY),
};

export async function boot(): Promise<Env> {
  keepResponseCookies();
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const { db, flush } = await openDatabase(SQL, store);
  addEventListener("pagehide", flush);
  globalThis.fetch = guardFetch(db, location.origin, fetch.bind(globalThis));

  // No Resend key, so the mailer writes every mail to the console.
  return { DB: db, BETTER_AUTH_SECRET: "sandbox", MAIL_FROM: "Tusker <tusker@sandbox.invalid>" } as Env;
}

/** Wipes the browser database. The reload builds it again from the seed. */
export function resetSampleData() {
  resetting = true;
  store.clear();
  location.reload();
}
