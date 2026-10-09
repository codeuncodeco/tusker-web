import { Form } from "react-router";

import { descriptionBlocks, type DescriptionBlock } from "./description";
import { tickedSent, usePost, useSent } from "./pending";

/**
 * A task description, read-only, with live checkboxes.
 *
 * The text arrives raw and is cut into blocks here, so the page carries the
 * markdown a person typed and nothing the server rendered for it. Every piece
 * of HTML on screen comes from `renderInline`: a fenced block draws as text,
 * and no value of the description reaches the page as markup by another route.
 *
 * This view only reads and ticks. The textarea that edits the text sits in
 * `description-box.tsx`, which draws this view when the box is shut.
 */
export function DescriptionView({ text }: { text: string }) {
  const blocks = descriptionBlocks(text);

  if (blocks.length === 0) {
    return <p className="text-muted">This task carries no description.</p>;
  }

  return (
    <div className="flex flex-col">
      {blocks.map((block, at) => (
        <Block key={at} block={block} />
      ))}
    </div>
  );
}

/** One block, drawn by its kind. */
function Block({ block }: { block: DescriptionBlock }) {
  if (block.kind === "code") {
    return (
      <pre className="my-1 overflow-x-auto rounded bg-surface p-2">
        <code>{block.text}</code>
      </pre>
    );
  }

  if (block.kind === "blank") return <div className="h-3" />;

  if (block.kind === "check") return <CheckLine block={block} />;

  return (
    <div
      style={nested(block.indent)}
      // Made by renderInline, out of text it escaped first.
      dangerouslySetInnerHTML={{ __html: block.html }}
    />
  );
}

/**
 * One live checkbox.
 *
 * The post names the box by its number, and the server flips that line of the
 * raw text: the number is what stops a tick from writing a stale copy of a
 * description over a newer one.
 *
 * Each tick posts on a fetcher of its own, and the box draws the ticks still in
 * flight over what the loader said. A checkbox that snaps back for half a
 * second reads as one that did not work, and a second tick must not drop the
 * first. See `app/pending.ts`.
 */
function CheckLine({ block }: { block: Extract<DescriptionBlock, { kind: "check" }> }) {
  const post = usePost();
  const checked = tickedSent(block.checked, block.box, useSent());

  return (
    <Form method="post" navigate={false} style={nested(block.indent)}>
      <input type="hidden" name="intent" value="tick" />
      <input type="hidden" name="box" value={block.box} />
      <label className="flex items-baseline gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => post({ intent: "tick", box: String(block.box) })}
        />
        <span
          className={checked ? "text-muted line-through" : ""}
          // Made by renderInline, out of text it escaped first.
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      </label>
      {/* The submit the box needs when no script runs. */}
      <button className="sr-only">Tick</button>
    </Form>
  );
}

/** How far one nested line sits from the left, in the text's own size. */
function nested(indent: number) {
  return indent ? { marginLeft: `${indent * 1.5}em` } : undefined;
}
