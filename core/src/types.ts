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
  rules?: Rule[];
  domAdapter?: DOMAdapterFn;
  headingOffset?: number; // Phase 8: сдвиг уровней заголовков для selectionToMarkdown
}
