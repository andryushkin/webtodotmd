/**
 * Several converted fragments as one document — a Cmd-drag selection of two
 * paragraphs, or every element highlighter mode collected.
 *
 * Each fragment has already been through the converter's `normalize()`, which
 * ends it with exactly one `\n` and no blank line at either edge. Joining them
 * with `'\n\n'` therefore wrote *three* newlines between one fragment and the
 * next: a blank line more than a block boundary is, and one that `normalize()`
 * would have collapsed had it been able to run again — it cannot, because the
 * join happens after every conversion has finished. The document renders the
 * same and reads as an accident in the Source pane, which is the half of the
 * product a person edits by hand.
 *
 * A fragment that converted to nothing contributes nothing, rather than another
 * gap. A range that fell on whitespace, or a highlighted element the sanitizer
 * emptied, would otherwise push its neighbours further apart than the fragments
 * that carry text.
 */
export function joinFragments(fragments: string[]): string {
  const kept = fragments.map((fragment) => fragment.trim()).filter((fragment) => fragment !== '');
  return kept.length === 0 ? '' : `${kept.join('\n\n')}\n`;
}
