/**
 * The sweep of one finished column, drawn by both boards.
 *
 * The form carries the id and the org slug of every card the column draws, so
 * the sweep archives exactly what is on screen: whatever narrowed the column
 * is the whole rule, and the server adds nothing to it. Narrowing decides the
 * set and never the button: a finished column that holds a card carries the
 * sweep, narrowed or not.
 *
 * It sits in the column head, beside the name and the count, and a column
 * holding nothing draws none.
 *
 * The batch reports itself in a toast, which holds the one undo. See
 * ADR-0019.
 */

import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

import { sweptToast, type SweepResult, type Swept } from "./sweep";
import { useToast } from "./toast";

export function ColumnSweep({
  label,
  cards,
  undoAt,
  names,
}: {
  /** The column the button names. */
  label: string;
  /** Every card the column draws, each with the org that holds it. */
  cards: Swept[];
  /** Where the undo posts, because the toast is drawn above every route. */
  undoAt: string;
  /**
   * The name of each org, for the archive link the toast carries. The org
   * board hands none: it sweeps the org the person is standing in.
   */
  names?: Record<string, string>;
}) {
  const sweep = useFetcher<SweepResult>();
  const raise = useToast();
  const done = sweep.data ?? null;
  // The answer already reported. A fetcher holds its answer until it posts
  // again, and every load of the page hands this a fresh set of props, so
  // without this the message would come back on a load that swept nothing.
  const said = useRef<SweepResult | null>(null);

  useEffect(() => {
    if (sweep.state !== "idle" || !done || said.current === done) return;
    said.current = done;
    // A run that changed nothing and answered says nothing, unless it stopped
    // part way: then the silence would be the wrong answer.
    if (done.changed.length === 0 && !done.partial) return;
    raise(sweptToast({ label, undoAt, archived: done.changed, names, partial: done.partial }));
  }, [sweep.state, done, raise, label, undoAt, names]);

  if (cards.length === 0) return null;

  return (
    <sweep.Form method="post">
      <input type="hidden" name="intent" value="archive" />
      {/* One pair per card, in card order, which is how the server reads them. */}
      {cards.map((card) => (
        <span key={card.id}>
          <input type="hidden" name="id" value={card.id} />
          <input type="hidden" name="slug" value={card.slug} />
        </span>
      ))}
      <button
        aria-label={`Archive ${cards.length} from ${label}`}
        className="rounded border border-border px-2 py-0.5 text-xs"
      >
        Archive {cards.length}
      </button>
    </sweep.Form>
  );
}
