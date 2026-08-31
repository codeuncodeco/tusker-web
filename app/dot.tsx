import { colorCss } from "./colors";

/**
 * The mark one option colour draws: a filled dot beside the value it belongs
 * to. The label stays, so the dot adds a colour and carries no meaning of its
 * own, and a screen reader reads the value alone.
 */
export function Dot({ color }: { color: string | null }) {
  if (!color) return null;
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: colorCss(color) }}
      className="inline-block size-2 shrink-0 rounded-full"
    />
  );
}
