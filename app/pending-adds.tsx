/**
 * The tasks an add in flight will make, drawn where they will land before the
 * server has made them. See `app/pending.ts`.
 *
 * They are drawn apart from the cards: they carry no id yet, so no key, no
 * drag and no sweep can reach one. The dashed border and the faded title say
 * the row is on its way, and `aria-busy` says it to a screen reader.
 */
export function PendingAdds({ titles }: { titles: string[] }) {
  return titles.map((title, at) => (
    <li
      key={`${at}:${title}`}
      aria-busy="true"
      className="rounded border border-dashed border-border p-3 text-muted"
    >
      {title}
    </li>
  ));
}
