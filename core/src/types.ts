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
  baseUrl?: string;
  math?: boolean;
  footnotes?: boolean;
  complexTableFallback?: 'html' | 'text' | 'skip';
  rules?: Rule[];
  domAdapter?: DOMAdapterFn;
  headingOffset?: number; // Phase 8: сдвиг уровней заголовков для selectionToMarkdown
}
