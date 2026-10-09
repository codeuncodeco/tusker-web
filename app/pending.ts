/**
 * What a page draws while its posts are in flight: the loader's answer, with
 * every post the server has not answered yet laid over it.
 *
 * A move, a step, an archive, a pick and an add show the moment they are
 * posted, and a slow connection no longer reads as a page that did nothing.
 * The posts are the fetchers React Router already holds, read through
 * `useFetchers()`: there is no store of our own. A fetcher goes idle once the
 * loaders have answered with its write in them, so the guess goes away the
 * moment the server's copy lands, and the server's copy is what stands. A post
 * the server refuses goes the same way, and the page draws what the server
 * holds. See ADR-0004.
 *
 * The posts are laid over in the order they were sent, so a held `J` walks the
 * card as far as the presses go. The functions here are pure, so a test can
 * ask what a page draws without a page to draw it on. See #168.
 */

import { useCallback } from "react";
import { isRouteErrorResponse, useFetchers, useLocation, useSubmit } from "react-router";

import type { Status } from "./board";
import { isFinished } from "./board";
import { isStep, moveInPlan } from "./plan";
import { titlesIn } from "./titles";
import { raiseOutside } from "./toast";
import type { LiveTask } from "./unified";

/**
 * The fields of every post this page has in flight, oldest first.
 *
 * A post to another page is that page's business, so only the posts to this
 * address are read. The query string is left out of the match, because a
 * narrowed board posts to itself with its search on.
 */
export function useSent(): FormData[] {
  const fetchers = useFetchers();
  const { pathname } = useLocation();

  return fetchers.flatMap((fetcher) =>
    fetcher.state !== "idle" &&
    fetcher.formData &&
    fetcher.formAction?.split("?")[0] === pathname
      ? [fetcher.formData]
      : [],
  );
}

/**
 * Posts one set of fields to this page, on a fetcher of its own.
 *
 * A key posts this way rather than through one shared fetcher: a fetcher that
 * posts again drops the post it had in flight, and then a held `J` would draw
 * one step while the server took several. With a fetcher per press, every
 * press is in flight and every press is drawn.
 */
export function usePost(): (fields: Record<string, string>) => void {
  const submit = useSubmit();
  return useCallback(
    (fields) => void submit(fields, { method: "post", navigate: false }),
    [submit],
  );
}

/** One column of a board, as a page draws it. */
type BoardColumn<C> = { status: Status; tasks: C[] };

/**
 * The org board with the posts in flight laid over it: a moved card in its new
 * column, a stepped card one place along, and an archived card gone.
 *
 * A move lands above the card the drop named, or at the bottom where it named
 * none, which is where the server puts it. A move to a column the board does
 * not draw takes the card off the board. A step that would leave the column
 * stays where it is, as the server's does.
 */
export function boardSent<C extends { id: string }, K extends BoardColumn<C>>(
  columns: K[],
  sent: FormData[],
): K[] {
  return sent.reduce((drawn, form) => {
    const intent = String(form.get("intent") ?? "");
    const id = String(form.get("id") ?? "");

    if (intent === "archive") {
      const gone = new Set(form.getAll("id").map(String));
      return drawn.map((column) => ({
        ...column,
        tasks: column.tasks.filter((card) => !gone.has(card.id)),
      }));
    }

    if (intent === "move") {
      const card = drawn.flatMap((column) => column.tasks).find((one) => one.id === id);
      if (!card) return drawn;
      const status = String(form.get("status") ?? "");
      const before = String(form.get("before") ?? "");
      return drawn.map((column) => {
        const rest = column.tasks.filter((one) => one.id !== id);
        if (column.status !== status) return { ...column, tasks: rest };
        const at = rest.findIndex((one) => one.id === before);
        return {
          ...column,
          tasks: at === -1 ? [...rest, card] : [...rest.slice(0, at), card, ...rest.slice(at)],
        };
      });
    }

    if (intent === "up" || intent === "down") {
      return drawn.map((column) => {
        const order = column.tasks.map((card) => card.id);
        if (!order.includes(id)) return column;
        const moved = moveInPlan(order, id, intent);
        return { ...column, tasks: moved.map((one) => column.tasks.find((card) => card.id === one)!) };
      });
    }

    return drawn;
  }, columns);
}

/**
 * The tasks a cross-org page draws and the order it owns, with the posts in
 * flight laid over them: a moved or finished task in its new column, an
 * archived one gone, and a pick, an unpick or a step in the picked order.
 *
 * A move lands at the bottom of its column in its own org, so it draws with
 * the last percentile. A pick lands at the foot of a plan and on top of a week
 * set, so the page says which. See ADR-0021.
 */
export function tasksSent(
  tasks: LiveTask[],
  picked: string[],
  sent: FormData[],
  pickAt: "top" | "bottom" = "bottom",
): { tasks: LiveTask[]; picked: string[] } {
  return sent.reduce(
    (drawn, form) => {
      const intent = String(form.get("intent") ?? "");
      const id = String(form.get("id") ?? "");

      if (intent === "move" || intent === "finish") {
        const status = (intent === "finish" ? "done" : String(form.get("status") ?? "")) as Status;
        return {
          ...drawn,
          tasks: drawn.tasks.map((one) =>
            one.id === id ? { ...one, status, finished: isFinished(status), percentile: 1 } : one,
          ),
        };
      }

      if (intent === "archive") {
        const gone = new Set(form.getAll("id").map(String));
        return { ...drawn, tasks: drawn.tasks.filter((one) => !gone.has(one.id)) };
      }

      if (intent === "plan" && !drawn.picked.includes(id)) {
        return {
          ...drawn,
          picked: pickAt === "top" ? [id, ...drawn.picked] : [...drawn.picked, id],
        };
      }

      if (intent === "unplan") {
        return { ...drawn, picked: drawn.picked.filter((one) => one !== id) };
      }

      if (isStep(intent)) return { ...drawn, picked: moveInPlan(drawn.picked, id, intent) };

      return drawn;
    },
    { tasks, picked },
  );
}

/**
 * The titles the adds in flight will make, one per line as the server splits
 * them. A box on a board names its column, and draws only the adds posted to
 * it; a page with one box names none.
 */
export function addsSent(sent: FormData[], status?: Status): string[] {
  return sent.flatMap((form) => {
    if (form.get("intent") !== "create") return [];
    if (status !== undefined && form.get("status") !== status) return [];
    return titlesIn(String(form.get("title") ?? ""));
  });
}

/**
 * What a person reads when a post did not land: the reason the server gave,
 * or that the server was out of reach.
 */
export function failureText(error: unknown): string {
  if (isRouteErrorResponse(error) && typeof error.data === "string" && error.data !== "") {
    return `Not saved. ${error.data}`;
  }
  if (error instanceof TypeError) return "Not saved. Tusker could not reach the server.";
  return "Not saved. Something went wrong on the server.";
}

/** What a post that did not land answers its fetcher with. */
export type Failed = { failed: string };

/**
 * The client action every page with drawn-ahead posts takes. It runs the
 * server's action, and a post the server refuses, or never receives, answers
 * with a toast rather than with the error page: the loaders run again either
 * way, so the guess goes and the page draws what the server holds.
 *
 * A redirect is the server's answer and not a failure, so it goes through:
 * the decision prompt rides on one.
 */
export async function postAndReport<T>({
  serverAction,
}: {
  serverAction: () => Promise<T>;
}): Promise<T | Failed> {
  try {
    return await serverAction();
  } catch (error) {
    if (error instanceof Response) throw error;
    const text = failureText(error);
    raiseOutside({ text });
    return { failed: text };
  }
}
