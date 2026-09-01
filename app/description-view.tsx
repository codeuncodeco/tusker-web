import { useFetcher } from "react-router";

import { descriptionBlocks, type DescriptionBlock } from "./description";

/**
 * A task description, read-only, with live checkboxes.
 *
 * The text arrives raw and is cut into blocks here, so the page carries the
 * markdown a person typed and nothing the server rendered for it. Every piece
 * of HTML on screen comes from `renderInline`: a fenced block draws as text,
 * and no value of the description reaches the page as markup by another route.
 *
 * The textarea that edits the text is a separate ticket. This view only ticks.
 */
export function DescriptionView({ text }: { text: string }) {
  const blocks = descriptionBlocks(text);

  if (blocks.length === 0) {
    return <p className="text-sm text-neutral-500">This task carries no description.</p>;
  }

  return (
    <div className="flex flex-col text-sm">
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
      <pre className="my-1 overflow-x-auto rounded bg-neutral-100 p-2 dark:bg-neutral-800">
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
 * raw text. While the post is in flight the box draws the state it is going to
 * hold, because a checkbox that snaps back for half a second reads as one that
 * did not work.
 */
function CheckLine({ block }: { block: Extract<DescriptionBlock, { kind: "check" }> }) {
  const tick = useFetcher();
  const checked = tick.state === "idle" ? block.checked : !block.checked;

  return (
    <tick.Form method="post" style={nested(block.indent)}>
      <input type="hidden" name="intent" value="tick" />
      <input type="hidden" name="box" value={block.box} />
      <label className="flex items-baseline gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => tick.submit(event.currentTarget.form)}
        />
        <span
          className={checked ? "text-neutral-500 line-through" : ""}
          // Made by renderInline, out of text it escaped first.
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      </label>
      {/* The submit the box needs when no script runs. */}
      <button className="sr-only">Tick</button>
    </tick.Form>
  );
}

/** How far one nested line sits from the left. */
function nested(indent: number) {
  return indent ? { marginLeft: `${indent * 1.5}rem` } : undefined;
}
