export type DOMAdapterFn = (html: string) => Document;

export interface Rule {
  name: string;
  filter: string | string[] | ((el: Element) => boolean);
  replacement: (el: Element, childContent: string, options: MarkItDownOptions) => string;
  /**
   * Set when `replacement` never reads `childContent`, so the converter can skip
   * building it. The table rule renders from the rows itself; without this the
   * whole subtree — every row, cell, list and code block — was converted once
   * and thrown away before the rule ran, and again per cell afterwards.
   */
  ignoresChildContent?: boolean;
}

export interface MarkItDownOptions {
  /**
   * Internal. The language the output is being written in. Inside a cell of the
   * HTML table fallback it is `'html'`, because an HTML block is not parsed as
   * Markdown: escaping Markdown syntax there protects nothing and shows the
   * reader backslashes, and emitting `**bold**` shows them asterisks. Rules that
   * have both spellings pick by this.
   *
   * Replaces the older `escapeSyntax: false`, which said only half of it — the
   * escaping stopped, but the emphasis, code and link rules went on writing
   * Markdown into markup that would never parse it.
   */
  outputContext?: 'markdown' | 'html';
  /** @deprecated Use `outputContext: 'html'`. Kept so existing callers still work. */
  escapeSyntax?: boolean;
  baseUrl?: string;
  math?: boolean;
  footnotes?: boolean;
  /**
   * What to do with a table GFM cannot express — merged cells, a nested table, a
   * cell holding preformatted text.
   *
   * `'flatten'` (the default) keeps the pipe form: merged cells are expanded onto
   * a grid, a nested table and preformatted text are folded into their cell with
   * `<br>` breaks. Nothing is lost that a reader can see, but the *fact* of a
   * merge is: `| 120 |  |` reads the same as a genuinely empty neighbour.
   *
   * `'html'` emits an HTML table instead, which keeps the structure exactly — at
   * the price that Markdown is not parsed inside an HTML block, so every cell
   * stops being Markdown, and renderers that strip HTML show nothing at all.
   */
  complexTableFallback?: 'flatten' | 'html' | 'text' | 'skip';
  /**
   * Whether the input is a whole page or a piece of one a person picked out.
   * Spelled the way `sanitize()` spells it, so there is one vocabulary for the
   * distinction rather than two that can drift.
   *
   * `'full'` (the default) treats the input as a document that arrived unasked —
   * a fetched page, a whole `<body>` — so `<nav>`, `<header>`, `<footer>` and
   * `<aside>` go, with their contents: furniture nobody wanted in a note.
   *
   * `'selection'` keeps them, because they were pointed at. Someone who dragged
   * across a navigation block meant to take it, and a selection that ran through
   * an `<aside>` on its way down the article saw that text as part of what it
   * was taking. Removing it there deletes a paragraph the reader cannot see is
   * missing — the expensive direction. The cost of keeping is the other way and
   * it is cheap: hand a whole page to `'selection'` and the menus come along.
   */
  mode?: 'full' | 'selection';
  rules?: Rule[];
  domAdapter?: DOMAdapterFn;
  /**
   * Shift every heading by this many levels, clamped to 1…6.
   *
   * For a caller that knows what it is handing over. A capture does not: use
   * `topHeadingLevel` instead, and this becomes the answer it works out.
   */
  headingOffset?: number;
  /**
   * Put the shallowest heading of the input at this level, moving the rest by
   * the same amount.
   *
   * A page is not a document: an article's own title is an `<h1>` the capture
   * usually did not include, and a chat interface writes its whole answer under
   * `<h3>`. Shifting by a constant — what the extension did — turned that answer
   * into a file whose first heading is `####`, with no `#`, `##` or `###` above
   * it anywhere. What matters is the hierarchy the reader saw, which is the
   * distance between the levels and not the levels themselves.
   *
   * `headingOffset` wins where both are given: it is the caller stating the
   * answer rather than asking for one.
   */
  topHeadingLevel?: number;
}
