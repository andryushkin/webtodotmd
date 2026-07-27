/**
 * The semantic containers whose whole conversion is their content between blank
 * lines.
 *
 * One set, read by the parser and by the rule that writes them, because they had
 * been two and the two disagreed: the escaper already counted a `<figure>` and a
 * `<form>` as the end of a line, while nothing wrote a boundary there — the
 * default rule hands its children straight back. So the reading model said the
 * line ended and the writing model welded it to the next one, and the file
 * carried `![Architecture diagram](d.png)Services and message flow.` where the
 * reader saw a picture and a caption under it, `SectionArticleFormLegendField`
 * where they saw five lines, and a `<summary>` run into the body it opens.
 *
 * What qualifies is exactly what the `<div>` rule qualifies on: the element draws
 * a line of its own and Markdown has no other spelling for it, so its content
 * between blank lines is the closest the file can come. A `<table>`, a `<pre>` and
 * a `<li>` are absent for the opposite reason — each writes syntax of its own, and
 * a rule that returned their content would throw it away.
 *
 * `<div>`, `<p>` and the definition list keep rules of their own: each carries a
 * reason this set does not, and merging them would file those reasons under a name
 * that does not mention them.
 */
export const SEMANTIC_BLOCKS: ReadonlySet<string> = new Set([
  'section', 'article', 'aside', 'nav', 'header', 'footer', 'hgroup', 'main',
  'figure', 'figcaption', 'address', 'details', 'summary', 'fieldset', 'legend',
  'form',
]);
