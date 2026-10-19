/**
 * A burst of sparks and a "+1" where a task was finished: the small reward a
 * game gives for a thing done.
 *
 * It is drawn straight into `<body>`, fixed where the press was, and not
 * inside the card: the card leaves for Done the moment it is finished, and a
 * burst inside it would go with it. It cleans itself up, takes no pointer,
 * and is hidden from a screen reader, which hears the card move instead.
 * A person who asked for less motion gets none of it.
 */

/** How many sparks one burst throws. */
const SPARKS = 12;

/** How long a burst lives, in ms: the longest animation in it, and a little. */
const LIFE = 950;

/** Throws one burst, centred on a point of the window, in a colour. */
export function celebrate(x: number, y: number, color = "var(--color-win)"): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;z-index:60;`;

  for (let at = 0; at < SPARKS; at++) {
    const angle = (at / SPARKS) * Math.PI * 2 + Math.random() * 0.4;
    const reach = 22 + Math.random() * 18;
    const spark = document.createElement("span");
    const size = at % 3 === 0 ? 7 : 5;
    spark.style.cssText = [
      "position:absolute",
      "left:0",
      "top:0",
      `width:${size}px`,
      `height:${size}px`,
      `border-radius:${at % 2 ? "9999px" : "2px"}`,
      `background:${at % 4 === 0 ? "var(--color-accent)" : color}`,
      `--dx:${Math.cos(angle) * reach}px`,
      `--dy:${Math.sin(angle) * reach}px`,
      `animation:var(--animate-burst)`,
      `animation-delay:${Math.random() * 40}ms`,
    ].join(";");
    host.appendChild(spark);
  }

  const plus = document.createElement("span");
  plus.textContent = "+1";
  plus.style.cssText = [
    "position:absolute",
    "left:0",
    "top:-10px",
    "font:600 12px var(--font-mono)",
    `color:${color}`,
    "white-space:nowrap",
    "animation:var(--animate-float-up)",
  ].join(";");
  host.appendChild(plus);

  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), LIFE);
}

/** Throws a burst from the centre of an element. */
export function celebrateAt(element: Element, color?: string): void {
  const box = element.getBoundingClientRect();
  celebrate(box.left + box.width / 2, box.top + box.height / 2, color);
}
