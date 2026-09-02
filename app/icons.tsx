/**
 * The icons the app draws, inline.
 *
 * Two glyphs do not earn a package, a font and a build step, so each icon is
 * one `<svg>` holding one path. Every icon draws in `currentColor` and is
 * hidden from a screen reader: the control beside it carries the name.
 *
 * This file is the precedent for every icon after it. Add the path, not a
 * dependency.
 *
 * Paths: Font Awesome Free 6, regular style. CC BY 4.0
 * (https://fontawesome.com/license/free).
 */

/** The frame every icon shares: the box Font Awesome draws in, and its size. */
function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 448 512"
      aria-hidden="true"
      fill="currentColor"
      className="inline-block size-3.5 shrink-0"
    >
      <path d={path} />
    </svg>
  );
}

/** An empty box: the column this switch names is not drawn. */
export function Square() {
  return (
    <Icon path="M384 80c8.8 0 16 7.2 16 16l0 320c0 8.8-7.2 16-16 16L64 432c-8.8 0-16-7.2-16-16L48 96c0-8.8 7.2-16 16-16l320 0zM64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32z" />
  );
}

/** A ticked box: the column this switch names is drawn. */
export function SquareCheck() {
  return (
    <Icon path="M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zM337 209L209 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L303 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z" />
  );
}
